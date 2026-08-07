#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
将 parse_mixedteams.py 解析出的混团记录追加合并到正式 score-log 文件。

用法:
    python tools/append_mixedteams.py 2024

规则:
  - 读取 tools/_mixedteams{YEAR}_{cat}.json（解析产物）
  - 按类别映射到正式文件: MS->ms, WS->ws, MD->md, WD->wd, XD->xd
  - 追加并按日期排序（保持文件原有格式: XD 紧凑单行，其余缩进）
  - 去重（防止重复追加）
"""
import json
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
TOOLS = BASE / "tools"
WTT = BASE / "wtt_data"

CAT_MAP = {
    "MS": ("ms", "score-log-{Y}-wtt.json"),
    "WS": ("ws", "score-log-{Y}-ws.json"),
    "MD": ("md", "score-log-{Y}-wtt.json"),
    "WD": ("wd", "score-log-{Y}-ws.json"),
    "XD": ("xd", "score-log-{Y}-wtt.json"),
}


def is_compact(path):
    """判断文件是否为紧凑单行格式（如 XD 每记录一行）。"""
    text = path.read_text(encoding="utf-8-sig")
    # 若存在以 { 开头的非缩进行，视为紧凑
    for line in text.splitlines():
        s = line.strip()
        if s.startswith("{") and "日期" in s:
            return True
    return False


def main():
    year = sys.argv[1] if len(sys.argv) > 1 else "2024"
    summary = []
    for cat, (sub, fn) in CAT_MAP.items():
        src = TOOLS / f"_mixedteams{year}_{cat}.json"
        if not src.exists():
            print(f"[skip] 无解析产物 {src.name}")
            continue
        new_recs = json.loads(src.read_text(encoding="utf-8"))
        if not new_recs:
            print(f"[skip] {cat} 无新记录")
            continue
        target = WTT / sub / fn.format(Y=year)
        if not target.exists():
            print(f"[WARN] 目标文件不存在: {target}")
            continue

        # 读取现有
        raw = target.read_bytes()
        text = raw.decode("utf-8-sig")
        existing = json.loads(text)

        # 合并去重
        def key(r):
            return (r.get("日期"), r.get("类型"), r.get("胜者"), r.get("负者"))

        seen = {key(r) for r in existing}
        added = 0
        for r in new_recs:
            if key(r) not in seen:
                existing.append(r)
                seen.add(key(r))
                added += 1

        # 按日期排序
        existing.sort(key=lambda r: r.get("日期", ""))

        # 写回（保持格式）
        compact = is_compact(target)
        if compact:
            lines = ["["]
            for i, r in enumerate(existing):
                comma = "," if i < len(existing) - 1 else ""
                # 保持紧凑单行: { "日期": ..., "胜者": ..., "负者": ... }
                lines.append("{ " + ", ".join(
                    f'"{k}": {json.dumps(r[k], ensure_ascii=False)}' for k in r
                ) + " }" + comma)
            lines.append("]")
            out = "\n".join(lines) + "\n"
        else:
            out = json.dumps(existing, ensure_ascii=False, indent=2) + "\n"

        target.write_text(out, encoding="utf-8", newline="\n")
        summary.append(f"{cat}: +{added} (现有 {len(existing)-added} -> 共 {len(existing)})")

    print("\n".join(summary) if summary else "无操作")


if __name__ == "__main__":
    main()
