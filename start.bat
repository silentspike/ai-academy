@echo off
rem AI-Act-Akademie - Start unter Windows (Doppelklick im Explorer).
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo   Node.js fehlt.
  echo.
  echo   Die Akademie braucht Node.js ab Version 20:
  echo     https://nodejs.org  -  LTS-Installationspaket fuer Windows
  echo.
  echo   Danach dieses Fenster schliessen und start.bat erneut doppelklicken.
  echo.
  pause
  exit /b 1
)

for /f "delims=" %%v in ('node -p "process.versions.node.split('.')[0]"') do set NODEMAJOR=%%v
if %NODEMAJOR% LSS 20 (
  echo.
  echo   Node.js %NODEMAJOR% ist zu alt - gebraucht wird mindestens Version 20.
  echo   Aktualisieren ueber https://nodejs.org
  echo.
  pause
  exit /b 1
)

echo AI-Act-Akademie startet - das Fenster bitte offen lassen.
echo Zum Beenden: Strg+C oder Fenster schliessen.
echo.
node bridge\bridge.mjs --open %*
