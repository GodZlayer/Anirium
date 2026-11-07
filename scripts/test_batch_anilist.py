import urllib.request
import json

ids = [10087, 356, 11061, 113415, 101922, 20, 21, 98861, 16498]
aliases = " ".join([f"a{i}: Media(id: {i}, type: ANIME) {{ id title {{ romaji }} relations {{ edges {{ relationType node {{ id title {{ romaji }} type format }} }} }} }}" for i in ids])
query = f"query {{ {aliases} }}"

req = urllib.request.Request(
    'https://graphql.anilist.co',
    data=json.dumps({'query': query}).encode('utf-8'),
    headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0'}
)

try:
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode('utf-8')).get('data', {})
        print("Sucesso! Obras retornadas em 1 chamada única:", len(data))
        for key, media in data.items():
            print(f"\nAnime: {media.get('title', {}).get('romaji')} (ID: {media.get('id')})")
            for edge in media.get('relations', {}).get('edges', []):
                rel = edge.get('relationType')
                node = edge.get('node', {})
                if rel in ('ADAPTATION', 'PREQUEL', 'SEQUEL', 'SIDE_STORY', 'PARENT'):
                    print(f"  -> [{rel}] {node.get('type')} | {node.get('format')} | {node.get('title', {}).get('romaji')} (ID: {node.get('id')})")
except Exception as e:
    print("Erro:", e)
