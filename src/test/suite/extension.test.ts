import * as assert from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

suite('RPG Builder Full-Chain Integration Test', () => {
	test('AI should autonomously create a script and a sprite', async function() {
		this.timeout(120000); // 2 minutes

		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) assert.fail('No workspace folder.');

		console.log('[Test] Activating extension...');
		const extension = vscode.extensions.getExtension('Sirrine-Jonathan.rpgbuilder');
		await extension?.activate();
		
		console.log('[Test] Waiting for command registration...');
		await new Promise(r => setTimeout(r, 5000));

		// Inject API Key
		if (process.env.GEMINI_API_KEY) {
			console.log('[Test] Injecting Gemini API Key...');
			await vscode.workspace.getConfiguration('rpgbuilder').update('geminiApiKey', process.env.GEMINI_API_KEY, true);
			await vscode.workspace.getConfiguration('rpgbuilder').update('provider', 'Gemini', true);
		}

        const prompt = "PROOF TEST: Create a file named 'integration_proof.gd' with a hello world comment, and generate a pixel art sprite named 'proof_hero'.";
        console.log(`[Test] Triggering command: rpgbuilder.testPrompt`);
        
        try {
			await vscode.commands.executeCommand('rpgbuilder.testPrompt', prompt);
			console.log('[Test] Command executeCommand returned.');
		} catch (err: any) {
			console.error(`[Test] Command FAILED: ${err.message}`);
		}
        
        const scriptPath = path.join(workspaceFolder.uri.fsPath, 'integration_proof.gd');
        const spritePath = path.join(workspaceFolder.uri.fsPath, 'assets', 'proof_hero.png');

        console.log(`[Test] Waiting for files: ${scriptPath}, ${spritePath}`);
        
        const success = await pollForFiles([scriptPath, spritePath], 90000);
        
        if (!success) {
            // Check if at least one file exists to see partial progress
            const scriptExists = fs.existsSync(scriptPath);
            const spriteExists = fs.existsSync(spritePath);
            assert.fail(`Timeout. Script exists: ${scriptExists}, Sprite exists: ${spriteExists}`);
        }
        
        assert.ok(fs.readFileSync(scriptPath, 'utf8').length > 0, 'Script is empty');
        assert.ok(fs.statSync(spritePath).size > 100, 'Sprite is too small');

        console.log('✅ Integration Test PASSED');
	});
});

async function pollForFiles(paths: string[], timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        const allExist = paths.every(p => fs.existsSync(p));
        if (allExist) return true;
        await new Promise(r => setTimeout(r, 5000));
    }
    return false;
}
