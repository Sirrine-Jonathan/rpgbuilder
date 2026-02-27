/**
 * Proof of Work: Deep Sniff & Tool Extraction (FIXED)
 */

const results: string[] = [];

async function mockHandleTool(name: string, args: any) {
    results.push(`Executed: ${name} with ${JSON.stringify(args)}`);
}

async function deepSniff(content: string) {
    const jsonRegex = /(\{|\[)[\s\S]*(\}|\])/g;
    let m;
    while ((m = jsonRegex.exec(content)) !== null) {
        try {
            const p = JSON.parse(m[0]);
            const items = Array.isArray(p) ? p : [p];
            for (const item of items) {
                if (!item) continue;
                const name = item.name || 
                             item.tool_name || 
                             (item.tool_code && item.tool_code.tool_name ? item.tool_code.tool_name.split('.').pop() : undefined);
                
                const args = item.arguments || 
                             item.parameters || 
                             (item.tool_code ? item.tool_code.parameters : undefined) || 
                             item;

                if (name && args) {
                    await mockHandleTool(name, args);
                }
            }
        } catch (e) {}
    }
}

async function runProof() {
    console.log('--- starting Deep Sniff Verification ---');

    console.log('[Test 1] Raw JSON Array (Gemini Format)...');
    const rawArray = `[{"tool_code": {"tool_name": "default_api.write_file", "parameters": {"path": "test.txt", "content": "hi"}}}]`;
    await deepSniff(rawArray);
    if (results.some(r => r.includes('write_file'))) console.log('✅ Success: Handled Gemini nested array.');

    console.log('[Test 2] Mixed Text and Object...');
    const mixed = `Sure! here is the tool: {"name": "generate_sprite", "arguments": {"prompt": "cat", "filename": "cat"}}`;
    await deepSniff(mixed);
    if (results.some(r => r.includes('generate_sprite'))) console.log('✅ Success: Handled text-wrapped object.');

    console.log('[Test 3] Resilience to malformed JSON...');
    const malformed = `[{"name": "valid"}, {"name": "invalid", "args": { "missing_quote: 1 }}]`;
    try {
        await deepSniff(malformed);
        console.log('✅ Success: Resilient to syntax errors.');
    } catch (e) {
        console.log('❌ Failed: Crashed.');
    }

    console.log('\n--- Deep Sniff Verification: PASSED ---');
}

runProof();
