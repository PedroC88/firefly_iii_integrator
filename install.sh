#!/bin/sh
# FireFly III integrator installer.
#   curl -fsSL https://raw.githubusercontent.com/OWNER/REPO/main/install.sh | sh
# Optional variables: INSTALL_DIR (default ./firefly-iii-integrator), APP_PORT, COMPOSE_URL, NO_START=1
set -eu

REPO_RAW="${REPO_RAW:-https://raw.githubusercontent.com/PedroC88/firefly_iii_manual_transactions/main}"
COMPOSE_URL="${COMPOSE_URL:-$REPO_RAW/compose.yaml}"
INSTALL_DIR="${INSTALL_DIR:-firefly-iii-integrator}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "Error: '$1' is required." >&2; exit 1; }; }
need docker
need openssl
need curl
docker compose version >/dev/null 2>&1 || { echo "Error: Docker Compose v2 is required." >&2; exit 1; }

mkdir -p "$INSTALL_DIR/secrets" "$INSTALL_DIR/certs"
cd "$INSTALL_DIR"
chmod 700 secrets

# Never overwrite existing secrets: changing them would lock you out of the database and stored API keys.
if [ ! -f secrets/db_password.txt ]; then
  openssl rand -base64 36 | tr -d '\n' > secrets/db_password.txt
  echo "Generated secrets/db_password.txt"
fi
if [ ! -f secrets/app_secret.txt ]; then
  openssl rand -base64 48 | tr -d '\n' > secrets/app_secret.txt
  echo "Generated secrets/app_secret.txt"
fi
chmod 644 secrets/*.txt # must be readable by the non-root container users

curl -fsSL "$COMPOSE_URL" -o compose.yaml
echo "Downloaded compose.yaml"

if [ "${NO_START:-0}" = "1" ]; then
  echo "Skipping start. Run: cd $INSTALL_DIR && docker compose up -d"
  exit 0
fi

docker compose pull
docker compose up -d

echo
echo "Installed in $(pwd). Open http://localhost:${APP_PORT:-3000} and register: the first account becomes the admin."
echo "Back up the secrets/ folder; for HTTPS, put a reverse proxy in front and set TRUST_PROXY=true (see README)."
echo "Over plain HTTP only (local testing), start with: COOKIE_SECURE=false docker compose up -d"
