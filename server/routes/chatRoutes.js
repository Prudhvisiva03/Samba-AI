const express = require('express');
const router = express.Router();
const db = require('../database');
const { generateMainResponse, generateChatTitle } = require('../services/aiService');
const { getUserIdFromReq } = require('./authRoutes');

function getUserId(req) {
  const userId = getUserIdFromReq(req);
  if (userId) return userId;
  if (req.session) req.session.isGuest = true;
  return req.sessionID || 'guest_unknown';
}

async function getOwnedChat(req, chatId) {
  return db.getChatById(chatId, getUserId(req));
}

async function getModeAccess(req) {
  const userId = getUserIdFromReq(req) || req.session?.userId;
  if (!userId) {
    return { unrestricted: false, truth: false, isAdmin: false };
  }

  const user = await db.getUserById(userId);
  const adminEmail = process.env.ADMIN_EMAIL || 'prudhvisiva03@gmail.com';
  const isAdmin = !!(user && user.email === adminEmail);
  if (isAdmin) {
    return { unrestricted: true, truth: true, isAdmin: true };
  }

  const isPremium = await db.isPremiumActive(userId);
  return {
    unrestricted: isPremium,
    truth: isPremium && user?.planType === 'truth',
    isAdmin: false
  };
}

router.get('/', async (req, res) => {
  try {
    const chats = await db.getAllChats(getUserId(req));
    res.json(chats);
  } catch (err) {
    console.error('[chatRoutes] GET / error:', err.message);
    res.status(500).json({ error: 'Failed to load chats' });
  }
});

router.post('/', async (req, res) => {
  try {
    const title = req.body.title;
    const cleanTitle = (typeof title === 'string' && title.trim()) ? title.trim() : 'New Chat';
    const chat = await db.createChat(cleanTitle, getUserId(req));
    res.status(201).json(chat);
  } catch (err) {
    console.error('[chatRoutes] POST / error:', err.message);
    res.status(500).json({ error: 'Failed to create chat' });
  }
});

router.delete('/', async (req, res) => {
  try {
    const count = await db.clearAllChats(getUserId(req));
    res.json({ success: true, deleted: count });
  } catch (err) {
    console.error('[chatRoutes] DELETE / error:', err.message);
    res.status(500).json({ error: 'Failed to clear chats' });
  }
});

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

router.get('/:id/messages', async (req, res) => {
  try {
    const chat = await getOwnedChat(req, req.params.id);
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

    const chat = await getOwnedChat(req, chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const cleanContent = content.trim();
    const userMsg = await db.addMessage(chatId, 'user', cleanContent);

    if (chat.title === 'New Chat') {
      try {
        const title = await Promise.race([
          generateChatTitle(cleanContent),
          new Promise((resolve) => setTimeout(() => resolve(null), 3000))
        ]);

        if (title) {
          await db.updateChatTitle(chatId, title, getUserId(req));
        }
      } catch (err) {
        console.error('[Title Gen Error]', err.message);
      }
    }

    const modeAccess = await getModeAccess(req);
    // ADMIN AUTO-UNRESTRICTED: If user is admin, bypass frontend toggle entirely.
    // Admin always gets full unrestricted + truth access without needing to enable it in UI.
    const effectiveUnrestricted = modeAccess.isAdmin ? true : !!(unrestrictedMode && modeAccess.unrestricted);
    const effectiveTruth = modeAccess.isAdmin ? true : !!(truthMode && modeAccess.truth);

    // FIX BUG #4: Pass history without the current user message
    const fullHistory = await db.getMessages(chatId);
    const history = fullHistory.slice(0, -1);
    const aiText = await generateMainResponse(cleanContent, history, {
      model: model || 'smart-ai-1',
      customInstructions: customInstructions || '',
      unrestrictedMode: effectiveUnrestricted,
      truthMode: effectiveTruth,
      deepResearch: !!deepResearch
    });

    const aiMsg = await db.addMessage(chatId, 'assistant', aiText);
    const updatedChat = await db.getChatById(chatId, getUserId(req));

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
