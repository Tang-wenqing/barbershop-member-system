'use strict';
const express = require('express');
const db = require('../db');
const { AppError, formatDateTime, todayStr } = require('../utils');
const { getServiceByCode } = require('../services');

const router = express.Router();

/* ---------- 自定义消费配置 ---------- */
const CUSTOM_CODE = 'custom';            // 前端固定项目里约定用这个 code
const CUSTOM_NAME = '自定义消费';
const MAX_CUSTOM_CENTS = 100000;          // 单笔上限 1000 元，防止手滑多按 0

/* ---------- 今日统计 ---------- */
router.get('/summary', function (req, res, next) {
  try {
    const day = todayStr();
    const like = day + '%';

    const consume = db.prepare(
      "SELECT COUNT(*) AS c, IFNULL(SUM(amount),0) AS s FROM orders WHERE record_type = 'consume' AND created_at LIKE ?"
    ).get(like);

    const recharge = db.prepare(
      "SELECT COUNT(*) AS c, IFNULL(SUM(amount),0) AS s FROM orders WHERE record_type = 'recharge' AND created_at LIKE ?"
    ).get(like);

    const members = db.prepare('SELECT COUNT(*) AS c, IFNULL(SUM(balance),0) AS s FROM members').get();

    res.json({
      success: true,
      data: {
        date: day,
        consumeTotal: consume.s,
        rechargeTotal: recharge.s,
        consumeCount: consume.c,
        memberCount: members.c,
        totalBalance: members.s
      }
    });
  } catch (e) { next(e); }
});

/* ---------- 消费扣费（固定项目 / 自定义金额） ---------- */
router.post('/', function (req, res, next) {
  try {
    const body = req.body || {};
    const memberId = parseInt(body.memberId);
    const serviceCode = String(body.serviceCode || '').trim();

    if (!memberId) throw new AppError('请先选择会员');
    if (!serviceCode) throw new AppError('请选择服务项目');

    let service;
    let amount;

    if (serviceCode === CUSTOM_CODE) {
      /* ---- 自定义金额：前端传元（支持小数），这里换算成分 ---- */
      const raw = (body.amount !== undefined && body.amount !== null) ? body.amount : body.customAmount;
      const yuan = Number(raw);

      if (!Number.isFinite(yuan)) throw new AppError('请输入正确的金额');
      amount = Math.round(yuan * 100);          // 四舍五入到分，避开浮点误差
      if (amount <= 0) throw new AppError('自定义金额必须大于 0');
      if (amount > MAX_CUSTOM_CENTS) {
        throw new AppError('单笔自定义金额不能超过 ' + (MAX_CUSTOM_CENTS / 100).toFixed(2) + ' 元');
      }

      service = { code: CUSTOM_CODE, name: CUSTOM_NAME };
    } else {
      /* ---- 固定项目：金额一律由服务端查表得出，不信任前端 ---- */
      service = getServiceByCode(serviceCode);
      if (!service) throw new AppError('服务项目不存在');
      amount = service.price;
    }

    const run = db.transaction(function () {
      const member = db.prepare('SELECT * FROM members WHERE id = ?').get(memberId);
      if (!member) throw new AppError('会员不存在', 404);

      if (member.balance < amount) {
        throw new AppError('余额不足，当前余额 ' + (member.balance / 100).toFixed(2) +
          ' 元，本项目需要 ' + (amount / 100).toFixed(2) + ' 元');
      }

      const after = member.balance - amount;
      const t = formatDateTime();

      db.prepare('UPDATE members SET balance = ?, updated_at = ? WHERE id = ?').run(after, t, memberId);
      db.prepare(
        "INSERT INTO orders (member_id, member_name, member_phone, record_type, service_code, service_name, amount, balance_after, user_id, operator, created_at) " +
        "VALUES (?, ?, ?, 'consume', ?, ?, ?, ?, ?, ?, ?)"
      ).run(memberId, member.name, member.phone, service.code, service.name,
             amount, after, req.user.id, req.user.username, t);

      return {
        balanceAfter: after,
        memberName: member.name,
        serviceName: service.name,
        amount: amount
      };
    });

    res.json({ success: true, data: run() });
  } catch (e) { next(e); }
});

/* ---------- 流水列表 ---------- */
router.get('/', function (req, res, next) {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, parseInt(req.query.pageSize) || 20));
    const type = String(req.query.type || '').trim();
    const q = String(req.query.q || '').trim();

    const conds = [];
    const params = [];

    if (type === 'consume' || type === 'recharge') {
      conds.push('record_type = ?');
      params.push(type);
    }
    if (q) {
      conds.push('(member_name LIKE ? OR member_phone LIKE ?)');
      params.push('%' + q + '%', '%' + q + '%');
    }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

    const total = db.prepare('SELECT COUNT(*) AS c FROM orders ' + where).get(...params).c;
    const pages = Math.max(1, Math.ceil(total / pageSize));
    const list = db.prepare(
      'SELECT * FROM orders ' + where + ' ORDER BY id DESC LIMIT ? OFFSET ?'
    ).all(...params, pageSize, (page - 1) * pageSize);

    res.json({ success: true, data: { list: list, total: total, page: page, pageSize: pageSize, pages: pages } });
  } catch (e) { next(e); }
});

module.exports = router;
