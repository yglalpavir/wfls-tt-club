# _r7-final-eval.ps1 - wait for the round-7 hell trainer to exit, then run the
# decisive evaluations automatically. ASCII only on purpose: PowerShell 5.1
# misparses BOM-less UTF-8 files that contain non-ASCII characters.
#
# Wait condition: the supervisor deletes tools/logs/_hell-selfplay.winpid on exit,
# so a missing / non-numeric value means the chain is gone.
#
# Evaluations (all dual-orientation, 3200 games each unless noted):
#   1) R7 vs current online (R6, adopted 2026-10-26)  - GENERIC STRENGTH GUARD (>=50%)
#   2) R7 vs archived R5                              - R6 scored 50.33% (50.20 post-adopt)
#   3) R7 vs built-in nemesis                         - R6 scored 54.84% (G4 >= 51%)
#   4) R7 vs R6-era fresh nemesis2 (_r6-nemesis-candidate) - R6 scored 40.68%
#   5) R7 vs its own fresh nemesis2 (_r7-nemesis-candidate) - new pairing, want >40% band
#   6) R7 vs archived R2                              - R6 scored 59.03%
#   7) R7 holdout ladder (default/pusher/pb/grandslam) - R6 = 87.42/85.71/91.63/87.29
#   8) PRIMARY: HIP live paired eval (12 seeds x 12 games x 2 sides, --hell-vec)
#      base = R6 archive (_r6-candidate.json, == live until adoption), cand = R7 candidate
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root | Out-Null

$deadline = (Get-Date).AddHours(14)
while((Get-Date) -lt $deadline){
  $alive = $false
  if(Test-Path tools\logs\_hell-selfplay.winpid){
    $w = (Get-Content tools\logs\_hell-selfplay.winpid -Raw).Trim()
    if($w -match '^\d+$'){ $alive = [bool](Get-Process -Id ([int]$w) -ErrorAction SilentlyContinue) }
  }
  if(-not $alive){ break }
  Start-Sleep -Seconds 180
}

"=== R7 TRAINER DONE $(Get-Date -Format o) ==="
$candidate = 'tools\train-hell-candidate.json'
$nemesis7  = 'tools\logs\_r7-nemesis-candidate.json'
"candidate exists: $(Test-Path $candidate)"
"nemesis7 exists: $(Test-Path $nemesis7)"
if(-not (Test-Path $candidate)){ "FATAL: no candidate, aborting eval chain"; exit 1 }

# ---- 1-6) h2h suite, parallel jobs (each is a single-threaded node run) ----
$jobs = @()
$jobs += Start-Job -Name h2hOnline -ScriptBlock { Set-Location $using:root; node tools\_hell-h2h.js 200 8 2>&1 |
  Out-File -Encoding utf8 tools\logs\_h2h-r7-vs-online.txt }
$jobs += Start-Job -Name h2hR5 -ScriptBlock { Set-Location $using:root; node tools\_hell-h2h.js 200 8 --versus tools\logs\_shipped-20261019-r5-ingame.json 2>&1 |
  Out-File -Encoding utf8 tools\logs\_h2h-r7-vs-r5.txt }
$jobs += Start-Job -Name h2hNem1 -ScriptBlock { Set-Location $using:root; node tools\_hell-h2h.js 200 8 --opp-nemesis 2>&1 |
  Out-File -Encoding utf8 tools\logs\_h2h-r7-vs-nemesis.txt }
$jobs += Start-Job -Name h2hNem2R6 -ScriptBlock { Set-Location $using:root; node tools\_hell-h2h.js 200 8 --versus tools\logs\_r6-nemesis-candidate.json 2>&1 |
  Out-File -Encoding utf8 tools\logs\_h2h-r7-vs-nem2r6.txt }
$jobs += Start-Job -Name h2hNem2R7 -ScriptBlock { Set-Location $using:root; node tools\_hell-h2h.js 200 8 --versus tools\logs\_r7-nemesis-candidate.json 2>&1 |
  Out-File -Encoding utf8 tools\logs\_h2h-r7-vs-nem2r7.txt }
