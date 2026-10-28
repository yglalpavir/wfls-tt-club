# _watchdog-r6.ps1 - keep the round-7 orchestrator alive (nemesis refresh + hell GA + eval chain).
# Pure ASCII on purpose: PowerShell 5.1 misparses BOM-less UTF-8 files with non-ASCII chars.
#
# Config-driven: reads tools/logs/_r7-watchdog.json each poll:
#   { "winpid": "tools/logs/_r6-orchestrator.winpid",
#     "stop":   "data/.stop/r6.stop",
#     "done":   "tools/logs/_r6-eval-done.flag",
#     "relaunch": ["tools/_r6-run-all.sh"],
#     "maxRelaunch": 40 }
#
# It never kills anything by command-line text matching. Liveness is decided by the
# Windows PID the orchestrator wrote into its own winpid file. If the orchestrator is
# gone and neither the stop sentinel nor the done flag exists, relaunch it - the
# orchestrator's phases are idempotent at the phase level (each phase's supervisor
# tracks its own progress state and resumes from the best checkpoint).
$ErrorActionPreference = 'SilentlyContinue'
$here = $PSScriptRoot
$root = Split-Path -Parent $here
Set-Location $root

$cfgPath = Join-Path $root 'tools\logs\_r7-watchdog.json'
$log     = Join-Path $root 'tools\logs\_r7-watchdog.log'
$pidFile = Join-Path $root 'tools\logs\_r7-watchdog.pid'
Set-Content -Path $pidFile -Value $PID -Encoding ascii

function Note($m) {
  Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) -Encoding utf8
}
function FindBash {
  $cmd = Get-Command bash.exe -ErrorAction SilentlyContinue
  if ($cmd) { return $cmd.Source }
  foreach ($p in @('C:\Program Files\Git\bin\bash.exe',
                   'C:\Program Files\Git\usr\bin\bash.exe',
                   'C:\Program Files (x86)\Git\bin\bash.exe',
                   (Join-Path $env:LOCALAPPDATA 'Programs\Git\bin\bash.exe'))) {
    if (Test-Path $p) { return $p }
  }
  return $null
}
function GetCfg {
  if (-not (Test-Path $cfgPath)) { return $null }
  try { return Get-Content $cfgPath -Raw | ConvertFrom-Json } catch { return $null }
}
function OrchAlive($cfg) {
  if (-not $cfg) { return $false }
  $wp = Join-Path $root $cfg.winpid
  if (-not (Test-Path $wp)) { return $false }
  $v = (Get-Content $wp -Raw).Trim()
  if ($v -match '^\d+$') {
    if (Get-Process -Id ([int]$v) -ErrorAction SilentlyContinue) { return $true }
  }
  return $false
}
function Relaunch($cfg) {
  $bash = FindBash
  if (-not $bash) { Note 'ERROR: bash.exe not found, cannot relaunch'; return }
  $args = @()
  foreach ($a in $cfg.relaunch) { $args += $a }
  Start-Process -FilePath $bash -ArgumentList $args `
    -WindowStyle Hidden -RedirectStandardOutput (Join-Path $root 'tools\logs\_r6-orchestrator.chain.log') `
    -RedirectStandardError (Join-Path $root 'tools\logs\_r6-orchestrator.chain.err.log')
}

$bash = FindBash
if (-not $bash) { Note 'ERROR: bash.exe not found at watchdog start' }
Note "watchdog start PID=$PID poll=300s bash=$bash"
Start-Sleep -Seconds 90

$relaunches = 0
while ($true) {
  $cfg = GetCfg
  if (-not $cfg) { Note 'config missing/unreadable, waiting'; Start-Sleep -Seconds 300; continue }
  if (Test-Path (Join-Path $root $cfg.stop)) { Note 'stop sentinel present, watchdog exiting'; break }
  if (Test-Path (Join-Path $root $cfg.done)) { Note 'done flag present, watchdog exiting'; break }
  if (-not (OrchAlive $cfg)) {
    if ($relaunches -ge [int]$cfg.maxRelaunch) { Note 'relaunch cap reached, giving up'; break }
    $relaunches++
    Note ("orchestrator not alive -> relaunch #{0}" -f $relaunches)
    Relaunch $cfg
    Start-Sleep -Seconds 30
  }
  Start-Sleep -Seconds 300
}
Note 'watchdog end'
