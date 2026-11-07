import urllib.request
import json

client_id = None
with open('.env', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('MAL_CLIENT_ID='):
            client_id = line.strip().split('=', 1)[1].strip('"\' ')

fields = 'id,title,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity,genres,media_type,status,num_episodes,start_season,broadcast,source,average_episode_duration,rating,studios,opening_themes,ending_themes'
url = f'https://api.myanimelist.net/v2/anime/269?fields={fields}'
req = urllib.request.Request(url, headers={'X-MAL-CLIENT-ID': client_id})

try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        d = json.loads(resp.read().decode('utf-8'))
        print("=== TESTE DE EXTRACAO MAL ANIME ===")
        print("Titulo:", d.get('title'))
        print("Alt Titles:", d.get('alternative_titles'))
        print("Source:", d.get('source'))
        print("Studios:", d.get('studios'))
        print("Openings count:", len(d.get('opening_themes', [])))
        for op in d.get('opening_themes', [])[:3]:
            print("  OP:", op.get('text'))
        print("Endings count:", len(d.get('ending_themes', [])))
        for ed in d.get('ending_themes', [])[:3]:
            print("  ED:", ed.get('text'))
except Exception as e:
    print("Erro:", e)

# Testar Manga (Bleach Manga ID 12)
manga_fields = 'id,title,alternative_titles,start_date,end_date,synopsis,mean,rank,popularity,genres,media_type,status,num_volumes,num_chapters,authors{node{id,first_name,last_name},role}'
manga_url = f'https://api.myanimelist.net/v2/manga/12?fields={manga_fields}'
manga_req = urllib.request.Request(manga_url, headers={'X-MAL-CLIENT-ID': client_id})

try:
    with urllib.request.urlopen(manga_req, timeout=10) as resp:
        md = json.loads(resp.read().decode('utf-8'))
        print("\n=== TESTE DE EXTRACAO MAL MANGA ===")
        print("Titulo:", md.get('title'))
        print("Alt Titles:", md.get('alternative_titles'))
        print("Volumes:", md.get('num_volumes'), "| Capitulos:", md.get('num_chapters'))
        print("Autores:", md.get('authors'))
except Exception as e:
    print("Erro Manga:", e)
