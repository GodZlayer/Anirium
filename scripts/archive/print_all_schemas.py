import sqlite3

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]

print("=== SCHEMAS ATUAIS DO BANCO ===")
for t in sorted(tables):
    if any(k in t for k in ['catalog', 'user', 'session']):
        cur.execute(f"PRAGMA table_info({t})")
        cols = [c[1] for c in cur.fetchall()]
        print(f"Table: {t}")
        print(f"  Columns: {cols}\n")
