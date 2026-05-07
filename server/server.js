require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const pgSession = require('connect-pg-simple')(session);
const chatRoutes = require('./routes/chatRoutes');
const miniChatRoutes = require('./routes/miniChatRoutes');
const authRoutes = require('./routes/authRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const cookieParser = require('cookie-parser');
const { pool } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Rate limiting — prevent API abuse
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again after 15 minutes.' }
});

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://accounts.google.com", "https://checkout.razorpay.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://pagead2.googlesyndication.com", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://accounts.google.com"],
      imgSrc: ["'self'", "data:", "https:", "http:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
      connectSrc: ["'self'", "https://*"],
      frameSrc: ["'self'", "https://accounts.google.com", "https://checkout.razorpay.com", "https://googleads.g.doubleclick.net"]
    }
  },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Body parsing
app.use(express.json({ limit: '5mb' }));

// Cookie parser — needed for JWT token reading
app.use(cookieParser());

// Session management — MemoryStore (JWT handles user auth; sessions only used for guest IDs)
app.use(session({
  secret: process.env.SESSION_SECRET || 'samba-ai-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    sameSite: 'lax'
  }
}));

// Request logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'data', 'uploads'), {
  setHeaders: (res, path) => {
    res.setHeader('Content-Security-Policy', "default-src 'none';");
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', 'attachment');
  }
}));

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/chats', miniChatRoutes);
app.use('/api/payment', paymentRoutes);

// Admin API
app.get('/api/admin/stats', async (req, res) => {
  try {
    const db = require('./database');
    const [u, c, m] = await Promise.all([
      pool.query('SELECT COUNT(*) as c FROM users'),
      pool.query('SELECT COUNT(*) as c FROM chats'),
      pool.query('SELECT COUNT(*) as c FROM messages')
    ]);
    res.json({
      users: parseInt(u.rows[0].c),
      chats: parseInt(c.rows[0].c),
      messages: parseInt(m.rows[0].c)
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    db: 'supabase-postgresql',
    time: new Date().toISOString(),
    uptime: Math.floor(process.uptime()) + 's'
  });
});

// Serve index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// 404 for unknown API routes
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(`[ERROR] ${err.message}`);
  const statusCode = err.status || 500;
  res.status(statusCode).json({
    error: process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message
  });
});

// Prevent server crash on unhandled errors
process.on('uncaughtException', (err) => {
  console.error('[UNCAUGHT]', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[UNHANDLED REJECTION]', reason?.message || reason);
});

// Start server
app.listen(PORT, () => {
  console.log(`\n  Samba AI — Supabase PostgreSQL`);
  console.log(`  Server: http://localhost:${PORT}`);
  console.log(`  Env:    ${process.env.NODE_ENV || 'development'}\n`);
});
