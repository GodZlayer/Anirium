#!/usr/bin/env python3
"""
sync-unified-catalog.py

Sincronizador Automático da Fonte Única Canônica (public/data/catalog.parquet).
1. Lê a tabela existente em public/data/catalog.parquet (33.088+ entidades).
2. Consulta a API GraphQL oficial do AniList e a grade em tempo real (SubsPlease):
   - Obras em transmissão atual (status: RELEASING) + próximo episódio / dia e horário.
   - Obras futuras anunciadas (status: NOT_YET_RELEASED) para inserir novos animes automaticamente.
   - Obras recém-concluídas na temporada (status: FINISHED) para encerrar status RELEASING de temporadas passadas.
3. Atualiza status, episódios, horários da grade e insere novos animes diretamente no mapa único indexado por mal_id.
4. Grava atomicamente public/data/catalog.parquet (ZSTD nível 9).
"""

import json
import os
import time
import urllib.request
from datetime import datetime, timezone
import pyarrow as pa
import pyarrow.parquet as pq

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PARQUET_PATH = os.path.join(BASE_DIR, "public", "data", "catalog.parquet")
TMP_PARQUET_PATH = os.path.join(BASE_DIR, "public", "data", "catalog.parquet.tmp")

DAYS_UTC = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

ANILIST_QUERY = """
query ($page: Int, $status: MediaStatus) {
  Page(page: $page, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    media(type: ANIME, status: $status, sort: POPULARITY_DESC) {
      id
      idMal
      title { romaji english native }
      description(asHtml: false)
      averageScore
      popularity
      episodes
      status
      format
      seasonYear
      coverImage { large extraLarge }
      bannerImage
      genres
      studios(isMain: true) { nodes { name } }
      nextAiringEpisode { airingAt episode }
      externalLinks { site url type }
    }
  }
}
"""


def fetch_json(url, payload=None):
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AniriumSync/1.0",
        "Accept": "application/json",
    }
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers=headers, method="POST" if data else "GET")
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def fetch_anilist_pages(status, max_pages=4):
    results = []
    for page in range(1, max_pages + 1):
        try:
            res = fetch_json(
                "https://graphql.anilist.co",
                {"query": ANILIST_QUERY, "variables": {"page": page, "status": status}},
            )
            media = (((res or {}).get("data") or {}).get("Page") or {}).get("media") or []
            if not media:
                break
            results.extend(media)
            has_next = ((((res or {}).get("data") or {}).get("Page") or {}).get("pageInfo") or {}).get("hasNextPage")
            if not has_next:
                break
            time.sleep(0.5)
        except Exception as exc:
            print(f"[Sync] Aviso ao consultar AniList ({status} p.{page}): {exc}")
            break
    return results


