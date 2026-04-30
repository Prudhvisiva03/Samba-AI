const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'samba.db');
const db = new Database(dbPath);

// WAL mode — dramatically better concurrent performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ===== Schema =====
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    is_premium INTEGER DEFAULT 0,
    premium_expiry TEXT,
    premium_activated_at TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT NOT NULL DEFAULT 'New Chat',
    pinned INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS mini_messages (
    id TEXT PRIMARY KEY,
    chat_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (chat_id) REFERENCES chats(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_chats_user ON chats(user_id);
  CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_mini_messages_chat ON mini_messages(chat_id, created_at);
`);

// ===== One-time Migration from chat.json =====
const jsonPath = path.join(dataDir, 'chat.json');
if (fs.existsSync(jsonPath)) {
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    const migrate = db.transaction(() => {
      for (const u of (raw.users || [])) {
        const exists = db.prepare('SELECT id FROM users WHERE id = ?').get(u.id);
        if (!exists) {
          db.prepare(`INSERT INTO users (id, name, email, password, is_premium, premium_expiry, premium_activated_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
            u.id, u.name, u.email, u.password,
            u.isPremium ? 1 : 0,
            u.premiumExpiry || null,
            u.premiumActivatedAt || null,
            u.created_at || new Date().toISOString()
          );
        }
      }
      for (const c of (raw.chats || [])) {
        const exists = db.prepare('SELECT id FROM chats WHERE id = ?').get(c.id);
        if (!exists) {
          db.prepare(`INSERT INTO chats (id, user_id, title, pinned, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`).run(
            c.id, c.user_id || null, c.title || 'New Chat',
            c.pinned ? 1 : 0,
            c.created_at || new Date().toISOString(),
            c.updated_at || new Date().toISOString()
          );
        }
      }
      for (const m of (raw.messages || [])) {
        const exists = db.prepare('SELECT id FROM messages WHERE id = ?').get(m.id);
        if (!exists) {
          db.prepare(`INSERT INTO messages (id, chat_id, role, content, created_at)
            VALUES (?, ?, ?, ?, ?)`).run(m.id, m.chat_id, m.role, m.content, m.created_at || new Date().toISOString());
        }
      }
      for (const m of (raw.mini_messages || [])) {
        const exists = db.prepare('SELECT id FROM mini_messages WHERE id = ?').get(m.id);
        if (!exists) {
          db.prepare(`INSERT INTO mini_messages (id, chat_id, role, content, created_at)
            VALUES (?, ?, ?, ?, ?)`).run(m.id, m.chat_id, m.role, m.content, m.created_at || new Date().toISOString());
        }
      }
    });
    migrate();
    // Rename json so we don't re-migrate
    fs.renameSync(jsonPath, jsonPath + '.migrated');
    console.log('[DB] Migrated chat.json → SQLite successfully');
  } catch (err) {
    console.error('[DB] Migration error (non-fatal):', err.message);
  }
}

console.log('[DB] SQLite database ready:', dbPath);

// ===== User Operations =====

function getUserByEmail(email) {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  return row ? rowToUser(row) : null;
}

function getUserById(id) {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return row ? rowToUser(row) : null;
}

function rowToUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password,
    isPremium: row.is_premium === 1,
    premiumExpiry: row.premium_expiry || null,
    premiumActivatedAt: row.premium_activated_at || null,
    created_at: row.created_at
  };
}

