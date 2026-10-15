import type { PoolClient } from "pg";
import { ensureEntity } from "./entityIndex";
import { withTransaction } from "./postgres";

/** Account identity is independent of addon installation and private config. */
export async function registerCanonicalAccount(client: PoolClient, owner: string): Promise<string> {
  if (typeof owner !== "string" || !owner.trim() || owner.length > 256 || /[\u0000-\u001f\u007f]/.test(owner)) throw new Error("Invalid account identity");
  if (!(await client.query("SELECT id FROM users WHERE id=$1 FOR UPDATE",[owner])).rows.length) throw new Error("Canonical account unavailable");
  const account = await ensureEntity({namespace:"anirium:account",value:owner,sourceKey:"core:account"},{kind:"ACCOUNT",ownerId:owner},client);
  const result = await client.query("UPDATE users SET canonical_account_id=$2 WHERE id=$1 AND (canonical_account_id IS NULL OR canonical_account_id=$2) RETURNING id",[owner,account.id]);
  if (result.rowCount !== 1) throw new Error("Canonical account identity conflict");
  return account.id;
}

export async function backfillAccountIdentity(owner: string): Promise<string> {
  return withTransaction(client=>registerCanonicalAccount(client,owner));
}
