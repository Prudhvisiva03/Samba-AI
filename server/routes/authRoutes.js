const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const db = require('../database');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || 'dummy-client-id');

// ===== Developer Instant Login =====
router.get('/dev-login', async (req, res) => {
  try {
    const devEmail = 'prudhvisiva03@gmail.com';
    let user = db.getUserByEmail(devEmail);
    if (!user) {
      // Create if doesn't exist
      const hash = await bcrypt.hash('devpassword123', 10);
      user = db.createUser('PRUDHVI SIVA', devEmail, hash);
    }
    // Make dev user Premium automatically
    db.setPremium(user.id, 52); // 1 year premium
    req.session.userId = user.id;
    res.redirect('/');
  } catch (err) {
    res.status(500).json({ error: 'Dev login failed' });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Name is required' });
    }
    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const cleanName = name.trim().substring(0, 50);
    const cleanEmail = email.trim().toLowerCase().substring(0, 100);

    const existing = db.getUserByEmail(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = db.createUser(cleanName, cleanEmail, hash);

    req.session.userId = user.id;
    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('[auth] Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = db.getUserByEmail(cleanEmail);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    req.session.userId = user.id;
    res.json({
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('[auth] Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

// Google Login
router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    let payload;
    
    if (process.env.NODE_ENV === 'production') {
      // Production: Full token verification
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      payload = ticket.getPayload();
    } else {
      // Development: Decode JWT without full verification (localhost)
      // Google tokens from localhost cannot be fully verified server-side
      try {
        const base64Payload = credential.split('.')[1];
        const decoded = Buffer.from(base64Payload, 'base64').toString('utf-8');
        payload = JSON.parse(decoded);
      } catch (e) {
        // Fallback: try full verification anyway
        const ticket = await googleClient.verifyIdToken({
          idToken: credential,
          audience: process.env.GOOGLE_CLIENT_ID,
        });
        payload = ticket.getPayload();
      }
    }
    
    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google token' });
    }

    const cleanEmail = payload.email.toLowerCase();
    let user = db.getUserByEmail(cleanEmail);
    const displayName = payload.name || cleanEmail.split('@')[0];

    // Auto-register if user doesn't exist
    if (!user) {
      const randomPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10);
      const hash = await bcrypt.hash(randomPassword, 10);
      user = db.createUser(displayName, cleanEmail, hash);
    } else if (user.name === 'Google User') {
      // Patch old accounts that got stuck with the generic name
      user = db.updateUserName(user.id, displayName);
    }

    req.session.userId = user.id;
    res.json({
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('[auth] Google login error:', err.message);
    res.status(500).json({ error: 'Google Sign-In failed: ' + err.message });
  }
});

// Logout
router.post('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.clearCookie('connect.sid');
    res.json({ success: true });
  });
});

// Get current session user
router.get('/me', (req, res) => {
  if (!req.session.userId) {
    return res.json({ user: null });
  }
  const user = db.getUserById(req.session.userId);
  if (!user) {
    return res.json({ user: null });
  }
  const isPremium = db.isPremiumActive(req.session.userId);
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      isPremium,
      premiumExpiry: user.premiumExpiry || null
    }
  });
});

module.exports = router;
