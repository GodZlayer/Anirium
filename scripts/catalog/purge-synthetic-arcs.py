import sqlite3

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()
cur.execute('PRAGMA busy_timeout = 30000;')
cur.execute('PRAGMA foreign_keys = OFF;')

print("[PurgeArcs] Limpando arcos sintéticos da base de dados...")

cur.execute("""
CREATE TEMP TABLE ids_to_delete AS 
SELECT id FROM catalog_arcs 
WHERE source_url = 'canonical-main-story' OR title LIKE '% - Hist%ria Principal'
""")

cur.execute("SELECT count(*) FROM ids_to_delete")
total_fake = cur.fetchone()[0]
print(f"[PurgeArcs] Total de arcos sintéticos identificados para purga: {total_fake:,}")

cur.execute("BEGIN TRANSACTION")

cur.execute("DELETE FROM catalog_arc_episodes WHERE arc_id IN (SELECT id FROM ids_to_delete)")
print("[PurgeArcs] catalog_arc_episodes limpo.")

cur.execute("DELETE FROM catalog_arc_works WHERE arc_id IN (SELECT id FROM ids_to_delete)")
print("[PurgeArcs] catalog_arc_works limpo.")

cur.execute("DELETE FROM catalog_entities WHERE kind = 'arc' AND id IN (SELECT id FROM ids_to_delete)")
print("[PurgeArcs] catalog_entities (arcos) limpo.")

cur.execute("DELETE FROM catalog_arcs WHERE id IN (SELECT id FROM ids_to_delete)")
print("[PurgeArcs] catalog_arcs limpo.")

con.commit()

cur.execute("SELECT count(*) FROM catalog_arcs")
real_arcs = cur.fetchone()[0]
cur.execute("SELECT count(*) FROM catalog_arc_works")
real_arc_works = cur.fetchone()[0]
cur.execute("SELECT count(*) FROM catalog_arc_episodes")
real_arc_eps = cur.fetchone()[0]

print(f"\n=== ESTADO LIMPO E VERÍDICO DOS ARCOS ===")
print(f" - catalog_arcs: {real_arcs:,} arcos reais canônicos")
print(f" - catalog_arc_works: {real_arc_works:,} vínculos reais")
print(f" - catalog_arc_episodes: {real_arc_eps:,} episódios vinculados a arcos reais")
