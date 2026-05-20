const express = require('express');
const router = express.Router();
const Razorpay = require('razorpay');
const crypto = require('crypto');
const db = require('../database');
const { getUserIdFromReq } = require('./authRoutes');

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID || '',
  key_secret: process.env.RAZORPAY_KEY_SECRET || ''
});

const PREMIUM_PRICE_INR = 100;
const PREMIUM_WEEKS = 1;
const ALLOW_MOCK_PAYMENTS = process.env.ALLOW_MOCK_PAYMENTS === 'true' && process.env.NODE_ENV !== 'production';

function normalizePlan(plan) {
  return plan === 'truth' ? 'truth' : 'pro';
}

function getPlanAmount(plan) {
  return normalizePlan(plan) === 'truth' ? 150 : PREMIUM_PRICE_INR;
}

function getAuthenticatedUserId(req) {
  return getUserIdFromReq(req) || req.session?.userId || null;
}

router.post('/create-order', async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Login required to upgrade to Premium' });
    }

    if (ALLOW_MOCK_PAYMENTS) {
      return res.json({
        mockMode: true,
        orderId: 'mock_order_' + Date.now(),
        amount: PREMIUM_PRICE_INR * 100,
        currency: 'INR',
        keyId: 'mock_key'
      });
    }

    const plan = normalizePlan(req.body?.plan);
    const finalAmount = getPlanAmount(plan);

    const order = await razorpay.orders.create({
      amount: finalAmount * 100,
      currency: 'INR',
      receipt: `premium_${userId}_${Date.now()}`,
      notes: {
        userId,
        plan
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

router.post('/verify', async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const plan = normalizePlan(req.body?.plan);

    if (ALLOW_MOCK_PAYMENTS) {
      const mockUser = await db.setPremium(userId, PREMIUM_WEEKS, plan);
      if (!mockUser) {
        return res.status(404).json({ error: 'User not found' });
      }

      return res.json({
        success: true,
        message: 'Premium activated in development mode.',
        premiumExpiry: mockUser.premiumExpiry,
        isPremium: true,
        planType: mockUser.planType
      });
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment details' });
    }

    const body = razorpay_order_id + '|' + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      console.error('[Payment] Signature mismatch - possible fraud attempt');
      return res.status(400).json({ error: 'Payment verification failed. Please contact support.' });
    }

    const user = await db.setPremium(userId, PREMIUM_WEEKS, plan);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log(`[Payment] Premium activated for user ${userId} until ${user.premiumExpiry}`);

    res.json({
      success: true,
      message: 'Premium activated successfully.',
      premiumExpiry: user.premiumExpiry,
      isPremium: true,
      planType: user.planType
    });
  } catch (err) {
    console.error('[Payment] Verify error:', err.message);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

router.get('/status', async (req, res) => {
  try {
    const userId = getAuthenticatedUserId(req);
    if (!userId) {
      return res.json({ isPremium: false, premiumExpiry: null, planType: 'free' });
    }

    const user = await db.getUserById(userId);
    if (!user) {
      return res.json({ isPremium: false, premiumExpiry: null, planType: 'free' });
    }

    const active = await db.isPremiumActive(userId);
    res.json({
      isPremium: active,
      planType: user.planType || 'free',
      premiumExpiry: user.premiumExpiry || null
    });
  } catch (e) {
    res.json({ isPremium: false, premiumExpiry: null, planType: 'free' });
  }
});

module.exports = router;
