import type { PoolClient } from "pg";
import { randomUUID } from "node:crypto";
import { withTransaction } from "./postgres";

export type CanonicalKind = "UNIVERSE" | "ARC" | "WORK" | "SEASON" | "EPISODE" | "ACCOUNT" | "PLUGIN" | "PROVIDER" | "THEME" | "ASSET" | "SOURCE" | "TAXONOMY" | "RESOURCE";
export interface CanonicalEntity { id: string; kind: CanonicalKind; visibility: "public" | "account-private"; owner_id: string | null; revision: number; }
export interface EntityAlias { namespace: string; value: string; sourceKey: string; }
export interface EntityIdentity { kind: CanonicalKind; ownerId?: string; }

const kinds = new Set<CanonicalKind>(["UNIVERSE","ARC","WORK","SEASON","EPISODE","ACCOUNT","PLUGIN","PROVIDER","THEME","ASSET","SOURCE","TAXONOMY","RESOURCE"]);
function checkedString(value: unknown, maximum: number): asserts value is string {
  if (typeof value !== "string" || !value.trim() || value.length > maximum || value.includes("\0")) throw new Error("Invalid canonical identity");
}
function checkedAlias(alias: EntityAlias) {
  checkedString(alias.namespace, 100); checkedString(alias.value, 512); checkedString(alias.sourceKey, 200);
}
function sameIdentity(entity: CanonicalEntity, identity: EntityIdentity) {
  if (entity.kind !== identity.kind || entity.owner_id !== (identity.ownerId ?? null)) throw new Error("Canonical identity conflict");
}
async function aliasLock(client: PoolClient, alias: EntityAlias) {
  // Serialize contenders for one alias. Hash collisions only serialize extra work.
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify([alias.namespace,alias.value])]);
}

/** Internal writer: caller must validate source provenance and account authorization. */
export async function ensureEntity(alias: EntityAlias, identity: EntityIdentity, transactionClient?: PoolClient): Promise<CanonicalEntity> {
  checkedAlias(alias);
  if (!kinds.has(identity.kind) || (identity.kind === "ACCOUNT" && !identity.ownerId)) throw new Error("Invalid canonical kind");
  if (identity.ownerId !== undefined) checkedString(identity.ownerId, 256);
  const persist = async (client: PoolClient) => {
    await aliasLock(client, alias);
    const existing = (await client.query<CanonicalEntity>(`SELECT e.* FROM canonical_aliases a JOIN canonical_entities e ON e.id=a.entity_id
      WHERE a.namespace=$1 AND a.value=$2 AND a.state='active'`, [alias.namespace,alias.value])).rows[0];
    if (existing) { sameIdentity(existing, identity); return existing; }
    const entity = (await client.query<CanonicalEntity>(`INSERT INTO canonical_entities(id,kind,visibility,owner_id)
      VALUES($1,$2,$3,$4) RETURNING *`, [randomUUID(),identity.kind,identity.ownerId ? "account-private" : "public",identity.ownerId ?? null])).rows[0];
    await client.query("INSERT INTO canonical_aliases(entity_id,namespace,value,source_key) VALUES($1,$2,$3,$4)", [entity.id,alias.namespace,alias.value,alias.sourceKey]);
    return entity;
  };
  return transactionClient ? persist(transactionClient) : withTransaction(persist);
}

/** Add a verified alias; an existing active alias cannot be rebound silently. */
export async function bindEntityAlias(entityId: string, alias: EntityAlias, transactionClient?: PoolClient): Promise<void> {
  checkedString(entityId,100); checkedAlias(alias);
  const persist = async (client: PoolClient) => {
    await aliasLock(client, alias);
    const existing = (await client.query("SELECT entity_id FROM canonical_aliases WHERE namespace=$1 AND value=$2 AND state='active'", [alias.namespace,alias.value])).rows[0];
    if (existing) {
      if (existing.entity_id !== entityId) throw new Error("Canonical alias conflict");
      return;
    }
    await client.query("INSERT INTO canonical_aliases(entity_id,namespace,value,source_key) VALUES($1,$2,$3,$4)", [entityId,alias.namespace,alias.value,alias.sourceKey]);
  };
  return transactionClient ? persist(transactionClient) : withTransaction(persist);
}

/** Read within an explicit account scope; private aliases are never public results. */
export async function resolveEntityAlias(client: PoolClient, namespace: string, value: string, accountId: string | null): Promise<CanonicalEntity | null> {
  checkedString(namespace,100); checkedString(value,512);
  const result = await client.query<CanonicalEntity>(`SELECT e.* FROM canonical_aliases a JOIN canonical_entities e ON e.id=a.entity_id
    WHERE a.namespace=$1 AND a.value=$2 AND a.state='active' AND (e.visibility='public' OR e.owner_id=$3)`, [namespace,value,accountId]);
  return result.rows[0] ?? null;
}

export async function linkContentEntities(client: PoolClient, parentId: string, childId: string, displayOrder: number | null, sourceKey: string): Promise<void> {
  checkedString(parentId,100); checkedString(childId,100); checkedString(sourceKey,200);
  if (displayOrder !== null && (!Number.isSafeInteger(displayOrder) || displayOrder < 0 || displayOrder > 2147483647)) throw new Error("Invalid display order");
  const entities = (await client.query<CanonicalEntity>("SELECT * FROM canonical_entities WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE", [[parentId,childId]])).rows;
  const parent = entities.find(entity => entity.id === parentId), child = entities.find(entity => entity.id === childId);
  if (!parent || !child || parentId === childId || parent.owner_id !== child.owner_id || parent.visibility !== child.visibility) throw new Error("Canonical membership scope conflict");
  await client.query(`INSERT INTO canonical_memberships(parent_id,parent_kind,child_id,child_kind,display_order,source_key)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(parent_id,child_id) DO UPDATE
    SET display_order=EXCLUDED.display_order,source_key=EXCLUDED.source_key,revision=canonical_memberships.revision+1
    WHERE canonical_memberships.display_order IS DISTINCT FROM EXCLUDED.display_order OR canonical_memberships.source_key IS DISTINCT FROM EXCLUDED.source_key`,
    [parentId,parent.kind,childId,child.kind,displayOrder,sourceKey]);
}
