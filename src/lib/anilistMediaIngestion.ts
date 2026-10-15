import type { PoolClient } from 'pg';
import type { CatalogTextVariant } from '@/types/anime';
import { collectCatalogSourceSnapshot } from './catalogSourceGraph';
import { indexCatalogHierarchy } from './catalogHierarchyIndex';
import { bindEntityAlias, resolveEntityAlias } from './entityIndex';
import { recordContentFacts, type ContentFact } from './contentFacts';
import { setContentEntityTexts } from './contentEntityInfo';
import { createHash } from 'node:crypto';
import { aniListMediaDetailFacts, type AniListMediaDetails } from './anilistMediaDetails';

export interface AniListMediaSnapshot extends AniListMediaDetails {
 id:number;idMal:number|null;type:'ANIME';format:string|null;episodes:number|null;
 status:string|null;averageScore:number|null;countryOfOrigin:string|null;
 title:{romaji:string|null;english:string|null;native:string|null};
 relations:{pageInfo:{hasNextPage:false};edges:unknown[]};
}

const positive=(value:unknown)=>typeof value==='number' && Number.isSafeInteger(value) && value>0 && value<=2147483647;
const nullableText=(value:unknown,max:number)=>value===null || (typeof value==='string' && !!value.trim() && value.length<=max && !value.includes('\0'));
/** Every requested field must exist; null remains distinct from an omitted field. */
export function validateAniListMediaSnapshot(media:any,expectedId?:number) {
  if(!media || !positive(media.id) || (expectedId!==undefined && media.id!==expectedId) || media.type!=='ANIME' ||
    !(media.idMal===null || positive(media.idMal)) || !nullableText(media.format,40) || !nullableText(media.status,40) ||
    !(media.episodes===null || (typeof media.episodes==='number' && Number.isSafeInteger(media.episodes) && media.episodes>=0 && media.episodes<=2147483647)) ||
    !(media.averageScore===null || (typeof media.averageScore==='number' && Number.isInteger(media.averageScore) && media.averageScore>=0 && media.averageScore<=100)) ||
    !(media.countryOfOrigin===null || (typeof media.countryOfOrigin==='string' && /^[A-Z]{2}$/.test(media.countryOfOrigin))) ||
    !media.title || !['romaji','english','native'].every(field=>nullableText(media.title[field],10000)) ||
    !Array.isArray(media.relations?.edges) || media.relations.edges.length>999 || media.relations?.pageInfo?.hasNextPage!==false)
    throw new Error('Invalid AniList media snapshot');
  aniListMediaDetailFacts(media);
  const pending=[media],visited=new WeakSet<object>();let validatedNodes=0;
  while(pending.length) {
    const node=pending.pop();
    if(!node || typeof node!=='object')throw new Error('Invalid AniList related media');
    if(visited.has(node))continue;
    visited.add(node);
    if(++validatedNodes>1000)throw new Error('AniList media graph exceeds limit');
    if(!positive(node.id) || !['ANIME','MANGA'].includes(node.type) || !nullableText(node.format,40) ||
      !(node.episodes===null || (typeof node.episodes==='number' && Number.isSafeInteger(node.episodes) && node.episodes>=0 && node.episodes<=2147483647)))throw new Error('Invalid AniList related media');
    if(node.relations!==undefined) {
      if(!Array.isArray(node.relations.edges) || node.relations.edges.length>999 || node.relations.pageInfo?.hasNextPage!==false)throw new Error('Incomplete AniList media relations');
      for(const edge of node.relations.edges)pending.push(edge?.node);
    }
  }
  const graph=collectCatalogSourceSnapshot(media);
  const root=graph.nodes.find(node=>node.type==='ANIME' && node.id===String(media.id));
  if(!root || (root.format??null)!==media.format || (root.episodes??null)!==media.episodes)throw new Error('Conflicting AniList root metadata');
  return {media:media as AniListMediaSnapshot,graph};
}

