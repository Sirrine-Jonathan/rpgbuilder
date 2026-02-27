import * as path from 'path';
import { runTests } from '@vscode/test-electron';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as os from 'os';

// Load .env file from project root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
	const testWorkspace = path.join(os.tmpdir(), 'rpgbuilder-integration-test-stable');
	try {
		// Create a stable temporary workspace folder
		if (fs.existsSync(testWorkspace)) fs.rmSync(testWorkspace, { recursive: true, force: true });
		fs.mkdirSync(testWorkspace, { recursive: true });

		// The folder containing the Extension Manifest package.json
		const extensionDevelopmentPath = path.resolve(__dirname, '../../');

		// The path to test runner
		const extensionTestsPath = path.resolve(__dirname, '../../out/test/suite/index');

		// Download VS Code, unzip it and run the integration test
		await runTests({ 
            extensionDevelopmentPath, 
            extensionTestsPath,
            launchArgs: [
				testWorkspace, 
				'--disable-extensions'
			]
        });
	} catch (err) {
		console.error('Failed to run tests');
	} finally {
		const canaryPath = path.join(testWorkspace, 'test_command_called.txt');
		if (fs.existsSync(canaryPath)) {
			console.log('✅ TEST DIAGNOSTIC: Extension command WAS successfully triggered.');
		} else {
			console.log('❌ TEST DIAGNOSTIC: Extension command WAS NOT triggered.');
		}
		console.log('[Test Runner] Finished.');
	}
}

main();
