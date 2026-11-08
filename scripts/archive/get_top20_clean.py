import sqlite3
from collections import defaultdict
import json

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()

# Carregar todas as obras
cur.execute("SELECT id, title, media, format FROM catalog_works")
works = {r[0]: {'title': r[1], 'media': r[2], 'format': r[3]} for r in cur.fetchall()}

# Relações de parentesco e continuidade legítimas da narrativa
CANONICAL_TYPES = (
    'adaptation', 'sequel', 'prequel', 'main', 'parent', 'parent_story', 
    'full_story', 'side_story', 'spin_off', 'series', 'summary', 'compilation'
)

cur.execute(f"""
SELECT from_work_id, to_work_id 
FROM catalog_work_relations
WHERE relation_type IN ({','.join(['?']*len(CANONICAL_TYPES))})
""", CANONICAL_TYPES)
edges = cur.fetchall()

parent = {w: w for w in works}

def find(i):
    path = []
    while parent[i] != i:
        path.append(i)
        i = parent[i]
    for node in path:
        parent[node] = i
    return i

def union(i, j):
    root_i = find(i)
    root_j = find(j)
    if root_i != root_j:
        parent[root_i] = root_j

for u, v in edges:
    if u in parent and v in parent:
        union(u, v)

clusters = defaultdict(list)
for w in works:
    clusters[find(w)].append(w)

sorted_clusters = sorted(clusters.items(), key=lambda x: len(x[1]), reverse=True)

top_clean = []
for idx, (root_id, w_ids) in enumerate(sorted_clusters[:25], 1):
    anime_cnt = sum(1 for wid in w_ids if works[wid]['media'] == 'anime')
    manga_cnt = sum(1 for wid in w_ids if works[wid]['media'] == 'manga')
    novel_cnt = sum(1 for wid in w_ids if works[wid]['media'] == 'novel')
    
    cluster_works = [works[wid] for wid in w_ids]
    cluster_works.sort(key=lambda w: (
        0 if w['media'] == 'anime' and w['format'] == 'TV' else
        1 if w['media'] == 'anime' and w['format'] == 'MOVIE' else
        2 if w['media'] == 'manga' and w['format'] == 'MANGA' else 3,
        len(w['title'])
    ))
    
    main_title = cluster_works[0]['title'] if cluster_works else "Desconhecido"
    samples = [w['title'] for w in cluster_works[:5]]
    
    top_clean.append({
        'rank': idx,
        'main_title': main_title,
        'total_works': len(w_ids),
        'animes': anime_cnt,
        'mangas': manga_cnt,
        'novels': novel_cnt,
        'samples': samples
    })

with open('top20_clean_universes.json', 'w', encoding='utf-8') as f:
    json.dump(top_clean, f, ensure_ascii=False, indent=2)

print("Top 20 Canônico gerado com sucesso!")
