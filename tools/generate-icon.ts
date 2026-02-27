import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("GEMINI_API_KEY not found in .env");
        return;
    }

    console.log("[Icon] Generating extension icon...");
    const prompt = "A vibrant RPG-themed rocket icon, flat 2D game art style, white background, high quality, square";
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=512&height=512&nologo=true`;

    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        const outDir = path.resolve(__dirname, '../resources');
        if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

        fs.writeFileSync(path.join(outDir, 'icon.png'), buffer);
        console.log("[Icon] Success! Icon saved to resources/icon.png");
    } catch (err) {
        console.error("[Icon] Failed:", err);
    }
}

run();
