import ollama from 'ollama';
import { AIService, AIModel, AIResponse, AIMessage } from "./ai-service";
import * as vscode from 'vscode';

export class OllamaService implements AIService {
    public readonly provider = 'Ollama' as const;

    async getAvailableModels(): Promise<AIModel[]> {
        try {
            const response = await ollama.list();
            return response.models.map(m => ({
                id: m.name,
                name: m.name
            }));
        } catch (error) {
            console.error('Error fetching Ollama models:', error);
            return [];
        }
    }

    async chat(messages: AIMessage[], options: { tools?: any[], jsonMode?: boolean }): Promise<AIResponse> {
        const config = vscode.workspace.getConfiguration('rpgbuilder');
        const modelName = config.get<string>('ollamaModel') || 'qwen2.5-coder:7b';

        try {
            const response = await ollama.chat({
                model: modelName,
                messages: messages,
                tools: options.tools,
                format: options.jsonMode ? 'json' : undefined,
                stream: false
            });

            return {
                content: response.message.content,
                toolCalls: response.message.tool_calls?.map(tc => ({
                    name: tc.function.name,
                    args: tc.function.arguments
                }))
            };
        } catch (err: any) {
            console.error(`[Ollama] Error in SDK call: ${err.message}`);
            throw err;
        }
    }

    async pullModel(modelName: string, onProgress?: (msg: string) => void) {
        onProgress?.(`Pulling ${modelName}...`);
        const stream = await ollama.pull({ model: modelName, stream: true });
        for await (const part of stream) {
            if (part.total && part.completed) {
                const percent = Math.round((part.completed / part.total) * 100);
                onProgress?.(`Pulling ${modelName}: ${percent}%`);
            }
        }
    }
}
