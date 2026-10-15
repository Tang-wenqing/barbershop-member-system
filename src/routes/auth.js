'use strict';
const express = require('express');
const crypto = require('crypto');
const db = require('../db');
const { hashPassword, verifyPassword } = require('../password');
const { formatDateTime, AppError } = require('../utils');
const auth = require('../middleware/auth');

const router = express.Router();
const SESSION_DAYS = 7;

router.post('/login', function (req, res, next) {
  try {
    const body = req.body || {};
    const username = String(body.username || '').trim();
    const password = String(body.password || '');

    if (!username || !password) throw new AppError('请输入账号和密码');

    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
    if (!user || !verifyPassword(password, user.password)) {
      throw new AppError('账号或密码错误', 401);
    }

    const token = crypto.randomBytes(32).toString('hex');
    const now = new Date();
    const expires = new Date(now.getTime() + SESSION_DAYS * 24 * 3600 * 1000);

    db.prepare('INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
      .run(token, user.id, formatDateTime(expires), formatDateTime(now));

    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(formatDateTime(now));

    res.json({
      success: true,
      data: { token: token, user: { id: user.id, username: user.username } }
    });
  } catch (e) { next(e); }
});

router.post('/logout', auth, function (req, res, next) {
  try {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
    res.json({ success: true, data: null });
  } catch (e) { next(e); }
});

router.get('/me', auth, function (req, res, next) {
  try {
    res.json({ success: true, data: { id: req.user.id, username: req.user.username } });
  } catch (e) { next(e); }
});

router.post('/password', auth, function (req, res, next) {
  try {
    const body = req.body || {};
    const oldPassword = String(body.oldPassword || '');
    const newPassword = String(body.newPassword || '');

    if (!oldPassword || !newPassword) throw new AppError('请填写原密码和新密码');
    if (newPassword.length < 6) throw new AppError('新密码至少 6 位');

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user || !verifyPassword(oldPassword, user.password)) throw new AppError('原密码错误');

    db.prepare('UPDATE users SET password = ? WHERE id = ?')
      .run(hashPassword(newPassword), user.id);

    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);

    res.json({ success: true, data: null, message: '密码修改成功，请重新登录' });
  } catch (e) { next(e); }
});

module.exports = router;
