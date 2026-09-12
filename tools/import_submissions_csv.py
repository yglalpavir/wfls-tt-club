#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从腾讯文档收集表导出的 CSV 导入比赛记录到 data/score-log.json。

配合站点「免账号提交」通道：同学在腾讯文档收集表里免账号填写，管理员在表格里
人工标记审核列后，文件 → 导出为 → CSV，再运行本工具入库（同 admin.html 一样的
本地信任工作流，无任何云平台/密钥依赖）。

用法:
    python tools/import_submissions_csv.py 导出.csv --dry-run            # 首次对接先预览
    python tools/import_submissions_csv.py 导出.csv                      # 导入全部行
    python tools/import_submissions_csv.py 导出.csv --status-column 审核  # 只导入「审核=通过」的行

特性:
- 编码自动探测: UTF-8(含 BOM) → GB18030/GBK
- 表头模糊匹配: 日期/比赛类型/赛制/胜者/负者/总比分/逐局分数/备注/提交人
- 日期规范化: 2026/9/12、2026-9-12 23:30 等一律转 YYYY-MM-DD
- 校验复用 append_submission.py 的全套规则（选手在册、类型白名单、赛制、比分自洽）
- 已导入行按整行内容指纹去重（状态文件 tools/.import-state.json，已 gitignore），
  同一表格重复导出重跑不会重复入库
- 校验失败的行不会写入：修复原因（如先在 players.json 建档）后重跑即可补上

