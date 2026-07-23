"""
WTT/ITTF 官方 API Python 封装
===============================
从 ittf-pingpong npm 包分析得到的 API 端点和调用方式。

API 端点:
  1. WTT Frontdoor (Top100所有类别): 最快，一个请求获取所有单打/双打个人前100
  2. WTT CMS (101+排名): 需要特殊TLS指纹，Python较难直接调用
  3. ITTF Player Profile: 球员完整资料(胜负统计/排名历史)
  4. WTT All Players: 球员列表(用于名字搜索)
  5. ITTF Player Matches: 球员比赛历史

依赖: pip install httpx

作者: GitHub Copilot 辅助分析
"""
import time
import json
from pathlib import Path
import httpx

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_ROOT / "wtt_data"

# WTT Frontdoor - 一次请求获取所有类别前100
FRONTDOOR_BASE = "https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net/ranking"

# WTT CMS API (需要 TLS 指纹绕过)
WTT_CMS_BASE = "https://wttcmsapigateway-new.azure-api.net/internalttu/RankingsCurrentWeek/CurrentWeek/"

# ITTF 公开 API - 不需要 API key
ITTF_PROFILE = "https://ranking.ittf.com/public/s/player/profile"
ITTF_MATCHES = "https://ranking.ittf.com/public/s/player/matches"
ITTF_RANKING_HISTORY = "https://ranking.ittf.com/public/s/ranking/list"

# WTT 球员列表
WTT_ALL_PLAYERS = "https://wttcmsapigateway-new.azure-api.net/ttu/Players/GetPlayers"

# API Keys (从官网公开提取)
API_KEYS = {
    "apikey": "2bf8b222-532c-4c60-8ebe-eb6fdfebe84a",
    "secapimkey": "S_WTT_882jjh7basdj91834783mds8j2jsd81",
}

# 类别映射
CATEGORY_MAP = {"S": "SINGLES", "D": "DOUBLES", "DI": "SINGLES"}
SUB_EVENT_MAP = {
    "SEN": {"M": {"S": "MS", "D": "MD", "DI": "MDI"}, "W": {"S": "WS", "D": "WD", "DI": "WDI"}, "X": {"D": "XD", "DI": "XDI"}},
    "YOU": {"M": {"S": "MS", "D": "MD", "DI": "MDI"}, "W": {"S": "WS", "D": "WD", "DI": "WDI"}},
}


class WttApi:
    """WTT/ITTF 官方 API 客户端"""

    def __init__(self):
        self.client = httpx.Client(headers={
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://www.worldtabletennis.com",
            "Origin": "https://www.worldtabletennis.com",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        })
        self._players_cache = None

    def close(self):
        self.client.close()

    # ========== 排名 ==========

    def fetch_rankings_top100(self, type_="SEN", gender="M", category="S"):
        """
        获取前100名排名 (从 WTT Frontdoor)。
        这是最快的 API，一个请求包含所有类别 (MS/WS/MDI/WDI/XDI 或 MD/WD/XD)。

        参数:
          type_: 'SEN' (成年) 或 'YOU' (青年)
          gender: 'M', 'W', 'X'
          category: 'S' (单打), 'D' (双打组合), 'DI' (双打个人)

        返回: 排名列表 [RankEntry, ...]
        """
        cat = CATEGORY_MAP[category]
        url = f"{FRONTDOOR_BASE}/{type_}_{cat}.json?q={int(time.time() * 1000)}"
        r = self.client.get(url, timeout=30)
        r.raise_for_status()
        data = r.json()
        result = data.get("Result", [])

        # 过滤对应类别
        sub_event = SUB_EVENT_MAP[type_][gender][category]
        return [p for p in result if p.get("SubEventCode") == sub_event]

    def fetch_all_rankings_top100(self, type_="SEN"):
        """
        一次请求获取某类型所有前100名。
        返回 dict: {'MS': [...], 'WS': [...], 'MDI': [...], 'WDI': [...], 'XDI': [...]}
        (注意: D类别(双打组合)需要单独请求 DOUBLES 端点)
        """
        results = {}
        # SINGLES 端点: MS, WS, MDI, WDI, XDI
        cat = "SINGLES"
        url = f"{FRONTDOOR_BASE}/{type_}_{cat}.json?q={int(time.time() * 1000)}"
        r = self.client.get(url, timeout=30)
        r.raise_for_status()
        data = r.json()
        for p in data.get("Result", []):
            code = p.get("SubEventCode", "")
            results.setdefault(code, []).append(p)

        # DOUBLES 端点: MD, WD, XD
        url2 = f"{FRONTDOOR_BASE}/{type_}_DOUBLES.json?q={int(time.time() * 1000)}"
        r2 = self.client.get(url2, timeout=30)
        r2.raise_for_status()
        data2 = r2.json()
        for p in data2.get("Result", []):
            code = p.get("SubEventCode", "")
            results.setdefault(code, []).append(p)

        return results

    # ========== 球员 ==========

    def fetch_all_players(self, limit=5000, force=False):
        """获取所有球员列表(用于名称搜索)"""
        if self._players_cache is not None and not force:
            return self._players_cache

        headers = {**API_KEYS}
        r = self.client.get(f"{WTT_ALL_PLAYERS}?limit={limit}", headers=headers, timeout=60)
        r.raise_for_status()
        self._players_cache = r.json().get("Result", [])
        return self._players_cache

    def find_player_id(self, full_name=None, family_name=None, given_name=None):
        """按名称搜索球员 ITTF ID"""
        players = self.fetch_all_players()
        if full_name:
            parts = full_name.strip().split(maxsplit=1)
            if len(parts) == 2:
                formatted = f"{parts[0].upper()} {parts[1][0].upper()}{parts[1][1:].lower()}"
            else:
                formatted = full_name.strip().upper()
            matches = [p for p in players if p.get("PlayerFamilyNameFirst") == formatted]
        elif family_name:
            matches = [p for p in players if p.get("PlayerFamilyName") == family_name.upper()]
        elif given_name:
            cap = given_name[0].upper() + given_name[1:].lower()
            matches = [p for p in players if p.get("PlayerGivenName") == cap]
        else:
            raise ValueError("必须提供 full_name, family_name 或 given_name")

        return [{"IttfId": m["IttfId"], "PlayerFamilyNameFirst": m["PlayerFamilyNameFirst"]}
                for m in matches]

    # ========== 球员资料 ==========

    def fetch_player_profile(self, ittf_id):
        """
        获取球员完整资料 (ITTF)。
        包含: 个人信息, 排名历史(BestPos/LastPos), 每年胜负统计(total/indiv/doubles)
        """
        url = f"{ITTF_PROFILE}/{ittf_id}"
        r = self.client.get(url, timeout=30)
        r.raise_for_status()
        return r.json()

    def fetch_player_matches(self, ittf_id, offset=0, size=100):
        """获取球员比赛历史"""
        url = f"{ITTF_MATCHES}/{ittf_id}?offset={offset}&size={size}&ind=1&dbl=1"
        r = self.client.get(url, timeout=30)
        r.raise_for_status()
        return r.json()

    def fetch_historical_rankings(self, category="SEN", gender_type="M;SINGLES",
                                   year=2020, week=49, offset=0, size=100):
        """获取历史排名"""
        url = (f"{ITTF_RANKING_HISTORY}?category={category}&typeGender={gender_type}"
               f"&year={year}&week={week}&offset={offset}&size={size}")
        r = self.client.get(url, timeout=30)
        r.raise_for_status()
        return r.json()


