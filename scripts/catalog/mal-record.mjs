const RELATIONS = { prequel: "PREQUEL", sequel: "SEQUEL", parent_story: "PARENT", side_story: "SIDE_STORY", full_story: "MAIN_STORY", alternative_version: "ALTERNATIVE_VERSION", alternative_setting: "ALTERNATIVE_SETTING", spin_off: "SPIN_OFF", summary: "SUMMARY", compilation: "COMPILATION", other: "OTHER" };

import { malMetadataPatch } from "./mal-metadata.mjs";

export function malRecord(record) {
  return {
    m: {
      idMal: record.id,
      title: { romaji: record.title, english: record.alternative_titles?.en, native: record.alternative_titles?.ja },
      description: record.synopsis,
      averageScore: record.mean == null ? null : record.mean * 10,
      popularity: record.popularity,
      episodes: record.num_episodes > 0 ? record.num_episodes : null,
      format: record.media_type?.toUpperCase(),
      seasonYear: record.start_season?.year ?? (record.start_date ? Number(record.start_date.slice(0, 4)) : null),
      coverImage: { extraLarge: record.main_picture?.large || record.main_picture?.medium },
      genres: (record.genres || []).map(item => item.name),
      studios: { nodes: record.studios || [] },
      sourceCheckedAt: record.source_checked_at,
      detailsCheckedAt: record.details_checked_at,
      detailsState: record.details_state,
      metadataSource: "myanimelist",
      officialPatch: malMetadataPatch(record),
      officialRelations: Array.isArray(record.related_anime) ? record.related_anime.flatMap(edge =>
        Number.isSafeInteger(edge.node?.id) && edge.node.id > 0 && RELATIONS[edge.relation_type]
          ? [{ mal_id: edge.node.id, type: RELATIONS[edge.relation_type], source: "myanimelist" }] : []) : undefined,
    },
    mappedStatus: { currently_airing: "RELEASING", not_yet_aired: "NOT_YET_RELEASED", finished_airing: "COMPLETED" }[record.status] || "UNKNOWN",
    defaultCat: "all",
  };
}
