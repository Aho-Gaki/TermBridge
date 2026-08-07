# Configure Tailscale Serve for TermBridge.
#
# The default route is HTTPS on port 443. If another app already owns that
# route, use one of Tailscale Serve's other HTTPS ports instead of replacing it.
# Funnel is never enabled, so the endpoint remains tailnet-only.

$ErrorActionPreference = 'Stop'

$tailscale = if ($env:TAILSCALE_EXE) {
  $env:TAILSCALE_EXE
} else {
  'C:\Program Files\Tailscale\tailscale.exe'
}

function Get-ServeConfig([string]$Executable) {
  $output = & $Executable serve status --json 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    $detail = $output.Trim()
    if (-not $detail) { $detail = 'Tailscale is not running or is not signed in.' }
    throw $detail
  }

  if (-not $output.Trim()) { return [pscustomobject]@{} }
  try {
    return $output | ConvertFrom-Json
  } catch {
    throw 'Could not read the Tailscale Serve configuration. Please update Tailscale.'
  }
}

function Get-RootRoutes($Config) {
  $routes = @()
  if (-not $Config.Web) { return $routes }

  foreach ($site in $Config.Web.PSObject.Properties) {
    $handlers = $site.Value.Handlers
    if (-not $handlers) { continue }
    $root = $handlers.PSObject.Properties['/']
    if (-not $root -or -not $root.Value.Proxy) { continue }

    $httpsPort = 443
    if ($site.Name -match ':(\d+)$') { $httpsPort = [int]$Matches[1] }
    $routes += [pscustomobject]@{
      Authority = $site.Name
      HttpsPort = $httpsPort
      Proxy     = [string]$root.Value.Proxy
    }
  }
  return $routes
}

function Get-UsedServePorts($Config) {
  $ports = @()
  if ($Config.TCP) {
    foreach ($listener in $Config.TCP.PSObject.Properties) {
      $parsed = 0
      if ([int]::TryParse($listener.Name, [ref]$parsed)) { $ports += $parsed }
    }
  }
  if ($Config.Web) {
    foreach ($site in $Config.Web.PSObject.Properties) {
      if ($site.Name -match ':(\d+)$') { $ports += [int]$Matches[1] }
    }
  }
  return @($ports | Select-Object -Unique)
}

# Match server.js: the startup-selected port wins, followed by config.json,
# PORT, and finally the default 7070.
$port = 7070
$configPath = Join-Path $PSScriptRoot '..\config.json'
try {
  if ($env:TERMBRIDGE_RUNTIME_PORT) {
    $port = [int]$env:TERMBRIDGE_RUNTIME_PORT
  } elseif (Test-Path -LiteralPath $configPath) {
    $cfg = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if ($cfg.port) { $port = [int]$cfg.port }
  } elseif ($env:PORT) {
    $port = [int]$env:PORT
  }
  if ($port -lt 1 -or $port -gt 65535) { throw 'port is outside the range 1-65535' }
} catch {
  throw "Invalid port setting: $($_.Exception.Message)"
}

$config = Get-ServeConfig $tailscale
$target = "http://127.0.0.1:$port"
$targetPattern = '^http://(?:127\.0\.0\.1|localhost):' + [regex]::Escape("$port") + '/?$'
$routes = @(Get-RootRoutes $config)
$usedPorts = @(Get-UsedServePorts $config)

# A previous start may already have placed TermBridge on 443, 8443, or 10000.
$existing = $routes | Where-Object { $_.Proxy -match $targetPattern } | Select-Object -First 1
if ($existing) {
  Write-Host "[https] Ready: https://$($existing.Authority)/" -ForegroundColor Green
  return
}

# Tailscale Serve supports HTTPS on these ports. Prefer the normal URL, but do
# not destroy an unrelated Serve route merely because TermBridge starts.
$servePort = $null
foreach ($candidate in @(443, 8443, 10000)) {
  if ($candidate -notin $usedPorts) {
    $servePort = $candidate
    break
  }
}

if (-not $servePort) {
  throw 'Ports 443, 8443, and 10000 already have Tailscale Serve routes.'
}

$arguments = @('serve', '--bg')
if ($servePort -ne 443) { $arguments += "--https=$servePort" }
$arguments += $target

& $tailscale @arguments
if ($LASTEXITCODE -ne 0) {
  throw 'tailscale serve --bg failed.'
}

$updated = Get-ServeConfig $tailscale
$route = @(Get-RootRoutes $updated) |
  Where-Object { $_.Proxy -match $targetPattern } |
  Select-Object -First 1
if (-not $route) {
  throw 'Serve was updated, but its HTTPS route could not be verified.'
}
Write-Host "[https] Ready: https://$($route.Authority)/" -ForegroundColor Green
