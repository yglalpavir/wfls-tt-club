#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
内容数据同步脚本（news / competitions / qa）

存放约定（每条目一个文件夹）:
  data/{type}/
  ├── index.json             生成：元数据索引（id/date/title/excerpt/tag/media/visible）
  ├── search.json            生成：搜索索引（id/date/title/excerpt/content）
  └── {id}/
      ├── {id}.json          展示 JSON（唯一数据源，编辑维护时改它，纯内容字段）
      ├── {id}.history.json  版本清单（生成）：[{version, updatedAt, title, visible, file}] 新→旧
      └── {id}.v{n}.json     版本快照 v{n}（生成，只读；n 从 1 起递增，只增不改）

命名规则:
  - 展示文件:  {id}.json
  - 版本快照:  {id}.v{版本号}.json     （如 n1.v1.json、n1.v2.json）
  - 版本清单:  {id}.history.json       （列出版本号/更新日期/标题/可见性/文件名）

条目展示 JSON 可携带三个可选字段:
  - "visible": false  表示前台隐藏（仍进入 index.json/search.json，前端过滤；再改回 true 即可恢复）
  - "media": []       媒体附件列表
  - "contentFile":    正文引用 Markdown 文件，替代直接写 "content"
      * 值为文件名（如 "content.md"）时，指向条目文件夹下 {type}/{id}/content.md
      * 值为含 "/" 的路径（如 "Assets/md/n1.md" 或 "/Assets/md/n1.md"）时，指向站点根目录相对路径
      * 同步时脚本自动读取该文件，把正文内联进 search.json 与版本快照；前端详情页也会实时拉取该文件
      * "content" 与 "contentFile" 同时存在时以 contentFile 为准（不做内联校验警告）
      * 版本比较基于内联后的正文：md 内容变了即归档新版本快照

版本历史由脚本自动维护（写入快照文件与清单，不修改展示文件）:
  - 首次同步为条目建立 v1 基线快照（updatedAt 取条目 date）
  - 此后每次内容变更（date/title/excerpt/content/tag/media 任一变化），自动把新内容归档为
    新版本快照 {id}.v{n+1}.json（updatedAt 为当天），清单从新到旧排列
  - 清单每次同步都会重写（幂等），快照文件只增不改
  - 可在快照文件上设 "visible": false，从详情页历史列表中隐藏该版本（同步时保留进清单）

用法:
  python tools/sync_content.py            同步索引 + 维护版本历史（含旧版扁平文件一次性迁移）
  python tools/sync_content.py --check    仅校验（含预计新增快照数），不写入任何文件

校验（输出警告）:
  - 展示文件名 == 条目 id，且位于 {id}/{id}.json
  - 必填字段 id / date / title / excerpt / tag
  - tag 白名单
  - date 包含 YYYY-MM-DD（用于排序）
  - media 引用的文件真实存在
  - 同一类型内 id 唯一
  - 清单与快照文件结构合法（版本号递增、清单与快照一一对应、快照字段齐全）
