/**
 * SQLiteSessionStore — Persistent express-session store using better-sqlite3
 * Stores sessions in the same samba.db so no extra files needed.
 */
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const sessDb = new Database(path.join(dataDir, 'sessions.db'));
sessDb.pragma('journal_mode = WAL');

sessDb.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired_at);
`);

// Purge expired sessions every 15 minutes
setInterval(() => {
  sessDb.prepare('DELETE FROM sessions WHERE expired_at < ?').run(Date.now());
}, 15 * 60 * 1000);

class SQLiteStore {
  constructor(session) {
    const Store = session.Store;
    SQLiteStore.prototype.__proto__ = Store.prototype;
    Store.call(this);
  }

  get(sid, cb) {
    try {
      const row = sessDb.prepare('SELECT sess FROM sessions WHERE sid = ? AND expired_at > ?').get(sid, Date.now());
      if (!row) return cb(null, null);
      cb(null, JSON.parse(row.sess));
    } catch(e) { cb(e); }
  }

  set(sid, session, cb) {
    try {
      const ttl = session.cookie?.maxAge || 7 * 24 * 60 * 60 * 1000;
      const expiredAt = Date.now() + ttl;
      sessDb.prepare(`INSERT INTO sessions (sid, sess, expired_at) VALUES (?, ?, ?)
        ON CONFLICT(sid) DO UPDATE SET sess = excluded.sess, expired_at = excluded.expired_at`)
        .run(sid, JSON.stringify(session), expiredAt);
      cb(null);
    } catch(e) { cb(e); }
  }

  destroy(sid, cb) {
    try {
      sessDb.prepare('DELETE FROM sessions WHERE sid = ?').run(sid);
      cb(null);
    } catch(e) { cb(e); }
  }

  touch(sid, session, cb) {
    try {
      const ttl = session.cookie?.maxAge || 7 * 24 * 60 * 60 * 1000;
      const expiredAt = Date.now() + ttl;
      sessDb.prepare('UPDATE sessions SET expired_at = ? WHERE sid = ?').run(expiredAt, sid);
      cb(null);
    } catch(e) { cb(e); }
  }
}

module.exports = SQLiteStore;
