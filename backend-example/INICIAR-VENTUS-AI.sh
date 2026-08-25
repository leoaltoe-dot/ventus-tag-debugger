#!/usr/bin/env bash
set -e

echo
echo "============================================"
echo " Ventus AI - Configuração"
echo "============================================"
echo
echo "A chave será usada somente neste processo local."
echo "Ela não será armazenada dentro da extensão."
echo

read -s -p "Digite sua OPENAI_API_KEY: " OPENAI_API_KEY
echo

if [ -z "$OPENAI_API_KEY" ]; then
  echo "ERRO: chave não informada."
  exit 1
fi

export OPENAI_API_KEY
export OPENAI_MODEL="gpt-5.6"
export PORT="8787"

echo
echo "Iniciando Ventus AI..."
echo

node server.js
