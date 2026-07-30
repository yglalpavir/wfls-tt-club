"""从 MS/WS/MD/WD 数据生成 WTT_KNOWN_GENDERS JavaScript 映射表"""
import json, os, re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
WTT = BASE / "wtt_data"

gender = {}  # name → 'M'/'F'

def load_score_logs(cat_dir):
    """加载某类别所有 score-log json 文件，返回所有唯一球员名"""
    names = set()
    if not cat_dir.exists():
        return names
    for f in sorted(cat_dir.glob("score-log-*.json")):
        raw = f.read_bytes()
        if not raw.strip():
            continue
        text = raw.decode("utf-8-sig")  # 兼容 BOM
        data = json.loads(text)
        for r in data:
            if not r.get("日期"): continue
            w = r.get("胜者", "")
            l = r.get("负者", "")
            for name in [w, l]:
                if name and "/" in name:
                    for p in name.split("/"):
                        names.add(p.strip())
                elif name:
                    names.add(name.strip())
    return names

# 加载 MS (男单) → M
ms_players = load_score_logs(WTT / "ms")
for p in ms_players:
    gender[p] = 'M'

# 加载 WS (女单) → F
ws_players = load_score_logs(WTT / "ws")
for p in ws_players:
    gender[p] = 'F'

# 加载 MD (男双) → M (仅补充 MS 中未出现的)
md_players = set()
for f in sorted((WTT / "md").glob("score-log-*.json")):
    raw = f.read_bytes()
    if not raw.strip(): continue
    data = json.loads(raw.decode("utf-8-sig"))
    for r in data:
        if not r.get("日期"): continue
        for key in ["胜者", "负者"]:
            name = r.get(key, "")
            if name and "/" in name:
                for p in name.split("/"):
                    md_players.add(p.strip())
for p in md_players:
    if p not in gender:
        gender[p] = 'M'

# 加载 WD (女双) → F (仅补充 WS 中未出现的)
wd_players = set()
for f in sorted((WTT / "wd").glob("score-log-*.json")):
    raw = f.read_bytes()
    if not raw.strip(): continue
    data = json.loads(raw.decode("utf-8-sig"))
    for r in data:
        if not r.get("日期"): continue
        for key in ["胜者", "负者"]:
            name = r.get(key, "")
            if name and "/" in name:
                for p in name.split("/"):
                    wd_players.add(p.strip())
for p in wd_players:
    if p not in gender:
        gender[p] = 'F'

# 加载 XD (混双) → 根据已有的 gender 映射推断，剩余无法推断的标记为 ?
xd_players = set()
for f in sorted((WTT / "xd").glob("score-log-*.json")):
    raw = f.read_bytes()
    if not raw.strip(): continue
    data = json.loads(raw.decode("utf-8-sig"))
    for r in data:
        if not r.get("日期"): continue
        for key in ["胜者", "负者"]:
            name = r.get(key, "")
            if name and "/" in name:
                for p in name.split("/"):
                    xd_players.add(p.strip())

