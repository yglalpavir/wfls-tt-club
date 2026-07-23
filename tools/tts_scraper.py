#!/usr/bin/env python3
"""
TTS Ranking 比赛数据爬取 (WS/MD/WD/XD)
通过 JWT token 访问 api.ttsranking.com 获取比赛记录。

使用方法:
  python tools/tts_scraper.py
"""

import requests, json, time, re, sys
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "wtt_data"
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzY29wZSI6InJhbmtpbmdzIiwiaWF0IjoxNzg0NzI1MTY4LCJleHAiOjE3ODQ3MjY5Njh9.Cjm_Hxad1zWFK2TNEXuxZCrOGTHcwXkye7hmw1sZhHE"

HEADERS = {"Authorization": f"Bearer {TOKEN}", "User-Agent": "Mozilla/5.0"}
BASE = "https://api.ttsranking.com/api"
DELAY = 0.3  # 请求间隔

CATEGORIES = {
    "ws": "女子单打",
    "md": "男子双打",
    "wd": "女子双打",
    "xd": "混合双打",
}

# 赛事名→中文类型映射
def event_to_type(ename_cn):
    if not ename_cn: return "其他赛事"
    if "大满贯" in ename_cn: return "大满贯"
    if "冠军赛" in ename_cn: return "冠军赛"
    if "球星挑战赛" in ename_cn: return "球星挑战赛"
    if "挑战赛" in ename_cn: return "常规挑战赛"
    if "总决赛" in ename_cn or "世界杯" in ename_cn: return "总决赛"
    if "世锦赛" in ename_cn or "锦标赛" in ename_cn: return "世锦赛"
    if "奥运" in ename_cn: return "奥运会"
    return "其他赛事"


def get_player_ids(category, limit=500):
    """获取某类别排名前N的球员ID。"""
    ids = {}
    for offset in range(0, limit, 100):
        url = f"{BASE}/rankings?category={category}&scope=active&offset={offset}&limit=100"
        try:
            r = requests.get(url, headers=HEADERS, timeout=10)
            data = r.json()
            if not data.get("success"): break
            rows = data.get("rows", [])
            if not rows: break
            for row in rows:
                pid = row["id"]
                if category in ("ws",):
                    name = row["name"]
                else:
                    name = f"{row.get('p1','')} / {row.get('p2','')}"
                ids[pid] = name
            if len(rows) < 100: break
            time.sleep(DELAY)
        except Exception as e:
            print(f"  ⚠️ Error: {e}")
            break
    return ids


def get_matches(category, player_id, player_name):
    """获取球员的比赛历史。"""
    url = f"{BASE}/players/{player_id}/matches"
    try:
        r = requests.get(url, headers=HEADERS, timeout=10)
        data = r.json()
        if not data.get("success"): return []
        matches = data.get("matches", [])
        # 将球员信息附加到每条记录中，方便后续转换
        for m in matches:
            m["_player_id"] = player_id
            m["_player_name"] = player_name
        return matches
    except:
        return []


def extract_date(event_name):
    """从事件名中提取年份和大致日期。"""
    m = re.search(r'(\d{4})', event_name)
    if m: return m.group(1)
    return None


def process_matches(category, all_matches, output_path):
    """处理比赛数据，保存为项目格式。"""
    # 去重
    seen = set()
    records = []
    for m in all_matches:
        mid = m.get("match_id")
        if mid in seen: continue
        seen.add(mid)

        ename_cn = m.get("event_name_cn", "")
        etype = event_to_type(ename_cn)
        year = extract_date(m.get("event_name", ""))

        # 日期：使用事件名中的年份 + 近似日期
        date_str = f"{year}-01-01" if year else "2021-01-01"

        # 胜负
        result = m.get("result", "")
        opponent = m.get("opponent", "")
        opponent_cn = m.get("opponent_cn", "")

        # 从 opponent 提取名字（格式: "KUAI Man (CHN)"）
        opp_name = opponent.split("(")[0].strip() if opponent else "?"

        # 分数
        sp = m.get("score_player", 0)
        so = m.get("score_opponent", 0)

        # 球员名从 API 的 category 来判断
        if category == "ws":
            # 需要知道当前球员的名字
            # 这里简化处理 - 从上下文传递
            pass

        records.append({
            "match_id": mid,
            "日期": date_str,
            "类型": etype,
            "赛事": ename_cn,
            "对手": opp_name,
            "比分": f"{sp}:{so}" if result == "W" else f"{so}:{sp}",
            "胜负": result,
            "数据来源": "TTS",
        })

    return records


def main():
    print("=" * 50)
    print("TTS Ranking 数据爬取")
    print("=" * 50)

    # 检查token
    import base64
    try:
        payload = json.loads(base64.b64decode(TOKEN.split(".")[1] + "==").decode())
        exp = payload.get("exp", 0)
        import time as _time
        remaining = exp - _time.time()
        print(f"Token 剩余: {remaining/60:.0f} 分钟")
    except:
        pass

    for cat, cat_name in CATEGORIES.items():
        print(f"\n{'='*50}")
        print(f"🔍 {cat_name} ({cat.upper()})")
        print(f"{'='*50}")

        # 获取排名列表
        print("获取球员列表...")
        ids = get_player_ids(cat, limit=1000)
        print(f"  共 {len(ids)} 名球员/组合")

        if not ids:
            print("  ⚠️ 无数据")
            continue

        # 爬取比赛
        all_matches = []
        player_count = 0
        match_count = 0

        for pid, pname in ids.items():
            player_count += 1
            if player_count % 50 == 0:
                print(f"  进度: {player_count}/{len(ids)}, 已获取 {match_count} 场比赛")

            matches = get_matches(cat, pid, pname)
            match_count += len(matches)
            all_matches.extend(matches)
            time.sleep(DELAY)

        print(f"  ✅ {match_count} 场比赛 (原始)")

        # 去重
        seen_mids = set()
        unique = []
        for m in all_matches:
            mid = m.get("match_id")
            if mid not in seen_mids:
                seen_mids.add(mid)
                unique.append(m)

        print(f"  去重后: {len(unique)} 场")

        # 保存原始数据
        cat_dir = DATA_DIR / cat
        cat_dir.mkdir(parents=True, exist_ok=True)

        raw_path = cat_dir / "score-log-tts-raw.json"
        with open(raw_path, "w", encoding="utf-8") as f:
            json.dump(unique, f, ensure_ascii=False, indent=2)
        print(f"  原始数据: {raw_path}")

    print(f"\n🎉 完成!")


if __name__ == "__main__":
    main()
