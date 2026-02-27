/**
 * RPG Builder: Full Flow Integration Test
 * This script tests the interaction between:
 * 1. RPGRagService (Context retrieval)
 * 2. GeminiService (AI Chat & Tool Selection)
 * 3. SpriteGenerator (Tool execution with Gemini)
 * 4. Workspace logic
 */

const vscodeMock = {
    workspace: {
        workspaceFolders: [{ uri: { fsPath: __dirname } }],
        getConfiguration: () => ({
            get: (key: string) => {
                if (key === 'provider') return 'Gemini';
                if (key === 'geminiModel') return 'gemini-2.0-flash';
                if (key === 'geminiApiKey') return process.env.GEMINI_API_KEY;
                return undefined;
            }
        }),
        fs: {
            createDirectory: async () => {},
            writeFile: async () => {},
            readFile: async () => Buffer.from('mock content')
        }
    },
    Uri: {
        joinPath: (uri: any, ...parts: string[]) => ({ fsPath: parts.join('/') }),
        parse: (path: string) => ({ fsPath: path })
    },
    window: {
        showInformationMessage: (msg: string) => console.log(`[VSCode UI] ${msg}`)
    }
};

// Mock VSCode
const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(path: string) {
    if (path === 'vscode') return vscodeMock;
    return originalRequire.apply(this, arguments);
};

import { GeminiService } from '../src/gemini-service';
import { RPGRagService } from '../src/rag-client';
import { SpriteGenerator } from '../src/sprite-generator';
import * as path from 'path';

async function runIntegrationTest() {
    console.log('--- starting RPG Builder Integration Test (Gemini) ---');
    
    if (!process.env.GEMINI_API_KEY) {
        console.error('❌ Skipping test: GEMINI_API_KEY environment variable is not set.');
        return;
    }

    const rag = new RPGRagService();
    const gemini = new GeminiService();
    const spriteGen = new SpriteGenerator();

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
                        parameters: { type: 'object', properties: { prompt: {type:'string'}, filename: {type:'string'} } }
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
        } else {
            console.log('⚠️  No tool calls detected. Gemini might have just described the plan.');
        }

        console.log('--- Integration Test: PASSED ---');
    } catch (err: any) {
        console.error('❌ Integration Test: FAILED');
        console.error(err);
    }
}

runIntegrationTest();
