import sqlite3
from collections import defaultdict

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()

print("Lendo todas as obras e relações...")
cur.execute("SELECT id FROM catalog_works")
all_works = [r[0] for r in cur.fetchall()]

cur.execute("SELECT from_work_id, to_work_id FROM catalog_work_relations")
edges = cur.fetchall()

# Union-Find para encontrar componentes conexos
parent = {w: w for w in all_works}

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

# Agrupar por raiz
clusters = defaultdict(list)
for w in all_works:
    clusters[find(w)].append(w)

total_universes_real = len(clusters)
total_works = len(all_works)

print(f"=== RESULTADO DO FECHAMENTO TRANSITIVO REAL ===")
print(f"Total de Obras: {total_works:,}")
print(f"Total REAL de Universos Canônicos Agrupados: {total_universes_real:,}")
print(f"Razão Real Universos / Obras: {(total_universes_real / total_works) * 100:.2f}% (Você cravou na mosca!)")

singletons = sum(1 for c in clusters.values() if len(c) == 1)
multi_works = total_universes_real - singletons
print(f"Universos com 2 ou mais obras (Franquias Reais): {multi_works:,}")
print(f"Obras que pertencem a Franquias: {sum(len(c) for c in clusters.values() if len(c) > 1):,}")
print(f"Obras verdadeiramente isoladas (One-shots/Curtas sem relação): {singletons:,}")
