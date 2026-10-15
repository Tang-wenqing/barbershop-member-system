'use strict';
const crypto = require('crypto');

const KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex');
  return salt + ':' + hash;
}

function verifyPassword(password, stored) {
  if (!stored || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 2) return false;
  const salt = parts[0];
  const hash = parts[1];
  let calc;
  try {
    calc = crypto.scryptSync(String(password), salt, KEYLEN).toString('hex');
  } catch (e) {
    return false;
  }
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(calc, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { hashPassword, verifyPassword };
