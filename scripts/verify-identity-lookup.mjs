import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { randomBytes, createHmac } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const encoded = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const dataUrl = encoded(stripTypeScriptTypes(readFileSync('src/lib/privateData.ts', 'utf8')));
const lookupSource = stripTypeScriptTypes(readFileSync('src/lib/identityLookup.ts', 'utf8')).replace('"./privateData"', JSON.stringify(dataUrl));
const { googleIdentityLookups } = await import(encoded(lookupSource));
const directory = mkdtempSync(join(tmpdir(), 'anirium-identity-test-'));
const prior = Object.fromEntries(['ANIRIUM_DATA_KEYRING_FILE', 'ANIRIUM_IDENTITY_KEYRING_FILE'].map(key => [key, process.env[key]]));
const keys = { old: randomBytes(32).toString('base64'), next: randomBytes(32).toString('base64') };
const identityFile = join(directory, 'identity.json'), dataFile = join(directory, 'data.json');
const save = activeKeyId => writeFileSync(identityFile, JSON.stringify({ activeKeyId, keys: Object.entries(keys).map(([id,key]) => ({ id,key })) }), { mode: 0o600 });
try {
  process.env.ANIRIUM_DATA_KEYRING_FILE = dataFile;
  process.env.ANIRIUM_IDENTITY_KEYRING_FILE = identityFile;
  const dataKey = randomBytes(32).toString('base64');
  writeFileSync(dataFile, JSON.stringify({ activeKeyId: 'data', keys: [{ id: 'data', key: dataKey }] }), { mode: 0o600 });
  save('old');
  const first = googleIdentityLookups('verified-subject');
  assert.deepEqual(first, googleIdentityLookups('verified-subject'));
  assert.equal(first.length, 2);
  assert.ok(first.every(item => /^[0-9a-f]{64}$/.test(item.hash)));
  assert.equal(first.find(item => item.active).keyId, 'old');
  assert.equal(first[0].hash, createHmac('sha256', Buffer.from(keys.old, 'base64')).update(JSON.stringify(['anirium.identity',1,'google','verified-subject'])).digest('hex'));
  assert.notEqual(first[0].hash, googleIdentityLookups('other-subject')[0].hash);
  save('next');
  const rotated = googleIdentityLookups('verified-subject');
  assert.equal(rotated.find(item => item.active).keyId, 'next');
  assert.equal(rotated.find(item => item.keyId === 'old').hash, first[0].hash);
  assert.ok(!JSON.stringify(rotated).includes('verified-subject'));
  for (const value of ['', 'x'.repeat(257), 'bad subject', 'bad\nsubject', 123]) assert.throws(() => googleIdentityLookups(value));
  keys.next = dataKey; save('next');
  assert.throws(() => googleIdentityLookups('verified-subject'), /distinct/);
  process.env.ANIRIUM_IDENTITY_KEYRING_FILE = dataFile;
  assert.throws(() => googleIdentityLookups('verified-subject'), /distinct/);
  delete process.env.ANIRIUM_IDENTITY_KEYRING_FILE;
  assert.throws(() => googleIdentityLookups('verified-subject'));
  console.log('Actual identity HMAC: domain separation, distinct external secrets, stable historical candidates, rotation and invalid-input/missing-key rejection passed. No login or DB migration covered.');
} finally {
  for (const [key,value] of Object.entries(prior)) if (value === undefined) delete process.env[key]; else process.env[key] = value;
  rmSync(directory, { recursive: true });
}
