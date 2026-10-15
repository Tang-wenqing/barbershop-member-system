'use strict';
const path = require('path');
const os = require('os');
const express = require('express');

const db = require('./src/db');
const initAdmin = require('./src/initAdmin');
const authMiddleware = require('./src/middleware/auth');

const authRoutes = require('./src/routes/auth');
const servicesRoutes = require('./src/routes/services');
const membersRoutes = require('./src/routes/members');
const ordersRoutes = require('./src/routes/orders');

const PORT = process.env.PORT || 3000;
const app = express();

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/members', authMiddleware, membersRoutes);
app.use('/api/orders', authMiddleware, ordersRoutes);

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: '接口不存在' });
});

app.use((err, req, res, next) => {
  const status = err && err.status ? err.status : 500;
  const message = (err && err.message) || '服务器内部错误';
  if (status >= 500) console.error('[error]', err);
  res.status(status).json({ success: false, message });
});

function getLanIps() {
  const list = [];
  const nets = os.networkInterfaces();
  Object.keys(nets).forEach(function (name) {
    (nets[name] || []).forEach(function (net) {
      if (net.family === 'IPv4' && !net.internal) list.push(net.address);
    });
  });
  return list;
}

initAdmin();

app.listen(PORT, '0.0.0.0', function () {
  console.log('');
  console.log('========================================');
  console.log('  理发店记账系统已启动');
  console.log('========================================');
  console.log('  本机访问：  http://localhost:' + PORT);
  getLanIps().forEach(function (ip) {
    console.log('  平板访问：  http://' + ip + ':' + PORT);
  });
  console.log('  默认账号：  admin / admin123');
  console.log('========================================');
  console.log('');
});
