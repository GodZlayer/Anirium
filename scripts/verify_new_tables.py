import sqlite3

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()
tables = [
  'catalog_roles', 'catalog_creators', 'catalog_studios',
  'catalog_work_creators', 'catalog_work_studios',
  'catalog_tracks', 'catalog_work_tracks',
  'system_strings', 'system_themes'
]
print("=== VERIFICAÇÃO DAS NOVAS TABELAS RELACIONAIS ===")
for t in tables:
    cur.execute(f"PRAGMA table_info({t})")
    cols = [c[1] for c in cur.fetchall()]
    print(f" - {t}: {cols}")
