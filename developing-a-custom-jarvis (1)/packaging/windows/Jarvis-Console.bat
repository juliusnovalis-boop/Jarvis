@echo off
cd /d "%~dp0"
title J.A.R.V.I.S. - Diagnostic de demarrage
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Jarvis.ps1" -ConsoleMode
pause
