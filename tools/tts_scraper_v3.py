#!/usr/bin/env python3
"""
TTS Ranking 爬虫 v3 - 使用 curl_cffi 绕过 Cloudflare TLS 检测

使用方法:
  1. 获取 token (浏览器 F12 → Console):
     JSON.parse(localStorage.getItem('tts_public_session')).token
  2. 运行:
     python tools/tts_scraper_v3.py --token <TOKEN> --categories ms ws --max-players 100
"""

import json, time, re, sys, os, argparse
from pathlib import Path
from datetime import datetime
from curl_cffi import requests

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "wtt_data"
RAW_DIR = PROJECT_ROOT / "wtt_data" / "_tts_raw"

BASE = "https://api.ttsranking.com/api"
IMPERSONATE = "chrome110"

CATEGORIES = {
    "ms": {"name": "男子单打", "kind": "singles"},
    "ws": {"name": "女子单打", "kind": "singles"},
    "md": {"name": "男子双打", "kind": "doubles"},
    "wd": {"name": "女子双打", "kind": "doubles"},
    "xd": {"name": "混合双打", "kind": "doubles"},
}


def get_headers(token):
    return {
        "Authorization": f"Bearer {token}",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36"
    }


def api_get(url, headers, timeout=30, max_retries=3):
    """使用 curl_cffi 的 API 请求（绕过 Cloudflare）"""
    for attempt in range(max_retries):
        try:
            r = requests.get(url, headers=headers, impersonate=IMPERSONATE, timeout=timeout)
            if r.status_code == 200:
                return r.json()
            elif r.status_code == 429:
                wait = 3 * (2 ** attempt)
                print(f"  ⚠️ 429 限流, 等待 {wait}s...", flush=True)
                time.sleep(wait)
            elif r.status_code == 401:
                print(f"  ❌ Token 无效 (401)", flush=True)
                return None
            else:
                print(f"  ⚠️ HTTP {r.status_code}", flush=True)
                time.sleep(2)
        except Exception as e:
            wait = 2 * (2 ** attempt)
            print(f"  ⚠️ 错误 (attempt {attempt+1}/{max_retries}): {type(e).__name__}, 等待 {wait}s...", flush=True)
            time.sleep(wait)
    print(f"  ❌ 达到最大重试次数", flush=True)
    return None


def get_all_player_ids(token, category, scope="active", max_players=None):
    """获取某类别排名列表，返回 {id: info}"""
    headers = get_headers(token)
    all_rows = []
    
    for offset in range(0, 20000, 100):
        url = f"{BASE}/rankings?category={category}&scope={scope}&offset={offset}&limit=100"
        data = api_get(url, headers)
        if data is None:
            break
        
        rows = data.get("rows", [])
        if not rows:
            break
        
        all_rows.extend(rows)
        
        if max_players and len(all_rows) >= max_players:
            all_rows = all_rows[:max_players]
            break
        
        if len(rows) < 100:
            break
        
        time.sleep(0.3)
    
    players = {}
    for row in all_rows:
        pid = row["id"]
        if row.get("type") == "doubles":
            name = f"{row.get('p1','?')}/{row.get('p2','?')}"
        else:
            name = row.get("name", "?")
        players[pid] = {"name": name, "row": row}
    
    return players


def get_player_matches(token, player_id):
    """获取球员的比赛记录（最多50场）"""
    headers = get_headers(token)
    url = f"{BASE}/players/{player_id}/matches?limit=50"
    data = api_get(url, headers)
    if data is None:
        return []
    return data.get("matches", [])


def extract_date(event_name):
    """从事件名提取日期"""
    if not event_name:
        return None
    m = re.search(r'(\d{4})-(\d{2})-(\d{2})', event_name)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    m = re.search(r'(\d{4})', event_name)
    if m:
        return f"{m.group(1)}-01-01"
    return None


def classify_event(event_name_cn):
    """根据赛事中文名分类"""
    if not event_name_cn:
        return "其他赛事"
    if "大满贯" in event_name_cn:
        return "大满贯"
    if "冠军赛" in event_name_cn:
        return "冠军赛"
    if "球星挑战赛" in event_name_cn:
        return "球星挑战赛"
    if "挑战赛" in event_name_cn:
        return "常规挑战赛"
    if "总决赛" in event_name_cn or "世界杯" in event_name_cn:
        return "总决赛"
    if "世锦赛" in event_name_cn or "世乒赛" in event_name_cn or "锦标赛" in event_name_cn:
        return "世锦赛"
    if "奥运" in event_name_cn:
        return "奥运会"
    return "其他赛事"


def extract_player_name(raw_name):
    """从 'NAME (COUNTRY)' 提取名字"""
    if not raw_name:
        return "?"
    return raw_name.split("(")[0].strip()


def transform_match(m, player_name, is_doubles):
    """将单条 TTS 比赛记录转为项目格式"""
    result = m.get("result", "")
    opponent_raw = m.get("opponent", "")
    opp_name = extract_player_name(opponent_raw)
    
    event_name = m.get("event_name", "")
    event_name_cn = m.get("event_name_cn", "")
    
    date_str = extract_date(event_name)
    if not date_str:
        return None
    
    event_type = classify_event(event_name_cn)
    
    if result == "W":
        winner, loser = player_name, opp_name
    else:
        winner, loser = opp_name, player_name
    
    return {
        "日期": date_str,
        "类型": event_type,
        "胜者": winner,
        "负者": loser,
    }


