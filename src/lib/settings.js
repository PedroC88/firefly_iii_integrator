'use strict';
const { pool } = require('./db');

async function getSettings(db = pool) {
  const { rows } = await db.query('SELECT key, value FROM system_settings');
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

// Registration is always open for the very first user so an admin can be created.
async function registrationOpen(db = pool) {
  const users = Number((await db.query('SELECT count(*) FROM users')).rows[0].count);
  if (users === 0) return true;
  return (await getSettings(db)).allowRegistration === true;
}

module.exports = { getSettings, registrationOpen };
