import sqlite3

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()

# 1. Censo por Tabela
tables = [
    ('catalog_universes', 'Universos Canonicos', 'SELECT count(*) FROM catalog_universes'),
    ('catalog_works', 'Obras (Total Absoluto)', 'SELECT count(*) FROM catalog_works'),
    ('catalog_universe_works', 'Interseccao Universo <-> Obra', 'SELECT count(*) FROM catalog_universe_works'),
    ('catalog_arcs', 'Arcos Narrativos (Sigma Obras)', 'SELECT count(*) FROM catalog_arcs'),
    ('catalog_arc_works', 'Interseccao Arco <-> Obra', 'SELECT count(*) FROM catalog_arc_works'),
    ('catalog_episodes', 'Episodios Catalogados', 'SELECT count(*) FROM catalog_episodes'),
    ('catalog_work_relations', 'Relacoes Entre Obras', 'SELECT count(*) FROM catalog_work_relations'),
    ('catalog_studios', 'Estudios de Producao', 'SELECT count(*) FROM catalog_studios'),
    ('catalog_work_studios', 'Interseccao Obra <-> Estudio', 'SELECT count(*) FROM catalog_work_studios'),
    ('catalog_creators', 'Criadores (Pessoas Fisicas)', 'SELECT count(*) FROM catalog_creators'),
    ('catalog_roles', 'Papeis na Industria', 'SELECT count(*) FROM catalog_roles'),
    ('catalog_work_creators', 'Interseccao Obra <-> Criador', 'SELECT count(*) FROM catalog_work_creators'),
    ('catalog_tracks', 'Trilhas Sonoras / BGM', 'SELECT count(*) FROM catalog_tracks'),
    ('catalog_work_tracks', 'Interseccao Obra <-> Trilha', 'SELECT count(*) FROM catalog_work_tracks'),
    ('system_strings', 'Dicionario de Strings', 'SELECT count(*) FROM system_strings'),
    ('system_themes', 'Dicionario de Temas', 'SELECT count(*) FROM system_themes')
]

print("=== 1. TABELAS DE ENTIDADES E INTERSECCOES ===")
for tbl, desc, q in tables:
    cur.execute(q)
    cnt = cur.fetchone()[0]
    print(f"{tbl:<25} | {desc:<32} | {cnt:>10,}")

print("\n=== 2. DETALHAMENTO DE OBRAS POR FORMATO E MIDIA ===")
cur.execute("""
SELECT media, format, count(*) 
FROM catalog_works 
GROUP BY media, format 
ORDER BY media, count(*) DESC
""")
for media, fmt, cnt in cur.fetchall():
    print(f"Media: {media:<6} | Formato: {fmt or 'N/A':<10} | Total: {cnt:>8,}")

print("\n=== 3. DISTRIBUICAO DE OBRAS POR UNIVERSO ===")
cur.execute("""
SELECT 
    CASE 
        WHEN c = 1 THEN 'Universo de Obra Unica (One-shot / Isolado)'
        WHEN c BETWEEN 2 AND 5 THEN 'Universo Pequeno (2 a 5 obras)'
        WHEN c BETWEEN 6 AND 20 THEN 'Franquia Media (6 a 20 obras)'
        WHEN c BETWEEN 21 AND 100 THEN 'Grande Franquia (21 a 100 obras)'
        ELSE 'Superfranquia Cosmica (> 100 obras)'
    END as categoria,
    COUNT(*) as total_universos,
    SUM(c) as total_obras
FROM (
    SELECT universe_id, count(work_id) as c 
    FROM catalog_universe_works 
    GROUP BY universe_id
)
GROUP BY categoria
ORDER BY total_obras DESC
""")
for cat, u_cnt, w_cnt in cur.fetchall():
    print(f"{cat:<40} | Universos: {u_cnt:>8,} | Obras Somadas: {w_cnt:>8,}")
