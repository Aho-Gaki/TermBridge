# Remove the logon task and stop the running server.
$ErrorActionPreference = 'SilentlyContinue'
Unregister-ScheduledTask -TaskName 'TermBridge' -Confirm:$false
Get-Process node | Where-Object { $_.Path -like (Join-Path (Split-Path -Parent $PSScriptRoot) '*') } | Stop-Process -Force
Write-Host 'Removed the scheduled task "TermBridge" and stopped the server.'
