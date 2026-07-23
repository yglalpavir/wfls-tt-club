"""
WTT/ITTF API 直接调用 (修正版)
从 ittf-pingpong npm 包分析得到的正确调用方式。

关键发现:
1. WTT Frontdoor Top100: URL是 {type}_{category}.json 格式，需要 Referer/Origin
2. WTT CMS API (排名101+): 需要 cuimp TLS指纹绕过，Python中难直接用
3. ITTF Player Profile: ranking.ittf.com - 直接可用
4. WTT All Players: 用于按名称搜索球员ID
"""

import requests
import json
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "wtt_data"

HEADERS = {
    "Accept": "application/json, text/plain, */*",
    "Referer": "https://www.worldtabletennis.com",
    "Origin": "https://www.worldtabletennis.com",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
}

API_KEYS = {
    "apikey": "2bf8b222-532c-4c60-8ebe-eb6fdfebe84a",
    "secapimkey": "S_WTT_882jjh7basdj91834783mds8j2jsd81",
}

CATEGORY_MAP = {"S": "SINGLES", "D": "DOUBLES", "DI": "SINGLES"}
FRONTDOOR_BASE = "https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net/ranking"


def fetch_wtt_top100(type_="SEN", gender="M", category="S"):
    """
    WTT Frontdoor API - 获取前100名排名
    这是最快的API，无需 API key
    """
    cat = CATEGORY_MAP[category]
    url = f"{FRONTDOOR_BASE}/{type_}_{cat}.json?q={int(time.time() * 1000)}"

    print(f"   URL: .../{type_}_{cat}.json")
    r = requests.get(url, headers=HEADERS, timeout=30)
    print(f"   Status: {r.status_code}, Size: {len(r.text)} bytes")

    if r.status_code != 200:
        print(f"   Response: {r.text[:200]}")
        return []

    data = r.json()
    results = data.get("Result", data.get("data", []))
    # 过滤出对应 gender+category 的记录
    sub_event = f"{gender}{category}"
    filtered = [p for p in results if p.get("SubEventCode") == sub_event]
    return filtered


def fetch_all_players(limit=50000):
    """WTT All Players API"""
    url = f"https://wttcmsapigateway-new.azure-api.net/ttu/Players/GetPlayers?limit={limit}"
    headers = {**HEADERS, **API_KEYS}
    r = requests.get(url, headers=headers, timeout=60)
    if r.status_code != 200:
        print(f"   Status: {r.status_code}, Body: {r.text[:200]}")
        return []
    data = r.json()
    return data.get("Result", [])


def find_player_id(name, players_cache=None):
    """按全名搜索球员 ITTF ID"""
    if players_cache is None:
        players_cache = fetch_all_players()

    # 格式化名称: "FAN Zhendong" -> "FAN Zhendong"
    parts = name.strip().split(maxsplit=1)
    if len(parts) == 2:
        formatted = f"{parts[0].upper()} {parts[1][0].upper()}{parts[1][1:].lower()}"
    else:
        formatted = name.strip().upper()

    matches = [p for p in players_cache if p.get("PlayerFamilyNameFirst") == formatted]
    return [{"IttfId": m["IttfId"], "PlayerFamilyNameFirst": m["PlayerFamilyNameFirst"]} for m in matches]


def fetch_player_profile(ittf_id):
    """
    ITTF Player Profile API - 获取球员完整资料
    包括: 个人信息, 排名历史, 每年胜率统计
    """
    url = f"https://ranking.ittf.com/public/s/player/profile/{ittf_id}"
    r = requests.get(url, headers=HEADERS, timeout=30)
    if r.status_code != 200:
        print(f"   Status: {r.status_code}")
        return None
    return r.json()


def fetch_player_matches(ittf_id, offset=0, size=100):
    """获取球员比赛历史"""
    url = (f"https://ranking.ittf.com/public/s/player/matches/{ittf_id}"
           f"?offset={offset}&size={size}&ind=1&dbl=1")
    r = requests.get(url, headers=HEADERS, timeout=30)
    if r.status_code != 200:
        return None
    return r.json()


# ============================================================
# 测试
# ============================================================

if __name__ == "__main__":
    print("=" * 60)
    print("WTT/ITTF API 测试 (修正版)")
    print("=" * 60)

    # 1. 排名测试
    test_cases = [
        ("SEN", "M", "S", "男子单打"),
        ("SEN", "W", "S", "女子单打"),
        ("SEN", "M", "D", "男子双打"),
        ("SEN", "W", "D", "女子双打"),
        ("SEN", "X", "D", "混合双打"),
        ("YOU", "M", "S", "青年男子单打"),
        ("YOU", "W", "S", "青年女子单打"),
    ]

    for type_, gender, cat, desc in test_cases:
        print(f"\n--- {desc} ({type_}/{gender}/{cat}) ---")
        try:
            players = fetch_wtt_top100(type_, gender, cat)
            print(f"   结果: {len(players)} 人")
            for i, p in enumerate(players[:5], 1):
                print(f"   {i}. {p.get('PlayerName','?'):<28s} "
                      f"{p.get('CountryCode','?'):<5s} "
                      f"Rank:{p.get('CurrentRank','?')}  "
                      f"Pts:{p.get('RankingPointsYTD','?')}")
        except Exception as e:
            print(f"   ❌ {type(e).__name__}: {e}")

    # 2. 球员资料
    print(f"\n--- 球员资料 ---")
    for pid, name in [(121404, "樊振东"), (121558, "王楚钦"), (131001, "孙颖莎")]:
        try:
            p = fetch_player_profile(pid)
            if p:
                player = p.get("player", {})
                stats = p.get("stats", {})
                total = stats.get("total", [])
                last3 = total[-3:] if len(total) >= 3 else total
                records = ", ".join(f"{t.get('Year')}:{t.get('Win',0)}W/{t.get('Loss',0)}L" for t in last3)
                print(f"   {name}({pid}): {player.get('FamilyName','')} {player.get('GivenName','')} | "
                      f"{records}")
        except Exception as e:
            print(f"   ❌ {name}: {type(e).__name__}: {e}")

    # 3. 球员搜索 (通过 All Players)
    print(f"\n--- 球员ID搜索 ---")
    try:
        all_players = fetch_all_players(50000)
        print(f"   加载了 {len(all_players)} 名球员")
        for name in ["FAN Zhendong", "WANG Chuqin", "SUN Yingsha", "HARIMOTO Tomokazu"]:
            results = find_player_id(name, all_players)
            if results:
                print(f"   {name}: {results}")
            else:
                print(f"   {name}: 未找到")
    except Exception as e:
        print(f"   ❌ {type(e).__name__}: {e}")

    print(f"\n✅ 测试完成!")
