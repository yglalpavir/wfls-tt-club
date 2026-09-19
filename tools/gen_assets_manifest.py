#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""扫描 Assets/ 生成 Assets/manifest.json（docs.html 素材库文件管理器的数据源）。

产物为部署时生成文件（与 data/api/ 同一模式）：gitignored、不进仓库，
由 deploy 工作流在每次部署前现场重新生成，避免「新增素材忘记重新生成」导致的静默过期。
本地开发/调试时需手动运行一次本脚本，docs.html 才有数据可读。

manifest 结构（节点字段尽量紧凑，目录树可递归）：
  generatedAt  ISO 时间戳
  root         固定 "Assets"
  fileCount / dirCount / totalSize   全树汇总
  tree         目录树：t="d"|目录 / "f"|文件，n=名称，sz=字节（目录为递归合计），
               c=子节点（目录），fc/dc=递归文件/目录数（目录），e=小写扩展名（文件）

跳过：点开头文件（.DS_Store 等）与 manifest.json 自身；Thumbs.db / desktop.ini 同样忽略。
排序固定：目录在前、文件在后，各按名称码点排序（跨平台确定性）。

用法:
  python tools/gen_assets_manifest.py
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
ASSETS_DIR = os.path.join(ROOT, "Assets")
OUT_PATH = os.path.join(ASSETS_DIR, "manifest.json")

JUNK_NAMES = {"Thumbs.db", "desktop.ini"}


def is_skipped(name):
    # manifest.json 是本脚本的输出文件，不作为素材收录
    return name.startswith(".") or name in JUNK_NAMES or name == "manifest.json"


def scan_dir(abs_path, name=""):
    """递归扫描目录，返回节点。目录节点 {t,n,sz,fc,dc,c}，文件节点 {t,n,sz,e}。"""
    entries = sorted(os.listdir(abs_path))
    children = []
    total_size = 0
    file_count = 0
    dir_count = 0
    for entry_name in entries:
        if is_skipped(entry_name):
            continue
        child_abs = os.path.join(abs_path, entry_name)
        if os.path.isdir(child_abs):
            node = scan_dir(child_abs, entry_name)
            dir_count += 1 + node["dc"]
            file_count += node["fc"]
            children.append(node)
        else:
            size = os.path.getsize(child_abs)
            ext = os.path.splitext(entry_name)[1].lstrip(".").lower()
            file_count += 1
            children.append({"t": "f", "n": entry_name, "sz": size, "e": ext})
    children.sort(key=lambda n: (0 if n["t"] == "d" else 1, n["n"]))
    total_size = sum(c["sz"] for c in children)
    return {
        "t": "d",
        "n": name,
        "sz": total_size,
        "fc": file_count,
        "dc": dir_count,
        "c": children,
    }


def main():
    if not os.path.isdir(ASSETS_DIR):
        print("错误：找不到 Assets/ 目录（%s）" % ASSETS_DIR, file=sys.stderr)
        return 1

    tree = scan_dir(ASSETS_DIR)
    manifest = {
        "generatedAt": datetime.now().astimezone().isoformat(timespec="seconds"),
        "root": "Assets",
        "fileCount": tree["fc"],
        "dirCount": tree["dc"],
        "totalSize": tree["sz"],
        "tree": tree,
    }
    with open(OUT_PATH, "w", encoding="utf-8", newline="\n") as f:
        json.dump(manifest, f, ensure_ascii=False, indent=1)
        f.write("\n")

    size_mb = manifest["totalSize"] / 1024 / 1024
    print("已生成 Assets/manifest.json：%d 个目录，%d 个文件，合计 %.1f MB" % (
        manifest["dirCount"], manifest["fileCount"], size_mb))
    return 0


if __name__ == "__main__":
    sys.exit(main())
