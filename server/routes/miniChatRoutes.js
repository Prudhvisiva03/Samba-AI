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
router.get('/:id/mini-messages', (req, res) => {
  try {
    const messages = db.getMiniMessages(req.params.id);
    res.json(messages);
  } catch (err) {
    console.error('[miniChat] GET error:', err.message);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// Send mini message and get AI help response
router.post('/:id/mini-messages', async (req, res) => {
  try {
    const { content, unrestrictedMode } = req.body;
    const chatId = req.params.id;

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return res.status(400).json({ error: 'Message content is required' });
    }

    const cleanContent = content.trim();

    const userMsg = db.addMiniMessage(chatId, 'user', cleanContent);

    // Get BOTH main chat context AND mini chat history
    const mainMessages = db.getMessages(chatId);       // Main conversation context
    const miniHistory = db.getMiniMessages(chatId);     // Mini chat's own history

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

    const aiText = await generateHelpResponse(cleanContent, miniHistory, mainMessages, isUnrestricted);
    const aiMsg = db.addMiniMessage(chatId, 'assistant', aiText);

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
