#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
修复 wtt_data/wd/ 中 score-log 文件命名混乱问题
- 2018-2023: score-log-{y}-ws.json -> score-log-{y}-wtt.json
- 2024/2025/2026: 合并 -ws.json + -wtt.json -> 单个 -wtt.json (按 (日期,类型,胜者,负者) 去重)
- 统一为 2 空格缩进格式
- 更新 manifest.json 只列出 9 个 -wtt.json
幂等: 可重复运行
"""

import json
import os
import shutil

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)
WD_DIR = os.path.join(ROOT_DIR, "wtt_data", "wd")
BACKUP_DIR = os.path.join(BASE_DIR, "backup_wd")

YEARS_RENAME = ["2018", "2019", "2020", "2021", "2022", "2023"]
YEARS_MERGE = ["2024", "2025", "2026"]


def read_json(filepath):
    with open(filepath, "r", encoding="utf-8-sig") as f:
        return json.load(f)


def write_json(filepath, data):
    with open(filepath, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def dedup(records):
    """按 (日期, 类型, 胜者, 负者) 去重，保留首次出现顺序"""
    seen = set()
    out = []
    for r in records:
        key = (r["日期"], r["类型"], r["胜者"], r["负者"])
        if key not in seen:
            seen.add(key)
            out.append(r)
    return out


def main():
    # 1. 备份 (若已存在同内容，跳过以保持幂等)
    os.makedirs(BACKUP_DIR, exist_ok=True)
    if not any(f.startswith("score-log-") for f in os.listdir(BACKUP_DIR)):
        for f in os.listdir(WD_DIR):
            if f.endswith(".json"):
                shutil.copy2(os.path.join(WD_DIR, f), os.path.join(BACKUP_DIR, f))
        print("已备份 wd/ 到 tools/backup_wd/")

    # 2. 2018-2023: 重命名 -ws -> -wtt
    for year in YEARS_RENAME:
        old = os.path.join(WD_DIR, f"score-log-{year}-ws.json")
        new = os.path.join(WD_DIR, f"score-log-{year}-wtt.json")
        if os.path.exists(old):
            os.rename(old, new)
            print(f"{year}: 重命名 -ws.json -> -wtt.json")
        elif os.path.exists(new):
            print(f"{year}: 已是 -wtt.json，跳过")
        else:
            print(f"{year}: 文件缺失？")

    # 3. 2024/2025/2026: 合并去重
    for year in YEARS_MERGE:
        ws_path = os.path.join(WD_DIR, f"score-log-{year}-ws.json")
        wtt_path = os.path.join(WD_DIR, f"score-log-{year}-wtt.json")

        if os.path.exists(ws_path):
            ws_data = read_json(ws_path)
        else:
            ws_data = []

        if os.path.exists(wtt_path):
            wtt_data = read_json(wtt_path)
        else:
            print(f"{year}: 缺少 -wtt.json！")
            continue

        merged = dedup(ws_data + wtt_data)
        write_json(wtt_path, merged)
        print(f"{year}: 合并 {len(ws_data)} + {len(wtt_data)} -> {len(merged)} 条")

        if os.path.exists(ws_path):
            os.remove(ws_path)
            print(f"{year}: 已删除旧 -ws.json")

    # 4. 更新 manifest.json
    new_files = [f"score-log-{year}-wtt.json" for year in
                 YEARS_RENAME + YEARS_MERGE]
    manifest = {"scoreFiles": new_files}
    write_json(os.path.join(WD_DIR, "manifest.json"), manifest)
    print("manifest.json 已更新，列出的文件:")
    for f in new_files:
        if os.path.exists(os.path.join(WD_DIR, f)):
            print(f"  [OK] {f}")
        else:
            print(f"  [MISSING] {f}")

    # 5. 校验
    print("\n=== 校验 ===")
    expected = {"2018": 7, "2019": 15, "2020": 31, "2021": 39, "2022": 37,
                "2023": 106, "2024": 98, "2025": 445, "2026": 234}
    total = 0
    ok = True
    for year in YEARS_RENAME + YEARS_MERGE:
        filepath = os.path.join(WD_DIR, f"score-log-{year}-wtt.json")
        data = read_json(filepath)
        dups = len(data) - len(dedup(data))
        total += len(data)
        status = "OK"
        if dups > 0:
            status = f"WARN: {dups} 条重复"
            ok = False
        if expected[year] != len(data):
            status += f" (预期 {expected[year]})"
            ok = False
        print(f"  {year}: {len(data)} 条 {status}")
    print(f"  总计: {total} 条")
    if ok:
        print("校验通过")
    else:
        print("校验有问题，请检查！")
        raise SystemExit(1)


if __name__ == "__main__":
    main()