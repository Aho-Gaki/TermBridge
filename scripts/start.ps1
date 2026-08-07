# Start TermBridge on the first available port, then configure Tailscale Serve
# for that exact port. Dependencies are expected to be installed already.

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$serverPath = Join-Path $root 'server.js'
$logDir = Join-Path $root 'logs'
$pidPath = Join-Path $logDir 'termbridge.pid'
$preferredPort = 7070
$configPath = Join-Path $root 'config.json'

function Get-RecordedServer {
  if (-not (Test-Path -LiteralPath $pidPath)) { return $null }

  $recordedPid = 0
  $rawPid = Get-Content -LiteralPath $pidPath -Raw -ErrorAction SilentlyContinue
  if (-not $rawPid) { return $null }
  $rawPid = $rawPid.Trim()
  if (-not [int]::TryParse($rawPid, [ref]$recordedPid)) { return $null }

  $process = Get-CimInstance Win32_Process -Filter "ProcessId=$recordedPid" -ErrorAction SilentlyContinue
  if (-not $process -or -not $process.CommandLine) { return $null }
  if ($process.CommandLine.IndexOf($serverPath, [StringComparison]::OrdinalIgnoreCase) -lt 0) { return $null }
  return $process
}

$running = Get-RecordedServer
if ($running) {
  Write-Host "[termbridge] Already running (PID $($running.ProcessId))." -ForegroundColor Green
  exit 0
}
if (Test-Path -LiteralPath $pidPath) { Remove-Item -LiteralPath $pidPath -Force }

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

New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$process = Start-Process -FilePath $node -ArgumentList ('"' + $serverPath + '"') `
  -WorkingDirectory $root -NoNewWindow -PassThru
Set-Content -LiteralPath $pidPath -Value $process.Id -Encoding Ascii -NoNewline

try {
  $process.WaitForExit()
  exit $process.ExitCode
} finally {
  $recordedPid = Get-Content -LiteralPath $pidPath -Raw -ErrorAction SilentlyContinue
  if ($recordedPid -and $recordedPid.Trim() -eq "$($process.Id)") {
    Remove-Item -LiteralPath $pidPath -Force -ErrorAction SilentlyContinue
  }
}
