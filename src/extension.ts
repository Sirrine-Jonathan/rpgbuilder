import * as vscode from 'vscode';
import { RPGChatViewProvider } from './chat-panel';
import { RPGAssetViewProvider } from './asset-panel';
import { RPGRagService } from './rag-client';
import { ProjectIndexer } from './project-indexer';

export function activate(context: vscode.ExtensionContext) {
  try {
    console.log('--- RPG BUILDER ACTIVATING ---');
    
    const ragService = new RPGRagService();
    const indexer = new ProjectIndexer();
    const chatProvider = new RPGChatViewProvider(context.extensionUri, ragService);
    const assetProvider = new RPGAssetViewProvider(context.extensionUri);

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(RPGChatViewProvider.viewType, chatProvider)
    );

    context.subscriptions.push(
      vscode.window.registerWebviewViewProvider(RPGAssetViewProvider.viewType, assetProvider)
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('rpgbuilder.hello', () => {
        vscode.window.showInformationMessage('RPG Builder is alive and well!');
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('rpgbuilder.start', () => {
        vscode.commands.executeCommand('rpgbuilder.chatView.focus');
      })
    );

    // COMMAND TO INDEX ENGINE SOURCE
    context.subscriptions.push(
      vscode.commands.registerCommand('rpgbuilder.indexSource', async () => {
          const options: vscode.OpenDialogOptions = {
              canSelectMany: false,
              openLabel: 'Select Phaser Source Folder',
              canSelectFiles: false,
              canSelectFolders: true
          };

          const fileUri = await vscode.window.showOpenDialog(options);
          if (fileUri && fileUri[0]) {
              vscode.window.withProgress({
                  location: vscode.ProgressLocation.Notification,
                  title: "Indexing Phaser Source...",
                  cancellable: false
              }, async (progress) => {
                  const snippets = await indexer.indexPhaserSource(fileUri[0].fsPath);
                  ragService.addSnippets(snippets);
                  vscode.window.showInformationMessage(`Successfully indexed ${snippets.length} snippets from Phaser source!`);
              });
          }
      })
    );

    context.subscriptions.push(
      vscode.commands.registerCommand('rpgbuilder.testPrompt', async (prompt: string) => {
          const wf = vscode.workspace.workspaceFolders?.[0];
          if (wf) {
              const uri = vscode.Uri.joinPath(wf.uri, 'test_command_called.txt');
              await vscode.workspace.fs.writeFile(uri, Buffer.from('CALLED', 'utf8'));
          }
          await (chatProvider as any)._handleAskQuestion(prompt);
      })
    );

    console.log('--- RPG BUILDER ACTIVE ---');
  } catch (err: any) {
    vscode.window.showErrorMessage(`RPG Builder CRASHED on activation: ${err.message}`);
    console.error(err);
  }
}

export function deactivate() {}
