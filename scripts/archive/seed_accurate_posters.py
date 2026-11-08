import pyarrow.parquet as pq
import sqlite3
import json
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()

cur.execute("SELECT external_id, entity_id FROM catalog_external_identities WHERE provider = 'mal' AND namespace = 'anime:work'")
mal_map = dict(cur.fetchall())
print(f"Mapeamento oficial: {len(mal_map):,} animes.")

slices = [
    'storage/legacy_parquet_slices/catalog-popular.parquet',
    'storage/legacy_parquet_slices/catalog-seasonal.parquet',
    'storage/legacy_parquet_slices/catalog-upcoming.parquet',
    'storage/legacy_parquet_slices/catalog-archive.parquet',
]

batch = []
for s in slices:
    if not os.path.exists(s):
        continue
    t = pq.read_table(s)
    for i in range(len(t)):
        mal_id = str(t['mal_id'][i].as_py())
        work_id = mal_map.get(mal_id)
        if not work_id:
            continue
        raw_imgs = t['images_json'][i].as_py()
        if not raw_imgs:
            continue
        try:
            d = json.loads(raw_imgs)
            url = d.get('jpg', {}).get('large_image_url') or d.get('jpg', {}).get('image_url')
            if url:
                batch.append((work_id, url, None, '2026-11-03 00:00:00', '2026-11-03 00:00:00'))
        except:
            pass

cur.executemany("INSERT OR REPLACE INTO catalog_work_assets (work_id, image_url, banner_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)", batch)
con.commit()
print(f"Inseridos com sucesso: {len(batch):,} posters oficiais!")

cur.execute("SELECT image_url FROM catalog_work_assets WHERE work_id = '389ed6b4-d799-48ee-99f7-667a812046a6'")
print("Cowboy Bebop poster oficial agora:", cur.fetchone())
con.close()
