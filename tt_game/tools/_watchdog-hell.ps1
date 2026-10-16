# _watchdog-hell.ps1 - keep the hell self-play supervisor alive (round: 2026-10-16).
# Pure ASCII on purpose: PowerShell 5.1 misparses BOM-less UTF-8 files that contain
# non-ASCII characters (TerminatorExpectedAtEndOfString). Do not add Chinese here.
#
# It never kills anything by command-line text matching (that once killed the host
# shell). Liveness is decided by the PID the supervisor wrote into its own lock file.
$ErrorActionPreference = 'SilentlyContinue'
$here = $PSScriptRoot                        # ...\tt_game\tools
$root = Split-Path -Parent $here             # ...\tt_game
Set-Location $root

$run     = 'hell-selfplay'
$total   = 330
$lock    = Join-Path $root "data\.stop\$run.lock"
$stop    = Join-Path $root "data\.stop\$run.stop"
$state   = Join-Path $root "tools\logs\_$run.state"
$log     = Join-Path $root "tools\logs\_$run.watchdog.log"
$pidFile = Join-Path $root "tools\logs\_$run.watchdog.pid"
$chain   = Join-Path $root "tools\logs\_$run.chain.log"
$chainErr= Join-Path $root "tools\logs\_$run.chain.err.log"
$winpid  = Join-Path $root "tools\logs\_$run.winpid"

Set-Content -Path $pidFile -Value $PID -Encoding ascii

function Note($m) {
  Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) -Encoding utf8
}
function GensDone {
  if (Test-Path $state) {
    $v = (Get-Content $state -Raw).Trim()
    if ($v -match '^\d+$') { return [int]$v }
  }
  return 0
}
function SupAlive {
  if (Test-Path $winpid) {
    $v = (Get-Content $winpid -Raw).Trim()
    if ($v -match '^\d+$') {
      if (Get-Process -Id ([int]$v) -ErrorAction SilentlyContinue) { return $true }
      return $false
    }
  }
  # fallback: a bash process still carrying the supervisor script on its command line
  $p = Get-CimInstance Win32_Process -Filter "Name='bash.exe'" -ErrorAction SilentlyContinue |
       Where-Object { $_.CommandLine -like '*_supervise-hell.sh*' }
  return [bool]$p
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
function Relaunch {
  $bash = FindBash
  if (-not $bash) { Note 'ERROR: bash.exe not found, cannot relaunch'; return }
  Start-Process -FilePath $bash `
    -ArgumentList @('tools/_supervise-hell.sh', "$total", '--workers', '20', '--no-write') `
    -WindowStyle Hidden -RedirectStandardOutput $chain -RedirectStandardError $chainErr
}

$bash = FindBash
if (-not $bash) { Note 'ERROR: bash.exe not found at watchdog start' }
Note "watchdog start PID=$PID poll=300s total=$total bash=$bash"
Start-Sleep -Seconds 60

while ($true) {
  if (Test-Path $stop) { Note 'stop sentinel present, watchdog exiting'; break }
  if ((GensDone) -ge $total) { Note "reached $total gens, watchdog exiting"; break }
  if (-not (SupAlive)) {
    Note 'supervisor not alive -> relaunching'
    Relaunch
    Start-Sleep -Seconds 25
    $now = if (Test-Path $winpid) { (Get-Content $winpid -Raw).Trim() } else { '?' }
    Note "relaunched; supervisor winpid=$now gensDone=$(GensDone)"
  }
  Start-Sleep -Seconds 300
}
Note 'watchdog end'
