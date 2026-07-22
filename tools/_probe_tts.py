"""探测 ttsranking.com 的 API 接口"""
import subprocess

def test_url(url):
    cmd = (f'try{{$r=Invoke-WebRequest -Uri "{url}" -TimeoutSec 10 '
           f'-UseBasicParsing -Headers @{{"User-Agent"="Mozilla/5.0"}};'
           f'$t=$r.Content;'
           f'Write-Output "OK|$($r.StatusCode)|$($t.Length)|$($t.Substring(0,[Math]::Min(200,$t.Length)))"'
           f'}}catch{{Write-Output "ERR|$_"}}')
    r = subprocess.run(["powershell","-NoProfile","-Command",cmd],
                       capture_output=True,text=True,timeout=15)
    return r.stdout.strip()

urls = [
    "https://ttsranking.com/",
    "https://ttsranking.com/docs",
    "https://ttsranking.com/api",
    "https://ttsranking.com/api/v1",
    "https://ttsranking.com/api/rankings",
    "https://ttsranking.com/api/players",
    "https://ttsranking.com/api/matches",
    "https://ttsranking.com/api/results",
    "https://ttsranking.com/api/data",
    "https://ttsranking.com/rankings/data",
    "https://ttsranking.com/data/rankings.json",
    "https://ttsranking.com/data/matches.json",
]

for url in urls:
    result = test_url(url)
    if result.startswith("OK"):
        parts = result.split("|",3)
        code = parts[1] if len(parts)>1 else "?"
        size = parts[2] if len(parts)>2 else "?"
        preview = parts[3] if len(parts)>3 else ""
        print(f"✅ [{code}] {url} ({size}b)")
        print(f"   {preview[:150]}")
    else:
        err = result.replace("ERR|","")[:80]
        print(f"❌ {url} ({err})")
