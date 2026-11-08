#!/usr/bin/env python3
"""
Sync AniList Airing Schedules & Episodes into Anirium Database & Published Catalog Index.

Consome a API GraphQL pública do AniList para:
1. Obter a grade de transmissão exata (airing_day, airing_time em UTC) de qualquer obra audiovisual
   seriada (TV, ONA, Especial, etc.), cobrindo Japão, China (Donghuas), Coreia (Aenis) e internacional.
2. Atualizar o último episódio lançado (latest_episode_num).
3. Resolver os identificadores diretamente por 'mal' e 'anilist' com nosso grafo de entidades.
4. Sincronizar simultaneamente:
   - Tabela relacional: database/database.sqlite (catalog_work_schedules)
   - Índice de busca canônico: storage/app/catalog/published/indexes/*.sqlite (works.summary)
"""

import sys
import os
import json
import time
import glob
import sqlite3
import urllib.request
from datetime import datetime, timezone

ANILIST_URL = 'https://graphql.anilist.co'
DB_PATH = os.path.abspath('database/database.sqlite')
PUBLISHED_INDEX_DIR = os.path.abspath('storage/app/catalog/published/indexes')

QUERY = """
query ($start: Int, $end: Int, $page: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    airingSchedules(airingAt_greater: $start, airingAt_lesser: $end, sort: TIME) {
      airingAt
      episode
      media {
        id
        idMal
        format
        status
        title {
          romaji
          english
          native
        }
      }
    }
  }
}
"""

def fetch_anilist_page(start_ts, end_ts, page):
    payload = json.dumps({
        'query': QUERY,
        'variables': {
            'start': start_ts,
            'end': end_ts,
            'page': page
        }
    }).encode('utf-8')
    
    req = urllib.request.Request(
        ANILIST_URL,
        data=payload,
        headers={
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AniriumAiringSync/1.0'
        }
    )
    
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                return json.loads(resp.read().decode('utf-8'))
        except Exception as e:
            time.sleep(1.5 * (attempt + 1))
            if attempt == 2:
                print(f"[AiringSync] Falha na página {page}: {e}")
                return None

