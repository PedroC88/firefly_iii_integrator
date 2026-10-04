'use strict';

const EMAIL_RE =
  /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

function normalizeEmail(v) {
  const email = String(v ?? '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_RE.test(email)) throw httpError(400, 'Enter a valid email address.');
  return email;
}

function checkPassword(v) {
  if (typeof v !== 'string' || v.length < 10) throw httpError(400, 'Password must be at least 10 characters.');
  if (v.length > 128) throw httpError(400, 'Password must be at most 128 characters.');
  return v;
}

function optText(v, max, label) {
  if (v == null) return null;
  if (typeof v !== 'string') throw httpError(400, `${label} must be text.`);
  const s = String(v).trim();
  if (!s) return null;
  if (s.length > max) throw httpError(400, `${label} is too long.`);
  return s;
}

function optDate(v) {
  if (v == null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)
    || Number.isNaN(Date.parse(v)) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v
    || v > new Date().toISOString().slice(0, 10)) {
    throw httpError(400, 'Enter a valid date of birth.');
  }
  return v;
}

const GENDERS = ['female', 'male', 'non-binary', 'other', 'prefer-not-to-say'];
function optGender(v) {
  if (v == null || v === '') return null;
  if (!GENDERS.includes(v)) throw httpError(400, 'Invalid gender option.');
  return v;
}

function optUrl(v) {
  if (v == null || String(v).trim() === '') return null;
  let u;
  try { u = new URL(String(v).trim()); } catch { throw httpError(400, 'Enter a valid FireFly III URL.'); }
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password) {
    throw httpError(400, 'FireFly III URL must be http(s) without credentials.');
  }
  return u.toString().replace(/\/+$/, '');
}

const TABS = ['pdfs', 'file'];
function checkTab(v) {
  if (!TABS.includes(v)) throw httpError(400, 'Invalid default tab.');
  return v;
}

module.exports = { EMAIL_RE, httpError, normalizeEmail, checkPassword, optText, optDate, optGender, optUrl, checkTab, GENDERS };