$jobs += Start-Job -Name h2hR2 -ScriptBlock { Set-Location $using:root; node tools\_hell-h2h.js 200 8 --versus tools\logs\_shipped-20261018-r2-ingame.json 2>&1 |
  Out-File -Encoding utf8 tools\logs\_h2h-r7-vs-r2.txt }
$jobs += Start-Job -Name holdout -ScriptBlock { Set-Location $using:root; node tools\_opp-ladder-hell.js 150 6 --from tools\train-hell-candidate.json 2>&1 |
  Out-File -Encoding utf8 tools\logs\_opp-ladder-r7.txt }
Wait-Job $jobs -Timeout 5400 | Out-Null
Remove-Job $jobs -Force

"--- R7 vs online (R6)  [GUARD >= 50%] ---"
Get-Content tools\logs\_h2h-r7-vs-online.txt -Encoding UTF8
"--- R7 vs archived R5  [R6 baseline 50.33%] ---"
Get-Content tools\logs\_h2h-r7-vs-r5.txt -Encoding UTF8
"--- R7 vs built-in nemesis  [R6 baseline 54.84%, G4 >= 51%] ---"
Get-Content tools\logs\_h2h-r7-vs-nemesis.txt -Encoding UTF8
"--- R7 vs R6-era nemesis2  [R6 baseline 40.68%] ---"
Get-Content tools\logs\_h2h-r7-vs-nem2r6.txt -Encoding UTF8
"--- R7 vs its own fresh nemesis2  [new pairing] ---"
Get-Content tools\logs\_h2h-r7-vs-nem2r7.txt -Encoding UTF8
"--- R7 vs archived R2  [R6 baseline 59.03%] ---"
Get-Content tools\logs\_h2h-r7-vs-r2.txt -Encoding UTF8
"--- R7 holdout ladder  [R6: default 87.42 / pusher 85.71 / pb 91.63 / grandslam 87.29] ---"
Get-Content tools\logs\_opp-ladder-r7.txt -Encoding UTF8

# ---- 8) PRIMARY: HIP live paired eval ----
New-Item -ItemType Directory -Force -Path tools\logs\_r7-hip | Out-Null
$baseVec = 'tools\logs\_r6-candidate.json'
$candVec = 'tools\train-hell-candidate.json'
$seeds = 12; $gamesPerSeed = 12
for($s = 0; $s -lt $seeds; $s++){
  $seed = 20261028 + $s * 1000
  node tools\live-match.js --controller hip --opp hell --games $gamesPerSeed --seed $seed `
    --live-only --maxsec 240 --hell-vec $baseVec --json tools\logs\_r7-hip\base-s$s.json |
    Out-File -Encoding utf8 tools\logs\_r7-hip\base-s$s.log
  node tools\live-match.js --controller hip --opp hell --games $gamesPerSeed --seed $seed `
    --live-only --maxsec 240 --hell-vec $candVec --json tools\logs\_r7-hip\cand-s$s.json |
    Out-File -Encoding utf8 tools\logs\_r7-hip\cand-s$s.log
}

# aggregate reports (standard format, Wilson CI)
node tools\hip-eval.js --controller hip --opp hell --games 96 --shards 8 --hell-vec $baseVec 2>&1 |
  Out-File -Encoding utf8 tools\logs\_r7-hip\agg-base.txt
node tools\hip-eval.js --controller hip --opp hell --games 96 --shards 8 --hell-vec $candVec 2>&1 |
  Out-File -Encoding utf8 tools\logs\_r7-hip\agg-cand.txt

"--- HIP live aggregate: baseline (R6) ---"
Get-Content tools\logs\_r7-hip\agg-base.txt -Encoding UTF8 | Select-Object -Last 12
"--- HIP live aggregate: candidate (R7) ---"
Get-Content tools\logs\_r7-hip\agg-cand.txt -Encoding UTF8 | Select-Object -Last 12

"--- PRIMARY paired verdict ---"
node tools\_r7-paired-hip.js 2>&1 | Tee-Object -FilePath tools\logs\_r7-hip\paired-verdict.txt

"=== R7 EVAL DONE $(Get-Date -Format o) ==="
Set-Content -Path tools\logs\_r7-eval-done.flag -Value (Get-Date -Format o) -Encoding ascii
