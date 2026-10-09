param(
  [switch]$ResetCache
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

Write-Host "[android:stable] Checking port 8081..."
$listening = netstat -ano | Select-String "LISTENING" | Select-String ":8081"
$pids = @()
foreach ($line in $listening) {
  $parts = ($line -replace "\s+", " ").Trim().Split(" ")
  if ($parts.Length -ge 5) {
    $pidValue = 0
    if ([int]::TryParse($parts[-1], [ref]$pidValue)) {
      $pids += $pidValue
    }
  }
}

$pids = $pids | Select-Object -Unique
foreach ($processId in $pids) {
  try {
    $process = Get-Process -Id $processId -ErrorAction Stop
    if ($process.ProcessName -ieq "node") {
      Stop-Process -Id $processId -Force -ErrorAction Stop
      Write-Host "[android:stable] Killed stale Node process PID $processId on :8081"
    } else {
      Write-Host "[android:stable] PID $processId is '$($process.ProcessName)', skipping."
    }
  } catch {
    Write-Host "[android:stable] Could not inspect/kill PID $processId, continuing..."
  }
}

$env:NODE_OPTIONS = "--max-old-space-size=8192"
Write-Host "[android:stable] NODE_OPTIONS=$env:NODE_OPTIONS"

$metroStartCommand = "npx react-native start"
if ($ResetCache.IsPresent) {
  $metroStartCommand = "$metroStartCommand --reset-cache"
  Write-Host "[android:stable] Metro reset-cache enabled for this run."
}

$metroCommand = @(
  "Set-Location '$projectRoot';",
  "`$env:NODE_OPTIONS='--max-old-space-size=8192';",
  $metroStartCommand
) -join " "

Write-Host "[android:stable] Starting Metro in a new terminal..."
Start-Process powershell -ArgumentList "-NoProfile", "-NoExit", "-Command", $metroCommand | Out-Null

$maxWaitSeconds = 90
$started = $false
for ($i = 0; $i -lt $maxWaitSeconds; $i++) {
  Start-Sleep -Seconds 1
  $portReady = netstat -ano | Select-String "LISTENING" | Select-String ":8081"
  if ($portReady) {
    $started = $true
    break
  }
}

if (-not $started) {
  throw "[android:stable] Metro did not start on :8081 within $maxWaitSeconds seconds."
}

Write-Host "[android:stable] Metro ready. Running Android app with --no-packager..."
npx react-native run-android --no-packager
