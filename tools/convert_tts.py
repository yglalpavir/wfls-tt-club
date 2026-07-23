"""将 TTS raw 数据转换为项目格式（与 MS 男子单打格式对齐）

用法: python tools/convert_tts.py [ws|md|wd|xd|all]

输入: {cat}/score-log-tts-raw.json (由 tts_scraper.py 生成，每条含 _player_name)
输出:
  - {cat}/score-log-{year}-{cat}.json  按年分文件（紧凑JSON，与MS格式一致）
  - {cat}/score-log.json               汇总文件
"""
import json, re, sys
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "wtt_data"

# 赛事名→中文类型（与 MS event-coefficient.json 对齐）
def event_type(ename_cn):
    if not ename_cn: return "其他赛事"
    if "大满贯" in ename_cn: return "大满贯"
    if "冠军赛" in ename_cn: return "冠军赛"
    if "球星挑战赛" in ename_cn: return "球星挑战赛"
    if "挑战赛" in ename_cn: return "常规挑战赛"
    if "总决赛" in ename_cn or "世界杯" in ename_cn: return "总决赛"
    if "世锦赛" in ename_cn or "团体锦标赛" in ename_cn: return "世锦赛"
    if "奥运" in ename_cn: return "奥运会"
    if "支线赛" in ename_cn: return "支线赛"
    return "其他赛事"

def extract_date(event_name):
    m = re.search(r'(\d{4})', event_name)
    return f"{m.group(1)}-01-01" if m else "2021-01-01"

def process_category(cat):
    """处理单个类别的 TTS raw 数据"""
    cat_dir = DATA_DIR / cat
    raw_file = cat_dir / "score-log-tts-raw.json"
    if not raw_file.exists():
        print(f"  {cat}: 无 raw 数据，跳过")
        return

    raw = json.loads(raw_file.read_text(encoding="utf-8"))
    print(f"  {cat.upper()}: 加载 {len(raw)} 条 raw 记录")

    # 检查是否有 _player_name 字段
    has_name = sum(1 for m in raw if "_player_name" in m)
    if has_name == 0:
        print(f"  ⚠️  raw 数据缺少 _player_name 字段！请重新运行 tts_scraper.py")
        print(f"      旧数据无法自动修复，跳过此类别")
        return

    # 转换为项目格式（与 MS 对齐：仅 日期/类型/胜者/负者）
    records = []
    seen = set()

    for m in raw:
        pname = m.get("_player_name", "?")
        if pname == "?":
            continue  # 跳过无球员名的记录
        opponent = m.get("opponent", "?")
        opp_name = opponent.split("(")[0].strip() if opponent else "?"
        if opp_name == "?":
            continue
        result = m.get("result", "")
        ename_cn = m.get("event_name_cn", "")
        ename = m.get("event_name", "")
        etype = event_type(ename_cn)
        date_str = extract_date(ename)

        if result == "W":
            winner, loser = pname, opp_name
        elif result == "L":
            winner, loser = opp_name, pname
        else:
            continue  # 跳过平局等

        key = (date_str, winner, loser)
        if key in seen:
            continue
        seen.add(key)

        records.append({
            "日期": date_str,
            "类型": etype,
            "胜者": winner,
            "负者": loser,
        })

    print(f"    转换后: {len(records)} 条 (去重)")

    if not records:
        print(f"    无有效记录")
        return

    # 按年份分组
    from collections import defaultdict
    by_year = defaultdict(list)
    for r in records:
        yr = r["日期"][:4]
        by_year[yr].append(r)

    # 保存到 year files（紧凑 JSON，与 MS 格式一致）
    for yr in sorted(by_year.keys()):
        yr_recs = by_year[yr]
        fname = f"score-log-{yr}-{cat}.json"
        fp = cat_dir / fname

        # 合并现有干净数据
        existing = []
        ex_keys = set()
        if fp.exists():
            try:
                existing = json.loads(fp.read_text(encoding="utf-8"))
                ex_keys = {(r.get("日期",""), r.get("胜者",""), r.get("负者",""))
                          for r in existing
                          if r.get("胜者") != "?" and r.get("负者") != "?"}
            except Exception:
                pass

        added = 0
        for r in yr_recs:
            k = (r["日期"], r["胜者"], r["负者"])
            if k not in ex_keys:
                ex_keys.add(k)
                existing.append(r)
                added += 1

        # 紧凑 JSON（与 MS 一致：无缩进，无多余字段）
        fp.write_text(json.dumps(existing, ensure_ascii=False), encoding="utf-8")
        print(f"    {fname}: {len(existing)} 条 (+{added})")

    # 更新汇总 score-log.json
    all_recs = []
    for f in sorted(cat_dir.glob("score-log-20*.json")):
        if "raw" in f.name or "tts.json" == f.name:
            continue
        try:
            data = json.loads(f.read_text(encoding="utf-8"))
            all_recs.extend(data)
        except Exception:
            pass

    # 去重
    seen_all = set()
    unique_all = []
    for r in all_recs:
        k = (r.get("日期",""), r.get("胜者",""), r.get("负者",""))
        if k not in seen_all and r.get("胜者") != "?" and r.get("负者") != "?":
            seen_all.add(k)
            unique_all.append(r)

    unique_all.sort(key=lambda r: (r.get("日期",""), r.get("类型","")))
    (cat_dir / "score-log.json").write_text(
        json.dumps(unique_all, ensure_ascii=False), encoding="utf-8")
    print(f"    score-log.json: {len(unique_all)} 条 (汇总)")

# --- main ---
if __name__ == "__main__":
    categories = sys.argv[1:] if len(sys.argv) > 1 else ["ws"]
    if "all" in categories:
        categories = ["ws", "md", "wd", "xd"]

    print("=" * 50)
    print("TTS Raw → 项目格式 转换")
    print("=" * 50)

    for cat in categories:
        print(f"\n[{cat.upper()}]")
        process_category(cat)

    print(f"\n完成!")
