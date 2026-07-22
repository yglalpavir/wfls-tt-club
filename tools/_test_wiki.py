"""快速测试 Wikipedia 页面解析"""
import requests, re, json
from bs4 import BeautifulSoup

url = "https://en.wikipedia.org/wiki/2011_World_Table_Tennis_Championships_%E2%80%93_Men%27s_singles"
print(f"获取: {url}")
r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
soup = BeautifulSoup(r.text, "html.parser")
print(f"状态码: {r.status_code}, 页面长度: {len(r.text)}")

tables = soup.find_all("table")
draw_tables = []
for t in tables:
    txt = t.get_text()
    if "First Round" in txt or "Quarterfinals" in txt or any(
        k in txt for k in ["Section 1", "Section 2", "Section 3"]):
        rows = t.find_all("tr")
        draw_tables.append(t)
        print(f"找到签表: {len(rows)} 行")

print(f"\n总共 {len(draw_tables)} 个签表")

# 尝试解析第一个
if draw_tables:
    dt = draw_tables[0]
    rows = dt.find_all("tr")
    print(f"\n--- 第一个签表 ({len(rows)} 行) ---")
    for row in rows[:10]:
        cells = row.find_all(["td", "th"])
        texts = [c.get_text(strip=True)[:40] for c in cells if c.get_text(strip=True)]
        if texts:
            print("  | " + " | ".join(texts[:8]))

# 尝试从 Finals 表格提取
finals_tables = []
for t in tables:
    txt = t.get_text()
    if "Quarterfinals" in txt and "Semifinals" in txt:
        finals_tables.append(t)
        print(f"\nFinals表格: {len(t.find_all('tr'))} 行")

if finals_tables:
    ft = finals_tables[0]
    for row in ft.find_all("tr"):
        cells = row.find_all(["td", "th"])
        texts = [c.get_text(strip=True)[:50] for c in cells if c.get_text(strip=True)]
        if texts:
            print("  | " + " | ".join(texts[:8]))
