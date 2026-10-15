import type { PoolClient } from "pg";
import { createHash } from "node:crypto";
import { ensureEntity } from "./entityIndex";
import { blackTheme } from "./themeTokens";

export async function ensureBlackTheme(client: PoolClient) {
  if (!Object.values(blackTheme.tokens).every(value=>/^#[0-9a-f]{6}$/i.test(value))) throw new Error("Invalid packaged theme tokens");
  const theme = await ensureEntity({namespace:"anirium:theme",value:blackTheme.key,sourceKey:"official-package"},{kind:"THEME"},client);
  const hash = createHash("sha256").update(JSON.stringify(blackTheme)).digest("hex");
  const result = await client.query(`INSERT INTO canonical_theme_releases(theme_id,version,token_schema_version,descriptor_hash,tokens)
    VALUES($1,$2,$3,$4,$5::jsonb) ON CONFLICT(theme_id,version) DO UPDATE SET version=EXCLUDED.version
    WHERE canonical_theme_releases.descriptor_hash=EXCLUDED.descriptor_hash RETURNING id`,
    [theme.id,blackTheme.version,blackTheme.tokenSchemaVersion,hash,JSON.stringify(blackTheme.tokens)]);
  if (result.rowCount!==1) throw new Error("Packaged theme version conflict");
  return {themeId:theme.id,releaseId:result.rows[0].id,version:blackTheme.version};
}
