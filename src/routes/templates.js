'use strict';
const { pool } = require('../lib/db');
const { httpError } = require('../lib/validation');

const toDto = (r, withContent) => ({
  id: String(r.id),
  name: r.name,
  format: r.format,
  updatedAt: r.updated_at,
  ...(withContent ? { content: r.content } : {}),
});

function readBody(b) {
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name) throw httpError(400, 'Template name is required.');
  if (name.length > 100) throw httpError(400, 'Template name is too long.');
  if (!['json', 'yaml'].includes(b.format)) throw httpError(400, 'Invalid format.');
  if (typeof b.content !== 'string' || !b.content.trim()) throw httpError(400, 'Template content cannot be empty.');
  if (b.content.length > 1000000) throw httpError(400, 'Template content is too large.');
  return { name, format: b.format, content: b.content };
}

async function save(sql, params) {
  try {
    return await pool.query(sql, params);
  } catch (err) {
    if (err.code === '23505') throw httpError(409, 'You already have a template with that name.');
    throw err;
  }
}

const idParams = { type: 'object', properties: { id: { type: 'string', pattern: '^[0-9]{1,18}$' } } };

module.exports = async function (app) {
  app.get('/api/templates', { preHandler: app.requireUser }, async (req) => {
    const { rows } = await pool.query('SELECT id, name, format, updated_at FROM templates WHERE user_id=$1 ORDER BY lower(name)', [req.user.id]);
    return rows.map((r) => toDto(r, false));
  });

  app.get('/api/templates/:id', { preHandler: app.requireUser, schema: { params: idParams } }, async (req) => {
    const { rows } = await pool.query('SELECT * FROM templates WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!rows[0]) throw httpError(404, 'Template not found.');
    return toDto(rows[0], true);
  });

  app.post('/api/templates', { preHandler: app.requireUser }, async (req, reply) => {
    const t = readBody(req.body || {});
    const { rows } = await save('INSERT INTO templates(user_id, name, format, content) VALUES ($1,$2,$3,$4) RETURNING *', [req.user.id, t.name, t.format, t.content]);
    return reply.code(201).send(toDto(rows[0], true));
  });

  app.put('/api/templates/:id', { preHandler: app.requireUser, schema: { params: idParams } }, async (req) => {
    const t = readBody(req.body || {});
    const { rows } = await save(
      'UPDATE templates SET name=$3, format=$4, content=$5, updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING *',
      [req.params.id, req.user.id, t.name, t.format, t.content]
    );
    if (!rows[0]) throw httpError(404, 'Template not found.');
    return toDto(rows[0], true);
  });

  app.delete('/api/templates/:id', { preHandler: app.requireUser, schema: { params: idParams } }, async (req) => {
    const { rowCount } = await pool.query('DELETE FROM templates WHERE id=$1 AND user_id=$2', [req.params.id, req.user.id]);
    if (!rowCount) throw httpError(404, 'Template not found.');
    return { ok: true };
  });
};
