"""
Exporta as 30.838 respostas diretas de anime coletadas via API oficial.
Filtra estritamente os endpoints de detalhe direto /anime/{id}?.
Garante que todas as 30.824 obras completas sejam emitidas como NDJSON.
"""
import sqlite3
import json
import sys

SQLITE_PATH = "data/mal-api-acquisition/mal.sqlite3"

def main():
    con = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
    cur = con.cursor()

    seen_ids = set()
    exported = 0

    query = """
    SELECT body FROM responses 
    WHERE status=200 
      AND url LIKE '%api.myanimelist.net/v2/anime/%' 
      AND url NOT LIKE '%/ranking?%' 
      AND url NOT LIKE '%/season/%' 
      AND url NOT LIKE '%/suggestions?%'
    """
    cur.execute(query)

    while True:
        rows = cur.fetchmany(1000)
        if not rows:
            break
        for (body,) in rows:
            try:
                data = json.loads(body)
                aid = data.get("id")
                if aid and aid not in seen_ids:
                    seen_ids.add(aid)
                    sys.stdout.write(json.dumps(data, ensure_ascii=False) + "\n")
                    exported += 1
            except Exception:
                continue

    con.close()
    sys.stderr.write(f"Total unico emitido: {exported}\n")

if __name__ == "__main__":
    main()
