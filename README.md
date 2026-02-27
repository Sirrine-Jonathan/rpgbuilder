# RPG Builder AI

AI-powered RPG development tool integrating asset generation and engine RAG.

## Setup

To get started with development:

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Clone and Index Phaser Source:**
   The extension uses RAG (Retrieval-Augmented Generation) based on the Phaser 3 source code. You need to clone the Phaser repository and index it.
   ```bash
   npm run bootstrap
   ```
   This will:
   - Clone the Phaser repository to `phaser/source`.
   - Extract JSDoc snippets from the source.
   - Vectorize the snippets using Ollama (requires `nomic-embed-text` model).

3. **Configure AI Providers:**
   Open the extension in VS Code and navigate to the settings page to configure Ollama or Gemini.

## Development

- `npm run watch`: Compile TypeScript in watch mode.
- `npm run package`: Bundle the extension using esbuild.
- `npm run test:live`: Run integration tests in a real VS Code instance.
- `npm run vsix`: Build the `.vsix` package for installation.
