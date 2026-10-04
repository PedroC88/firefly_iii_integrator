'use strict';
const path = require('node:path');
const Fastify = require('fastify');
const config = require('./lib/config');
const db = require('./lib/db');
const sessions = require('./lib/sessions');

async function main() {
  await db.init();
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL || 'info', redact: ['req.headers.cookie'] }, trustProxy: config.trustProxy, bodyLimit: 2 * 1024 * 1024 });

  await app.register(require('@fastify/helmet'), {
    contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], styleSrc: ["'self'"], scriptSrc: ["'self'"], imgSrc: ["'self'", 'data:'], frameAncestors: ["'none'"], formAction: ["'self'"], upgradeInsecureRequests: config.cookieSecure ? [] : null } },
    hsts: config.cookieSecure,
  });
  await app.register(require('@fastify/compress'));
  await app.register(require('@fastify/cookie'));
  await app.register(require('@fastify/rate-limit'), { global: false });

  // CSRF: SameSite=Lax cookies plus a custom header that cross-site forms cannot send.
  app.addHook('onRequest', async (req, reply) => {
    if (req.url.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers['x-requested-with'] !== 'fetch') {
      return reply.code(403).send({ error: 'Forbidden.' });
    }
    if (req.url.startsWith('/api/')) reply.header('Cache-Control', 'no-store');
  });

  app.decorateRequest('user', null);
  app.decorate('requireUser', async (req, reply) => {
    req.user = await sessions.loadUser(req, reply);
    if (!req.user) return reply.code(401).send({ error: 'Authentication required.' });
  });
  app.decorate('requireAdmin', async (req, reply) => {
    await app.requireUser(req, reply);
    if (reply.sent) return;
    if (!req.user.is_admin) return reply.code(403).send({ error: 'Global admin access required.' });
  });

  app.setErrorHandler((err, req, reply) => {
    const status = err.statusCode || (err.validation ? 400 : 500);
    const expose = status < 500 || status === 501;
    if (!expose) req.log.error(err);
    reply.code(status).send({ error: !expose ? 'Internal server error.' : err.validation ? 'Invalid request.' : err.message });
  });

  app.get('/api/health', async () => ({ ok: true }));
  await app.register(require('./routes/auth'));
  await app.register(require('./routes/account'));
  await app.register(require('./routes/admin'));
  await app.register(require('./routes/files'));

  await app.register(require('@fastify/static'), { root: path.join(__dirname, 'public'), maxAge: '1h', immutable: false });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'Not found.' });
    return reply.sendFile('index.html');
  });
  const timer = setInterval(
    () => sessions.purgeExpired().catch((err) => app.log.error({ err }, 'Failed to purge expired sessions')),
    3600_000
  );
  timer.unref();
  const stop = async () => { clearInterval(timer); await app.close(); await db.pool.end(); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);

  await app.listen({ port: config.port, host: config.host });
}

main().catch((err) => { console.error(err); process.exit(1); });
