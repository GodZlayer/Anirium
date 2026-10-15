import type { PoolClient } from "pg";
import { withTransaction } from "./postgres";
import { googleIdentityLookups } from "./identityLookup";

// Only call with a subject obtained from a verified token. This mapping does
// not verify credentials. Creation and every binding share the transaction.
export async function resolveGoogleAccount(subject: string, createAccount: (client: PoolClient) => Promise<string>,
  onResolved?: (client: PoolClient, userId: string) => Promise<void>) {
  const candidates = googleIdentityLookups(subject);
  return withTransaction(async client => {
    const locks = candidates.map(item => `google:${item.keyId}:${item.hash}`).sort();
    for (const lock of locks) await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [lock]);
    const keyIds = candidates.map(item => item.keyId), hashes = candidates.map(item => item.hash);
    const rows = (await client.query<{ user_id: string }>(`SELECT identity.user_id FROM external_identities identity
      JOIN unnest($1::text[],$2::text[]) candidate(key_id,subject_hash)
        ON identity.key_id=candidate.key_id AND identity.subject_hash=candidate.subject_hash
      WHERE identity.provider='google' FOR UPDATE OF identity`, [keyIds, hashes])).rows;
    const owners = new Set(rows.map(row => row.user_id));
    if (owners.size > 1) throw new Error("Conflicting identity mappings");
    const userId = owners.size ? [...owners][0] : await createAccount(client);
    if (typeof userId !== "string" || !userId || userId.length > 256 || /[\u0000-\u0020\u007f]/.test(userId)) throw new Error("Invalid internal identity");
    for (const candidate of candidates) {
      const result = await client.query(`INSERT INTO external_identities(provider,key_id,subject_hash,user_id)
        VALUES('google',$1,$2,$3) ON CONFLICT(provider,key_id,subject_hash)
        DO UPDATE SET user_id=external_identities.user_id WHERE external_identities.user_id=EXCLUDED.user_id RETURNING user_id`,
        [candidate.keyId,candidate.hash,userId]);
      if (result.rows.length !== 1) throw new Error("Conflicting identity mappings");
    }
    if (onResolved) await onResolved(client, userId);
    return userId;
  });
}
