import sqlite3
import urllib.request
import json
import time
import sys

def main():
    print("[SyncRelations] Inicializando leitor com progresso e ETA em tempo real...", flush=True)
    conn = sqlite3.connect('database/database.sqlite')
    cur = conn.cursor()
    cur.execute("PRAGMA busy_timeout = 60000;")
    cur.execute("PRAGMA foreign_keys = OFF;")

    # 1. Carregar mapa de identificadores anilist -> work_id
    cur.execute("""
    SELECT namespace, external_id, entity_id
    FROM catalog_external_identities
    WHERE provider = 'anilist'
    """)
    id_map = {}
    for ns, ext_id, entity_id in cur.fetchall():
        id_map[(ns, ext_id)] = entity_id

    print(f"[SyncRelations] Mapa carregado: {len(id_map):,} identidades disponiveis.", flush=True)

    # 2. Carregar apenas os animes que AINDA NAO foram processados
    cur.execute("""
    SELECT DISTINCT e.external_id
    FROM catalog_external_identities e
    WHERE e.provider = 'anilist' AND e.namespace = 'anime:work'
      AND e.entity_id NOT IN (
          SELECT from_work_id FROM catalog_work_relations WHERE provider = 'anilist'
      )
    ORDER BY CAST(e.external_id AS INTEGER) ASC
    """)
    anime_ext_ids = [r[0] for r in cur.fetchall()]
    total_animes = len(anime_ext_ids)
    print(f"[SyncRelations] Faltam {total_animes:,} animes para processar.", flush=True)

    # O AniList permite queries GraphQL grandes com aliases
    # 25 animes por lote reduz o numero total de requisicoes drasticamente
    batch_size = 25
    total_batches = (total_animes + batch_size - 1) // batch_size
    total_edges_inserted = 0

    start_time = time.time()

    for b_idx in range(0, total_animes, batch_size):
        batch = anime_ext_ids[b_idx:b_idx+batch_size]
        batch_num = (b_idx // batch_size) + 1
        aliases = " ".join([
            f"a_{ext_id}: Media(id: {ext_id}, type: ANIME) {{ id relations {{ edges {{ relationType node {{ id type format }} }} }} }}"
            for ext_id in batch
        ])
        query = f"query {{ {aliases} }}"

        req = urllib.request.Request(
            'https://graphql.anilist.co',
            data=json.dumps({'query': query}).encode('utf-8'),
            headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0'}
        )

        edges_to_insert = []
        try:
            with urllib.request.urlopen(req, timeout=12) as resp:
                data = json.loads(resp.read().decode('utf-8')).get('data', {})
                for key, media in data.items():
                    if not media or not media.get('id'):
                        continue
                    from_ext_id = str(media['id'])
                    from_work_id = id_map.get(('anime:work', from_ext_id))
                    if not from_work_id:
                        continue

                    for edge in media.get('relations', {}).get('edges', []):
                        rel = edge.get('relationType', '').lower()
                        node = edge.get('node', {})
                        if not node or not node.get('id'):
                            continue

                        to_ext_id = str(node['id'])
                        node_type = node.get('type', 'ANIME')
                        to_ns = 'manga:work' if node_type == 'MANGA' else 'anime:work'
                        to_work_id = id_map.get((to_ns, to_ext_id))

                        if to_work_id and to_work_id != from_work_id:
                            edges_to_insert.append((from_work_id, to_work_id, rel, 'anilist'))

        except Exception as e:
            err_str = str(e)
            if "429" in err_str:
                print(f"[SyncRelations] Rate limit atingido. Pausando 15s...", flush=True)
                time.sleep(15)
            else:
                time.sleep(2)
            continue

        if edges_to_insert:
            cur.execute("BEGIN TRANSACTION")
            cur.executemany("""
            INSERT OR IGNORE INTO catalog_work_relations (from_work_id, to_work_id, relation_type, provider)
            VALUES (?, ?, ?, ?)
            """, edges_to_insert)
            conn.commit()
            total_edges_inserted += len(edges_to_insert)

        elapsed = time.time() - start_time
        processed = min(b_idx + len(batch), total_animes)
        percent = (processed / total_animes) * 100
        rate = processed / elapsed if elapsed > 0 else 1
        eta_seconds = (total_animes - processed) / rate if rate > 0 else 0
        eta_min = round(eta_seconds / 60, 1)

        print(f"[SyncRelations] Lote {batch_num}/{total_batches} ({percent:.1f}%) | Processados: {processed:,}/{total_animes:,} | Novas Arestas: {total_edges_inserted:,} | ETA: ~{eta_min} min", flush=True)

        # 0.7s de intervalo mantém taxa de ~80 req/min (abaixo do teto de 90 req/min do AniList)
        time.sleep(0.7)

    conn.close()
    print(f"[SyncRelations] Finalizado com sucesso! Total de arestas salvas: {total_edges_inserted:,}", flush=True)

if __name__ == '__main__':
    main()
