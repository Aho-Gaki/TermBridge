# Remove the logon task and stop the TermBridge process recorded by start.ps1.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$serverPath = Join-Path $root 'server.js'
$pidPath = Join-Path $root 'logs\termbridge.pid'

$task = Get-ScheduledTask -TaskName 'TermBridge' -ErrorAction SilentlyContinue
if ($task) {
  Unregister-ScheduledTask -TaskName 'TermBridge' -Confirm:$false
  Write-Host 'Removed the scheduled task "TermBridge".'
}

if (-not (Test-Path -LiteralPath $pidPath)) { return }
$recordedPid = 0
$rawPid = (Get-Content -LiteralPath $pidPath -Raw).Trim()
$validPid = [int]::TryParse($rawPid, [ref]$recordedPid)
$process = if ($validPid) {
  Get-CimInstance Win32_Process -Filter "ProcessId=$recordedPid" -ErrorAction SilentlyContinue
} else {
  $null
}

if ($process -and $process.CommandLine -and
    $process.CommandLine.IndexOf($serverPath, [StringComparison]::OrdinalIgnoreCase) -ge 0) {
  Stop-Process -Id $recordedPid -Force
  Write-Host "Stopped TermBridge (PID $recordedPid)."
}
Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
