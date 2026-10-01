#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""扫描 data/ 与 wtt_data/ 生成 data/dataset-stats.json（data_scale.html 的数据源）。

只统计浏览器算不出来的量：wtt_data 有 10 MB / 85 个文件，访客页面不可能为了几个数字
把它全量下载，因此这些汇总在部署时算好写成一个小 JSON，页面一次请求取回。
页面自己能算的（成员数、比赛条数、赛季快照日等）由 js/data-scale.js 实时统计。

口径要点：
- WTT 双打项目的 胜者/负者 是 "A/B" 组合串，去重球员数必须先拆对再取两边成员，
  否则会把一个组合算成一个人（与 ci_validate.py 的 split_pair 同一口径）。
- 球员合计跨项目取并集，不是各项目之和。
- 内容改稿留档版本 = data/{news,competitions,qa}/{id}/{id}.v{n}.json 的文件数
  （GitHub Pages 无法列目录，只能由本脚本数）。

产物为部署时生成文件（与 data/api/、Assets/manifest.json 同一模式）：gitignored、
不进仓库，由 deploy 工作流在每次部署前现场重新生成，避免"加了比赛忘了重算"。
本地开发/调试时需手动运行一次本脚本。

缺失目录或解析失败一律降级为缺字段，绝不抛异常中断部署——页面会安静地少渲染几张磁贴。

用法:
  python tools/gen_dataset_stats.py
