'use strict';
const fs = require('node:fs');
const path = require('node:path');
const tls = require('node:tls');
const { Agent, fetch: undiciFetch } = require('undici');

const CERTS_DIR = process.env.CERTS_DIR || '/certs';
const CERT_EXT = new Set(['.crt', '.pem', '.cer']);
const PEM_BLOCK = /-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g;

// Returns every PEM certificate found in the certs folder (read on each call, so no restart is needed).
function loadCustomCerts(dir = CERTS_DIR) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  const certs = [];
  for (const name of names.sort()) {
    if (!CERT_EXT.has(path.extname(name).toLowerCase())) continue;
    try {
      certs.push(...(fs.readFileSync(path.join(dir, name), 'utf8').match(PEM_BLOCK) || []));
    } catch {
      // Unreadable files are ignored.
    }
  }
  return certs;
}

// Fetch that trusts the system roots plus any certificates placed in the certs folder.
function createTrustedFetch(dir = CERTS_DIR) {
  const custom = loadCustomCerts(dir);
  if (!custom.length) return { fetch, close: async () => {}, customCount: 0 };
  const agent = new Agent({ connect: { ca: [...tls.rootCertificates, ...custom] } });
  return {
    fetch: (url, options) => undiciFetch(url, { ...options, dispatcher: agent }),
    close: () => agent.close(),
    customCount: custom.length,
  };
}

module.exports = { loadCustomCerts, createTrustedFetch, CERTS_DIR };