def save_json(data, filepath):
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  💾 {filepath} ({len(data)} 条)", flush=True)


def scrape_category(token, category, scope="active", max_players=None, delay=0.5):
    """爬取一个类别"""
    cat_info = CATEGORIES[category]
    is_doubles = cat_info["kind"] == "doubles"
    
    print(f"\n{'='*60}", flush=True)
    print(f"🔍 {cat_info['name']} ({category.upper()})", flush=True)
    print(f"{'='*60}", flush=True)
    
    # 1. 获取球员列表
    print("📋 获取球员列表...", flush=True)
    players = get_all_player_ids(token, category, scope, max_players)
    print(f"  共 {len(players)} 名球员/组合", flush=True)
    
    if not players:
        return []
    
    # 2. 爬取比赛
    print("🏓 爬取比赛数据...", flush=True)
    all_matches_raw = []
    seen_mids = set()
    processed = 0
    total = len(players)
    
    for pid, pinfo in players.items():
        processed += 1
        if processed % 20 == 0 or processed == 1:
            print(f"  进度: {processed}/{total}, 去重比赛: {len(seen_mids)}", flush=True)
        
        matches = get_player_matches(token, pid)
        for m in matches:
            mid = m.get("match_id")
            if mid not in seen_mids:
                seen_mids.add(mid)
                m["_player_id"] = pid
                m["_player_name"] = pinfo["name"]
                all_matches_raw.append(m)
        
        time.sleep(delay)
    
    print(f"  ✅ 总共 {len(all_matches_raw)} 场比赛 (去重后)", flush=True)
    
    # 3. 保存原始数据
    raw_path = RAW_DIR / f"{category}_raw_matches.json"
    save_json(all_matches_raw, raw_path)
    
    # 4. 转换为项目格式
    print("🔄 转换为项目格式...", flush=True)
    project_records = []
    seen = set()
    
    for m in all_matches_raw:
        mid = m.get("match_id")
        if mid in seen:
            continue
        seen.add(mid)
        
        player_name = m.get("_player_name", "?")
        record = transform_match(m, player_name, is_doubles)
        if record:
            project_records.append(record)
    
    print(f"  转换后: {len(project_records)} 条", flush=True)
    
    # 5. 保存项目格式
    output_path = DATA_DIR / category / "score-log-tts.json"
    save_json(project_records, output_path)
    
    return project_records


def decode_token(token):
    """解码 JWT token"""
    import base64
    try:
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        payload = json.loads(base64.b64decode(payload_b64).decode())
        exp = payload.get("exp", 0)
        remaining = exp - time.time()
        exp_str = datetime.fromtimestamp(exp).strftime('%Y-%m-%d %H:%M:%S')
        print(f"Token 过期: {exp_str} (剩余 {remaining/60:.0f} 分钟)")
        return remaining > 0
    except:
        return False


def main():
    parser = argparse.ArgumentParser(description="TTS Ranking 爬虫 v3 (curl_cffi)")
    parser.add_argument("--token", required=True, help="JWT token")
    parser.add_argument("--categories", nargs="+", 
                        default=["ms","ws","md","wd","xd"],
                        help="类别 (默认全部)")
    parser.add_argument("--scope", default="active", choices=["active","all"])
    parser.add_argument("--max-players", type=int, default=None,
                        help="每个类别最多爬取球员数 (默认全部)")
    parser.add_argument("--delay", type=float, default=0.5,
                        help="请求间隔秒数 (默认0.5)")
    parser.add_argument("--output-dir", default=None,
                        help="输出目录 (默认 wtt_data)")
    args = parser.parse_args()
    
    global DATA_DIR, RAW_DIR
    if args.output_dir:
        DATA_DIR = Path(args.output_dir)
        RAW_DIR = DATA_DIR / "_tts_raw"
    
    print("=" * 60)
    print("TTS Ranking 爬虫 v3 (curl_cffi)")
    print("=" * 60)
    
    if not decode_token(args.token):
        print("❌ Token 已过期，请获取新 token")
        print("   浏览器 F12 → Console:")
        print("   JSON.parse(localStorage.getItem('tts_public_session')).token")
        sys.exit(1)
    
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    
    all_results = {}
    for cat in args.categories:
        if cat not in CATEGORIES:
            print(f"⚠️ 未知类别: {cat}")
            continue
        
        records = scrape_category(args.token, cat, args.scope, 
                                  args.max_players, args.delay)
        all_results[cat] = len(records)
    
    # 总结
    print("\n" + "=" * 60)
    print("📊 爬取总结")
    print("=" * 60)
    total = 0
    for cat, count in all_results.items():
        print(f"  {CATEGORIES[cat]['name']} ({cat.upper()}): {count} 条")
        total += count
    print(f"  🎯 总计: {total} 条")
    print(f"\n原始数据: {RAW_DIR}/")
    print(f"项目数据: {DATA_DIR}/<category>/score-log-tts.json")
    
    # 也输出合并后的通用格式
    print("\n💡 提示: 运行以下命令合并所有TTS数据到项目格式:")
    print(f"  python tools/merge_tts_data.py")


if __name__ == "__main__":
    main()
