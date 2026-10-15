'use strict';
const db = require('../db');
const { AppError } = require('../utils');

function auth(req, res, next) {
  try {
    const header = req.headers['authorization'] || '';
    const m = /^Bearer\s+(.+)$/i.exec(header);
    if (!m) throw new AppError('未登录或登录已过期', 401);

    const token = m[1].trim();
    const session = db.prepare('SELECT * FROM sessions WHERE token = ?').get(token);
    if (!session) throw new AppError('未登录或登录已过期', 401);

    if (new Date(session.expires_at.replace(' ', 'T')) <= new Date()) {
      db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
      throw new AppError('登录已过期，请重新登录', 401);
    }

    const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(session.user_id);
    if (!user) throw new AppError('用户不存在', 401);

    req.user = user;
    req.token = token;
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = auth;
