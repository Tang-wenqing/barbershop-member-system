(function () {
  'use strict';

  if (localStorage.getItem('token')) {
    location.href = 'index.html';
    return;
  }

  var form = document.getElementById('loginForm');
  var btn = document.getElementById('loginBtn');
  var errEl = document.getElementById('errorMsg');

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    errEl.textContent = '';

    var username = document.getElementById('username').value.trim();
    var password = document.getElementById('password').value;

    if (!username || !password) {
      errEl.textContent = '请输入账号和密码';
      return;
    }

    btn.disabled = true;
    btn.textContent = '登录中...';

    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: username, password: password })
    })
      .then(function (res) {
        return res.json().then(function (json) {
          return { ok: res.ok, json: json };
        });
      })
      .then(function (r) {
        if (!r.ok || !r.json || !r.json.success) {
          throw new Error((r.json && r.json.message) || '登录失败');
        }
        var data = r.json.data || {};
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user || { username: username }));
        location.href = 'index.html';
      })
      .catch(function (err) {
        errEl.textContent = err.message || '登录失败，请重试';
        btn.disabled = false;
        btn.textContent = '登 录';
      });
  });
})();
