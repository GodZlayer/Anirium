import { resolveCatalogText } from "./catalogTextVariants";
import { readEntityPageInput as readEntityStatusPageInput } from "./entityPageInput";
import { ApiInputError } from "./apiInput";
import { query } from "./postgres";
import { projectActivity } from "./privateActivity";
import { catalogSeasonPosition } from "./catalogSeasonPosition";

export { readEntityStatusPageInput };

export async function getEntityStatusPage(owner: string, input: ReturnType<typeof readEntityStatusPageInput>) {
  if (!owner || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20) throw new ApiInputError(400, "invalid_status_page");
  const rows = await query<any>(`SELECT s.*, a.mal_id AS _route_id, ep.display_order AS _episode_number, a.text_variants_json AS _catalog_texts,own.variants AS _own_texts,
    CASE WHEN s.entity_type='SEASON' THEN s.canonical_entity_id ELSE ep.parent_id END AS _season_id,
    a.seasons_json AS _seasons,a.composition_seasons_json AS _season_map,a.composition_season_id AS _root_season,
    to_char(COALESCE(COALESCE(s.updated_at, TIMESTAMPTZ '1970-01-01 00:00:00+00'), TIMESTAMPTZ '1970-01-01 00:00:00+00') AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS _page_time
    FROM user_entity_status s
    LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('field',field,'locale',locale,'form',form,'sourceKey',source_key,'value',value)
      ORDER BY field,locale,form,source_key) AS variants FROM canonical_text_variants
      WHERE entity_id=s.canonical_entity_id AND field='title') own ON TRUE
    LEFT JOIN canonical_memberships ep ON ep.child_id=s.canonical_entity_id AND ep.parent_kind='SEASON' AND ep.child_kind='EPISODE'
    LEFT JOIN canonical_memberships release_work ON release_work.child_id=CASE WHEN s.entity_type='SEASON' THEN s.canonical_entity_id ELSE ep.parent_id END
      AND release_work.parent_kind='WORK' AND release_work.child_kind='SEASON'
    LEFT JOIN LATERAL (SELECT c.* FROM anime_catalog c WHERE
      (s.entity_type IN ('EPISODE','SEASON') AND c.composition_work_id=release_work.parent_id
        AND EXISTS (SELECT 1 FROM jsonb_each_text(CASE WHEN jsonb_typeof(c.composition_seasons_json)='object' THEN c.composition_seasons_json ELSE '{}'::jsonb END) mapping
          WHERE mapping.value=release_work.child_id))
      OR (s.entity_type='SERIES' AND c.composition_work_id=s.canonical_entity_id)
      ORDER BY (c.mal_id=s.parent_series_id) DESC NULLS LAST,c.mal_id LIMIT 1) a ON TRUE
    WHERE s.user_id=$1 AND ($2::text IS NULL OR s.entity_type=$2)
      AND s.canonical_entity_id IS NOT NULL
      AND (s.entity_type <> 'SERIES' OR s.release_entity_id IS NULL)
      AND NOT EXISTS (
        SELECT 1 FROM user_entity_status newer WHERE newer.user_id=s.user_id AND newer.entity_type=s.entity_type
          AND newer.canonical_entity_id=s.canonical_entity_id
          AND (newer.entity_type <> 'SERIES' OR newer.release_entity_id IS NULL)
          AND (COALESCE(newer.updated_at,TIMESTAMPTZ '1970-01-01'),newer.id)>(COALESCE(s.updated_at,TIMESTAMPTZ '1970-01-01'),s.id)
      )
      AND ($3::timestamptz IS NULL OR (COALESCE(s.updated_at, TIMESTAMPTZ '1970-01-01 00:00:00+00'),s.id)<($3::timestamptz,$4::uuid))
    ORDER BY COALESCE(s.updated_at, TIMESTAMPTZ '1970-01-01 00:00:00+00') DESC, s.id DESC LIMIT $5`, [owner,input.entityType,input.time,input.id,input.limit+1]);
  const page = rows.slice(0,input.limit);
  const last = page.at(-1);
  return { statuses: page.map(row => {
    const { _catalog_texts,_own_texts,_page_time,_route_id,_episode_number,_season_id,_seasons,_season_map,_root_season, ...data } = row;
    const projected={...projectActivity(data),anime_title:resolveCatalogText(_own_texts,"title",["und","en","pt-br","pt","ja"],["default","native","full"])
      ?? resolveCatalogText(_catalog_texts,"title",["und","en","pt-br","pt","ja"],["default","native"]) ?? "",
      anime_title_portuguese:resolveCatalogText(_own_texts,"title",["pt-br","pt"],["default","full"])
      ?? resolveCatalogText(_catalog_texts,"title",["pt-br","pt"],["default"]),entity_id:data.canonical_entity_id,parent_series_id:_route_id ?? null,
      ...(data.entity_type==='EPISODE' ? {episode_number:_episode_number ?? null} : {})};
    return _season_id ? {...projected,season_entity_id:_season_id,season_idx:catalogSeasonPosition(_season_id,_season_map,_seasons,_root_season) ?? null} : projected;
  }),
    nextCursor: rows.length > input.limit && last ? Buffer.from(JSON.stringify([last._page_time,last.id])).toString("base64url") : null };
}
