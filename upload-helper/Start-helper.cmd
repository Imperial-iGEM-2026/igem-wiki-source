@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 LTS from https://nodejs.org then open this file again.
  pause
  exit /b 1
)
if not exist node_modules\playwright (
  call npm ci --no-audit --no-fund
  if errorlevel 1 (pause & exit /b 1)
)
node server.mjs
pause
