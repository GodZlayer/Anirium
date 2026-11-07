import sqlite3

con = sqlite3.connect('database/database.sqlite.bak')
cur = con.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print(f"Total tables: {len(tables)}")
for t in sorted(tables):
    try:
        cur.execute(f"SELECT COUNT(*) FROM {t}")
        print(f" - {t}: {cur.fetchone()[0]}")
    except Exception as e:
        print(f" - {t}: {e}")
