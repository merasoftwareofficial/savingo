param(
  [switch]$ResetCache
)

# Single entry point for "build + install + run" during development
# (npm run android / npm run android:clean-start).
#
# Why --no-packager: on Windows the React Native CLI compares Metro's
# X-React-Native-Project-Root header ("E:/savingo/Frontend") with its own root
# ("E:\savingo\Frontend") as plain strings, never matches, and asks
# "Use port 8082 instead?" on every run. This script does that check itself
# (slash/case-insensitive), reuses a warm Metro of this project, and only starts
# Metro when needed.

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot
$metroPort = 8081
$tag = "[android]"

function Get-NormalizedPath([string]$value) {
  return ($value -replace '\\', '/').TrimEnd('/').ToLowerInvariant()
}

# 'own' = Metro of this project, 'other' = something else on the port, 'free' = nothing.
function Get-MetroState {
  try {
    $response = Invoke-WebRequest -Uri "http://localhost:$metroPort/status" -UseBasicParsing -TimeoutSec 2
    $body = [System.Text.Encoding]::UTF8.GetString($response.RawContentStream.ToArray())
    $root = [string]$response.Headers['X-React-Native-Project-Root']
    if ($body -eq 'packager-status:running' -and (Get-NormalizedPath $root) -eq (Get-NormalizedPath $projectRoot)) {
      return 'own'
    }
    return 'other'
  } catch {
    $listening = Get-NetTCPConnection -LocalPort $metroPort -State Listen -ErrorAction SilentlyContinue
    if ($listening) {
      return 'other'
    }
    return 'free'
  }
}

function Stop-PortOwners {
  $owners = Get-NetTCPConnection -LocalPort $metroPort -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $owners) {
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process -and $process.ProcessName -ieq 'node') {
      Stop-Process -Id $processId -Force
      Write-Host "$tag Stopped Node process PID $processId on :$metroPort"
    } elseif ($process) {
      throw "$tag Port $metroPort is used by '$($process.ProcessName)' (PID $processId). Close it and retry."
    }
  }
}

function Start-Metro {
  $startCommand = "node --max-old-space-size=8192 ./node_modules/react-native/cli.js start"
  if ($ResetCache.IsPresent) {
    $startCommand = "$startCommand --reset-cache"
  }
  $metroCommand = "Set-Location '$projectRoot'; $startCommand"
  Write-Host "$tag Starting Metro in a new terminal: $startCommand"
  Start-Process powershell -ArgumentList "-NoProfile", "-NoExit", "-Command", $metroCommand | Out-Null

  $maxWaitSeconds = 90
  for ($i = 0; $i -lt $maxWaitSeconds; $i++) {
    Start-Sleep -Seconds 1
    if ((Get-MetroState) -eq 'own') {
      Write-Host "$tag Metro ready."
      return
    }
  }
  throw "$tag Metro did not start on :$metroPort within $maxWaitSeconds seconds."
}

$state = Get-MetroState
if ($state -eq 'own' -and -not $ResetCache.IsPresent) {
  Write-Host "$tag Reusing the Metro already running for this project on :$metroPort."
} else {
  if ($state -ne 'free') {
    Stop-PortOwners
  }
  Start-Metro
}

# Shells that set NoDefaultCurrentDirectoryInExePath cannot find android\gradlew.bat
# by name; clear it for this process only.
Remove-Item Env:NoDefaultCurrentDirectoryInExePath -ErrorAction SilentlyContinue

Write-Host "$tag Building and installing (Metro already running, --no-packager)..."
node --max-old-space-size=8192 ./node_modules/react-native/cli.js run-android --no-packager
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
