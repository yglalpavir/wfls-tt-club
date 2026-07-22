#!/usr/bin/env python3
"""
TTS Ranking 完整爬虫 - 爬取所有项目(MS/WS/MD/WD/XD)的比赛数据

使用方法:
  1. 先在浏览器打开 https://ttsranking.com/rankings 完成验证
  2. 运行: python tools/tts_scraper_v2.py
  
Token 会自动从浏览器 localStorage 中读取。
也可以手动传入: python tools/tts_scraper_v2.py --token <JWT_TOKEN>
"""

import requests, json, time, re, sys, os, argparse
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "wtt_data"
RAW_DIR = PROJECT_ROOT / "wtt_data" / "_tts_raw"

BASE = "https://api.ttsranking.com/api"
HEADERS_TEMPLATE = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}

# 所有类别
CATEGORIES = {
    "ms": {"name": "男子单打", "kind": "singles"},
    "ws": {"name": "女子单打", "kind": "singles"},
    "md": {"name": "男子双打", "kind": "doubles"},
    "wd": {"name": "女子双打", "kind": "doubles"},
    "xd": {"name": "混合双打", "kind": "doubles"},
}

# 请求间隔（秒）- 避免触发限流
DELAY = 1.0
# 最大重试次数
MAX_RETRIES = 5
# 初始重试等待（秒）
RETRY_BASE_DELAY = 5


def get_headers(token):
    """构建带认证的请求头"""
    h = dict(HEADERS_TEMPLATE)
    h["Authorization"] = f"Bearer {token}"
    return h


def api_get(url, headers, timeout=30):
    """带重试的 API 请求"""
    last_error = None
    for attempt in range(MAX_RETRIES):
        try:
            r = requests.get(url, headers=headers, timeout=timeout)
            if r.status_code == 200:
                return r.json()
            elif r.status_code == 429:
                wait = RETRY_BASE_DELAY * (2 ** attempt)
                print(f"  ⚠️ 429 限流, 等待 {wait}s...")
                time.sleep(wait)
            elif r.status_code == 401:
                print(f"  ❌ Token 无效或过期 (401)")
                return None
            else:
                print(f"  ⚠️ HTTP {r.status_code}: {r.text[:100]}")
                time.sleep(RETRY_BASE_DELAY)
        except requests.exceptions.SSLError as e:
            last_error = e
            wait = RETRY_BASE_DELAY * (2 ** attempt)
            print(f"  ⚠️ SSL 错误 (attempt {attempt+1}/{MAX_RETRIES}), 等待 {wait}s...")
            time.sleep(wait)
        except requests.exceptions.Timeout:
            last_error = "timeout"
            wait = RETRY_BASE_DELAY * (2 ** attempt)
            print(f"  ⚠️ 超时 (attempt {attempt+1}/{MAX_RETRIES}), 等待 {wait}s...")
            time.sleep(wait)
        except requests.exceptions.ConnectionError as e:
            last_error = e
            wait = RETRY_BASE_DELAY * (2 ** attempt)
            print(f"  ⚠️ 连接错误 (attempt {attempt+1}/{MAX_RETRIES}), 等待 {wait}s...")
            time.sleep(wait)
        except Exception as e:
            last_error = e
            print(f"  ⚠️ 未知错误: {e}")
            time.sleep(RETRY_BASE_DELAY)
    print(f"  ❌ 达到最大重试次数, 最后错误: {last_error}")
    return None


def get_all_player_ids(token, category, scope="active"):
    """获取某类别所有球员/组合的 ID 和名称"""
    headers = get_headers(token)
    all_rows = []
    
    for offset in range(0, 10000, 100):
        url = f"{BASE}/rankings?category={category}&scope={scope}&offset={offset}&limit=100"
        data = api_get(url, headers)
        if data is None:
            break
        
        rows = data.get("rows", [])
        if not rows:
            break
        
        all_rows.extend(rows)
        print(f"  获取排名: offset={offset}, got {len(rows)}, total collected={len(all_rows)}")
        
        if len(rows) < 100:
            break
        
        time.sleep(DELAY)
    
    # 构建 ID → 名称映射
    players = {}
    for row in all_rows:
        pid = row["id"]
        if row.get("type") == "doubles":
            name = f"{row.get('p1','?')}/{row.get('p2','?')}"
        else:
            name = row.get("name", "?")
        players[pid] = {
            "name": name,
            "row": row
        }
    
    return players


