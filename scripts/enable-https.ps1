# Configure Tailscale Serve for TermBridge.
#
# The default route is HTTPS on port 443. When that is taken the next free port is
# used instead, starting at the conventional 8443, so a busy machine still starts.
# A custom HTTPS port can be set in config.json. Existing routes are never
# replaced, and Funnel is never enabled, so the endpoint remains tailnet-only.

$ErrorActionPreference = 'Stop'

$tailscale = if ($env:TAILSCALE_EXE) {
  $env:TAILSCALE_EXE
} else {
  'C:\Program Files\Tailscale\tailscale.exe'
}

# Without this the caller only sees PowerShell's raw CommandNotFoundException,
# which does not say what is actually missing.
if (-not (Get-Command $tailscale -ErrorAction SilentlyContinue)) {
  throw "Tailscale was not found at $tailscale. Install Tailscale and sign in, or point TAILSCALE_EXE at it."
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
$configuredHttpsPort = $null
$configPath = Join-Path $PSScriptRoot '..\config.json'
try {
  if ($env:TERMBRIDGE_RUNTIME_PORT) {
    $port = [int]$env:TERMBRIDGE_RUNTIME_PORT
  }
  if (Test-Path -LiteralPath $configPath) {
    $cfg = Get-Content -LiteralPath $configPath -Raw | ConvertFrom-Json
    if (-not $env:TERMBRIDGE_RUNTIME_PORT -and $cfg.port) { $port = [int]$cfg.port }
    if ($cfg.httpsPort) { $configuredHttpsPort = [int]$cfg.httpsPort }
  } elseif (-not $env:TERMBRIDGE_RUNTIME_PORT -and $env:PORT) {
    $port = [int]$env:PORT
  }
  if ($port -lt 1 -or $port -gt 65535) { throw 'port is outside the range 1-65535' }
  if ($configuredHttpsPort -and ($configuredHttpsPort -lt 1 -or $configuredHttpsPort -gt 65535)) {
    throw 'httpsPort is outside the range 1-65535'
  }
} catch {
  throw "Invalid port setting: $($_.Exception.Message)"
}

$config = Get-ServeConfig $tailscale
$target = "http://127.0.0.1:$port"
$targetPattern = '^http://(?:127\.0\.0\.1|localhost):' + [regex]::Escape("$port") + '/?$'
$routes = @(Get-RootRoutes $config)
$usedPorts = @(Get-UsedServePorts $config)
# 443 first, then the conventional alternative, then a scan upward so a machine
# that already hosts several Serve routes still gets one and starts.
$httpsCandidates = if ($configuredHttpsPort) {
  @($configuredHttpsPort)
} else {
  @(443, 8443) + (8444..8542)
}

# Reuse an existing TermBridge route only when it is on the configured/default
# candidates. This keeps an explicit httpsPort authoritative.
$existing = $routes |
  Where-Object { $_.Proxy -match $targetPattern -and $_.HttpsPort -in $httpsCandidates } |
  Select-Object -First 1
if ($existing) {
  Write-Host "[https] Ready: https://$($existing.Authority)/" -ForegroundColor Green
  return
}

# Prefer the normal HTTPS URL, then the alternatives in order. When the user
# configured httpsPort, try only that exact port.
$servePort = $null
foreach ($candidate in $httpsCandidates) {
  if ($candidate -notin $usedPorts) {
    $servePort = $candidate
    break
  }
}

if (-not $servePort) {
  if ($configuredHttpsPort) {
    throw "HTTPS port $configuredHttpsPort already has a Tailscale Serve route. Choose another httpsPort in config.json."
  }
  throw 'Every HTTPS port from 443 to 8542 already has a Tailscale Serve route. Set httpsPort in config.json to a free port.'
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
