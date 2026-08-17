import sys
import pdfplumber

src = sys.argv[1]
page_no = int(sys.argv[2])
out = sys.argv[3]
with pdfplumber.open(src) as pdf:
    page = pdf.pages[page_no - 1]
    img = page.to_image(resolution=150)
    img.save(out)
print("saved", out)