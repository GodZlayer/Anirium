import { query, queryOne } from './postgres';

let leaseSchemaReady: Promise<void> | null = null;

async function initializeLeaseSchema() {
  await query(`CREATE TABLE IF NOT EXISTS service_device_leases (
    account_id TEXT PRIMARY KEY,
    device_id TEXT NOT NULL,
    session_id TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  )`);
  await query(`ALTER TABLE service_device_leases ADD COLUMN IF NOT EXISTS player_session_id TEXT NOT NULL DEFAULT ''`);
  await query(`ALTER TABLE service_device_leases ADD COLUMN IF NOT EXISTS closed_players TEXT[] NOT NULL DEFAULT '{}'`);
}

async function ensureLeases() {
  if (!leaseSchemaReady) {
    leaseSchemaReady = initializeLeaseSchema().catch(error => {
      leaseSchemaReady = null;
      throw error;
    });
  }
  await leaseSchemaReady;
}

export async function acquireServiceLease(accountId: string, deviceId: string, sessionId: string, playerSessionId: string) {
  await ensureLeases();
  const lease = await queryOne(`INSERT INTO service_device_leases
    (account_id, device_id, session_id, player_session_id, expires_at)
    VALUES ($1, $2, $3, $4, NOW() + INTERVAL '5 minutes')
    ON CONFLICT (account_id) DO UPDATE SET device_id = EXCLUDED.device_id,
      session_id = EXCLUDED.session_id, player_session_id = EXCLUDED.player_session_id, expires_at = EXCLUDED.expires_at
    WHERE NOT (EXCLUDED.player_session_id = ANY(service_device_leases.closed_players))
      AND (service_device_leases.expires_at <= NOW()
      OR (service_device_leases.device_id = EXCLUDED.device_id
          AND service_device_leases.session_id = EXCLUDED.session_id
          AND service_device_leases.player_session_id = EXCLUDED.player_session_id))
    RETURNING account_id`, [accountId, deviceId, sessionId, playerSessionId]);
  return lease !== null;
}

export async function validateServiceLease(accountId: string, deviceId: string, sessionId: string, playerSessionId: string) {
  await ensureLeases();
  return (await queryOne(`SELECT account_id FROM service_device_leases
    WHERE account_id = $1 AND device_id = $2 AND session_id = $3
      AND player_session_id = $4 AND expires_at > NOW()`, [accountId, deviceId, sessionId, playerSessionId])) !== null;
}

export async function revokeServiceSession(sessionId: string) {
  await ensureLeases();
  await query(`DELETE FROM service_device_leases WHERE session_id = $1`, [sessionId]);
}

export async function releasePlayerLease(accountId: string, deviceId: string, sessionId: string, playerSessionId: string) {
  await ensureLeases();
  // Keep a closed-instance tombstone in the same account row. ON CONFLICT
  // serializes release/acquisition even when closure arrives before acquisition.
  await query(`INSERT INTO service_device_leases
    (account_id, device_id, session_id, player_session_id, expires_at, closed_players)
    VALUES ($1, $2, $3, $4, NOW(), ARRAY[$4]::TEXT[])
    ON CONFLICT (account_id) DO UPDATE SET
      closed_players = CASE WHEN $4 = ANY(service_device_leases.closed_players)
        THEN service_device_leases.closed_players ELSE array_append(service_device_leases.closed_players, $4) END,
      expires_at = CASE WHEN service_device_leases.device_id = $2 AND service_device_leases.session_id = $3
        AND service_device_leases.player_session_id = $4 THEN NOW() ELSE service_device_leases.expires_at END`,
    [accountId, deviceId, sessionId, playerSessionId]);
}
