import pyarrow.parquet as pq
import sqlite3
import os
import sys

sys.stdout.reconfigure(encoding='utf-8')

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()
cur.execute("""
CREATE TABLE IF NOT EXISTS catalog_work_schedules (
    work_id VARCHAR(36) PRIMARY KEY,
    airing_day VARCHAR(20),
    airing_time VARCHAR(10),
    latest_episode_num INTEGER,
    status VARCHAR(30)
)
""")

cur.execute("SELECT external_id, entity_id FROM catalog_external_identities WHERE provider = 'mal' AND namespace = 'anime:work'")
mal_map = dict(cur.fetchall())

t = pq.read_table('storage/legacy_parquet_slices/catalog-seasonal.parquet')
batch = []
for i in range(len(t)):
    mid = str(t['mal_id'][i].as_py())
    wid = mal_map.get(mid)
    if not wid:
        continue
    day = t['airing_day'][i].as_py()
    time_str = t['airing_time'][i].as_py()
    ep = t['latest_episode_num'][i].as_py()
    st = t['status'][i].as_py()
    batch.append((wid, day, time_str, ep, st))

cur.executemany("INSERT OR REPLACE INTO catalog_work_schedules (work_id, airing_day, airing_time, latest_episode_num, status) VALUES (?, ?, ?, ?, ?)", batch)
con.commit()
print(f"Inseridos {len(batch)} horários de transmissão reais no banco!")
con.close()
