import sqlite3

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()
cur.execute('PRAGMA foreign_keys = ON;')

universe_id = 'e1a5be18-8cee-412c-ac84-57662be15e73'
manga_id = 'a8277dca-278f-4ceb-836f-88e10236896a'
tv_id = '259cb175-284a-417e-92ec-f3895d0c49b0'
movie_id = 'e5ee596b-5f44-46ca-a3fb-7840c9066e85'
novel_id = 'a0159ee0-e5e1-495f-a81a-c31bf7f3a286'

# Let's see: arc e3970c1e-3a24-469f-b09b-35bc2c34802c can represent the unified Mugen Train Arc
arc_id = 'e3970c1e-3a24-469f-b09b-35bc2c34802c'

# Update arc title to clean canonical name
cur.execute("UPDATE catalog_arcs SET title = 'Mugen Train (Trem Infinito)' WHERE id = ?", (arc_id,))

# Ensure novel_id is in catalog_universe_works
cur.execute("INSERT OR IGNORE INTO catalog_universe_works (universe_id, work_id) VALUES (?, ?)", (universe_id, novel_id))

# Link the manifestations to this arc:
# 1. Manga: Ch. 54 to 69
cur.execute("""
INSERT OR REPLACE INTO catalog_arc_works (arc_id, universe_id, work_id, start_number, end_number)
VALUES (?, ?, ?, 54, 69)
""", (arc_id, universe_id, manga_id))

# 2. TV Anime: Eps 1 to 7
cur.execute("""
INSERT OR REPLACE INTO catalog_arc_works (arc_id, universe_id, work_id, start_number, end_number)
VALUES (?, ?, ?, 1, 7)
""", (arc_id, universe_id, tv_id))

# 3. Movie: Film 1 (117 min)
cur.execute("""
INSERT OR REPLACE INTO catalog_arc_works (arc_id, universe_id, work_id, start_number, end_number)
VALUES (?, ?, ?, 1, 1)
""", (arc_id, universe_id, movie_id))

# 4. Novel: 1 Volume
cur.execute("""
INSERT OR REPLACE INTO catalog_arc_works (arc_id, universe_id, work_id, start_number, end_number)
VALUES (?, ?, ?, 1, 1)
""", (arc_id, universe_id, novel_id))

con.commit()

# Verify
cur.execute("""
SELECT aw.arc_id, a.title, w.id, w.title, w.format, w.media, aw.start_number, aw.end_number
FROM catalog_arc_works aw
JOIN catalog_arcs a ON aw.arc_id = a.id
JOIN catalog_works w ON aw.work_id = w.id
WHERE a.id = ?
""", (arc_id,))
print("Updated Mugen Train Arc works:")
for row in cur.fetchall():
    print(row)
