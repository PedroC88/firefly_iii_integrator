'use strict';
const { pool, tx } = require('../lib/db');
const { hashPassword, verifyPassword, burnPasswordCheck } = require('../lib/security');
const { normalizeEmail, checkPassword, httpError } = require('../lib/validation');
const { createSession, destroySession } = require('../lib/sessions');
const { registrationOpen } = require('../lib/settings');

const credentialsSchema = {
  body: {
    type: 'object',
    required: ['email', 'password'],
    properties: { email: { type: 'string', maxLength: 320 }, password: { type: 'string', maxLength: 128 } },
  },
};
const limit = { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } };

module.exports = async function (app) {
  app.get('/api/public-config', async () => ({ registrationOpen: await registrationOpen() }));

  app.post('/api/auth/register', { schema: credentialsSchema, ...limit }, async (req, reply) => {
    const email = normalizeEmail(req.body.email);
    const password = checkPassword(req.body.password);
    const hash = await hashPassword(password);
    const user = await tx(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(7002)');
      const count = Number((await db.query('SELECT count(*) FROM users')).rows[0].count);
      if (count > 0 && !(await registrationOpen(db))) throw httpError(403, 'Registration is currently disabled.');
      const dup = await db.query('SELECT 1 FROM users WHERE email=$1', [email]);
      if (dup.rowCount) throw httpError(409, 'That email is already registered.');
      const { rows } = await db.query(
        `INSERT INTO users(email, password_hash, is_admin, last_login_at) VALUES ($1,$2,$3, now()) RETURNING id`,
        [email, hash, count === 0]
      );
      await createSession(reply, rows[0].id, db);
      return rows[0];
    });
    reply.code(201);
    return { id: user.id };
  });

  app.post('/api/auth/login', { schema: credentialsSchema, ...limit }, async (req, reply) => {
    const email = normalizeEmail(req.body.email);
    const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE email=$1', [email]);
    const user = rows[0];
    const ok = user ? await verifyPassword(req.body.password, user.password_hash) : (await burnPasswordCheck(req.body.password), false);
    if (!ok) throw httpError(401, 'Invalid email or password.');
    await pool.query('UPDATE users SET last_login_at=now() WHERE id=$1', [user.id]);
    await createSession(reply, user.id);
    return { id: user.id };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });
};
