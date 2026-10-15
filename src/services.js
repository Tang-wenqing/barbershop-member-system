'use strict';

// 价格单位：分（15 元 = 1500 分）
const SERVICE_GROUPS = [
  {
    category: '洗剪吹',
    items: [
      { code: 'xichui',     name: '洗吹',   price: 1500 },
      { code: 'xijianchui', name: '洗剪吹', price: 2500 }
    ]
  },
  {
    category: '染发',
    items: [
      { code: 'ran_jichu',    name: '基础染发', price: 9800 },
      { code: 'ran_zhiwu',    name: '植物染发', price: 15800 },
      { code: 'ran_paoguang', name: '抛光染',   price: 25800 },
      { code: 'ran_ouleya',   name: '欧莱雅',   price: 35800 }
    ]
  },
  {
    category: '烫发',
    items: [
      { code: 'tang_jichu',    name: '基础烫发', price: 10000 },
      { code: 'tang_wusun',    name: '无损烫',   price: 20800 },
      { code: 'tang_danbai',   name: '蛋白烫',   price: 30800 },
      { code: 'tang_paoguang', name: '抛光烫',   price: 50800 }
    ]
  },
  {
    category: '黑油',
    items: [
      { code: 'heiyou_58',  name: '黑油 58',  price: 5800 },
      { code: 'heiyou_88',  name: '黑油 88',  price: 8800 },
      { code: 'heiyou_128', name: '黑油 128', price: 12800 }
    ]
  },
  {
    category: '营养油',
    items: [
      { code: 'yingyang_58',  name: '营养油 58',  price: 5800 },
      { code: 'yingyang_128', name: '营养油 128', price: 12800 }
    ]
  }
];

const SERVICE_MAP = new Map();
SERVICE_GROUPS.forEach(function (g) {
  g.items.forEach(function (it) {
    SERVICE_MAP.set(it.code, { code: it.code, name: it.name, price: it.price, category: g.category });
  });
});

function getGroups() { return SERVICE_GROUPS; }
function getServiceByCode(code) { return SERVICE_MAP.get(code) || null; }

module.exports = { getGroups, getServiceByCode };
