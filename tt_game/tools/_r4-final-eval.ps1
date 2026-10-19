# _r4-final-eval.ps1 - wait for the round-4 trainer to exit, then run the decisive
# 3200-game dual-orientation evaluations automatically (ASCII only on purpose:
# PowerShell 5.1 misparses BOM-less UTF-8 files that contain non-ASCII).
#
# Poll winpid: the supervisor deletes tools/logs/_hell-selfplay.winpid on exit,
# so a missing / non-numeric value means the chain is gone.
$ErrorActionPreference = 'SilentlyContinue'
Set-Location (Split-Path -Parent $PSScriptRoot) | Out-Null

$end = (Get-Date).AddHours(4)
while((Get-Date) -lt $end){
  $w = (Get-Content tools\logs\_hell-selfplay.winpid -Raw).Trim()
  $alive = $false
  if($w -match '^\d+$'){ $alive = [bool](Get-Process -Id ([int]$w) -ErrorAction SilentlyContinue) }
  if(-not $alive){ break }
  Start-Sleep -Seconds 120
}

"=== R4 TRAINER DONE $(Get-Date -Format o) ==="
$candidate = 'tools\train-hell-candidate.json'
"candidate exists: $(Test-Path $candidate)"

# 1) decisive: R4 candidate vs the CURRENT online hell (= R2, adopted 2026-10-18)
node tools\_hell-h2h.js 200 8 2>&1 | Out-File -Encoding utf8 tools\logs\_h2h-r4-vs-online.txt
"--- R4 vs online (R2) ---"
Get-Content tools\logs\_h2h-r4-vs-online.txt -Encoding UTF8

# 2) R4 candidate vs the archived 2026-09-13 shipped hell (baseline: R2 scored 57.27%)
node tools\_hell-h2h.js 200 8 --versus tools\logs\_shipped-20260913-ingame.json 2>&1 |
  Out-File -Encoding utf8 tools\logs\_h2h-r4-vs-old0913.txt
"--- R4 vs archived 2026-09-13 ---"
Get-Content tools\logs\_h2h-r4-vs-old0913.txt -Encoding UTF8

# 3) R4 candidate vs the nemesis (baseline: R2 scored 38.20% -> higher = less specialised)
node tools\_hell-h2h.js 200 8 --opp-nemesis 2>&1 | Out-File -Encoding utf8 tools\logs\_h2h-r4-vs-nemesis.txt
"--- R4 vs nemesis ---"
Get-Content tools\logs\_h2h-r4-vs-nemesis.txt -Encoding UTF8

"=== R4 EVAL DONE $(Get-Date -Format o) ==="