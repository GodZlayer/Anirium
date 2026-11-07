import sqlite3
import urllib.request
import json
import time
import hashlib
import sys

sys.stdout.reconfigure(encoding='utf-8')

def deterministic_uuid(namespace, name):
    h = hashlib.sha256(f"{namespace}:{name}".encode('utf-8')).hexdigest()
    return f"{h[:8]}-{h[8:12]}-4{h[13:16]}-a{h[17:20]}-{h[20:32]}"

def map_role(role_raw):
    r = role_raw.lower()
    if any(k in r for k in ['original creator', 'original story', 'author', 'story']):
        return 'role_author'
    if any(k in r for k in ['director', 'series director', 'episode director', 'chief director']):
        return 'role_director'
    if any(k in r for k in ['character design', 'original character design']):
        return 'role_character_designer'
    if any(k in r for k in ['music', 'composer']):
        return 'role_composer'
    if any(k in r for k in ['sound director', 'audio director']):
        return 'role_sound_director'
    if any(k in r for k in ['illustration', 'art direction', 'artist', 'art director']):
        return 'role_illustrator'
    if any(k in r for k in ['screenplay', 'script', 'series composition']):
        return 'role_writer'
    if any(k in r for k in ['voice', 'actor', 'seiyuu', 'cast']):
        return 'role_seiyuu'
    return 'role_writer'