退出码: 0 正常（含「无新记录」）；1 文件/表头问题，或没有任何新记录入库。
"""
import argparse
import csv
import hashlib
import io
import json
import os
import re
import sys
from datetime import date, datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import append_submission as asx

try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass

STATE_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".import-state.json")

# 字段 → 表头提示词（先精确匹配，再包含匹配）
COLUMN_HINTS = {
    "日期": ("日期",),
    "类型": ("比赛类型", "赛事类型", "类型"),
    "赛制": ("赛制",),
    "胜者": ("胜者", "胜方"),
    "负者": ("负者", "负方"),
    "比分": ("总比分",),
    "局分": ("逐局分数", "逐局", "局分"),
    "备注": ("备注",),
    "提交人": ("昵称", "提交人", "填写人", "姓名"),
}
REQUIRED_FIELDS = ("日期", "类型", "赛制", "胜者", "负者")

DATE_FORMATS = (
    "%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S",
    "%Y-%m-%d %H:%M", "%Y/%m/%d %H:%M",
    "%Y-%m-%d", "%Y/%m/%d", "%Y年%m月%d日",
)
DATE_FALLBACK_RE = re.compile(r"^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?")


def info(msg):
    print("[OK] " + msg)


def warn(msg):
    print("[跳过] " + msg)


def fail(msg):
    print("[FAIL] " + msg)


def read_csv_rows(path):
    """读取 CSV，返回 (headers, [ (行号, row_dict) ])。编码依次尝试 UTF-8-BOM/UTF-8/GB18030。"""
    with open(path, "rb") as f:
        raw = f.read()
    text = None
    for enc in ("utf-8-sig", "utf-8", "gb18030"):
        try:
            text = raw.decode(enc)
            encoding_used = enc
            break
        except (UnicodeDecodeError, ValueError):
            continue
    if text is None:
        raise SystemExit("[FAIL] 无法识别 CSV 编码（已尝试 UTF-8 / GBK）")
    if not text.strip():
        raise SystemExit("[FAIL] CSV 文件为空")
    reader = csv.DictReader(io.StringIO(text))
    headers = list(reader.fieldnames or [])
    rows = [(i, row) for i, row in enumerate(reader, start=2)]
    print(f"[OK] 编码识别: {encoding_used}；表头: {[h.strip() for h in headers]}")
    return headers, rows


def map_columns(headers):
    """把语义字段映射到实际表头。先精确匹配（含提示词全等），再包含匹配，已用列不复用。"""
    cleaned = [(h, (h or "").strip()) for h in headers]
    mapping, used = {}, set()
    for field, hints in COLUMN_HINTS.items():
        for c in (c for _, c in cleaned):
            if c and c not in used and (c == field or c in hints):
                mapping[field] = c
                used.add(c)
                break
        else:
            for _, c in cleaned:
                if c and c not in used and any(hint in c for hint in hints):
                    mapping[field] = c
                    used.add(c)
                    break
    return mapping


def normalize_date(raw):
    text = str(raw or "").strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    m = DATE_FALLBACK_RE.match(text)
    if m:
        return "%04d-%02d-%02d" % (int(m.group(1)), int(m.group(2)), int(m.group(3)))
    return None


def row_fingerprint(row):
    blob = "\x00".join("" if v is None else str(v) for v in row.values())
    return hashlib.sha1(blob.encode("utf-8")).hexdigest()


def load_state(path):
    try:
        with open(path, encoding="utf-8") as f:
            return set(json.load(f).get("imported", []))
    except (OSError, ValueError):
        return set()


def save_state(path, fps):
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump({"imported": sorted(fps)}, f, ensure_ascii=False, indent=2)
        f.write("\n")


def main():
    parser = argparse.ArgumentParser(description="导入腾讯文档收集表 CSV 到 data/score-log.json")
    parser.add_argument("csv", help="腾讯文档导出的 CSV 文件路径")
    parser.add_argument("--dry-run", action="store_true", help="只预览解析结果，不写入任何文件")
    parser.add_argument("--status-column", default=None, help="审核列的表头名（如：审核）；给出后只导入状态匹配的行")
    parser.add_argument("--status-value", default="通过", help="审核列中视为通过的取值（默认：通过）")
    parser.add_argument("--state-file", default=STATE_PATH, help="去重状态文件路径")
    args = parser.parse_args()

    headers, rows = read_csv_rows(args.csv)
    mapping = map_columns(headers)
    missing = [f for f in REQUIRED_FIELDS if f not in mapping]
    if missing:
        fail(f"无法从表头识别必填列: {missing}（识别结果: {mapping}）。可在收集表里把题目名改为标准名后重新导出。")
        return 1

    header_by_clean = {((h or "").strip()): h for h in headers}
    status_header = None
    if args.status_column:
        if args.status_column in header_by_clean:
            status_header = header_by_clean[args.status_column]
        else:
            for h in headers:
                if args.status_column in (h or ""):
                    status_header = h
                    break
        if status_header is None:
            fail(f"找不到审核列「{args.status_column}」，现有表头见上方。")
            return 1

    names, alias_map, coeff_types, format_keys, default_formats = asx.load_context()
    today = date.today().isoformat()
    imported, seen_fps = [], load_state(args.state_file)
    dup_count = status_skip = invalid_count = empty_count = 0

    for lineno, row in rows:
        values = [(v or "").strip() if isinstance(v, str) else (v or "") for v in row.values()]
        if not any(values):
            empty_count += 1
            continue
        if status_header is not None:
            status_val = (row.get(status_header) or "").strip()
            if status_val != args.status_value:
                status_skip += 1
                continue

        fp = row_fingerprint(row)
        if fp in seen_fps:
            dup_count += 1
            continue

        def cell(field):
            key = mapping.get(field)
            return (row.get(key) or "").strip() if key else ""

        d = normalize_date(cell("日期"))
        etype = cell("类型")
        winner = asx.alias_map_canonical(cell("胜者"), alias_map)
        loser = asx.alias_map_canonical(cell("负者"), alias_map)
        label = f"第 {lineno} 行（{d or cell('日期') or '?'} {etype or '?'} {winner or '?'} / {loser or '?'}）"

        if not (d and etype and winner and loser):
            warn(f"{label}：必填列（日期/类型/胜者/负者）存在空值")
            invalid_count += 1
            continue
        if etype == "比赛结果加分":
            warn(f"{label}：收集表只支持比赛记录；积分调整请通过 GitHub Issue 或 QQ 群渠道提交")
            invalid_count += 1
            continue

        rec = {"日期": d, "类型": etype, "胜者": winner, "负者": loser}
        fmt = cell("赛制").lower()
        if fmt:
            rec["赛制"] = fmt
        total = cell("比分")
        games_raw = cell("局分")
        if total:
            rec["比分"] = total
        if games_raw:
            rec["局分"] = [g for g in re.split(r"[,，、;；\s]+", games_raw) if g]

        errs, out = asx.validate_match(rec, today, names, alias_map, coeff_types, format_keys, default_formats)
        if errs:
            for e in errs:
                warn(f"{label}：{e}")
            invalid_count += 1
            continue

        imported.append((fp, out))
        info(f"解析通过：{out['日期']} {out['类型']}·{out.get('赛制', 'default')} {out['胜者']} 胜 {out['负者']}"
             + (f" {out.get('比分', '')}" if out.get("比分") else ""))

    print()
    if args.dry_run:
        info(f"【dry-run 预览】可导入 {len(imported)} 条；"
             f"校验失败 {invalid_count} 条；未标记「{args.status_value}」{status_skip} 条；"
             f"已导入过 {dup_count} 条；空行 {empty_count} 行。未写入任何文件。")
        return 0 if imported or invalid_count == 0 else 1

    if not imported:
        fail(f"没有新记录可导入（校验失败 {invalid_count}、未标记通过 {status_skip}、已导入过 {dup_count}）。"
             + ("请先修复上方 [跳过] 的行再重跑。" if invalid_count else ""))
        return 1

    fps = [fp for fp, _ in imported]
    records = [rec for _, rec in imported]
    total = asx.append_to_score_log(records)
    seen_fps.update(fps)
    save_state(args.state_file, seen_fps)
    info(f"已追加 {len(records)} 条记录到 data/score-log.json（现共 {total} 条）；"
         f"去重状态已写入 {args.state_file}")
    if invalid_count or status_skip or dup_count:
        warn(f"本次共跳过 {invalid_count + status_skip + dup_count} 条"
             f"（校验失败 {invalid_count} / 未标记通过 {status_skip} / 已导入过 {dup_count}），"
             f"修复后可重跑同一份 CSV 补上")
    info("下一步: python tools/ci_validate.py 通过后再 git 提交")
    return 0


if __name__ == "__main__":
    sys.exit(main())
