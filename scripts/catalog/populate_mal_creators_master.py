import sqlite3
import urllib.request
import json
import time
import hashlib
import sys

def deterministic_uuid(namespace, name):
    h = hashlib.sha256(f"{namespace}:{name}".encode('utf-8')).hexdigest()
    return f"{h[:8]}-{h[8:12]}-4{h[13:16]}-a{h[17:20]}-{h[20:32]}"

def main():
    print("[PipelineMAL-Master] Iniciando esteira contínua de Criadores, Músicas e Localização...", flush=True)

    client_id = None
    with open('.env', 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('MAL_CLIENT_ID='):
                client_id = line.strip().split('=', 1)[1].strip('"\' ')

    if not client_id:
        print("[PipelineMAL-Master] Erro: MAL_CLIENT_ID não encontrado no .env", flush=True)
        return

    conn = sqlite3.connect('database/database.sqlite')
    cur = conn.cursor()
    cur.execute("PRAGMA busy_timeout = 60000;")
    cur.execute("PRAGMA foreign_keys = OFF;")

    # 1. Carregar Mangás que ainda não possuem criador cadastrado
    cur.execute("""
    SELECT e.external_id, e.entity_id, w.title
    FROM catalog_external_identities e
    JOIN catalog_works w ON w.id = e.entity_id
    WHERE e.provider = 'mal' AND e.namespace = 'manga:work'
      AND e.entity_id NOT IN (SELECT DISTINCT work_id FROM catalog_work_creators)
    ORDER BY CAST(e.external_id AS INTEGER) ASC
    LIMIT 2000;
    """)
    manga_entries = cur.fetchall()
    print(f"[PipelineMAL-Master] Mangás a processar no lote atual: {len(manga_entries):,}", flush=True)

    manga_fields = "id,title,alternative_titles,start_date,end_date,synopsis,mean,rank,genres,media_type,status,num_volumes,num_chapters,authors{node{id,first_name,last_name},role}"

    creators_to_insert = []
    work_creators_to_insert = []
    translations_to_insert = []

    now = time.strftime('%Y-%m-%d %H:%M:%S')
    start_time = time.time()
    processed_count = 0

    for ext_id, work_id, title in manga_entries:
        url = f"https://api.myanimelist.net/v2/manga/{ext_id}?fields={manga_fields}"
        req = urllib.request.Request(url, headers={'X-MAL-CLIENT-ID': client_id})

        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                d = json.loads(resp.read().decode('utf-8'))

                # A. Autores e Ilustradores
                for author_item in d.get('authors', []):
                    node = author_item.get('node', {})
                    role_str = author_item.get('role', 'Story & Art').lower()
                    first_name = node.get('first_name', '').strip()
                    last_name = node.get('last_name', '').strip()
                    full_name = f"{first_name} {last_name}".strip()
                    if not full_name:
                        continue

                    creator_id = deterministic_uuid('creator', full_name)
                    creators_to_insert.append((creator_id, full_name, None, now, now))

                    # Mapear papel
                    role_id = 'role_author'
                    if 'art' in role_str and 'story' not in role_str:
                        role_id = 'role_illustrator'
                    elif 'story' in role_str and 'art' not in role_str:
                        role_id = 'role_writer'

                    work_creators_to_insert.append((work_id, creator_id, role_id))

                # B. Títulos e Sinopses Multilíngues
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

        except Exception as e:
            if "429" in str(e):
                print(f"[PipelineMAL-Master] Rate limit atingido. Pausando 15s...", flush=True)
                time.sleep(15)
            continue

        processed_count += 1
        time.sleep(0.35)

        if processed_count % 50 == 0:
            elapsed = time.time() - start_time
            rate = processed_count / elapsed if elapsed > 0 else 1
            eta_min = round((len(manga_entries) - processed_count) / rate / 60, 1)
            print(f"[PipelineMAL-Master] Processados: {processed_count}/{len(manga_entries)} | Criadores: {len(creators_to_insert)} | Strings: {len(translations_to_insert)} | ETA: ~{eta_min} min", flush=True)

            # Gravar em blocos intermediários
            cur.execute("BEGIN TRANSACTION")
            if creators_to_insert:
                cur.executemany("INSERT OR IGNORE INTO catalog_creators (id, name, native_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", creators_to_insert)
            if work_creators_to_insert:
                cur.executemany("INSERT OR IGNORE INTO catalog_work_creators (work_id, creator_id, role_id) VALUES (?, ?, ?)", work_creators_to_insert)
            if translations_to_insert:
                cur.executemany("INSERT OR REPLACE INTO catalog_translations (entity_id, entity_kind, field, locale, value) VALUES (?, ?, ?, ?, ?)", translations_to_insert)
            conn.commit()

            creators_to_insert = []
            work_creators_to_insert = []
            translations_to_insert = []

    # Gravação final
    cur.execute("BEGIN TRANSACTION")
    if creators_to_insert:
        cur.executemany("INSERT OR IGNORE INTO catalog_creators (id, name, native_name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", creators_to_insert)
    if work_creators_to_insert:
        cur.executemany("INSERT OR IGNORE INTO catalog_work_creators (work_id, creator_id, role_id) VALUES (?, ?, ?)", work_creators_to_insert)
    if translations_to_insert:
        cur.executemany("INSERT OR REPLACE INTO catalog_translations (entity_id, entity_kind, field, locale, value) VALUES (?, ?, ?, ?, ?)", translations_to_insert)
    conn.commit()
    conn.close()

    print(f"[PipelineMAL-Master] Lote finalizado com sucesso em {round(time.time() - start_time, 2)}s!", flush=True)

if __name__ == '__main__':
    main()
