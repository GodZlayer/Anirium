import sqlite3
import urllib.request
import json

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()
cur.execute('''
SELECT DISTINCT w.id, w.title
FROM catalog_arc_works aw
JOIN catalog_works w ON aw.work_id = w.id
LIMIT 3
''')

for work_id, title in cur.fetchall():
    clean_title = title.encode('ascii', 'ignore').decode('ascii')
    print(f"\nTestando Obra com Arcos Reais: {clean_title}")
    res = urllib.request.urlopen(f"http://127.0.0.1:8000/api/catalog/graph/work/{work_id}")
    data = json.loads(res.read())
    arcs = data.get('arcs', [])
    print(f" - Status: HTTP {res.status} OK | Arcos Reais Retornados: {len(arcs)}")
    for a in arcs[:3]:
        arc_title = a['title'].encode('ascii', 'ignore').decode('ascii')
        print(f"   * {arc_title} (Episódios {a['start_number']} ao {a['end_number']}) | {len(a['episode_ids'])} eps indexados")
