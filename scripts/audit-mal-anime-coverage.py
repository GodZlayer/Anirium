"""Reconcile saved anime discovery evidence with complete detail records."""
import argparse, datetime, json, pathlib, re, sqlite3, urllib.parse
import importlib.util


def audit(root, run):
    db = sqlite3.connect(f'file:{(root / "mal.sqlite3").as_posix()}?mode=ro', uri=True)
    db.execute('BEGIN')
    started, state = db.execute('SELECT started_at,state FROM runs WHERE id=?', (run,)).fetchone()
    entities = dict(db.execute("SELECT id,detail_done FROM entities WHERE kind='anime'"))
    fresh = set()
    all_lists = set()
    relations = set()
    ranks = {}
    mismatches = []
    full_selector_ids = set()
    collector_spec = importlib.util.spec_from_file_location('mal_collector', pathlib.Path(__file__).with_name('collect-mal-api.py'))
    collector = importlib.util.module_from_spec(collector_spec)
    collector_spec.loader.exec_module(collector)
    contract = json.loads((root / 'official-openapi.json').read_text(encoding='utf-8'))
    required = {field.split('{', 1)[0] for field in collector.split_fields(collector.schema_fields(contract, 'anime'))}
    for url, status, body, fetched in db.execute('SELECT url,status,body,fetched_at FROM responses WHERE status=200'):
        parsed = urllib.parse.urlparse(url)
        path = parsed.path
        if not path.startswith('/v2/anime') and not path.startswith('/v2/manga/'):
            continue
        data = json.loads(body)
        if path.startswith('/v2/anime'):
            for item in data.get('data', []):
                eid = item['node']['id']
                all_lists.add(eid)
                if fetched >= started:
                    fresh.add(eid)
                    rank = urllib.parse.parse_qs(parsed.query).get('ranking_type', [path])[0]
                    ranks.setdefault(rank, set()).add(eid)
        match = re.fullmatch(r'/v2/(anime|manga)/(\d+)', path)
        if match:
            if data.get('id') != int(match[2]):
                mismatches.append(url)
            if match[1] == 'anime':
                selector = urllib.parse.parse_qs(parsed.query).get('fields', [''])[0]
                requested = {field.split('{', 1)[0] for field in collector.split_fields(selector)}
                if required <= requested:
                    full_selector_ids.add(int(match[2]))
            for item in data.get('related_anime', []):
                relations.add(item['node']['id'])
            if match[1] == 'anime':
                for item in data.get('recommendations', []):
                    relations.add(item['node']['id'])
    for kind, body in db.execute('SELECT kind,body FROM recovered_details'):
        data = json.loads(body)
        relations.update(item['node']['id'] for item in data.get('related_anime', []))
        if kind == 'anime':
            relations.update(item['node']['id'] for item in data.get('recommendations', []))
    missing = sorted(eid for eid in fresh if entities.get(eid) != 1)
    missing_relations = sorted(eid for eid in relations if eid not in entities)
    evidence_ids = all_lists | relations
    missing_evidence = sorted(eid for eid in evidence_ids if eid not in entities)
    report = {
        'observed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
        'run': run, 'started_at': started, 'run_state': state,
        'complete_anime': sum(value == 1 for value in entities.values()),
        'partial_anime': sorted(eid for eid, value in entities.items() if value == 2),
        'unavailable_anime': sorted(eid for eid, value in entities.items() if value == -1),
        'pending_anime': sorted(eid for eid, value in entities.items() if value == 0),
        'fresh_list_ids': len(fresh), 'fresh_ids_by_source': {key: len(ids) for key, ids in ranks.items()},
        'fresh_list_ids_without_complete_details': missing,
        'all_saved_list_ids': len(all_lists), 'related_anime_ids': len(relations),
        'missing_relation_ids': missing_relations, 'missing_saved_evidence_ids': missing_evidence,
        'identity_mismatches': mismatches,
        'complete_ids_with_full_selector_response': sum(entities.get(eid) == 1 for eid in full_selector_ids),
        'complete_ids_without_full_selector_response': sorted(eid for eid, value in entities.items() if value == 1 and eid not in full_selector_ids),
        'ranking_states': list(db.execute("SELECT ranking,done FROM streams WHERE kind='anime' AND ranking IN ('bypopularity','all','airing','upcoming','tv','ova','movie','special','favorite') ORDER BY ranking")),
        'candidate_states': list(db.execute("SELECT checked,count(*) FROM coverage_candidates WHERE kind='anime' GROUP BY checked")),
        'largest_known_id': max(entities),
        'field_gaps': list(db.execute("SELECT id,field,status FROM field_gaps WHERE kind='anime'")),
        'scope': 'Official anime discovery lists, saved seasonal/search discovery, and saved relation closure.',
        'global_snapshot_guarantee': False,
        'limits': 'MAL exposes no global total or immutable snapshot. This reconciles actual saved discovery evidence; candidate maximum is not an official catalogue bound.',
    }
    db.close()
    target = root / f'anime-coverage-run-{run}.json'
    target.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='data/mal-api-acquisition')
    parser.add_argument('--run', type=int, required=True)
    args = parser.parse_args()
    audit(pathlib.Path(args.output).resolve(), args.run)
