'use strict';
const { httpError } = require('../lib/validation');
const { parseAndValidate } = require('../lib/account-transactions');
const { postAccountTransactions } = require('../lib/firefly');
const { decrypt } = require('../lib/security');
const { createTrustedFetch } = require('../lib/certs');

module.exports = async function (app) {
  app.post(
    '/api/files/post',
    {
      preHandler: app.requireUser,
      schema: {
        body: {
          type: 'object',
          required: ['format', 'content'],
          properties: { format: { enum: ['json', 'yaml'] }, content: { type: 'string', maxLength: 1000000 } },
        },
      },
    },
    async (req) => {
      const accounts = parseAndValidate(req.body.content, req.body.format);
      let apiKey;
      try {
        apiKey = req.user.firefly_api_key_enc ? decrypt(req.user.firefly_api_key_enc) : null;
      } catch (err) {
        req.log.error({ err, userId: req.user.id }, 'Unable to decrypt FireFly III API key');
        throw httpError(409, 'Unable to read your saved FireFly III API key. Please save it again in Settings.');
      }

      const trusted = createTrustedFetch();
      try {
        return {
          results: await postAccountTransactions(accounts, {
            firefly_url: req.user.firefly_url,
            firefly_api_key_enc: req.user.firefly_api_key_enc,
            firefly_api_key: apiKey,
          }, trusted.fetch, req.log),
        };
      } finally {
        await trusted.close();
      }
    }
  );
};
