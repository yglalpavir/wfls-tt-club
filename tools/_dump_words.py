import sys
import pdfplumber

src = sys.argv[1]
page_no = int(sys.argv[2])
out = sys.argv[3]
with pdfplumber.open(src) as pdf:
    page = pdf.pages[page_no - 1]
    words = page.extract_words()
    from collections import defaultdict
    rows = defaultdict(list)
    for w in words:
        rows[round(w["top"], 0)].append(w)
    buf = []
    for y in sorted(rows):
        ws = sorted(rows[y], key=lambda w: w["x0"])
        line = " | ".join(f"[{w['text']}@x={w['x0']:.0f}]" for w in ws)
        buf.append(f"y={y:6.0f}: {line}")
with open(out, "w", encoding="utf-8") as f:
    f.write("\n".join(buf))
print("done")