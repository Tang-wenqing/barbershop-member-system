'use strict';
const express = require('express');
const db = require('../db');
const { AppError, formatDateTime } = require('../utils');

const router = express.Router();

function now() { return formatDateTime(); }

/* ---------- 查找会员（手机号 / 后4位 / 姓名） ---------- */
router.get('/search', function (req, res, next) {
  try {
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ success: true, data: [] });

    let rows;
    if (/^\d+$/.test(q)) {
      rows = db.prepare(
        'SELECT * FROM members WHERE phone LIKE ? ORDER BY id DESC LIMIT 50'
      ).all('%' + q);
    } else {
      rows = db.prepare(
        'SELECT * FROM members WHERE name = ? ORDER BY id DESC LIMIT 50'
      ).all(q);
    }
    res.json({ success: true, data: rows });
  } catch (e) { next(e); }
});

/* ---------- 会员列表（分页） ---------- */
router.get('/', function (req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const q = String(req.query.q || '').trim();

    let where = '';
    let params = [];
    if (q) {
      where = 'WHERE name LIKE ? OR phone LIKE ?';
      params = ['%' + q + '%', '%' + q + '%'];
    }

    const total = db.prepare('SELECT COUNT(*) AS c FROM members ' + where).get(...params).c;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const list = db.prepare(
      'SELECT * FROM members ' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?'
    ).all(...params, pageSize, (page - 1) * pageSize);

    res.json({ success: true, data: { list: list, total: total, page: page, pageSize: pageSize, pages: pages } });
  } catch (e) { next(e); }
});

/* ---------- 新增会员 ---------- */
router.post('/', function (req, res, next) {
  try {
    const body = req.body || {};
    const nm = String(body.name || '').trim();
    const ph = String(body.phone || '').trim();
    const balance = parseInt(body.balance) || 0;

    if (!nm) throw new AppError('请填写姓名');
    if (!/^\d{11}$/.test(ph)) throw new AppError('手机号必须是 11 位数字');
    if (balance < 0) throw new AppError('余额不能为负数');

    const exists = db.prepare('SELECT id FROM members WHERE phone = ?').get(ph);
    if (exists) throw new AppError('该手机号已存在会员');

    const run = db.transaction(function () {
      const t = now();
      const info = db.prepare(
        'INSERT INTO members (name, phone, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      ).run(nm, ph, balance, t, t);

      const memberId = info.lastInsertRowid;

      if (balance > 0) {
        db.prepare(
          "INSERT INTO orders (member_id, member_name, member_phone, record_type, service_code, service_name, amount, balance_after, user_id, operator, created_at) " +
          "VALUES (?, ?, ?, 'recharge', NULL, ?, ?, ?, ?, ?, ?)"
        ).run(memberId, nm, ph, '开卡充值', balance, balance,
               req.user.id, req.user.username, t);
      }

      return db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
    });

    res.json({ success: true, data: run() });
  } catch (e) { next(e); }
});

/* ---------- 修改会员 ---------- */
router.put('/:id', function (req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    if (!member) throw new AppError('会员不存在', 404);

    const body = req.body || {};
    const nm = String(body.name || '').trim();
    const ph = String(body.phone || '').trim();

    if (!nm) throw new AppError('请填写姓名');
    if (!/^\d{11}$/.test(ph)) throw new AppError('手机号必须是 11 位数字');

    const dup = db.prepare('SELECT id FROM members WHERE phone = ? AND id <> ?').get(ph, id);
    if (dup) throw new AppError('该手机号已被其他会员使用');

    db.prepare('UPDATE members SET name = ?, phone = ?, updated_at = ? WHERE id = ?')
      .run(nm, ph, now(), id);

    res.json({ success: true, data: db.prepare('SELECT * FROM members WHERE id = ?').get(id) });
  } catch (e) { next(e); }
});

/* ---------- 充值 ---------- */
router.post('/:id/recharge', function (req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const amount = parseInt((req.body || {}).amount);
    if (!amount || amount <= 0) throw new AppError('充值金额必须大于 0');

    const run = db.transaction(function () {
      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
      if (!member) throw new AppError('会员不存在', 404);

      const t = now();
      const after = member.balance + amount;

      db.prepare('UPDATE members SET balance = ?, updated_at = ? WHERE id = ?').run(after, t, id);
      db.prepare(
        "INSERT INTO orders (member_id, member_name, member_phone, record_type, service_code, service_name, amount, balance_after, user_id, operator, created_at) " +
        "VALUES (?, ?, ?, 'recharge', NULL, ?, ?, ?, ?, ?, ?)"
      ).run(id, member.name, member.phone, '充值', amount, after,
             req.user.id, req.user.username, t);

      return after;
    });

    res.json({ success: true, data: { balanceAfter: run() } });
  } catch (e) { next(e); }
});