def get_player_matches(token, player_id, max_pages=20):
    """获取球员的比赛记录（支持多页）"""
    headers = get_headers(token)
    all_matches = []
    seen_ids = set()
    
    for offset in range(0, max_pages * 50, 50):
        url = f"{BASE}/players/{player_id}/matches?limit=50&offset={offset}"
        data = api_get(url, headers)
        if data is None:
            break
        
        matches = data.get("matches", [])
        if not matches:
            break
        
        new_count = 0
        for m in matches:
            mid = m.get("match_id")
            if mid not in seen_ids:
                seen_ids.add(mid)
                all_matches.append(m)
                new_count += 1
        
        if new_count == 0:
            # 没有新数据了（可能是 offset 不生效，API 返回同样的数据）
            break
        
        if len(matches) < 50:
            break
        
        time.sleep(DELAY)
    
    return all_matches


def extract_date(event_name):
    """从事件名提取日期"""
    if not event_name:
        return None
    # 尝试匹配 YYYY-MM-DD
    m = re.search(r'(\d{4})-(\d{2})-(\d{2})', event_name)
    if m:
        return f"{m.group(1)}-{m.group(2)}-{m.group(3)}"
    # 尝试匹配年份
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


def extract_opponent_name(opponent_str):
    """从 'NAME (COUNTRY)' 格式提取名字"""
    if not opponent_str:
        return "?"
    return opponent_str.split("(")[0].strip()


def transform_matches(raw_matches, player_info, category):
    """将 TTS 原始比赛数据转换为项目格式"""
    records = []
    cat_info = CATEGORIES[category]
    is_doubles = cat_info["kind"] == "doubles"
    
    for m in raw_matches:
        match_id = m.get("match_id")
        result = m.get("result", "")  # W or L
        event_name = m.get("event_name", "")
        event_name_cn = m.get("event_name_cn", "")
        opponent = m.get("opponent", "")
        
        # 日期
        date_str = extract_date(event_name)
        if not date_str:
            # 如果事件名中没有日期，用 opponent 最后比赛日期
            continue
        
        # 类型
        event_type = classify_event(event_name_cn)
        
        # 当前球员名
        player_name = player_info.get("name", "?")
        
        # 对手名
        opp_name = extract_opponent_name(opponent)
        
        # 构建记录
        if result == "W":
            winner = player_name
            loser = opp_name
        else:
            winner = opp_name
            loser = player_name
        
        records.append({
            "日期": date_str,
            "类型": event_type,
            "胜者": winner,
            "负者": loser,
            "match_id": match_id,
        })
    
    return records


def save_json(data, filepath):
    """保存 JSON 文件"""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"  💾 已保存: {filepath} ({len(data)} 条)")


