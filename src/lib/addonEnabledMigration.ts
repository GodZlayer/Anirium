import type { PoolClient } from "pg";

export async function inspectAddonEnabledSchema(client: PoolClient) {
  const column = (await client.query<{ data_type: string }>(`SELECT data_type FROM information_schema.columns
    WHERE table_schema=current_schema() AND table_name='user_addons' AND column_name='enabled'`)).rows[0];
  if (!column || !["integer", "boolean"].includes(column.data_type)) throw new Error("unsupported_addon_enabled_schema");
  const invalid = column.data_type === "integer" ? "enabled IS NULL OR enabled NOT IN (0,1)" : "enabled IS NULL";
  const counts = (await client.query<{ rows: string; invalid: string }>(`SELECT count(*)::text AS rows,
    count(*) FILTER (WHERE ${invalid})::text AS invalid FROM user_addons`)).rows[0];
  return { type: column.data_type, rows: Number(counts.rows), invalid: Number(counts.invalid) };
}

/** Explicit schema conversion; caller commits or rolls back the transaction. */
export async function migrateAddonEnabledSchema(client: PoolClient) {
  await client.query("LOCK TABLE user_addons IN ACCESS EXCLUSIVE MODE");
  const before = await inspectAddonEnabledSchema(client);
  if (before.invalid) throw new Error("invalid_addon_enabled_values");
  if (before.type === "boolean") return { ...before, changed: false };
  await client.query(`ALTER TABLE user_addons ALTER COLUMN enabled DROP DEFAULT,
    ALTER COLUMN enabled TYPE BOOLEAN USING (enabled=1),
    ALTER COLUMN enabled SET DEFAULT TRUE, ALTER COLUMN enabled SET NOT NULL`);
  const after = await inspectAddonEnabledSchema(client);
  if (after.type !== "boolean" || after.invalid || after.rows !== before.rows) throw new Error("addon_enabled_conversion_failed");
  return { ...after, changed: true };
}
