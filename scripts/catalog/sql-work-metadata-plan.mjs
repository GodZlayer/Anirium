export function planWorkMetadata(rows,works) {
  const changes=[];
  for (const row of rows) {
    const before=works.get(row.work_id);
    if (!before) throw new Error("SQL work metadata requires an established UUID");
    const format=typeof row.format==="string" && row.format && row.format!=="UNKNOWN" ? row.format : before.format;
    const status=typeof row.status==="string" && row.status && row.status!=="UNKNOWN" ? row.status : before.status;
    const count=row.episodes ?? row.episodes_count;
    const episode_count=Number.isSafeInteger(count) && count>0 ? count : before.episode_count;
    if (format!==before.format || status!==before.status || episode_count!==before.episode_count) changes.push({id:row.work_id,format,status,episode_count});
  }
  return changes;
}
