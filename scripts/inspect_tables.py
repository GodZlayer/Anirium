import sqlite3

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()
cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
tables = [r[0] for r in cur.fetchall()]
print("Matching tables:")
for t in sorted(tables):
    if any(k in t for k in ['catalog', 'creator', 'person', 'staff', 'studio', 'track', 'song', 'music', 'role']):
        print(" -", t)
