'use strict';
const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool(config.db);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  first_name TEXT,
  last_name TEXT,
  birth_date DATE,
  gender TEXT,
  firefly_url TEXT,
  firefly_api_key_enc TEXT,
  default_tab TEXT NOT NULL DEFAULT 'pdfs',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at TIMESTAMPTZ
);
CREATE TABLE IF NOT EXISTS sessions (
  id_hash TEXT PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);
INSERT INTO system_settings(key, value) VALUES ('allowRegistration', 'false') ON CONFLICT DO NOTHING;
`;

async function init(retries = 30) {
  for (let i = 0; ; i++) {
    try {
      await pool.query('SELECT 1');
      break;
    } catch (err) {
      if (i >= retries) throw err;
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock(7001)');
    await client.query(SCHEMA);
    await client.query('SELECT pg_advisory_unlock(7001)');
  } finally {
    client.release();
  }
}

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, init, tx };
