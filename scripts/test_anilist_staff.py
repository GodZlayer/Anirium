import urllib.request
import json
import sys

# Force utf-8 stdout
sys.stdout.reconfigure(encoding='utf-8')

query = """
query ($id: Int) {
  Media (id: $id, type: ANIME) {
    id
    title { romaji english native }
    description(asHtml: false)
    studios(isMain: true) { nodes { id name } }
    staff(perPage: 25) {
      edges {
        role
        node { id name { full native } image { large } }
      }
    }
  }
}
"""

req = urllib.request.Request(
    'https://graphql.anilist.co',
    data=json.dumps({'query': query, 'variables': {'id': 16498}}).encode('utf-8'),
    headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Anirium/2.0'}
)

try:
    with urllib.request.urlopen(req, timeout=10) as resp:
        data = json.loads(resp.read().decode('utf-8'))
        m = data['data']['Media']
        print("Title:", m['title']['romaji'])
        print("Staff count:", len(m['staff']['edges']))
        for s in m['staff']['edges'][:5]:
            print("  Role:", s['role'], "| Name:", s['node']['name']['full'])
        print("Studios:", [node['name'] for node in m['studios']['nodes']])
except Exception as e:
    print("Error:", e)
