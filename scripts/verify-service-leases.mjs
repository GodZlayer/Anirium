import fs from 'node:fs';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import pg from 'pg';

// Execute the implementation's SQL, not a second copy of its lease rules.
const source = fs.readFileSync('src/lib/serviceSessions.ts', 'utf8');
const sql = [...source.matchAll(/(?:query|queryOne)\(`([\s\S]*?)`/g)].map(match => match[1]);
assert.equal(sql.length, 7);
const migrations = sql.splice(1, 2);
const connectionString = process.env.DATABASE_URL;
assert.ok(connectionString, 'Set DATABASE_URL to an isolated test PostgreSQL instance');
const schema = `lease_test_${crypto.randomBytes(8).toString('hex')}`;
const admin = new pg.Pool({ connectionString });
let clients;
try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  clients = new pg.Pool({ connectionString, max: 8, options: `-c search_path=${schema}` });
  await clients.query(sql[0]);
  for (const migration of migrations) await clients.query(migration);
  const contenders = await Promise.all(Array.from({ length: 8 }, (_, index) =>
    clients.query(sql[1], ['account-a', `device-${index}`, `session-${index}`, 'player-a'])));
  const winners = contenders.flatMap((result, index) => result.rowCount ? [index] : []);
  assert.equal(winners.length, 1, 'Exactly one device must acquire the account lease');
  const winner = winners[0];
  assert.equal((await clients.query(sql[1], ['account-a', `device-${winner}`, `session-${winner}`, 'player-b'])).rowCount, 0, 'Second Player on same login/device must be rejected');
  assert.equal((await clients.query(sql[2], ['account-a', `device-${winner}`, `session-${winner}`, 'player-b'])).rowCount, 0, 'Another Player cannot validate the winning lease');
  assert.equal((await clients.query(sql[1], ['account-a', `device-${winner}`, `session-${winner}`, 'player-a'])).rowCount, 1);
  assert.equal((await clients.query(sql[1], ['account-a', `device-${winner}`, 'different-session', 'player-a'])).rowCount, 0);
  assert.equal((await clients.query(sql[2], ['account-a', 'wrong-device', `session-${winner}`, 'player-a'])).rowCount, 0);
  await clients.end();
  clients = new pg.Pool({ connectionString, options: `-c search_path=${schema}` });
  assert.equal((await clients.query(sql[2], ['account-a', `device-${winner}`, `session-${winner}`, 'player-a'])).rowCount, 1, 'Lease must survive reconnection');
  await clients.query("UPDATE service_device_leases SET expires_at = NOW() - INTERVAL '1 second'");
  assert.equal((await clients.query(sql[2], ['account-a', `device-${winner}`, `session-${winner}`, 'player-a'])).rowCount, 0);
  assert.equal((await clients.query(sql[1], ['account-a', 'new-device', 'new-session', 'player-a'])).rowCount, 1);
  assert.equal((await clients.query(sql[3], ['unrelated-session'])).rowCount, 0);
  assert.equal((await clients.query(sql[2], ['account-a', 'new-device', 'new-session', 'player-a'])).rowCount, 1);
  assert.equal((await clients.query(sql[3], ['new-session'])).rowCount, 1);
  assert.equal((await clients.query(sql[2], ['account-a', 'new-device', 'new-session', 'player-a'])).rowCount, 0, 'Logged-out lease must not validate');
  assert.equal((await clients.query(sql[1], ['account-a', 'replacement-device', 'replacement-session', 'player-a'])).rowCount, 1, 'Logout must allow immediate replacement');
  await clients.query(sql[4], ['account-a', 'replacement-device', 'replacement-session', 'other-player']);
  assert.equal((await clients.query(sql[2], ['account-a', 'replacement-device', 'replacement-session', 'player-a'])).rowCount, 1, 'Another Player cannot release the lease');
  assert.equal((await clients.query(sql[4], ['account-a', 'replacement-device', 'replacement-session', 'player-a'])).rowCount, 1, 'Owner can release the lease');
  assert.equal((await clients.query(sql[1], ['account-a', 'replacement-device', 'replacement-session', 'player-b'])).rowCount, 1, 'Closing the Player permits immediate replacement');
  await clients.query(sql[4], ['account-a', 'replacement-device', 'replacement-session', 'player-a']);
  assert.equal((await clients.query(sql[2], ['account-a', 'replacement-device', 'replacement-session', 'player-b'])).rowCount, 1, 'Late old-Player cleanup cannot release replacement');
  await clients.query(sql[4], ['pending-account', 'device', 'login', 'closed-before-acquire']);
	for (let attempt = 0; attempt < 32; attempt++) {
		await clients.query(sql[4], ['pending-account', 'device', 'login', 'closed-before-acquire']);
	}
	const closures = await clients.query('SELECT cardinality(closed_players) AS count FROM service_device_leases WHERE account_id = $1', ['pending-account']);
	assert.equal(closures.rows[0].count, 1, 'Repeated cleanup must not duplicate a closed-instance tombstone');
  assert.equal((await clients.query(sql[1], ['pending-account', 'device', 'login', 'closed-before-acquire'])).rowCount, 0, 'Late acquisition cannot revive a closed Player');
  assert.equal((await clients.query(sql[1], ['pending-account', 'device', 'login', 'new-player'])).rowCount, 1, 'Closure must not block a different Player');
  for (let index = 0; index < 16; index++) {
    const params = [`race-account-${index}`, 'device', 'login', 'racing-player'];
    await Promise.all([clients.query(sql[1], params), clients.query(sql[4], params)]);
    assert.equal((await clients.query(sql[2], params)).rowCount, 0, 'Concurrent closure must revoke pending acquisition');
    assert.equal((await clients.query(sql[1], params)).rowCount, 0, 'Closed instance must remain closed after the race');
  }
  console.log('Service leases: concurrency, renewal, session/device mismatch, persistence, expiry, logout revocation and immediate replacement passed.');
} finally {
  if (clients) await clients.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
