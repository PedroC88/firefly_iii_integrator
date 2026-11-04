#!/usr/bin/env bash
# Starts (or reuses) a local Postgres on 127.0.0.1:5432 for F5 debugging, using ./secrets/db_password.txt.
set -euo pipefail
cd "$(dirname "$0")/.."
NAME=firefly-integrator-dev-db
if [ "$(docker inspect -f '{{.State.Running}}' "$NAME" 2>/dev/null || true)" != "true" ]; then
  if docker inspect "$NAME" >/dev/null 2>&1; then
    docker start "$NAME" >/dev/null
  else
    docker run -d --name "$NAME" \
      -e POSTGRES_USER=firefly_integrator -e POSTGRES_DB=firefly_integrator \
      -e POSTGRES_PASSWORD="$(tr -d '\r\n' < secrets/db_password.txt)" \
      -p 127.0.0.1:5432:5432 -v firefly-integrator-dev-db:/var/lib/postgresql/data \
      postgres:16-alpine >/dev/null
  fi
fi
until docker exec "$NAME" pg_isready -U firefly_integrator -d firefly_integrator >/dev/null 2>&1; do sleep 1; done
echo "Dev database ready."
