import { randomUUID } from "node:crypto";
import { WORK_UUID } from "../../resources/js/lib/catalogAliases.mjs";

export function planUniverseProjection(rows,state) {
  const groups=new Map(), creations=[], links=[], aliases=[], assignments=new Map(), conflicts=[];
  const ids=new Set(rows.map(row=>row.work_id));
  if (ids.size!==rows.length) throw new Error("Duplicate work IDs in universe projection");
  for (const row of rows) {
    if (!state.works.has(row.work_id) || !WORK_UUID.test(row.universe_component_key || "") || !ids.has(row.universe_component_key)) throw new Error("Universe projection requires committed work IDs and typed component proposals");
    if (!groups.has(row.universe_component_key)) groups.set(row.universe_component_key,[]);
    groups.get(row.universe_component_key).push(row);
  }
  const allocate=key=>{
    const alias="published:"+key, retained=state.aliases.get(alias);
    if (retained) return retained;
    const id=randomUUID();
    creations.push({id,alias});state.aliases.set(alias,id);state.universes.add(id);
    return id;
  };
  for (const [key,members] of groups) {
    const known=new Set(members.flatMap(row=>[...(state.memberships.get(row.work_id) || [])]));
    const pending=known.size>1;
    if (pending) conflicts.push({reason:"multiple-established-universes",component_work_id:key,universe_ids:[...known].sort(),work_ids:members.map(row=>row.work_id)});
    const single=known.size===1 ? [...known][0] : known.size===0 ? allocate(key) : null;
    const oldAlias=state.aliases.get("published:"+key);
    const aliasConflict=single && oldAlias && oldAlias!==single;
    if (aliasConflict) conflicts.push({reason:"established-universe-alias-conflict",component_work_id:key,universe_ids:[oldAlias,single]});
    if (single && !oldAlias) {aliases.push({alias:"published:"+key,id:single});state.aliases.set("published:"+key,single);}
    for (const row of members) {
      const previous=state.memberships.get(row.work_id) || new Set();
      const assigned=previous.size ? [...previous].sort() : [single || allocate(row.work_id)];
      if (!previous.size) links.push({work_id:row.work_id,universe_id:assigned[0]});
      assignments.set(row.work_id,{ids:assigned,pending:Boolean(pending || aliasConflict)});
    }
  }
  return {creations,links,aliases,assignments,conflicts};
}
