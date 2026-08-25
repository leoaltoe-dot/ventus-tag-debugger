#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKER_DIR="$ROOT/cloudflare-worker"
CONFIG="$ROOT/ai-config.js"

echo
echo "===================================================="
echo " Ventus AI - Publicação automática no Cloudflare"
echo "===================================================="
echo

command -v node >/dev/null || { echo "Node.js não encontrado."; exit 1; }
command -v npm >/dev/null || { echo "npm não encontrado."; exit 1; }
command -v npx >/dev/null || { echo "npx não encontrado."; exit 1; }

cd "$WORKER_DIR"

echo "1/6 Instalando Wrangler..."
npm install

echo "2/6 Verificando Cloudflare..."
if ! npx wrangler whoami >/dev/null 2>&1; then
  npx wrangler login
fi

echo "3/6 Criando Worker..."
FIRST_DEPLOY="$(npx wrangler deploy 2>&1 | tee /dev/stderr)"

echo
read -rsp "Digite sua OPENAI_API_KEY: " OPENAI_API_KEY
echo

if [ -z "$OPENAI_API_KEY" ]; then
  echo "OPENAI_API_KEY não informada."
  exit 1
fi

printf "%s" "$OPENAI_API_KEY" | npx wrangler secret put OPENAI_API_KEY
unset OPENAI_API_KEY

echo "5/6 Publicando versão final..."
FINAL_DEPLOY="$(npx wrangler deploy 2>&1 | tee /dev/stderr)"

ALL_OUTPUT="$FIRST_DEPLOY
$FINAL_DEPLOY"

WORKER_URL="$(printf "%s" "$ALL_OUTPUT" | grep -Eo 'https://[A-Za-z0-9.-]+\.workers\.dev' | tail -1 || true)"

if [ -z "$WORKER_URL" ]; then
  echo "Deploy realizado, mas a URL workers.dev não foi detectada automaticamente."
  exit 0
fi

ANALYZE_URL="${WORKER_URL%/}/analyze"

echo "window.VENTUS_AI_ENDPOINT = \"$ANALYZE_URL\";" > "$CONFIG"

echo
echo "===================================================="
echo " VENTUS AI PUBLICADO"
echo "===================================================="
echo "Endpoint: $ANALYZE_URL"
echo
echo "Recarregue a extensão em chrome://extensions."
