#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""将 2025 成都混团世界杯(类型"世界杯团体")数据合并到 5 个 2025 分类文件。"""
import json
import shutil
from pathlib import Path

ROOT = Path(r"s:\wfls-tt-club\wfls-tt-club")
TOOLS = ROOT / "tools"
DATA = ROOT / "wtt_data"

TARGET = {
    "MS": ("ms", "score-log-2025-wtt.json"),
    "WS": ("ws", "score-log-2025-ws.json"),
    "MD": ("md", "score-log-2025-wtt.json"),
    "WD": ("wd", "score-log-2025-wtt.json"),
    "XD": ("xd", "score-log-2025-wtt.json"),
}


def key(r):
    return (r.get("日期"), r.get("类型"), r.get("胜者"), r.get("负者"))


for cat, (sub, fn) in TARGET.items():
    src = TOOLS / f"_mtc2025_{cat}.json"
    new_recs = json.loads(src.read_text(encoding="utf-8"))
    target = DATA / sub / fn

    # 备份
    bak = target.with_suffix(".json.bak-mtc")
    shutil.copy2(target, bak)

    data = json.loads(target.read_text(encoding="utf-8-sig"))
    seen = {key(r) for r in data}
    added = 0
    for r in new_recs:
        if key(r) not in seen:
            data.append(r)
            seen.add(key(r))
            added += 1

    data.sort(key=lambda r: (r.get("日期", ""), r.get("胜者", "")))
    target.write_text(
        json.dumps(data, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8", newline="\n",
    )
    wtc = [r for r in data if r.get("类型") == "世界杯团体"]
    print(f"{cat}: +{added} 条 (现世界杯团体 {len(wtc)}, 总 {len(data)}) -> {sub}/{fn}")
