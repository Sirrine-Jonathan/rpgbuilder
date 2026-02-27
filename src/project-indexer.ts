import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';

export interface IndexSnippet {
    title: string;
    content: string;
    file: string;
}

export class ProjectIndexer {
    /**
     * Walks a directory and extracts documentation snippets from JSDoc blocks.
     */
    async indexPhaserSource(sourcePath: string): Promise<IndexSnippet[]> {
        console.log(`[Indexer] Starting index of: ${sourcePath}`);
        const snippets: IndexSnippet[] = [];
        
        const files = this._getAllFiles(sourcePath, ['.js']);
        console.log(`[Indexer] Found ${files.length} files to process.`);

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf-8');
            
            // 1. Extract Class Descriptions
            const classMatch = content.match(/\/\*\*[\s\S]*?@classdesc[\s\S]*?@class ([\w\.]+)/);
            if (classMatch) {
                const desc = this._cleanJSDoc(classMatch[0]);
                snippets.push({
                    title: `Class: ${classMatch[1]}`,
                    content: desc,
                    file: path.relative(sourcePath, file)
                });
            }

            // 2. Extract Method Descriptions (simplified)
            const methodRegex = /\/\*\*[\s\S]*?@method[\s\S]*?function ([\w\.]+)/g;
            let mMatch;
            while ((mMatch = methodRegex.exec(content)) !== null) {
                const desc = this._cleanJSDoc(mMatch[0]);
                snippets.push({
                    title: `Method: ${mMatch[1]}`,
                    content: desc,
                    file: path.relative(sourcePath, file)
                });
            }
        }

        console.log(`[Indexer] Extracted ${snippets.length} snippets.`);
        return snippets;
    }

    private _cleanJSDoc(doc: string): string {
        return doc
            .replace(/\/\*\*|\*\/|\*/g, '') 
            .replace(/@[a-z]+.*$/gm, '') 
            .split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join(' ')
            .substring(0, 1000); 
    }

    private _getAllFiles(dirPath: string, extensions: string[], arrayOfFiles: string[] = []): string[] {
        const files = fs.readdirSync(dirPath);

        files.forEach((file) => {
            if (fs.statSync(path.join(dirPath, file)).isDirectory()) {
                arrayOfFiles = this._getAllFiles(path.join(dirPath, file), extensions, arrayOfFiles);
            } else {
                if (extensions.some(ext => file.endsWith(ext))) {
                    arrayOfFiles.push(path.join(dirPath, file));
                }
            }
        });

        return arrayOfFiles;
    }
}
