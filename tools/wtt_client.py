"""
WTT/ITTF 官方 API Python 客户端 (最终版)
=========================================
通过分析 ittf-pingpong npm 包提取的 WTT/ITTF 官方 API 端点。

API:
  1. WTT Frontdoor  - 排名 Top100 (免费, 无需认证)
  2. ITTF Profile    - 球员详细资料
  3. ITTF Matches    - 球员比赛历史
  4. WTT Players     - 球员列表(用于名称→ID搜索)

依赖: pip install httpx
"""
import time
from pathlib import Path
import httpx

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# API 端点
FRONTDOOR = "https://wtt-web-frontdoor-withoutcache-cqakg0andqf5hchn.a01.azurefd.net/ranking"
ITTF_PROFILE = "https://ranking.ittf.com/public/s/player/profile"
ITTF_MATCHES = "https://ranking.ittf.com/public/s/player/matches"
WTT_PLAYERS = "https://wttcmsapigateway-new.azure-api.net/ttu/Players/GetPlayers"

API_KEYS = {
    "apikey": "2bf8b222-532c-4c60-8ebe-eb6fdfebe84a",
    "secapimkey": "S_WTT_882jjh7basdj91834783mds8j2jsd81",
}

# 类别映射
CAT_MAP = {"S": "SINGLES", "D": "DOUBLES", "DI": "SINGLES"}
SUB_EVENT = {
    "SEN": {
        "M": {"S": "MS", "D": "MD", "DI": "MDI"},
        "W": {"S": "WS", "D": "WD", "DI": "WDI"},
        "X": {"D": "XD", "DI": "XDI"},
    },
    "YOU": {
        "M": {"S": "MS", "D": "MD", "DI": "MDI"},
        "W": {"S": "WS", "D": "WD", "DI": "WDI"},
    },
}


