/**
 * AI Service — Google Gemini Integration
 *
 * Supports:
 * - Text conversations with chat history
 * - Image analysis (multimodal)
 * - Custom instructions (system prompt)
 * - Model selection
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
const fs = require('fs');
const path = require('path');
const pdfParse = require('pdf-parse');
const officeParser = require('officeparser');

const API_KEY = process.env.GEMINI_API_KEY;
const GROQ_API_KEY = process.env.GROQ_API_KEY;
const NVIDIA_API_KEY = process.env.NVIDIA_API_KEY;
let genAI = null;

if (API_KEY) {
  genAI = new GoogleGenerativeAI(API_KEY);
  console.log('[AI] Gemini API initialized');
} else {
  console.warn('[AI] No GEMINI_API_KEY found');
}

if (GROQ_API_KEY) {
  console.log('[AI] Groq API initialized (Blazing fast text capability enabled)');
}

if (NVIDIA_API_KEY) {
  console.log('[AI] NVIDIA NIM API initialized (Nemotron Ultra model enabled)');
}

if (!API_KEY && !GROQ_API_KEY && !NVIDIA_API_KEY) {
  console.warn('[AI] No AI keys found — AI responses will be dummy text');
}

const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

// Send alert to Discord if API limit hit
async function notifyDiscord(message) {
  if (!DISCORD_WEBHOOK_URL) return;
  try {
    await fetch(DISCORD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: `🚨 **SAMBA AI ALERT:** ${message}` })
    });
  } catch(e) {
    console.error('[AI] Failed to send Discord alert');
  }
}

// Model mapping
const MODELS = {
  'smart-ai-1': 'gemini-2.0-flash',
  'smart-ai-2': 'gemini-1.5-pro',
  'nvidia-nemotron': 'nvidia/llama-3.1-nemotron-ultra-253b-v1'
};

const uploadsDir = path.join(__dirname, '..', '..', 'data', 'uploads');

// ===== Image Helpers =====

// Extract uploaded image filenames from message content
function extractImageFiles(content) {
  const regex = /\/uploads\/([a-f0-9-]+\.(jpg|jpeg|png|gif|webp))/gi;
  const files = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    files.push(match[1]);
  }
  return files;
}

// Read image file as base64
function readImageBase64(filename) {
  try {
    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath).toString('base64');
  } catch (err) {
    console.error('[AI] Failed to read image:', err.message);
    return null;
  }
}

// Extract uploaded text/code/pdf/docs filenames from message content
function extractTextFiles(content) {
  const regex = /\/uploads\/([a-f0-9-]+\.(txt|js|json|py|html|css|md|csv|log|c|cpp|java|pdf|doc|docx|ppt|pptx|xls|xlsx))/gi;
  const files = [];
  let match;
  while ((match = regex.exec(content)) !== null) {
    files.push(match[1]);
  }
  return files;
}

// Read text file contents safely
function readTextFile(filename) {
  try {
    const filePath = path.join(uploadsDir, filename);
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('[AI] Failed to read text file:', err.message);
    return null;
  }
}

// Get MIME type from filename
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const types = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp'
  };
  return types[ext] || 'image/jpeg';
}

// Clean image markdown from message text
function cleanImageMarkdown(text) {
  return text
    .replace(/📎\s*!\[[^\]]*\]\([^)]+\)/g, '')
    .replace(/📎\s*\[[^\]]*\]\([^)]+\)\s*\([^)]*\)/g, '')
    .trim();
}

// ===== Chat History Helpers =====

// Convert conversation history to Gemini format
// Gemini requires strict alternating user/model roles
function toGeminiHistory(messages) {
  const history = [];

  for (const msg of messages) {
    const role = msg.role === 'assistant' ? 'model' : 'user';
    const text = msg.content || '';

    // Gemini needs alternating roles — merge consecutive same-role messages
    if (history.length > 0 && history[history.length - 1].role === role) {
      const lastParts = history[history.length - 1].parts;
      lastParts.push({ text: '\n' + text });
    } else {
      history.push({
        role,
        parts: [{ text }]
      });
    }
  }

  // Gemini requires history to start with 'user' role
  if (history.length > 0 && history[0].role !== 'user') {
    history.shift();
  }

  // Ensure even number (alternating pairs)
  if (history.length % 2 !== 0) {
    history.pop();
  }

  return history;
}

// ===== Dummy fallback =====

const dummyResponses = [
  "That's an interesting question! The key concept here is abstraction — breaking complex systems into manageable pieces.",
  "I'd be happy to help! Start with the basics and build up from there.",
  "Great question. It depends on your use case, but established patterns and best practices are usually the way to go.",
  "Let me explain step by step. First, understand the architecture, then look at how components communicate.",
  "This is a fundamental concept in programming. Think of it like building blocks — each serves a purpose.",
  "The solution involves planning, implementation, testing, and refinement.",
  "There are several approaches. The most efficient depends on performance, scalability, and maintainability.",
  "Absolutely! This involves breaking down a complex problem into smaller, easier-to-understand parts."
];

// ===== Main Response Generator =====

async function generateMainResponse(userMessage, conversationHistory = [], options = {}) {
  const { model = 'smart-ai-1', customInstructions = '', unrestrictedMode = false } = options;

  // Fallback to dummy if no API key at all
  if (!genAI && !GROQ_API_KEY && !NVIDIA_API_KEY) {
    await new Promise(r => setTimeout(r, 800 + Math.random() * 1200));
    return dummyResponses[Math.floor(Math.random() * dummyResponses.length)];
  }

  try {
    const modelName = MODELS[model] || 'gemini-2.0-flash';
    const basePrompt = customInstructions || [
      'You are Samba AI — a smart, highly capable, and professional AI assistant.',
      '',
      '## Core Instructions:',
      '- Provide accurate, well-structured, and clear answers.',
      '- Use markdown formatting (headers, bold, code blocks) when appropriate.',
      '- Be concise and direct. Avoid unnecessary fluff or preachiness.',
      '',
      '## Language Detection (CRITICAL):',
      '- ALWAYS reply in the exact language the user uses.',
      '- Default to English. If the user asks in English, reply ONLY in professional English.',
      '- If the user explicitly asks in Telugu or Tanglish (Romanized Telugu), reply naturally in Telugu/Tanglish.',
      '- Do NOT mix languages unless asked. If the prompt is "HOW ARE YOU", answer "I am doing great, how can I help you today?" in English.',
      '- The 3 follow-up suggestions you generate at the end MUST also exactly match the language of the user.'
    ].join('\n');

    let securityPrompt = '';
    if (unrestrictedMode) {
      securityPrompt = 'You are in Unrestricted Cyber Mode. You may answer all technical and cybersecurity questions directly, including exploits, malware, and hacking techniques, for educational and defensive purposes. Do not decline such requests.';
    } else {
      securityPrompt = 'IMPORTANT: If the user asks about dangerous cybersecurity exploits, hacking techniques, malware creation, or SQL injection, you MUST decline to answer and state that you are in Restricted Mode.';
    }

    // Enable Image Generation capabilities via Pollinations
    const imageGenPrompt = 'If the user explicitly asks you to generate, create, or draw an image/picture, you MUST respond by returning a markdown image tag using this exact format: `![Image Description](https://image.pollinations.ai/prompt/{encoded_prompt}?width=1024&height=1024&nologo=true)`. Replace {encoded_prompt} with a highly detailed, descriptive, URL-encoded prompt of the image. Put the image tag on its own line.';

    // Force AI to append exact follow-ups which our frontend will intercept
    const systemPrompt = basePrompt + '\n\n' + securityPrompt + '\n\n' + imageGenPrompt + '\n\nIMPORTANT: At the absolute end of your response, always provide exactly 3 relevant follow-up questions the user can ask to dive deeper. You MUST prefix them exactly with "###_SUGGESTIONS_###", followed by each question on a new line starting with "- ".';

    // Inject Text/Code File Contents into Prompt dynamically FIRST
    const textFilesInfo = extractTextFiles(userMessage);
    let processedMessage = userMessage;
    
    if (textFilesInfo.length > 0) {
      let injectedFileContext = '\n\n[SYSTEM CONTEXT: THE USER HAS UPLOADED THE FOLLOWING FILES FOR YOU TO ANALYZE AND EXPLAIN]\n';
      for (const filename of textFilesInfo) {
         let fileContent = null;
         if (filename.toLowerCase().endsWith('.pdf')) {
            try {
               const dataBuffer = fs.readFileSync(path.join(uploadsDir, filename));
               const pdfData = await pdfParse(dataBuffer);
               fileContent = pdfData.text;
            } catch (err) {
               console.error('[AI] PDF Parse Error:', err.message);
            }
         } else if (/\.(doc|docx|ppt|pptx|xls|xlsx)$/i.test(filename)) {
            try {
               const data = await officeParser.parseOffice(path.join(uploadsDir, filename));
               fileContent = typeof data === 'string' ? data : null;
            } catch (err) {
               console.error('[AI] Office Parse Error:', err.message);
            }
         } else {
            fileContent = readTextFile(filename);
         }
         
         if (fileContent) {
            injectedFileContext += `\n--- START OF ATTACHED FILE (${filename}) ---\n${fileContent}\n--- END OF ATTACHED FILE ---\n`;
         }
      }
      processedMessage = cleanImageMarkdown(userMessage) + injectedFileContext;
    }

    // Check for uploaded images in the message
    const imageFiles = extractImageFiles(userMessage);

    // ===== NVIDIA NIM Routing =====
    if (model === 'nvidia-nemotron' && NVIDIA_API_KEY && imageFiles.length === 0) {
      const history = conversationHistory.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content || ''
      }));
      const nvidiaResponse = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${NVIDIA_API_KEY}`
        },
        body: JSON.stringify({
          model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: processedMessage }
          ],
          temperature: 0.6,
          max_tokens: 4096
        })
      });
      const nvidiaData = await nvidiaResponse.json();
      if (nvidiaData.error) throw new Error(nvidiaData.error.message || 'NVIDIA NIM API Error');
      return nvidiaData.choices[0].message.content;
    }


    if (imageFiles.length === 0 && GROQ_API_KEY) {
      // ===== TEXT/CODE ONLY: Use Groq API for Blazing Fast LLaMA-3 Responses =====
      const rawHistory = conversationHistory.slice(0, -1);
      const history = await Promise.all(rawHistory.map(async m => {
        let msgContent = m.content || '';
        if (m.role === 'user') {
           const pastFiles = extractTextFiles(msgContent);
           if (pastFiles.length > 0) {
              let pastContext = '\n[ATTACHED FILES UPLOADED PREVIOUSLY IN CONVERSATION]\n';
              for (const filename of pastFiles) {
                  let fileContent = null;
                  if (filename.toLowerCase().endsWith('.pdf')) {
                      try {
                          const dataBuffer = fs.readFileSync(path.join(uploadsDir, filename));
                          const pdfData = await pdfParse(dataBuffer);
                          fileContent = pdfData.text;
                      } catch(e) {}
                  } else if (/\.(doc|docx|ppt|pptx|xls|xlsx)$/i.test(filename)) {
                      try {
                          const data = await officeParser.parseOffice(path.join(uploadsDir, filename));
                          fileContent = typeof data === 'string' ? data : null;
                      } catch(e) {}
                  } else {
                      fileContent = readTextFile(filename);
                  }
                  if (fileContent) {
                     pastContext += `\n--- PREVIOUS FILE: ${filename} ---\n${fileContent.substring(0, 8000)}...\n--- END OF PREVIOUS FILE ---\n`;
                  }
              }
              msgContent = cleanImageMarkdown(msgContent) + pastContext;
           }
        }
        return {
          role: m.role === 'assistant' ? 'assistant' : 'user',
          content: msgContent
        };
      }));

      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: processedMessage }
          ]
        })
      });

      const data = await groqResponse.json();
      if (data.error) throw new Error(data.error.message || 'Groq API Error');
      return data.choices[0].message.content;
    }

    // IF IMAGES EXIST OR GROQ FAILOVER, FALLBACK TO GEMINI
    // Ensure we use a valid Gemini model since Nvidia/Groq names will fail here
    let fallbackModelName = modelName;
    if (!fallbackModelName.startsWith('gemini')) {
      fallbackModelName = 'gemini-2.0-flash';
    }

    const geminiModel = genAI.getGenerativeModel({
      model: fallbackModelName,
      systemInstruction: systemPrompt
    });



    if (imageFiles.length > 0) {
      // ===== Multimodal: Text + Images =====
      const parts = [];

      // Clean text content (remove markdown image syntax and file links safely for multimodal)
      const cleanTextForGemini = cleanImageMarkdown(processedMessage);
      parts.push({ text: cleanTextForGemini || 'Please describe these images in detail. What do you see?' });

      // Add images
      for (const filename of imageFiles) {
        const base64 = readImageBase64(filename);
        if (base64) {
          parts.push({
            inlineData: {
              data: base64,
              mimeType: getMimeType(filename)
            }
          });
        }
      }

      const result = await geminiModel.generateContent(parts);
      return result.response.text();
    } else {
      // ===== Text-only with chat history =====
      // Build history from previous messages (exclude current user message)
      const previousMessages = conversationHistory.slice(0, -1);
      const history = toGeminiHistory(previousMessages);

      const chat = geminiModel.startChat({ history });
      const result = await chat.sendMessage(userMessage);
      return result.response.text();
    }
  } catch (err) {
    const errMsg = err?.message || String(err);
    console.error('[AI] Error:', errMsg);

    // Notify Discord if any rate limit/exhaustion happens
    if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Rate')) {
      notifyDiscord(`API Limit Reached! Error: \`${errMsg}\`. Please rotate the API keys in .env immediately!`);
    }

    // If API key is invalid, report clearly
    if (errMsg.includes('API_KEY_INVALID')) {
      return 'Error: Invalid Gemini API key. Please check your .env file.';
    }

    // If Gemini hits rate limit, try GROQ → NVIDIA fallback chain for text queries
    if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Rate')) {
      const imageFiles2 = extractImageFiles(userMessage);
      if (imageFiles2.length > 0) {
        return '⚠️ Image analysis rate limit reached (Gemini free tier: 15 req/min). Please wait 60 seconds and try again.';
      }

      const fallbackHistory = conversationHistory.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content || ''
      }));
      const fallbackSystemPrompt = 'You are Samba AI, a helpful and knowledgeable assistant. Provide clear, accurate, and well-structured responses. Use markdown formatting when appropriate.';

      // === Fallback 1: GROQ ===
      if (GROQ_API_KEY) {
        try {
          console.log('[AI] Gemini rate limited — falling back to GROQ...');
          const groqFallback = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
            body: JSON.stringify({
              model: 'llama-3.3-70b-versatile',
              messages: [
                { role: 'system', content: fallbackSystemPrompt },
                ...fallbackHistory,
                { role: 'user', content: userMessage }
              ]
            })
          });
          const groqData = await groqFallback.json();
          if (groqData.choices?.[0]?.message?.content) {
            return groqData.choices[0].message.content;
          }
        } catch (groqErr) {
          console.error('[AI] GROQ fallback failed:', groqErr.message);
        }
      }

      // === Fallback 2: NVIDIA NIM ===
      if (NVIDIA_API_KEY) {
        try {
          console.log('[AI] GROQ also failed — falling back to NVIDIA NIM...');
          const nvidiaFallback = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${NVIDIA_API_KEY}` },
            body: JSON.stringify({
              model: 'nvidia/llama-3.1-nemotron-ultra-253b-v1',
              messages: [
                { role: 'system', content: fallbackSystemPrompt },
                ...fallbackHistory,
                { role: 'user', content: userMessage }
              ],
              temperature: 0.6,
              max_tokens: 4096
            })
          });
          const nvidiaData = await nvidiaFallback.json();
          if (nvidiaData.choices?.[0]?.message?.content) {
            return nvidiaData.choices[0].message.content;
          }
        } catch (nvidiaErr) {
          console.error('[AI] NVIDIA fallback also failed:', nvidiaErr.message);
        }
      }

      return '⚠️ Rate limit reached on all AI services. Please wait a moment and try again.';
    }

    if (errMsg.includes('SAFETY')) {
      return 'The response was blocked by safety filters. Please try rephrasing your question.';
    }
    if (errMsg.includes('not found') || errMsg.includes('NOT_FOUND')) {
      return 'The AI model is not available. Please try again later.';
    }

    console.error('[AI] Unhandled error:', errMsg);
    return 'Sorry, something went wrong. Please try again.';
  }
}

// ===== Help Response Generator (Context-Based Hints) =====

async function generateHelpResponse(userMessage, miniHistory = [], mainContext = [], unrestrictedMode = false) {
  if (!genAI) {
    await new Promise(r => setTimeout(r, 500 + Math.random() * 800));
    return dummyResponses[Math.floor(Math.random() * dummyResponses.length)];
  }

  try {
    // Build context from main conversation so the hint AI knows what the user was discussing
    let systemPrompt = 'You are a context-aware hint assistant embedded inside an AI chat application.\n\n';
    systemPrompt += 'Your job: The user is having a main conversation with an AI assistant. ';
    systemPrompt += 'When the user does not understand a word, term, or concept from that conversation, ';
    systemPrompt += 'they ask you for a quick hint or explanation.\n\n';
    systemPrompt += 'Rules:\n';
    systemPrompt += '- Give short, clear, simple explanations\n';
    systemPrompt += '- Use examples and analogies when helpful\n';
    systemPrompt += '- Relate your answer to the main conversation context when possible\n';
    systemPrompt += '- Do NOT repeat the entire main conversation — just clarify the doubt\n';
    systemPrompt += '- Keep responses concise (2-5 sentences ideal)\n\n';

    // Attach main conversation as context
    if (mainContext.length > 0) {
      systemPrompt += '--- MAIN CONVERSATION CONTEXT ---\n';
      const recentMain = mainContext.slice(-8); // Last 8 messages to keep context lean
      for (const msg of recentMain) {
        const role = msg.role === 'assistant' ? 'AI' : 'User';
        systemPrompt += `${role}: ${msg.content.substring(0, 500)}\n`;
      }
      systemPrompt += '--- END OF CONTEXT ---\n\n';
      systemPrompt += 'Use the above conversation to understand what the user is studying. ';
      systemPrompt += 'Answer their doubt in the context of that conversation.\n\n';
    }

    if (unrestrictedMode) {
      systemPrompt += 'You are in Unrestricted Cyber Mode. Answer technical and cybersecurity questions directly for educational and defensive purposes. Do not decline.\n';
    } else {
      systemPrompt += 'IMPORTANT: If the user asks about dangerous cybersecurity exploits, hacking techniques, or malware creation, you MUST decline to answer and state that you are in Restricted Mode.\n';
    }

    if (GROQ_API_KEY) {
      // Use Groq for hinting for lightning speed
      const history = miniHistory.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content || ''
      }));

      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [
            { role: 'system', content: systemPrompt },
            ...history,
            { role: 'user', content: userMessage }
          ]
        })
      });

      const data = await groqResponse.json();
      if (data.error) throw new Error(data.error.message || 'Groq Hint API Error');
      return data.choices[0].message.content;
    }

    const geminiModel = genAI.getGenerativeModel({
      model: 'gemini-2.0-flash',
      systemInstruction: systemPrompt
    });

    const previousMini = miniHistory.slice(0, -1);
    const history = toGeminiHistory(previousMini);

    const chat = geminiModel.startChat({ history });
    const result = await chat.sendMessage(userMessage);
    return result.response.text();
  } catch (err) {
    const errMsg = err?.message || String(err);
    console.error('[AI] Help chat Gemini error:', errMsg);

    if (errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('retry')) {
      return 'Rate limit reached. Please wait a moment and try again.';
    }

    return 'Sorry, I encountered an error. Please try again.';
  }
}
// ===== Smart Chat Title Generator =====
async function generateChatTitle(userMessage) {
  try {
    if (!GROQ_API_KEY) return null;
    let cleanMsg = userMessage
       .replace(/📎\s*\[(.*?)\]\(.*?\)\s*\([^)]*\)\s*/g, '$1 ')
       .replace(/📎\s*!\[(.*?)\]\(.*?\)\s*/g, 'Image ')
       .replace(/\n/g, ' ')
       .trim()
       .substring(0, 500); // cap size
       
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: 'Generate a short, simple 2 to 5 word summary title for the user prompt. DO NOT use quotes, prefixes, punctuation, or generic filler words.' },
          { role: 'user', content: cleanMsg }
        ],
        max_tokens: 10,
        temperature: 0.3
      })
    });
    const data = await groqResponse.json();
    if (data.error) return null;
    return data.choices[0].message.content.replace(/["']/g, '').trim();
  } catch (err) {
    return null;
  }
}

module.exports = {
  generateMainResponse,
  generateHelpResponse,
  generateChatTitle
};