def run_mass_enricher():
    print("=" * 70, flush=True)
    print("[Anirium-Omni-Enricher] Iniciando esteira massiva de enriquecimento...", flush=True)
    print("=" * 70, flush=True)

    db_path = 'database/database.sqlite'
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute("PRAGMA busy_timeout = 60000;")
    cur.execute("PRAGMA foreign_keys = OFF;")

    # 1. Carregar obras que têm identidade AniList e ainda não possuem criadores vinculados
    cur.execute("""
    SELECT e.entity_id, CAST(e.external_id AS INTEGER) as anilist_id
    FROM catalog_external_identities e
    JOIN catalog_works w ON w.id = e.entity_id
    WHERE e.provider = 'anilist'
      AND e.entity_id NOT IN (SELECT DISTINCT work_id FROM catalog_work_creators)
    ORDER BY CAST(e.external_id AS INTEGER) ASC
    """)
    pending = cur.fetchall()
    total_pending = len(pending)
    print(f"[Anirium-Omni-Enricher] Obras pendentes com AniList ID: {total_pending:,}", flush=True)

    if not pending:
        print("[Anirium-Omni-Enricher] Nenhuma obra pendente. Finalizado!", flush=True)
        return

    # AniList permite até 50 itens por página com media(id_in)
    PAGE_SIZE = 50
    total_creators_added = 0
    total_studios_added = 0
    total_translations_added = 0
    total_work_creators_added = 0
    total_work_studios_added = 0

    start_time = time.time()
    processed_works = 0

    for i in range(0, total_pending, PAGE_SIZE):
        chunk = pending[i:i + PAGE_SIZE]
        id_map = {anilist_id: work_id for work_id, anilist_id in chunk}
        ids_list = list(id_map.keys())

        query = f"""
        query {{
          Page(page: 1, perPage: {len(ids_list)}) {{
            media(id_in: {json.dumps(ids_list)}) {{
              id
              title {{ romaji english native }}
              description(asHtml: false)
              studios(isMain: false) {{ nodes {{ id name }} }}
              staff(perPage: 25) {{
                edges {{
                  role
                  node {{ id name {{ full native }} image {{ medium }} }}
                }}
              }}
            }}
          }}
        }}
        """

        req_data = json.dumps({'query': query}).encode('utf-8')
        req = urllib.request.Request(
            'https://graphql.anilist.co',
            data=req_data,
            headers={'Content-Type': 'application/json', 'Accept': 'application/json', 'User-Agent': 'Anirium/2.0'}
        )

        media_items = []
        retries = 0
        while retries < 5:
            try:
                with urllib.request.urlopen(req, timeout=15) as resp:
                    res_json = json.loads(resp.read().decode('utf-8'))
                    media_items = res_json.get('data', {}).get('Page', {}).get('media', [])
                    break
            except Exception as e:
                err_msg = str(e)
                if "429" in err_msg:
                    print(f"\n[Anirium-Omni-Enricher] Rate limit AniList (429). Pausa de 30s...", flush=True)
                    time.sleep(30)
                else:
                    retries += 1
                    time.sleep(2)

        if not media_items and retries >= 5:
            print(f"[Anirium-Omni-Enricher] Falha no bloco {i}. Pulando...", flush=True)
            continue

        creators_batch = []
        work_creators_batch = []
        studios_batch = []
        work_studios_batch = []
        translations_batch = []
        now = time.strftime('%Y-%m-%d %H:%M:%S')

        for item in media_items:
            anilist_id = item.get('id')
            work_id = id_map.get(anilist_id)
            if not work_id:
                continue

            # A. Staff / Creators
            for edge in item.get('staff', {}).get('edges', []):
                role_raw = edge.get('role', '')
                node = edge.get('node', {})
                name_info = node.get('name') or {}
                full_name = (name_info.get('full') or '').strip()
                native_name = (name_info.get('native') or '').strip()
                image_url = (node.get('image') or {}).get('medium')

                if not full_name:
                    continue

                creator_id = deterministic_uuid('creator', full_name)
                role_id = map_role(role_raw)

                creators_batch.append((creator_id, full_name, native_name if native_name else None, image_url, now, now))
                work_creators_batch.append((work_id, creator_id, role_id))

            # B. Studios
            for s_node in item.get('studios', {}).get('nodes', []):
                s_name = s_node.get('name', '').strip()
                if not s_name:
                    continue
                studio_id = deterministic_uuid('studio', s_name)
                studios_batch.append((studio_id, s_name, None, now, now))
                work_studios_batch.append((work_id, studio_id))

            # C. Dicionário de Traduções (Whitecontent puro)
            titles = item.get('title', {})
            t_romaji = titles.get('romaji')
            t_english = titles.get('english')
            t_native = titles.get('native')
            desc = item.get('description')

            if t_romaji:
                translations_batch.append((work_id, 'work', 'title', 'romaji', t_romaji))
            if t_english:
                translations_batch.append((work_id, 'work', 'title', 'en', t_english))
            if t_native:
                translations_batch.append((work_id, 'work', 'title', 'ja', t_native))
            if desc:
                translations_batch.append((work_id, 'work', 'synopsis', 'en', desc))

        # Gravação em transação rápida
        cur.execute("BEGIN TRANSACTION")
        if creators_batch:
            cur.executemany("INSERT OR IGNORE INTO catalog_creators (id, name, native_name, image_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", creators_batch)
            total_creators_added += len(creators_batch)
        if work_creators_batch:
            cur.executemany("INSERT OR IGNORE INTO catalog_work_creators (work_id, creator_id, role_id) VALUES (?, ?, ?)", work_creators_batch)
            total_work_creators_added += len(work_creators_batch)
        if studios_batch:
            cur.executemany("INSERT OR IGNORE INTO catalog_studios (id, name, image_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", studios_batch)
            total_studios_added += len(studios_batch)
        if work_studios_batch:
            cur.executemany("INSERT OR IGNORE INTO catalog_work_studios (work_id, studio_id) VALUES (?, ?)", work_studios_batch)
            total_work_studios_added += len(work_studios_batch)
        if translations_batch:
            cur.executemany("INSERT OR REPLACE INTO catalog_translations (entity_id, entity_kind, field, locale, value) VALUES (?, ?, ?, ?, ?)", translations_batch)
            total_translations_added += len(translations_batch)
        conn.commit()

        processed_works += len(chunk)
        elapsed = time.time() - start_time
        rate = processed_works / elapsed if elapsed > 0 else 1
        rem_min = round((total_pending - processed_works) / rate / 60, 1)

        print(f"[Enricher] {processed_works:,}/{total_pending:,} obras ({round(processed_works/total_pending*100, 1)}%) | +{total_creators_added:,} criadores | +{total_work_creators_added:,} links | +{total_studios_added:,} estúdios | +{total_translations_added:,} strings | ETA: ~{rem_min}m", flush=True)

        # AniList permite 90 req/min (~0.7s)
        time.sleep(0.8)

    conn.close()
    print("=" * 70, flush=True)
    print(f"[Anirium-Omni-Enricher] Concluído! {processed_works:,} obras enriquecidas em {round(time.time() - start_time, 1)}s", flush=True)
    print("=" * 70, flush=True)

if __name__ == '__main__':
    run_mass_enricher()
