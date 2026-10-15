"""Validate Compose without starting services or displaying secret values."""
import json
import os
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
environment = dict(os.environ, DATABASE_URL='postgresql://fixture:fixture@anirium-db:5432/fixture',
                   ANIRIUM_POSTGRES_PASSWORD='fixture-only-not-production',
                   ANIRIUM_SERVICE_SECRET='fixture-only-not-production')
file_variables = ['ANIRIUM_DB_CA_HOST_FILE', 'ANIRIUM_KEYRING_HOST_FILE', 'ANIRIUM_IDENTITY_KEYRING_HOST_FILE', 'ANIRIUM_DB_CERT_HOST_FILE', 'ANIRIUM_DB_KEY_HOST_FILE']
environment.update({name: str(root / 'scripts/verify-compose-secrets.py') for name in file_variables})

def compose(env):
    return subprocess.run(['docker', 'compose', 'config', '--format', 'json'], cwd=root,
                          env=env, capture_output=True, text=True, timeout=20)

valid = compose(environment)
assert valid.returncode == 0, 'Compose fixture configuration rejected'
config = json.loads(valid.stdout)
database = config['services']['anirium-db']
core = config['services']['anirium-core']
assert database['environment']['POSTGRES_PASSWORD'] == environment['ANIRIUM_POSTGRES_PASSWORD']
assert core['environment']['DATABASE_URL'] == environment['DATABASE_URL']
assert core['environment']['ANIRIUM_DB_TLS'] == 'required'
assert core['environment']['ANIRIUM_DB_CA_FILE'] == '/run/anirium/db-ca.pem'
assert core['environment']['ANIRIUM_DATA_KEYRING_FILE'] == '/run/anirium/keyring.json'
assert core['environment']['ANIRIUM_IDENTITY_KEYRING_FILE'] == '/run/anirium/identity-keyring.json'
command = database['command']
for required in ['ssl=on', 'ssl_min_protocol_version=TLSv1.2', 'password_encryption=scram-sha-256', 'hba_file=/run/anirium/pg_hba.conf']:
    assert required in command
for service in [core, database]:
    for volume in service['volumes']:
        if volume['type'] == 'bind':
            assert volume['read_only'] and volume['bind']['create_host_path'] is False
assert all(port.get('host_ip') == '127.0.0.1' for port in database['ports']), 'Database published outside loopback'
database_networks = set(database['networks'])
assert database_networks == {'anirium_db_network'}
assert config['networks']['anirium_db_network']['internal'] is True
assert database_networks <= set(core['networks']), 'Core cannot reach canonical database'
for name, service in config['services'].items():
    assert service['logging']['driver'] == 'local'
    assert service['logging']['options'] == {'max-size': '10m', 'max-file': '3', 'compress': 'true'}
    if name not in ['anirium-core', 'anirium-db']:
        assert not database_networks.intersection(service['networks']), 'Non-Core service shares database network'
for variable in ['DATABASE_URL', 'ANIRIUM_POSTGRES_PASSWORD', 'ANIRIUM_SERVICE_SECRET'] + file_variables:
    missing = compose(dict(environment, **{variable: ''}))
    assert missing.returncode != 0, 'Missing mandatory configuration accepted'
    assert variable in missing.stderr, 'Failure did not identify missing configuration'
print('Compose: mandatory credentials, missing-value rejection, loopback database binding and dedicated internal database network passed. Native local-driver bounded logging passed. No services started.')
