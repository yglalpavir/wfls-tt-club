#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""抓取 2025 成都混团世界杯 52 场队际赛的 match card 原始 JSON。"""
import json
import requests
from pathlib import Path

OUT = Path(r"s:\wfls-tt-club\wfls-tt-club\tools\mtc2025_matchcards.json")
HEADERS = {
    "Accept": "application/json",
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/148.0.0.0 Safari/537.36",
    "Referer": "https://xtresults.ittf.com/",
}

# 先获取官方结果列表
r = requests.get(
    "https://liveeventsapi.worldtabletennis.com/api/cms/GetOfficialResult?EventId=3263&DocumentCode=TTE",
    headers=HEADERS, timeout=30,
)
result_list = r.json()
print("官方结果场数:", len(result_list))

cards = []
for item in result_list:
    code = item["documentCode"]
    url = f"https://liveeventsapi.worldtabletennis.com/api/cms/GetMatchCardDetails/3263/{code}?&use_live_match_cache=false"
    rr = requests.get(url, headers=HEADERS, timeout=30)
    if rr.status_code == 200:
        cards.append(rr.json())
        print("OK", code)
    else:
        print("FAIL", code, rr.status_code)

OUT.write_text(json.dumps(cards, ensure_ascii=False, indent=1), encoding="utf-8", newline="\n")
print("已保存", len(cards), "场到", OUT)
