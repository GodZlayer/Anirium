import sqlite3
import urllib.request
import json
import sys

con = sqlite3.connect('database/database.sqlite')
cur = con.cursor()
cur.execute('''
    SELECT s.work_id, w.title, s.airing_day, s.airing_time, s.latest_episode_num,
           (SELECT external_id FROM catalog_external_identities WHERE entity_id = s.work_id AND provider = 'anilist' LIMIT 1) as anilist_id,
           (SELECT external_id FROM catalog_external_identities WHERE entity_id = s.work_id AND provider = 'mal' LIMIT 1) as mal_id
    FROM catalog_work_schedules s
    JOIN catalog_works w ON w.id = s.work_id
    WHERE s.airing_day IS NOT NULL
''')
schedules = cur.fetchall()
con.close()

anilist_ids = [int(s[5]) for s in schedules if s[5]]

query = """
query ($ids: [Int]) {
  Page(page: 1, perPage: 50) {
    media(id_in: $ids) {
      id
      title { romaji english }
      status
      episodes
      nextAiringEpisode {
        episode
        airingAt
        timeUntilAiring
      }
    }
  }
}
"""

req = urllib.request.Request('https://graphql.anilist.co', 
    data=json.dumps({'query': query, 'variables': {'ids': anilist_ids}}).encode('utf-8'),
    headers={'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
)

out_lines = []
with urllib.request.urlopen(req, timeout=10) as resp:
    data = json.loads(resp.read().decode('utf-8'))
    media_list = data['data']['Page']['media']
    by_id = {m['id']: m for m in media_list}
    out_lines.append(f"{'TÍTULO':<42} | {'DIA':<9} | {'HORA':<6} | {'DB EP':<6} | {'STATUS':<10} | {'REAL LANÇADO':<12}")
    out_lines.append("-" * 95)
    for s in schedules:
        aid = int(s[5]) if s[5] else None
        m = by_id.get(aid)
        title = s[1].encode('ascii', errors='replace').decode('ascii')
        day = str(s[2])
        time_str = str(s[3])
        db_ep = str(s[4])
        if m:
            next_ep = m.get('nextAiringEpisode')
            current_aired = (next_ep['episode'] - 1) if next_ep else m.get('episodes')
            status = str(m.get('status'))
            out_lines.append(f"{title[:42]:<42} | {day:<9} | {time_str:<6} | {db_ep:<6} | {status:<10} | {str(current_aired):<12}")
        else:
            out_lines.append(f"{title[:42]:<42} | {day:<9} | {time_str:<6} | {db_ep:<6} | {'Sem AniList':<10} | {'?':<12}")

print("\n".join(out_lines))
