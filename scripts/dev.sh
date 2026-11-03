#!/usr/bin/env bash
# Sobe o Postgres, aplica migrations e seed, e roda web (3000) + chamados (4001).
set -euo pipefail
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env
docker compose up -d --wait db
pnpm db:migrate
pnpm db:seed
exec pnpm dev
