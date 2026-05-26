const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');

// ===== PostgreSQL Connection =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000
});

// Test connection and auto-migrate schema if needed
pool.query('SELECT NOW()')
  .then(async () => {
    console.log('[DB] Connected to Supabase PostgreSQL ✅');
    try {
      await pool.query(`
        ALTER TABLE users 
        ADD COLUMN IF NOT EXISTS plan_type VARCHAR(50) DEFAULT 'free',
        ADD COLUMN IF NOT EXISTS premium_expiry VARCHAR(100) DEFAULT NULL,
        ADD COLUMN IF NOT EXISTS premium_activated_at VARCHAR(100) DEFAULT NULL;
      `);
      console.log('[DB] Database schema check & auto-migrations passed ✅');
    } catch (err) {
      console.error('[DB] Auto-migration warning:', err.message);
    }
  })
  .catch(err => {
    console.error('[DB] Connection failed:', err.message);
  });

// ===== User Operations =====

async function getUserByEmail(email) {
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

async function getUserById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ? rowToUser(rows[0]) : null;
}

function rowToUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    password: row.password,
    isPremium: row.is_premium === 1 || row.is_premium === true,
    planType: row.plan_type || 'free',
    premiumExpiry: row.premium_expiry || null,
    premiumActivatedAt: row.premium_activated_at || null,
    created_at: row.created_at
  };
}

async function createUser(name, email, hashedPassword) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO users (id, name, email, password, is_premium, premium_expiry, premium_activated_at, created_at)
     VALUES ($1, $2, $3, $4, 0, NULL, NULL, $5)`,
    [id, name, email, hashedPassword, now]
  );
  return getUserById(id);
}

async function updateUserName(id, name) {
  await pool.query('UPDATE users SET name = $1 WHERE id = $2', [name.substring(0, 50), id]);
  return getUserById(id);
}

async function setPremium(id, weeks = 1, plan = 'pro') {
  const user = await getUserById(id);
  if (!user) return null;
  const now = new Date();
  const base = (user.premiumExpiry && new Date(user.premiumExpiry) > now)
    ? new Date(user.premiumExpiry)
    : now;
  base.setDate(base.getDate() + weeks * 7);
  const activatedAt = user.premiumActivatedAt || now.toISOString();
  await pool.query(
    `UPDATE users SET is_premium = 1, plan_type = $1, premium_expiry = $2, premium_activated_at = $3 WHERE id = $4`,
    [plan, base.toISOString(), activatedAt, id]
  );
  return getUserById(id);
}

async function isPremiumActive(id) {
  const { rows } = await pool.query('SELECT is_premium, premium_expiry FROM users WHERE id = $1', [id]);
  if (!rows[0] || !rows[0].is_premium || !rows[0].premium_expiry) return false;
  return new Date(rows[0].premium_expiry) > new Date();
}

// ===== Chat Operations =====

async function getAllChats(userId = null) {
  const { rows } = await pool.query(
    `SELECT * FROM chats WHERE user_id IS NOT DISTINCT FROM $1 ORDER BY pinned DESC, updated_at DESC`,
    [userId]
  );
  return rows.map(rowToChat);
}

async function getChatById(id, userId = undefined) {
  const { rows } = await pool.query('SELECT * FROM chats WHERE id = $1', [id]);
  if (!rows[0]) return null;
  if (userId !== undefined && rows[0].user_id !== userId) return null;
  return rowToChat(rows[0]);
}

function rowToChat(row) {
  return {
    id: row.id,
    user_id: row.user_id || null,
    title: row.title,
    pinned: row.pinned === 1 || row.pinned === true,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function createChat(title = 'New Chat', userId = null) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO chats (id, user_id, title, pinned, created_at, updated_at) VALUES ($1, $2, $3, 0, $4, $5)`,
    [id, userId, title.substring(0, 100), now, now]
  );
  return getChatById(id);
}

async function updateChatTitle(id, title, userId = undefined) {
  const chat = await getChatById(id, userId);
  if (!chat) return null;
  const now = new Date().toISOString();
  await pool.query('UPDATE chats SET title = $1, updated_at = $2 WHERE id = $3', [title.substring(0, 100), now, id]);
  return getChatById(id);
}

async function togglePinChat(id, userId = undefined) {
  const chat = await getChatById(id, userId);
  if (!chat) return null;
  const now = new Date().toISOString();
  const newPin = chat.pinned ? 0 : 1;
  await pool.query('UPDATE chats SET pinned = $1, updated_at = $2 WHERE id = $3', [newPin, now, id]);
  return getChatById(id);
}

async function deleteChat(id, userId = undefined) {
  const chat = await getChatById(id, userId);
  if (!chat) return false;
  await pool.query('DELETE FROM messages WHERE chat_id = $1', [id]);
  await pool.query('DELETE FROM mini_messages WHERE chat_id = $1', [id]);
  await pool.query('DELETE FROM chats WHERE id = $1', [id]);
  return true;
}

async function clearAllChats(userId = null) {
  const { rows } = await pool.query('SELECT id FROM chats WHERE user_id IS NOT DISTINCT FROM $1', [userId]);
  const ids = rows.map(r => r.id);
  for (const id of ids) {
    await pool.query('DELETE FROM messages WHERE chat_id = $1', [id]);
    await pool.query('DELETE FROM mini_messages WHERE chat_id = $1', [id]);
  }
  await pool.query('DELETE FROM chats WHERE user_id IS NOT DISTINCT FROM $1', [userId]);
  return ids.length;
}

async function migrateGuestChats(sessionId, newUserId) {
  if (!sessionId || !newUserId) return;
  await pool.query('UPDATE chats SET user_id = $1 WHERE user_id = $2', [newUserId, sessionId]);
}

// ===== Message Operations =====

async function getMessages(chatId) {
  const { rows } = await pool.query(
    'SELECT * FROM messages WHERE chat_id = $1 ORDER BY created_at ASC',
    [chatId]
  );
  return rows;
}

async function addMessage(chatId, role, content) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO messages (id, chat_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [id, chatId, role, content.substring(0, 100000), now]
  );
  const { rows } = await pool.query('SELECT * FROM messages WHERE id = $1', [id]);
  return rows[0];
}

// ===== Mini Messages =====

async function getMiniMessages(chatId) {
  const { rows } = await pool.query(
    'SELECT * FROM mini_messages WHERE chat_id = $1 ORDER BY created_at ASC',
    [chatId]
  );
  return rows;
}

async function addMiniMessage(chatId, role, content) {
  const id = uuidv4();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO mini_messages (id, chat_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)`,
    [id, chatId, role, content.substring(0, 5000), now]
  );
  const { rows } = await pool.query('SELECT * FROM mini_messages WHERE id = $1', [id]);
  return rows[0];
}

async function getUserDailyMessageCount(userId) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const { rows } = await pool.query(
      'SELECT COUNT(*) as count FROM messages m JOIN chats c ON m.chat_id = c.id WHERE c.user_id = $1 AND m.created_at >= $2',
      [userId, today.toISOString()]
    );
    return parseInt(rows[0].count || 0, 10);
  } catch (err) {
    console.error('Error getting daily count:', err);
    return 0;
  }
}

// Export pool for session store
module.exports = {
  pool,
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
  migrateGuestChats,
  getMessages,
  addMessage,
  getMiniMessages,
  addMiniMessage,
  getUserDailyMessageCount
};
