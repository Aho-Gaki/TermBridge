# Register a logon task so TermBridge starts with Windows. No admin rights needed.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$startScript = Join-Path $root 'scripts\start.ps1'

$arguments = '-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "' + $startScript + '"'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName 'TermBridge' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host 'Registered the scheduled task "TermBridge". It will start at logon.'

Start-ScheduledTask -TaskName 'TermBridge'
Write-Host 'Started it now. See logs\termbridge.log for its output.'
