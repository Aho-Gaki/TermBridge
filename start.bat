@echo off
title TermBridge
cd /d "%~dp0"
echo Starting TermBridge...
echo (closing this window stops the server)
echo.
if exist "runtime\node\node.exe" (
  runtime\node\node.exe server.js
) else (
  node server.js
)
echo.
echo TermBridge has exited. See logs\termbridge.log for details.
pause
