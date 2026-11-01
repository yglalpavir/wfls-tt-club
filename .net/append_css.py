import io

css = """

/* ===== 交手网络（WTT 数据可视化页承载容器） ===== */
.oppnet-container {
    display: block;
    padding: 8px 12px 12px;
}
.viz-net-desc {
    margin: 6px 0 0;
    font-size: 0.85rem;
    line-height: 1.7;
    color: var(--text-muted);
}
.viz-net-note {
    margin: 10px 2px 0;
    font-size: 0.78rem;
    line-height: 1.7;
    color: var(--text-muted);
}
"""

p = "style.css"
s = open(p, encoding="utf-8", newline="").read()
if "\r\n" in s:
    css = css.replace("\n", "\r\n")
open(p, "w", encoding="utf-8", newline="").write(s + css)
print("ok", len(s))
