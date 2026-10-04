'use strict';
const fs = require('node:fs');

// Reads NAME_FILE (Docker secret path) first, then falls back to NAME.
function readSecret(name) {
  const file = process.env[`${name}_FILE`];
  if (file) return fs.readFileSync(file, 'utf8').trim();
  return process.env[name] ? process.env[name].trim() : '';
}

const dbPassword = readSecret('DB_PASSWORD');
const appSecret = readSecret('APP_SECRET');
if (!dbPassword) throw new Error('DB_PASSWORD / DB_PASSWORD_FILE is required');
if (appSecret.length < 32) throw new Error('APP_SECRET / APP_SECRET_FILE is required (min 32 chars)');

module.exports = {
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  trustProxy: process.env.TRUST_PROXY === 'true',
  cookieSecure: process.env.COOKIE_SECURE !== 'false',
  sessionDays: Number(process.env.SESSION_DAYS || 30),
  appSecret,
  db: {
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'firefly_integrator',
    database: process.env.DB_NAME || 'firefly_integrator',
    password: dbPassword,
    max: Number(process.env.DB_POOL_MAX || 10),
  },
};
