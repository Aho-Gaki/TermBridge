@echo off
title TermBridge
cd /d "%~dp0"
echo TermBridge を起動します...
echo （このウィンドウを閉じるとサーバーも止まります）
echo.
if exist "runtime\node\node.exe" (
  runtime\node\node.exe server.js
) else (
  node server.js
)
echo.
echo サーバーが終了しました。ポート競合などは logs\termbridge.log を確認してください。
pause
