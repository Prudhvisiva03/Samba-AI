const express = require('express');
const router = express.Router();
const { runAIDebate } = require('../services/aiService');

// POST /api/debate
// Body: { idea: "your project idea here" }
router.post('/', async (req, res) => {
  try {
    const { idea } = req.body;
    if (!idea || typeof idea !== 'string' || idea.trim().length === 0) {
      return res.status(400).json({ error: 'Project idea is required' });
    }
    if (idea.length > 2000) {
      return res.status(400).json({ error: 'Idea too long (max 2000 characters)' });
    }

    console.log(`[DEBATE] Starting debate for idea: "${idea.substring(0, 60)}..."`);
    const result = await runAIDebate(idea.trim());

    res.json({
      idea: idea.trim(),
      debates: result.debates,
      synthesis: result.synthesis
    });
  } catch (err) {
    console.error('[DEBATE] Route error:', err.message);
    res.status(500).json({ error: 'Debate failed. Please try again.' });
  }
});

module.exports = router;
