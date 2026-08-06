@echo off
rem TermBridge のポート 7070 への受信を Tailscale のアドレス帯 (100.64.0.0/10) からのみ許可する
rem このファイルを右クリックして「管理者として実行」してください

net session >nul 2>&1
if errorlevel 1 (
  echo 管理者権限がありません。このファイルを右クリックして「管理者として実行」で開き直してください。
  pause
  exit /b 1
)

netsh advfirewall firewall delete rule name="TermBridge" >nul 2>&1
netsh advfirewall firewall add rule name="TermBridge" dir=in action=allow protocol=TCP localport=7070 remoteip=100.64.0.0/10
if errorlevel 1 (
  echo ルールの追加に失敗しました。
) else (
  echo ファイアウォールに許可ルール "TermBridge" を追加しました。スマホから接続できるはずです。
)
pause
