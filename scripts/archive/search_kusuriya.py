import urllib.request
import json

query = """
query {
  media1: Media(search: "Kusuriya no Hitorigoto 3rd Season", type: ANIME) {
    id
    title { romaji english }
    status
    episodes
    nextAiringEpisode { episode airingAt }
  }
}
"""
req = urllib.request.Request('https://graphql.anilist.co', 
    data=json.dumps({'query': query}).encode('utf-8'),
    headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
)
with urllib.request.urlopen(req, timeout=10) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    print('Kusuriya AniList search:', data)
