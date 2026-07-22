"""深度测试 Wikipedia 签表解析"""
import requests, re
from bs4 import BeautifulSoup

url = "https://en.wikipedia.org/wiki/2011_World_Table_Tennis_Championships_%E2%80%93_Men%27s_singles"
r = requests.get(url, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
soup = BeautifulSoup(r.text, "html.parser")

# 查看 Finals 表格的完整列结构
tables = soup.find_all("table")
for t in tables:
    txt = t.get_text()
    if "Quarterfinals" in txt and "Final" in txt:
        rows = t.find_all("tr")
        print(f"Finals表格: {len(rows)} 行 x 每行列数:")
        for i, row in enumerate(rows):
            cells = row.find_all(["td", "th"])
            col_count = len(cells)
            if col_count > 0:
                texts = [c.get_text(strip=True)[:25] for c in cells]
                print(f"  行{i}({col_count}列): {texts[:15]}")

# 查看 Section 1 表格的列结构
for t in tables:
    txt = t.get_text()
    if "Section 1" in txt and "First Round" in txt:
        rows = t.find_all("tr")
        print(f"\nSection1表格: {len(rows)} 行:")
        for i, row in enumerate(rows[:20]):
            cells = row.find_all(["td", "th"])
            col_count = len(cells)
            if col_count > 0:
                texts = [c.get_text(strip=True)[:20] for c in cells]
                print(f"  行{i}({col_count}列): {texts[:12]}")
        break

# 尝试获取 RAW wikitext
raw_url = "https://en.wikipedia.org/w/index.php?title=2011_World_Table_Tennis_Championships_%E2%80%93_Men%27s_singles&action=raw"
print("\n\n获取RAW wikitext...")
r2 = requests.get(raw_url, headers={"User-Agent": "Mozilla/5.0"}, timeout=30)
print(f"状态码: {r2.status_code}, 长度: {len(r2.text)}")

# 查找 Finals 章节
idx = r2.text.find("===Finals===")
if idx > 0:
    chunk = r2.text[idx:idx+3000]
    print("\n=== Finals wikitext (前3000字符) ===")
    print(chunk[:2000])
