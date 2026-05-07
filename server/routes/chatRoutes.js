const express = require('express');
const router = express.Router();
const db = require('../database');
const { generateMainResponse, generateChatTitle } = require('../services/aiService');
const { getUserIdFromReq } = require('./authRoutes');

// Helper — get userId from JWT cookie or session
function getUserId(req) {
  const userId = getUserIdFromReq(req);
  if (userId) return userId;
  if (req.session) req.session.isGuest = true;
  return req.sessionID || 'guest_unknown';
}

// Get all chats (user-scoped)
router.get('/', async (req, res) => {
  try {
    const chats = await db.getAllChats(getUserId(req));
    res.json(chats);
  } catch (err) {
    console.error('[chatRoutes] GET / error:', err.message);
    res.status(500).json({ error: 'Failed to load chats' });
  }
});

// Create new chat (user-scoped)
router.post('/', async (req, res) => {
  try {
    const title = req.body.title;
    const cleanTitle = (typeof title === 'string' && title.trim())
      ? title.trim()
      : 'New Chat';
    const chat = await db.createChat(cleanTitle, getUserId(req));
    res.status(201).json(chat);
  } catch (err) {
    console.error('[chatRoutes] POST / error:', err.message);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// Bulk delete ALL chats for this user
router.delete('/', async (req, res) => {
  try {
    const count = await db.clearAllChats(getUserId(req));
    res.json({ success: true, deleted: count });
  } catch (err) {
    console.error('[chatRoutes] DELETE / error:', err.message);
    res.status(500).json({ error: 'Failed to clear chats' });
  }
});

// Delete a single chat (ownership-checked)
router.delete('/:id', async (req, res) => {
  try {
    const deleted = await db.deleteChat(req.params.id, getUserId(req));
    if (!deleted) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[chatRoutes] DELETE /:id error:', err.message);
    res.status(500).json({ error: 'Failed to delete chat' });
  }
});

// Rename a chat (ownership-checked)
router.put('/:id', async (req, res) => {
  try {
    const { title } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const chat = await db.updateChatTitle(req.params.id, title.trim(), getUserId(req));
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    res.json(chat);
  } catch (err) {
    console.error('[chatRoutes] PUT error:', err.message);
    res.status(500).json({ error: 'Failed to rename chat' });
  }
});

// Pin/Unpin a chat
router.put('/:id/pin', async (req, res) => {
  try {
    const chat = await db.togglePinChat(req.params.id, getUserId(req));
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    res.json(chat);
  } catch (err) {
    console.error('[chatRoutes] PIN error:', err.message);
    res.status(500).json({ error: 'Failed to pin chat' });
  }
});

// Get messages for a chat (no ownership check — chat UUID is enough security)
router.get('/:id/messages', async (req, res) => {
  try {
    const chat = await db.getChatById(req.params.id);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    const messages = await db.getMessages(req.params.id);
    res.json(messages);
  } catch (err) {
    console.error('[chatRoutes] GET messages error:', err.message);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Send message and get AI response
router.post('/:id/messages', async (req, res) => {
  try {
    const { content, model, customInstructions, unrestrictedMode, truthMode, deepResearch } = req.body;
    const chatId = req.params.id;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }
    if (content.length > 20000) {
      return res.status(400).json({ error: 'Message too long (max 20,000 characters)' });
    }

    // Look up chat WITHOUT ownership check — chat UUID is unguessable
    const chat = await db.getChatById(chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const cleanContent = content.trim();
    const userMsg = await db.addMessage(chatId, 'user', cleanContent);

    // Auto-generate title for new chats
    if (chat.title === 'New Chat') {
      try {
        const title = await Promise.race([
          generateChatTitle(cleanContent),
          new Promise(resolve => setTimeout(() => resolve(null), 3000))
        ]);
        if (title) await db.updateChatTitle(chatId, title);
      } catch (err) {
        console.error('[Title Gen Error]', err.message);
      }
    }

    // Unrestricted & Truth Modes — only for logged-in users who toggled it on
    let isUnrestricted = false;
    let isTruthMode = false;
    if (unrestrictedMode && (req.session?.userId || getUserIdFromReq(req))) {
      isUnrestricted = true;
    }
    if (truthMode && (req.session?.userId || getUserIdFromReq(req))) {
      isTruthMode = true;
    }

    const history = await db.getMessages(chatId);
    const aiText = await generateMainResponse(cleanContent, history, {
      model: model || 'smart-ai-1',
      customInstructions: customInstructions || '',
      unrestrictedMode: isUnrestricted,
      truthMode: isTruthMode,
      deepResearch: !!deepResearch
    });
    const aiMsg = await db.addMessage(chatId, 'assistant', aiText);
    const updatedChat = await db.getChatById(chatId);

    res.json({
      userMessage: userMsg,
      aiMessage: aiMsg,
      chat: updatedChat
    });
  } catch (err) {
    console.error('[chatRoutes] POST message error:', err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;
