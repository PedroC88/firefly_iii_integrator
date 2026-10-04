# Architecture

- **Stack**: Node 26, Fastify, `pg`, no frontend build step (vanilla JS, one CSS file, gzip/brotli via `@fastify/compress`).
- **Passwords**: scrypt (N=32768, r=8, p=1) with per-user salt. Min 10 chars.
- **API keys**: AES-256-GCM, key derived (HKDF) from `app_secret`. Never returned to the browser.
- **Private HTTPS endpoints**: PEM certificates (`.crt`/`.pem`/`.cer`) in `certs/` (mounted read-only at `/certs`) are added to the system trust roots for FireFly III requests (`src/lib/certs.js`); TLS verification stays enabled.
- **CSRF**: SameSite=Lax cookie + required `X-Requested-With: fetch` header on non-GET `/api` calls.
- **Hardening**: Helmet CSP, login/register rate limiting (10/min/IP), read-only container FS, dropped capabilities.

## API (all JSON)

| Method | Path | Access |
|---|---|---|
| GET | `/api/public-config` | public |
| POST | `/api/auth/register`, `/login`, `/logout` | public / session |
| GET | `/api/me` | user |
| PUT | `/api/me/profile`, `/api/me/settings`, `/api/me/password` | user |
| POST | `/api/files/post` `{format: json\|yaml, content}` | user; validates `AccountTransactionsRequest`, converts YAML to JSON, posts each transfer to FireFly III and returns per-transaction results |
| GET/PUT | `/api/admin/settings` | global admin |
| GET/POST | `/api/admin/users` | global admin |
| PATCH/DELETE | `/api/admin/users/:id`, POST `/:id/password` | global admin |

Registration is open when there are no users (to create the first admin) or when `allowRegistration` is true. The last global admin cannot be demoted or deleted.

The account transaction request schema is defined in `src/schemas/account-transactions.schema.json` (loaded by `src/lib/account-transactions.js`). Files must contain an array with at least one source account and at least one transaction per account. Invalid YAML/JSON or schema errors return HTTP 400 before any FireFly III requests are sent. Valid entries are posted individually to `/api/v1/transactions` as FireFly III `transfer` transactions (mapping the source/destination account names and currency code; optional `foreign_amount` + `foreign_currency` — required together — are sent for cross-currency transfers); one failure does not stop subsequent transactions. Results use `succeeded`/`failed` statuses and are displayed in the results dialog. Connection errors are logged without API keys and return guidance for common causes such as localhost, DNS, refused connections, and TLS verification.

## Adding system settings
Add a key to `system_settings` (see `src/lib/db.js`), expose it in `routes/admin.js`, and add a control in `adminSettingsPage` in `src/public/app.js`.
