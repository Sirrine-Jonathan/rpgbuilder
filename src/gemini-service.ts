import { GoogleGenerativeAI, Tool, Content } from "@google/generative-ai";
import { AIService, AIModel, AIResponse, AIMessage } from "./ai-service";
import * as vscode from 'vscode';

export class GeminiService implements AIService {
    public readonly provider = 'Gemini' as const;
    private _client?: GoogleGenerativeAI;

    private _getClient() {
        if (this._client) return this._client;
        const apiKey = vscode.workspace.getConfiguration('rpgbuilder').get<string>('geminiApiKey');
        if (!apiKey) throw new Error("Gemini API Key is missing. Please set it in Settings.");
        this._client = new GoogleGenerativeAI(apiKey);
        return this._client;
    }

    async getAvailableModels(): Promise<AIModel[]> {
        return [
            { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
            { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
            { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' }
        ];
    }

    async chat(messages: AIMessage[], options: { tools?: any[], jsonMode?: boolean }): Promise<AIResponse> {
        const config = vscode.workspace.getConfiguration('rpgbuilder');
        const modelName = config.get<string>('geminiModel') || 'gemini-2.0-flash';
        const genAI = this._getClient();
        
        const geminiTools: Tool[] = [];
        if (options.tools) {
            geminiTools.push({
                functionDeclarations: options.tools.map(t => {
                    const fn = t.function || t;
                    return {
                        name: fn.name,
                        description: fn.description,
                        parameters: fn.parameters
                    };
                })
            });
        }

        const systemMessage = messages.find(m => m.role === 'system');
        const otherMessages = messages.filter(m => m.role !== 'system');

        const model = genAI.getGenerativeModel({ 
            model: modelName,
            systemInstruction: systemMessage?.content,
            tools: geminiTools,
            generationConfig: {
                maxOutputTokens: 8192,
                responseMimeType: options.jsonMode ? "application/json" : "text/plain"
            }
        });

        // Convert messages to Gemini Content format
        const contents: Content[] = otherMessages.map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }));

        // Use generateContent for one-shot multi-message reasoning
        const result = await model.generateContent({ contents });
        const response = result.response;
        
        let content = '';
        try { content = response.text(); } catch (e) {}

        const calls = response.functionCalls();
        return {
            content,
            toolCalls: (calls && Array.isArray(calls)) ? calls.filter(c => !!c).map(c => ({ 
                name: c.name, 
                args: c.args 
            })) : undefined
        };
    }
}
