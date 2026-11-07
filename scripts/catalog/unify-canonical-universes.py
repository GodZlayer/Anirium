import sqlite3
from collections import defaultdict
import time

print("[UnifyUniverses] Iniciando unificação matemática de Universos via Union-Find...")
t0 = time.time()

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()
cur.execute('PRAGMA busy_timeout = 30000;')
cur.execute('PRAGMA foreign_keys = OFF;')
cur.execute('PRAGMA synchronous = OFF;')

# 1. Carregar todas as obras
cur.execute("SELECT id FROM catalog_works")
all_works = [r[0] for r in cur.fetchall()]
print(f"[UnifyUniverses] Total de obras: {len(all_works):,}")

# 2. Carregar todas as relações entre obras
cur.execute("SELECT from_work_id, to_work_id FROM catalog_work_relations")
edges = cur.fetchall()
print(f"[UnifyUniverses] Total de relações genealógicas: {len(edges):,}")

# 3. Union-Find com Path Compression
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

# 4. Agrupar obras por componente conexo (Universo Canônico Real)
clusters = defaultdict(list)
for w in all_works:
    clusters[find(w)].append(w)

total_real_universes = len(clusters)
print(f"[UnifyUniverses] Universos canônicos consolidados: {total_real_universes:,} (Redução de {len(all_works) - total_real_universes:,} fragmentos)")

# 5. Reescrever catalog_universes e catalog_universe_works de forma atômica
cur.execute("BEGIN TRANSACTION")

# Limpar tabelas de universos e junção
cur.execute("DELETE FROM catalog_universe_works")
cur.execute("DELETE FROM catalog_universes")

# Inserir entidades de universos únicos
insert_entity = "INSERT OR IGNORE INTO catalog_entities (id, kind, resolution_status, created_at, updated_at) VALUES (?, 'universe', 'verified', datetime('now'), datetime('now'))"
insert_universe = "INSERT INTO catalog_universes (id) VALUES (?)"
insert_uw = "INSERT INTO catalog_universe_works (universe_id, work_id) VALUES (?, ?)"

universe_tuples = [(univ_id,) for univ_id in clusters.keys()]
entity_tuples = [(univ_id,) for univ_id in clusters.keys()]

uw_tuples = []
for univ_id, works_in_cluster in clusters.items():
    for w_id in works_in_cluster:
        uw_tuples.append((univ_id, w_id))

print(f"[UnifyUniverses] Inserindo {len(universe_tuples):,} universos...")
cur.executemany(insert_entity, entity_tuples)
cur.executemany(insert_universe, universe_tuples)

print(f"[UnifyUniverses] Inserindo {len(uw_tuples):,} vínculos de obras...")
cur.executemany(insert_uw, uw_tuples)

con.commit()
print(f"[UnifyUniverses] Concluído em {time.time() - t0:.2f}s com sucesso absoluto!")
