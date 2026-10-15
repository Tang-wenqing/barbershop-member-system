(function () {
  'use strict';

  /* ================= 工具 ================= */
  function $(id) { return document.getElementById(id); }

  function fen2yuan(fen) { return (Number(fen || 0) / 100).toFixed(2); }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var toastTimer = null;
  function toast(msg, type) {
    var el = $('toast');
    el.textContent = msg;
    el.className = 'toast show' + (type ? ' ' + type : '');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.className = 'toast'; }, 2200);
  }

  var modalOkHandler = null;
  function showModal(title, bodyHtml, onOk, okText, hideCancel) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = bodyHtml;
    $('modalOk').textContent = okText || '确定';
    $('modalCancel').style.display = hideCancel ? 'none' : '';
    modalOkHandler = onOk || null;
    $('modalMask').classList.add('show');
  }
  function closeModal() {
    $('modalMask').classList.remove('show');
    modalOkHandler = null;
  }
  $('modalOk').addEventListener('click', function () {
    var h = modalOkHandler;
    closeModal();
    if (h) h();
  });
  $('modalCancel').addEventListener('click', closeModal);
  $('modalMask').addEventListener('click', function (e) {
    if (e.target === $('modalMask')) closeModal();
  });

  /* ================= API 封装 ================= */
  function api(path, options) {
    options = options || {};
    var token = localStorage.getItem('token');
    if (!token) {
      location.href = 'login.html';
      return Promise.reject(new Error('未登录'));
    }

    var headers = { 'Content-Type': 'application/json' };
    headers['Authorization'] = 'Bearer ' + token;

    return fetch(path, {
      method: options.method || 'GET',
      headers: headers,
      body: options.body
    }).then(function (res) {
      if (res.status === 401) {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        location.href = 'login.html';
        throw new Error('登录已过期');
      }
      return res.json().catch(function () { return null; }).then(function (json) {
        if (!json || !json.success) {
          throw new Error((json && json.message) || '请求失败');
        }
        return json.data;
      });
    });
  }

  /* ================= 自定义消费配置 =================
     与服务端 src/routes/orders.js 保持一致 */
  var CUSTOM_CODE = 'custom';        // 自定义项的 code
  var CUSTOM_NAME = '自定义消费';     // 流水里显示的项目名
  var MAX_CUSTOM_CENTS = 100000;     // 单笔上限 1000 元

  /* ================= 状态 ================= */
  var currentMember = null;
  var orderPage = 1;
  var orderPages = 1;
  var memberPage = 1;
  var memberPages = 1;

  /* ================= 顶部用户 & 退出 ================= */
  (function () {
    try {
      var u = JSON.parse(localStorage.getItem('user') || '{}');
      $('currentUser').textContent = u.username ? ('店员：' + u.username) : '';
    } catch (e) {}
  })();

  $('logoutBtn').addEventListener('click', function () {
    showModal('确认退出', '确定要退出登录吗？', function () {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      location.href = 'login.html';
    });
  });

  /* ================= 标签页切换 ================= */
  var tabs = document.querySelectorAll('.tab');
  Array.prototype.forEach.call(tabs, function (tab) {
    tab.addEventListener('click', function () {
      var name = tab.dataset.tab;
      Array.prototype.forEach.call(tabs, function (t) {
        t.classList.toggle('active', t === tab);
      });
      Array.prototype.forEach.call(document.querySelectorAll('.tab-panel'), function (p) {
        p.classList.toggle('active', p.id === 'panel-' + name);
      });
      if (name === 'orders') { loadSummary(); loadOrders(1); }
      if (name === 'members') { loadMembers(1); }
    });
  });

  /* ================= 加载服务项目 ================= */
  function loadServices() {
    return api('/api/services').then(function (groups) {
      var sel = $('serviceSelect');
      sel.innerHTML = '<option value="">请选择项目</option>';

      (groups || []).forEach(function (g) {
        var og = document.createElement('optgroup');
        og.label = g.category;
        (g.items || []).forEach(function (s) {
          var opt = document.createElement('option');
          opt.value = s.code;
          opt.textContent = s.name + '（' + fen2yuan(s.price) + ' 元）';
          opt.dataset.price = s.price;
          opt.dataset.name = s.name;
          og.appendChild(opt);
        });
        sel.appendChild(og);
      });

      /* ---- 追加「自定义金额」选项（放在最底部） ---- */
      var custom = document.createElement('option');
      custom.value = CUSTOM_CODE;
      custom.textContent = '自定义金额（手动输入）';
      sel.appendChild(custom);
    }).catch(function (e) {
      toast(e.message, 'error');
    });
  }

  /* 切换项目时的界面处理 */
  function onServiceChange() {
    var sel = $('serviceSelect');
    var isCustom = sel.value === CUSTOM_CODE;

    $('priceRow').style.display = isCustom ? 'none' : '';
    $('customAmountItem').style.display = isCustom ? '' : 'none';

    if (isCustom) {
      $('servicePrice').textContent = '0.00 元';
      $('customAmount').value = '';
      setTimeout(function () { try { $('customAmount').focus(); } catch (e) {} }, 50);
    } else {
      var opt = sel.selectedOptions[0];
      var price = opt && opt.dataset ? opt.dataset.price : null;
      $('servicePrice').textContent = (price ? fen2yuan(price) : '0.00') + ' 元';
    }
    updateConsumeBtn();
  }

  $('serviceSelect').addEventListener('change', onServiceChange);
  $('customAmount').addEventListener('input', updateConsumeBtn);
  $('customAmount').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); $('consumeBtn').click(); }
  });

  function updateConsumeBtn() {
    $('consumeBtn').disabled = !(currentMember && $('serviceSelect').value);
  }

  /* 重置项目选择区 */
  function resetServiceSelect() {
    $('serviceSelect').value = '';
    $('servicePrice').textContent = '0.00 元';
    $('customAmount').value = '';
    $('priceRow').style.display = '';
    $('customAmountItem').style.display = 'none';
    updateConsumeBtn();
  }

  /* ================= 查找会员 ================= */
  function doSearch() {
    var q = $('searchInput').value.trim();
    var box = $('searchResult');
    if (!q) { box.innerHTML = ''; return; }

    box.innerHTML = '<div class="result-empty">查询中...</div>';

    api('/api/members/search?q=' + encodeURIComponent(q))
      .then(renderSearch)
      .catch(function (e) {
        box.innerHTML = '<div class="result-empty">' + esc(e.message) + '</div>';
      });
  }

  function renderSearch(list) {
    var box = $('searchResult');
    list = list || [];
    if (!list.length) {
      box.innerHTML = '<div class="result-empty">没有找到会员，请检查手机号</div>';
      return;
    }
    box.innerHTML = '';
    list.forEach(function (m) {
      var div = document.createElement('div');
      div.className = 'result-item';
      div.innerHTML =
        '<div><div class="r-name">' + esc(m.name) + '</div>' +
        '<div class="r-phone">' + esc(m.phone) + '</div></div>' +
        '<div class="r-balance">' + fen2yuan(m.balance) + ' 元</div>';
      div.addEventListener('click', function () { selectMember(m); });
      box.appendChild(div);
    });
  }

  function selectMember(m) {
    currentMember = m;
    $('mName').textContent = m.name || '-';
    $('mPhone').textContent = m.phone || '-';
    $('mBalance').textContent = fen2yuan(m.balance) + ' 元';
    $('memberCard').style.display = '';
    $('consumeCard').style.display = '';
    $('searchResult').innerHTML = '';
    $('searchInput').value = '';
    resetServiceSelect();
  }

  $('searchBtn').addEventListener('click', doSearch);
  $('searchInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') doSearch();
  });

  /* ================= 扣费 ================= */
  $('consumeBtn').addEventListener('click', function () {
    if (!currentMember) return;

    var sel = $('serviceSelect');
    var code = sel.value;
    if (!code) return;

    var amount;      // 单位：分
    var svcName;
    var payload;

    if (code === CUSTOM_CODE) {
      /* ---- 自定义金额：前端输入单位是「元」 ---- */
      var raw = $('customAmount').value.trim();
      if (raw === '') { toast('请输入自定义金额', 'error'); $('customAmount').focus(); return; }

      var yuan = Number(raw);
      if (!isFinite(yuan)) { toast('请输入正确的金额', 'error'); $('customAmount').focus(); return; }

      amount = Math.round(yuan * 100);
      if (amount <= 0) { toast('自定义金额必须大于 0', 'error'); $('customAmount').focus(); return; }
      if (amount > MAX_CUSTOM_CENTS) {
        toast('单笔自定义金额不能超过 ' + (MAX_CUSTOM_CENTS / 100) + ' 元', 'error');
        $('customAmount').focus();
        return;
      }

      svcName = CUSTOM_NAME;
      payload = { memberId: currentMember.id, serviceCode: CUSTOM_CODE, amount: amount / 100 };
    } else {
      /* ---- 固定项目 ---- */
      var opt = sel.selectedOptions[0];
      amount = Number(opt.dataset.price || 0);
      svcName = opt.dataset.name || '';
      payload = { memberId: currentMember.id, serviceCode: code };
    }

    if (currentMember.balance < amount) {
      showModal('余额不足',
        '会员当前余额：<b>' + fen2yuan(currentMember.balance) + ' 元</b><br>' +
        '本项目需要：<b>' + fen2yuan(amount) + ' 元</b><br>' +
        '余额不足，本次不能扣费，请先充值。',
        null, '知道了', true);
      return;
    }

    showModal('确认扣费',
      '会员：<b>' + esc(currentMember.name) + '</b><br>' +
      '项目：<b>' + esc(svcName) + '</b><br>' +
      '金额：<b>' + fen2yuan(amount) + ' 元</b><br>' +
      '扣费后余额：<b>' + fen2yuan(currentMember.balance - amount) + ' 元</b>',
      function () {
        api('/api/orders', {
          method: 'POST',
          body: JSON.stringify(payload)
        }).then(function (data) {
          toast('扣费成功，剩余 ' + fen2yuan(data.balanceAfter) + ' 元', 'success');
          currentMember.balance = data.balanceAfter;
          $('mBalance').textContent = fen2yuan(data.balanceAfter) + ' 元';
          resetServiceSelect();
        }).catch(function (e) {
          if (String(e.message).indexOf('余额') >= 0) {
            showModal('余额不足', esc(e.message), null, '知道了', true);
          } else {
            toast(e.message, 'error');
          }
        });
      }, '确认扣费');
  });

  /* ================= 新增会员 ================= */
  $('addMemberBtn').addEventListener('click', function () {
    var name = $('addName').value.trim();
    var phone = $('addPhone').value.trim();
    var yuanStr = $('addBalance').value.trim();

    if (!name) { toast('请输入姓名', 'error'); return; }
    if (!/^\d{11}$/.test(phone)) { toast('请输入 11 位手机号', 'error'); return; }

    var yuan = yuanStr === '' ? 0 : Number(yuanStr);
    if (isNaN(yuan) || yuan < 0) { toast('余额格式不正确', 'error'); return; }

    api('/api/members', {
      method: 'POST',
      body: JSON.stringify({ name: name, phone: phone, balance: Math.round(yuan * 100) })
    }).then(function () {
      toast('会员添加成功', 'success');
      $('addName').value = '';
      $('addPhone').value = '';
      $('addBalance').value = '';
      loadMembers(1);
    }).catch(function (e) {
      toast(e.message, 'error');
    });
  });

  /* ================= 批量导入 ================= */
  $('importBtn').addEventListener('click', function () {
    var text = $('importText').value.trim();
    var mode = $('importMode').value;
    if (!text) { toast('请粘贴会员数据', 'error'); return; }

    $('importBtn').disabled = true;

    api('/api/members/import', {
      method: 'POST',
      body: JSON.stringify({ text: text, mode: mode })
    }).then(function (r) {
      var html = '<div class="ok">共 ' + r.total + ' 条 ｜ 新增 ' + r.inserted +
                 ' ｜ 更新 ' + r.updated + ' ｜ 跳过 ' + r.skipped + ' ｜ 失败 ' + r.failed + '</div>';
      if (r.errors && r.errors.length) {
        html += '<div class="err">失败详情：<br>' + r.errors.map(esc).join('<br>') + '</div>';
      }
      $('importResult').innerHTML = html;
      toast('导入完成', 'success');
      loadMembers(1);
    }).catch(function (e) {
      toast(e.message, 'error');
    }).then(function () {
      $('importBtn').disabled = false;
    });
  });

  /* ================= 会员列表 ================= */
  function loadMembers(page) {
    memberPage = page || memberPage;
    var q = $('memberSearch').value.trim();
    var url = '/api/members?page=' + memberPage + '&pageSize=20' + (q ? '&q=' + encodeURIComponent(q) : '');

    api(url).then(function (d) {
      renderMembers(d.list || []);
      memberPages = d.pages || 1;
      $('memberPageInfo').textContent = '第 ' + d.page + ' / ' + d.pages + ' 页（共 ' + d.total + ' 人）';
      $('memberPrevPage').disabled = d.page <= 1;
      $('memberNextPage').disabled = d.page >= d.pages;
    }).catch(function (e) {
      toast(e.message, 'error');
    });
  }

  function renderMembers(list) {
    var tb = $('memberTbody');
    if (!list.length) {
      tb.innerHTML = '<tr class="empty-row"><td colspan="6">暂无会员</td></tr>';
      return;
    }
    tb.innerHTML = '';
    list.forEach(function (m) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' + esc(m.name) + '</td>' +
        '<td>' + esc(m.phone) + '</td>' +
        '<td class="num">' + fen2yuan(m.balance) + ' 元</td>' +
        '<td>' + esc(m.created_at || '') + '</td>' +
        '<td><button class="btn btn-ghost btn-sm js-recharge">充值</button></td>' +
        '<td><button class="btn btn-ghost btn-sm js-del">删除</button></td>';
      tr.querySelector('.js-recharge').addEventListener('click', function () { rechargeMember(m); });
      tr.querySelector('.js-del').addEventListener('click', function () { deleteMember(m); });
      tb.appendChild(tr);
    });
  }

  function rechargeMember(m) {
    showModal('会员充值',
      '会员：<b>' + esc(m.name) + '</b>（' + esc(m.phone) + '）<br>' +
      '当前余额：<b>' + fen2yuan(m.balance) + ' 元</b>' +
      '<div class="form-item" style="margin-top:16px;">' +
        '<label>充值金额（元）</label>' +
        '<input id="rechargeAmount" class="input" type="number" min="0.01" step="0.01" placeholder="例如 200">' +
      '</div>',
      function () {
        var el = document.getElementById('rechargeAmount');
        var yuan = Number(el && el.value);
        if (!yuan || yuan <= 0) { toast('请输入正确的充值金额', 'error'); return; }

        api('/api/members/' + m.id + '/recharge', {
          method: 'POST',
          body: JSON.stringify({ amount: Math.round(yuan * 100) })
        }).then(function (r) {
          toast('充值成功，当前余额 ' + fen2yuan(r.balanceAfter) + ' 元', 'success');
          loadMembers(memberPage);
        }).catch(function (e) {
          toast(e.message, 'error');
        });
      }, '确认充值');
  }

  function deleteMember(m) {
    showModal('确认删除',
      '确定要删除会员 <b>' + esc(m.name) + '</b>（' + esc(m.phone) + '）吗？<br>删除后无法恢复。',
      function () {
        api('/api/members/' + m.id, { method: 'DELETE' })
          .then(function () {
            toast('已删除', 'success');
            loadMembers(memberPage);
          })
          .catch(function (e) { toast(e.message, 'error'); });
      }, '确认删除');
  }

  $('memberSearchBtn').addEventListener('click', function () { loadMembers(1); });
  $('memberSearch').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') loadMembers(1);
  });
  $('memberRefreshBtn').addEventListener('click', function () { loadMembers(memberPage); });
  $('memberPrevPage').addEventListener('click', function () { if (memberPage > 1) loadMembers(memberPage - 1); });
  $('memberNextPage').addEventListener('click', function () { if (memberPage < memberPages) loadMembers(memberPage + 1); });

  /* ================= 流水 ================= */
  function loadSummary() {
    api('/api/orders/summary').then(function (d) {
      $('sumConsume').textContent = fen2yuan(d.consumeTotal) + ' 元';
      $('sumRecharge').textContent = fen2yuan(d.rechargeTotal) + ' 元';
      $('sumCount').textContent = d.consumeCount + ' 笔';
      $('sumBalance').textContent = fen2yuan(d.totalBalance) + ' 元';
    }).catch(function () {});
  }

  function loadOrders(page) {
    orderPage = page || orderPage;
    var q = $('orderSearch').value.trim();
    var url = '/api/orders?page=' + orderPage + '&pageSize=20' + (q ? '&q=' + encodeURIComponent(q) : '');

    api(url).then(function (d) {
      renderOrders(d.list || []);
      orderPages = d.pages || 1;
      $('pageInfo').textContent = '第 ' + d.page + ' / ' + d.pages + ' 页';
      $('prevPage').disabled = d.page <= 1;
      $('nextPage').disabled = d.page >= d.pages;
    }).catch(function (e) {
      toast(e.message, 'error');
    });
  }

  function renderOrders(list) {
    var tb = $('orderTbody');
    if (!list.length) {
      tb.innerHTML = '<tr class="empty-row"><td colspan="8">暂无流水记录</td></tr>';
      return;
    }
    tb.innerHTML = list.map(function (o) {
      var isRecharge = o.record_type === 'recharge';
      var typeText = isRecharge ? '充值' : '消费';
      var typeCls = isRecharge ? 'type-recharge' : 'type-consume';
      var amtText = (isRecharge ? '+' : '-') + fen2yuan(o.amount) + ' 元';

      return '<tr>' +
        '<td>' + esc(o.created_at) + '</td>' +
        '<td>' + esc(o.operator) + '</td>' +
        '<td>' + esc(o.member_name) + '</td>' +
        '<td>' + esc(o.member_phone) + '</td>' +
        '<td>' + esc(o.service_name || '') + '</td>' +
        '<td class="' + typeCls + '">' + typeText + '</td>' +
        '<td class="num ' + typeCls + '">' + amtText + '</td>' +
        '<td class="num">' + fen2yuan(o.balance_after) + ' 元</td>' +
      '</tr>';
    }).join('');
  }

  $('orderSearchBtn').addEventListener('click', function () { loadOrders(1); });
  $('orderSearch').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') loadOrders(1);
  });
  $('orderRefreshBtn').addEventListener('click', function () { loadSummary(); loadOrders(orderPage); });
  $('prevPage').addEventListener('click', function () { if (orderPage > 1) loadOrders(orderPage - 1); });
  $('nextPage').addEventListener('click', function () { if (orderPage < orderPages) loadOrders(orderPage + 1); });

  /* ================= 启动 ================= */
  loadServices();
})();