/** Caller commits the whole snapshot. No catalog route or inferred title match is created. */
export async function ingestAniListMediaSnapshot(client:PoolClient,input:any,observedAt:number) {
  if(!Number.isSafeInteger(observedAt) || observedAt<0 || observedAt>8640000000000000)throw new Error('Invalid media observation');
  const {media,graph}=validateAniListMediaSnapshot(input);
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended('anirium:catalog:hierarchy',0))");
  const latest=(await client.query(`SELECT MAX(h.observed_at) AS observed_at FROM canonical_content_fact_heads h
    JOIN canonical_aliases a ON a.id=h.alias_id WHERE a.namespace='anilist:season' AND a.value=ANY($1::text[]) AND a.state='active'
    AND h.source_key='anilist:media'`,[graph.nodes.filter(node=>node.type==='ANIME').map(node=>node.id)])).rows[0].observed_at;
  if(latest!==null && observedAt<Number(latest))throw new Error('Older media observation');
  await indexCatalogHierarchy(client,media.id,graph.nodes,graph.relations);
  const season=await resolveEntityAlias(client,'anilist:season',String(media.id),null);
  if(!season || season.kind!=='SEASON')throw new Error('Media season identity unavailable');
  if(media.idMal!==null)await bindEntityAlias(season.id,{namespace:'mal:season',value:String(media.idMal),sourceKey:'anilist:media:idMal'},client);
  const source={namespace:'anilist:season',externalId:String(media.id),sourceKey:'anilist:media',observedAt};
  const facts:ContentFact[]=aniListMediaDetailFacts(media);
  for(const [field,value,type] of [
    ['media.episodes',media.episodes,'number'],['media.averageScore',media.averageScore,'number'],
    ['media.status',media.status,'string'],['media.format',media.format,'string'],
    ['media.countryOfOrigin',media.countryOfOrigin,'string'],['media.idMal',media.idMal===null?null:String(media.idMal),'string'],
    ['title.romaji',media.title.romaji,'string'],['title.english',media.title.english,'string'],['title.native',media.title.native,'string'],
  ] as const)facts.push(value===null?{field,type:'null',value:null}:{field,type,value} as ContentFact);
  const topology=JSON.stringify({nodes:[...graph.nodes].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
    relations:[...graph.relations].sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))});
  facts.push({field:'source.topology.snapshot',type:'string',value:topology},{field:'source.topology.sha256',type:'string',value:createHash('sha256').update(topology).digest('hex')});
  await recordContentFacts(client,season.id,source,facts);
  for(const node of graph.nodes.filter(node=>node.type==='ANIME' && node.id!==String(media.id))) {
    const related=await resolveEntityAlias(client,'anilist:season',node.id,null);
    if(!related || related.kind!=='SEASON')throw new Error('Related media identity unavailable');
    await recordContentFacts(client,related.id,{...source,externalId:node.id},[
      node.episodes==null?{field:'media.episodes',type:'null',value:null}:{field:'media.episodes',type:'number',value:node.episodes},
      node.format===undefined?{field:'media.format',type:'null',value:null}:{field:'media.format',type:'string',value:node.format},
    ]);
  }
  const texts:CatalogTextVariant[]=[];
  if(typeof media.description==='string' && media.description.length)texts.push({field:'description',locale:'und',form:'markdown',sourceKey:source.sourceKey,value:media.description});
  else await client.query("DELETE FROM canonical_text_variants WHERE entity_id=$1 AND field='description' AND locale='und' AND form='markdown' AND source_key=$2",[season.id,source.sourceKey]);
  for(const [key,locale,form] of [['romaji','und','default'],['english','en','default'],['native','und','native']] as const) {
    const value=media.title[key];
    if(value!==null)texts.push({field:'title',locale,form,sourceKey:source.sourceKey,value});
    else await client.query('DELETE FROM canonical_text_variants WHERE entity_id=$1 AND field=$2 AND locale=$3 AND form=$4 AND source_key=$5',[season.id,'title',locale,form,source.sourceKey]);
  }
  await setContentEntityTexts(client,season.id,texts);
  const links=(await client.query(`SELECT w.parent_id AS work_id,u.parent_id AS universe_id FROM canonical_memberships w
    JOIN canonical_memberships u ON u.child_id=w.parent_id AND u.parent_kind='UNIVERSE' AND u.child_kind='WORK'
    WHERE w.child_id=$1 AND w.parent_kind='WORK' AND w.child_kind='SEASON' ORDER BY u.parent_id`,[season.id])).rows;
  return {seasonId:season.id,workId:links[0]?.work_id as string|undefined,universeIds:links.map(row=>row.universe_id as string),observedAt};
}

export async function fetchAniListMediaSnapshot(id:number,fetcher:typeof fetch) {
  if(!positive(id))throw new Error('Invalid AniList media id');
  const observedAt=Date.now();
  const response=await fetcher('https://graphql.anilist.co',{method:'POST',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({
    query:`query OwnMedia($id:Int!){Media(id:$id,type:ANIME){id idMal type format status episodes averageScore countryOfOrigin title{romaji english native}
      description(asHtml:false) genres synonyms duration isAdult isLicensed season seasonYear source(version:3) updatedAt hashtag siteUrl bannerImage
      coverImage{extraLarge large medium color} startDate{year month day} endDate{year month day}
      relations{pageInfo{hasNextPage} edges{relationType node{id type format episodes}}}}}`,variables:{id}})});
  if(!response.ok) {
    const error=new Error('AniList media source HTTP failure');
    Object.assign(error,{status:response.status,retryAfter:response.headers.get('Retry-After')});throw error;
  }
  const body=await response.json();
  if(body?.errors?.length)throw new Error('AniList media source GraphQL failure');
  const {media}=validateAniListMediaSnapshot(body?.data?.Media,id);
  return {media,observedAt};
}
