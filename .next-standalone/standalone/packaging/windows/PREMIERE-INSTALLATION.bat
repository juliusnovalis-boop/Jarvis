@echo off
cd /d "%~dp0"
title J.A.R.V.I.S. - Premiere installation
echo ============================================================
echo   J.A.R.V.I.S. COMPLETE - premiere installation
echo   Demarrage de PostgreSQL, du serveur et de l'agent vocal.
echo   Une fenetre de bureau s'ouvrira quand tout sera pret.
echo ============================================================
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Start-Jarvis.ps1" -ConsoleMode
pause
