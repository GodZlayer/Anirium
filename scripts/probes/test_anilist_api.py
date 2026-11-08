import urllib.request
import json

query = """
query {
  Media(id: 269, type: ANIME) {
    id
    title { romaji }
    source
    relations {
      edges {
        relationType
        node {
          id
          title { romaji }
          type
          format
        }
      }
    }
  }
}
"""

req = urllib.request.Request(
    'https://graphql.anilist.co',
    data=json.dumps({'query': query}).encode('utf-8'),
    headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0'}
)

try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        media = data.get('data', {}).get('Media', {})
        print("Titulo:", media.get('title', {}).get('romaji'))
        print("Source:", media.get('source'))
        print("Relacoes encontradas no AniList:")
        for edge in media.get('relations', {}).get('edges', []):
            rel = edge.get('relationType')
            node = edge.get('node', {})
            print(f"  [{rel}] -> {node.get('type')} | {node.get('format')} | {node.get('title', {}).get('romaji')} (ID: {node.get('id')})")
except Exception as e:
    print("Erro AniList:", e)
