# FireFly III integrator

A fast, responsive Node.js web app (light/dark themes) that will post data to a [FireFly III](https://www.firefly-iii.org/) instance. Runs as two containers: the app and PostgreSQL.

## Features

- Email + password registration and login (email format is regex-checked; there is no email ownership verification). OAuth is planned, not implemented.
- The first account created becomes the **global admin**.
- Global admins manage users and system settings (currently: *allow new registration*, off by default).
- Every user has Settings (password, FireFly III endpoint + API key, default tab) and an optional Profile.
- Tabs: **Post PDFs** (placeholder) and **Post file** (JSON/YAML editor; YAML is converted to JSON, validated against the account-transactions schema in `src/schemas/account-transactions.schema.json`, then each transaction is posted separately to the configured FireFly III endpoint). A results dialog summarizes successes and failures; invalid input is rejected before posting.
- Global notifications: success (green), warning (yellow), error (red), info (blue).
- Sessions: random 256-bit token in an `HttpOnly`, `Secure`, `SameSite=Lax` (`__Host-` prefixed) cookie; only a SHA-256 hash is stored server-side, with a sliding 30-day expiry.

## Installation

Requires Docker with Compose v2. **You must generate the secrets yourself** before the first start; the stack refuses to start without them.

```bash
mkdir -p secrets && chmod 700 secrets
# database password
openssl rand -base64 36 | tr -d '\n' > secrets/db_password.txt
# application secret (also encrypts stored FireFly III API keys; keep it safe and stable)
openssl rand -base64 48 | tr -d '\n' > secrets/app_secret.txt
chmod 644 secrets/*.txt   # must be readable by the non-root container users

docker compose up -d --build
```

Open <http://localhost:3000> and register: the first account is the admin.

Over plain HTTP (local testing) run with `COOKIE_SECURE=false docker compose up -d`. In production, put the app behind an HTTPS reverse proxy and set `TRUST_PROXY=true`.

Passwords are passed as Docker secrets (files mounted at `/run/secrets`), never as environment values, and `secrets/` is git-ignored. The database sits on an internal network with no published port.

### Connecting to FireFly III

The endpoint saved in user Settings must be reachable **from inside the app container**. Enter only the base URL; the app appends `/api/v1/transactions`.

- If FireFly III runs directly on the Docker host, use `http://host.docker.internal:PORT` (the Compose service maps this name to the host gateway).
- If FireFly III runs in another Docker Compose project, `localhost` will not work. Attach the app and FireFly III services to a shared Docker network, then use FireFly III's service/container DNS name and its container port (for example `http://fireflyiii:8080`).
- For an HTTPS instance with a private or self-signed certificate, copy its certificate (or CA certificate) in PEM format (`.crt`, `.pem` or `.cer`) into the `certs/` folder. Nothing else is needed: every certificate in that folder is trusted automatically on the next post (no restart or rebuild). The folder is mounted read-only at `/certs`, TLS verification stays enabled, and the host browser's trust store is not shared with Docker. The certificate must list the IP address or DNS name used in your saved endpoint as a subject alternative name.

> Changing `db_password.txt` after the database was first initialised does not change the database user's password; change it inside PostgreSQL too. Losing/changing `app_secret.txt` makes stored API keys unreadable (users must re-enter them).

## Layout

```
src/        Node app (Fastify, API in routes/, static frontend in public/)
docs/       Documentation
Dockerfile, compose.yaml
```

See [docs/architecture.md](docs/architecture.md).
