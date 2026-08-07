# Start TermBridge on the first available port, then configure Tailscale Serve
# for that exact port. Dependencies are expected to be installed already.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$preferredPort = 7070
$configPath = Join-Path $root 'config.json'

try {
  if (Test-Path -LiteralPath $configPath) {
    $cfg = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if ($cfg.port) { $preferredPort = [int]$cfg.port }
  } elseif ($env:PORT) {
    $preferredPort = [int]$env:PORT
  }
  if ($preferredPort -lt 1 -or $preferredPort -gt 65535) {
    throw 'port is outside the range 1-65535'
  }
} catch {
  Write-Host "[termbridge] Invalid port setting: $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

function Test-PortAvailable([int]$Port) {
  if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) {
    return $false
  }

  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, $Port)
  try {
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    try { $listener.Stop() } catch {}
  }
}

$selectedPort = $null
$lastCandidate = [Math]::Min($preferredPort + 99, 65535)
for ($candidate = $preferredPort; $candidate -le $lastCandidate; $candidate++) {
  if (Test-PortAvailable $candidate) {
    $selectedPort = $candidate
    break
  }
}

if (-not $selectedPort) {
  Write-Host "[termbridge] No free port found from $preferredPort to $lastCandidate." -ForegroundColor Red
  exit 1
}

if ($selectedPort -ne $preferredPort) {
  Write-Host "[termbridge] Port $preferredPort is busy; using $selectedPort." -ForegroundColor Yellow
}

# This private runtime override wins over config.json and PORT so every startup
# component uses the port selected above.
$env:TERMBRIDGE_RUNTIME_PORT = "$selectedPort"

try {
  & (Join-Path $PSScriptRoot 'enable-https.ps1')
} catch {
  Write-Host "[https] $($_.Exception.Message)" -ForegroundColor Red
  exit 1
}

$bundledNode = Join-Path $root 'runtime\node\node.exe'
$node = if (Test-Path -LiteralPath $bundledNode) { $bundledNode } else { 'node.exe' }

Push-Location $root
try {
  & $node (Join-Path $root 'server.js')
  exit $LASTEXITCODE
} finally {
  Pop-Location
}
