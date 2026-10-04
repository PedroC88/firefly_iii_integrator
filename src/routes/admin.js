'use strict';
const { pool, tx } = require('../lib/db');
const { hashPassword } = require('../lib/security');
const { getSettings } = require('../lib/settings');
const v = require('../lib/validation');

const row = (u) => ({ id: u.id, email: u.email, isAdmin: u.is_admin, createdAt: u.created_at, lastLoginAt: u.last_login_at });
const idParam = { params: { type: 'object', properties: { id: { type: 'integer', minimum: 1 } } } };

module.exports = async function (app) {
  app.register(async (admin) => {
    admin.addHook('preHandler', app.requireAdmin);

    admin.get('/api/admin/settings', async () => {
      const s = await getSettings();
      return { allowRegistration: s.allowRegistration === true };
    });

    admin.put('/api/admin/settings', async (req) => {
      const { allowRegistration } = req.body || {};
      if (typeof allowRegistration !== 'boolean') throw v.httpError(400, 'allowRegistration must be a boolean.');
      await pool.query(`INSERT INTO system_settings(key,value) VALUES ('allowRegistration',$1) ON CONFLICT (key) DO UPDATE SET value=$1`, [JSON.stringify(allowRegistration)]);
      return { allowRegistration };
    });

    admin.get('/api/admin/users', async () => {
      const { rows } = await pool.query('SELECT id,email,is_admin,created_at,last_login_at FROM users ORDER BY id');
      return rows.map(row);
    });

    admin.post('/api/admin/users', async (req, reply) => {
      const email = v.normalizeEmail(req.body?.email);
      const hash = await hashPassword(v.checkPassword(req.body?.password));
      try {
        const { rows } = await pool.query(
          'INSERT INTO users(email,password_hash,is_admin) VALUES ($1,$2,$3) RETURNING id,email,is_admin,created_at,last_login_at',
          [email, hash, req.body?.isAdmin === true]
        );
        reply.code(201);
        return row(rows[0]);
      } catch (e) {
        if (e.code === '23505') throw v.httpError(409, 'That email is already registered.');
        throw e;
      }
    });

    admin.patch('/api/admin/users/:id', idParam, async (req) => {
      if (typeof req.body?.isAdmin !== 'boolean') throw v.httpError(400, 'isAdmin must be a boolean.');
      return tx(async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(7003)');
        if (!req.body.isAdmin) {
          const { rows } = await db.query('SELECT count(*) FROM users WHERE is_admin AND id<>$1', [req.params.id]);
          if (Number(rows[0].count) === 0) throw v.httpError(400, 'At least one global admin is required.');
        }
        const { rows } = await db.query('UPDATE users SET is_admin=$2 WHERE id=$1 RETURNING id,email,is_admin,created_at,last_login_at', [req.params.id, req.body.isAdmin]);
        if (!rows[0]) throw v.httpError(404, 'User not found.');
        return row(rows[0]);
      });
    });

    admin.post('/api/admin/users/:id/password', idParam, async (req) => {
      const hash = await hashPassword(v.checkPassword(req.body?.password));
      const r = await pool.query('UPDATE users SET password_hash=$2 WHERE id=$1', [req.params.id, hash]);
      if (!r.rowCount) throw v.httpError(404, 'User not found.');
      await pool.query('DELETE FROM sessions WHERE user_id=$1', [req.params.id]);
      return { ok: true };
    });

    admin.delete('/api/admin/users/:id', idParam, async (req) => {
      await tx(async (db) => {
        await db.query('SELECT pg_advisory_xact_lock(7003)');
        const { rows } = await db.query('SELECT count(*) FROM users WHERE is_admin AND id<>$1', [req.params.id]);
        const target = await db.query('SELECT is_admin FROM users WHERE id=$1', [req.params.id]);
        if (!target.rowCount) throw v.httpError(404, 'User not found.');
        if (target.rows[0].is_admin && Number(rows[0].count) === 0) throw v.httpError(400, 'At least one global admin is required.');
        await db.query('DELETE FROM users WHERE id=$1', [req.params.id]);
      });
      return { ok: true };
    });
  });
};
