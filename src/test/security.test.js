'use strict';
process.env.DB_PASSWORD = 'test-only-database-password';
process.env.APP_SECRET = 'test-only-app-secret-that-is-at-least-32-characters';
const test = require('node:test');
const assert = require('node:assert/strict');
const security = require('../lib/security');

test('password hashes verify without storing plaintext', async () => {
  const password = 'a long example password';
  const hash = await security.hashPassword(password);
  assert.notEqual(hash, password);
  assert.equal(await security.verifyPassword(password, hash), true);
  assert.equal(await security.verifyPassword('wrong password', hash), false);
});

test('API key encryption round-trips and uses unique nonces', () => {
  const encrypted1 = security.encrypt('firefly-api-key');
  const encrypted2 = security.encrypt('firefly-api-key');
  assert.notEqual(encrypted1, encrypted2);
  assert.equal(security.decrypt(encrypted1), 'firefly-api-key');
  assert.equal(security.decrypt(encrypted2), 'firefly-api-key');
});

test('session tokens are random and stored as hashes', () => {
  const token = security.newToken();
  assert.equal(token.length >= 40, true);
  assert.notEqual(security.hashToken(token), token);
  assert.equal(security.hashToken(token), security.hashToken(token));
});
