const express = require('express');
const router = express.Router();
const db = require('../database');
const { generateHelpResponse } = require('../services/aiService');
const { getUserIdFromReq } = require('./authRoutes');

// Helper — get userId from JWT cookie or session
function getUserId(req) {
  const userId = getUserIdFromReq(req);
  if (userId) return userId;
  if (req.session) req.session.isGuest = true;
  return req.sessionID || 'guest_unknown';
}

// Get mini messages for a chat
router.get('/:id/mini-messages', async (req, res) => {
  try {
    const messages = await db.getMiniMessages(req.params.id);
    res.json(messages);
  } catch (err) {
    console.error('[miniChat] GET error:', err.message);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Send mini message and get AI help response
router.post('/:id/mini-messages', async (req, res) => {
  try {
    const { content, unrestrictedMode, truthMode } = req.body;
    const chatId = req.params.id;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const cleanContent = content.trim();
    const userMsg = await db.addMiniMessage(chatId, 'user', cleanContent);

    // Get BOTH main chat context AND mini chat history
    const [mainMessages, miniHistory] = await Promise.all([
      db.getMessages(chatId),
      db.getMiniMessages(chatId)
    ]);

    // Unrestricted Mode & Truth Mode — only for logged-in users
    const isUnrestricted = !!(unrestrictedMode && (req.session?.userId || getUserIdFromReq(req)));
    const isTruthMode = !!(truthMode && (req.session?.userId || getUserIdFromReq(req)));

    const aiText = await generateHelpResponse(cleanContent, miniHistory, mainMessages, isUnrestricted, isTruthMode);
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
