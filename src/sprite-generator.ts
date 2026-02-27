import * as path from 'path';
import * as fs from 'fs';
import { AIService } from './ai-service';

export class SpriteGenerator {
  /**
   * Generates a native SVG asset using the LLM. Phaser 3 supports SVGs!
   */
  async generateSVG(prompt: string, filename: string, workspacePath: string, service: AIService): Promise<string> {
    console.log(`[Tool] Generating native SVG asset: ${prompt}`);

    const systemPrompt = `
      You are an expert SVG artist.
      Task: Create a simple, clean, game-ready SVG illustration based on the prompt.
      Format: Return ONLY valid <svg>...</svg> XML code. No markdown, no explanations.
      Requirements:
      - Set viewBox="0 0 100 100"
      - Transparent background (no background rect).
      - Flat colors, simple shapes, perfect for a 2D RPG.
    `;

    try {
        const response = await service.chat([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Generate an SVG for: ${prompt}` }
        ], { jsonMode: false });

        if (!response.content) throw new Error("AI provider returned no SVG content.");

        const svgMatch = response.content.match(/<svg[\s\S]*<\/svg>/);
        if (!svgMatch) throw new Error("Could not find SVG code in response.");

        const svgCode = svgMatch[0];
        const assetsDir = path.join(workspacePath, 'assets');
        if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

        // Force .svg extension
        const baseName = path.basename(filename).replace('.png', '').replace('.svg', '');
        const outputPath = path.join(assetsDir, `${baseName}.svg`);
        
        fs.writeFileSync(outputPath, svgCode, 'utf8');

        return outputPath;
    } catch (err: any) {
        console.error(`[SpriteGenerator] Error: ${err.message}`);
        throw err;
    }
  }
}
