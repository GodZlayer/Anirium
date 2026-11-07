import sqlite3
import urllib.request
import json
import time
import hashlib
import sys
import re

sys.stdout.reconfigure(encoding='utf-8')

def deterministic_uuid(namespace, name):
    h = hashlib.sha256(f"{namespace}:{name}".encode('utf-8')).hexdigest()
    return f"{h[:8]}-{h[8:12]}-4{h[13:16]}-a{h[17:20]}-{h[20:32]}"

def clean_theme_text(text):
    # Ex: '#1: "The Real Folk Blues" by The Seatbelts feat. Mai Yamane (eps 1-12)'
    # ou '"Tank!" by The Seatbelts (eps 1-25)'
    t = text.strip()
    # Se tiver aspas, pega o que está dentro como título principal
    match_quote = re.search(r'"([^"]+)"', t)
    if match_quote:
        title = match_quote.group(1).strip()
    else:
        # Remove coisas tipo #1: no início
        title = re.sub(r'^#\d+:\s*', '', t).strip()
    return title if title else t

def run_tracks_enricher():
    print("=" * 70, flush=True)
    print("[Anirium-Tracks-Enricher] Iniciando extração massiva de temas musicais (OP/ED)...", flush=True)
    print("=" * 70, flush=True)

    client_id = None
    with open('.env', 'r', encoding='utf-8') as f:
        for line in f:
            if line.startswith('MAL_CLIENT_ID='):
                client_id = line.strip().split('=', 1)[1].strip('"\' ')

    if not client_id:
        print("[Anirium-Tracks-Enricher] Erro: MAL_CLIENT_ID não encontrado no .env", flush=True)
        return

    conn = sqlite3.connect('database/database.sqlite')
    cur = conn.cursor()
    cur.execute("PRAGMA busy_timeout = 60000;")
    cur.execute("PRAGMA foreign_keys = OFF;")

    # Carregar animes pendentes de trilha musical
    cur.execute("""
    SELECT e.entity_id, e.external_id, w.title
    FROM catalog_external_identities e
    JOIN catalog_works w ON w.id = e.entity_id
    WHERE e.provider = 'mal' AND e.namespace = 'anime:work'
      AND e.entity_id NOT IN (SELECT DISTINCT work_id FROM catalog_work_tracks)
    ORDER BY CAST(e.external_id AS INTEGER) ASC
    """)
    pending = cur.fetchall()
    total_pending = len(pending)
    print(f"[Anirium-Tracks-Enricher] Total de animes pendentes de músicas: {total_pending:,}", flush=True)

    if not pending:
        print("[Anirium-Tracks-Enricher] Nenhuma obra pendente de trilha sonora!", flush=True)
        return

    fields = "id,title,opening_themes,ending_themes"
    now = time.strftime('%Y-%m-%d %H:%M:%S')
    start_time = time.time()
    processed_count = 0

    tracks_to_insert = []
    work_tracks_to_insert = []
    total_tracks_added = 0
    total_work_tracks_added = 0

    for work_id, ext_id, work_title in pending:
        url = f"https://api.myanimelist.net/v2/anime/{ext_id}?fields={fields}"
        req = urllib.request.Request(url, headers={'X-MAL-CLIENT-ID': client_id, 'User-Agent': 'Anirium/2.0'})

        retries = 0
        success = False
        data = None

        while not success and retries < 4:
            try:
                with urllib.request.urlopen(req, timeout=10) as resp:
                    data = json.loads(resp.read().decode('utf-8'))
                    success = True
            except Exception as e:
                err_str = str(e)
                if "429" in err_str:
                    print(f"\n[Tracks] Rate limit (429). Pausa de 15s...", flush=True)
                    time.sleep(15)
                else:
                    retries += 1
                    time.sleep(1)

        if not success or not data:
            processed_count += 1
            continue

        # Processar Opening Themes
        for op in data.get('opening_themes', []):
            raw_text = op.get('text', '').strip()
            if not raw_text:
                continue
            clean_title = clean_theme_text(raw_text)
            track_id = deterministic_uuid('track_op', f"{clean_title}:{work_id}")

            tracks_to_insert.append((track_id, None, clean_title, 'opening', None, now, now))
            work_tracks_to_insert.append((work_id, track_id, None))

        # Processar Ending Themes
        for ed in data.get('ending_themes', []):
            raw_text = ed.get('text', '').strip()
            if not raw_text:
                continue
            clean_title = clean_theme_text(raw_text)
            track_id = deterministic_uuid('track_ed', f"{clean_title}:{work_id}")

            tracks_to_insert.append((track_id, None, clean_title, 'ending', None, now, now))
            work_tracks_to_insert.append((work_id, track_id, None))

        processed_count += 1
        time.sleep(0.35)

        if processed_count % 50 == 0:
            cur.execute("BEGIN TRANSACTION")
            if tracks_to_insert:
                cur.executemany("INSERT OR IGNORE INTO catalog_tracks (id, composer_id, title, track_type, duration_seconds, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", tracks_to_insert)
                total_tracks_added += len(tracks_to_insert)
            if work_tracks_to_insert:
                cur.executemany("INSERT OR IGNORE INTO catalog_work_tracks (work_id, track_id, episode_id) VALUES (?, ?, ?)", work_tracks_to_insert)
                total_work_tracks_added += len(work_tracks_to_insert)
            conn.commit()

            tracks_to_insert = []
            work_tracks_to_insert = []

            elapsed = time.time() - start_time
            rate = processed_count / elapsed if elapsed > 0 else 1
            rem_min = round((total_pending - processed_count) / rate / 60, 1)
            print(f"[Tracks] {processed_count:,}/{total_pending:,} animes ({round(processed_count/total_pending*100, 1)}%) | +{total_tracks_added:,} músicas inseridas | ETA: ~{rem_min}m", flush=True)

    # Inserção final
    cur.execute("BEGIN TRANSACTION")
    if tracks_to_insert:
        cur.executemany("INSERT OR IGNORE INTO catalog_tracks (id, composer_id, title, track_type, duration_seconds, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)", tracks_to_insert)
        total_tracks_added += len(tracks_to_insert)
    if work_tracks_to_insert:
        cur.executemany("INSERT OR IGNORE INTO catalog_work_tracks (work_id, track_id, episode_id) VALUES (?, ?, ?)", work_tracks_to_insert)
        total_work_tracks_added += len(work_tracks_to_insert)
    conn.commit()
    conn.close()

    print("=" * 70, flush=True)
    print(f"[Anirium-Tracks-Enricher] Finalizado com sucesso! {total_tracks_added:,} faixas musicais inseridas em {round(time.time() - start_time, 1)}s", flush=True)
    print("=" * 70, flush=True)

if __name__ == '__main__':
    run_tracks_enricher()
