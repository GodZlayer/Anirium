import sqlite3

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()

# Query dos maiores universos
cur.execute('''
SELECT 
    uw.universe_id,
    COUNT(w.id) as total_obras,
    SUM(CASE WHEN w.media = 'anime' THEN 1 ELSE 0 END) as animes,
    SUM(CASE WHEN w.media = 'manga' THEN 1 ELSE 0 END) as mangas,
    SUM(CASE WHEN w.media = 'novel' THEN 1 ELSE 0 END) as novels
FROM catalog_universe_works uw
JOIN catalog_works w ON uw.work_id = w.id
GROUP BY uw.universe_id
ORDER BY total_obras DESC
LIMIT 20
''')
top20 = cur.fetchall()

print("=== TOP 20 MAIORES UNIVERSOS DO ANIRIUM ===")
results = []
for idx, (univ_id, total, animes, mangas, novels) in enumerate(top20, 1):
    # Buscar os principais títulos de destaque no universo (ex: obras canônicas ou com animes)
    cur.execute('''
        SELECT title, media, format FROM catalog_works 
        WHERE id IN (SELECT work_id FROM catalog_universe_works WHERE universe_id = ?)
        ORDER BY 
            CASE 
                WHEN media = 'anime' AND format = 'TV' THEN 1
                WHEN media = 'anime' THEN 2
                WHEN media = 'manga' THEN 3
                ELSE 4
            END,
            LENGTH(title) ASC
        LIMIT 5
    ''', (univ_id,))
    titles = cur.fetchall()
    
    # Nome principal do universo
    main_name = titles[0][0] if titles else "Universo Desconhecido"
    
    print(f"\n{idx}. {main_name}")
    print(f"   ID: {univ_id}")
    print(f"   Total de Obras: {total:,} [Animes: {animes:,} | Mangas: {mangas:,} | Novels: {novels:,}]")
    print(f"   Destaques do Universo: {', '.join([t[0] for t in titles[:3]])}")