/* ---------- 批量导入 ---------- */
function splitLine(line) {
  return line.trim()
    .split(/[,，\t|;；]+|\s+/)
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s !== ''; });
}

router.post('/import', function (req, res, next) {
  try {
    const body = req.body || {};
    const text = String(body.text || '');
    const mode = String(body.mode || 'skip');

    if (!text.trim()) throw new AppError('请粘贴要导入的数据');
    if (mode !== 'skip' && mode !== 'update' && mode !== 'add') {
      throw new AppError('导入模式不正确');
    }

    const lines = text.split(/\r?\n/)
      .map(function (l) { return l.trim(); })
      .filter(function (l) { return l !== ''; });

    const result = { total: 0, inserted: 0, updated: 0, skipped: 0, failed: 0, errors: [] };
    const isPhone = function (s) { return /^1\d{10}$/.test(s); };
    const isNumber = function (s) { return /^\d+(\.\d{1,2})?$/.test(s); };

    const run = db.transaction(function () {
      lines.forEach(function (line, idx) {
        result.total++;
        try {
          const parts = splitLine(line);
          if (!parts.length) { result.skipped++; return; }

          let phone = null;
          let name = null;
          let balanceYuan = 0;

          parts.forEach(function (p) {
            if (isPhone(p)) phone = p;
            else if (isNumber(p)) balanceYuan = parseFloat(p);
            else if (!name) name = p;
          });

          if (!phone) throw new Error('未识别到 11 位手机号');
          if (!name) throw new Error('未识别到姓名');

          const balanceFen = Math.max(0, Math.round(balanceYuan * 100));
          const exist = db.prepare('SELECT * FROM members WHERE phone = ?').get(phone);
          const t = now();

          if (!exist) {
            const info = db.prepare(
              'INSERT INTO members (name, phone, balance, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
            ).run(name, phone, balanceFen, t, t);

            if (balanceFen > 0) {
              db.prepare(
                "INSERT INTO orders (member_id, member_name, member_phone, record_type, service_code, service_name, amount, balance_after, user_id, operator, created_at) " +
                "VALUES (?, ?, ?, 'recharge', NULL, ?, ?, ?, ?, ?, ?)"
              ).run(info.lastInsertRowid, name, phone, '导入开卡', balanceFen, balanceFen,
                     req.user.id, req.user.username, t);
            }
            result.inserted++;
          } else {
            if (mode === 'skip') {
              result.skipped++;
            } else if (mode === 'update') {
              db.prepare('UPDATE members SET name = ?, balance = ?, updated_at = ? WHERE id = ?')
                .run(name, balanceFen, t, exist.id);
              result.updated++;
            } else {
              const after = exist.balance + balanceFen;
              db.prepare('UPDATE members SET name = ?, balance = ?, updated_at = ? WHERE id = ?')
                .run(name || exist.name, after, t, exist.id);

              if (balanceFen > 0) {
                db.prepare(
                  "INSERT INTO orders (member_id, member_name, member_phone, record_type, service_code, service_name, amount, balance_after, user_id, operator, created_at) " +
                  "VALUES (?, ?, ?, 'recharge', NULL, ?, ?, ?, ?, ?, ?)"
                ).run(exist.id, name || exist.name, phone, '导入累加', balanceFen, after,
                       req.user.id, req.user.username, t);
              }
              result.updated++;
            }
          }
        } catch (err) {
          result.failed++;
          if (result.errors.length < 30) {
            result.errors.push('第 ' + (idx + 1) + ' 行：' + err.message);
          }
        }
      });
    });

    run();
    res.json({ success: true, data: result });
  } catch (e) { next(e); }
});

/* ---------- 删除会员 ---------- */
router.delete('/:id', function (req, res, next) {
  try {
    const id = parseInt(req.params.id);
    const member = db.prepare('SELECT * FROM members WHERE id = ?').get(id);
    if (!member) throw new AppError('会员不存在', 404);

    const cnt = db.prepare('SELECT COUNT(*) AS c FROM orders WHERE member_id = ?').get(id).c;
    if (cnt > 0) throw new AppError('该会员已有 ' + cnt + ' 条流水记录，不允许删除');

    db.prepare('DELETE FROM members WHERE id = ?').run(id);
    res.json({ success: true, data: null });
  } catch (e) { next(e); }
});

module.exports = router;
