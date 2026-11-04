'use strict';
const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const { parse, Document, visit, isMap } = require('yaml');
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

// Blank line between list items (after the first) so long files stay readable.
function toYaml(value) {
  const doc = new Document(value);
  visit(doc, {
    Seq(_, seq) {
      seq.items.forEach((item, i) => { if (i > 0 && (isMap(item) || item?.items)) item.spaceBefore = true; });
    },
  });
  return doc.toString();
}

// Re-serialises content between formats without schema validation, so drafts can be converted too.
function convertFormat(content, from, to) {
  if (!content.trim() || from === to) return content;
  let value;
  try {
    value = from === 'yaml' ? parse(content, { uniqueKeys: true, maxAliasCount: 0, prettyErrors: true }) : JSON.parse(content);
  } catch (err) {
    throw httpError(400, `${from === 'yaml' ? 'YAML' : 'JSON'} parsing failed: ${err.message}`);
  }
  return to === 'yaml' ? toYaml(value) : JSON.stringify(value, null, 2);
}

module.exports = { accountTransactionsSchema, parseAndValidate, convertFormat };
