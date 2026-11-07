import sqlite3
import json
from hashlib import sha256

def deterministic_uuid(namespace, name):
    h = sha256(f"{namespace}:{name}".encode('utf-8')).hexdigest()
    return f"{h[:8]}-{h[8:12]}-4{h[13:16]}-a{h[17:20]}-{h[20:32]}"

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()
cur.execute('PRAGMA busy_timeout = 30000;')
cur.execute('PRAGMA foreign_keys = OFF;')

with open('scripts/catalog/data/legacy-arcs.unverified.json', 'r', encoding='utf-8') as f:
    legacy_data = json.load(f)

records = legacy_data.get('records', {})

# Mapear títulos conhecidos para obter o work_id e universe_id
canonical_series_map = {
    'bleach': 'Bleach',
    'naruto': 'Naruto',
    'hunter-x-hunter': 'Hunter x Hunter',
    'shingeki-no-kyojin': 'Shingeki no Kyojin',
    'one-piece': 'One Piece',
    'kimetsu': 'Kimetsu no Yaiba',
    'jujutsu-kaisen': 'Jujutsu Kaisen',
    'dragon ball': 'Dragon Ball',
    'black clover': 'Black Clover',
    'fairy tail': 'Fairy Tail'
}

print("[ImportRealArcs] Importando arcos reais canônicos e vinculando episódios...")
cur.execute("BEGIN TRANSACTION")

total_imported = 0
total_episodes_linked = 0

for key, arc_list in records.items():
    search_title = canonical_series_map.get(key)
    if not search_title:
        continue
    
    # Buscar a obra de anime de TV principal
    cur.execute("""
    SELECT w.id, uw.universe_id 
    FROM catalog_works w
    JOIN catalog_universe_works uw ON w.id = uw.work_id
    WHERE w.media = 'anime' AND w.format = 'TV' AND w.title LIKE ?
    ORDER BY LENGTH(w.title) ASC
    LIMIT 1
    """, (f"{search_title}%",))
    
    row = cur.fetchone()
    if not row:
        continue
    
    work_id, universe_id = row
    
    for arc in arc_list:
        arc_name = arc.get('name')
        start_ep = arc.get('startEp', 1)
        end_ep = arc.get('endEp', start_ep)
        is_filler = arc.get('isFiller', False)
        classification = 'filler' if is_filler else 'canon'
        
        arc_id = deterministic_uuid('arc', f"{work_id}:{arc.get('arcId', arc_name)}")
        
        # 1. Inserir em catalog_entities
        cur.execute("""
        INSERT OR REPLACE INTO catalog_entities (id, kind, resolution_status, created_at, updated_at)
        VALUES (?, 'arc', 'verified', datetime('now'), datetime('now'))
        """, (arc_id,))
        
        # 2. Inserir em catalog_arcs
        cur.execute("""
        INSERT OR REPLACE INTO catalog_arcs (id, universe_id, title, classification, source_url)
        VALUES (?, ?, ?, ?, 'canonical-franchise-index')
        """, (arc_id, universe_id, arc_name, classification))
        
        # 3. Inserir em catalog_arc_works
        cur.execute("""
        INSERT OR REPLACE INTO catalog_arc_works (arc_id, universe_id, work_id, start_number, end_number)
        VALUES (?, ?, ?, ?, ?)
        """, (arc_id, universe_id, work_id, start_ep, end_ep))
        
        total_imported += 1
        
        # 4. Vincular Episódios Reais em catalog_arc_episodes
        cur.execute("""
        INSERT OR IGNORE INTO catalog_arc_episodes (arc_id, episode_id, universe_id, work_id)
        SELECT ?, e.id, ?, ?
        FROM catalog_episodes e
        WHERE e.work_id = ? AND e.number >= ? AND e.number <= ?
        """, (arc_id, universe_id, work_id, work_id, start_ep, end_ep))
        
        total_episodes_linked += cur.rowcount

con.commit()
print(f"[ImportRealArcs] Concluído! {total_imported} arcos reais importados e {total_episodes_linked} episódios vinculados com sucesso.")