"""

import argparse
import copy
import glob
import json
import os
import re
import shutil
import sys
from datetime import date

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")

# news: 对应的条目目录（三类通用）
TYPES = ["news", "competitions", "qa"]

# 顶层生成文件（不视为条目文件）
GENERATED_FILES = {"index.json", "search.json"}

TAG_WHITELIST = {
    "news": ["notice", "daily", "match", "training", "event"],
    "competitions": ["result", "upcoming", "live"],
    "qa": ["notice"],
}

REQUIRED_FIELDS = ["id", "date", "title", "excerpt", "tag"]

# 参与版本快照的内容字段（变动即归档新版本）
SNAPSHOT_KEYS = ["date", "title", "excerpt", "content", "tag", "media"]

# 清单字段
MANIFEST_KEYS = ["version", "updatedAt", "title", "visible", "file"]

DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}")

TODAY = date.today().isoformat()

warnings = 0


def log_warn(msg):
    global warnings
    warnings += 1
    print("  [警告] " + msg)


def log_error(msg):
    print("  [错误] " + msg)


def load_json(path, quiet=False):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        if not quiet:
            log_error("无法读取 {}: {}".format(path, e))
        return None


def write_json(path, data):
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def date_key(item):
    d = str(item.get("date") or "")
    m = DATE_RE.search(d)
    return m.group(0) if m else ""


def entry_dir_path(type_name, item_id):
    return os.path.join(DATA_DIR, type_name, item_id)


def entry_file_path(type_name, item_id):
    return os.path.join(entry_dir_path(type_name, item_id), item_id + ".json")


def manifest_file_path(type_name, item_id):
    return os.path.join(entry_dir_path(type_name, item_id), item_id + ".history.json")


def snapshot_file_path(type_name, item_id, version):
    return os.path.join(entry_dir_path(type_name, item_id), "{}.v{}.json".format(item_id, version))


def validate_item(type_name, item, filename):
    """对单个条目做校验，返回 True 表示通过（无致命问题）"""
    if not isinstance(item, dict):
        log_error("{} 不是对象".format(filename))
        return False

    item_id = str(item.get("id") or "")
    if not item_id:
        log_error("{} 缺少 id".format(filename))
        return False

    if filename != item_id:
        log_warn("{}: 文件名与 id 不一致（{}）".format(filename, item_id))

    for field in REQUIRED_FIELDS:
        if not item.get(field):
            log_warn("{}: 缺少必填字段 {} ".format(filename, field))

    tag = item.get("tag")
    if tag and tag not in TAG_WHITELIST.get(type_name, []):
        log_warn("{}: tag \"{}\" 不在 {}.{} 白名单中".format(filename, tag, type_name, TAG_WHITELIST.get(type_name)))

    if not date_key(item):
        log_warn("{}: date \"{}\" 不含 YYYY-MM-DD，将排在索引末尾".format(filename, item.get("date")))

    for m in item.get("media") or []:
        if isinstance(m, dict) and m.get("src"):
            path = os.path.normpath(os.path.join(ROOT, m["src"]))
            if not os.path.exists(path):
                log_warn("{}: media 文件不存在 {}".format(filename, m["src"]))

    return True


def content_file_path(type_name, item_id, content_file):
    """解析 contentFile 引用的 Markdown 实际路径：
    纯文件名 → 条目文件夹 {type}/{id}/{file}；含 "/" → 站点根目录相对路径。"""
    cf = str(content_file or "").replace("\\", "/").lstrip("/")
    if not cf:
        return None
    if "/" in cf:
        return os.path.normpath(os.path.join(ROOT, cf))
    return os.path.join(entry_dir_path(type_name, item_id), cf)


def read_effective_content(type_name, item, quiet=False):
    """返回条目有效正文：contentFile 优先（读取 md 文件内联），否则取 content 字段。"""
    content_file = item.get("contentFile")
    if content_file:
        item_id = str(item.get("id") or "")
        path = content_file_path(type_name, item_id, content_file)
        if not path or not os.path.exists(path):
            if not quiet:
                log_warn("{}: contentFile 文件不存在 {}".format(item_id or "?", content_file))
            return item.get("content")
        try:
            with open(path, "r", encoding="utf-8") as f:
                return f.read()
        except Exception as e:
            if not quiet:
                log_warn("{}: 无法读取 contentFile {}: {}".format(item_id or "?", content_file, e))
            return item.get("content")
    return item.get("content")


def snapshot_of(item):
    """取条目中参与版本快照的内容字段"""
    return {k: item.get(k) for k in SNAPSHOT_KEYS}


def effective_snapshot(item, content):
    """参与版本快照的内容字段，content 以内联后的有效正文为准"""
    snap = {k: item.get(k) for k in SNAPSHOT_KEYS}
    snap["content"] = content
    return snap


def snapshot_version(snap):
    try:
        return int(snap.get("version") or 0)
    except (TypeError, ValueError):
        return 0


def validate_snapshot(type_name, snap, item_id):
    """校验单个版本快照文件内容"""
    if not isinstance(snap, dict):
        log_warn("{}: 版本快照不是对象".format(item_id))
        return
    v = snapshot_version(snap)
    if v < 1:
        log_warn("{}: 版本快照版本号非法（{}）".format(item_id, snap.get("version")))
    if not snap.get("updatedAt"):
        log_warn("{}: 版本快照缺少 updatedAt（v{}）".format(item_id, v))
    missing = [k for k in REQUIRED_FIELDS if k != "id" and not snap.get(k)]
    if missing:
        log_warn("{}: 版本快照缺少字段 {}".format(item_id, missing))
    if "visible" in snap and not isinstance(snap.get("visible"), bool):
        log_warn("{}: 版本快照 visible 需为布尔值（v{}）".format(item_id, v))


def load_history(type_name, item_id):
    """读取 {id}.history.json 清单与对应快照文件。
    返回 (manifest, snapshots, problems)：
      - manifest: 清单列表（新→旧），无则 []
      - snapshots: {version: 快照内容}
      - problems: True 表示结构有问题（校验时输出）
    旧版内嵌 history 不在此处理（迁移逻辑负责抽取）。
    """
    manifest_path = manifest_file_path(type_name, item_id)
    manifest = []
    problems = False
    if os.path.exists(manifest_path):
        data = load_json(manifest_path, quiet=True)
        if not isinstance(data, list):
            log_warn("{}: history 清单不是数组".format(item_id))
            problems = True
            data = []
        manifest = [m for m in data if isinstance(m, dict)]

    snapshots = {}
    for m in manifest:
        v = snapshot_version(m)
        fname = m.get("file")
        if not fname:
            log_warn("{}: 清单条目缺少 file（v{}）".format(item_id, v))
            problems = True
            continue
        if fname != "{}.v{}.json".format(item_id, v):
            log_warn("{}: 清单 file \"{}\" 与命名规则不一致".format(item_id, fname))
            problems = True
        fpath = os.path.join(entry_dir_path(type_name, item_id), fname)
        if os.path.exists(fpath):
            snap = load_json(fpath, quiet=True)
            if isinstance(snap, dict):
                if snapshot_version(snap) != v:
                    log_warn("{}: 快照 {} 内版本号（{}）与清单不一致".format(item_id, fname, snap.get("version")))
                    problems = True
                snapshots[v] = snap
            else:
                log_warn("{}: 快照文件 {} 无法解析".format(item_id, fname))
                problems = True
        else:
            log_warn("{}: 清单引用的快照文件不存在 {}".format(item_id, fname))
            problems = True

    # 校验版本号从新到旧递减
    prev_v = None
    for m in manifest:
        v = snapshot_version(m)
        if v < 1:
            log_warn("{}: 清单版本号非法（{}）".format(item_id, m.get("version")))
            problems = True
        if prev_v is not None and v >= prev_v:
            log_warn("{}: 清单版本号未从新到旧递减（v{} 在 v{} 之后）".format(item_id, v, prev_v))
            problems = True
        prev_v = v

    for v, snap in snapshots.items():
        validate_snapshot(type_name, snap, item_id)

    return manifest, snapshots, problems


def maintain_history(type_name, item, manifest, snapshots, content=None):
    """维护条目版本历史（清单 + 快照文件），不修改展示文件。
    返回 (new_manifest, new_snapshot, changed)：
      - new_manifest: 新清单（新→旧）
      - new_snapshot: 需要新写的快照 (version, content) 或 None
      - changed: 清单是否需要重写

    规则:
      - 无清单 → 建立 v1 基线（updatedAt 取条目 date）
      - 当前内容与最新快照一致 → 幂等
      - 当前内容有变化 → 归档新版本（version + 1，updatedAt 为今天）
      - content 为内联后的有效正文（contentFile 优先读 md 文件），
        快照中以内联正文落盘，md 内容变了即归档新版本
    """
    cur = effective_snapshot(item, content)
    item_id = str(item.get("id") or "")

    if not manifest:
        snap = dict(cur)
        snap["version"] = 1
        snap["updatedAt"] = str(item.get("date") or TODAY)
        entry = {
            "version": 1,
            "updatedAt": snap["updatedAt"],
            "title": snap.get("title") or "",
            "visible": snap.get("visible") if "visible" in snap else None,
            "file": "{}.v1.json".format(item_id),
        }
        return [entry], (1, snap), True

    top = manifest[0]
    top_v = snapshot_version(top)
    top_snap = snapshots.get(top_v)
    if top_snap is not None and snapshot_of(top_snap) == cur:
        # 内容未变：仅同步清单（保留快照中的 visible 标记）
        new_manifest = []
        changed = False
        for m in manifest:
            v = snapshot_version(m)
            snap = snapshots.get(v)
            e = {
                "version": v,
                "updatedAt": m.get("updatedAt") or (snap.get("updatedAt") if snap else None),
                "title": (snap.get("title") if snap and snap.get("title") else m.get("title")) or "",
                "visible": (snap.get("visible") if snap and "visible" in snap else m.get("visible")),
                "file": m.get("file") or "{}.v{}.json".format(item_id, v),
            }
            if e != m:
                changed = True
            new_manifest.append(e)
        return new_manifest, None, changed

    v = top_v + 1
    snap = dict(cur)
    snap["version"] = v
    snap["updatedAt"] = TODAY
    entry = {
        "version": v,
        "updatedAt": TODAY,
        "title": snap.get("title") or "",
        "visible": None,
        "file": "{}.v{}.json".format(item_id, v),
    }
    return [entry] + manifest, (v, snap), True


def migrate_flat_entry(type_name, fpath):
    """一次性迁移：把旧版扁平条目文件 data/{type}/{id}.json（含内嵌 history）
    迁移为条目文件夹结构：
      data/{type}/{id}/{id}.json（剥离 history）
      data/{type}/{id}/{id}.history.json（清单）
      data/{type}/{id}/{id}.v{n}.json（快照文件）
    返回 True 表示迁移成功。
    """
    filename = os.path.splitext(os.path.basename(fpath))[0]
    item = load_json(fpath)
    if item is None:
        log_error("{}: 无法读取，跳过迁移".format(fpath))
        return False
    if not isinstance(item, dict) or not item.get("id"):
        log_error("{}: 不是合法条目文件，跳过迁移".format(fpath))
        return False

    item_id = str(item["id"])
    if item_id != filename:
        log_warn("{}: 文件名与 id 不一致（{}），仍按 id 迁移".format(filename, item_id))

    # 内嵌 history（新→旧）抽取为快照文件
    hist = item.pop("history", None)
    if not isinstance(hist, list):
        hist = None

    dir_path = entry_dir_path(type_name, item_id)
    if os.path.isdir(dir_path):
        log_warn("{}: 条目文件夹已存在，跳过迁移（保留扁平文件）".format(item_id))
        item["history"] = hist
        return False

    os.makedirs(dir_path)

    manifest = []
    if hist:
        for snap in hist:
            if not isinstance(snap, dict):
                log_warn("{}: 内嵌 history 中存在非对象条目，已忽略".format(item_id))
                continue
            v = snapshot_version(snap)
            if v < 1:
                log_warn("{}: 内嵌 history 版本号非法（{}）".format(item_id, snap.get("version")))
                continue
            write_json(snapshot_file_path(type_name, item_id, v), snap)
            manifest.append({
                "version": v,
                "updatedAt": snap.get("updatedAt") or "",
                "title": snap.get("title") or "",
                "visible": snap.get("visible") if "visible" in snap else None,
                "file": "{}.v{}.json".format(item_id, v),
            })
    else:
        snap = snapshot_of(item)
        snap["version"] = 1
        snap["updatedAt"] = str(item.get("date") or TODAY)
        write_json(snapshot_file_path(type_name, item_id, 1), snap)
        manifest.append({
            "version": 1,
            "updatedAt": snap["updatedAt"],
            "title": snap.get("title") or "",
            "visible": None,
            "file": "{}.v1.json".format(item_id),
        })

    manifest.sort(key=lambda m: snapshot_version(m), reverse=True)
    write_json(manifest_file_path(type_name, item_id), manifest)
    write_json(entry_file_path(type_name, item_id), item)
    os.remove(fpath)
    print("  [迁移] {} -> {}/{}（快照 {} 个）".format(
        os.path.basename(fpath), type_name, item_id, len(manifest)))
    return True


def flat_entry_files(type_name):
    """返回顶层旧版扁平条目文件（除 index.json / search.json 外）"""
    dir_path = os.path.join(DATA_DIR, type_name)
    if not os.path.isdir(dir_path):
        return []
    return [f for f in sorted(glob.glob(os.path.join(dir_path, "*.json")))
            if os.path.basename(f) not in GENERATED_FILES]


def migrate_flat_files(type_name):
    """迁移旧版扁平条目文件（写文件）。"""
    for f in flat_entry_files(type_name):
        migrate_flat_entry(type_name, f)


def simulate_flat_manifest(item, item_id):
    """内存模拟扁平文件迁移后的 (manifest, snapshots)，不写文件。
    内嵌 history（新→旧）抽取为清单与快照字典；无 history 则视为空。"""
    hist = item.get("history")
    manifest, snapshots = [], {}
    if isinstance(hist, list):
        for snap in hist:
            if not isinstance(snap, dict):
                continue
            v = snapshot_version(snap)
            if v < 1:
                continue
            snapshots[v] = snap
            manifest.append({
                "version": v,
                "updatedAt": snap.get("updatedAt") or "",
                "title": snap.get("title") or "",
                "visible": snap.get("visible") if "visible" in snap else None,
                "file": "{}.v{}.json".format(item_id, v),
            })
        manifest.sort(key=snapshot_version, reverse=True)
    return manifest, snapshots


def scan_entries(type_name):
    """扫描条目文件夹，返回 [(item_id, item)]。"""
    dir_path = os.path.join(DATA_DIR, type_name)
    if not os.path.isdir(dir_path):
        log_warn("{}: {} 目录不存在".format(type_name, dir_path))
        return []

    entries = []
    for folder in sorted(glob.glob(os.path.join(dir_path, "*"))):
        if not os.path.isdir(folder):
            continue
        item_id = os.path.basename(folder)
        fpath = os.path.join(folder, item_id + ".json")
        if not os.path.exists(fpath):
            log_warn("{}: 条目文件夹缺少展示文件 {}/{}.json".format(type_name, item_id, item_id))
            continue
        item = load_json(fpath)
        if item is None or not isinstance(item, dict):
            continue
        if item.get("id") is not None and str(item["id"]) != item_id:
            log_warn("{}: 展示文件 id（{}）与文件夹名不一致".format(item_id, item["id"]))
        entries.append((item_id, item))

    return entries


def sync_type(type_name):
    """迁移旧版扁平文件，扫描条目，维护版本历史，重新生成 index.json 与 search.json。"""
    dir_path = os.path.join(DATA_DIR, type_name)
    migrate_flat_files(type_name)
    entries = scan_entries(type_name)

    items = []
    seen_ids = set()
    rewritten = 0
    new_snapshots = 0
    total_snaps = 0
    hidden_snaps = 0
    for item_id, item in entries:
        if not validate_item(type_name, item, item_id):
            continue
        item_id = str(item["id"])
        if item_id in seen_ids:
            log_warn("{}: id \"{}\" 重复，只保留第一个".format(type_name, item_id))
            continue
        seen_ids.add(item_id)

        content = read_effective_content(type_name, item)
        manifest, snapshots, _ = load_history(type_name, item_id)
        before = len(manifest)
        new_manifest, new_snap, changed = maintain_history(type_name, item, manifest, snapshots, content)
        if new_snap is not None:
            v, snap = new_snap
            write_json(snapshot_file_path(type_name, item_id, v), snap)
            new_snapshots += 1
        if changed:
            write_json(manifest_file_path(type_name, item_id), new_manifest)
            rewritten += 1
        after = len(new_manifest)
        total_snaps += after
        hidden_snaps += sum(1 for m in new_manifest if m.get("visible") is False)
        items.append(item)

    items.sort(key=lambda i: (date_key(i), str(i.get("id") or "")), reverse=True)

    # index.json：元数据（供列表/详情兜底，不含 content/history）
    index_data = []
    for it in items:
        meta = {k: it.get(k) for k in ("id", "date", "title", "excerpt", "tag", "media", "visible")}
        index_data.append(meta)
    write_json(os.path.join(dir_path, "index.json"), index_data)

    # search.json：搜索索引（含 content，不含 history；前端过滤 visible）
    search_data = []
    for it in items:
        entry = {k: it.get(k) for k in ("id", "date", "title", "excerpt", "content")}
        entry["content"] = read_effective_content(type_name, it, quiet=True)
        search_data.append(entry)
    write_json(os.path.join(dir_path, "search.json"), search_data)

    hidden = sum(1 for i in items if i.get("visible") is False)
    print("[{}] index.json/search.json 已更新: {} 条（隐藏 {}）· 快照 {} 个（隐藏 {}）· 清单重写 {} · 新增快照 {}".format(
        type_name, len(items), hidden, total_snaps, hidden_snaps, rewritten, new_snapshots))


def check_type(type_name):
    """仅校验：模拟历史维护（含迁移检测），不写入任何文件。"""
    dir_path = os.path.join(DATA_DIR, type_name)
    if not os.path.isdir(dir_path):
        return

    # 检测旧版扁平文件（不实际迁移）
    flat = [os.path.basename(f) for f in sorted(glob.glob(os.path.join(dir_path, "*.json")))
            if os.path.basename(f) not in GENERATED_FILES]
    if flat:
        print("[{}] 校验发现 {} 个旧版扁平条目文件（下次同步将迁移）: {}".format(
            type_name, len(flat), ", ".join(flat)))

    planned = 0
    hidden = 0
    total_snaps = 0
    for item_id, item in scan_entries(type_name):
        if item is None or not isinstance(item, dict):
            continue
        if not validate_item(type_name, item, item_id):
            continue
        manifest, snapshots, _ = load_history(type_name, item_id)
        if item.get("visible") is False:
            hidden += 1
        sim_item = copy.deepcopy(item)
        sim_manifest, new_snap, _ = maintain_history(
            type_name, sim_item, manifest, snapshots,
            read_effective_content(type_name, sim_item))
        if new_snap is not None:
            planned += 1
        total_snaps += len(sim_manifest)
    # 模拟旧版扁平文件的迁移结果（不写文件）
    for f in flat_entry_files(type_name):
        item = load_json(f)
        if item is None or not isinstance(item, dict):
            continue
        item_id = str(item.get("id") or "")
        if not validate_item(type_name, item, item_id):
            continue
        if item.get("visible") is False:
            hidden += 1
        sim_manifest, sim_snapshots = simulate_flat_manifest(item, item_id)
        sim_item = copy.deepcopy(item)
        sim_manifest, new_snap, _ = maintain_history(
            type_name, sim_item, sim_manifest, sim_snapshots,
            read_effective_content(type_name, sim_item))
        if new_snap is not None:
            planned += 1
        total_snaps += len(sim_manifest)
    print("[{}] 校验完成 · 预计新增 {} 个快照 · 隐藏 {} 条 · 快照共 {} 个".format(
        type_name, planned, hidden, total_snaps))


def main():
    parser = argparse.ArgumentParser(description="同步 news / competitions / qa 条目数据与索引")
    parser.add_argument("--check", action="store_true", help="仅校验，不写入文件")
    args = parser.parse_args()

    for t in TYPES:
        if args.check:
            check_type(t)
        else:
            sync_type(t)

    if warnings:
        print("\n共 {} 条警告".format(warnings))
    else:
        print("\n校验通过，无警告")


if __name__ == "__main__":
    sys.exit(0 if main() is None or warnings == 0 else 1)
