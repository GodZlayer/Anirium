import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { stripTypeScriptTypes } from 'node:module';
const source = stripTypeScriptTypes(readFileSync('src/lib/privateData.ts', 'utf8'));
const lib = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const temporary = mkdtempSync(join(tmpdir(), 'anirium-private-test-'));
const priorPath = process.env.ANIRIUM_DATA_KEYRING_FILE, priorStrict = process.env.ANIRIUM_PRIVATE_DATA_STRICT;
const file = join(temporary, 'keyring.json');
const insideProject = join(process.cwd(), `..private-path-fixture-${randomBytes(8).toString('hex')}.json`);
const keys = { old: randomBytes(32).toString('base64'), next: randomBytes(32).toString('base64') };
const save = activeKeyId => writeFileSync(file, JSON.stringify({ activeKeyId, keys: Object.entries(keys).map(([id,key]) => ({id,key})) }), { mode: 0o600 });
const context = lib.addonPrivateContext('owner', 'addon');
const original = { id: 'addon', secret: 'private-fixture-value', languages: ['日本語', 'Português'] };
try {
  process.env.ANIRIUM_DATA_KEYRING_FILE = file;
  save('old');
  const first = lib.encryptPrivateJson(original, context), second = lib.encryptPrivateJson(original, context);
  assert.notEqual(first.iv, second.iv);
  assert.ok(!JSON.stringify(first).includes(original.secret));
  assert.deepEqual(lib.decryptPrivateJson(first, context), original);
  for (const field of ['owner', 'record', 'table', 'field']) assert.throws(() => lib.decryptPrivateJson(first, { ...context, [field]: 'other' }));
  for (const field of ['iv', 'ct', 'tag']) {
    const bytes = Buffer.from(first[field], 'base64'); bytes[0] ^= 1;
    assert.throws(() => lib.decryptPrivateJson({ ...first, [field]: bytes.toString('base64') }, context));
  }
  assert.throws(() => lib.decryptPrivateJson({ ...first, alg: 'none' }, context));
  assert.throws(() => lib.decryptPrivateJson({ ...first, kid: 'next' }, context));
  assert.throws(() => lib.decryptPrivateJson({ ...first, tag: 'invalid' }, context));
  save('next');
  assert.deepEqual(lib.decryptPrivateJson(first, context), original, 'rotation retains historical reads');
  assert.equal(lib.encryptPrivateJson(original, context).kid, 'next');
  const oldKey = keys.old; delete keys.old; save('next');
  assert.throws(() => lib.decryptPrivateJson(first, context), 'missing old key must fail closed');
  keys.old = oldKey; save('next');
  delete process.env.ANIRIUM_PRIVATE_DATA_STRICT;
  assert.throws(() => lib.readStoredPrivateJson(original, context), /requires encrypted migration/);
  process.env.ANIRIUM_PRIVATE_DATA_STRICT = '1';
  assert.throws(() => lib.readStoredPrivateJson(original, context));
  assert.deepEqual(lib.readStoredPrivateJson(first, context), original);
  assert.throws(() => lib.readStoredPrivateJson({ _anirium_private: 99 }, context), 'malformed envelope cannot fall back to plaintext');
  delete process.env.ANIRIUM_DATA_KEYRING_FILE;
  assert.throws(() => lib.encryptPrivateJson(original, context), 'no plaintext fallback without a key');
  process.env.ANIRIUM_DATA_KEYRING_FILE = file;
  writeFileSync(file, JSON.stringify({ activeKeyId: 'bad', keys: [{id:'bad',key:'short'}] }));
  assert.throws(() => lib.encryptPrivateJson(original, context));
  writeFileSync(file, JSON.stringify({ activeKeyId: 'next', keys: [{id:'next',key:keys.next},{id:'next',key:keys.next}] }));
  assert.throws(() => lib.encryptPrivateJson(original, context), 'duplicate key IDs rejected');
  save('next');
  assert.throws(() => lib.encryptPrivateJson({ data: 'é'.repeat(65536) }, context), 'size bound counts UTF8 bytes');
  writeFileSync(insideProject, '{}'); // Contains no key bytes.
  process.env.ANIRIUM_DATA_KEYRING_FILE = insideProject;
  assert.throws(() => lib.encryptPrivateJson(original, context), /outside project/, 'dot-dot filename must not bypass project boundary');
  console.log('AES256GCM actual implementation: nonce uniqueness, AAD isolation, tamper rejection, rotation, missing-key fail-closed and strict migration reads passed. Temporary keys removed.');
} finally {
  if (priorPath === undefined) delete process.env.ANIRIUM_DATA_KEYRING_FILE; else process.env.ANIRIUM_DATA_KEYRING_FILE = priorPath;
  if (priorStrict === undefined) delete process.env.ANIRIUM_PRIVATE_DATA_STRICT; else process.env.ANIRIUM_PRIVATE_DATA_STRICT = priorStrict;
  rmSync(temporary, { recursive: true });
  rmSync(insideProject, { force: true });
}
