export function catalogMetadata(record, identity) {
  const positiveInteger = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : undefined;
  const status = String(record.status || "UNKNOWN").toUpperCase();
  const written = ["MANGA", "NOVEL"].includes(identity.entity_type);
  const episodes = written ? undefined : positiveInteger(record.episodes ?? record.episodes_count);
  const reported = written ? undefined : positiveInteger(record.latest_episode_num);
  return {
    status,
    format: String(record.format || "UNKNOWN"),
    episodes_count: episodes,
    latest_episode_num: reported && (!episodes || reported <= episodes) ? reported : status === "COMPLETED" ? episodes : undefined,
  };
}

export function statusLabelKey(status) {
  if (["RELEASING", "AIRING", "CURRENT"].includes(status)) return "releasing";
  if (["NOT_YET_RELEASED", "NOT_YET_AIRED", "UPCOMING"].includes(status)) return "upcoming";
  return ["COMPLETED", "FINISHED"].includes(status) ? "completed" : null;
}
