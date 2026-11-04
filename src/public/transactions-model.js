'use strict';
// Pure helpers for the "Post file" UI mode. Works in the browser (window.TxModel) and in node tests.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TxModel = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  const TX_TYPES = ['transfer', 'payment'];
  const GROUP_KEYS = ['source_account', 'date', 'currency', 'transactions'];
  const TX_FIELDS = [
    { key: 'destination_account', label: 'Destination account', kind: 'text', required: true },
    { key: 'transaction_type', label: 'Type', kind: 'select', required: true, options: TX_TYPES },
    { key: 'amount', label: 'Amount', kind: 'number', required: true },
    { key: 'date', label: 'Date (defaults to the account date)', kind: 'date' },
    { key: 'description', label: 'Description', kind: 'text', required: true },
    { key: 'foreign_amount', label: 'Foreign amount', kind: 'number' },
    { key: 'foreign_currency', label: 'Foreign currency', kind: 'text' },
    { key: 'notes', label: 'Notes', kind: 'text' },
  ];
  const TX_KEYS = TX_FIELDS.map((f) => f.key);

  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

  function validDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    const d = new Date(`${s}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  // Strict parse first; then a lenient retry (comments / trailing commas). ok=false means the text is unusable.
  function parseText(text) {
    if (!text.trim()) return { ok: true, value: [], empty: true };
    try { return { ok: true, value: JSON.parse(text) }; } catch (err) {
      const relaxed = text.replace(/\/\/[^\n"]*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/,(\s*[}\]])/g, '$1');
      try { return { ok: true, value: JSON.parse(relaxed), repaired: true, message: err.message }; } catch { /* fall through */ }
      return { ok: false, message: err.message };
    }
  }

  // Always yields an array of groups so the UI can render something for any parsed value.
  function groupsOf(value) {
    if (Array.isArray(value)) return value;
    if (isObj(value)) return [value];
    return [];
  }

  // Returns { 'path.a.b': message }. Paths use dotted keys/indexes; '' is the root.
  function validate(value) {
    const errs = {};
    const add = (p, m) => { if (!errs[p]) errs[p] = m; };
    if (!Array.isArray(value)) add('', isObj(value) ? 'Root must be a list of accounts; it will be wrapped on the next edit.' : 'Root must be a list of accounts.');
    const groups = groupsOf(value);
    if (!groups.length) add('', 'Add at least one account.');
    groups.forEach((g, i) => {
      if (!isObj(g)) { add(String(i), 'Must be an object.'); return; }
      ['source_account', 'currency'].forEach((k) => {
        if (g[k] === undefined || g[k] === '') add(`${i}.${k}`, 'Required.');
        else if (typeof g[k] !== 'string') add(`${i}.${k}`, 'Must be text.');
      });
      const groupDate = g.date !== undefined && g.date !== '';
      if (g.date === '') add(`${i}.date`, 'Use a real date as YYYY-MM-DD.');
      if (groupDate) {
        if (typeof g.date !== 'string') add(`${i}.date`, 'Must be text.');
        else if (!validDate(g.date)) add(`${i}.date`, 'Use a real date as YYYY-MM-DD.');
      }
      Object.keys(g).filter((k) => !GROUP_KEYS.includes(k)).forEach((k) => add(`${i}.${k}`, 'Unknown property.'));
      const txs = g.transactions;
      if (!Array.isArray(txs)) { add(`${i}.transactions`, txs === undefined ? 'Required.' : 'Must be a list.'); return; }
      if (!txs.length) add(`${i}.transactions`, 'Add at least one transaction.');
      txs.forEach((t, j) => {
        const p = `${i}.transactions.${j}`;
        if (!isObj(t)) { add(p, 'Must be an object.'); return; }
        TX_FIELDS.forEach((f) => {
          const v = t[f.key];
          const fp = `${p}.${f.key}`;
          if (v === undefined || v === '') { if (f.required) add(fp, 'Required.'); return; }
          if (f.kind === 'number') { if (typeof v !== 'number' || !Number.isFinite(v)) add(fp, 'Must be a number.'); }
          else if (typeof v !== 'string') add(fp, 'Must be text.');
          else if (f.kind === 'select' && !f.options.includes(v)) add(fp, `Must be one of: ${f.options.join(', ')}.`);
          else if (f.kind === 'date' && !validDate(v)) add(fp, 'Use a real date as YYYY-MM-DD.');
        });
        if (t.date === '') add(`${p}.date`, 'Use a real date as YYYY-MM-DD, or remove it to use the account date.');
        else if (!groupDate && t.date === undefined) add(`${p}.date`, 'Required: set a date here or on the account.');
        const hasFA = t.foreign_amount !== undefined && t.foreign_amount !== '';
        const hasFC = t.foreign_currency !== undefined && t.foreign_currency !== '';
        if (hasFA && !hasFC) add(`${p}.foreign_currency`, 'Required when a foreign amount is set.');
        if (hasFC && !hasFA) add(`${p}.foreign_amount`, 'Required when a foreign currency is set.');
        Object.keys(t).filter((k) => !TX_KEYS.includes(k)).forEach((k) => add(`${p}.${k}`, 'Unknown property.'));
      });
    });
    return errs;
  }

  // Sets (or deletes when value===undefined) a nested value, coercing wrong-typed containers. Returns the new root.
  function setPath(root, path, value) {
    const keys = path.split('.').filter((k) => k !== '').map((k) => (/^\d+$/.test(k) ? Number(k) : k));
    let node = Array.isArray(root) ? root : groupsOf(root);
    const top = node;
    keys.forEach((k, idx) => {
      const last = idx === keys.length - 1;
      if (last) {
        if (value === undefined) { if (Array.isArray(node)) node.splice(k, 1); else delete node[k]; } else node[k] = value;
        return;
      }
      const wantArray = typeof keys[idx + 1] === 'number';
      const cur = node[k];
      if (wantArray ? !Array.isArray(cur) : !isObj(cur)) node[k] = wantArray ? [] : {};
      node = node[k];
    });
    return top;
  }

  const newTransaction = () => ({ destination_account: '', transaction_type: 'payment', amount: 0, description: '' });
  const newGroup = () => ({ source_account: '', currency: '', transactions: [newTransaction()] });

  // Text typed in a number box: a real number when it parses, else the raw string (flagged by validate).
  function coerceNumber(text) {
    const t = text.trim();
    if (t === '') return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : text;
  }

  return { TX_FIELDS, TX_TYPES, parseText, groupsOf, validate, setPath, newGroup, newTransaction, coerceNumber, isObj };
}));
