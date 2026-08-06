# TermBridge の自動起動タスクを削除し、稼働中のサーバーを停止する
$ErrorActionPreference = 'SilentlyContinue'
Unregister-ScheduledTask -TaskName 'TermBridge' -Confirm:$false
Get-Process node | Where-Object { $_.Path -like (Join-Path (Split-Path -Parent $PSScriptRoot) '*') } | Stop-Process -Force
Write-Host 'タスク "TermBridge" を削除し、サーバーを停止しました。'