"""
import json
import os
import sys
from datetime import datetime

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
WTT_DIR = os.path.join(ROOT, "wtt_data")
OUT_PATH = os.path.join(DATA_DIR, "dataset-stats.json")

# 单项目录顺序 = 页面占比条顺序（人数最多的在前）
WTT_DIR_KEYS = ["ms", "ws", "md", "wd", "xd"]
# 内容类型 -> (数据目录, 版本快照通配)
CONTENT_TYPES = ["news", "competitions", "qa"]


def load_json(path):
    """与 ci_validate.py 同口径：容忍 BOM，失败返回 None（不抛）。"""
    try:
        with open(path, encoding="utf-8-sig") as f:
            return json.load(f)
    except Exception:
        return None


def split_pair(name):
    """"A/B" -> ["A", "B"]；不是恰好两个非空成员则返回 None（同 ci_validate.split_pair）。"""
    if not isinstance(name, str) or "/" not in name:
        return None
    parts = [p.strip() for p in name.split("/")]
    if len(parts) == 2 and parts[0] and parts[1]:
        return parts
    return None


def score_files(abs_dir):
    """目录下所有 score-log-*.json（按文件名排序，保证输出确定性）。"""
    try:
        names = sorted(n for n in os.listdir(abs_dir) if n.startswith("score-log-") and n.endswith(".json"))
    except OSError:
        return []
    return [os.path.join(abs_dir, n) for n in names]


def year_of(filename):
    """"score-log-2016-wtt.json" -> 2016；取不到返回 None。"""
    for part in filename.replace("\\", "/").split("/")[-1].split("-"):
        if len(part) == 4 and part.isdigit():
            y = int(part)
            if 1900 < y < 2200:
                return y
    return None


def stats_wtt_dir(key):
    """单个项目目录的记录数 / 去重球员数 / 赛事类型数 / 文件数 / 年份。"""
    abs_dir = os.path.join(WTT_DIR, key)
    files = score_files(abs_dir)
    if not files:
        return None

    players = set()
    event_types = set()
    records = 0
    years = set()
    dates_from = None
    dates_to = None

    for path in files:
        y = year_of(path)
        if y:
            years.add(y)
        data = load_json(path)
        if not isinstance(data, list):
            continue
        for rec in data:
            if not isinstance(rec, dict):
                continue
            records += 1
            t = rec.get("类型")
            if isinstance(t, str) and t:
                event_types.add(t)
            d = rec.get("日期")
            if isinstance(d, str) and len(d) == 10:
                dates_from = d if dates_from is None or d < dates_from else dates_from
                dates_to = d if dates_to is None or d > dates_to else dates_to
            # 组合串先拆对，否则一个组合会被当成一个人
            for field in ("胜者", "负者"):
                name = rec.get(field)
                if not isinstance(name, str) or not name:
                    continue
                pair = split_pair(name)
                if pair:
                    players.update(pair)
                else:
                    players.add(name.strip())

    return {
        "key": key,
        "files": len(files),
        "records": records,
        "players": len(players),
        "eventTypes": len(event_types),
        "years": [min(years), max(years)] if years else None,
        "datesFrom": dates_from,
        "datesTo": dates_to,
        "_players": players,
        "_eventTypes": event_types,
    }


def stats_wtt():
    dirs = []
    union_players = set()
    union_events = set()
    totals = {"files": 0, "records": 0}
    dates_from = None
    dates_to = None
    years = set()

    for key in WTT_DIR_KEYS:
        st = stats_wtt_dir(key)
        if not st:
            continue
        union_players |= st.pop("_players")
        union_events |= st.pop("_eventTypes")
        dirs.append(st)
        totals["files"] += st["files"]
        totals["records"] += st["records"]
        if st.get("years"):
            years.update(st["years"])
        for field, better in (("datesFrom", "min"), ("datesTo", "max")):
            v = st.get(field)
            if v:
                dates_from = v if dates_from is None else min(dates_from, v)
                dates_to = v if dates_to is None else max(dates_to, v)

    # 球员关联条目数（ms/ws 的 assoc.json：姓名 -> 元数据）
    assoc_keys = 0
    for key in WTT_DIR_KEYS:
        assoc = load_json(os.path.join(WTT_DIR, key, "assoc.json"))
        if isinstance(assoc, dict):
            assoc_keys += len(assoc)

    out = {"dirs": dirs}
    if union_players or union_events or totals["records"]:
        totals["players"] = len(union_players)
        totals["eventTypes"] = len(union_events)
        out["totals"] = totals
        if dates_from and dates_to:
            out["dateRange"] = {"from": dates_from, "to": dates_to}
        if years:
            out["years"] = [min(years), max(years)]
    if assoc_keys:
        out["assocKeys"] = assoc_keys
    return out, dirs


def stats_content_revisions():
    """内容改稿留档版本数：data/{类型}/{id}/{id}.v{n}.json。"""
    per_type = {}
    for t in CONTENT_TYPES:
        type_dir = os.path.join(DATA_DIR, t)
        n = 0
        try:
            entries = sorted(os.listdir(type_dir))
        except OSError:
            per_type[t] = 0
            continue
        for entry in entries:
            entry_dir = os.path.join(type_dir, entry)
            if not os.path.isdir(entry_dir):
                continue
            try:
                n += sum(1 for f in os.listdir(entry_dir) if ".v" in f and f.endswith(".json"))
            except OSError:
                pass
        per_type[t] = n
    total = sum(per_type.values())
    return {"revisions": total, "revisionsByType": per_type} if total else {}


def dir_bytes(abs_dir, skip_names=()):
    """递归目录字节合计（跳过点开头文件与指定文件名）。"""
    total = 0
    for dirpath, dirnames, filenames in os.walk(abs_dir):
        dirnames[:] = [d for d in dirnames if not d.startswith(".") and d != "__pycache__"]
        for name in filenames:
            if name.startswith(".") or name in skip_names:
                continue
            try:
                total += os.path.getsize(os.path.join(dirpath, name))
            except OSError:
                pass
    return total


def stats_bytes():
    """data/ 与 wtt_data/ 的体积合计（页面只显示合计值，不暴露目录名）。"""
    data_bytes = dir_bytes(DATA_DIR, skip_names=("dataset-stats.json",))
    wtt_bytes = dir_bytes(WTT_DIR)
    total = data_bytes + wtt_bytes
    return {"total": total} if total else {}


def main():
    if not os.path.isdir(DATA_DIR):
        print("错误：找不到 data/ 目录（%s）" % DATA_DIR, file=sys.stderr)
        return 1

    wtt, _ = stats_wtt()
    stats = {"generatedAt": datetime.now().astimezone().isoformat(timespec="seconds")}
    if wtt:
        stats["wtt"] = wtt
    stats["content"] = stats_content_revisions() or None
    if stats["content"] is None:
        del stats["content"]
    stats["bytes"] = stats_bytes() or None
    if stats["bytes"] is None:
        del stats["bytes"]

    with open(OUT_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(stats, f, ensure_ascii=False, indent=1)
        f.write("\n")

    totals = wtt.get("totals") if wtt else None
    rev = stats.get("content", {}).get("revisions")
    mb = stats.get("bytes", {}).get("total", 0) / 1024 / 1024
    print("已生成 data/dataset-stats.json：职业赛事 %s 条 / %s 人 / %s 种赛事 · 留档 %s 版 · 数据文件合计 %.1f MB" % (
        (totals or {}).get("records"), (totals or {}).get("players"),
        (totals or {}).get("eventTypes"), rev, mb))
    if not totals:
        print("  [提示] 未读到 wtt_data/ 记录，页面会少渲染职业赛事相关数字")
    return 0


if __name__ == "__main__":
    sys.exit(main())
