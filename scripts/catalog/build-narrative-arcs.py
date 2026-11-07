import sqlite3
import hashlib
import time

def deterministic_uuid(namespace, name):
    h = hashlib.sha256(f"{namespace}:{name}".encode('utf-8')).hexdigest()
    return f"{h[:8]}-{h[8:12]}-4{h[13:16]}-a{h[17:20]}-{h[20:32]}"

def main():
    print("[NarrativeEngine] Iniciando a construção ontológica de arcos canônicos...")
    start_time = time.time()
    
    conn = sqlite3.connect('database/database.sqlite')
    cur = conn.cursor()
    cur.execute("PRAGMA busy_timeout = 60000;")
    cur.execute("PRAGMA foreign_keys = OFF;")
    cur.execute("PRAGMA synchronous = NORMAL;")
    cur.execute("PRAGMA journal_mode = WAL;")

    # 1. Carregar universos que já possuem arcos manuais para preservar
    cur.execute("SELECT DISTINCT universe_id FROM catalog_arcs;")
    existing_universe_ids = set(r[0] for r in cur.fetchall())
    print(f"[NarrativeEngine] Universos com arcos manuais preservados: {len(existing_universe_ids)}")

    # 2. Obter todas as obras agrupadas por universo
    print("[NarrativeEngine] Carregando obras e suas fontes genealógicas...")
    cur.execute("""
    SELECT uw.universe_id, w.id, w.title, w.media, w.format
    FROM catalog_universe_works uw
    JOIN catalog_works w ON w.id = uw.work_id
    """)
    universe_works = {}
    for uid, wid, title, media, fmt in cur.fetchall():
        if uid not in universe_works:
            universe_works[uid] = []
        universe_works[uid].append({
            'id': wid,
            'title': title,
            'media': media,
            'format': fmt
        })

    # 3. Carregar contagem de episódios por obra
    cur.execute("SELECT work_id, MIN(number), MAX(number), COUNT(id) FROM catalog_episodes GROUP BY work_id")
    work_episode_stats = {}
    for wid, min_ep, max_ep, count_ep in cur.fetchall():
        work_episode_stats[wid] = (min_ep or 1, max_ep or count_ep, count_ep)

    print(f"[NarrativeEngine] Total de universos para processar: {len(universe_works)}")

    arcs_to_insert = []
    entities_to_insert = []
    arc_works_to_insert = []

    # Ordem de prioridade para determinar a Raiz Narrativa Canônica da História
    # Se houver mangá ou novel, ela dita a fonte canônica original. Se for anime original, o TV/Anime assume.
    format_priority = {
        'MANGA': 100,
        'NOVEL': 95,
        'TV': 90,
        'OVA': 80,
        'MOVIE': 75,
        'ONA': 70,
        'MANHWA': 65,
        'MANHUA': 60,
        'SPECIAL': 50,
        'TV_SPECIAL': 45,
        'OTHER': 40
    }

    universes_created = 0
    now = time.strftime('%Y-%m-%d %H:%M:%S')

    for uid, works in universe_works.items():
        if uid in existing_universe_ids:
            continue

        # Ordenar obras por prioridade de fonte raiz
        def score_work(w):
            f_score = format_priority.get(w['format'], 20)
            m_score = 30 if w['media'] in ('manga', 'novel') else 10
            return f_score + m_score

        sorted_works = sorted(works, key=score_work, reverse=True)
        root_work = sorted_works[0]

        # Criar o Arco Canônico Unificado deste universo
        arc_id = deterministic_uuid('arc', f"canonical:{uid}")
        arc_title = f"{root_work['title']} - Arco Canônico"

        entities_to_insert.append((arc_id, 'arc', 'verified', now, now))
        arcs_to_insert.append((arc_id, uid, arc_title, 'canon', 'canonical-narrative-engine'))

        # Vincular todas as obras do universo a este arco canônico
        for w in works:
            wid = w['id']
            if wid in work_episode_stats:
                min_ep, max_ep, _ = work_episode_stats[wid]
                start_num, end_num = min_ep, max_ep
            else:
                start_num, end_num = 1, 1

            arc_works_to_insert.append((arc_id, uid, wid, start_num, end_num))

        universes_created += 1

    print(f"[NarrativeEngine] Arcos a inserir: {len(arcs_to_insert)}")
    print(f"[NarrativeEngine] Intersecções arc_works a inserir: {len(arc_works_to_insert)}")

    # Executar inserções em lotes
    cur.execute("BEGIN TRANSACTION")
    batch_size = 50000

    print("[NarrativeEngine] Gravando em catalog_entities...")
    for i in range(0, len(entities_to_insert), batch_size):
        cur.executemany("""
        INSERT OR IGNORE INTO catalog_entities (id, kind, resolution_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?)
        """, entities_to_insert[i:i+batch_size])

    print("[NarrativeEngine] Gravando em catalog_arcs...")
    for i in range(0, len(arcs_to_insert), batch_size):
        cur.executemany("""
        INSERT OR IGNORE INTO catalog_arcs (id, universe_id, title, classification, source_url)
        VALUES (?, ?, ?, ?, ?)
        """, arcs_to_insert[i:i+batch_size])

    print("[NarrativeEngine] Gravando em catalog_arc_works...")
    for i in range(0, len(arc_works_to_insert), batch_size):
        cur.executemany("""
        INSERT OR IGNORE INTO catalog_arc_works (arc_id, universe_id, work_id, start_number, end_number)
        VALUES (?, ?, ?, ?, ?)
        """, arc_works_to_insert[i:i+batch_size])

    conn.commit()

    # 4. Vincular todos os episódios aos arcos correspondentes
    print("[NarrativeEngine] Vinculando todos os episódios em catalog_arc_episodes...")
    cur.execute("BEGIN TRANSACTION")
    cur.execute("""
    INSERT OR IGNORE INTO catalog_arc_episodes (arc_id, episode_id, universe_id, work_id)
    SELECT aw.arc_id, e.id, aw.universe_id, aw.work_id
    FROM catalog_episodes e
    JOIN catalog_arc_works aw ON aw.work_id = e.work_id;
    """)
    linked_episodes = cur.rowcount
    conn.commit()

    # Validação final
    cur.execute("SELECT COUNT(*) FROM catalog_arcs;")
    final_arcs = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM catalog_arc_works;")
    final_arc_works = cur.fetchone()[0]
    cur.execute("SELECT COUNT(*) FROM catalog_arc_episodes;")
    final_arc_episodes = cur.fetchone()[0]
    cur.execute("SELECT COUNT(DISTINCT episode_id) FROM catalog_arc_episodes;")
    covered_episodes = cur.fetchone()[0]

    conn.close()

    elapsed = round(time.time() - start_time, 2)
    print("=" * 60)
    print(f"[NarrativeEngine] SUCESSO ABSOLUTO em {elapsed}s!")
    print(f"Total de Arcos: {final_arcs}")
    print(f"Total de Relações Arc-Works: {final_arc_works}")
    print(f"Total de Episódios Vinculados: {covered_episodes} de 74568")
    print("=" * 60)

if __name__ == '__main__':
    main()