function createUser(name, email, hashedPassword) {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO users (id, name, email, password, is_premium, premium_expiry, premium_activated_at, created_at)
    VALUES (?, ?, ?, ?, 0, NULL, NULL, ?)`).run(id, name, email, hashedPassword, now);
  return getUserById(id);
}

function updateUserName(id, name) {
  db.prepare('UPDATE users SET name = ? WHERE id = ?').run(name.substring(0, 50), id);
  return getUserById(id);
}

function setPremium(id, weeks = 1) {
  const user = getUserById(id);
  if (!user) return null;
  const now = new Date();
  const base = (user.premiumExpiry && new Date(user.premiumExpiry) > now)
    ? new Date(user.premiumExpiry)
    : now;
  base.setDate(base.getDate() + weeks * 7);
  const activatedAt = user.premiumActivatedAt || now.toISOString();
  db.prepare(`UPDATE users SET is_premium = 1, premium_expiry = ?, premium_activated_at = ? WHERE id = ?`)
    .run(base.toISOString(), activatedAt, id);
  return getUserById(id);
}

function isPremiumActive(id) {
  const row = db.prepare('SELECT is_premium, premium_expiry FROM users WHERE id = ?').get(id);
  if (!row || !row.is_premium || !row.premium_expiry) return false;
  return new Date(row.premium_expiry) > new Date();
}

// ===== Chat Operations =====

function getAllChats(userId = null) {
  return db.prepare(`
    SELECT * FROM chats WHERE user_id IS ? ORDER BY pinned DESC, updated_at DESC
  `).all(userId).map(rowToChat);
}

function getChatById(id, userId = undefined) {
  const row = db.prepare('SELECT * FROM chats WHERE id = ?').get(id);
  if (!row) return null;
  if (userId !== undefined && row.user_id !== userId) return null;
  return rowToChat(row);
}

function rowToChat(row) {
  return {
    id: row.id,
    user_id: row.user_id || null,
    title: row.title,
    pinned: row.pinned === 1,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function createChat(title = 'New Chat', userId = null) {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO chats (id, user_id, title, pinned, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?)`).run(id, userId, title.substring(0, 100), now, now);
  return getChatById(id);
}

function updateChatTitle(id, title, userId = undefined) {
  const chat = getChatById(id, userId);
  if (!chat) return null;
  const now = new Date().toISOString();
  db.prepare('UPDATE chats SET title = ?, updated_at = ? WHERE id = ?').run(title.substring(0, 100), now, id);
  return getChatById(id);
}

function togglePinChat(id, userId = undefined) {
  const chat = getChatById(id, userId);
  if (!chat) return null;
  const now = new Date().toISOString();
  db.prepare('UPDATE chats SET pinned = ?, updated_at = ? WHERE id = ?').run(chat.pinned ? 0 : 1, now, id);
  return getChatById(id);
}

function deleteChat(id, userId = undefined) {
  const chat = getChatById(id, userId);
  if (!chat) return false;
  db.prepare('DELETE FROM messages WHERE chat_id = ?').run(id);
  db.prepare('DELETE FROM mini_messages WHERE chat_id = ?').run(id);
  db.prepare('DELETE FROM chats WHERE id = ?').run(id);
  return true;
}

function clearAllChats(userId = null) {
  const chats = db.prepare('SELECT id FROM chats WHERE user_id IS ?').all(userId);
  const ids = chats.map(c => c.id);
  const clear = db.transaction(() => {
    for (const id of ids) {
      db.prepare('DELETE FROM messages WHERE chat_id = ?').run(id);
      db.prepare('DELETE FROM mini_messages WHERE chat_id = ?').run(id);
    }
    db.prepare('DELETE FROM chats WHERE user_id IS ?').run(userId);
  });
  clear();
  return ids.length;
}

// ===== Message Operations =====

function getMessages(chatId) {
  return db.prepare('SELECT * FROM messages WHERE chat_id = ? ORDER BY created_at ASC').all(chatId);
}

function addMessage(chatId, role, content) {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, chatId, role, content.substring(0, 20000), now);
  db.prepare('UPDATE chats SET updated_at = ? WHERE id = ?').run(now, chatId);
  return db.prepare('SELECT * FROM messages WHERE id = ?').get(id);
}

// ===== Mini Message Operations =====

function getMiniMessages(chatId) {
  return db.prepare('SELECT * FROM mini_messages WHERE chat_id = ? ORDER BY created_at ASC').all(chatId);
}

function addMiniMessage(chatId, role, content) {
  const id = uuidv4();
  const now = new Date().toISOString();
  db.prepare(`INSERT INTO mini_messages (id, chat_id, role, content, created_at) VALUES (?, ?, ?, ?, ?)`)
    .run(id, chatId, role, content.substring(0, 5000), now);
  return db.prepare('SELECT * FROM mini_messages WHERE id = ?').get(id);
}

module.exports = {
  getUserByEmail,
  getUserById,
  createUser,
  updateUserName,
  setPremium,
  isPremiumActive,
  getAllChats,
  getChatById,
  createChat,
  updateChatTitle,
  togglePinChat,
  deleteChat,
  clearAllChats,
  getMessages,
  addMessage,
  getMiniMessages,
  addMiniMessage
};
