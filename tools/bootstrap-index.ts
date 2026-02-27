import * as fs from 'fs';
import * as path from 'path';
import ollama from 'ollama';
import { execSync } from 'child_process';

/**
 * Advanced CLI Indexer for Phaser Source
 * Now with Pre-Vectorization for RAG Performance.
 */

const phaserRepoPath = path.resolve(__dirname, '../phaser/source');
const sourcePath = path.resolve(phaserRepoPath, 'src');
const outPath = path.resolve(__dirname, '../data/engine-docs.json');

function getAllFiles(dirPath: string, extensions: string[], arrayOfFiles: string[] = []): string[] {
    const files = fs.readdirSync(dirPath);
    files.forEach((file) => {
        if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
            arrayOfFiles = getAllFiles(path.join(dirPath, file), extensions, arrayOfFiles);
        } else {
            if (extensions.some(ext => file.endsWith(ext))) {
                arrayOfFiles.push(path.join(dirPath, file));
            }
        }
    });
    return arrayOfFiles;
}

function cleanJSDoc(doc: string): string {
    return doc
        .replace(/\/\*\*|\*\/|\*/g, '') 
        .replace(/@[a-z]+.*$/gm, '') 
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0)
        .join(' ')
        .substring(0, 1500); 
}

async function run() {
    // 1. Clone Phaser if missing
    if (!fs.existsSync(phaserRepoPath)) {
        console.log(`[Bootstrap] Phaser source not found. Cloning into ${phaserRepoPath}...`);
        fs.mkdirSync(path.dirname(phaserRepoPath), { recursive: true });
        execSync(`git clone --depth 1 https://github.com/phaserjs/phaser.git "${phaserRepoPath}"`, { stdio: 'inherit' });
    }

    console.log(`[Bootstrap] Indexing Phaser source...`);
    const files = getAllFiles(sourcePath, ['.js']);
    const snippets = [];

    for (const file of files) {
        const content = fs.readFileSync(file, 'utf-8');
        
        const classMatch = content.match(/\/\*\*[\s\S]*?@classdesc[\s\S]*?@class ([\w\.]+)/);
        if (classMatch) {
            snippets.push({
                title: `Phaser Class: ${classMatch[1]}`,
                content: cleanJSDoc(classMatch[0])
            });
        }

        const methodMatch = content.match(/\/\*\*[\s\S]*?@method[\s\S]*?@name ([\w\.]+)/);
        if (methodMatch) {
            snippets.push({
                title: `Phaser Method: ${methodMatch[1]}`,
                content: cleanJSDoc(methodMatch[0])
            });
        }
    }

    console.log(`[Bootstrap] Generated ${snippets.length} snippets. Vectorizing now (this may take a minute)...`);

    // Pre-vectorize snippets in batches
    for (let i = 0; i < snippets.length; i++) {
        const snippet: any = snippets[i];
        try {
            const resp = await ollama.embeddings({
                model: 'nomic-embed-text',
                prompt: snippet.content
            });
            snippet.embedding = resp.embedding;
            if (i % 50 === 0) console.log(`[Bootstrap] Vectorized ${i}/${snippets.length}...`);
        } catch (e) {
            console.error(`[Bootstrap] Failed to vectorize snippet ${i}:`, e);
        }
    }

    if (!fs.existsSync(path.dirname(outPath))) {
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
    }
    fs.writeFileSync(outPath, JSON.stringify(snippets, null, 2));
    console.log(`[Bootstrap] Success! Wrote ${snippets.length} vectorized snippets to ${outPath}`);
}

run();
