# _r5-final-eval.ps1 - wait for the round-5 (方案C) trainer to exit, then run the
# decisive evaluations automatically. ASCII only on purpose: PowerShell 5.1 misparses
# BOM-less UTF-8 files that contain non-ASCII characters.
#
# Poll winpid: the supervisor deletes tools/logs/_hell-selfplay.winpid on exit,
# so a missing / non-numeric value means the chain is gone.
#
# Five evaluations, all dual-orientation so first-serve bias cancels out:
#   1) R5 vs current online (R2, adopted 2026-10-18)   baseline: R4 scored 59.82%
#   2) R5 vs archived R4 candidate                     baseline: 50% (self-match sanity)
#   3) R5 vs nemesis (held OUT of nothing - in pool, but R4 = 53.77% is the bar)
#   4) R5 vs archived 2026-09-13 shipped hell          baseline: R4 scored 53.52%
#   5) R5 holdout ladder (default / pusher / pb / grandslam) - NOT in the fitness pool,
#      R4 = 86.16 / 84.32 / 91.22 / pending. This is the anti-overfit check.
$ErrorActionPreference = 'SilentlyContinue'
Set-Location (Split-Path -Parent $PSScriptRoot) | Out-Null

$end = (Get-Date).AddHours(12)
while((Get-Date) -lt $end){
  $w = (Get-Content tools\logs\_hell-selfplay.winpid -Raw).Trim()
  $alive = $false
  if($w -match '^\d+$'){ $alive = [bool](Get-Process -Id ([int]$w) -ErrorAction SilentlyContinue) }
  if(-not $alive){ break }
  Start-Sleep -Seconds 180
}

"=== R5 TRAINER DONE $(Get-Date -Format o) ==="
$candidate = 'tools\train-hell-candidate.json'
"candidate exists: $(Test-Path $candidate)"

# 1) decisive: R5 vs the CURRENT online hell (still R2 - R4 has NOT been adopted yet)
node tools\_hell-h2h.js 200 8 2>&1 | Out-File -Encoding utf8 tools\logs\_h2h-r5-vs-online.txt
"--- R5 vs online (R2)  [R4 baseline 59.82%] ---"
Get-Content tools\logs\_h2h-r5-vs-online.txt -Encoding UTF8

# 2) R5 vs archived R4 candidate (the round-5 start point; should be well above 50%)
node tools\_hell-h2h.js 200 8 --versus tools\logs\_r4-candidate.json 2>&1 |
  Out-File -Encoding utf8 tools\logs\_h2h-r5-vs-r4.txt
"--- R5 vs R4  [must be >50%] ---"
Get-Content tools\logs\_h2h-r5-vs-r4.txt -Encoding UTF8

# 3) R5 vs the nemesis (non-hell lineage yardstick; R4 scored 53.77%)
node tools\_hell-h2h.js 200 8 --opp-nemesis 2>&1 | Out-File -Encoding utf8 tools\logs\_h2h-r5-vs-nemesis.txt
"--- R5 vs nemesis  [R4 baseline 53.77%] ---"
Get-Content tools\logs\_h2h-r5-vs-nemesis.txt -Encoding UTF8

# 4) R5 vs archived 2026-09-13 shipped hell (R4 scored 53.52%)
node tools\_hell-h2h.js 200 8 --versus tools\logs\_shipped-20260913-ingame.json 2>&1 |
  Out-File -Encoding utf8 tools\logs\_h2h-r5-vs-old0913.txt
"--- R5 vs archived 2026-09-13  [R4 baseline 53.52%] ---"
Get-Content tools\logs\_h2h-r5-vs-old0913.txt -Encoding UTF8

# 5) HOLDOUT LADDER - opponents that were NOT in the round-5 fitness pool.
#    R4 reference values: default 86.16 / pusher 84.32 / pb 91.22 (+0.8 SE each)
node tools\_opp-ladder-hell.js 150 6 --from tools\train-hell-candidate.json 2>&1 |
  Out-File -Encoding utf8 tools\logs\_opp-ladder-r5.txt
"--- R5 holdout ladder  [R4: default 86.16 / pusher 84.32 / pb 91.22] ---"
Get-Content tools\logs\_opp-ladder-r5.txt -Encoding UTF8

"=== R5 EVAL DONE $(Get-Date -Format o) ==="