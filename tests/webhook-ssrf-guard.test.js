'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { isPrivateIP } = require('../routes/webhooks');

test('blocks IPv6 forms that embed private/internal IPv4 addresses', () => {
  for (const ip of [
    '::ffff:7f00:1',
    '::ffff:a9fe:a9fe',
    '::ffff:127.0.0.1',
    '::127.0.0.1',
    '64:ff9b::7f00:1',
    '2002:a9fe:a9fe::',
    'fe90::1',
    'febf::1',
    '::1',
  ]) {
    assert.equal(isPrivateIP(ip), true, ip);
  }
});

test('allows public IPv6 and public IPv4-mapped addresses', () => {
  for (const ip of ['2606:4700:4700::1111', '::ffff:808:808', '2a00:1450:4001::200e']) {
    assert.equal(isPrivateIP(ip), false, ip);
  }
});
