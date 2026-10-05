'use strict';
const { httpError } = require('./validation');

const REQUEST_TIMEOUT_MS = 15_000;

// FireFly III has no "payment" type: a payment to an expense account is a withdrawal.
const FIREFLY_TYPES = { transfer: 'transfer', payment: 'withdrawal' };

function connectionErrorMessage(err, endpoint) {
  const code = err.cause?.code || err.code;
  let hostname;
  try {
    hostname = new URL(endpoint).hostname;
  } catch {
    return 'The FireFly III endpoint URL is invalid. Check Settings and enter the base URL reachable from the app container.';
  }

  if (['localhost', '127.0.0.1', '::1'].includes(hostname)) {
    return 'The endpoint uses localhost, which refers to the app container. Use host.docker.internal for a host-installed FireFly III, or its service name on a shared Docker network.';
  }

  if (['ENOTFOUND', 'EAI_AGAIN'].includes(code)) {
    return `The app container could not resolve ${hostname}. Check the endpoint hostname and Docker network DNS.`;
  }
  if (code === 'ECONNREFUSED') {
    return `Connection to ${hostname} was refused. Check the endpoint port and confirm FireFly III accepts connections from the app container.`;
  }
  if (['ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'EHOSTUNREACH', 'ENETUNREACH'].includes(code)) {
    return `The app container could not reach ${hostname} (network error: ${code}). Check the endpoint and Docker network/firewall rules.`;
  }
  if (typeof code === 'string' && /CERT|TLS|SSL|VERIFY|SELF_SIGNED/.test(code)) {
    return `TLS certificate verification failed for ${hostname} (${code}). Place the FireFly III certificate (PEM, .crt/.pem/.cer) in the certs folder and post again. TLS verification remains enabled.`;
  }
  if (code === 'ERR_INVALID_URL') {
    return 'The FireFly III endpoint URL is invalid. Check Settings and enter the base URL reachable from the app container.';
  }
  return `Unable to connect to ${hostname} from the app container${code ? ` (${code})` : ''}. Check the endpoint and network access.`;
}

function responseError(body, status) {
  if (body && typeof body === 'object') {
    if (body.errors && Object.keys(body.errors).some((key) => /foreign_(amount|currency)/.test(key))) {
      return 'The destination account uses a different currency than the source account, so FireFly III needs the converted (foreign) amount, which this file format cannot provide. Post it with a destination account in the same currency, or enter this transaction manually in FireFly III.';
    }
    if (typeof body.message === 'string') return body.message;
    if (body.errors && typeof body.errors === 'object') {
      const messages = Object.values(body.errors).flat().filter((v) => typeof v === 'string');
      if (messages.length) return messages.join('; ');
    }
  }
  return `FireFly III returned HTTP ${status}.`;
}

async function postAccountTransactions(accounts, settings, fetchImpl = fetch, logger = null) {
  if (!settings.firefly_url) throw httpError(400, 'Set your FireFly III endpoint in Settings before posting.');
  if (!settings.firefly_api_key) {
    throw httpError(400, 'Set your FireFly III API key in Settings before posting.');
  }

  const endpoint = `${settings.firefly_url.replace(/\/+$/, '')}/api/v1/transactions`;
  const results = [];
  let index = 0;

  for (const account of accounts) {
    for (const transaction of account.transactions) {
      index += 1;
      const result = {
        index,
        sourceAccount: account.source_account,
        destinationAccount: transaction.destination_account,
        transactionType: transaction.transaction_type,
        amount: transaction.amount,
        ...(transaction.foreign_amount === undefined ? {} : {
          foreignAmount: transaction.foreign_amount,
          foreignCurrency: transaction.foreign_currency,
        }),
        currency: account.currency,
        date: transaction.date,
        description: transaction.description,
        status: 'failed',
      };

      try {
        const body = {
          transactions: [{
            type: FIREFLY_TYPES[transaction.transaction_type],
            date: transaction.date,
            amount: String(transaction.amount),
            description: transaction.description,
            source_name: account.source_account,
            destination_name: transaction.destination_account,
            currency_code: account.currency,
            ...(transaction.foreign_amount === undefined ? {} : {
              foreign_amount: String(transaction.foreign_amount),
              foreign_currency_code: transaction.foreign_currency,
            }),
            ...(transaction.notes === undefined ? {} : { notes: transaction.notes }),
          }],
        };
        const response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${settings.firefly_api_key}`,
          },
          body: JSON.stringify(body),
          redirect: 'manual',
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        });
        const responseText = await response.text();
        let responseBody;
        try {
          responseBody = responseText ? JSON.parse(responseText) : null;
        } catch {
          responseBody = responseText;
        }
        if (!response.ok) throw new Error(responseError(responseBody, response.status));

        result.status = 'succeeded';
        result.message = 'Posted successfully.';
        if (responseBody?.data?.id != null) result.fireflyId = responseBody.data.id;
      } catch (err) {
        if (err.name === 'TypeError' || err.name === 'TimeoutError' || err.name === 'AbortError') {
          result.message = err.name === 'TimeoutError' || err.name === 'AbortError'
            ? 'Timed out while contacting FireFly III.'
            : connectionErrorMessage(err, endpoint);
          logger?.error({
            transactionIndex: index,
            errorName: err.name,
            causeCode: err.cause?.code || err.code,
          }, 'Unable to connect to FireFly III');
        } else {
          result.message = err.message || 'Unable to post transaction.';
        }
      }

      results.push(result);
    }
  }
  return results;
}

module.exports = { postAccountTransactions, connectionErrorMessage };
