# _wait-hell-selfplay.ps1 - compact progress monitor for the hell self-play run.
# Pure ASCII on purpose (PowerShell 5.1 misparses BOM-less UTF-8 with non-ASCII).
# Prints one line per change of (gen, best.fit, best.gen) into
# tools/logs/_hell-selfplay.waiter.log and exits when the run is done.
$ErrorActionPreference = 'SilentlyContinue'
$here = $PSScriptRoot
$root = Split-Path -Parent $here
Set-Location $root

$run     = 'hell-selfplay'
$total   = 520
$curve   = Join-Path $root 'tools\train-hell-curve.json'
$best    = Join-Path $root 'tools\train-hell-best.json'
$state   = Join-Path $root "tools\logs\_$run.state"
$log     = Join-Path $root "tools\logs\_$run.waiter.log"
$sup     = Join-Path $root "tools\logs\_$run.log"

function Note($m) {
  Add-Content -Path $log -Value ("[{0}] {1}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $m) -Encoding utf8
}

function Snapshot {
  $js = @'
try{
  const fs=require('fs');
  const c=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));
  const last=c[c.length-1];
  let b={};
  try{ b=JSON.parse(fs.readFileSync(process.argv[2],'utf8')); }catch(e){}
  const s={n:c.length, gen:last.gen, fit:last.fit, fDef:last.fDef, fPB:last.fPB, fPush:last.fPush, fSelf:last.fSelf,
           best:last.best, bestFit:b.fit, bestGen:b.gen, bestTag:b.tag, savedAtGen:b.savedAtGen};
  process.stdout.write(JSON.stringify(s));
}catch(e){ process.stdout.write('{"n":0}'); }
'@
  $tmp = Join-Path $env:TEMP '_hellsnap.js'
  Set-Content -Path $tmp -Value $js -Encoding ascii
  $out = & node $tmp $curve $best
  if ($out) { return $out | ConvertFrom-Json }
  return $null
}

function GensDone {
  if (Test-Path $state) {
    $v = (Get-Content $state -Raw).Trim()
    if ($v -match '^\d+$') { return [int]$v }
  }
  return 0
}

Note "waiter start total=$total"
$prev = ''
$deadline = (Get-Date).AddHours(9)
while ((Get-Date) -lt $deadline) {
  $s = Snapshot
  $line = ''
  if ($s -and $s.n -gt 0) {
    $line = ("gen={0} n={1} fit={2} vsCur={3} vsPB={4} vsDef={5} vsPush={6} | best={7}@gen{8}({9}) savedAtGen={10} done={11}" -f `
      $s.gen, $s.n, $s.fit, $s.fSelf, $s.fPB, $s.fDef, $s.fPush, $s.bestFit, $s.bestGen, $s.bestTag, $s.savedAtGen, (GensDone))
  }
  if ($line -ne '' -and $line -ne $prev) { Note $line; $prev = $line }
  if ((GensDone) -ge $total) { Note "reached total $total, waiter exiting"; break }
  $alive = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*train-hell.js*' }
  if (-not $alive) {
    Start-Sleep -Seconds 30
    $alive2 = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*train-hell.js*' }
    if (-not $alive2) { Note 'no trainer process, waiter exiting'; break }
  }
  Start-Sleep -Seconds 300
}
Note 'waiter end'

