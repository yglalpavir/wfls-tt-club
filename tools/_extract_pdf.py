import sys
import pdfplumber

src = sys.argv[1]
dst = sys.argv[2]
with pdfplumber.open(src) as pdf:
    lines = []
    for i, page in enumerate(pdf.pages):
        text = page.extract_text() or ""
        lines.append(f"===== PAGE {i+1} =====")
        lines.append(text)
with open(dst, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))
print(f"pages={len(pdf.pages)} -> {dst}")
