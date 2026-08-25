@echo off
title Ventus AI - Publicar Cloudflare
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0PUBLICAR-VENTUS-AI.ps1"
