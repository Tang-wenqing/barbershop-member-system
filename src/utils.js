'use strict';

function pad(n) { return n < 10 ? '0' + n : '' + n; }

function formatDateTime(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
    + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
}

function todayStr(d) {
  d = d || new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function fen2yuan(fen) {
  return (Number(fen || 0) / 100).toFixed(2);
}

function yuan2fen(yuan) {
  const n = Number(yuan);
  if (!isFinite(n)) return NaN;
  return Math.round(n * 100);
}

class AppError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'AppError';
    this.status = status || 400;
  }
}

module.exports = { formatDateTime, todayStr, fen2yuan, yuan2fen, AppError };
