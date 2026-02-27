"use strict";
/**
 * RPG Builder: Full Flow Integration Test
 * This script tests the interaction between:
 * 1. RPGRagService (Context retrieval)
 * 2. GeminiService (AI Chat & Tool Selection)
 * 3. SpriteGenerator (Tool execution with Gemini)
 * 4. Workspace logic
 */
Object.defineProperty(exports, "__esModule", { value: true });
const vscodeMock = {
    workspace: {
        workspaceFolders: [{ uri: { fsPath: __dirname } }],
        getConfiguration: () => ({
            get: (key) => {
                if (key === 'provider')
                    return 'Gemini';
                if (key === 'geminiModel')
                    return 'gemini-2.0-flash';
                if (key === 'geminiApiKey')
                    return process.env.GEMINI_API_KEY;
                return undefined;
            }
        }),
        fs: {
            createDirectory: async () => { },
            writeFile: async () => { },
            readFile: async () => Buffer.from('mock content')
        }
    },
    Uri: {
        joinPath: (uri, ...parts) => ({ fsPath: parts.join('/') }),
        parse: (path) => ({ fsPath: path })
    },
    window: {
        showInformationMessage: (msg) => console.log(`[VSCode UI] ${msg}`)
    }
};
// Mock VSCode
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function (path) {
    if (path === 'vscode')
        return vscodeMock;
    return originalRequire.apply(this, arguments);
};
const gemini_service_1 = require("../src/gemini-service");
const rag_client_1 = require("../src/rag-client");
const sprite_generator_1 = require("../src/sprite-generator");
async function runIntegrationTest() {
    console.log('--- starting RPG Builder Integration Test (Gemini) ---');
    if (!process.env.GEMINI_API_KEY) {
        console.error('❌ Skipping test: GEMINI_API_KEY environment variable is not set.');
        return;
    }
    const rag = new rag_client_1.RPGRagService();
    const gemini = new gemini_service_1.GeminiService();
    const spriteGen = new sprite_generator_1.SpriteGenerator();
    const userPrompt = "Help me build an RPG. Bootstrap a project and get a main character displaying. Build the asset(s) needed.";
    try {
        console.log(`[Step 1] RAG Augmentation...`);
        const augmented = await rag.augmentPrompt(userPrompt);
        console.log('✅ RAG successful. Context injected.');
        console.log(`[Step 2] Gemini Chat & Tool Selection...`);
        const response = await gemini.chat(augmented, {
            systemPrompt: 'You are a Godot RPG developer. Use tools to create files and assets.',
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'generate_sprite',
                        description: 'Generate sprite',
                        parameters: { type: 'object', properties: { prompt: { type: 'string' }, filename: { type: 'string' } } }
                    }
                }
            ]
        });
        console.log(`✅ Gemini responded.`);
        console.log(`Response content snippet: ${response.content?.substring(0, 100)}...`);
        if (response.toolCalls) {
            console.log(`[Step 3] Executing Tool Calls...`);
            for (const call of response.toolCalls) {
                if (call.name === 'generate_sprite') {
                    console.log(`🚀 Executing generate_sprite: ${call.args.prompt}`);
                    const result = await spriteGen.generate(call.args.prompt, call.args.filename, __dirname, gemini);
                    console.log(`✅ Asset generated at: ${result}`);
                }
            }
        }
        else {
            console.log('⚠️  No tool calls detected. Gemini might have just described the plan.');
        }
        console.log('--- Integration Test: PASSED ---');
    }
    catch (err) {
        console.error('❌ Integration Test: FAILED');
        console.error(err);
    }
}
runIntegrationTest();
//# sourceMappingURL=test-integration.js.map