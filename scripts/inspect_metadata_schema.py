import sqlite3

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()
for t in ['catalog_entities', 'catalog_registry_metadata', 'catalog_external_identities', 'catalog_seasons', 'catalog_work_relations']:
    cur.execute(f"PRAGMA table_info({t})")
    cols = [c[1] for c in cur.fetchall()]
    cur.execute(f"SELECT COUNT(*) FROM {t}")
    count = cur.fetchone()[0]
    print(f"Table {t} ({count} rows): {cols}")
