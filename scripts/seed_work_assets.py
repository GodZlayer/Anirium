import pyarrow.parquet as pq
import sqlite3
import json
import time
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()
cur.execute("""
CREATE TABLE IF NOT EXISTS catalog_work_assets (
    work_id VARCHAR(36) PRIMARY KEY,
    image_url TEXT,
    banner_url TEXT,
    created_at DATETIME,
    updated_at DATETIME
)
""")
con.commit()

# Carregar mapeamento mal_id -> work_id em memória
cur.execute("SELECT external_id, entity_id FROM catalog_external_identities WHERE provider = 'mal'")
mal_map = dict(cur.fetchall())
print(f"Mapeamento MAL carregado: {len(mal_map):,} obras.")

slices = [
    'storage/legacy_parquet_slices/catalog-popular.parquet',
    'storage/legacy_parquet_slices/catalog-seasonal.parquet',
    'storage/legacy_parquet_slices/catalog-upcoming.parquet',
    'storage/legacy_parquet_slices/catalog-archive.parquet',
    'storage/legacy_parquet_slices/catalog-manga.parquet',
]

now = time.strftime('%Y-%m-%d %H:%M:%S')
total_inserted = 0

for s in slices:
    if not os.path.exists(s):
        continue
    table = pq.read_table(s)
    batch = []
    for i in range(len(table)):
        mal_id = str(table['mal_id'][i].as_py())
        work_id = mal_map.get(mal_id)
        if not work_id:
            continue
        imgs_raw = table['images_json'][i].as_py()
        if not imgs_raw:
            continue
        try:
            d = json.loads(imgs_raw)
            img = d.get('jpg', {}).get('large_image_url') or d.get('jpg', {}).get('image_url')
            if img:
                batch.append((work_id, img, None, now, now))
        except:
            pass

    if batch:
        cur.executemany("INSERT OR REPLACE INTO catalog_work_assets (work_id, image_url, banner_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", batch)
        con.commit()
        total_inserted += len(batch)
        print(f"Processado {s}: +{len(batch):,} posters.")

con.close()
print(f"Total de assets oficiais gravados: {total_inserted:,}")
