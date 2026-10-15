"""
Ingestão e Reconciliação Autônoma:
Lê as 30.824 obras detalhadas de 'anime' salvas em data/mal-api-acquisition/mal.sqlite3
e insere/atualiza diretamente no PostgreSQL anirium_canonical (tabela anime_catalog).
Preserva idempotência, tipos exatos, campos JSON e integridade referencial.
"""
import json
import sqlite3
import psycopg2
from psycopg2.extras import execute_batch
import time

SQLITE_PATH = "data/mal-api-acquisition/mal.sqlite3"
PG_DSN = "postgresql://anirium:anirium_master_key_2026@127.0.0.1:5435/anirium_canonical"

def map_anime(data):
    mal_id = data.get("id")
    if not mal_id:
        return None

    title = data.get("title") or "Unknown Title"
    alt = data.get("alternative_titles") or {}
    title_en = alt.get("en") or None
    title_ja = alt.get("ja") or None
    synonyms = alt.get("synonyms") or []

    # Picture
    pic = data.get("main_picture") or {}
    images_json = {
        "jpg": {
            "image_url": pic.get("medium") or "",
            "large_image_url": pic.get("large") or pic.get("medium") or ""
        }
    }

    synopsis = data.get("synopsis") or None
    mean = data.get("mean")
    score = float(mean) if mean is not None else None
    num_scoring = data.get("num_scoring_users")
    popularity = data.get("popularity")
    num_episodes = data.get("num_episodes") or None

    status_raw = data.get("status")
    status_map = {
        "finished_airing": "FINISHED",
        "currently_airing": "RELEASING",
        "not_yet_aired": "NOT_YET_RELEASED"
    }
    status = status_map.get(status_raw, status_raw.upper() if status_raw else "FINISHED")

    media_type = data.get("media_type")
    format_map = {
        "tv": "TV",
        "movie": "MOVIE",
        "ova": "OVA",
        "ona": "ONA",
        "special": "SPECIAL",
        "music": "MUSIC"
    }
    format_val = format_map.get(media_type, media_type.upper() if media_type else "TV")

    # Category for browsing
    category = "popular" if (popularity and popularity <= 1000) else "catalog_archive"
    if status == "RELEASING":
        category = "seasonal"
    elif status == "NOT_YET_RELEASED":
        category = "upcoming"

    # Genres
    genres = [g.get("name") for g in data.get("genres", []) if "name" in g]

    # Studios
    studios = [s.get("name") for s in data.get("studios", []) if "name" in s]

    # Year
    start_season = data.get("start_season") or {}
    year = start_season.get("year")
    if not year and data.get("start_date"):
        try:
            year = int(data["start_date"][:4])
        except Exception:
            year = None

    now_ms = int(time.time() * 1000)

    return (
        mal_id,
        mal_id,
        title,
        title_en,
        title_ja,
        None, # title_portuguese
        json.dumps(synonyms),
        json.dumps(images_json),
        synopsis,
        score,
        num_scoring,
        popularity,
        num_episodes,
        status,
        category,
        json.dumps(genres),
        json.dumps([]), # tags
        json.dumps(studios),
        year,
        format_val,
        None, # banner_image
        json.dumps([]), # streaming_links
        json.dumps([]), # seasons_json
        f"mal-{mal_id}", # universe_id
        f"mal-{mal_id}", # franchise_root
        "MAIN",
        None, # next_airing_episode_json
        now_ms
    )

UPSERT_QUERY = """
INSERT INTO anime_catalog (
    mal_id, id_mal, title, title_english, title_japanese, title_portuguese,
    synonyms_json, images_json, synopsis, score, scored_by, popularity,
    episodes, status, category, genres_json, tags_json, studios_json,
    year, format, banner_image, streaming_links_json, seasons_json,
    universe_id, franchise_root, relation_type, next_airing_episode_json,
    updated_at
) VALUES (
    %s, %s, %s, %s, %s, %s,
    %s, %s, %s, %s, %s, %s,
    %s, %s, %s, %s, %s, %s,
    %s, %s, %s, %s, %s,
    %s, %s, %s, %s,
    %s
)
ON CONFLICT (mal_id) DO UPDATE SET
    id_mal = EXCLUDED.id_mal,
    title = EXCLUDED.title,
    title_english = COALESCE(EXCLUDED.title_english, anime_catalog.title_english),
    title_japanese = COALESCE(EXCLUDED.title_japanese, anime_catalog.title_japanese),
    synonyms_json = EXCLUDED.synonyms_json,
    images_json = EXCLUDED.images_json,
    synopsis = COALESCE(EXCLUDED.synopsis, anime_catalog.synopsis),
    score = COALESCE(EXCLUDED.score, anime_catalog.score),
    scored_by = COALESCE(EXCLUDED.scored_by, anime_catalog.scored_by),
    popularity = COALESCE(EXCLUDED.popularity, anime_catalog.popularity),
    episodes = COALESCE(EXCLUDED.episodes, anime_catalog.episodes),
    status = EXCLUDED.status,
    category = EXCLUDED.category,
    genres_json = EXCLUDED.genres_json,
    studios_json = EXCLUDED.studios_json,
    year = COALESCE(EXCLUDED.year, anime_catalog.year),
    format = EXCLUDED.format,
    updated_at = EXCLUDED.updated_at;
"""

def main():
    print("Iniciando populador autônomo do banco canônico PostgreSQL...")
    lite = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
    cur_lite = lite.cursor()

    pg = psycopg2.connect(PG_DSN)
    cur_pg = pg.cursor()

    query_sql = "SELECT body FROM responses WHERE url LIKE '%/anime/%' AND status=200"
    cur_lite.execute(query_sql)

    batch = []
    processed = 0
    inserted = 0

    while True:
        rows = cur_lite.fetchmany(1000)
        if not rows:
            break

        for (body,) in rows:
            processed += 1
            try:
                data = json.loads(body)
                mapped = map_anime(data)
                if mapped:
                    batch.append(mapped)
            except Exception:
                continue

            if len(batch) >= 500:
                execute_batch(cur_pg, UPSERT_QUERY, batch)
                pg.commit()
                inserted += len(batch)
                batch = []
                print(f"Progresso: {inserted} animes sincronizados no PostgreSQL...", flush=True)

    if batch:
        execute_batch(cur_pg, UPSERT_QUERY, batch)
        pg.commit()
        inserted += len(batch)

    cur_pg.close()
    pg.close()
    cur_lite.close()
    lite.close()

    print(f"SUCESSO: Sincronização concluída! Total processado: {processed}, Inseridos/Atualizados no PG: {inserted}")

if __name__ == "__main__":
    main()
