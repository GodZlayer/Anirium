import { withTransaction } from "./postgres";
import { registerCatalogWork } from "./catalogSourceIdentity";
import { indexCatalogHierarchy } from "./catalogHierarchyIndex";
import { indexCatalogTexts } from "./catalogTextVariants";
import { indexCatalogAssets } from "./catalogAssets";
import type { CatalogSourceNode, CatalogSourceRelation } from "@/types/anime";

export interface CatalogBackfillPage { afterId: number; processed: number; nextAfterId: number; exhausted: boolean; }

/**
 * One committed page of the additive catalog migration. Persist nextAfterId only
 * after this promise resolves; replaying a page preserves all canonical IDs.
 * A final scan from zero is required to catch old/low IDs inserted mid-scan.
 * Schema initialization and backup/restore gates belong to the migration caller.
 */
export async function backfillCatalogWorks(options: { afterId?: number; limit?: number } = {}): Promise<CatalogBackfillPage> {
  const afterId = options.afterId === undefined ? 0 : options.afterId;
  const limit = options.limit === undefined ? 100 : options.limit;
  if (!Number.isSafeInteger(afterId) || afterId < 0 || afterId > 2147483647 || !Number.isSafeInteger(limit) || limit < 1 || limit > 200) throw new Error("Invalid catalog backfill page");
  return withTransaction(async client => {
    await client.query("SELECT pg_advisory_xact_lock(hashtextextended('anirium:catalog:hierarchy',0))");
    // Never skip a locked row and then advance past it: that would lose data.
    const rows = (await client.query<{ mal_id: number; id_mal: number | null; id_anilist: number | null; source_nodes_json: CatalogSourceNode[] | null; source_relations_json: CatalogSourceRelation[] | null }>(
      "SELECT mal_id,id_mal,id_anilist,source_nodes_json,source_relations_json FROM anime_catalog WHERE mal_id>$1 ORDER BY mal_id LIMIT $2 FOR UPDATE", [afterId,limit+1])).rows;
    const page = rows.slice(0,limit);
    for (const row of page) {
      await registerCatalogWork(client,{legacyId:row.mal_id,malId:row.id_mal,anilistId:row.id_anilist});
      if (row.id_anilist != null && row.source_nodes_json != null && row.source_relations_json != null) {
        await indexCatalogHierarchy(client,row.id_anilist,row.source_nodes_json,row.source_relations_json,{reconcile:true});
      }
      await indexCatalogTexts(client,row.mal_id);
      await indexCatalogAssets(client,row.mal_id);
    }
    return { afterId, processed:page.length, nextAfterId:page.at(-1)?.mal_id ?? afterId, exhausted:rows.length<=limit };
  });
}
