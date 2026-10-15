"""Prove native Docker log rotation with disposable stdout and no host mounts."""
import json
import subprocess
import uuid
from pathlib import Path

root = Path(__file__).resolve().parent.parent

def docker(*args, timeout=30):
    return subprocess.run(['docker', *args], capture_output=True, text=True,
                          encoding='utf-8', errors='replace', timeout=timeout)

image = docker('image', 'inspect', 'postgres:16-alpine', '--format', '{{.Id}}')
assert image.returncode == 0, 'Existing official test image unavailable; nothing pulled'
image_id = image.stdout.strip()
assert image_id.startswith('sha256:')
name = 'anirium-log-retention-fixture-' + uuid.uuid4().hex[:12]
container_id = None
try:
    create = docker('create', '--name', name, '--label', 'com.anirium.test=log-retention',
                    '--network', 'none', '--read-only', '--cap-drop', 'ALL',
                    '--tmpfs', '/var/lib/postgresql/data:rw,noexec,nosuid,size=1m',
                    '--security-opt', 'no-new-privileges',
                    '--log-driver', 'local', '--log-opt', 'max-size=8k',
                    '--log-opt', 'max-file=3', '--log-opt', 'compress=true',
                    '--entrypoint', '/bin/sh', image_id, '-c',
                    "awk 'BEGIN { for(i=0;i<1000;i++) printf \"log-fixture-%04d %s\\n\",i,\"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx\" }'")
    assert create.returncode == 0, 'Disposable logging fixture creation failed'
    container_id = create.stdout.strip()
    assert len(container_id) == 64 and all(c in '0123456789abcdef' for c in container_id)
    start = docker('start', container_id)
    assert start.returncode == 0, 'Fixture start failed'
    wait = docker('wait', container_id)
    assert wait.returncode == 0 and wait.stdout.strip() == '0', 'Fixture did not finish successfully'
    inspect = docker('inspect', container_id)
    assert inspect.returncode == 0
    state = json.loads(inspect.stdout)[0]
    assert state['Config']['Labels']['com.anirium.test'] == 'log-retention'
    assert state['HostConfig']['NetworkMode'] == 'none'
    assert not state['HostConfig'].get('Binds')
    assert all(mount['Type'] == 'tmpfs' for mount in state['Mounts'])
    assert state['HostConfig']['Tmpfs'].get('/var/lib/postgresql/data')
    assert state['HostConfig']['ReadonlyRootfs']
    assert state['HostConfig']['LogConfig'] == {'Type': 'local', 'Config': {
        'max-size': '8k', 'max-file': '3', 'compress': 'true'}}
    logs = docker('logs', container_id)
    assert logs.returncode == 0
    assert 'log-fixture-0000' not in logs.stdout, 'Old records did not rotate out'
    assert 'log-fixture-0999' in logs.stdout, 'Newest record lost'
    assert len(logs.stdout.encode('utf-8')) <= 3*8192 + 1024, 'Retained output exceeded fixture budget'
    result = {'scenario': 'disposable Docker local-driver rotation', 'image_id': image_id,
              'retained_bytes': len(logs.stdout.encode('utf-8')),
              'retained_records': len(logs.stdout.splitlines()),
              'first_record_evicted': True, 'last_record_retained': True,
              'network': 'none', 'host_mounts': False, 'production_changed': False}
    (root/'.agent-runtime/planning/docker-log-retention-test.json').write_text(
        json.dumps(result, indent=2), encoding='utf-8')
    print(json.dumps(result))
finally:
    if container_id:
        metadata = docker('inspect', container_id)
        assert metadata.returncode == 0 and json.loads(metadata.stdout)[0]['Config']['Labels'].get('com.anirium.test') == 'log-retention'
        removed = docker('rm', '-f', '-v', container_id)
        assert removed.returncode == 0, 'Owned disposable fixture cleanup failed'
