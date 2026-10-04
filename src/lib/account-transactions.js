'use strict';
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { parse } = require('yaml');
const { httpError } = require('./validation');

const accountTransactionsSchema = require('../schemas/account-transactions.schema.json');

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const ajvSchema = { ...accountTransactionsSchema };
delete ajvSchema.$schema;
const validate = ajv.compile(ajvSchema);

function parseAndValidate(content, format) {
  let value;
  try {
    value = format === 'yaml'
      ? parse(content, { uniqueKeys: true, maxAliasCount: 0, prettyErrors: true })
      : JSON.parse(content);
  } catch (err) {
    const kind = format === 'yaml' ? 'YAML parsing failed' : 'JSON parsing failed';
    throw httpError(400, `${kind}: ${err.message}`);
  }

  if (!validate(value)) {
    const details = validate.errors.map((e) => {
      const path = e.instancePath || 'root';
      const reason = e.keyword === 'required' ? `missing required property ${e.params.missingProperty}` : e.message;
      return `${path}: ${reason}`;
    });
    throw httpError(400, `The file does not match AccountTransactionsRequest: ${details.join('; ')}`);
  }

  return value;
}

module.exports = { accountTransactionsSchema, parseAndValidate };
