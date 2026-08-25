$Host.UI.RawUI.WindowTitle = "Ventus AI"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Ventus AI - Configuração" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "A chave será usada somente neste processo local."
Write-Host "Ela não será armazenada dentro da extensão."
Write-Host ""

$secure = Read-Host "Digite sua OPENAI_API_KEY" -AsSecureString

$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)

try {
    $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
}
finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
}

if ([string]::IsNullOrWhiteSpace($env:OPENAI_API_KEY)) {
    Write-Host "Chave não informada." -ForegroundColor Red
    exit 1
}

$env:OPENAI_MODEL = "gpt-5.6"
$env:PORT = "8787"

Write-Host ""
Write-Host "Iniciando Ventus AI..." -ForegroundColor Green
Write-Host ""

node server.js
