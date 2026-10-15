"""
Exportador Canônico Modular Parquet:
Gera arquivos Parquet altamente compactados (Snappy/ZSTD) direto da tabela anime_catalog do PostgreSQL.
Separação modular por fatias lógicas:
1. public/data/catalog-popular.parquet (Top 1.000 mais populares para o Lobby imediato)
2. public/data/catalog-seasonal.parquet (Obras da temporada atual e lançamentos)
3. public/data/catalog-upcoming.parquet (Obras futuras / adiantadas / aguardadas)
4. public/data/catalog-diff.parquet (Atualizações diárias de status: cancelamentos, adiamentos, alterações de data)
5. public/data/catalog-archive.parquet (Base enciclopédica total compactada)
"""

import json
import psycopg2
import pyarrow as pa
import pyarrow.parquet as pq
import pathlib
import time

PG_DSN = "postgresql://anirium:anirium_master_key_2026@127.0.0.1:5435/anirium_canonical"
OUTPUT_DIR = pathlib.Path("public/data")

SCHEMA = pa.schema([
    ("mal_id", pa.int32()),
    ("title", pa.string()),
    ("title_english", pa.string()),
    ("title_japanese", pa.string()),
    ("images_json", pa.string()),
    ("synopsis", pa.string()),
    ("score", pa.float32()),
    ("popularity", pa.int32()),
    ("episodes", pa.int32()),
    ("status", pa.string()),
    ("category", pa.string()),
    ("genres_json", pa.string()),
    ("studios_json", pa.string()),
    ("year", pa.int32()),
    ("format", pa.string()),
    ("universe_id", pa.string()),
    ("updated_at", pa.int64()),
])

def export_query_to_parquet(cur, query, filename):
    cur.execute(query)
    rows = cur.fetchall()
    if not rows:
        print(f"Sem dados para {filename}")
        return

    cols = {name: [] for name in SCHEMA.names}
    for row in rows:
        cols["mal_id"].append(row[0])
        cols["title"].append(row[1])
        cols["title_english"].append(row[2])
        cols["title_japanese"].append(row[3])
        cols["images_json"].append(json.dumps(row[4]) if isinstance(row[4], (dict, list)) else (row[4] or "{}"))
        cols["synopsis"].append(row[5])
        cols["score"].append(float(row[6]) if row[6] is not None else None)
        cols["popularity"].append(row[7])
        cols["episodes"].append(row[8])
        cols["status"].append(row[9])
        cols["category"].append(row[10])
        cols["genres_json"].append(json.dumps(row[11]) if isinstance(row[11], list) else (row[11] or "[]"))
        cols["studios_json"].append(json.dumps(row[12]) if isinstance(row[12], list) else (row[12] or "[]"))
        cols["year"].append(row[13])
        cols["format"].append(row[14])
        cols["universe_id"].append(row[15])
        cols["updated_at"].append(row[16])

    table = pa.Table.from_arrays([pa.array(cols[name], type=SCHEMA.field(name).type) for name in SCHEMA.names], schema=SCHEMA)
    target_path = OUTPUT_DIR / filename
    pq.write_table(table, target_path, compression="zstd", compression_level=9)
    size_kb = target_path.stat().st_size / 1024
    print(f"Gerado: {target_path} ({len(rows)} obras) -> {size_kb:.1f} KB")

def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    conn = psycopg2.connect(PG_DSN)
    cur = conn.cursor()

    base_fields = """
        mal_id, title, title_english, title_japanese, images_json, synopsis,
        score, popularity, episodes, status, category, genres_json,
        studios_json, year, format, universe_id, updated_at
    """

    print("--- Exportando Parquets Modulares Compactados ---")

    # 1. Popular (Lobby)
    export_query_to_parquet(
        cur,
        f"SELECT {base_fields} FROM anime_catalog WHERE category = 'popular' ORDER BY popularity ASC LIMIT 1000",
        "catalog-popular.parquet"
    )

    # 2. Seasonal (Lançamentos / Temporada atual)
    export_query_to_parquet(
        cur,
        f"SELECT {base_fields} FROM anime_catalog WHERE category = 'seasonal' OR status = 'RELEASING' ORDER BY popularity ASC",
        "catalog-seasonal.parquet"
    )

    # 3. Upcoming (Futuros)
    export_query_to_parquet(
        cur,
        f"SELECT {base_fields} FROM anime_catalog WHERE category = 'upcoming' OR status = 'NOT_YET_RELEASED' ORDER BY popularity ASC",
        "catalog-upcoming.parquet"
    )

    # 4. Modificações Recentes / Diff (Alterações de data, adiantados, cancelados, adiados nas últimas 48h)
    cutoff_48h = int((time.time() - 48 * 3600) * 1000)
    export_query_to_parquet(
        cur,
        f"SELECT {base_fields} FROM anime_catalog WHERE updated_at >= {cutoff_48h} ORDER BY updated_at DESC",
        "catalog-diff.parquet"
    )

    # 5. Base Completa Total Compactada (Todas as 36.552 obras)
    export_query_to_parquet(
        cur,
        f"SELECT {base_fields} FROM anime_catalog ORDER BY popularity ASC NULLS LAST",
        "catalog-archive.parquet"
    )

    cur.close()
    conn.close()
    print("--- Concluído com sucesso! ---")

if __name__ == "__main__":
    main()
