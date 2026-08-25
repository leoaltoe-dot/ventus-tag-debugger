VENTUS AI BACKEND

Requisitos:
- Node.js 18+ (recomendado Node 20+)
- Uma chave da OpenAI configurada somente no servidor

Windows PowerShell:
  $env:OPENAI_API_KEY="sua-chave"
  node server.js

macOS/Linux:
  export OPENAI_API_KEY="sua-chave"
  node server.js

Opcional:
  OPENAI_MODEL=gpt-5.6
  PORT=8787

Depois:
1. Abra a extensão.
2. Clique na engrenagem.
3. Use http://localhost:8787/analyze
4. Clique em "Testar conexão".
5. Em qualquer tag, clique "Analisar com IA".

IMPORTANTE:
Nunca coloque OPENAI_API_KEY dentro do código da extensão.
