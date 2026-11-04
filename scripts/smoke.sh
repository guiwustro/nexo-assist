#!/usr/bin/env bash
# Smoke test de um ambiente no ar: ping → login da Carla → conversa atual → (opcional) restart → mesmo histórico.
# Carla tem histórico no seed: a persistência fica visível sem escrever nada nem chamar o modelo.
#
#   pnpm smoke http://localhost:3000              # só confere
#   pnpm smoke http://localhost:3000 --restart    # reinicia os containers do perfil full e confere a persistência
set -euo pipefail

BASE="${1:?uso: smoke.sh <base_url> [--restart]}"
BASE="${BASE%/}"
RESTART="${2:-}"
JAR="$(mktemp)"
trap 'rm -f "$JAR"' EXIT

passo() { printf '• %s\n' "$*"; }
falha() { printf '✗ %s\n' "$*" >&2; exit 1; }

# Conta as mensagens da conversa atual (o JSON vem num envelope { data: { messages: [...] } }).
contar() {
  curl -fsS -b "$JAR" "$BASE/api/v1/conversations/current" |
    node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);const m=j.data?.messages??[];if(!m.length)process.exit(3);console.log(`${j.data.conversation.id} ${m.length}`)})'
}

esperar_ping() {
  for _ in $(seq 1 60); do
    curl -fsS "$BASE/api/v1/ping" >/dev/null 2>&1 && return 0
    node -e 'setTimeout(()=>{},1000)'
  done
  return 1
}

passo "ping"
esperar_ping || falha "$BASE/api/v1/ping não respondeu"

passo "login da Carla"
code=$(curl -sS -o /dev/null -w '%{http_code}' -c "$JAR" -H 'content-type: application/json' \
  -d '{"email":"carla.mendes@nexo.com.br","password":"nexo2026"}' "$BASE/api/v1/auth/login")
[ "$code" = 200 ] || falha "login devolveu $code"

passo "conversa atual"
antes="$(contar)" || falha "GET /conversations/current falhou"
echo "  conversa e mensagens: $antes"

if [ "$RESTART" = "--restart" ]; then
  passo "docker compose restart (web e tickets)"
  docker compose --profile full restart web tickets >/dev/null
  esperar_ping || falha "não voltou depois do restart"
  depois="$(contar)" || falha "GET /conversations/current falhou depois do restart"
  echo "  depois do restart: $depois"
  [ "$antes" = "$depois" ] || falha "histórico mudou depois do restart ($antes → $depois)"
fi

echo "✓ smoke ok"
