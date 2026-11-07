"""Streaming, self-contained data packs. Never opens the live account database."""
import argparse
import hashlib
import json
import sqlite3
import sys
from pathlib import Path
import duckdb
import pyarrow as pa
import pyarrow.parquet as pq
from state import read_json, write_json


def sha(file):
    with open(file, "rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def dictionary_packs(directory, input):
    descriptors = []
    output = directory / "packages"
    output.mkdir(exist_ok=True)
    for language in input["locales"][0]["values"]:
        rows = [{"id": row["id"], "text": row["values"][language]} for row in input["locales"]]
        table = pa.Table.from_pylist(rows)
        file = output / f"strings-{language}.parquet"
        pq.write_table(table, file, compression="zstd", compression_level=19, use_dictionary=True)
        if pq.read_table(file).to_pylist() != rows:
            raise RuntimeError("Dictionary roundtrip failed")
        descriptors.append({"language": language, "file": file.name, "sha256": sha(file), "rows": len(rows)})
    write_json(output / "themes.json", input["themes"])
    return descriptors


def anime_index(root, directory):
    manifest = read_json(root / "public/data/catalog.manifest.json")
    if not manifest or manifest.get("search", {}).get("schema") != 2:
        raise RuntimeError("No verified published search index available")
    source = root / "storage/app/catalog/published/indexes" / (manifest["generation"] + ".sqlite")
    if sha(source) != manifest["search"]["sha256"]:
        raise RuntimeError("Published search index checksum mismatch")
    # Immutable generation artifact; this is NOT database/database.sqlite.
    db = sqlite3.connect(source.as_uri() + "?mode=ro&immutable=1", uri=True)
    db.execute("PRAGMA cache_size=-32768")
    db.execute("PRAGMA mmap_size=0")
    output = directory / "packages"
    columns = ["work_id", "title", "title_english", "title_japanese", "title_portuguese", "synonyms_json", "studios_json", "genres_json", "format", "status", "score", "popularity", "year", "images_json", "catalog_visibility"]
    descriptors, count = [], 0
    try:
        where = "media='anime' AND adult=0 AND coalesce(json_extract(summary,'$.catalog_visibility'),'visible')='visible'"
        total = db.execute("SELECT count(*) FROM works WHERE " + where).fetchone()[0]
        cursor = db.execute("SELECT work_id,summary FROM works WHERE " + where + " ORDER BY work_id")
        while batch := cursor.fetchmany(1000):
            rows = []
            for work_id, payload in batch:
                value = json.loads(payload)
                if value.get("work_id") != work_id:
                    raise RuntimeError("Search index identity mismatch")
                rows.append({key: value.get(key) for key in columns})
            file = output / f"anime-index-{len(descriptors):05}.parquet"
            table = pa.Table.from_pylist(rows)
            if table.nbytes > 64_000_000:
                raise RuntimeError("Index batch exceeds the configured bound")
            pq.write_table(table, file, compression="zstd", compression_level=19, use_dictionary=True)
            if pq.read_table(file).to_pylist() != rows:
                raise RuntimeError("Index roundtrip failed")
            descriptors.append({"file": file.name, "sha256": sha(file), "rows": len(rows)})
            count += len(rows)
            progress = read_json(directory / "progress.json", {})
            progress.update(phase="packaging-anime-index", processed=count, total=total, file=file.name, checkpoint=descriptors[-1]["sha256"])
            write_json(directory / "progress.json", progress)
            print(json.dumps({"phase": "anime-index", "batch": len(descriptors), "records": count}), flush=True)
    finally:
        db.close()
    return {"source_generation": manifest["generation"], "rows": count, "files": descriptors, "adult": False}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--run", type=Path, required=True)
    directory = parser.parse_args().run.resolve()
    root = Path(__file__).resolve().parents[2]
    connection = duckdb.connect()
    connection.execute("SET memory_limit='384MB'; SET threads=2")
    try:
        input = read_json(directory / "presentation-input.json")
        dictionaries = dictionary_packs(directory, input)
        index = anime_index(root, directory)
        write_json(directory / "packages/manifest.json", {"schema": 1, "status": "candidate", "strings": dictionaries, "anime_index": index, "themes": {"file": "themes.json", "sha256": sha(directory / "packages/themes.json")}})
    finally:
        connection.close()


if __name__ == "__main__":
    main()
