/* _stub-trainer.js — 守护脚本（_supervise.sh）的冒烟替身，不参与任何真实训练。
 *
 * 只为验证守护的四件事，别拿它跑真活：
 *   正常推进   —— 周期性写 index.json，elapsedSec 递增
 *   崩溃       —— STUB_MODE=crash：写一次就 exit 1（验证「异常退出→从检查点重启」）
 *   卡死       —— STUB_MODE=hang：写一次然后永不写（验证卡死检测会杀它）
 *   立刻跑满   —— STUB_MODE=fast：一次性把 elapsedSec 写到超过预算（验证预算收尾）
 *
 * 用法：node tools/_stub-trainer.js --from <w> --hours <H> [--resume <index>] ...
 * 环境：STUB_MODE / STUB_RUN / STUB_TICK / STUB_LIFE
 */
'use strict';
const fs = require('fs');
const path = require('path');

const a = process.argv.slice(2);
const arg = (f, d) => { const i = a.indexOf(f); return i >= 0 && a[i + 1] ? a[i + 1] : d; };
const HOURS = parseFloat(arg('--hours', '1'));
const RESUME = arg('--resume', null);
const MODE = process.env.STUB_MODE || 'normal';
const RUN = process.env.STUB_RUN || 'stubrun';
const TICK = parseInt(process.env.STUB_TICK || '3', 10);   // 写 index 的间隔（秒）
const LIFE = parseInt(process.env.STUB_LIFE || '3600', 10); // 活多久（秒）

const dir = path.join(__dirname, '..', 'data', 'checkpoints', RUN);
const idx = RESUME && fs.existsSync(RESUME) ? RESUME : path.join(dir, 'index.json');
fs.mkdirSync(dir, { recursive: true });

const readIdx = () => { try { return JSON.parse(fs.readFileSync(idx, 'utf8')); } catch (e) { return {}; } };
const D = readIdx();
const cur = parseFloat(D.elapsedSec || 0);

function write(ep) {
  fs.writeFileSync(idx, JSON.stringify({
    run: RUN, stub: true, mode: MODE,
    elapsedSec: cur + (Date.now() - T0) / 1000,
    cur: { ep }, updated: new Date().toISOString(),
  }, null, 1));
}

const T0 = Date.now();
console.log('[stub] mode=' + MODE + ' run=' + RUN + ' winpid=' + process.pid + ' idx=' + idx + ' elapsed0=' + cur);

if (MODE === 'fast') { write(0); process.exit(0); }

write(0);
if (MODE === 'crash') { console.log('[stub] 故意崩溃'); process.exit(1); }
if (MODE === 'hang') { console.log('[stub] 假装卡死：不再写 index.json'); setInterval(() => {}, 1e9); }
else { setInterval(() => write(1), TICK * 1000); }

setTimeout(() => { write(99); console.log('[stub] 活到 ' + LIFE + 's，正常退出'); process.exit(0); }, LIFE * 1000);