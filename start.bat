@echo off
title TermBridge
cd /d "%~dp0"
echo Starting TermBridge...
echo (closing this window stops the server)
echo.

rem Select a free app port, configure tailscale serve --bg for it, then run Node.
powershell -NoProfile -ExecutionPolicy Bypass -File "scripts\start.ps1"
echo.
echo TermBridge has exited. See logs\termbridge.log for details.
pause
