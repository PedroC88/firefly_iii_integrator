# FireFly III Integrator

A lightweight, self-hosted web app that posts transactions to your [FireFly III](https://www.firefly-iii.org/) instance. Paste or build a batch of transactions, review them, and send them in one go. Each transaction is posted independently, so one failure never blocks the rest.

## Features

- **Post file:** paste JSON or YAML in **Expert** mode, or use the form-based **Easy** mode (default). Switching between JSON and YAML converts the content for you.
- **Validation before posting:** input is checked against a schema, and nothing is sent if it's invalid.
- **Transfers and payments:** transfers move money between your own accounts. Payments go to external parties, and the expense account is created automatically if it doesn't exist.
- **Templates:** save the current content as a named template, load it later, and rename, edit or delete it from the **Templates** page.
- **Results dialog:** a per-transaction summary of what succeeded and what failed.
- **Accounts and security:** multi-user with email and password. The first user becomes the global admin, and registration is closed by default. Sessions use `HttpOnly`, `Secure` cookies, and your FireFly III API key is stored encrypted.
- **Light and dark themes.**
- **Hardened image:** minimal Alpine base, no npm in the final image, non-root user, read-only filesystem and all capabilities dropped.

## Quick start

Requires Docker with Compose v2.

```bash
mkdir -p firefly-iii-integrator/secrets firefly-iii-integrator/certs && cd firefly-iii-integrator
chmod 700 secrets
openssl rand -base64 36 | tr -d '\n' > secrets/db_password.txt
openssl rand -base64 48 | tr -d '\n' > secrets/app_secret.txt   # keep safe and stable: it encrypts stored API keys
chmod 644 secrets/*.txt

curl -fsSL https://raw.githubusercontent.com/PedroC88/firefly_iii_integrator/main/compose.yaml -o compose.yaml
docker compose up -d
```

Open `http://localhost:3000`, register (the first account is the admin), then go to **Settings** and save your FireFly III URL and API key.

If you serve it over plain HTTP for local testing, set `COOKIE_SECURE=false`.

## Configuration

| Variable | Default | Purpose |
|---|---|---|
| `APP_PORT` | `3000` | Host port |
| `COOKIE_SECURE` | `true` | Set to `false` only for plain-HTTP testing |
| `TRUST_PROXY` | `false` | Set to `true` behind a reverse proxy |
| `APP_IMAGE` | this image | Override the image tag |

Secrets are read from `./secrets/db_password.txt` and `./secrets/app_secret.txt`. Nothing secret is stored in the image. Custom CA certificates (for a self-signed FireFly III) can be mounted in `./certs`.

## Example input

```json
[
  {
    "source_account": "Checking",
    "currency": "USD",
    "transactions": [
      { "destination_account": "Savings", "transaction_type": "transfer", "amount": 250.00, "date": "2026-10-04", "description": "Monthly savings" },
      { "destination_account": "Electric Company", "transaction_type": "payment", "amount": 82.40, "date": "2026-10-05", "description": "October electricity bill" }
    ]
  }
]
```

## Notes

- Runs as two containers: the app and PostgreSQL. The database is only reachable from the app.
- Post PDFs is a placeholder and isn't implemented yet.
- Source and docs: https://github.com/PedroC88/firefly_iii_integrator
- License: MIT
