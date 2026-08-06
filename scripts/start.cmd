@echo off
rem TermBridge を前面のコンソールで起動する（動作確認用）
cd /d "%~dp0.."
if exist "runtime\node\node.exe" (
  runtime\node\node.exe server.js
) else (
  node server.js
)
