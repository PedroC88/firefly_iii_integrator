'use strict';
const test = require('node:test');
const assert = require('node:assert');
const M = require('../public/transactions-model');

test('parseText handles empty, valid, repairable and broken input', () => {
  assert.deepStrictEqual(M.parseText('  ').value, []);
  assert.strictEqual(M.parseText('[1]').repaired, undefined);
  const r = M.parseText('[{"a":1,},]');
  assert.ok(r.ok && r.repaired);
  assert.strictEqual(M.parseText('[{').ok, false);
});

test('validate flags a valid document as clean', () => {
  const g = M.newGroup();
  g.source_account = 'A'; g.currency = 'USD';
  Object.assign(g.transactions[0], { destination_account: 'B', amount: 5, date: '2026-02-28', description: 'x' });
  assert.deepStrictEqual(M.validate([g]), {});
});

test('validate reports errors per path without throwing on odd shapes', () => {
  const e = M.validate([{ source_account: 3, extra: 1, transactions: [{ amount: '5', date: '2026-02-30', transaction_type: 'x', foreign_amount: 1 }, 7] }, 'nope']);
  assert.ok(e['0.source_account'] && e['0.currency'] && e['0.extra']);
  assert.ok(e['0.transactions.0.amount'] && e['0.transactions.0.date'] && e['0.transactions.0.transaction_type']);
  assert.ok(e['0.transactions.0.foreign_currency'] && e['0.transactions.0.description']);
  assert.ok(e['0.transactions.1'] && e['1']);
  assert.ok(M.validate(null)['']);
});

test('setPath edits, deletes and coerces containers', () => {
  let m = M.setPath({ source_account: 'a' }, '0.source_account', 'b');
  assert.deepStrictEqual(m, [{ source_account: 'b' }]);
  m = M.setPath(m, '0.transactions.0.amount', 4);
  assert.strictEqual(m[0].transactions[0].amount, 4);
  m = M.setPath(m, '0.transactions.0', undefined);
  assert.deepStrictEqual(m[0].transactions, []);
  assert.strictEqual(M.coerceNumber('1.5'), 1.5);
  assert.strictEqual(M.coerceNumber('abc'), 'abc');
  assert.strictEqual(M.coerceNumber(' '), undefined);
});

test('validate: transaction date is optional with an account date and an error without either', () => {
  const g = M.newGroup();
  Object.assign(g, { source_account: 'A', currency: 'USD' });
  Object.assign(g.transactions[0], { destination_account: 'B', amount: 5, description: 'x' });
  assert.ok(M.validate([g])['0.transactions.0.date']);
  g.date = '2026-02-28';
  assert.deepStrictEqual(M.validate([g]), {});
  g.date = '2026-02-30';
  assert.ok(M.validate([g])['0.date']);
});
