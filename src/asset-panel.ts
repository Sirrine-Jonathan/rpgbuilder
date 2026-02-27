import * as vscode from 'vscode';
import { AIService, AIMessage } from './ai-service';
import { OllamaService } from './ollama-service';
import { GeminiService } from './gemini-service';
import * as path from 'path';
import * as fs from 'fs';

export class RPGAssetViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'rpgbuilder.assetView';
    private _view?: vscode.WebviewView;
    private _ollama = new OllamaService();
    private _gemini = new GeminiService();
    private _currentAssetBuffer?: Buffer;
    private _currentPrompt?: string;
    private _currentConfig?: any;

    constructor(private readonly _extensionUri: vscode.Uri) {}

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;
        webviewView.webview.options = { enableScripts: true, localResourceRoots: [this._extensionUri] };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async (data) => {
            switch (data.type) {
                case 'generate':
                    await this._handleGenerate(data.prompt, data.config);
                    break;
                case 'save':
                    await this._handleSave(data.filename);
                    break;
                case 'redo':
                    await this._handleGenerate(this._currentPrompt!, this._currentConfig);
                    break;
                case 'alter':
                    // Just signals the UI to show the input again
                    break;
            }
        });
    }

    private async _handleGenerate(prompt: string, config: any) {
        if (!this._view) return;
        this._currentPrompt = prompt;
        this._currentConfig = config;

        this._view.webview.postMessage({ type: 'status', text: 'Generating asset...' });

        const settings = vscode.workspace.getConfiguration('rpgbuilder');
        const providerType = settings.get<string>('provider') || 'Ollama';
        const service: AIService = providerType === 'Gemini' ? this._gemini : this._ollama;

        try {
            let url = '';
            if (config.type === 'pixel') {
                // We'll use our existing SVG logic for pixel-style
                const systemPrompt = `You are an SVG artist. Generate ONLY the raw <svg>...</svg> code for: ${prompt}. viewBox="0 0 100 100", transparent bg.`;
                const response = await service.chat([{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }], { jsonMode: false });
                const svgMatch = response.content?.match(/<svg[\s\S]*<\/svg>/);
                if (!svgMatch) throw new Error("Could not generate SVG.");
                
                // For the webview, we can just send the SVG string or convert to base64
                this._currentAssetBuffer = Buffer.from(svgMatch[0]);
                const base64 = this._currentAssetBuffer.toString('base64');
                this._view.webview.postMessage({ type: 'result', image: `data:image/svg+xml;base64,${base64}` });
            } else {
                // High fidelity via Pollinations
                url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + " 2d game asset, " + config.size)}?width=512&height=512&nologo=true&seed=${Math.floor(Math.random() * 1000000)}`;
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                this._currentAssetBuffer = Buffer.from(arrayBuffer);
                const base64 = this._currentAssetBuffer.toString('base64');
                this._view.webview.postMessage({ type: 'result', image: `data:image/png;base64,${base64}` });
            }
        } catch (err: any) {
            this._view.webview.postMessage({ type: 'error', text: err.message });
        }
    }

    private async _handleSave(filename: string) {
        if (!this._currentAssetBuffer) return;
        const folder = vscode.workspace.workspaceFolders?.[0];
        if (!folder) return;

        const assetsDir = path.join(folder.uri.fsPath, 'assets');
        if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

        const ext = this._currentConfig.type === 'pixel' ? '.svg' : '.png';
        const fullPath = path.join(assetsDir, filename + ext);
        fs.writeFileSync(fullPath, this._currentAssetBuffer);

        vscode.window.showInformationMessage(`Asset saved to assets/${filename}${ext}`);
        this._view?.webview.postMessage({ type: 'saved' });
    }

    private _getHtmlForWebview(webview: vscode.Webview) {
        return `<!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 10px; display: flex; flex-direction: column; height: 100vh; background: var(--vscode-sideBar-background); box-sizing: border-box; }
                .container { display: flex; flex-direction: column; gap: 10px; flex: 1; overflow-y: auto; }
                #result-container { flex: 1; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.1); border-radius: 4px; overflow: hidden; min-height: 200px; }
                #result-img { max-width: 100%; max-height: 100%; object-fit: contain; }
                .controls { display: flex; flex-direction: column; gap: 8px; flex-shrink: 0; }
                .row { display: flex; gap: 5px; align-items: center; }
                select, input, textarea { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 5px; border-radius: 2px; width: 100%; }
                button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 8px; cursor: pointer; border-radius: 2px; flex: 1; }
                button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
                .hidden { display: none !important; }
                label { font-size: 10px; font-weight: bold; opacity: 0.8; }
            </style>
        </head>
        <body>
            <div class="container">
                <div id="result-container">
                    <div id="status">Ready to generate</div>
                    <img id="result-img" class="hidden" />
                </div>

                <div id="input-ui" class="controls">
                    <div class="row">
                        <div style="flex:1">
                            <label>TYPE</label>
                            <select id="asset-type">
                                <option value="pixel">Pixel Art (SVG)</option>
                                <option value="hd">High Fidelity (PNG)</option>
                            </select>
                        </div>
                        <div style="flex:1">
                            <label>SIZE</label>
                            <select id="asset-size">
                                <option value="32x32">32x32</option>
                                <option value="64x64">64x64</option>
                                <option value="512x512">512x512</option>
                            </select>
                        </div>
                    </div>
                    <div>
                        <label>FILENAME</label>
                        <input type="text" id="filename" placeholder="hero_sprite" />
                    </div>
                    <textarea id="prompt" placeholder="Describe the asset..." style="height: 80px;"></textarea>
                    <button id="gen-btn">Generate Asset</button>
                </div>

                <div id="action-ui" class="controls hidden">
                    <div class="row">
                        <button id="redo-btn" class="secondary">Redo</button>
                        <button id="alter-btn" class="secondary">Alter</button>
                    </div>
                    <button id="save-btn">Save to Assets</button>
                </div>
            </div>

            <script>
                const vscode = acquireVsCodeApi();
                const prompt = document.getElementById('prompt');
                const genBtn = document.getElementById('gen-btn');
                const status = document.getElementById('status');
                const resultImg = document.getElementById('result-img');
                const inputUi = document.getElementById('input-ui');
                const actionUi = document.getElementById('action-ui');
                const saveBtn = document.getElementById('save-btn');
                const redoBtn = document.getElementById('redo-btn');
                const alterBtn = document.getElementById('alter-btn');
                const filename = document.getElementById('filename');

                genBtn.onclick = () => {
                    if (!prompt.value || !filename.value) return;
                    vscode.postMessage({ 
                        type: 'generate', 
                        prompt: prompt.value, 
                        config: { 
                            type: document.getElementById('asset-type').value,
                            size: document.getElementById('asset-size').value
                        }
                    });
                };

                saveBtn.onclick = () => {
                    vscode.postMessage({ type: 'save', filename: filename.value });
                };

                redoBtn.onclick = () => {
                    vscode.postMessage({ type: 'redo' });
                };

                alterBtn.onclick = () => {
                    inputUi.classList.remove('hidden');
                    actionUi.classList.add('hidden');
                    status.classList.add('hidden');
                };

                window.addEventListener('message', e => {
                    const m = e.data;
                    if (m.type === 'status') {
                        status.innerText = m.text;
                        status.classList.remove('hidden');
                        resultImg.classList.add('hidden');
                    } else if (m.type === 'result') {
                        resultImg.src = m.image;
                        resultImg.classList.remove('hidden');
                        status.classList.add('hidden');
                        inputUi.classList.add('hidden');
                        actionUi.classList.remove('hidden');
                    } else if (m.type === 'error') {
                        status.innerText = 'Error: ' + m.text;
                    } else if (m.type === 'saved') {
                        // Reset
                        inputUi.classList.remove('hidden');
                        actionUi.classList.add('hidden');
                        status.innerText = 'Asset Saved!';
                        status.classList.remove('hidden');
                        resultImg.classList.add('hidden');
                    }
                });
            </script>
        </body>
        </html>`;
    }
}
