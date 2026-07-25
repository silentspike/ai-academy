@echo off
REM AI-Act-Akademie — Start (Windows): Bridge starten + Browser öffnen (Plan §5.5)
cd /d "%~dp0\.."
where node >nul 2>nul || (echo Node.js ^>= 20 fehlt — bitte installieren ^(nodejs.org^) & pause & exit /b 1)
start "AI-Act-Akademie Bridge" node bridge\bridge.mjs
timeout /t 3 /nobreak >nul
start http://127.0.0.1:8791/
echo Bridge-Fenster offen lassen. Dieses Fenster kann geschlossen werden.
