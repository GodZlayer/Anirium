"""Locate actual matching-ID fields in saved official API responses, read-only."""
import argparse, datetime, json, pathlib, sqlite3, urllib.parse


def scan(root):
    db = sqlite3.connect(f'file:{(root / "mal.sqlite3").as_posix()}?mode=ro', uri=True)
    db.execute('BEGIN')
    targets = {row[0] for row in db.execute("SELECT id FROM field_gaps WHERE kind='manga' AND field='alternative_titles'")}
    matches = []
    missing = {eid: 0 for eid in targets}
    scanned = 0
    for table in ('responses', 'response_history'):
        # Public response content only; credentials never enter these tables.
        for url, body, at in db.execute(f'SELECT url,body,fetched_at FROM {table} WHERE status=200'):
            parts = urllib.parse.urlparse(url).path.split('/')
            if len(parts) < 3 or parts[2] not in ('anime', 'manga'):
                continue
            scanned += 1
            if not any(str(eid) in body for eid in targets):
                continue
            stack = [(body, '$', parts[2])]
            while stack:
                item, path, kind = stack.pop()
                if isinstance(item, str) and path == '$':
                    item = json.loads(item)
                if isinstance(item, dict):
                    eid = item.get('id')
                    if kind == 'manga' and eid in targets:
                        if 'alternative_titles' in item:
                            matches.append({'id': eid, 'url': url, 'fetched_at': at, 'table': table,
                                            'json_path': path, 'title': item.get('title'),
                                            'alternative_titles': item['alternative_titles']})
                        else:
                            missing[eid] += 1
                    for key, child in item.items():
                        if isinstance(child, (dict, list)):
                            namespace = {'related_anime': 'anime', 'related_manga': 'manga',
                                         'authors': 'person', 'studios': 'studio', 'genres': 'genre'}.get(key, kind)
                            stack.append((child, path + '.' + key, namespace))
                elif isinstance(item, list):
                    stack.extend((child, path + f'[{index}]', kind) for index, child in enumerate(item)
                                 if isinstance(child, (dict, list)))
            if scanned % 50000 == 0:
                print(json.dumps({'scanned': scanned, 'actual_field_matches': len(matches)}), flush=True)
    db.close()
    result = {'observed_at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'target_manga_ids': sorted(targets),
              'responses_scanned': scanned, 'matching_nodes_without_field': missing,
              'field_matches': matches, 'read_only': True}
    target = root / 'field-gap-all-saved-evidence.json'
    target.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=True, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='data/mal-api-acquisition')
    args = parser.parse_args()
    scan(pathlib.Path(args.output).resolve())
