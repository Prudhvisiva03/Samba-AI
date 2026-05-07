const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const db = require('../database');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || ''
});

const PREMIUM_PRICE_INR = 100; // ₹100 per week
const PREMIUM_WEEKS = 1;

// ===== Create Razorpay Order =====
router.post('/create-order', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Login required to upgrade to Premium' });
    }
    
    // DEV MOCK MODE: Bypass if dummy keys are still in .env
    if (!process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID.includes('XXXXXXXXXXXXXXXX')) {
      return res.json({
        mockMode: true,
        orderId: 'mock_order_' + Date.now(),
        amount: PREMIUM_PRICE_INR * 100,
        currency: 'INR',
        keyId: 'mock_key'
      });
    }

    const { plan, amount } = req.body;
    const finalAmount = amount || (plan === 'truth' ? 150 : 100);

    const order = await razorpay.orders.create({
      amount: finalAmount * 100, 
      currency: 'INR',
      receipt: `premium_${req.session.userId}_${Date.now()}`,
      notes: {
        userId: req.session.userId,
        plan: plan || 'pro'
      }
    });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (err) {
    console.error('[Payment] Order creation failed:', err.message);
    res.status(500).json({ error: 'Failed to create payment order. Please try again.' });
  }
});

// ===== Verify Payment & Activate Premium =====
router.post('/verify', async (req, res) => {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, plan, mock } = req.body;

    // DEV MOCK MODE: Bypass if dummy keys or mock flag sent
    const isMockServer = mock || !process.env.RAZORPAY_KEY_ID || process.env.RAZORPAY_KEY_ID.includes('XXXXXXXXXXXXXXXX');

    if (!isMockServer) {
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        return res.status(400).json({ error: 'Missing payment details' });
      }

      // Verify signature
      const body = razorpay_order_id + '|' + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');

      if (expectedSignature !== razorpay_signature) {
        console.error('[Payment] Signature mismatch — possible fraud attempt');
        return res.status(400).json({ error: 'Payment verification failed. Please contact support.' });
      }
    }

    // Activate premium
    const user = await db.setPremium(req.session.userId, 1, plan || 'pro');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`[Payment] Premium activated for user ${req.session.userId} until ${user.premiumExpiry}`);

    res.json({
      success: true,
      message: '🎉 Premium activated! Unrestricted Mode is now available.',
      premiumExpiry: user.premiumExpiry,
      isPremium: true
    });
  } catch (err) {
    console.error('[Payment] Verify error:', err.message);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

// ===== Check Premium Status =====
router.get('/status', async (req, res) => {
  try {
    const { getUserIdFromReq } = require('./authRoutes');
    const userId = getUserIdFromReq(req) || req.session?.userId;
    if (!userId) {
      return res.json({ isPremium: false, premiumExpiry: null });
    }
    const user = await db.getUserById(userId);
    if (!user) return res.json({ isPremium: false, premiumExpiry: null });

    const active = await db.isPremiumActive(userId);
    res.json({
      isPremium: active,
      planType: user.plan_type || 'free',
      premiumExpiry: user.premium_expiry || null
    });
  } catch (e) {
    res.json({ isPremium: false, premiumExpiry: null });
  }
});

module.exports = router;
