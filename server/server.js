require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const session = require('express-session');
const rateLimit = require('express-rate-limit');
const chatRoutes = require('./routes/chatRoutes');
const miniChatRoutes = require('./routes/miniChatRoutes');
const authRoutes = require('./routes/authRoutes');
const uploadRoutes = require('./routes/uploadRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const SQLiteStore = require('./sessionStore');

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Daily Database Backup Script =====
const fs = require('fs');
setInterval(() => {
  try {
    const dataDir = path.join(__dirname, '..', 'data');
    const backupDir = path.join(dataDir, 'backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    
    const dbPath = path.join(dataDir, 'samba.db');
    if (fs.existsSync(dbPath)) {
      const dateStr = new Date().toISOString().slice(0, 10);
      fs.copyFileSync(dbPath, path.join(backupDir, `samba_backup_${dateStr}.db`));
      console.log(`[Backup] Database backed up successfully for ${dateStr}`);
    }
  } catch (err) {
    console.error('[Backup] Failed to backup database:', err.message);
  }
}, 24 * 60 * 60 * 1000); // Run once every 24 hours

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
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" }
}));

// CORS — configured, not wide open
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));

// Body parsing with size limit
app.use(express.json({ limit: '5mb' }));

// Session management — persisted in SQLite so users stay logged in across restarts
app.use(session({
  store: new SQLiteStore(session),
  secret: process.env.SESSION_SECRET || 'change-this-secret',
  resave: false,
  saveUninitialized: true,
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
app.use('/uploads', express.static(path.join(__dirname, '..', 'data', 'uploads')));

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/chats', miniChatRoutes);
app.use('/api/payment', paymentRoutes);

// ===== Admin API =====
app.get('/api/admin/stats', (req, res) => {
  if (!req.session?.user || req.session.user.email !== 'prudhvisiva03@gmail.com') {
    return res.status(403).json({ error: 'Unauthorized. Admin only.' });
  }
  try {
    const sqliteDb = require('better-sqlite3')(require('path').join(__dirname, '..', 'data', 'samba.db'), { readonly: true });
    const users = sqliteDb.prepare('SELECT COUNT(*) as c FROM users').get().c;
    const chats = sqliteDb.prepare('SELECT COUNT(*) as c FROM chats').get().c;
    const msgs = sqliteDb.prepare('SELECT COUNT(*) as c FROM messages').get().c;
    res.json({ users, chats, messages: msgs });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
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
  console.log(`\n  Smart AI Chat Assistant`);
  console.log(`  Server: http://localhost:${PORT}`);
  console.log(`  Env:    ${process.env.NODE_ENV || 'development'}\n`);
});
