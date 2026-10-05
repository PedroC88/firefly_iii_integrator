'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { accountTransactionsSchema, parseAndValidate } = require('../lib/account-transactions');
const { postAccountTransactions, connectionErrorMessage } = require('../lib/firefly');

const json = JSON.stringify([{
  source_account: 'Checking',
  currency: 'USD',
  transactions: [{
    destination_account: 'Savings',
    transaction_type: 'transfer',
    amount: 12.5,
    date: '2026-10-04',
    description: 'Transfer',
    notes: 'Monthly savings',
  }],
}]);

test('keeps the requested AccountTransactionsRequest schema in source', () => {
  assert.equal(accountTransactionsSchema.$schema, 'https://json-schema.org');
  assert.equal(accountTransactionsSchema.title, 'AccountTransactionsRequest');
  assert.equal(accountTransactionsSchema.type, 'array');
  assert.equal(accountTransactionsSchema.items.additionalProperties, false);
  assert.deepEqual(accountTransactionsSchema.items.properties.transactions.items.required, [
    'destination_account', 'transaction_type', 'amount', 'date', 'description',
  ]);
});

test('parses valid JSON and converts valid YAML to the same JSON shape', () => {
  const expected = JSON.parse(json);
  assert.deepEqual(parseAndValidate(json, 'json'), expected);

  const yaml = `- source_account: Checking
  currency: USD
  transactions:
    - destination_account: Savings
      transaction_type: transfer
      amount: 12.5
      date: 2026-10-04
      description: Transfer
      notes: Monthly savings
`;
  assert.deepEqual(parseAndValidate(yaml, 'yaml'), expected);
});

test('rejects malformed JSON and YAML with actionable errors', () => {
  assert.throws(() => parseAndValidate('[', 'json'), /JSON parsing failed/);
  assert.throws(() => parseAndValidate('foo: [', 'yaml'), /YAML parsing failed/);
});

test('rejects invalid schema values including date format and unknown properties', () => {
  assert.throws(() => parseAndValidate('[]', 'json'), /fewer than 1 items/);
  assert.throws(() => parseAndValidate('[{"source_account":"Checking","currency":"USD","transactions":[]}]', 'json'), /fewer than 1 items/);
  assert.throws(
    () => parseAndValidate('[{"source_account":"Checking","currency":"USD","extra":true,"transactions":[{"destination_account":"Savings","transaction_type":"transfer","amount":1,"date":"04-10-2026","description":"x"}]}]', 'json'),
    /additional properties/i
  );
  assert.throws(
    () => parseAndValidate('[{"source_account":"Checking","currency":"USD","transactions":[{"destination_account":"Savings","transaction_type":"transfer","amount":1,"date":"04-10-2026","description":"x"}]}]', 'json'),
    /must match format/
  );
});

test('posts every transaction independently and retains individual failures', async () => {
  const payload = parseAndValidate(json, 'json');
  payload[0].transactions.push({
    destination_account: 'Investments',
    transaction_type: 'payment',
    amount: 4,
    date: '2026-10-04',
    description: 'Second transfer',
  });
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options, body: JSON.parse(options.body) });
    return calls.length === 1
      ? { ok: true, status: 201, text: async () => '{"data":{"id":42}}' }
      : { ok: false, status: 422, text: async () => '{"message":"Invalid destination account"}' };
  };
  const results = await postAccountTransactions(payload, {
    firefly_url: 'https://firefly.example/',
    firefly_api_key: 'api-key',
  }, fakeFetch);

  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, 'https://firefly.example/api/v1/transactions');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer api-key');
  assert.equal(calls[0].body.transactions[0].source_name, 'Checking');
  assert.equal(calls[0].body.transactions[0].destination_name, 'Savings');
  assert.equal(calls[0].body.transactions[0].type, 'transfer');
  assert.equal(calls[1].body.transactions[0].type, 'withdrawal');
  assert.equal(results[0].status, 'succeeded');
  assert.equal(results[0].fireflyId, 42);
  assert.equal(results[1].status, 'failed');
  assert.equal(results[1].message, 'Invalid destination account');
});

test('rejects missing or unsupported transaction_type values', () => {
  const withType = (t) => JSON.stringify([{ source_account: 'Checking', currency: 'USD', transactions: [{ destination_account: 'Savings', ...(t && { transaction_type: t }), amount: 1, date: '2026-10-04', description: 'x' }] }]);
  assert.throws(() => parseAndValidate(withType(null), 'json'), /missing required property transaction_type/);
  assert.throws(() => parseAndValidate(withType('deposit'), 'json'), /allowed values/);
  assert.ok(parseAndValidate(withType('payment'), 'json'));
});

