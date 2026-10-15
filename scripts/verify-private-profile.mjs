import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ts from 'typescript';

const modules = new Map();
function load(name) {
  if (modules.has(name)) return modules.get(name);
  const exports = {};
  modules.set(name, exports);
  const source = ts.transpileModule(readFileSync(`src/lib/${name}.ts`, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  new Function('require', 'exports', source)(id => id.startsWith('./') ? load(id.slice(2)) : dependencies[id], exports);
  return exports;
}
const dependencies = {};
for (const name of ['node:crypto', 'node:fs', 'node:path']) dependencies[name] = await import(name);
const temporary = mkdtempSync(join(tmpdir(), 'anirium-profile-test-'));
const priorPath = process.env.ANIRIUM_DATA_KEYRING_FILE;
const priorStrict = process.env.ANIRIUM_PRIVATE_DATA_STRICT;
try {
  const file = join(temporary, 'keyring.json');
  writeFileSync(file, JSON.stringify({ activeKeyId: 'test', keys: [{ id: 'test', key: randomBytes(32).toString('base64') }] }), { mode: 0o600 });
  process.env.ANIRIUM_DATA_KEYRING_FILE = file;
  delete process.env.ANIRIUM_PRIVATE_DATA_STRICT;
  const lib = load('privateProfile'), crypto = load('privateData');
  const data = { displayName: 'Nome privado', avatarUrl: 'https://example.com/avatar.png' };
  const envelope = lib.encodeProfile('owner', data.displayName, data.avatarUrl);
  assert.ok(!JSON.stringify(envelope).includes(data.displayName));
  assert.deepEqual(lib.readProfile({ id: 'owner', profile_private: envelope }), data);
  assert.throws(() => lib.readProfile({ id: 'other', profile_private: envelope }));
  assert.throws(() => lib.readProfile({ id: 'owner', profile_private: data, display_name: 'Fallback' }));
  const invalid = crypto.encryptPrivateJson({ ...data, extra: true }, lib.profilePrivateContext('owner'));
  assert.throws(() => lib.readProfile({ id: 'owner', profile_private: invalid }));
  const invalidUrl = crypto.encryptPrivateJson({ ...data, avatarUrl: 'javascript:alert(1)' }, lib.profilePrivateContext('owner'));
  assert.throws(() => lib.readProfile({ id: 'owner', profile_private: invalidUrl }));
  assert.throws(() => lib.readProfile({ id: 'legacy', display_name: 'Legado', avatar_url: null }), /requires migration/);
  process.env.ANIRIUM_PRIVATE_DATA_STRICT = '1';
  assert.throws(() => lib.readProfile({ id: 'legacy', display_name: 'Legado' }));
  assert.deepEqual(lib.readProfile({ id: 'owner', profile_private: envelope }), data);
  assert.throws(() => lib.encodeProfile('', data.displayName, data.avatarUrl));
  assert.throws(() => lib.encodeProfile('owner', '', data.avatarUrl));
  console.log('Private profile primitive: actual AEAD, owner binding, exact payload, URL validation and current encrypted-only contract passed. DB/API integration not covered.');
} finally {
  if (priorPath === undefined) delete process.env.ANIRIUM_DATA_KEYRING_FILE; else process.env.ANIRIUM_DATA_KEYRING_FILE = priorPath;
  if (priorStrict === undefined) delete process.env.ANIRIUM_PRIVATE_DATA_STRICT; else process.env.ANIRIUM_PRIVATE_DATA_STRICT = priorStrict;
  rmSync(temporary, { recursive: true });
}
