import sqlite3

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()
cur.execute('PRAGMA foreign_keys = ON;')

universe_id = 'e1a5be18-8cee-412c-ac84-57662be15e73'

cur.execute("""
SELECT id, title, classification FROM catalog_arcs 
WHERE universe_id = ? AND (title LIKE '%Mugen Ressha%' OR title LIKE '%Mugen Train%')
""", (universe_id,))
print('Existing arcs:', cur.fetchall())

# Let's ensure the 3 (or 4) canonical works are linked to the unified Mugen Train arc:
# 1. Manga: Demon Slayer: Kimetsu no Yaiba (a8277dca-278f-4ceb-836f-88e10236896a) - Ch 54 to 69
# 2. Movie: Kimetsu no Yaiba Movie: Mugen Ressha-hen (e5ee596b-5f44-46ca-a3fb-7840c9066e85) - 1 Movie
# 3. TV Anime: Kimetsu no Yaiba: Mugen Ressha-hen (259cb175-284a-417e-92ec-f3895d0c49b0) - 7 Episodes
# 4. Light Novel: Demon Slayer: Kimetsu no Yaiba Movie - Mugen Train (a0159ee0-e5e1-495f-a81a-c31bf7f3a286) - 1 Novel

# Let's inspect e3970c1e-3a24-469f-b09b-35bc2c34802c and 4b075892-5ae9-4aa6-b530-638f033abb83
cur.execute("""
SELECT aw.arc_id, a.title, aw.work_id, w.title, w.format, w.media, aw.start_number, aw.end_number
FROM catalog_arc_works aw
JOIN catalog_arcs a ON aw.arc_id = a.id
JOIN catalog_works w ON aw.work_id = w.id
WHERE a.universe_id = ? AND (a.title LIKE '%Mugen Ressha%' OR a.title LIKE '%Mugen Train%')
""", (universe_id,))
print('Existing arc works links:')
for row in cur.fetchall():
    print(row)