def main():
    print(f"=== [Anirium Auto-Sync] Iniciando atualização de {PARQUET_PATH} ===")
    if not os.path.exists(PARQUET_PATH):
        raise FileNotFoundError(f"Arquivo não encontrado: {PARQUET_PATH}")

    tbl = pq.read_table(PARQUET_PATH)
    schema = tbl.schema
    rows = tbl.to_pylist()

    entities = {}
    for r in rows:
        mid = r.get("mal_id") or r.get("id")
        if mid is not None:
            entities[int(mid)] = r

    print(f"[Sync] Base atual carregada: {len(entities)} entidades únicas.")

    # 1. Busca animes em lançamento (RELEASING), futuros (NOT_YET_RELEASED) e recém-finalizados (FINISHED)
    releasing_media = fetch_anilist_pages("RELEASING", max_pages=6)
    upcoming_media = fetch_anilist_pages("NOT_YET_RELEASED", max_pages=3)
    finished_media = fetch_anilist_pages("FINISHED", max_pages=2)

    now_ms = int(time.time() * 1000)
    releasing_ids_seen = set()
    inserted_count = 0
    updated_count = 0

    all_fetched = (
        [(m, "RELEASING", "seasonal") for m in releasing_media]
        + [(m, "NOT_YET_RELEASED", "upcoming") for m in upcoming_media]
        + [(m, "COMPLETED", "popular") for m in finished_media]
    )

    for m, mapped_status, default_cat in all_fetched:
        mal_id = int(m.get("idMal") or m.get("id") or 0)
        if not mal_id:
            continue

        if mapped_status == "RELEASING":
            releasing_ids_seen.add(mal_id)

        title_obj = m.get("title") or {}
        romaji = title_obj.get("romaji") or title_obj.get("english") or f"Anime #{mal_id}"
        english = title_obj.get("english")
        native = title_obj.get("native")

        cover = (m.get("coverImage") or {}).get("extraLarge") or (m.get("coverImage") or {}).get("large") or ""
        images_json = json.dumps(
            {
                "jpg": {"image_url": cover, "large_image_url": cover, "small_image_url": cover},
                "webp": {"image_url": cover, "large_image_url": cover, "small_image_url": cover},
            }
        )

        genres_list = [{"name": g, "mal_id": idx} for idx, g in enumerate(m.get("genres") or [])]
        studios_nodes = ((m.get("studios") or {}).get("nodes")) or []
        studios_list = [{"name": s.get("name"), "mal_id": idx} for idx, s in enumerate(studios_nodes) if s.get("name")]

        next_ep = m.get("nextAiringEpisode") or {}
        airing_at = next_ep.get("airingAt")
        next_ep_num = next_ep.get("episode")

        airing_day = None
        airing_time = None
        latest_ep = None
        if airing_at:
            dt_utc = datetime.fromtimestamp(int(airing_at), tz=timezone.utc)
            airing_day = DAYS_UTC[int(dt_utc.strftime("%w"))]
            airing_time = dt_utc.strftime("%H:%M")
        if next_ep_num and int(next_ep_num) > 1:
            latest_ep = int(next_ep_num) - 1

        ext_links = m.get("externalLinks") or []
        official_url = None
        stream_links = []
        for l in ext_links:
            site = l.get("site")
            url = l.get("url")
            if not url:
                continue
            if site == "Official Site" or l.get("type") == "INFO":
                official_url = official_url or url
            if site in ["Crunchyroll", "Netflix", "Hulu", "Prime Video", "Disney Plus", "HIDIVE", "Bilibili TV", "YouTube"]:
                stream_links.append({"site": site, "url": url})

        score = round(float(m["averageScore"]) / 10.0, 1) if m.get("averageScore") else None

        if mal_id in entities:
            rec = entities[mal_id]
            rec["status"] = mapped_status
            if score is not None:
                rec["score"] = score
            if m.get("episodes"):
                rec["episodes"] = int(m["episodes"])
            if latest_ep is not None:
                rec["latest_episode_num"] = latest_ep
            if airing_day and airing_time:
                rec["airing_day"] = airing_day
                rec["airing_time"] = airing_time
            elif mapped_status != "RELEASING":
                rec["airing_day"] = None
                rec["airing_time"] = None
            if official_url:
                rec["official_site_url"] = official_url
            if stream_links:
                rec["streaming_links_json"] = json.dumps(stream_links)
            rec["updated_at"] = now_ms
            updated_count += 1
        else:
            u_id = f"univ-{mal_id}"
            entities[mal_id] = {
                "id": mal_id,
                "entity_type": "WORK",
                "parent_id": u_id,
                "mal_id": mal_id,
                "title": romaji,
                "title_english": english,
                "title_japanese": native,
                "images_json": images_json,
                "synopsis": (m.get("description") or "").replace("<br>", "\n").replace("<i>", "").replace("</i>", ""),
                "score": score,
                "popularity": int(m.get("popularity") or 9999),
                "episodes": int(m["episodes"]) if m.get("episodes") else None,
                "status": mapped_status,
                "category": default_cat,
                "genres_json": json.dumps(genres_list),
                "studios_json": json.dumps(studios_list),
                "year": int(m.get("seasonYear") or datetime.now().year),
                "format": str(m.get("format") or "TV").upper(),
                "universe_id": u_id,
                "updated_at": now_ms,
                "latest_episode_num": latest_ep,
                "airing_day": airing_day,
                "airing_time": airing_time,
                "official_site_url": official_url,
                "streaming_links_json": json.dumps(stream_links) if stream_links else None,
            }
            inserted_count += 1

    # 2. Auto-transição de fim de temporada: obras TV de anos passados que ainda estavam como RELEASING
    # e já têm todos os episódios lançados passam automaticamente para COMPLETED
    current_year = datetime.now().year
    auto_completed = 0
    for mid, rec in entities.items():
        if rec.get("status") == "RELEASING" and mid not in releasing_ids_seen:
            yr = rec.get("year")
            eps = rec.get("episodes")
            latest = rec.get("latest_episode_num")
            if yr and int(yr) < current_year - 1 and eps and latest and int(latest) >= int(eps):
                rec["status"] = "COMPLETED"
                rec["airing_day"] = None
                rec["airing_time"] = None
                auto_completed += 1

    all_rows = list(entities.values())
    arrays = []
    for field in schema:
        col_data = [r.get(field.name) for r in all_rows]
        arrays.append(pa.array(col_data, type=field.type))

    out_table = pa.Table.from_arrays(arrays, schema=schema)
    pq.write_table(out_table, TMP_PARQUET_PATH, compression="zstd", compression_level=9)
    os.replace(TMP_PARQUET_PATH, PARQUET_PATH)

    size_mb = os.path.getsize(PARQUET_PATH) / (1024 * 1024)
    print(
        f"=== [Anirium Auto-Sync] Concluído: {len(all_rows)} entidades totais | "
        f"+{inserted_count} novas | {updated_count} atualizadas | {auto_completed} concluídas automaticamente | "
        f"{size_mb:.2f} MB ==="
    )


if __name__ == "__main__":
    main()
