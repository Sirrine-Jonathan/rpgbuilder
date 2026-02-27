import * as vscode from 'vscode';
import ollama from 'ollama';
import * as fs from 'fs';
import * as path from 'path';

interface DocSnippet {
  title: string;
  content: string;
  embedding?: number[];
}

export class RPGRagService {
  private snippets: DocSnippet[] = [];

  constructor() {
    this._loadData();
  }

  public addSnippets(newSnippets: DocSnippet[]) {
      this.snippets.push(...newSnippets);
      this._saveData();
  }

  private _loadData() {
    try {
      const dataPath = path.join(__dirname, '..', 'data', 'engine-docs.json');
      if (fs.existsSync(dataPath)) {
        const rawData = fs.readFileSync(dataPath, 'utf-8');
        this.snippets = JSON.parse(rawData);
        console.log(`[RAG] Loaded ${this.snippets.length} Engine snippets.`);
      }
    } catch (err) {
      console.error('[RAG] Error loading docs:', err);
    }
  }

  private _saveData() {
      try {
          const dataPath = path.join(__dirname, '..', 'data', 'engine-docs.json');
          fs.writeFileSync(dataPath, JSON.stringify(this.snippets, null, 2), 'utf-8');
          console.log(`[RAG] Saved ${this.snippets.length} Engine snippets.`);
      } catch (err) {
          console.error('[RAG] Error saving docs:', err);
      }
  }

  private cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  async augmentPrompt(userPrompt: string): Promise<string> {
    try {
      console.log(`[RAG] Vectorizing user query...`);
      
      // 1. Get embedding for user query
      const queryEmbeddingResponse = await ollama.embeddings({
        model: 'nomic-embed-text',
        prompt: userPrompt
      });
      const queryEmbedding = queryEmbeddingResponse.embedding;

      // 2. Find top 3 most similar snippets using pre-computed embeddings
      const scored = this.snippets
        .filter(s => s.embedding && s.embedding.length > 0)
        .map(s => ({
            ...s,
            score: this.cosineSimilarity(queryEmbedding, s.embedding!)
        }))
        .sort((a, b) => b.score - a.score);

      const topSnippets = scored.slice(0, 3);
      const context = topSnippets.map(s => `### ${s.title}\n${s.content}`).join('\n\n');

      console.log(`[RAG] Retrieved context from: ${topSnippets.map(s => s.title).join(', ')}`);

      return `
        Use the following Phaser 3 documentation to answer the request. 
        --- PHASER 3 REFERENCE ---
        ${context}
        --- END REFERENCE ---

        USER REQUEST: ${userPrompt}
      `.trim();
    } catch (err: any) {
      console.error('[RAG] Error during augmentation:', err.message);
      return userPrompt; 
    }
  }
}
