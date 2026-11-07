import sqlite3
from collections import defaultdict

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()

cur.execute("SELECT id FROM catalog_works WHERE media = 'anime'")
anime_ids = set(r[0] for r in cur.fetchall())

cur.execute("SELECT from_work_id, to_work_id FROM catalog_work_relations")
edges = cur.fetchall()

parent = {w: w for w in anime_ids}

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
    if u in anime_ids and v in anime_ids:
        union(u, v)

clusters = defaultdict(list)
for w in anime_ids:
    clusters[find(w)].append(w)

total_anime_works = len(anime_ids)
total_anime_universes = len(clusters)
multi = sum(1 for c in clusters.values() if len(c) > 1)

print(f"=== ESTATÍSTICA DO REINO DE ANIME ===")
print(f"Total de Animes (TV + Filmes + OVA + Especiais): {total_anime_works:,}")
print(f"Total de Universos de Anime Agrupados: {total_anime_universes:,}")
print(f"Razão Universos / Obras de Anime: {(total_anime_universes / total_anime_works) * 100:.2f}%")
print(f"Franquias de Anime com múltiplas produções: {multi:,} franquias somando {sum(len(c) for c in clusters.values() if len(c) > 1):,} animes!")
