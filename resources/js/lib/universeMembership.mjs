import { catalogKey, catalogIdentity } from "./catalogIdentity.mjs";
import { catalogUniverseIds } from "./catalogUniverseIdentity.mjs";

export function universeWorksFor(catalog,current,universeId) {
  if (!current) return [];
  const scopes=catalogUniverseIds(current), selected=universeId || (scopes.length===1 ? scopes[0] : null);
  if (!selected) return [current];
  const works=catalog.filter(work=>catalogUniverseIds(work).includes(selected) && catalogIdentity(work).entity_type==="WORK");
  if (scopes.includes(selected) && catalogIdentity(current).entity_type==="WORK" && !works.some(work=>work.work_id===current.work_id)) works.push(current);
  return works.sort((a,b)=>(a.year ?? Infinity)-(b.year ?? Infinity) || catalogKey(a).localeCompare(catalogKey(b)));
}
