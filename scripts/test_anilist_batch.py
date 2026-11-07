import urllib.request
import json
import sys

sys.stdout.reconfigure(encoding='utf-8')

# Batch de 50 animes em uma única query
query = """
query {
  m0: Media(id: 16498) { id title { romaji english native } staff(perPage: 15) { edges { role node { id name { full native } image { medium } } } } studios { nodes { id name } } }
  m1: Media(id: 1) { id title { romaji english native } staff(perPage: 15) { edges { role node { id name { full native } image { medium } } } } studios { nodes { id name } } }
  m2: Media(id: 20) { id title { romaji english native } staff(perPage: 15) { edges { role node { id name { full native } image { medium } } } } studios { nodes { id name } } }
}
"""

req = urllib.request.Request(
    'https://graphql.anilist.co',
    data=json.dumps({'query': query}).encode('utf-8'),
    headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Anirium/2.0'}
)

try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        d = data['data']
        for k, m in d.items():
            print(f"[{k}] {m['title']['romaji']} -> Staff: {len(m['staff']['edges'])}, Studios: {len(m['studios']['nodes'])}")
except Exception as e:
    print("Error:", e)
