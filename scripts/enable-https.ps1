# Puts `tailscale serve` in front of TermBridge so it is reached over https.
#
# This is not about the padlock. Browsers only expose the OS clipboard in a
# secure context, so over plain http the paste shortcut cannot read what you
# copied elsewhere - you are stuck with right-click -> Paste. Over https it
# works normally, and the app can also be installed as a PWA.
#
# Everything stays inside your tailnet. Funnel is not used, so nothing is
# published to the internet.

$ErrorActionPreference = 'Stop'

$tailscale = $env:TAILSCALE_EXE
if (-not $tailscale) { $tailscale = 'C:\Program Files\Tailscale\tailscale.exe' }
if (-not (Test-Path $tailscale)) {
  Write-Host "Tailscale was not found at $tailscale" -ForegroundColor Red
  Write-Host "Install it from https://tailscale.com/ or set TAILSCALE_EXE to its path."
  exit 1
}

# The port the app actually listens on, in the same order server.js resolves it.
$port = 7070
$configPath = Join-Path $PSScriptRoot '..\config.json'
if (Test-Path $configPath) {
  $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
  if ($cfg.port) { $port = $cfg.port }
} elseif ($env:PORT) {
  $port = $env:PORT
}

# Serve can only front one target per path. Refuse to silently replace someone
# else's - that would take down whatever is already behind it.
$current = & $tailscale serve status 2>&1 | Out-String
if ($current -match 'proxy\s+http://(?:127\.0\.0\.1|localhost):(\d+)') {
  $existing = $Matches[1]
  if ($existing -ne "$port") {
    Write-Host "tailscale serve already forwards / to port $existing." -ForegroundColor Yellow
    Write-Host "Pointing it at TermBridge (port $port) would break whatever is on $existing."
    $answer = Read-Host "Replace it? (y/N)"
    if ($answer -ne 'y') { Write-Host 'Left unchanged.'; exit 0 }
  } else {
    Write-Host "Already serving TermBridge on port $port." -ForegroundColor Green
  }
}

& $tailscale serve --bg --https=443 "http://127.0.0.1:$port"
if ($LASTEXITCODE -ne 0) { Write-Host 'tailscale serve failed.' -ForegroundColor Red; exit 1 }

$status = & $tailscale serve status 2>&1 | Out-String
$url = ([regex]::Match($status, '(?m)^https://\S+')).Value
Write-Host ''
if ($url) {
  Write-Host "TermBridge is now at $url" -ForegroundColor Green
  Write-Host 'Open that on any device signed into the same tailnet. Paste works there,'
  Write-Host 'and it can be added to the home screen as a PWA.'
} else {
  Write-Host 'serve reported no https endpoint. Check: tailscale serve status'
}
Write-Host ''
Write-Host 'To undo: tailscale serve --https=443 off'
