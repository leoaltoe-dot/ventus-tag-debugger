$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$WorkerDir = Join-Path $Root "cloudflare-worker"
$ConfigFile = Join-Path $Root "ai-config.js"

Write-Host ""
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Ventus AI - Publicação automática no Cloudflare" -ForegroundColor Cyan
Write-Host "====================================================" -ForegroundColor Cyan
Write-Host ""

function Require-Command($Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        Write-Host "ERRO: '$Name' não encontrado." -ForegroundColor Red
        Write-Host "Instale Node.js antes de continuar."
        exit 1
    }
}

Require-Command "node"
Require-Command "npm"
Require-Command "npx"

Push-Location $WorkerDir

try {
    Write-Host "1/6 Instalando Wrangler..." -ForegroundColor Yellow
    npm install

    Write-Host ""
    Write-Host "2/6 Verificando autenticação Cloudflare..." -ForegroundColor Yellow

    $whoami = (& npx wrangler whoami 2>&1 | Out-String)

    if ($LASTEXITCODE -ne 0 -or $whoami -match "not authenticated|not logged") {
        Write-Host "Abrindo login da Cloudflare..." -ForegroundColor Yellow
        & npx wrangler login

        if ($LASTEXITCODE -ne 0) {
            throw "Não foi possível autenticar na Cloudflare."
        }
    }

    Write-Host ""
    Write-Host "3/6 Criando Worker público..." -ForegroundColor Yellow

    $firstDeploy = (& npx wrangler deploy 2>&1 | Tee-Object -Variable DeployOutput | Out-String)

    if ($LASTEXITCODE -ne 0) {
        throw "Falha no primeiro deploy do Worker.`n$firstDeploy"
    }

    Write-Host ""
    Write-Host "4/6 Configurando OPENAI_API_KEY..." -ForegroundColor Yellow
    Write-Host "A chave será cadastrada como Secret na Cloudflare." -ForegroundColor Gray
    Write-Host "Ela NÃO será gravada na extensão." -ForegroundColor Gray
    Write-Host ""

    $SecureKey = Read-Host "Digite sua OPENAI_API_KEY" -AsSecureString
    $Ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureKey)

    try {
        $PlainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Ptr)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Ptr)
    }

    if ([string]::IsNullOrWhiteSpace($PlainKey)) {
        throw "OPENAI_API_KEY não informada."
    }

    $PlainKey | & npx wrangler secret put OPENAI_API_KEY

    if ($LASTEXITCODE -ne 0) {
        throw "Falha ao cadastrar OPENAI_API_KEY como secret."
    }

    $PlainKey = $null
    [GC]::Collect()

    Write-Host ""
    Write-Host "5/6 Publicando versão final..." -ForegroundColor Yellow

    $finalDeploy = (& npx wrangler deploy 2>&1 | Tee-Object -Variable FinalDeployOutput | Out-String)

    if ($LASTEXITCODE -ne 0) {
        throw "Falha no deploy final.`n$finalDeploy"
    }

    $allOutput = "$firstDeploy`n$finalDeploy"
    $match = [regex]::Match(
        $allOutput,
        "https://[A-Za-z0-9.-]+\.workers\.dev"
    )

    if (-not $match.Success) {
        Write-Host ""
        Write-Host "Deploy realizado, mas não consegui detectar automaticamente a URL." -ForegroundColor Yellow
        Write-Host "Procure a URL workers.dev acima e coloque-a na engrenagem da extensão."
        exit 0
    }

    $WorkerUrl = $match.Value.TrimEnd("/")
    $AnalyzeUrl = "$WorkerUrl/analyze"
    $HealthUrl = "$WorkerUrl/health"

    Write-Host ""
    Write-Host "6/6 Configurando extensão automaticamente..." -ForegroundColor Yellow

    $Config = 'window.VENTUS_AI_ENDPOINT = "' + $AnalyzeUrl + '";'
    Set-Content -Path $ConfigFile -Value $Config -Encoding UTF8

    Write-Host ""
    Write-Host "Testando backend público..." -ForegroundColor Yellow

    try {
        $health = Invoke-RestMethod -Uri $HealthUrl -Method Get -TimeoutSec 15

        if ($health.ok -and $health.apiKeyConfigured) {
            Write-Host ""
            Write-Host "====================================================" -ForegroundColor Green
            Write-Host " VENTUS AI PUBLICADO COM SUCESSO" -ForegroundColor Green
            Write-Host "====================================================" -ForegroundColor Green
            Write-Host ""
            Write-Host "Backend:"
            Write-Host "  $WorkerUrl" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Endpoint IA:"
            Write-Host "  $AnalyzeUrl" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "Modelo:"
            Write-Host "  $($health.model)" -ForegroundColor Cyan
            Write-Host ""
            Write-Host "A extensão já foi configurada para esse endereço."
            Write-Host ""
            Write-Host "Agora recarregue a extensão em chrome://extensions."
            Write-Host ""
        }
        else {
            Write-Host "Backend respondeu, porém a API key não parece configurada." -ForegroundColor Red
        }
    }
    catch {
        Write-Host ""
        Write-Host "Deploy concluído, mas o teste de /health falhou." -ForegroundColor Yellow
        Write-Host "Endpoint configurado: $AnalyzeUrl"
    }
}
finally {
    Pop-Location
}

Read-Host "Pressione ENTER para fechar"
