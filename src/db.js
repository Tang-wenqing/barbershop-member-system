'use strict';
const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite'); // Node 自带，无需安装、无需编译

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'salon.db');
const raw = new DatabaseSync(DB_PATH);

/* ================= 兼容 better-sqlite3 的薄封装 ================= */
function fix(v) {
  if (v === undefined) return null;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return v;
}
function fixAll(args) {
  return args.map(fix);
}

function wrap(stmt) {
  return {
    get: function () { return stmt.get(...fixAll([].slice.call(arguments))); },
    all: function () { return stmt.all(...fixAll([].slice.call(arguments))); },
    run: function () {
      const r = stmt.run(...fixAll([].slice.call(arguments)));
      return { changes: Number(r.changes), lastInsertRowid: Number(r.lastInsertRowid) };
    }
  };
}

let txDepth = 0;
let spSeq = 0;

const db = {
  prepare: function (sql) { return wrap(raw.prepare(sql)); },
  exec: function (sql) { return raw.exec(sql); },
  pragma: function (str) {
    try {
      const s = raw.prepare('PRAGMA ' + str);
      try { return s.get(); } catch (e) { /* 该语句无返回 */ }
    } catch (e) {
      raw.exec('PRAGMA ' + str);
    }
  },
  transaction: function (fn) {
    return function () {
      const args = [].slice.call(arguments);

      if (txDepth > 0) { // 嵌套：用 SAVEPOINT
        const sp = 'sp_' + (++spSeq);
        raw.exec('SAVEPOINT ' + sp);
        txDepth++;
        try {
          const r = fn.apply(null, args);
          raw.exec('RELEASE ' + sp);
          txDepth--;
          return r;
        } catch (err) {
          try { raw.exec('ROLLBACK TO ' + sp); raw.exec('RELEASE ' + sp); } catch (e) {}
          txDepth--;
          throw err;
        }
      }

      raw.exec('BEGIN');
      txDepth++;
      try {
        const r = fn.apply(null, args);
        raw.exec('COMMIT');
        txDepth--;
        return r;
      } catch (err) {
        try { raw.exec('ROLLBACK'); } catch (e) {}
        txDepth--;
        throw err;
      }
    };
  },
  close: function () { return raw.close(); }
};

/* ================= 初始化 ================= */
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL UNIQUE,
  balance INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER NOT NULL,
  member_name TEXT NOT NULL,
  member_phone TEXT NOT NULL,
  record_type TEXT NOT NULL,
  service_code TEXT,
  service_name TEXT,
  amount INTEGER NOT NULL,
  balance_after INTEGER NOT NULL,
  user_id INTEGER,
  operator TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (member_id) REFERENCES members(id)
);

CREATE INDEX IF NOT EXISTS idx_orders_member ON orders(member_id);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
`);

module.exports = db;
