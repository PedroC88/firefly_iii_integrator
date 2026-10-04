'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../lib/validation');

test('normalizes valid email addresses and rejects malformed addresses', () => {
  assert.equal(v.normalizeEmail(' Alice@example.com '), 'alice@example.com');
  assert.throws(() => v.normalizeEmail('alice@localhost'), { statusCode: 400 });
  assert.throws(() => v.normalizeEmail('not-an-email'), { statusCode: 400 });
});

test('enforces the password length limits', () => {
  assert.equal(v.checkPassword('1234567890'), '1234567890');
  assert.throws(() => v.checkPassword('short'), { statusCode: 400 });
  assert.throws(() => v.checkPassword('x'.repeat(129)), { statusCode: 400 });
});

test('validates optional profile details', () => {
  assert.equal(v.optText('  Ada  ', 100, 'First name'), 'Ada');
  assert.equal(v.optText('', 100, 'First name'), null);
  assert.equal(v.optDate('1990-01-02'), '1990-01-02');
  assert.throws(() => v.optDate('not-a-date'), { statusCode: 400 });
  assert.throws(() => v.optDate('1990-02-31'), { statusCode: 400 });
  assert.throws(() => v.optDate('2999-01-01'), { statusCode: 400 });
  assert.equal(v.optGender('prefer-not-to-say'), 'prefer-not-to-say');
  assert.throws(() => v.optGender('invalid'), { statusCode: 400 });
});

test('validates FireFly endpoint and default tab', () => {
  assert.equal(v.optUrl('https://firefly.example/'), 'https://firefly.example');
  assert.throws(() => v.optUrl('javascript:alert(1)'), { statusCode: 400 });
  assert.throws(() => v.optUrl('https://user:pass@firefly.example'), { statusCode: 400 });
  assert.equal(v.checkTab('file'), 'file');
  assert.throws(() => v.checkTab('admin'), { statusCode: 400 });
});

test('rejects invalid profile lengths', () => {
  assert.throws(() => v.optText('x'.repeat(101), 100, 'First name'), { statusCode: 400 });
});