def run_sync():
    print("[AiringSync] === INICIANDO SINCRONIZAÇÃO DE TRANSMISSÃO E EPISÓDIOS (ANILIST) ===")
    
    now = int(datetime.now(timezone.utc).timestamp())
    # Janela de -10 dias a +7 dias para cobrir o episódio mais recente e o próximo episódio
    start_ts = now - (10 * 86400)
    end_ts = now + (7 * 86400)
    
    page = 1
    has_next = True
    schedules_by_entry = {}
    
    while has_next and page <= 20:
        print(f"[AiringSync] Consultando AniList GraphQL - Página {page}...")
        data = fetch_anilist_page(start_ts, end_ts, page)
        if not data or 'data' not in data or 'Page' not in data['data']:
            break
            
        page_data = data['data']['Page']
        items = page_data.get('airingSchedules', [])
        
        for item in items:
            media = item.get('media') or {}
            anilist_id = media.get('id')
            mal_id = media.get('idMal')
            if not anilist_id and not mal_id:
                continue
                
            airing_at = item.get('airingAt')
            episode = item.get('episode')
            
            dt = datetime.fromtimestamp(airing_at, timezone.utc)
            day_name = dt.strftime('%A') # Saturday, Sunday, Monday...
            time_str = dt.strftime('%H:%M') # 12:00, 14:30...
            
            # Se o episódio já foi ao ar (airing_at <= now), é o episódio lançado atual
            is_already_aired = airing_at <= now
            
            # Chave primária: prefere mal_id, senão usa anilist_id
            entry_key = f"mal:{mal_id}" if mal_id else f"anilist:{anilist_id}"
            
            if entry_key not in schedules_by_entry:
                schedules_by_entry[entry_key] = {
                    'anilist_id': anilist_id,
                    'mal_id': mal_id,
                    'title': media.get('title', {}).get('romaji'),
                    'airing_day': day_name,
                    'airing_time': time_str,
                    'latest_episode_num': episode if is_already_aired else max(1, episode - 1),
                    'next_episode': episode if not is_already_aired else None,
                    'airing_at': airing_at,
                    'status': media.get('status')
                }
            else:
                entry = schedules_by_entry[entry_key]
                entry['airing_day'] = day_name
                entry['airing_time'] = time_str
                if is_already_aired and episode > entry['latest_episode_num']:
                    entry['latest_episode_num'] = episode
                if not is_already_aired:
                    entry['next_episode'] = episode
                    
        has_next = page_data.get('pageInfo', {}).get('hasNextPage', False)
        page += 1
        time.sleep(0.4)

    print(f"[AiringSync] Coletadas programações para {len(schedules_by_entry)} obras audiovisuais do AniList.")
    
    # 1. Atualizar Tabela Relacional database.sqlite
    if not os.path.exists(DB_PATH):
        print(f"[AiringSync] ERRO: Banco {DB_PATH} não encontrado.")
        return
        
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # Obter mapeamento mal_id -> work_id e anilist_id -> work_id
    cur.execute("SELECT provider, CAST(external_id AS INTEGER), entity_id FROM catalog_external_identities WHERE provider IN ('mal', 'anilist')")
    provider_to_work = {}
    for prov, ext_id, ent_id in cur.fetchall():
        if ext_id:
            provider_to_work[f"{prov}:{ext_id}"] = ent_id
    
    # Obter também de aliases caso falte
    cur.execute("SELECT alias, entity_id FROM catalog_entity_aliases WHERE alias LIKE 'anime:%' OR alias LIKE 'mal:%' OR alias LIKE 'anilist:%'")
    for alias_str, entity_id in cur.fetchall():
        try:
            parts = alias_str.split(':')
            prov = 'mal' if parts[0] == 'anime' else parts[0]
            num = int(parts[-1])
            key = f"{prov}:{num}"
            if key not in provider_to_work:
                provider_to_work[key] = entity_id
        except (ValueError, IndexError):
            pass
            
    updated_db_count = 0
    for entry_key, info in schedules_by_entry.items():
        work_id = provider_to_work.get(entry_key)
        # Fallback de busca cruzada se não achou pela chave primária
        if not work_id and info['anilist_id']:
            work_id = provider_to_work.get(f"anilist:{info['anilist_id']}")
        if not work_id and info['mal_id']:
            work_id = provider_to_work.get(f"mal:{info['mal_id']}")
            
        if not work_id:
            continue
            
        cur.execute("""
            INSERT INTO catalog_work_schedules (work_id, airing_day, airing_time, latest_episode_num, status)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(work_id) DO UPDATE SET
                airing_day = excluded.airing_day,
                airing_time = excluded.airing_time,
                latest_episode_num = CASE 
                    WHEN excluded.latest_episode_num > catalog_work_schedules.latest_episode_num 
                    THEN excluded.latest_episode_num 
                    ELSE catalog_work_schedules.latest_episode_num 
                END,
                status = excluded.status
        """, (work_id, info['airing_day'], info['airing_time'], info['latest_episode_num'], info['status']))
        updated_db_count += 1
        
    conn.commit()
    conn.close()
    print(f"[AiringSync] Tabela catalog_work_schedules atualizada com sucesso ({updated_db_count} obras sincronizadas).")
    
    # 2. Atualizar o Published Search Index SQLite (usado pelo feed canônico)
    index_files = glob.glob(os.path.join(PUBLISHED_INDEX_DIR, '*.sqlite'))
    if not index_files:
        print("[AiringSync] Nenhum índice compilado em published/indexes.")
        return
        
    for index_path in index_files:
        print(f"[AiringSync] Atualizando índice de busca: {os.path.basename(index_path)}...")
        idx_conn = sqlite3.connect(index_path)
        idx_cur = idx_conn.cursor()
        
        idx_cur.execute("SELECT work_id, summary FROM works WHERE works.media = 'anime'")
        rows = idx_cur.fetchall()
        
        updated_index_count = 0
        for work_id, summary_raw in rows:
            if not summary_raw:
                continue
            summary = json.loads(summary_raw)
            mal_id = summary.get('mal_id') or summary.get('id')
            anilist_id = summary.get('anilist_id')
            
            info = None
            if mal_id:
                try:
                    info = schedules_by_entry.get(f"mal:{int(mal_id)}")
                except (ValueError, TypeError):
                    pass
            if not info and anilist_id:
                try:
                    info = schedules_by_entry.get(f"anilist:{int(anilist_id)}")
                except (ValueError, TypeError):
                    pass
                    
            if info:
                changed = False
                
                if summary.get('airing_day') != info['airing_day']:
                    summary['airing_day'] = info['airing_day']
                    changed = True
                if summary.get('airing_time') != info['airing_time']:
                    summary['airing_time'] = info['airing_time']
                    changed = True
                if info['latest_episode_num'] and summary.get('latest_episode_num', 0) < info['latest_episode_num']:
                    summary['latest_episode_num'] = info['latest_episode_num']
                    changed = True
                    
                if changed:
                    new_summary_raw = json.dumps(summary, ensure_ascii=False, separators=(',', ':'))
                    idx_cur.execute("UPDATE works SET summary = ? WHERE work_id = ?", (new_summary_raw, work_id))
                    updated_index_count += 1
                    
        idx_conn.commit()
        idx_conn.close()
        print(f"[AiringSync] Índice {os.path.basename(index_path)} atualizado ({updated_index_count} obras sincronizadas com AniList).")
        
    print("[AiringSync] === SINCRONIZAÇÃO COMPLETA COM SUCESSO ===")

if __name__ == '__main__':
    run_sync()
