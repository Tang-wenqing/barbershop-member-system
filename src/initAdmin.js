'use strict';
const db = require('./db');
const { hashPassword } = require('./password');
const { formatDateTime } = require('./utils');

function initAdmin() {
  const row = db.prepare('SELECT COUNT(*) AS c FROM users').get();
  if (row.c > 0) return;

  db.prepare('INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)')
    .run('admin', hashPassword('admin123'), formatDateTime());

  console.log('[初始化] 已创建默认账号 admin / admin123，请登录后尽快修改密码');
}

module.exports = initAdmin;