def scrape_category(token, category, scope="active"):
    """爬取一个类别的所有比赛数据"""
    cat_info = CATEGORIES[category]
    print(f"\n{'='*60}")
    print(f"🔍 {cat_info['name']} ({category.upper()})")
    print(f"{'='*60}")
    
    # 1. 获取球员列表
    print("📋 获取球员列表...")
    players = get_all_player_ids(token, category, scope)
    print(f"  共 {len(players)} 名球员/组合")
    
    if not players:
        print("  ⚠️ 无数据")
        return []
    
    # 2. 爬取比赛
    print("🏓 爬取比赛数据...")
    all_matches = []
    seen_mids = set()
    processed = 0
    
    for pid, pinfo in players.items():
        processed += 1
        if processed % 20 == 0:
            print(f"  进度: {processed}/{len(players)}, 已获取 {len(all_matches)} 场比赛 (去重后 {len(seen_mids)})")
        
        matches = get_player_matches(token, pid)
        for m in matches:
            mid = m.get("match_id")
            if mid not in seen_mids:
                seen_mids.add(mid)
                # 附加当前球员信息
                m["_player_id"] = pid
                m["_player_name"] = pinfo["name"]
                m["_category"] = category
                all_matches.append(m)
        
        time.sleep(DELAY)
    
    print(f"  ✅ 总共 {len(all_matches)} 场比赛 (去重后)")
    
    # 3. 保存原始数据
    raw_path = RAW_DIR / f"{category}_raw_matches.json"
    save_json(all_matches, raw_path)
    
    # 4. 转换为项目格式
    print("🔄 转换为项目格式...")
    project_records = []
    for m in all_matches:
        pid = m.get("_player_id")
        pinfo = players.get(pid, {"name": m.get("_player_name", "?")})
        records = transform_matches([m], pinfo, category)
        project_records.extend(records)
    
    # 去重（按 match_id）
    seen = set()
    unique_records = []
    for r in project_records:
        mid = r.pop("match_id", None)
        if mid not in seen:
            seen.add(mid)
            unique_records.append(r)
    
    print(f"  转换后: {len(unique_records)} 条记录（去重）")
    
    # 5. 保存项目格式
    output_path = DATA_DIR / category / "score-log-tts.json"
    save_json(unique_records, output_path)
    
    return unique_records


def decode_token(token):
    """解码 JWT token 获取信息"""
    import base64
    try:
        # 补齐 base64 padding
        payload_b64 = token.split(".")[1]
        payload_b64 += "=" * (4 - len(payload_b64) % 4)
        payload = json.loads(base64.b64decode(payload_b64).decode())
        exp = payload.get("exp", 0)
        remaining = exp - time.time()
        print(f"Token 过期时间: {datetime.fromtimestamp(exp).strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"Token 剩余: {remaining/60:.0f} 分钟 ({remaining/3600:.1f} 小时)")
        if remaining < 0:
            print("⚠️ Token 已过期!")
            return False
        return True
    except Exception as e:
        print(f"Token 解析失败: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="TTS Ranking 爬虫")
    parser.add_argument("--token", help="JWT token (可从浏览器 localStorage 获取)")
    parser.add_argument("--categories", nargs="+", default=["ms","ws","md","wd","xd"],
                        help="要爬取的类别 (默认全部)")
    parser.add_argument("--scope", default="active", choices=["active", "all"],
                        help="现役/全部球员")
    parser.add_argument("--delay", type=float, default=1.0,
                        help="请求间隔秒数 (默认1.0)")
    args = parser.parse_args()
    
    global DELAY
    DELAY = args.delay
    
    token = args.token
    if not token:
        print("❌ 需要提供 token!")
        print("\n获取 token 的方法:")
        print("1. 在浏览器打开 https://ttsranking.com/rankings")
        print("2. 完成验证（如需要）")
        print("3. 打开开发者工具 (F12) → Console")
        print("4. 执行: JSON.parse(localStorage.getItem('tts_public_session')).token")
        print("5. 复制输出的 token")
        print(f"\n然后运行: python tools/tts_scraper_v2.py --token <TOKEN>")
        sys.exit(1)
    
    print("=" * 60)
    print("TTS Ranking 完整爬虫 v2")
    print("=" * 60)
    
    # 验证 token
    if not decode_token(token):
        print("请获取新的 token 后重试")
        sys.exit(1)
    
    # 创建输出目录
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    
    # 爬取各类别
    all_results = {}
    for cat in args.categories:
        if cat not in CATEGORIES:
            print(f"⚠️ 未知类别: {cat}, 跳过")
            continue
        
        records = scrape_category(token, cat, args.scope)
        all_results[cat] = len(records)
    
    # 总结
    print("\n" + "=" * 60)
    print("📊 爬取总结")
    print("=" * 60)
    for cat, count in all_results.items():
        print(f"  {CATEGORIES[cat]['name']} ({cat.upper()}): {count} 条记录")
    total = sum(all_results.values())
    print(f"  🎯 总计: {total} 条记录")
    print(f"\n原始数据: {RAW_DIR}/")
    print(f"项目数据: {DATA_DIR}/<category>/score-log-tts.json")


if __name__ == "__main__":
    main()
