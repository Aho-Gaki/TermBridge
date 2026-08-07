@echo off
title TermBridge
cd /d "%~dp0"
echo Starting TermBridge...
echo (closing this window stops the server)
echo.

rem Put tailscale serve in front of the app so other devices get https, which is
rem what lets the browser hand over the clipboard. Existing Serve routes are
rem preserved; the setup script selects another supported HTTPS port if needed.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\enable-https.ps1"
if errorlevel 1 (
  echo.
  echo Tailscale HTTPS setup failed. TermBridge was not started.
  pause
  exit /b 1
)

if exist "runtime\node\node.exe" (
  runtime\node\node.exe server.js
) else (
  node server.js
)
echo.
echo TermBridge has exited. See logs\termbridge.log for details.
pause