class WttClient:
    """WTT/ITTF API 客户端"""

    def __init__(self):
        self._client = httpx.Client(headers={
            "Accept": "application/json, text/plain, */*",
            "Referer": "https://www.worldtabletennis.com",
            "Origin": "https://www.worldtabletennis.com",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                          "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        })
        self._players = None

    def close(self):
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    # ---- 排名 ----

    def rankings(self, type_="SEN", gender="M", category="S"):
        """获取某类别前100名。返回 [dict, ...]"""
        cat = CAT_MAP[category]
        url = f"{FRONTDOOR}/{type_}_{cat}.json?q={int(time.time() * 1000)}"
        r = self._client.get(url, timeout=30)
        r.raise_for_status()
        code = SUB_EVENT[type_][gender][category]
        return [p for p in r.json()["Result"] if p.get("SubEventCode") == code]

    def all_rankings(self, type_="SEN"):
        """一次获取所有前100名。返回 {code: [dict,...], ...}"""
        results = {}
        for cat_key, cat_name in [("SINGLES", "SINGLES"), ("DOUBLES", "DOUBLES")]:
            # Actually SINGLES and DOUBLES are separate endpoints
            pass
        # SINGLES 端点
        url = f"{FRONTDOOR}/{type_}_SINGLES.json?q={int(time.time() * 1000)}"
        r = self._client.get(url, timeout=30)
        r.raise_for_status()
        for p in r.json()["Result"]:
            results.setdefault(p["SubEventCode"], []).append(p)
        # DOUBLES 端点
        url2 = f"{FRONTDOOR}/{type_}_DOUBLES.json?q={int(time.time() * 1000)}"
        r2 = self._client.get(url2, timeout=30)
        r2.raise_for_status()
        for p in r2.json()["Result"]:
            results.setdefault(p["SubEventCode"], []).append(p)
        return results

    # ---- 球员 ----

    def load_players(self, limit=10000):
        """加载球员列表（用于名称搜索）。一次性操作。"""
        r = self._client.get(
            f"{WTT_PLAYERS}?limit={limit}",
            headers=API_KEYS,
            timeout=60
        )
        r.raise_for_status()
        self._players = r.json().get("Result", [])
        return self._players

    def find_player(self, name):
        """按全名搜索球员 ITTF ID。需要先 load_players()。"""
        if not self._players:
            raise RuntimeError("请先调用 load_players()")
        parts = name.strip().split(maxsplit=1)
        if len(parts) == 2:
            fmt = f"{parts[0].upper()} {parts[1][0].upper()}{parts[1][1:].lower()}"
        else:
            fmt = name.strip().upper()
        return [{"IttfId": p["IttfId"], "Name": p["PlayerFamilyNameFirst"]}
                for p in self._players if p.get("PlayerFamilyNameFirst") == fmt]

    # ---- 球员资料 ----

    def profile(self, ittf_id):
        """获取球员完整资料。返回 {player, ranking, stats}"""
        r = self._client.get(f"{ITTF_PROFILE}/{ittf_id}", timeout=30)
        r.raise_for_status()
        return r.json()

    def matches(self, ittf_id, offset=0, size=10):
        """获取球员比赛记录。"""
        r = self._client.get(
            f"{ITTF_MATCHES}/{ittf_id}?offset={offset}&size={size}&ind=1&dbl=1",
            timeout=30
        )
        r.raise_for_status()
        return r.json()


# ============================================================
# 演示
# ============================================================

if __name__ == "__main__":
    with WttClient() as api:
        print("=" * 65)
        print("WTT/ITTF API 演示")
        print("=" * 65)

        # 1. 排名
        print("\n📊 排名 Top 5:")
        for type_, gender, cat, label in [
            ("SEN", "M", "S", "男子单打"),
            ("SEN", "W", "S", "女子单打"),
            ("SEN", "M", "D", "男子双打"),
            ("SEN", "W", "D", "女子双打"),
            ("SEN", "X", "D", "混合双打"),
        ]:
            ranks = api.rankings(type_, gender, cat)
            if ranks:
                if cat == "D":
                    top_name = f"{ranks[0]['PlayerName1']} / {ranks[0]['PlayerName1d']}"
                else:
                    top_name = ranks[0]["PlayerName"]
                print(f"  {label}: {top_name} (共{len(ranks)}人)")

        # 2. 球员资料
        print("\n👤 球员资料:")
        for pid, label in [(121404, "樊振东"), (121558, "王楚钦"), (131163, "孙颖莎")]:
            p = api.profile(pid)
            player = p["player"]
            by_year = p.get("stats", {}).get("total", {}).get("byYear", [])
            recent = by_year[-3:] if len(by_year) >= 3 else by_year
            rec_str = " | ".join(f"{t['Year']}:{t['wins']}W/{t['loses']}L" for t in recent)
            rk = p.get("ranking", {}).get("BestPos", [{}])[0]
            print(f"  {label}: {player['Name']} [{player['Org']}] "
                  f"最高{rk.get('Rk','?')}({rk.get('Year','?')}) | {rec_str}")

        # 3. 球员搜索 (需要先加载球员列表)
        print("\n🔍 按名称搜索 (加载球员列表...):")
        api.load_players(10000)
        for name in ["FAN Zhendong", "WANG Chuqin", "SUN Yingsha",
                      "HARIMOTO Tomokazu", "LEBRUN Felix"]:
            results = api.find_player(name)
            if results:
                print(f"  {name} → {results[0]['IttfId']}")

        # 4. 比赛记录
        print("\n🏓 最近比赛 (樊振东):")
        m = api.matches(121404, size=3)
        for match in m.get("Matches", [])[:3]:
            evt = match.get("TournamentName", match.get("EventName", "?"))
            w = match.get("Winner", "?")
            l = match.get("Loser", "?")
            res = match.get("Result", "?")
            dt = match.get("MatchDate", "?")
            print(f"  [{dt}] {evt}: {w} vs {l} ({res})")

        print("\n✅ 完成!")
