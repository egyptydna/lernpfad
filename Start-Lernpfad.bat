@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Bitte zuerst Node.js 24 LTS installieren: https://nodejs.org/
  pause
  exit /b 1
)
npm run app
pause
