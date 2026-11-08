import sqlite3
import json
import urllib.request
import time

conn = sqlite3.connect('database/database.sqlite')
cursor = conn.cursor()

cursor.execute('''
    SELECT 
        s.work_id,
        w.title,
        s.airing_day,
        s.airing_time,
        s.latest_episode_num,
        s.status,
        ei.external_id as anilist_id,
        ei_mal.external_id as mal_id
    FROM catalog_work_schedules s
    JOIN catalog_works w ON w.id = s.work_id
    LEFT JOIN catalog_external_identities ei ON ei.entity_id = s.work_id AND ei.provider = 'anilist'
    LEFT JOIN catalog_external_identities ei_mal ON ei_mal.entity_id = s.work_id AND ei_mal.provider = 'myanimelist'
    WHERE s.airing_day IS NOT NULL
    ORDER BY CASE s.airing_day
        WHEN 'Monday' THEN 1
        WHEN 'Tuesday' THEN 2
        WHEN 'Wednesday' THEN 3
        WHEN 'Thursday' THEN 4
        WHEN 'Friday' THEN 5
        WHEN 'Saturday' THEN 6
        WHEN 'Sunday' THEN 7
        ELSE 8 END, s.airing_time ASC
''')
rows = cursor.fetchall()

items = []
for r in rows:
    work_id, title, day, time_str, db_ep, sched_status, anilist_id, mal_id = r
    items.append({
        'work_id': work_id,
        'title': title,
        'day': day,
        'time': time_str,
        'db_ep': db_ep,
        'sched_status': sched_status,
        'anilist_id': int(anilist_id) if anilist_id else None,
        'mal_id': int(mal_id) if mal_id else None
    })

# Special manual mappings found previously for titles missing direct anilist_id in identity table
special_anilist = {
    'Kusuriya no Hitorigoto 3rd Season': 195516,
    'Yasei no Last Boss ga Arawareta! 2nd Season': 204389,
    'Uchi no Otouto-domo ga Sumimasen': 203490
}
for item in items:
    if not item['anilist_id'] and item['title'] in special_anilist:
        item['anilist_id'] = special_anilist[item['title']]

print(f"Total scheduled works loaded: {len(items)}")

# Query AniList GraphQL for all items with anilist_id
# We can batch query or query them cleanly
def fetch_anilist_media(anilist_ids):
    # AniList allows querying Page with id_in
    query = """
    query ($ids: [Int]) {
        Page(page: 1, perPage: 50) {
            media(id_in: $ids) {
                id
                idMal
                title {
                    romaji
                    english
                    native
                }
                status
                episodes
                nextAiringEpisode {
                    airingAt
                    timeUntilAiring
                    episode
                }
            }
        }
    }
    """
    req = urllib.request.Request(
        'https://graphql.anilist.co',
        data=json.dumps({'query': query, 'variables': {'ids': anilist_ids}}).encode('utf-8'),
        headers={'Content-Type': 'application/json', 'User-Agent': 'AniriumCalendarAuditor/1.0'}
    )
    with urllib.request.urlopen(req, timeout=15) as res:
        data = json.loads(res.read().decode('utf-8'))
        return {m['id']: m for m in data['data']['Page']['media']}

valid_ids = [item['anilist_id'] for item in items if item['anilist_id']]
print(f"Valid AniList IDs to query: {len(valid_ids)}")
media_map = fetch_anilist_media(valid_ids)

final_report = []

for it in items:
    a_id = it['anilist_id']
    m = media_map.get(a_id) if a_id else None
    
    real_status = m['status'] if m else 'NOT_FOUND'
    total_eps = m['episodes'] if m else None
    next_airing_ep = m['nextAiringEpisode']['episode'] if (m and m.get('nextAiringEpisode')) else None
    next_airing_time = m['nextAiringEpisode']['airingAt'] if (m and m.get('nextAiringEpisode')) else None
    
    # Calculate real latest aired episode:
    # If there is a nextAiringEpisode, the currently aired episode is (nextAiringEpisode['episode'] - 1)
    # If there is no nextAiringEpisode and status is FINISHED, it's total_eps
    # If not started, 0
    if next_airing_ep:
        real_latest_ep = next_airing_ep - 1
    elif real_status == 'FINISHED':
        real_latest_ep = total_eps
    elif real_status == 'RELEASING':
        real_latest_ep = total_eps  # or ongoing without scheduled next
    elif real_status == 'NOT_YET_RELEASED':
        real_latest_ep = 0
    else:
        real_latest_ep = 'Unknown'
        
    final_report.append({
        'work_id': it['work_id'],
        'title': it['title'],
        'day': it['day'],
        'time': it['time'],
        'db_ep': it['db_ep'],
        'real_ep': real_latest_ep,
        'next_ep': next_airing_ep,
        'status': real_status,
        'anilist_id': a_id
    })

with open('scripts/calendar_audit_result.json', 'w', encoding='utf-8') as f:
    json.dump(final_report, f, ensure_ascii=False, indent=2)

print("Audit finished successfully! Saved to scripts/calendar_audit_result.json")
