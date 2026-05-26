const axios = require('axios');

/**
 * Free AI Service — Multi-Provider Stealth Bypass
 * 
 * Provider 1: Pollinations.ai — Free GPT-4o / Claude / Mistral (NO API KEY NEEDED)
 * Provider 2: DuckDuckGo AI  — Free Claude Haiku / GPT-4o-mini (NO API KEY NEEDED)
 * 
 * Used as last-resort fallback when all paid APIs are exhausted/unavailable.
 */

// ===== PROVIDER 1: Pollinations.ai (Best quality — Free GPT-4o) =====
async function chatWithPollinations(messages, systemPrompt = '', model = 'openai') {
  try {
    const fullMessages = [];
    if (systemPrompt) {
      fullMessages.push({ role: 'system', content: systemPrompt });
    }
    fullMessages.push(...messages);

    const response = await fetch('https://text.pollinations.ai/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: fullMessages,
        model: model,        // 'openai' = GPT-4o, 'claude' = Claude, 'mistral' = Mistral
        seed: Math.floor(Math.random() * 99999),
        stream: false
      })
    });

    if (!response.ok) {
      console.warn('[FreeAI] Pollinations HTTP error:', response.status);
      return null;
    }

    const text = await response.text();
    if (!text || text.trim().length === 0) return null;

    // Pollinations returns plain text (not JSON)
    return text.trim();
  } catch (err) {
    console.error('[FreeAI] Pollinations failed:', err.message);
    return null;
  }
}

// ===== PROVIDER 2: DuckDuckGo AI (Backup — Free Claude Haiku) =====
async function getDuckDuckGoVQD() {
  try {
    const response = await axios.get('https://duckduckgo.com/duckduckgo-help-ai', {
      headers: { 'x-vqd-accept': '1' },
      timeout: 5000
    });
    return response.headers['x-vqd-4'] || null;
  } catch (err) {
    console.error('[FreeAI] DDG VQD failed:', err.message);
    return null;
  }
}

async function chatWithDuckDuckGo(message, model = 'claude-3-haiku-20240307') {
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
      },
      timeout: 15000
    });

    const lines = String(response.data).split('\n');
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
    return fullText.trim() || null;
  } catch (err) {
    console.error('[FreeAI] DuckDuckGo failed:', err.message);
    return null;
  }
}

// ===== MAIN: Try all free providers in order =====
async function chatWithFreeAI(userMessage, systemPrompt = '', conversationHistory = []) {
  // Build messages array for providers that support it
  const messages = [
    ...conversationHistory.map(m => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.content || '' })),
    { role: 'user', content: userMessage }
  ];

  // Try Pollinations first (best quality, free GPT-4o)
  console.log('[FreeAI] Trying Pollinations.ai (Free GPT-4o)...');
  const pollinationsResult = await chatWithPollinations(messages, systemPrompt, 'openai');
  if (pollinationsResult && pollinationsResult.length > 10) {
    console.log('[FreeAI] ✅ Pollinations.ai success');
    return pollinationsResult;
  }

  // Try Pollinations with Mistral as second option
  console.log('[FreeAI] Trying Pollinations.ai (Mistral fallback)...');
  const mistralResult = await chatWithPollinations(messages, systemPrompt, 'mistral');
  if (mistralResult && mistralResult.length > 10) {
    console.log('[FreeAI] ✅ Pollinations Mistral success');
    return mistralResult;
  }

  // Try DuckDuckGo as last resort
  console.log('[FreeAI] Trying DuckDuckGo AI (Claude Haiku)...');
  const combinedMsg = systemPrompt ? `${systemPrompt}\n\nUser: ${userMessage}` : userMessage;
  const ddgResult = await chatWithDuckDuckGo(combinedMsg);
  if (ddgResult && ddgResult.length > 10) {
    console.log('[FreeAI] ✅ DuckDuckGo success');
    return ddgResult;
  }

  console.warn('[FreeAI] All free providers failed');
  return null;
}

module.exports = { chatWithFreeAI, chatWithPollinations, chatWithDuckDuckGo };