# ============================================================
# 测试
# ============================================================

if __name__ == "__main__":
    api = WttApi()
    try:
        print("=" * 65)
        print("WTT/ITTF API Python 封装测试")
        print("=" * 65)

        # 1. 一次获取所有前100名
        print("\n📊 1. 获取 SEN 全部前100名排名...")
        all_ranks = api.fetch_all_rankings_top100("SEN")
        for code, players in sorted(all_ranks.items()):
            if code in ("MD", "WD", "XD"):
                p = players[0]
                name = f"{p['PlayerName1']} / {p['PlayerName1d']}"
                country = p.get("CountryCode1", "?")
            else:
                name = players[0].get("PlayerName", "?")
                country = players[0].get("CountryCode", "?")
            print(f"   {code}: {len(players)} 人 - Top: {name} ({country})")

        # 2. 球员搜索
        print("\n🔍 2. 球员ID搜索...")
        for name in ["FAN Zhendong", "WANG Chuqin", "SUN Yingsha",
                      "HARIMOTO Tomokazu", "LEBRUN Felix"]:
            results = api.find_player_id(full_name=name)
            if results:
                print(f"   {name}: {results[0]['IttfId']}")
            else:
                print(f"   {name}: 未找到")

        # 3. 球员资料
        print("\n👤 3. 球员详细资料...")
        for pid, desc in [(121404, "樊振东"), (121558, "王楚钦"), (131163, "孙颖莎")]:
            try:
                p = api.fetch_player_profile(pid)
                player = p.get("player", {})
                by_year = p.get("stats", {}).get("total", {}).get("byYear", [])
                recent = by_year[-3:] if len(by_year) >= 3 else by_year
                lines = [f"{t['Year']}:{t['wins']}W/{t['loses']}L" for t in recent]
                rank = p.get("ranking", {}).get("BestPos", [{}])[0]
                print(f"   {desc}({pid}): {player.get('Name','?')} "
                      f"[{player.get('Org','?')}] {' | '.join(lines)}  "
                      f"最高排名: {rank.get('Rk','?')}({rank.get('Year','?')})")
            except Exception as e:
                print(f"   ❌ {desc}: {type(e).__name__}: {e}")

        # 4. 球员比赛
        print("\n🏓 4. 球员比赛记录...")
        try:
            matches = api.fetch_player_matches(121404, size=3)
            match_list = matches.get("Matches", [])
            print(f"   总比赛数: {matches.get('total','?')}, 返回: {len(match_list)}")
            for m in match_list[:3]:
                print(f"   {m.get('EventName','?')[:50]}: "
                      f"{m.get('Winner','?')} vs {m.get('Loser','?')} "
                      f"({m.get('Result','?')})")
        except Exception as e:
            print(f"   ❌ {type(e).__name__}: {e}")

        print("\n✅ 测试完成!")
    finally:
        api.close()
