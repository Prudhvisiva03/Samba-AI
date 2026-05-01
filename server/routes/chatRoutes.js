const express = require('express');
const router = express.Router();
const db = require('../database');
const { generateMainResponse, generateChatTitle } = require('../services/aiService');

// Helper — get userId from session (guest uses session ID)
function getUserId(req) {
  if (req.session && req.session.userId) {
    return req.session.userId;
  }
  return req.sessionID || 'guest_unknown';
}

// Get all chats (user-scoped)
router.get('/', (req, res) => {
  try {
    const chats = db.getAllChats(getUserId(req));
    res.json(chats);
  } catch (err) {
    console.error('[chatRoutes] GET / error:', err.message);
    res.status(500).json({ error: 'Failed to load chats' });
  }
});

// Create new chat (user-scoped)
router.post('/', (req, res) => {
  try {
    const title = req.body.title;
    const cleanTitle = (typeof title === 'string' && title.trim())
      ? title.trim()
      : 'New Chat';
    const chat = db.createChat(cleanTitle, getUserId(req));
    res.status(201).json(chat);
  } catch (err) {
    console.error('[chatRoutes] POST / error:', err.message);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

// Bulk delete ALL chats for this user
router.delete('/', (req, res) => {
  try {
    const count = db.clearAllChats(getUserId(req));
    res.json({ success: true, deleted: count });
  } catch (err) {
    console.error('[chatRoutes] DELETE / error:', err.message);
    res.status(500).json({ error: 'Failed to clear chats' });
  }
});

// Delete a single chat (ownership-checked)
router.delete('/:id', (req, res) => {
  try {
    const deleted = db.deleteChat(req.params.id, getUserId(req));
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
router.put('/:id', (req, res) => {
  try {
    const { title } = req.body;
    if (!title || typeof title !== 'string' || title.trim().length === 0) {
      return res.status(400).json({ error: 'Title is required' });
    }
    const chat = db.updateChatTitle(req.params.id, title.trim(), getUserId(req));
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
router.put('/:id/pin', (req, res) => {
  try {
    const chat = db.togglePinChat(req.params.id, getUserId(req));
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    res.json(chat);
  } catch (err) {
    console.error('[chatRoutes] PIN error:', err.message);
    res.status(500).json({ error: 'Failed to pin chat' });
  }
});

// Get messages for a chat (ownership-checked)
router.get('/:id/messages', (req, res) => {
  try {
    const chat = db.getChatById(req.params.id, getUserId(req));
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }
    const messages = db.getMessages(req.params.id);
    res.json(messages);
  } catch (err) {
    console.error('[chatRoutes] GET messages error:', err.message);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Send message and get AI response
router.post('/:id/messages', async (req, res) => {
  try {
    const { content, model, customInstructions, unrestrictedMode } = req.body;
    const chatId = req.params.id;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }
    if (content.length > 20000) {
      return res.status(400).json({ error: 'Message too long (max 20,000 characters)' });
    }

    const chat = db.getChatById(chatId, getUserId(req));
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const cleanContent = content.trim();
    const userMsg = db.addMessage(chatId, 'user', cleanContent);

    // Fix race condition: await title gen (with 3s timeout) before responding
    if (chat.title === 'New Chat') {
      try {
        const title = await Promise.race([
          generateChatTitle(cleanContent),
          new Promise(resolve => setTimeout(() => resolve(null), 3000))
        ]);
        if (title) db.updateChatTitle(chatId, title);
      } catch (err) {
        console.error('[Title Gen Error]', err.message);
      }
    }

    // Security check for Unrestricted Mode — allow premium users OR dev account
    let isUnrestricted = false;
    if (unrestrictedMode) {
      const userId = getUserId(req);
      if (userId) {
        const isPremium = db.isPremiumActive(userId);
        const user = db.getUserById(userId);
        if (isPremium || (user && user.email === 'prudhvisiva03@gmail.com')) {
          isUnrestricted = true;
        }
      }
    }

    const history = db.getMessages(chatId);
    const aiText = await generateMainResponse(cleanContent, history, {
      model: model || 'smart-ai-1',
      customInstructions: customInstructions || '',
      unrestrictedMode: isUnrestricted
    });
    const aiMsg = db.addMessage(chatId, 'assistant', aiText);
    const updatedChat = db.getChatById(chatId);

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
