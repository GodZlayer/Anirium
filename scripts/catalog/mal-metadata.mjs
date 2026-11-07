import { malBroadcastSchedule } from "../../resources/js/lib/broadcastSchedule.mjs";
import { malDatePatch } from "./mal-dates.mjs";

export function malMetadataPatch(record) {
  const patch = { ...malDatePatch(record), ...(malBroadcastSchedule(record.broadcast) || {}) };
  const complete = Boolean(record.details_checked_at);
  const provided = key => complete || Object.hasOwn(record, key);
  if (Object.hasOwn(record, "related_anime") || Object.hasOwn(record, "related_manga")) {
    patch.source_relations_json = JSON.stringify([...["related_anime", "related_manga"].flatMap(field =>
      (record[field] || []).map(edge => ({ source: "myanimelist", target: { provider: "mal", media: field === "related_anime" ? "anime" : "manga", id: String(edge.node?.id) },
        relation_type: edge.relation_type, label: edge.relation_type_formatted ?? null }))) ]);
  }
  if (record.title) patch.title = record.title;
  if (provided("alternative_titles")) {
    patch.title_english = record.alternative_titles?.en || null;
    patch.title_japanese = record.alternative_titles?.ja || null;
  }
  if (provided("synopsis")) patch.synopsis = record.synopsis ? record.synopsis.replace(/<[^>]*>/g, "") : null;
  if (provided("mean")) patch.score = record.mean > 0 ? Number(record.mean) : null;
  if (provided("popularity")) patch.popularity = record.popularity > 0 ? Number(record.popularity) : null;
  if (provided("num_episodes")) patch.episodes = record.num_episodes > 0 ? Number(record.num_episodes) : null;
  if (provided("media_type")) patch.format = record.media_type?.toUpperCase() || "UNKNOWN";
  if (provided("start_season") || provided("start_date")) patch.year = record.start_season?.year ?? (record.start_date ? Number(record.start_date.slice(0, 4)) : null);
  for (const field of ["genres", "studios"]) {
    if (provided(field)) patch[`${field}_json`] = JSON.stringify((record[field] || []).map(item => ({ mal_id: item.id, name: item.name })));
  }
  if (provided("main_picture")) {
    const image = record.main_picture?.large || record.main_picture?.medium;
    patch.images_json = JSON.stringify(image ? { jpg: { image_url: image, large_image_url: image, small_image_url: record.main_picture?.medium || image } } : {});
  }
  if (record.status === "not_yet_aired") patch.latest_episode_num = null;
  return patch;
}
