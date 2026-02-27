export interface AIModel {
    id: string;
    name: string;
}

export interface AIMessage {
    role: 'user' | 'assistant' | 'system' | 'tool';
    content: string;
}

export interface AIResponse {
    content?: string;
    toolCalls?: Array<{
        name: string;
        args: any;
    }>;
}

export interface AIService {
    readonly provider: 'Ollama' | 'Gemini';
    getAvailableModels(): Promise<AIModel[]>;
    chat(messages: AIMessage[], options: { tools?: any[], jsonMode?: boolean }): Promise<AIResponse>;
}
