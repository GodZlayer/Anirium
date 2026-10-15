"""Inspect actual catalogue payload types against the saved official schema.

Optional/omitted fields are observations, never catalogue-completeness proof.
Read-only WAL snapshot; never contacts MAL or reads credentials.
"""
import argparse, collections, datetime, json, pathlib, re, sqlite3, urllib.parse


def audit(root):
    spec = json.loads((root / 'official-openapi.json').read_text(encoding='utf-8'))
    schemas = spec['components']['schemas']
    db = sqlite3.connect(f'file:{(root / "mal.sqlite3").as_posix()}?mode=ro', uri=True)
    db.execute('BEGIN')
    observed = collections.Counter()
    mismatches = collections.Counter()
    examples = []

    def resolved(schema):
        if '$ref' in schema:
            return resolved(schemas[schema['$ref'].rsplit('/', 1)[-1]])
        result = dict(schema)
        properties = dict(schema.get('properties', {}))
        for child in schema.get('allOf', []):
            child = resolved(child)
            properties.update(child.get('properties', {}))
            for key, value in child.items():
                if key not in ('properties', 'allOf'):
                    result.setdefault(key, value)
        if properties:
            result['properties'] = properties
        return result

    def walk(value, schema, path, url, depth=0):
        if depth > 30:
            raise ValueError('Schema traversal exceeded depth bound')
        schema = resolved(schema)
        observed[path] += 1
        # Nullability varies in actual API output; report nulls without inventing values.
        if value is None:
            observed[path + ':null'] += 1
            return
        expected = schema.get('type')
        checks = {
            'object': lambda x: isinstance(x, dict),
            'array': lambda x: isinstance(x, list),
            'string': lambda x: isinstance(x, str),
            'integer': lambda x: isinstance(x, int) and not isinstance(x, bool),
            'number': lambda x: isinstance(x, (int, float)) and not isinstance(x, bool),
            'boolean': lambda x: isinstance(x, bool),
        }
        if expected in checks and not checks[expected](value):
            mismatches[path + ':' + expected + '->' + type(value).__name__] += 1
            if len(examples) < 100:
                examples.append({'url': url, 'path': path, 'expected': expected,
                                 'actual': type(value).__name__})
            return
        if isinstance(value, dict):
            for name, child in schema.get('properties', {}).items():
                if name == 'my_list_status':
                    continue
                if name in value:
                    walk(value[name], child, path + '.' + name, url, depth + 1)
        elif isinstance(value, list) and 'items' in schema:
            for item in value:
                walk(item, schema['items'], path + '[]', url, depth + 1)

    records = collections.Counter()
    try:
        for url, body in db.execute('SELECT url,body FROM responses WHERE status=200'):
            path = urllib.parse.urlparse(url).path
            match = re.fullmatch('/v2/(anime|manga)/[0-9]+', path)
            if not match:
                continue
            kind = match.group(1)
            walk(json.loads(body), schemas[kind.capitalize() + 'ForDetails'], kind, url)
            records[kind] += 1
    finally:
        db.close()
    result = {'at': datetime.datetime.now(datetime.timezone.utc).isoformat(),
              'detail_responses_checked': dict(records),
              'observed_paths': dict(observed), 'type_discrepancies': dict(mismatches),
              'examples': examples, 'coverage_verified': False,
              'limits': 'Checks documented types of returned values, including nested arrays. '
                        'Does not prove omitted optional fields or provider catalogue completeness.'}
    (root / 'nested-field-audit.json').write_text(json.dumps(result, indent=2), encoding='utf-8')
    return result


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', default='data/mal-api-acquisition')
    args = parser.parse_args()
    result = audit(pathlib.Path(args.output).resolve())
    print(json.dumps({'at': result['at'],
                      'detail_responses_checked': result['detail_responses_checked'],
                      'type_discrepancies': result['type_discrepancies']}))
