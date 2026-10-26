# _r6-final-eval.ps1 - wait for the round-6 hell trainer to exit, then run the
# decisive evaluations automatically. ASCII only on purpose: PowerShell 5.1
# misparses BOM-less UTF-8 files that contain non-ASCII characters.
#
# Wait condition: the supervisor deletes tools/logs/_hell-selfplay.winpid on exit,
# so a missing / non-numeric value means the chain is gone.
#
# Evaluations (all dual-orientation so first-serve bias cancels, 3200 games each):
#   1) R6 vs current online (R5, adopted 2026-10-19)  - GENERIC STRENGTH GUARD (>=50%)
#   2) R6 vs archived R4 candidate                    - R5 scored 50.89%
#   3) R6 vs built-in nemesis                         - R5 scored 55.27% (post-adopt)
#   4) R6 vs fresh nemesis2 (Phase A product)         - new pairing, want >50%
#   5) R6 vs archived R2                              - R5 scored 60.06%
#   6) R6 holdout ladder (default/pusher/pb/grandslam) - anti-overfit, R5 = 86.96/85.19/90.99/86.86
#   7) PRIMARY: HIP live paired eval (12 seeds x 12 games x 2 sides, --hell-vec)
#      + aggregate hip-eval reports + paired verdict via _r6-paired-hip.js
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

"=== R6 TRAINER DONE $(Get-Date -Format o) ==="
$candidate = 'tools\train-hell-candidate.json'
$nemesis2  = 'tools\logs\_r6-nemesis-candidate.json'
"candidate exists: $(Test-Path $candidate)"
"nemesis2 exists: $(Test-Path $nemesis2)"
if(-not (Test-Path $candidate)){ "FATAL: no candidate, aborting eval chain"; exit 1 }

# ---- 1-5) h2h suite, parallel jobs (each is a single-threaded node run) ----
$jobs = @()
$jobs += Start-Job -Name h2hOnline -ScriptBlock { Set-Location $using:root; node tools\_hell-h2h.js 200 8 2>&1 |
  Out-File -Encoding utf8 tools\logs\_h2h-r6-vs-online.txt }
$jobs += Start-Job -Name h2hR4 -ScriptBlock { Set-Location $using:root; node tools\_hell-h2h.js 200 8 --versus tools\logs\_r4-candidate.json 2>&1 |
  Out-File -Encoding utf8 tools\logs\_h2h-r6-vs-r4.txt }
$jobs += Start-Job -Name h2hNem1 -ScriptBlock { Set-Location $using:root; node tools\_hell-h2h.js 200 8 --opp-nemesis 2>&1 |
  Out-File -Encoding utf8 tools\logs\_h2h-r6-vs-nemesis.txt }
$jobs += Start-Job -Name h2hNem2 -ScriptBlock { Set-Location $using:root; node tools\_hell-h2h.js 200 8 --versus tools\logs\_r6-nemesis-candidate.json 2>&1 |
  Out-File -Encoding utf8 tools\logs\_h2h-r6-vs-nem2.txt }
$jobs += Start-Job -Name h2hR2 -ScriptBlock { Set-Location $using:root; node tools\_hell-h2h.js 200 8 --versus tools\logs\_shipped-20261018-r2-ingame.json 2>&1 |
  Out-File -Encoding utf8 tools\logs\_h2h-r6-vs-r2.txt }
$jobs += Start-Job -Name holdout -ScriptBlock { Set-Location $using:root; node tools\_opp-ladder-hell.js 150 6 --from tools\train-hell-candidate.json 2>&1 |
  Out-File -Encoding utf8 tools\logs\_opp-ladder-r6.txt }
Wait-Job $jobs -Timeout 5400 | Out-Null
Remove-Job $jobs -Force

"--- R6 vs online (R5)  [GUARD >= 50%] ---"
Get-Content tools\logs\_h2h-r6-vs-online.txt -Encoding UTF8
"--- R6 vs R4  [R5 baseline 50.89%] ---"
Get-Content tools\logs\_h2h-r6-vs-r4.txt -Encoding UTF8
"--- R6 vs built-in nemesis  [R5 baseline 55.27%] ---"
Get-Content tools\logs\_h2h-r6-vs-nemesis.txt -Encoding UTF8
"--- R6 vs fresh nemesis2  [new pairing; >50% = learned the fresh pressure] ---"
Get-Content tools\logs\_h2h-r6-vs-nem2.txt -Encoding UTF8
"--- R6 vs archived R2  [R5 baseline 60.06%] ---"
Get-Content tools\logs\_h2h-r6-vs-r2.txt -Encoding UTF8
"--- R6 holdout ladder  [R5: default 86.96 / pusher 85.19 / pb 90.99 / grandslam 86.86] ---"
Get-Content tools\logs\_opp-ladder-r6.txt -Encoding UTF8

# ---- 7) PRIMARY: HIP live paired eval ----
New-Item -ItemType Directory -Force -Path tools\logs\_r6-hip | Out-Null
$baseVec = 'tools\logs\_r5-candidate.json'
$candVec = 'tools\train-hell-candidate.json'
$seeds = 12; $gamesPerSeed = 12
for($s = 0; $s -lt $seeds; $s++){
  $seed = 20261026 + $s * 1000
  node tools\live-match.js --controller hip --opp hell --games $gamesPerSeed --seed $seed `
    --live-only --maxsec 240 --hell-vec $baseVec --json tools\logs\_r6-hip\base-s$s.json |
    Out-File -Encoding utf8 tools\logs\_r6-hip\base-s$s.log
  node tools\live-match.js --controller hip --opp hell --games $gamesPerSeed --seed $seed `
    --live-only --maxsec 240 --hell-vec $candVec --json tools\logs\_r6-hip\cand-s$s.json |
    Out-File -Encoding utf8 tools\logs\_r6-hip\cand-s$s.log
}

# aggregate reports (standard format, Wilson CI)
node tools\hip-eval.js --controller hip --opp hell --games 96 --shards 8 --hell-vec $baseVec 2>&1 |
  Out-File -Encoding utf8 tools\logs\_r6-hip\agg-base.txt
node tools\hip-eval.js --controller hip --opp hell --games 96 --shards 8 --hell-vec $candVec 2>&1 |
  Out-File -Encoding utf8 tools\logs\_r6-hip\agg-cand.txt

"--- HIP live aggregate: baseline (R5) ---"
Get-Content tools\logs\_r6-hip\agg-base.txt -Encoding UTF8 | Select-Object -Last 12
"--- HIP live aggregate: candidate (R6) ---"
Get-Content tools\logs\_r6-hip\agg-cand.txt -Encoding UTF8 | Select-Object -Last 12

"--- PRIMARY paired verdict ---"
node tools\_r6-paired-hip.js 2>&1 | Tee-Object -FilePath tools\logs\_r6-hip\paired-verdict.txt

"=== R6 EVAL DONE $(Get-Date -Format o) ==="
Set-Content -Path tools\logs\_r6-eval-done.flag -Value (Get-Date -Format o) -Encoding ascii
