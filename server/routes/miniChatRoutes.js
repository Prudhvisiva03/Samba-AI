const express = require('express');
const router = express.Router();
const db = require('../database');
const { generateHelpResponse } = require('../services/aiService');
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
    return { unrestricted: false, truth: false };
  }

  const user = await db.getUserById(userId);
  const adminEmail = process.env.ADMIN_EMAIL || 'prudhvisiva03@gmail.com';
  const isAdmin = !!(user && user.email === adminEmail);
  if (isAdmin) {
    return { unrestricted: true, truth: true };
  }

  const isPremium = await db.isPremiumActive(userId);
  return {
    unrestricted: isPremium,
    truth: isPremium && user?.planType === 'truth'
  };
}

router.get('/:id/mini-messages', async (req, res) => {
  try {
    const chat = await getOwnedChat(req, req.params.id);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const messages = await db.getMiniMessages(req.params.id);
    res.json(messages);
  } catch (err) {
    console.error('[miniChat] GET error:', err.message);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

router.post('/:id/mini-messages', async (req, res) => {
  try {
    const { content, unrestrictedMode, truthMode } = req.body;
    const chatId = req.params.id;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const chat = await getOwnedChat(req, chatId);
    if (!chat) {
      return res.status(404).json({ error: 'Chat not found' });
    }

    const cleanContent = content.trim();
    const userMsg = await db.addMiniMessage(chatId, 'user', cleanContent);

    const [mainMessages, miniHistory] = await Promise.all([
      db.getMessages(chatId),
      db.getMiniMessages(chatId)
    ]);

    const modeAccess = await getModeAccess(req);
    const aiText = await generateHelpResponse(
      cleanContent,
      miniHistory,
      mainMessages,
      !!(unrestrictedMode && modeAccess.unrestricted),
      !!(truthMode && modeAccess.truth)
    );
    const aiMsg = await db.addMiniMessage(chatId, 'assistant', aiText);

    res.json({
      userMessage: userMsg,
      aiMessage: aiMsg
    });
  } catch (err) {
    console.error('[miniChat] POST error:', err.message);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;
