"""将 TTS raw 数据转换为项目格式"""
import json, re
from pathlib import Path

DATA_DIR = Path("wtt_data")

# 赛事名→中文类型
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

for cat in ["ws"]:  # 先处理WS
    cat_dir = DATA_DIR / cat
    raw_file = cat_dir / "score-log-tts-raw.json"
    if not raw_file.exists():
        print(f"{cat}: 无raw数据")
        continue

    raw = json.loads(raw_file.read_text(encoding="utf-8"))
    print(f"{cat.upper()}: 加载 {len(raw)} 条raw记录")

    # 转换为项目格式
    records = []
    seen = set()

    for m in raw:
        pid = m.get("_player_id")
        pname = m.get("_player_name", "?")
        opponent = m.get("opponent", "?")
        opp_name = opponent.split("(")[0].strip() if opponent else "?"
        result = m.get("result", "")
        sp = m.get("score_player", 0)
        so = m.get("score_opponent", 0)
        ename_cn = m.get("event_name_cn", "")
        ename = m.get("event_name", "")
        etype = event_type(ename_cn)
        date_str = extract_date(ename)

        # 胜负
        if result == "W":
            winner, loser = pname, opp_name
            score = f"{sp}:{so}"
        elif result == "L":
            winner, loser = opp_name, pname
            score = f"{so}:{sp}"
        else:
            continue

        key = (date_str, winner, loser)
        if key in seen: continue
        seen.add(key)

        records.append({
            "日期": date_str,
            "类型": etype,
            "胜者": winner,
            "负者": loser,
            "比分": score,
            "数据来源": "TTS",
        })

    print(f"  转换后: {len(records)} 条 (去重)")

    # 按年份分组
    by_year = {}
    for r in records:
        yr = r["日期"][:4]
        by_year.setdefault(yr, []).append(r)

    # 保存到 year files，合并现有数据
    for yr, yr_recs in by_year.items():
        fname = f"score-log-{yr}-{cat}.json"
        fp = cat_dir / fname
        existing = json.loads(fp.read_text(encoding="utf-8")) if fp.exists() else []
        ex_keys = {(r.get("日期",""), r.get("胜者",""), r.get("负者","")) for r in existing}
        added = 0
        for r in yr_recs:
            k = (r["日期"], r["胜者"], r["负者"])
            if k not in ex_keys:
                ex_keys.add(k)
                existing.append(r)
                added += 1
        fp.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  {yr}: +{added} → {len(existing)} 条")

    # 更新主 score-log.json
    all_recs = []
    for f in sorted(cat_dir.glob("score-log-20*.json")):
        all_recs.extend(json.loads(f.read_text(encoding="utf-8")))
    (cat_dir / "score-log.json").write_text(json.dumps(all_recs, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  主 score-log.json: {len(all_recs)} 条")

    # 清理 placeholder
    all_recs = [r for r in all_recs if not str(r.get("日期","")).startswith("_")]
    (cat_dir / "score-log.json").write_text(json.dumps(all_recs, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  清理placeholder后: {len(all_recs)} 条")
