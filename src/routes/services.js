'use strict';
const express = require('express');
const { getGroups } = require('../services');

const router = express.Router();

router.get('/', function (req, res) {
  res.json({ success: true, data: getGroups() });
});

module.exports = router;
