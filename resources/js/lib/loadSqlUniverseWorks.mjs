import { WORK_UUID } from "./catalogAliases.mjs";
import { catalogUniverseIds } from "./catalogUniverseIdentity.mjs";

export async function loadSqlUniverseWorks(work,{adult=false,signal,universeId,fetcher=fetch,normalize=value=>value}={}) {
  const scopes=catalogUniverseIds(work);
  const selected=universeId || (scopes.length===1 ? scopes[0] : null);
  if (!selected) return [work];
  if (!WORK_UUID.test(selected) || selected===work.work_id) throw new Error("Invalid SQL universe identity");
  const works=new Map();
  for(let page=1;page<=1000000;page++) {
    const query=new URLSearchParams({page:String(page),adult:adult ? "1" : "0"});
    const response=await fetcher(`/api/catalog/graph/universe/${selected}?${query}`,{signal});
    if (!response.ok) throw new Error(`Universe graph HTTP ${response.status}`);
    const data=await response.json();
    if (data.schema!==1 || data.entity?.kind!=="universe" || data.entity.id!==selected || data.page!==page || typeof data.has_next!=="boolean"
      || !Array.isArray(data.work_ids) || !Array.isArray(data.works) || data.work_ids.length!==data.works.length || data.works.length>100) throw new Error("Invalid SQL universe graph");
    const declared=new Set(data.work_ids);
    for(const row of data.works) {
      if (!WORK_UUID.test(row.work_id || "") || !declared.delete(row.work_id) || !catalogUniverseIds(row).includes(selected)) throw new Error("Work is outside the SQL universe scope");
      works.set(row.work_id,normalize(row));
    }
    if (!data.has_next) return [...works.values()];
  }
  throw new Error("Universe graph pagination did not finish");
}
