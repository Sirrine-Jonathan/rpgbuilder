// 1. Define the mock
const vscodeMock = {
    workspace: {
        getConfiguration: () => ({
            get: (key: string) => {
                if (key === 'ollamaModel') return 'qwen2.5-coder:7b';
                return undefined;
            }
        })
    }
};

const Module = require('module');
const originalRequire = Module.prototype.require;
Module.prototype.require = function(path: string) {
    if (path === 'vscode') return vscodeMock;
    return originalRequire.apply(this, arguments);
};

import { OllamaService } from '../src/ollama-service';

async function runDiagnostic() {
    console.log('--- RPG Builder Diagnostic: Ollama Tool-Calling ---');
    const service = new OllamaService();

    try {
        console.log('[1/2] Testing Simple Chat...');
        await service.chat('Hello', { systemPrompt: 'Be brief.' });
        console.log('✅ Simple chat OK.');

        console.log('[2/2] Testing Tool-Calling...');
        console.log('Asking to generate a sprite...');
        
        const response = await service.chat('Generate a sprite for a red dragon named dragon', {
            systemPrompt: 'You have access to tools. Use them.',
            tools: [
                {
                    type: 'function',
                    function: {
                        name: 'generate_sprite',
                        description: 'Generates a pixel art sprite asset (PNG) for the RPG.',
                        parameters: {
                            type: 'object',
                            properties: {
                                prompt: { type: 'string', description: 'Description' },
                                filename: { type: 'string', description: 'Filename' }
                            },
                            required: ['prompt', 'filename']
                        }
                    }
                }
            ]
        });
        
        console.log('✅ Response received!');
        console.log('Content:', response.content);
        console.log('Tool Calls:', JSON.stringify(response.toolCalls));

        if (response.toolCalls || response.content?.includes('generate_sprite')) {
            console.log('✅ Success: Model attempted to use the tool.');
        }

    } catch (err: any) {
        console.error('❌ Diagnostic FAILED!');
        console.error('Error:', err.message);
    }
}

runDiagnostic();
