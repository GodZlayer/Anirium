import sqlite3
import urllib.request
import json
import time

def deterministic_uuid(namespace, name):
    import hashlib
    h = hashlib.sha256(f"{namespace}:{name}".encode('utf-8')).hexdigest()
    return f"{h[:8]}-{h[8:12]}-4{h[13:16]}-a{h[17:20]}-{h[20:32]}"

def main():
    print("[PipelineMAL] Iniciando esteira inteligente de extração relacional pura...", flush=True)

    client_id = None
    with open('.env', 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('MAL_CLIENT_ID='):
                client_id = line.strip().split('=', 1)[1].strip('"\' ')

    if not client_id:
        print("[PipelineMAL] Erro: MAL_CLIENT_ID não encontrado no .env", flush=True)
        return

    conn = sqlite3.connect('database/database.sqlite')
    cur = conn.cursor()
    cur.execute("PRAGMA busy_timeout = 60000;")
    cur.execute("PRAGMA foreign_keys = OFF;")

    # 1. Carregar os IDs de Animes que possuem identificador no MAL
    cur.execute("""
    SELECT e.external_id, e.entity_id, w.title
    FROM catalog_external_identities e
    JOIN catalog_works w ON w.id = e.entity_id
    WHERE e.provider = 'mal' AND e.namespace = 'anime:work'
    ORDER BY CAST(e.external_id AS INTEGER) ASC
    LIMIT 200;
    """)
    anime_entries = cur.fetchall()
    print(f"[PipelineMAL] Lote de teste: {len(anime_entries)} animes a processar...", flush=True)

    fields = "id,title,alternative_titles,start_date,end_date,synopsis,mean,rank,genres,media_type,status,num_episodes,studios,opening_themes,ending_themes"

    translations_to_insert = []
    creators_to_insert = []
    work_creators_to_insert = []
    tracks_to_insert = []
    work_tracks_to_insert = []
    work_studios_to_insert = []
    studios_to_insert = []

    now = time.strftime('%Y-%m-%d %H:%M:%S')

    for ext_id, work_id, title in anime_entries:
        url = f"https://api.myanimelist.net/v2/anime/{ext_id}?fields={fields}"
        req = urllib.request.Request(url, headers={'X-MAL-CLIENT-ID': client_id})

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                d = json.loads(resp.read().decode('utf-8'))

                # A. Traduções / Strings de Títulos e Sinopses
                alt = d.get('alternative_titles', {})
                title_en = alt.get('en') or d.get('title')
                title_ja = alt.get('ja')
                synopsis = d.get('synopsis')

                if d.get('title'):
                    translations_to_insert.append((work_id, 'work', 'title', 'en', d.get('title')))
                if title_ja:
                    translations_to_insert.append((work_id, 'work', 'title', 'ja', title_ja))
                if synopsis:
                    translations_to_insert.append((work_id, 'work', 'synopsis', 'en', synopsis))

                # B. Estúdios de Produção
                for st in d.get('studios', []):
                    st_name = st.get('name')
                    if st_name:
                        st_id = deterministic_uuid('studio', st_name)
                        studios_to_insert.append((st_id, st_name, now, now))
                        work_studios_to_insert.append((work_id, st_id))

                # C. Openings (Trilhas Sonoras)
                for op in d.get('opening_themes', []):
                    text = op.get('text', '')
                    if text:
                        tr_id = deterministic_uuid('track', f"{work_id}:op:{op.get('id', text[:30])}")
                        tracks_to_insert.append((tr_id, None, text, 'op', now, now))
                        work_tracks_to_insert.append((work_id, tr_id))

                # D. Endings (Trilhas Sonoras)
                for ed in d.get('ending_themes', []):
                    text = ed.get('text', '')
                    if text:
                        tr_id = deterministic_uuid('track', f"{work_id}:ed:{ed.get('id', text[:30])}")
                        tracks_to_insert.append((tr_id, None, text, 'ed', now, now))
                        work_tracks_to_insert.append((work_id, tr_id))

        except Exception as e:
            if "429" in str(e):
                time.sleep(10)
            continue

        time.sleep(0.3)

    print(f"[PipelineMAL] Gravação relacional pura...", flush=True)
    cur.execute("BEGIN TRANSACTION")

    if studios_to_insert:
        cur.executemany("INSERT OR IGNORE INTO catalog_studios (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)", studios_to_insert)
    if work_studios_to_insert:
        cur.executemany("INSERT OR IGNORE INTO catalog_work_studios (work_id, studio_id) VALUES (?, ?)", work_studios_to_insert)
    if tracks_to_insert:
        cur.executemany("INSERT OR IGNORE INTO catalog_tracks (id, composer_id, title, track_type, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)", tracks_to_insert)
    if work_tracks_to_insert:
        cur.executemany("INSERT OR IGNORE INTO catalog_work_tracks (work_id, track_id) VALUES (?, ?)", work_tracks_to_insert)
    if translations_to_insert:
        cur.executemany("INSERT OR REPLACE INTO catalog_translations (entity_id, entity_kind, field, locale, value) VALUES (?, ?, ?, ?, ?)", translations_to_insert)

    conn.commit()
    conn.close()
    print(f"[PipelineMAL] Concluído com sucesso! Gravadas {len(translations_to_insert)} strings multilíngues e {len(tracks_to_insert)} trilhas.", flush=True)

if __name__ == '__main__':
    main()
