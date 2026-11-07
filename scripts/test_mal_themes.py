import urllib.request
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

client_id = None
with open('.env', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('MAL_CLIENT_ID='):
            client_id = line.strip().split('=', 1)[1].strip('"\' ')

print("Client ID loaded:", bool(client_id))

url = 'https://api.myanimelist.net/v2/anime/1?fields=id,title,opening_themes,ending_themes'
req = urllib.request.Request(url, headers={'X-MAL-CLIENT-ID': client_id})
try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        d = json.loads(resp.read().decode('utf-8'))
        print("Anime:", d.get('title'))
        print("OPs:", json.dumps(d.get('opening_themes', []), indent=2, ensure_ascii=False))
        print("EDs:", json.dumps(d.get('ending_themes', []), indent=2, ensure_ascii=False))
except Exception as e:
    print("Error:", e)
