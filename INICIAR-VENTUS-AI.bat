@echo off
title Ventus AI
cls
echo ============================================
echo  Ventus AI - Configuracao
echo ============================================
echo.
echo Sua chave sera usada apenas neste processo local.
echo Ela NAO sera salva dentro da extensao.
echo.
set /p OPENAI_API_KEY=Digite sua OPENAI_API_KEY: 
if "%OPENAI_API_KEY%"=="" (
  echo.
  echo ERRO: chave nao informada.
  pause
  exit /b 1
)
set OPENAI_MODEL=gpt-5.6
set PORT=8787
echo.
echo Iniciando Ventus AI...
echo.
node server.js
pause
