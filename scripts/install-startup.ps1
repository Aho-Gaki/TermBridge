# TermBridge をログオン時に自動起動するタスクを登録する（管理者権限は不要）
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$vbs = Join-Path $root 'scripts\start-hidden.vbs'

$action = New-ScheduledTaskAction -Execute 'wscript.exe' -Argument ('"' + $vbs + '"')
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit ([TimeSpan]::Zero)

Register-ScheduledTask -TaskName 'TermBridge' -Action $action -Trigger $trigger -Settings $settings -Force | Out-Null
Write-Host 'タスク "TermBridge" を登録しました。ログオン時に自動起動します。'

Start-ScheduledTask -TaskName 'TermBridge'
Write-Host '今すぐ起動しました。logs\termbridge.log で状態を確認できます。'
