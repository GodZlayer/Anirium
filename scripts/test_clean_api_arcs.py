import urllib.request, json

res = urllib.request.urlopen('http://127.0.0.1:8000/api/catalog/search?q=One%20Piece&limit=1')
data = json.loads(res.read())
item = data.get('items', [{}])[0]
work_id = item.get('id')
print(f"Obra encontrada: {item.get('title')} (ID: {work_id})")

res_graph = urllib.request.urlopen(f'http://127.0.0.1:8000/api/catalog/graph/work/{work_id}')
graph_data = json.loads(res_graph.read())
arcs = graph_data.get('arcs', [])

print(f"Total de Arcos Reais Canônicos retornados: {len(arcs)}")
for a in arcs:
    title = a['title'].encode('ascii', 'ignore').decode('ascii')
    print(f" - {title}: Episódios {a['start_number']} ao {a['end_number']} [{a['classification']}] | {len(a['episode_ids'])} episódios indexados")
