import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import ts from 'typescript';

// Compile the actual implementation, not a duplicate of token verification.
const source = fs.readFileSync(new URL('../src/lib/serviceAuth.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
process.env.ANIRIUM_SERVICE_SECRET = crypto.randomBytes(32).toString('hex');
const { issueServiceToken, verifyServiceToken, verifyServiceTokenDetailed } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const playerSessionId = crypto.randomUUID();
const valid = issueServiceToken('session', 'device', 'account', 2, playerSessionId);
assert.equal(verifyServiceToken(valid, 'device').accountId, 'account');
assert.equal(verifyServiceToken(valid, 'other-device'), null);
assert.equal(verifyServiceToken(`${valid}.extra`, 'device'), null);
assert.equal(verifyServiceToken(`x${valid}`, 'device'), null);
const signed = claims => {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${crypto.createHmac('sha256', process.env.ANIRIUM_SERVICE_SECRET).update(payload).digest('base64url')}`;
};
const claims = { sessionId: 'session', playerSessionId, deviceId: 'device', accountId: 'account', level: 2, exp: Math.floor(Date.now() / 1000) + 300 };
assert.equal(verifyServiceToken(signed({ ...claims, playerSessionId: undefined }), 'device'), null);
assert.equal(verifyServiceToken(signed({ ...claims, playerSessionId: '' }), 'device'), null);
for (const patch of [{ exp: null }, { exp: 'tomorrow' }, { exp: 0 }, { exp: claims.exp + 0.5 }, { level: 1 }, { level: '2' }, { sessionId: '' }, { accountId: 1 }]) {
  assert.equal(verifyServiceToken(signed({ ...claims, ...patch }), 'device'), null, JSON.stringify(patch));
}
assert.equal(verifyServiceToken(signed(null), 'device'), null);

// Discriminated verifier: same rejections, stable reasons, HMAC checked before claims.
const now = Math.floor(Date.now() / 1000);
assert.equal(verifyServiceTokenDetailed(valid, 'device').ok, true);
assert.equal(verifyServiceTokenDetailed(valid, 'other-device').reason, 'device_mismatch');
assert.equal(verifyServiceTokenDetailed(`${valid}.extra`, 'device').reason, 'token_invalid');
assert.equal(verifyServiceTokenDetailed(`x${valid}`, 'device').reason, 'token_invalid');
assert.equal(verifyServiceTokenDetailed(signed({ ...claims, exp: now - 1 }), 'device').reason, 'token_expired');
assert.equal(verifyServiceTokenDetailed(signed({ ...claims, exp: 0 }), 'device').reason, 'token_expired');
assert.equal(verifyServiceTokenDetailed(signed({ ...claims, level: 1 }), 'device').reason, 'plus_required');
assert.equal(verifyServiceTokenDetailed(signed({ ...claims, deviceId: 'other-device' }), 'device').reason, 'device_mismatch');
assert.equal(verifyServiceTokenDetailed(signed({ ...claims, sessionId: '' }), 'device').reason, 'token_invalid');
assert.equal(verifyServiceTokenDetailed(signed({ ...claims, accountId: 1 }), 'device').reason, 'token_invalid');
assert.equal(verifyServiceTokenDetailed(signed(null), 'device').reason, 'token_invalid');
const tampered = `${valid.slice(0, -4)}AAAA`;
assert.equal(verifyServiceTokenDetailed(tampered, 'device').reason, 'token_invalid');

// Wrapper backwards compatibility: valid returns claims, every failure returns null.
assert.equal(verifyServiceToken(valid, 'device').accountId, 'account');
assert.equal(verifyServiceToken(valid, 'other-device'), null);
assert.equal(verifyServiceToken(signed({ ...claims, exp: now - 1 }), 'device'), null);
assert.equal(verifyServiceToken(signed({ ...claims, level: 1 }), 'device'), null);
assert.equal(verifyServiceTokenDetailed(valid, 'device').claims.accountId, 'account');

console.log('Service tokens verified: valid claims accepted; malformed, expired, tampered and wrong-device tokens rejected with stable reasons; wrapper backwards compatible.');
