import sqlite3

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()

tables = [
  'catalog_roles', 'catalog_creators', 'catalog_studios',
  'catalog_work_creators', 'catalog_work_studios',
  'catalog_tracks', 'catalog_work_tracks',
  'system_strings', 'system_themes'
]
print("=== DADOS POVOADOS NAS TABELAS RELACIONAIS ===")
for t in tables:
    cur.execute(f"SELECT COUNT(*) FROM {t}")
    print(f" - {t}: {cur.fetchone()[0]:,} registros")

print("\n=== AMOSTRA ESTÚDIOS RELACIONADOS A UMA OBRA (Kimetsu no Yaiba) ===")
cur.execute("""
SELECT w.title, s.name
FROM catalog_work_studios ws
JOIN catalog_works w ON ws.work_id = w.id
JOIN catalog_studios s ON ws.studio_id = s.id
WHERE w.id = '259cb175-284a-417e-92ec-f3895d0c49b0'
""")
for r in cur.fetchall():
    print(" - Obra:", r[0], "| Estúdio:", r[1])

print("\n=== AMOSTRA CRIADORES RELACIONADOS (Kimetsu no Yaiba) ===")
cur.execute("""
SELECT w.title, c.name, r.token
FROM catalog_work_creators wc
JOIN catalog_works w ON wc.work_id = w.id
JOIN catalog_creators c ON wc.creator_id = c.id
JOIN catalog_roles r ON wc.role_id = r.id
WHERE w.id = '259cb175-284a-417e-92ec-f3895d0c49b0'
""")
for r in cur.fetchall():
    print(" - Obra:", r[0], "| Criador:", r[1], "| Papel:", r[2])

print("\n=== AMOSTRA TRILHAS RELACIONADAS (Kimetsu no Yaiba) ===")
cur.execute("""
SELECT w.title, t.title, c.name, t.track_type
FROM catalog_work_tracks wt
JOIN catalog_works w ON wt.work_id = w.id
JOIN catalog_tracks t ON wt.track_id = t.id
JOIN catalog_creators c ON t.composer_id = c.id
WHERE w.id = '259cb175-284a-417e-92ec-f3895d0c49b0'
""")
for r in cur.fetchall():
    print(" - Obra:", r[0], "| Trilha:", r[1], "| Compositor:", r[2], "| Tipo:", r[3])