unknown = [p for p in xd_players if p not in gender]
print(f"MS 球员数: {len(ms_players)}")
print(f"WS 球员数: {len(ws_players)}")
print(f"MD 球员数(补充): {len(md_players)}")
print(f"WD 球员数(补充): {len(wd_players)}")
print(f"XD 球员数: {len(xd_players)}")
print(f"总映射数: {len(gender)}")
print(f"XD 中无法推断性别的球员: {len(unknown)}")
if unknown:
    print(f"  未知: {unknown}")
    # 根据姓名常见性别进行推测
    # 西方女性常见名
    female_given = {"Maria","Anna","Ana","Sarah","Sara","Nina","Laura","Miyu","Miwa","Saki","Hitomi","Satsuki","Hina","Mao","Honoka","Kasumi","Miu","Sakura","Rika","Miyuu","Kaho","Reina","Sachi","Cocona","Hana","Dora","Barbora","Bruna","Brianna","Adriana","Daniela","Bernadette","Andrea","Andreea","Paulina","Camille","Charlotte","Mariam","Elizabet","Filippa","Giulia","Sofia","Amelia","Diya","Manika","Yashaswini","Swastika","Syndrela","Kaushani","Nithya","Anusha","Debora","Valentina","Arantxa","Veronika","Victoria","Fadwa","Aia","Rokaia","Prithika","Aishat","Kabirat","Chinenye","Cynthia","Joanita","Sukurat","Halima","Hope","Joy","Favour","Sarvinoz","Jennifer","Valeriia","Abosede","Ajarat","Ajoke","Aminat","Fatimo","Emmanuella","Deborah","Onyinyechi","Kadijat","Suhana","Lakshita","Taneesha","Hardee","Avani","Kavya","Yashini","Selena","Divyanshi","Abir","Sabine","Sibel","Minhyung","Sayali","Sally","Yangzi","Xia Lian","Giulia","Mariia","Tatiana","Ece","Tin-Tin","Miyu","Katarina","Anastasia"}
    male_given = {"Lim","Cho","Oh","An","Kwon","Rogelio","Tomokazu","Shunsuke","Sora","Maharu","Kazuhiro","Kristijan","Kristian","Thibault","Flavien","Jules","Esteban","Florian","Hugo","Alvaro","Marcos","Leonardo","Guilherme","Felipe","Gustavo","Nicolas","Benedikt","Patrick","Dang","Ovidiu","Eduard","Darius","Adrien","Martin","Victor","Vladimir","Kirill","Iskender","Abhinandh","Balamurugan","Sathiyan","Nandan","Manush","Manav","Akash","Payas","Ankur","Anirban","Mudit","Jash","Harmeet","Navid","Noshad","Nikita","Evgeny","Vladislav","Ivan","Luka","Lubomir","Stepan","Wim","Cedric","Borgar","Vincent","Remi","Leo","Jules","Ibrahim","Abdullah","Mohammed","Sultan","Ahmed","Youssef","Mohamed","Bosman","Eusebio","Connor","Matthew","Miha","Peter","Borna","Andrej","Kristijan","James","Francis","Taiwo","Makanjuola","Sodiq","Olajide","Muizz","Amidu","Abdulbasit","Chinenye","Kehinde","Francis","Ernest","Kevin","Hussein","Amidu","Aboubaker","Nandor","Csaba","Martin","Jorge","Vitor","Albert","Anders","Hugo"}
    for p in unknown:
        parts = p.split()
        given = parts[0] if parts else ""
        if given in female_given:
            gender[p] = 'F'
        elif given in male_given:
            gender[p] = 'M'
        else:
            # 东亚姓氏检查
            asian_surnames = {"WONG","CHAN","LEE","NG","LAM","HO","YUEN","TANG","TAM","KWAN","YIU","LAU","FUNG","CHEUNG","CHENG","CHU","CHOW","POON","TSANG","LEUNG","YIP","FOK","HUI","CHING","KWOK","LI","WANG","ZHANG","CHEN","LIU","YANG","HUANG","ZHAO","WU","ZHOU","XU","SUN","MA","ZHU","HU","GUO","HE","GAO","LIN","LUO","LIANG","SONG","ZHENG","XIE","HAN","FENG","YU","DONG","XIAO","CHENG","CAO","YUAN","DENG","FU","SHEN","ZENG","PENG","LV","SU","JIANG","CAI","JIA","DING","WEI","XUE","YE","YAN","PAN","DU","DAI","XIA","ZHONG","TIAN","REN","FAN","FANG","SHI","YAO","TAN","LIAO","ZOU","XIONG","JIN","LU","HAO","KONG","BAI","CUI","KANG","MAO","QIU","QIN","GU","HOU","SHAO","MENG","LONG","WAN","DUAN","LEI","QIAN","YIN","YI","CHANG","QIAO","LAI","GONG","WEN","KIM","PARK","CHOI","JUNG","KANG","CHO","YOON","JANG","LIM","OH","SHIN","SEO","KWON","HWANG","AHN","JEON","HONG","YOO","JOO","RYU","NAM","BAEK","MOON","CHA","HEO","JEONG","KO","SATO","SUZUKI","TAKAHASHI","TANAKA","ITO","YAMAMOTO","NAKAMURA","KOBAYASHI","KATO","YOSHIDA","YAMADA","SASAKI","YAMAGUCHI","MATSUMOTO","INOUE","KIMURA","HAYASHI","SHIMIZU","SAITO","MORI","IKEDA","HASHIMOTO","ABE","OGURA","ISHIKAWA","MAEDA","FUJITA","OKADA","GOTO","HASEGAWA","MURAKAMI","KONDO","ISHII","UCHIDA","SAKAMOTO","OTA","HARIMOTO","MATSUSHIMA","NIWA","MIZUTANI","HIRANO","FUKUHARA","KISHIKAWA","MATSUDAIRA","OSHIMA","MORIZONO","YOSHIMURA","UEDA","CHIBA","KURAMOCHI","NAGASAKI","YOKOI","SHIBATA","SATO","OYA","MIYAGAWA","DOI","OTA","TAKEYA","AKAE","ASO","AOKI","KIHARA","HARIMOTO","MURAMATSU","WATANABE","NGUYEN","TRAN","PHAM","HOANG","HUYNH","PHAN","VU","VO","DANG","BUI","DO","NGO","DUONG","LY"}
            if parts and parts[-1].upper() in asian_surnames:
                # 东亚选手：根据已有数据出现的位置判断
                # 如果在 MS/MD 中出现过就是 M，在 WS/WD 中出现过就是 F
                if p in ms_players or p in md_players:
                    gender[p] = 'M'
                elif p in ws_players or p in wd_players:
                    gender[p] = 'F'
                else:
                    gender[p] = '?'

unknown_final = [p for p in xd_players if p not in gender or gender[p] == '?']
print(f"最终仍未知的 XD 球员: {len(unknown_final)}")
if unknown_final:
    print(f"  未知: {unknown_final}")

# 输出 JS 代码 - 仅包含 XD 相关球员
print("\n========== 生成的 JS 代码 ==========\n")
print("const WTT_KNOWN_GENDERS = {")
for name in sorted(xd_players):
    g = gender.get(name, '?')
    if g != '?':
        print(f"    {json.dumps(name)}: {json.dumps(g)},")
print("};")

# 统计
male_count = sum(1 for g in gender.values() if g == 'M')
female_count = sum(1 for g in gender.values() if g == 'F')
print(f"\n// 男性: {male_count}, 女性: {female_count}, 未知: {len(unknown_final)}")
