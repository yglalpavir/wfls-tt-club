# -*- coding: utf-8 -*-
"""results.ittf.link 2012 抓取启动器：自动等待 Cloudflare 冷却结束后，用最小请求量执行全量抓取。

- 循环探测 /login：200 → 解除；429 → 打印剩余倒计时并按 retry-after 睡眠
- 解除后带 --resume --csv --wait --pause 调用 scrape_ittf_2012.py
- 全程 flush 实时输出

用法：
  python -u tools/run_ittf_2012.py            # 等待冷却 + 全量抓取
  python -u tools/run_ittf_2012.py --check    # 只打印当前冷却状态后退出

所需凭据：tools/.ittf_creds.json 或环境变量 ITTF_USER / ITTF_PASS（或 ITTF_COOKIE）。
"""
from __future__ import annotations

import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ittf_client import BASE, IttfClient

SELF_DIR = os.path.dirname(os.path.abspath(__file__))
SCRAPER = os.path.join(SELF_DIR, "scrape_ittf_2012.py")


def probe():
    c = IttfClient(verbose=False, pause=0.0)
    try:
        r = c.get(BASE + "/index.php/login", wait=False, timeout=60)
        ra = r.headers.get("retry-after")
        return r.status_code, int(ra) if ra and ra.isdigit() else 0
    except Exception as e:
        print("  probe error:", type(e).__name__, e, flush=True)
        return None, 0


def remaining_hhmm(sec):
    h = sec // 3600
    m = (sec % 3600) // 60
    return "%dh%02dm" % (h, m)


def main():
    check = "--check" in sys.argv
    while True:
        status, wait = probe()
        if status == 429:
            print("  冷却中，剩余 %s" % remaining_hhmm(wait), flush=True)
            if check:
                return 75
            chunk = min(wait or 300, 300)
            time.sleep(chunk)
            continue
        if status == 200:
            print("\n冷却已解除，开始抓取...", flush=True)
            if check:
                print("OK")
                return 0
            p = subprocess.run([sys.executable, "-u", SCRAPER,
                                "--all", "--resume", "--csv", "--wait", "--pause", "4.0"])
            return p.returncode
        # 网络异常：短暂等待后重试
        print("  探测异常 status=%s，60s 后重试" % status, flush=True)
        time.sleep(60)


if __name__ == "__main__":
    sys.exit(main())