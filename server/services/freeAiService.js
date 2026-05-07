const axios = require('axios');

/**
 * Free AI Service — Stealth Bypass
 * Uses DuckDuckGo's free AI interface (Claude 3 Haiku / GPT-4o-mini)
 * No API Key Required.
 */

async function getDuckDuckGoVQD() {
    try {
        const response = await axios.get('https://duckduckgo.com/duckduckgo-help-ai', {
            headers: { 'x-vqd-accept': '1' }
        });
        return response.headers['x-vqd-4'];
    } catch (err) {
        console.error('[FreeAI] Failed to get VQD:', err.message);
        return null;
    }
}

async function chatWithFreeAI(message, model = 'claude-3-haiku-20240307') {
    try {
        const vqd = await getDuckDuckGoVQD();
        if (!vqd) return null;

        const response = await axios.post('https://duckduckgo.com/duckduckgo-help-ai/chat', {
            model: model,
            messages: [{ role: 'user', content: message }]
        }, {
            headers: {
                'Content-Type': 'application/json',
                'x-vqd-4': vqd,
                'Accept': 'text/event-stream'
            }
        });

        // The response is a stream of events. We parse it simply.
        const lines = response.data.split('\n');
        let fullText = '';
        for (const line of lines) {
            if (line.startsWith('data: ')) {
                const chunk = line.replace('data: ', '');
                if (chunk === '[DONE]') break;
                try {
                    const parsed = JSON.parse(chunk);
                    if (parsed.message) fullText += parsed.message;
                } catch(e) {}
            }
        }
        return fullText.trim();
    } catch (err) {
        console.error('[FreeAI] Chat failed:', err.message);
        return null;
    }
}

module.exports = { chatWithFreeAI };
