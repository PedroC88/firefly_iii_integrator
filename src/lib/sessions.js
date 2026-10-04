'use strict';
const config = require('./config');
const { pool } = require('./db');
const { newToken, hashToken } = require('./security');

const COOKIE = config.cookieSecure ? '__Host-ffi_sid' : 'ffi_sid';
const maxAgeSec = config.sessionDays * 86400;
const cookieOpts = () => ({
  httpOnly: true,
  secure: config.cookieSecure,
  sameSite: 'lax',
  path: '/',
  maxAge: maxAgeSec,
});

async function createSession(reply, userId, db = pool) {
  const token = newToken();
  await db.query(
    `INSERT INTO sessions(id_hash, user_id, expires_at) VALUES ($1,$2, now() + make_interval(secs => $3))`,
    [hashToken(token), userId, maxAgeSec]
  );
  reply.setCookie(COOKIE, token, cookieOpts());
}

async function destroySession(request, reply) {
  const token = request.cookies[COOKIE];
  if (token) await pool.query('DELETE FROM sessions WHERE id_hash=$1', [hashToken(token)]);
  reply.clearCookie(COOKIE, { path: '/', secure: config.cookieSecure, httpOnly: true, sameSite: 'lax' });
}

// Loads the user for the session cookie and slides the expiry (at most hourly).
async function loadUser(request, reply) {
  const token = request.cookies[COOKIE];
  if (!token) return null;
  const idHash = hashToken(token);
  const { rows } = await pool.query(
    `SELECT u.*, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.id_hash=$1 AND s.expires_at > now()`,
    [idHash]
  );
  const user = rows[0];
  if (!user) {
    reply.clearCookie(COOKIE, { path: '/', secure: config.cookieSecure, httpOnly: true, sameSite: 'lax' });
    return null;
  }
  if (user.expires_at.getTime() - Date.now() < (maxAgeSec - 3600) * 1000) {
    await pool.query(`UPDATE sessions SET expires_at = now() + make_interval(secs => $2) WHERE id_hash=$1`, [idHash, maxAgeSec]);
    reply.setCookie(COOKIE, token, cookieOpts());
  }
  user.sessionHash = idHash;
  return user;
}

const purgeExpired = () => pool.query('DELETE FROM sessions WHERE expires_at < now()');

module.exports = { createSession, destroySession, loadUser, purgeExpired };
