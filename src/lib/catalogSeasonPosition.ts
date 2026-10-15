/** Display coordinates are projections; a missing release must never become season zero. */
export function catalogSeasonPosition(seasonId:string, mapping:any, seasons:any, rootSeasonId:unknown):number | undefined {
  const sourceId=mapping && typeof mapping==='object' && !Array.isArray(mapping) ? Object.keys(mapping).find(key=>mapping[key]===seasonId) : undefined;
  const current=sourceId && Array.isArray(seasons) ? seasons.findIndex((season:any)=>String(season?.id)===sourceId) : -1;
  return current>=0 ? current : ((!Array.isArray(seasons) || !seasons.length) && rootSeasonId===seasonId ? 0 : undefined);
}
