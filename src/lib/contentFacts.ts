import type { PoolClient } from "pg";

export type ContentFact =
  | {field:string;type:"string";value:string}
  | {field:string;type:"string-list";value:string[]}
  | {field:string;type:"number";value:number}
  | {field:string;type:"boolean";value:boolean}
  | {field:string;type:"instant";value:number}
  | {field:string;type:"null";value:null};
export interface FactSource {namespace:string;externalId:string;sourceKey:string;observedAt:number;}
export type CurrentContentFact=ContentFact & {observedAt:number;namespace:string;externalId:string;sourceKey:string};
const instant=(v:unknown):v is number=>typeof v==='number' && Number.isSafeInteger(v) && v>=0 && v<=8640000000000000;
function text(v:unknown,max:number) {return typeof v==='string' && !!v.trim() && v.length<=max && !v.includes('\0');}

/** Caller verifies source authenticity. The stored alias must already identify this entity. */
export async function recordContentFacts(client:PoolClient,entityId:string,source:FactSource,facts:readonly ContentFact[]) {
  if(!text(entityId,100) || !text(source.namespace,100) || !text(source.externalId,512) || !text(source.sourceKey,200) || !instant(source.observedAt) || !Array.isArray(facts) || !facts.length || facts.length>100) throw new Error('Invalid content fact source');
  const fields=new Set<string>();
  for(const f of facts) {
    if(!f || typeof f.field!=='string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(f.field) || fields.has(f.field) ||
      !(f.type==='string' ? typeof f.value==='string' && f.value.length<=100000 && !f.value.includes('\0') :
        f.type==='string-list' ? Array.isArray(f.value) && f.value.length<=1000 && f.value.every((v:unknown)=>text(v,10000)) :
        f.type==='number' ? typeof f.value==='number' && Number.isFinite(f.value) :
        f.type==='boolean' ? typeof f.value==='boolean' :
        f.type==='instant' ? instant(f.value) : f.type==='null' && f.value===null)) throw new Error('Invalid typed content fact');
    fields.add(f.field);
  }
  const alias=(await client.query<{id:string}>(`SELECT a.id FROM canonical_aliases a JOIN canonical_entities e ON e.id=a.entity_id
    WHERE a.namespace=$1 AND a.value=$2 AND a.entity_id=$3 AND a.state='active' AND e.visibility='public'
      AND e.kind IN ('UNIVERSE','ARC','WORK','SEASON','EPISODE')`,[source.namespace,source.externalId,entityId])).rows[0];
  if(!alias) throw new Error('Proven content source identity unavailable');
  // Stable field order avoids opposite-order batch lock acquisition.
  for(const f of [...facts].sort((a,b)=>a.field.localeCompare(b.field))) {
    const args=[entityId,alias.id,source.sourceKey,f.field,source.observedAt];
    const inserted=await client.query(`INSERT INTO canonical_content_facts(entity_id,alias_id,source_key,field,observed_at,value_type,value)
      VALUES($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT DO NOTHING RETURNING field`,[...args,f.type,JSON.stringify(f.value)]);
    if(!inserted.rowCount) {
      const existing=(await client.query<{value_type:string;value:unknown}>(`SELECT value_type,value FROM canonical_content_facts
        WHERE entity_id=$1 AND alias_id=$2 AND source_key=$3 AND field=$4 AND observed_at=$5`,args)).rows[0];
      if(!existing || existing.value_type!==f.type || (f.type==='string-list' ? JSON.stringify(existing.value)!==JSON.stringify(f.value) : existing.value!==f.value)) throw new Error('Conflicting content observation');
    }
  }
}

export async function readCurrentContentFacts(client:PoolClient,entityId:string) {
  if(!text(entityId,100)) throw new Error('Invalid content identity');
  return (await client.query<CurrentContentFact>(`
    SELECT f.field,f.value_type AS type,f.value,
      f.observed_at::double precision AS "observedAt",a.namespace,a.value AS "externalId",f.source_key AS "sourceKey"
    FROM canonical_content_fact_heads h JOIN canonical_content_facts f
      ON (f.entity_id,f.alias_id,f.source_key,f.field,f.observed_at)=(h.entity_id,h.alias_id,h.source_key,h.field,h.observed_at)
    JOIN canonical_aliases a ON a.id=f.alias_id AND a.state='active'
    JOIN canonical_entities e ON e.id=f.entity_id AND e.visibility='public'
    WHERE f.entity_id=$1 ORDER BY f.alias_id,f.source_key,f.field,f.observed_at DESC`,[entityId])).rows;
}

/** Announced airing time is distinct from actual playable availability. */
export async function recordEpisodeAiring(client:PoolClient,episodeId:string,source:FactSource,scheduledAt:number|null,cancelled:boolean) {
  const entity=(await client.query("SELECT kind FROM canonical_entities WHERE id=$1",[episodeId])).rows[0];
  if(entity?.kind!=='EPISODE' || typeof cancelled!=='boolean' || (scheduledAt!==null && !instant(scheduledAt))) throw new Error('Invalid episode airing');
  await recordContentFacts(client,episodeId,source,[scheduledAt===null ? {field:'airing.scheduledAt',type:'null',value:null} :
    {field:'airing.scheduledAt',type:'instant',value:scheduledAt},{field:'airing.cancelled',type:'boolean',value:cancelled}]);
}

export async function readEpisodeAirings(client:PoolClient,episodeId:string) {
  const entity=(await client.query("SELECT kind,visibility FROM canonical_entities WHERE id=$1",[episodeId])).rows[0];
  if(entity?.kind!=='EPISODE' || entity.visibility!=='public') return null;
  const facts=await readCurrentContentFacts(client,episodeId);
  return facts.filter(f=>f.field==='airing.scheduledAt').map(time=>{
    const cancellation=facts.find(f=>f.field==='airing.cancelled' && f.namespace===time.namespace && f.externalId===time.externalId && f.sourceKey===time.sourceKey && f.observedAt===time.observedAt);
    return {namespace:time.namespace,externalId:time.externalId,sourceKey:time.sourceKey,observedAt:time.observedAt,
      scheduledAt:time.type==='instant' ? time.value : null,
      cancelled:cancellation?.type==='boolean' ? cancellation.value : null};
  });
}
