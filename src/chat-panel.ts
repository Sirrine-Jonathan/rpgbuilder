import * as vscode from 'vscode';
import { RPGRagService } from './rag-client';
import { SpriteGenerator } from './sprite-generator';
import { OllamaService } from './ollama-service';
import { GeminiService } from './gemini-service';
import { AIService, AIMessage } from './ai-service';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export class RPGChatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'rpgbuilder.chatView';
  private _view?: vscode.WebviewView;
  private _spriteGen = new SpriteGenerator();
  private _ollama = new OllamaService();
  private _gemini = new GeminiService();
  private _history: AIMessage[] = [];

  constructor(private readonly _extensionUri: vscode.Uri, private readonly _ragService: RPGRagService) {}

  public resolveWebviewView(webviewView: vscode.WebviewView, _context: vscode.WebviewViewResolveContext, _token: vscode.CancellationToken) {
    this._view = webviewView;
    webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.webview.onDidReceiveMessage(async (data) => {
      switch (data.type) {
        case 'ready':
            if (this._history.length > 0) {
                webviewView.webview.postMessage({ type: 'restoreHistory', messages: this._history });
            }
            break;
        case 'askQuestion': await this._handleAskQuestion(data.value); break;
        case 'getSettings': await this._sendSettings(); break;
        case 'updateSetting': await vscode.workspace.getConfiguration('rpgbuilder').update(data.key, data.value, true); if (data.key === 'provider') await this._sendSettings(); break;
        case 'pullModel': await this._handlePullModel(data.model); break;
        case 'clearChat': this._history = []; this._view?.webview.postMessage({ type: 'clear' }); break;
        case 'reindex':
            vscode.commands.executeCommand('rpgbuilder.indexSource');
            break;
      }
    });
  }

  private async _sendSettings() {
    const config = vscode.workspace.getConfiguration('rpgbuilder');
    this._view?.webview.postMessage({
        type: 'settings',
        provider: config.get('provider') || 'Ollama',
        ollamaModel: config.get('ollamaModel'),
        geminiModel: config.get('geminiModel'),
        geminiApiKey: config.get('geminiApiKey') || '',
        allowUnsafeExecution: config.get('allowUnsafeExecution') || false,
        availableOllamaModels: await this._ollama.getAvailableModels(),
        availableGeminiModels: await this._gemini.getAvailableModels()
    });
  }

  private async _handlePullModel(model: string) {
      try {
          await this._ollama.pullModel(model, (msg) => this._updateStatus(msg));
          this._updateStatus('Model pulled successfully!');
          await this._sendSettings();
      } catch (err: any) { vscode.window.showErrorMessage(`Pull failed: ${err.message}`); }
  }

  private _updateStatus(text: string) {
    this._view?.webview.postMessage({ type: 'updateStatus', text });
  }

  private async _handleAskQuestion(text: string) {
    const config = vscode.workspace.getConfiguration('rpgbuilder');
    const service: AIService = (config.get('provider') === 'Gemini') ? this._gemini : this._ollama;

    this._addMessage('user', text);
    let loopCount = 0;
    const maxLoops = 15;

    while (loopCount < maxLoops) {
        loopCount++;
        this._updateStatus(`Reasoning Step ${loopCount}...`);
        if (this._view) this._view.webview.postMessage({ type: 'startThinking' });

        try {
            this._updateStatus(`Searching Docs...`);
            const augmentedPrompt = await this._ragService.augmentPrompt(text);
            this._addMessage('system', `RAG Search Context Injected.`, `🔍 RAG Search Context Injected`);

            const systemPrompt = `You are an AUTONOMOUS SENIOR PHASER 3 DEVELOPER. 
            CORE DIRECTIVE: Build a web-based RPG using Phaser 3 and HTML5.
            RULES:
            1. OBSERVE: Use 'list_files' to check structure.
            2. BOOTSTRAP: Create index.html (Phaser CDN) and game.js.
            3. ACT: Use 'write_file', 'generate_sprite', and 'generate_image' proactively. 
            4. PREVIEW: Use 'serve_project' when ready.
            5. NO TALK: Call tools immediately. Do not explain steps.`;

            const messages: AIMessage[] = [
                { role: 'system', content: systemPrompt },
                ...this._history.slice(-20) 
            ];

            const response = await service.chat(messages, {
                tools: [
                    { type: 'function', function: { name: 'generate_sprite', description: 'Generates SVG asset (Free/Local).', parameters: { type: 'object', properties: { prompt: {type:'string'}, filename: {type:'string'} }, required: ['prompt','filename'] } } },
                    { type: 'function', function: { name: 'generate_image', description: 'Generates PNG asset (Free/Web).', parameters: { type: 'object', properties: { prompt: {type:'string'}, filename: {type:'string'} }, required: ['prompt','filename'] } } },
                    { type: 'function', function: { name: 'write_file', description: 'Writes code files.', parameters: { type: 'object', properties: { path: {type:'string'}, content: {type:'string'} }, required: ['path','content'] } } },
                    { type: 'function', function: { name: 'list_files', description: 'Lists files.', parameters: { type: 'object', properties: { path: {type:'string'} }, required: ['path'] } } },
                    { type: 'function', function: { name: 'serve_project', description: 'Launches preview server.', parameters: { type: 'object', properties: {} } } }
                ]
            });

            if (this._view) this._view.webview.postMessage({ type: 'stopThinking' });

            let actionTaken = false;
            let toolResults = [];

            if (response.toolCalls) {
                for (const tc of response.toolCalls) {
                    this._addMessage('assistant', `Calling tool: ${tc.name}`, `🛠️ Calling tool: ${tc.name}`);
                    const result = await this._handleGenericToolCall(tc.name, tc.args, service);
                    this._addMessage('system', `Tool ${tc.name} result: ${result}`, `⚙️ Tool ${tc.name} result: ${result}`);
                    toolResults.push(`Tool ${tc.name} execution result: ${result}`);
                    actionTaken = true;
                }
            }

            if (response.content) {
                const isJsonOnly = response.content.trim().startsWith('[') || response.content.trim().startsWith('{');
                if (!isJsonOnly) this._addMessage('assistant', response.content);
                const sniffedResults = await this._deepSniff(response.content, service);
                if (sniffedResults.length > 0) {
                    toolResults.push(...sniffedResults);
                    actionTaken = true;
                }
            }

            if (actionTaken) {
                this._history.push({ role: 'user', content: `ENVIRONMENT FEEDBACK:\n${toolResults.join('\n')}\n\nPlease proceed with the next logical step of the implementation.` });
                continue; 
            } else {
                break; // Finished
            }

        } catch (err: any) {
            if (this._view) this._view.webview.postMessage({ type: 'stopThinking' });
            this._addMessage('assistant', `❌ Error: ${err.message}`);
            break;
        }
    }
    this._updateStatus('Ready');
  }

  private _addMessage(role: string, content: string, displayText?: string) {
      this._history.push({ role: role as any, content });
      if (this._view) {
          this._view.webview.postMessage({ type: 'addMessage', role, text: displayText || content });
      }
  }

  private async _deepSniff(content: string, service: AIService): Promise<string[]> {
      const results: string[] = [];
      const jsonRegex = /(\{|\[)[\s\S]*(\}|\])/g;
      let m;
      while ((m = jsonRegex.exec(content)) !== null) {
          try {
            const p = JSON.parse(m[0]);
            const items = Array.isArray(p) ? p : [p];
            for (const item of items) {
                if (!item) continue;
                const name = item.name || item.tool_name || (item.tool_code && item.tool_code.tool_name ? item.tool_code.tool_name.split('.').pop() : undefined);
                const args = item.arguments || item.parameters || (item.tool_code ? item.tool_code.parameters : undefined) || item;
                if (name && args) {
                    this._addMessage('assistant', `Sniffed tool call: ${name}`, `🔍 Sniffed tool call: ${name}`);
                    const res = await this._handleGenericToolCall(name, args, service);
                    this._addMessage('system', `Sniffed tool ${name} result: ${res}`, `⚙️ Sniffed tool ${name} result: ${res}`);
                    results.push(`Sniffed tool ${name} result: ${res}`);
                }
            }
          } catch (e) {}
      }
      return results;
  }

  private async _handleGenericToolCall(name: string, args: any, service: AIService): Promise<string> {
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!folder) return "No workspace";
      try {
          if (name === 'generate_sprite') {
              this._updateStatus('🎨 SVG Sprite...');
              const outPath = await this._spriteGen.generateSVG(args.prompt, args.filename, folder.uri.fsPath, service);
              return `Created SVG asset: assets/${path.basename(outPath)}`;
          } 
          else if (name === 'generate_image') {
              this._updateStatus('✨ PNG Image...');
              const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(args.prompt + " 2d game asset") }?width=512&height=512&nologo=true`;
              const img = await fetch(url);
              const buf = await img.arrayBuffer();
              const base = path.basename(args.filename).replace('.png','').replace('.svg','');
              const out = path.join(folder.uri.fsPath, 'assets', `${base}.png`);
              if (!fs.existsSync(path.dirname(out))) fs.mkdirSync(path.dirname(out), { recursive: true });
              await vscode.workspace.fs.writeFile(vscode.Uri.file(out), new Uint8Array(buf));
              return `Created PNG asset: assets/${base}.png`;
          }
          else if (name === 'write_file') {
              const uri = vscode.Uri.joinPath(folder.uri, args.path);
              await vscode.workspace.fs.createDirectory(vscode.Uri.joinPath(folder.uri, path.dirname(args.path)));
              await vscode.workspace.fs.writeFile(uri, Buffer.from(args.content, 'utf8'));
              return `Saved: ${args.path}`;
          }
          else if (name === 'read_file') {
              const uri = vscode.Uri.joinPath(folder.uri, args.path);
              const data = await vscode.workspace.fs.readFile(uri);
              return Buffer.from(data).toString('utf8');
          }
          else if (name === 'list_files') {
              const uri = vscode.Uri.joinPath(folder.uri, args.path || '.');
              const list = await vscode.workspace.fs.readDirectory(uri);
              return list.map(([n, t]) => (t === vscode.FileType.Directory ? `[DIR] ${n}` : n)).join(', ');
          }
          else if (name === 'serve_project') {
              exec('npx serve .', { cwd: folder.uri.fsPath });
              return `Preview server started (check your browser at http://localhost:3000)`;
          }
          return "Tool unknown";
      } catch (e: any) {
          return `❌ Error in ${name}: ${e.message}`;
      }
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <style>
          body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0; margin: 0; display: flex; flex-direction: column; height: 100vh; background: var(--vscode-sideBar-background); overflow: hidden; }
          #chat { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 8px; scroll-behavior: smooth; }
          #settings-page { flex: 1; overflow-y: auto; padding: 10px; display: flex; flex-direction: column; gap: 12px; }
          .message { padding: 8px 12px; border-radius: 6px; max-width: 90%; font-size: 12px; white-space: pre-wrap; line-height: 1.4; word-wrap: break-word; position: relative; }
          pre { overflow: visible; white-space: pre-wrap; background: rgba(0,0,0,0.2); padding: 5px; border-radius: 4px; margin: 5px 0; }
          .user { background: var(--vscode-button-background); color: var(--vscode-button-foreground); align-self: flex-end; border-bottom-right-radius: 2px; }
          .assistant { background: var(--vscode-editor-background); border: 1px solid var(--vscode-panel-border); align-self: flex-start; border-bottom-left-radius: 2px; }
          .system { background: rgba(255,255,255,0.05); border: 1px dashed var(--vscode-panel-border); align-self: center; font-style: italic; font-size: 11px; opacity: 0.8; max-width: 95%; }
          #header { display: flex; justify-content: space-between; align-items: center; padding: 5px 10px; border-bottom: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); flex-shrink: 0; }
          #status-bar { font-size: 10px; padding: 4px 10px; color: var(--vscode-descriptionForeground); border-top: 1px solid var(--vscode-panel-border); background: var(--vscode-editor-background); flex-shrink: 0; }
          #input-container { padding: 10px; display: flex; flex-direction: column; gap: 5px; flex-shrink: 0; border-top: 1px solid var(--vscode-panel-border); }
          textarea { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 8px; border-radius: 4px; resize: none; height: 60px; font-family: inherit; font-size: inherit; outline: none; }
          .hidden { display: none !important; }
          button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 5px 10px; cursor: pointer; border-radius: 4px; font-size: 11px; }
          .thinking { font-style: italic; opacity: 0.7; font-size: 11px; margin-bottom: 10px; align-self: flex-start; }
          
          /* Settings UI Improvements */
          .settings-group { display: flex; flex-direction: column; gap: 10px; padding: 5px 0; }
          .settings-row { display: flex; align-items: center; gap: 10px; }
          .settings-row input[type="checkbox"] { width: auto; margin: 0; }
          label { font-size: 10px; font-weight: bold; opacity: 0.8; text-transform: uppercase; }
          select, input[type="password"], input[type="text"] { width: 100%; box-sizing: border-box; }
        </style>
      </head>
      <body>
        <div id="header"><span style="font-size: 10px; font-weight: bold;">RPG BUILDER</span><div style="display:flex; gap: 5px;"><button id="copy-btn">Copy</button><button id="clear-btn">Clear</button><button id="toggle-settings">Settings</button></div></div>
        <div id="chat"></div>
        <div id="settings-page" class="hidden">
            <div class="settings-group">
                <label>AI Provider</label>
                <select id="provider-select"><option value="Ollama">Ollama</option><option value="Gemini">Gemini</option></select>
            </div>
            <div id="ollama-settings" class="settings-group">
                <label>Ollama Model</label>
                <select id="ollama-select"></select>
            </div>
            <div id="gemini-settings" class="settings-group hidden">
                <label>Gemini Model</label>
                <select id="gemini-select"></select>
                <label>API Key</label>
                <input type="password" id="gemini-key" placeholder="Enter API Key" />
            </div>
            <div class="settings-group">
                <div class="settings-row">
                    <input type="checkbox" id="unsafe-exec" />
                    <label for="unsafe-exec" style="text-transform: none; font-weight: normal;">Allow Unsafe Command Execution</label>
                </div>
            </div>
            <button id="index-btn" style="width: 100%; margin-top: 5px; background: var(--vscode-button-secondaryBackground);">Retrigger Engine Indexing</button>
            <button id="save-settings" style="width: 100%; margin-top: 10px; padding: 8px;">Save Settings</button>
        </div>
        <div id="status-bar">Status: Ready</div>
        <div id="input-container"><textarea id="prompt" placeholder="Ask RPG Builder... (Shift+Enter for new line)"></textarea></div>
        <script>
          const vscode = acquireVsCodeApi();
          const chat = document.getElementById('chat');
          const prompt = document.getElementById('prompt');
          const settings = document.getElementById('settings-page');
          const toggle = document.getElementById('toggle-settings');
          const clear = document.getElementById('clear-btn');
          const copy = document.getElementById('copy-btn');
          const indexBtn = document.getElementById('index-btn');
          let isS = false;
          let thinkingDiv = null;

          function addMessage(role, text) {
              const div = document.createElement('div');
              div.className = 'message ' + role;
              div.innerText = text;
              chat.appendChild(div);
              chat.scrollTop = chat.scrollHeight;
          }

          indexBtn.onclick = () => {
              vscode.postMessage({ type: 'reindex' });
          };

          copy.onclick = () => {
              const text = Array.from(document.querySelectorAll('.message')).map(m => {
                  let role = 'AI';
                  if (m.classList.contains('user')) role = 'USER';
                  if (m.classList.contains('system')) role = 'SYSTEM';
                  return role + ': ' + m.innerText;
              }).join('\\n\\n');
              navigator.clipboard.writeText(text);
              const old = copy.innerText; copy.innerText = 'Copied!'; setTimeout(() => copy.innerText = old, 2000);
          };

          toggle.onclick = () => { isS = !isS; chat.classList.toggle('hidden', isS); settings.classList.toggle('hidden', !isS); document.getElementById('input-container').classList.toggle('hidden', isS); toggle.innerText = isS ? 'Back' : 'Settings'; if (isS) vscode.postMessage({ type: 'getSettings' }); };
          clear.onclick = () => { vscode.postMessage({ type: 'clearChat' }); };
          
          document.getElementById('save-settings').onclick = () => {
              vscode.postMessage({ type: 'updateSetting', key: 'provider', value: document.getElementById('provider-select').value });
              vscode.postMessage({ type: 'updateSetting', key: 'ollamaModel', value: document.getElementById('ollama-select').value });
              vscode.postMessage({ type: 'updateSetting', key: 'geminiModel', value: document.getElementById('gemini-select').value });
              vscode.postMessage({ type: 'updateSetting', key: 'geminiApiKey', value: document.getElementById('gemini-key').value });
              vscode.postMessage({ type: 'updateSetting', key: 'allowUnsafeExecution', value: document.getElementById('unsafe-exec').checked });
              vscode.window?.showInformationMessage('Settings saved');
          };

          window.addEventListener('message', e => {
            const m = e.data;
            if (m.type === 'addMessage') { addMessage(m.role, m.text); }
            else if (m.type === 'startThinking') { if (thinkingDiv) thinkingDiv.remove(); thinkingDiv = document.createElement('div'); thinkingDiv.className = 'message assistant thinking'; thinkingDiv.innerText = 'AI is processing...'; chat.appendChild(thinkingDiv); chat.scrollTop = chat.scrollHeight; }
            else if (m.type === 'stopThinking') { if (thinkingDiv) thinkingDiv.remove(); thinkingDiv = null; }
            else if (m.type === 'restoreHistory') { chat.innerHTML = ''; m.messages.forEach(msg => addMessage(msg.role, msg.content)); }
            else if (m.type === 'updateStatus') document.getElementById('status-bar').innerText = 'Status: ' + m.text;
            else if (m.type === 'clear') { chat.innerHTML = ''; }
            else if (m.type === 'settings') {
              document.getElementById('provider-select').value = m.provider;
              document.getElementById('ollama-select').innerHTML = m.availableOllamaModels.map(x => \`<option value="\${x.id}">\${x.name}</option>\`).join('');
              document.getElementById('ollama-select').value = m.ollamaModel;
              document.getElementById('gemini-select').innerHTML = m.availableGeminiModels.map(x => \`<option value="\${x.id}">\${x.name}</option>\`).join('');
              document.getElementById('gemini-select').value = m.geminiModel;
              document.getElementById('gemini-key').value = m.geminiApiKey;
              document.getElementById('unsafe-exec').checked = m.allowUnsafeExecution;
              document.getElementById('ollama-settings').classList.toggle('hidden', m.provider !== 'Ollama');
              document.getElementById('gemini-settings').classList.toggle('hidden', m.provider !== 'Gemini');
            }
          });

          prompt.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (prompt.value) { vscode.postMessage({ type: 'askQuestion', value: prompt.value }); prompt.value = ''; }
            }
          });

          // Signal ready
          vscode.postMessage({ type: 'ready' });
        </script>
      </body>
      </html>`;
  }
}
