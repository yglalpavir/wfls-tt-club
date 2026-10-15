# 等待 input3-hell12h5 训练+验收链结束（或超时）。只读，不干预。
$ErrorActionPreference = 'SilentlyContinue'
$root = 'S:\wfls-tt-club\wfls-tt-club\tt_game'
$run  = 'input3-hell12h5'
$ck   = Join-Path $root "data\checkpoints\$run"
$done = Join-Path $root "tools\logs\$run.finalize.done"
$log  = Join-Path $root "tools\logs\$run.waiter.log"
$deadline = (Get-Date).AddHours(14)
$last = ''

function Say($s){
  $line = "[{0}] {1}" -f (Get-Date -Format 'HH:mm:ss'), $s
  Add-Content -Path $log -Value $line -Encoding utf8
  Write-Output $line
}

Say "waiter up for $run ; deadline $deadline"

while((Get-Date) -lt $deadline){
  if(Test-Path $done){ Say "FINALIZE MARKER PRESENT -> $done"; break }

  $idxPath = Join-Path $ck 'index.json'
  $txt = ''
  if(Test-Path $idxPath){
    $j = Get-Content $idxPath -Raw -Encoding utf8 | ConvertFrom-Json
    $cur = $j.cur
    $txt = ("ep={0} elapsed={1:N0}s best={2:N4}@{3} trainW={4} hell={5} default={6} gs={7}" -f `
            $cur.ep, $j.elapsedSec, ($j.best.best*100), $j.best.ep, $cur.trainW, `
            ($cur.wr.hell*100), ($cur.wr.default*100), ($cur.wr.grandslam*100))
  } else { $txt = 'index.json MISSING' }

  $curvePts = 0
  $curveP = Join-Path $ck 'curve.json'
  if(Test-Path $curveP){
    try { $curvePts = (Get-Content $curveP -Raw -Encoding utf8 | ConvertFrom-Json).Count } catch { $curvePts = -1 }
  }

  $trainer = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
               Where-Object { $_.CommandLine -like "*$run*" }).Count
  $chain   = @(Get-CimInstance Win32_Process -Filter "Name='bash.exe'" |
               Where-Object { $_.CommandLine -like "*$run*" }).Count

  $line = "$txt | curve=$curvePts | trainer=$trainer chain=$chain"
  if($line -ne $last){ Say $line; $last = $line }

  if($trainer -eq 0 -and $chain -eq 0){ Say 'no trainer and no chain process -> chain ended'; Start-Sleep -Seconds 90; break }

  Start-Sleep -Seconds 300
}

Say 'waiter exiting'
Get-Content (Join-Path $root "tools\logs\$run.chain.log") -Tail 60 -Encoding utf8
Say '=== finalize report (if any) ==='
Get-ChildItem (Join-Path $root "tools\logs") -Filter "$run.finalize*" | ForEach-Object {
  Say ("--- " + $_.Name + " ---"); Get-Content $_.FullName -Raw -Encoding utf8
}