@echo off
rem Run TermBridge in a visible console (useful for checking its output).
cd /d "%~dp0.."
if exist "runtime\node\node.exe" (
  runtime\node\node.exe server.js
) else (
  node server.js
)
