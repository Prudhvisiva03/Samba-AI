const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const db = require('../database');

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID || 'dummy-client-id');
const JWT_SECRET = process.env.JWT_SECRET || process.env.SESSION_SECRET || 'samba-ai-jwt-secret-2024';
const JWT_EXPIRES = '30d';
const DEV_LOGIN_ENABLED = process.env.ENABLE_DEV_LOGIN === 'true' && process.env.NODE_ENV !== 'production';

function issueToken(res, userId) {
  const token = jwt.sign({ userId }, JWT_SECRET, { expiresIn: JWT_EXPIRES });
  res.cookie('samba_token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  });
  return token;
}

function getUserIdFromReq(req) {
  const token = req.cookies && req.cookies.samba_token;
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET);
      return payload.userId;
    } catch (e) {
      // Ignore invalid or expired JWTs and fall back to session.
    }
  }

  if (req.session && req.session.userId) {
    return req.session.userId;
  }

  return null;
}

router.get('/dev-login', async (req, res) => {
  if (!DEV_LOGIN_ENABLED) {
    return res.status(404).json({ error: 'Not found' });
  }

  try {
    const devEmail = 'prudhvisiva03@gmail.com';
    let user = await db.getUserByEmail(devEmail);
    if (!user) {
      const hash = await bcrypt.hash('devpassword123', 10);
      user = await db.createUser('PRUDHVI SIVA', devEmail, hash);
    }

    await db.setPremium(user.id, 52);
    issueToken(res, user.id);
    req.session.userId = user.id;
    res.redirect('/');
  } catch (err) {
    console.error('[auth] Dev login error:', err);
    res.status(500).json({ error: 'Dev login failed: ' + err.message });
  }
});

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
    const existing = await db.getUserByEmail(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await db.createUser(cleanName, cleanEmail, hash);

    const guestId = req.session && req.session.userId ? null : req.sessionID;
    if (guestId) {
      await db.migrateGuestChats(guestId, user.id);
    }

    issueToken(res, user.id);
    req.session.userId = user.id;

    res.status(201).json({
      user: { id: user.id, name: user.name, email: user.email }
    });
  } catch (err) {
    console.error('[auth] Register error:', err.message);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = await db.getUserByEmail(cleanEmail);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const guestId = req.sessionID;
    if (guestId) {
      await db.migrateGuestChats(guestId, user.id);
    }

    issueToken(res, user.id);
    req.session.userId = user.id;

    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('[auth] Login error:', err.message);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/google', async (req, res) => {
  try {
    const { credential } = req.body;
    if (!credential) {
      return res.status(400).json({ error: 'Google credential is required' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload || !payload.email) {
      return res.status(400).json({ error: 'Invalid Google token' });
    }

    const cleanEmail = payload.email.toLowerCase();
    const displayName = payload.name || cleanEmail.split('@')[0];
    let user = await db.getUserByEmail(cleanEmail);

    if (!user) {
      const randomPassword = Math.random().toString(36).slice(-10) + Math.random().toString(36).slice(-10);
      const hash = await bcrypt.hash(randomPassword, 10);
      user = await db.createUser(displayName, cleanEmail, hash);
    } else if (user.name === 'Google User') {
      user = await db.updateUserName(user.id, displayName);
    }

    const guestId = req.sessionID;
    if (guestId) {
      await db.migrateGuestChats(guestId, user.id);
    }

    issueToken(res, user.id);
    req.session.userId = user.id;

    res.json({ user: { id: user.id, name: user.name, email: user.email } });
  } catch (err) {
    console.error('[auth] Google login error:', err.message);
    res.status(500).json({ error: 'Google Sign-In failed: ' + err.message });
  }
});

router.post('/logout', (req, res) => {
  res.clearCookie('samba_token');
  req.session.destroy(() => {});
  res.json({ success: true });
});

router.get('/me', async (req, res) => {
  const userId = getUserIdFromReq(req);
  if (!userId) {
    return res.json({ user: null });
  }

  const user = await db.getUserById(userId);
  if (!user) {
    return res.json({ user: null });
  }

  const isPremium = await db.isPremiumActive(userId);
  res.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      isPremium,
      planType: user.planType || 'free',
      premiumExpiry: user.premiumExpiry || null
    }
  });
});

module.exports = router;
module.exports.getUserIdFromReq = getUserIdFromReq;
