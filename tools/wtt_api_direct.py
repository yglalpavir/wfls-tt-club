"""
直接调用 WTT/ITTF 官方 API 获取排名数据
API Key 和端点从 ittf-pingpong npm 包源码提取。

端点:
  - WTT Frontdoor (Top100): https://wtt-web-frontdoor-withoutcache-...azurefd.net/ranking/
  - WTT CMS Rankings:       https://wttcmsapigateway-new.azure-api.net/internalttu/RankingsCurrentWeek/CurrentWeek/
  - ITTF Player Profile:    https://ranking.ittf.com/public/s/player/profile/{ittfId}
  - WTT All Players:        https://wttcmsapigateway-new.azure-api.net/ttu/Players/GetPlayers?limit=100000
  - ITTF Player Matches:    https://ranking.ittf.com/public/s/player/matches/{ittfId}
"""
import requests
import json
import time
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    "apikey": "2bf8b222-532c-4c60-8ebe-eb6fdfebe84a",
    "secapimkey": "S_WTT_882jjh7basdj91834783mds8j2jsd81",
}

# ============================================================
# WTT Frontdoor - Top 100 排名 (快!)
# ============================================================

def fetch_wtt_top100(gender="MEN'S", age="SENIOR", category="S", year=2026, month=7, week=30, limit=100):
    """通过 WTT Frontdoor 获取排名 Top N。"""
    url = (
        f"https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net/ranking/"
        f"?Gender={gender}&AgeCategory={age}&CategoryCode={category}"
        f"&RankingYear={year}&RankingMonth={month}&RankingWeek={week}&Limit={limit}"
    )
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()

# ============================================================
# WTT CMS API - 当周完整排名
# ============================================================

def fetch_wtt_current_week():
    """通过 WTT CMS API 获取当周排名。"""
    url = "https://wttcmsapigateway-new.azure-api.net/internalttu/RankingsCurrentWeek/CurrentWeek/"
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()

# ============================================================
# ITTF Player Profile
# ============================================================

def fetch_player_profile(ittf_id):
    """通过 ITTF 获取球员资料（含每年胜负记录、最高排名等）。"""
    url = f"https://ranking.ittf.com/public/s/player/profile/{ittf_id}"
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()

# ============================================================
# ITTF Player Matches
# ============================================================

def fetch_player_matches(ittf_id, offset=0, size=100):
    """获取球员比赛记录。"""
    url = (f"https://ranking.ittf.com/public/s/player/matches/{ittf_id}"
           f"?offset={offset}&size={size}&ind=1&dbl=1")
    r = requests.get(url, headers=HEADERS, timeout=30)
    r.raise_for_status()
    return r.json()

# ============================================================
# WTT All Players
# ============================================================

def fetch_all_players(limit=100000):
    """获取 WTT 全部球员列表。"""
    url = f"https://wttcmsapigateway-new.azure-api.net/ttu/Players/GetPlayers?limit={limit}"
    r = requests.get(url, headers=HEADERS, timeout=60)
    r.raise_for_status()
    return r.json()


# ============================================================
# 测试运行
# ============================================================

if __name__ == "__main__":
    print("=" * 60)
    print("WTT/ITTF API 直接调用测试 (Python)")
    print("=" * 60)

    # 1. WTT Frontdoor Top 10 MS
    print("\n1. WTT Frontdoor - 男子单打 Top 10")
    try:
        data = fetch_wtt_top100(gender="MEN'S", age="SENIOR", category="S", limit=10)
        if data.get("data"):
            for i, p in enumerate(data["data"][:10], 1):
                print(f"   {i:2d}. {p['PlayerName']:<25s} {p['CountryCode']}  "
                      f"Rank:{p['CurrentRank']}  Pts:{p['RankingPointsYTD']}")
        else:
            print(f"   Response keys: {list(data.keys())}")
    except Exception as e:
        print(f"   ❌ {e}")

    # 2. WTT Frontdoor Top 10 WS
    print("\n2. WTT Frontdoor - 女子单打 Top 10")
    try:
        data = fetch_wtt_top100(gender="WOMEN'S", age="SENIOR", category="S", limit=10)
        if data.get("data"):
            for i, p in enumerate(data["data"][:10], 1):
                print(f"   {i:2d}. {p['PlayerName']:<25s} {p['CountryCode']}  "
                      f"Rank:{p['CurrentRank']}  Pts:{p['RankingPointsYTD']}")
    except Exception as e:
        print(f"   ❌ {e}")

    # 3. WTT Frontdoor 双打
    print("\n3. WTT Frontdoor - 男子双打 Top 10")
    try:
        data = fetch_wtt_top100(gender="MEN'S", age="SENIOR", category="D", limit=10)
        if data.get("data"):
            for i, p in enumerate(data["data"][:10], 1):
                print(f"   {i:2d}. {p['PlayerName']:<35s} {p['CountryCode']}  "
                      f"Rank:{p['CurrentRank']}  Pts:{p['RankingPointsYTD']}")
    except Exception as e:
        print(f"   ❌ {e}")

    print("\n4. WTT Frontdoor - 混合双打 Top 10")
    try:
        data = fetch_wtt_top100(gender="MIXED", age="SENIOR", category="D", limit=10)
        if data.get("data"):
            for i, p in enumerate(data["data"][:10], 1):
                print(f"   {i:2d}. {p['PlayerName']:<35s} {p['CountryCode']}  "
                      f"Rank:{p['CurrentRank']}  Pts:{p['RankingPointsYTD']}")
    except Exception as e:
        print(f"   ❌ {e}")

    # 5. ITTF Player Profile
    print("\n5. ITTF Player Profile - 樊振东(121404)")
    try:
        profile = fetch_player_profile(121404)
        print(f"   Keys: {list(profile.keys())}")
        player = profile.get("player", {})
        print(f"   姓名: {player.get('FamilyName','')} {player.get('GivenName','')}")
        print(f"   协会: {player.get('Org','')}  性别: {player.get('Gender','')}")
        ranking = profile.get("ranking", {})
        if ranking.get("BestPos"):
            best = ranking["BestPos"][0]
            print(f"   最高排名: {best.get('Rank','?')} ({best.get('Year','?')}/{best.get('Week','?')})")
        stats = profile.get("stats", {})
        total = stats.get("total", [])
        if total:
            print(f"   最近3年战绩:")
            for t in total[-3:]:
                print(f"     {t.get('Year','?')}: {t.get('Win','0')}W/{t.get('Loss','0')}L")
    except Exception as e:
        print(f"   ❌ {type(e).__name__}: {e}")

    # 6. WTT CMS
    print("\n6. WTT CMS CurrentWeek API")
    try:
        data = fetch_wtt_current_week()
        print(f"   Response keys: {list(data.keys()) if isinstance(data, dict) else 'list'}")
    except Exception as e:
        print(f"   ❌ {type(e).__name__}: {e}")

    print("\n✅ 测试完成!")
