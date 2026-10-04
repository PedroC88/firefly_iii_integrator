'use strict';
const { pool } = require('../lib/db');
const { hashPassword, verifyPassword, encrypt } = require('../lib/security');
const v = require('../lib/validation');

const publicUser = (u) => ({
  id: u.id,
  email: u.email,
  isAdmin: u.is_admin,
  firstName: u.first_name,
  lastName: u.last_name,
  birthDate: u.birth_date
    ? u.birth_date instanceof Date
      ? u.birth_date.toISOString().slice(0, 10)
      : String(u.birth_date).slice(0, 10)
    : null,
  gender: u.gender,
  fireflyUrl: u.firefly_url,
  hasFireflyApiKey: Boolean(u.firefly_api_key_enc),
  defaultTab: u.default_tab,
});

module.exports = async function (app) {
  app.get('/api/me', { preHandler: app.requireUser }, async (req) => publicUser(req.user));

  app.put('/api/me/profile', { preHandler: app.requireUser }, async (req) => {
    const b = req.body || {};
    const { rows } = await pool.query(
      `UPDATE users SET first_name=$2, last_name=$3, birth_date=$4, gender=$5 WHERE id=$1 RETURNING *`,
      [req.user.id, v.optText(b.firstName, 100, 'First name'), v.optText(b.lastName, 100, 'Last name'), v.optDate(b.birthDate), v.optGender(b.gender)]
    );
    return publicUser(rows[0]);
  });

  app.put('/api/me/settings', { preHandler: app.requireUser }, async (req) => {
    const b = req.body || {};
    const tab = v.checkTab(b.defaultTab);
    const url = v.optUrl(b.fireflyUrl);
    let keyEnc = req.user.firefly_api_key_enc;
    if (b.clearApiKey === true) keyEnc = null;
    else if (typeof b.fireflyApiKey === 'string' && b.fireflyApiKey.trim()) {
      if (b.fireflyApiKey.length > 8192) throw v.httpError(400, 'API key is too long.');
      keyEnc = encrypt(b.fireflyApiKey.trim());
    }
    const { rows } = await pool.query(
      `UPDATE users SET default_tab=$2, firefly_url=$3, firefly_api_key_enc=$4 WHERE id=$1 RETURNING *`,
      [req.user.id, tab, url, keyEnc]
    );
    return publicUser(rows[0]);
  });

  app.put('/api/me/password', { preHandler: app.requireUser, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } }, async (req) => {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !(await verifyPassword(currentPassword, req.user.password_hash))) {
      throw v.httpError(400, 'Current password is incorrect.');
    }
    const hash = await hashPassword(v.checkPassword(newPassword));
    await pool.query('UPDATE users SET password_hash=$2 WHERE id=$1', [req.user.id, hash]);
    // Sign out every other device.
    await pool.query('DELETE FROM sessions WHERE user_id=$1 AND id_hash<>$2', [req.user.id, req.user.sessionHash]);
    return { ok: true };
  });
};

module.exports.publicUser = publicUser;