test('requires the user to configure FireFly III settings before posting', async () => {
  await assert.rejects(
    postAccountTransactions(JSON.parse(json), { firefly_url: null, firefly_api_key: null }),
    { statusCode: 400, message: /endpoint in Settings/ }
  );
  await assert.rejects(
    postAccountTransactions(JSON.parse(json), { firefly_url: 'https://firefly.example', firefly_api_key: null }),
    { statusCode: 400, message: /API key in Settings/ }
  );
});

test('explains common app-container FireFly III connectivity failures', () => {
  assert.match(
    connectionErrorMessage(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } }), 'http://fireflyiii:8080'),
    /Connection to fireflyiii was refused/
  );
  assert.match(
    connectionErrorMessage(Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } }), 'http://fireflyiii:8080'),
    /could not resolve fireflyiii/
  );
  assert.match(
    connectionErrorMessage(Object.assign(new TypeError('fetch failed'), { cause: { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' } }), 'https://firefly.example'),
    /TLS certificate verification failed/
  );
  assert.match(
    connectionErrorMessage(new TypeError('fetch failed'), 'http://localhost:8080'),
    /localhost, which refers to the app container/
  );
});

test('logs safe network diagnostics and continues posting after a connection failure', async () => {
  const payload = parseAndValidate(json, 'json');
  payload[0].transactions.push({
    destination_account: 'Investments',
    transaction_type: 'payment',
    amount: 4,
    date: '2026-10-04',
    description: 'Second transfer',
  });
  const logEntries = [];
  let call = 0;
  const fakeFetch = async () => {
    call += 1;
    if (call === 1) throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    return { ok: true, status: 201, text: async () => '{}' };
  };
  const results = await postAccountTransactions(
    payload,
    { firefly_url: 'http://fireflyiii:8080', firefly_api_key: 'must-not-be-logged' },
    fakeFetch,
    { error: (entry, message) => logEntries.push({ entry, message }) }
  );

  assert.equal(results[0].status, 'failed');
  assert.match(results[0].message, /Connection to fireflyiii was refused/);
  assert.equal(results[1].status, 'succeeded');
  assert.equal(logEntries.length, 1);
  assert.deepEqual(logEntries[0].entry, {
    transactionIndex: 1,
    errorName: 'TypeError',
    causeCode: 'ECONNREFUSED',
  });
  assert.equal(JSON.stringify(logEntries).includes('must-not-be-logged'), false);
});

test('loads every PEM certificate found in the certs folder', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { loadCustomCerts } = require('../lib/certs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'certs-'));
  const pem = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----';
  fs.writeFileSync(path.join(dir, 'a.crt'), `${pem}\n${pem}\n`);
  fs.writeFileSync(path.join(dir, 'b.PEM'), pem);
  fs.writeFileSync(path.join(dir, 'notes.txt'), pem);
  assert.equal(loadCustomCerts(dir).length, 3);
  assert.deepEqual(loadCustomCerts(path.join(dir, 'missing')), []);
  fs.rmSync(dir, { recursive: true });
});

test('explains foreign currency errors from FireFly III', async () => {
  const { postAccountTransactions } = require('../lib/firefly');
  const fetchImpl = async () => ({
    ok: false,
    status: 422,
    text: async () => JSON.stringify({
      message: 'The given data was invalid.',
      errors: { 'transactions.0.foreign_amount': ['This field requires a number'] },
    }),
  });
  const [result] = await postAccountTransactions(
    [{ source_account: 'A', currency: 'DOP', transactions: [{ destination_account: 'B USD', transaction_type: 'transfer', amount: 1, date: '2026-01-01', description: 'x' }] }],
    { firefly_url: 'https://ff.test', firefly_api_key: 'k' },
    fetchImpl,
  );
  assert.equal(result.status, 'failed');
  assert.match(result.message, /different currency/);
});

test('foreign amount requires a foreign currency and is sent to FireFly III', async () => {
  const { parseAndValidate } = require('../lib/account-transactions');
  const { postAccountTransactions } = require('../lib/firefly');
  const tx = { destination_account: 'B USD', transaction_type: 'transfer', amount: 100, foreign_amount: 1.7, date: '2026-01-01', description: 'x' };
  const doc = (t) => JSON.stringify([{ source_account: 'A', currency: 'DOP', transactions: [t] }]);
  assert.throws(() => parseAndValidate(doc(tx), 'json'));
  const accounts = parseAndValidate(doc({ ...tx, foreign_currency: 'USD' }), 'json');
  let sent;
  const fetchImpl = async (_u, o) => { sent = JSON.parse(o.body).transactions[0]; return { ok: true, status: 200, text: async () => '{}' }; };
  const [result] = await postAccountTransactions(accounts, { firefly_url: 'https://ff.test', firefly_api_key: 'k' }, fetchImpl);
  assert.equal(result.status, 'succeeded');
  assert.equal(sent.foreign_amount, '1.7');
  assert.equal(sent.foreign_currency_code, 'USD');
});
