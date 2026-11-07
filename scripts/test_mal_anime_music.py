import urllib.request
import json

client_id = None
with open('.env', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('MAL_CLIENT_ID='):
            client_id = line.strip().split('=', 1)[1].strip('"\' ')

fields = 'id,title,alternative_titles,start_date,end_date,genres,media_type,status,num_episodes,studios,opening_themes,ending_themes'
url = f'https://api.myanimelist.net/v2/anime/269?fields={fields}'
req = urllib.request.Request(url, headers={'X-MAL-CLIENT-ID': client_id})

try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        d = json.loads(resp.read().decode('utf-8'))
        print("=== TESTE DE EXTRACAO MAL ANIME ===")
        print("Titulo:", d.get('title'))
        print("Studios:", [s.get('name') for s in d.get('studios', [])])
        print("Openings count:", len(d.get('opening_themes', [])))
        for op in d.get('opening_themes', [])[:3]:
            print("  OP:", op.get('text').encode('ascii', 'ignore').decode('ascii'))
        print("Endings count:", len(d.get('ending_themes', [])))
        for ed in d.get('ending_themes', [])[:3]:
            print("  ED:", ed.get('text').encode('ascii', 'ignore').decode('ascii'))
except Exception as e:
    print("Erro:", e)
