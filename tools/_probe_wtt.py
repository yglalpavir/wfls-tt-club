"""探测 WTT 官网的 API 接口"""
import subprocess, re

# 方法1: 获取WTT官网主页,查找API引用
print("=== 方法1: WTT主页 ===")
cmd = ('try{$r=Invoke-WebRequest -Uri "https://worldtabletennis.com" -TimeoutSec 15 -UseBasicParsing;'
       'Write-Output $r.Content}catch{Write-Output "ERR"}')
r = subprocess.run(["powershell","-NoProfile","-Command",cmd],
                   capture_output=True,text=True,timeout=30,encoding="utf-8",errors="replace")
body = r.stdout
print(f"页面长度: {len(body)} 字符")

# 查找API端点
apis = re.findall(r'https?://[^"\'\\s<>]+api[^"\'\\s<>]*', body, re.IGNORECASE)
print(f"\n找到的API URL:")
for a in apis[:10]:
    print(f"  {a[:120]}")

# 查找JSON数据
jsons = re.findall(r'https?://[^"\'\\s<>]+\.json[^"\'\\s<>]*', body, re.IGNORECASE)
print(f"\n找到的JSON URL:")
for j in jsons[:10]:
    print(f"  {j[:120]}")

# 查找script标签中的内容
scripts = re.findall(r'<script[^>]*>(.*?)</script>', body, re.DOTALL)
print(f"\nScript标签数: {len(scripts)}")

# 方法2: 尝试常见的WTT API端点
print("\n=== 方法2: 探测API端点 ===")
endpoints = [
    "https://worldtabletennis.com/api/results",
    "https://worldtabletennis.com/api/matches",
    "https://worldtabletennis.com/api/events",
    "https://worldtabletennis.com/api/players",
    "https://worldtabletennis.com/rankings",
    "https://api.worldtabletennis.com/",
    "https://worldtabletennis.com/events",
    "https://worldtabletennis.com/results",
]
for url in endpoints:
    cmd2 = (f'try{{$r=Invoke-WebRequest -Uri "{url}" -TimeoutSec 10 -UseBasicParsing;'
            f'Write-Output "OK:$($r.StatusCode):$($r.Content.Length)"}}catch{{Write-Output "ERR"}}')
    r2 = subprocess.run(["powershell","-NoProfile","-Command",cmd2],
                        capture_output=True,text=True,timeout=15)
    out = r2.stdout.strip()
    if out.startswith("OK:"):
        parts = out.split(":")
        if len(parts) >= 3:
            print(f"  ✅ {url} -> {parts[1]} ({parts[2]} bytes)")
        else:
            print(f"  ✅ {url} -> {out}")
    else:
        print(f"  ❌ {url}")
