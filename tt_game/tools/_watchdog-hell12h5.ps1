# =====================================================================
#  _watchdog-hell12h5.ps1 — Windows 侧看门狗（input3-hell12h5 专用）
#
#  tools/_supervise.sh 自己已经能重启训练器（崩溃/被杀/卡死），但**守护自己**
#  没有上一层：会话被关、Git Bash 被误杀、机器休眠唤醒后守护没了，
# 12h 的预算就白扔（2026-10-05 那次就是这样断的）。
#
#  这一层只做一件事：**守护进程不在了就把它重新拉起来**。
#  判定「在不在」按命令行匹配，不看 PID（换了 PID 也算数）。
#  预算判定读 data/checkpoints/<run>/index.json 的 elapsedSec ——
#  训练器把断点已耗时算在里面，所以跨重启是累计的。
#
#  不重复拉起的情况（都要靠这个，否则会同时跑两个训练器写同一个 index.json）：
#    · 守护在跑 → 不动
#    · 收尾脚本在跑（已经过了训练阶段） → 不动
#    · 用户叫停了（data/.stop/<run>.sup 存在）→ 不动
#    · 预算已满 → 不动
#
#  用法（一般由 tools/_launch-hell12h5-chain.ps1 拉起，也可以手工跑）：
#    powershell -NoProfile -ExecutionPolicy Bypass -File tools/_watchdog-hell12h5.ps1
#  手工停看门狗：Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" |
#                Where-Object { $_.CommandLine -like '*_watchdog-hell12h5.ps1*' } |
#                ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
# =====================================================================
param(
  [string]$Run       = 'input3-hell12h5',
  [int]   $Hours      = 12,
  [int]   $PollSec    = 300,     # 每 5 分钟看一眼
  [string]$Root      = 'S:\wfls-tt-club\wfls-tt-club\tt_game',
  [string]$Bash      = 'C:\Program Files\Git\bin\bash.exe'
)
$ErrorActionPreference = 'Continue'
$budget = $Hours * 3600
$log    = Join-Path $Root "tools\logs\$Run.watchdog.log"
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null

function Say($m){
  $line = "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] $m"
  Add-Content -Path $log -Value $line -Encoding utf8
}

Say "看门狗启动：run=$Run 预算=${Hours}h 轮询=${PollSec}s bash=$Bash"
# 自己把 PID 写进文件：停看门狗只能按 PID 停。
# ★ 不要用 `Get-CimInstance … Where-Object { $_.CommandLine -like '*_watchdog*' }`
#   去匹配再 Stop-Process —— 那会把调用它的宿主 shell 自己也匹配上并杀掉
#   （实测退出码 255、无输出、命令直接消失）。按 PID 文件停是唯一安全的做法。
$Host.UI.RawUI.WindowTitle = "wfls-watchdog-$Run"
Set-Content -Path (Join-Path $Root "tools\logs\$Run.watchdog.pid") -Value $PID -Encoding ascii

while ($true) {
  Start-Sleep -Seconds $PollSec

  # 用户叫停 / 收尾阶段 → 退出
  if (Test-Path (Join-Path $Root "data\.stop\$Run.sup")) {
    Say "检测到 $Run.sup —— 用户叫停，看门狗退出。"; break
  }

  $idx = Join-Path $Root "data\checkpoints\$Run\index.json"
  $elapsed = $null
  if (Test-Path $idx) {
    try { $elapsed = [double](Get-Content $idx -Raw | ConvertFrom-Json).elapsedSec } catch {}
  }

  # 预算已满 → 不再拉起（可能正在收尾，也可能已经收尾完了）
  if ($null -ne $elapsed -and $elapsed -ge $budget) {
    Say "预算已满（elapsedSec=$([int]$elapsed) >= $budget），看门狗退出。"
    break
  }

  $procs = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue
  $hasSup = @($procs | Where-Object { $_.CommandLine -like "*_supervise.sh $Run*" }).Count -gt 0
  $hasFin = @($procs | Where-Object { $_.CommandLine -like "*_finalize-12h.js --run $Run*" }).Count -gt 0

  if ($hasSup) { Say "守护在跑（elapsedSec=$([int]$elapsed)）。"; continue }
  if ($hasFin) { Say "收尾在跑（elapsedSec=$([int]$elapsed)）。"; continue }

  Say "守护不在了 —— 重新拉起整条链路（elapsedSec=$([int]$elapsed)）。"
  $chain = Join-Path $Root 'tools\_run-hell12h5-and-finalize.sh'
  $out   = Join-Path $Root "tools\logs\$Run.chain.log"
  $err   = Join-Path $Root "tools\logs\$Run.chain.err.log"
  $p = Start-Process -FilePath $Bash `
        -ArgumentList @($chain) `
        -WorkingDirectory $Root -WindowStyle Hidden `
        -RedirectStandardOutput $out -RedirectStandardError $err -PassThru
  Say "  已拉起，PID=$($p.Id)，输出 → $out"
}