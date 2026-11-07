import urllib.request
import json

client_id = None
with open('.env', 'r', encoding='utf-8') as f:
    for line in f:
        if line.startswith('MAL_CLIENT_ID='):
            client_id = line.strip().split('=', 1)[1].strip('"\' ')

print("Client ID encontrado:", bool(client_id))

if client_id:
    # Testar com Bleach Manga (ID 12)
    url = 'https://api.myanimelist.net/v2/manga/12?fields=id,title,related_anime,related_manga'
    req = urllib.request.Request(url, headers={'X-MAL-CLIENT-ID': client_id})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            print("Sucesso na chamada oficial MAL Manga!")
            print("Titulo:", data.get('title'))
            print("related_anime:", len(data.get('related_anime', [])))
            print("related_manga:", len(data.get('related_manga', [])))
            for ra in data.get('related_anime', []):
                print(" -> Anime relacao:", ra.get('relation_type_formatted'), "|", ra.get('node', {}).get('title'), "| ID:", ra.get('node', {}).get('id'))
    except Exception as e:
        print("Erro no teste MAL Manga:", e)
