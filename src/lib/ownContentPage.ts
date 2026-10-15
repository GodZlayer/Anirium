import type { PoolClient } from 'pg';
import type { CurrentContentFact } from './contentFacts';
import type { CatalogTextVariant } from '@/types/anime';
import { readActivity } from './privateActivity';

export type OwnContentKind='UNIVERSE'|'ARC'|'WORK'|'SEASON'|'EPISODE';
type FilterBase={sourceKey:string;field:string};
export type OwnContentFilter=FilterBase & (
 {type:'string';op:'eq';value:string}|{type:'boolean';op:'eq';value:boolean}|{type:'null';op:'eq';value:null}|
 {type:'number'|'instant';op:'eq'|'gte'|'lte';value:number}|{type:'string-list';op:'contains';value:string}
);
export interface OwnContentPageInput {kind?:OwnContentKind;parentId?:string;query?:string;filters?:OwnContentFilter[];after?:string;limit?:number}
export interface OwnContentItem {id:string;kind:OwnContentKind;revision:number;texts:(CatalogTextVariant & {revision:number})[];facts:CurrentContentFact[]}
export type OwnAccountStatus='watching'|'plan_to_watch'|'completed'|'dropped'|'on_hold';
export interface OwnAccountContentInput extends OwnContentPageInput {status?:OwnAccountStatus;favorite?:boolean;completed?:boolean}
export interface OwnAccountActivity {
 id:string;status:OwnAccountStatus|null;favorite:boolean|null;completed:boolean|null;containsSpoilers:boolean|null;updatedAt:number|null;
 watchedSeconds:number;totalSeconds:number;userScore:number|null;externalSourceScore:number|null;
 opinion:string|null;audioTrack:string|null;subtitleTrack:string|null;
}
type AccountScope={owner:string;input:OwnAccountContentInput};
const uuid=(v:unknown)=>typeof v==='string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const text=(v:unknown,max:number)=>typeof v==='string' && !!v.trim() && v.length<=max && !v.includes('\0');

/** One SQL snapshot. Filters within one source must match one proven active alias. */
async function readContentPage(client:PoolClient,input:OwnContentPageInput,account?:AccountScope) {
 if(!input || typeof input!=='object' || Array.isArray(input))throw new Error('Invalid own content page');
 const limit=input.limit===undefined?50:input.limit,filters=input.filters===undefined?[]:input.filters;
 if(!Number.isSafeInteger(limit) || limit<1 || limit>100 ||
  (input.kind!==undefined && !['UNIVERSE','ARC','WORK','SEASON','EPISODE'].includes(input.kind)) ||
  (input.after!==undefined && !uuid(input.after)) || (input.parentId!==undefined && !uuid(input.parentId)) ||
  (input.query!==undefined && (typeof input.query!=='string' || input.query.length>256 || input.query.includes('\0'))) ||
  !Array.isArray(filters) || filters.length>20)throw new Error('Invalid own content page');
 const groups=new Map<string,OwnContentFilter[]>();
 for(const f of filters) {
  if(!f || !text(f.sourceKey,200) || typeof f.field!=='string' || !/^[a-zA-Z0-9_.:-]{1,100}$/.test(f.field) ||
   !(f.type==='string' ? f.op==='eq' && typeof f.value==='string' && f.value.length<=100000 && !f.value.includes('\0') :
    f.type==='boolean' ? f.op==='eq' && typeof f.value==='boolean' :
    f.type==='null' ? f.op==='eq' && f.value===null :
    f.type==='string-list' ? f.op==='contains' && text(f.value,10000) :
    ['number','instant'].includes(f.type) && ['eq','gte','lte'].includes(f.op) && typeof f.value==='number' && Number.isFinite(f.value) &&
     (f.type!=='instant' || (Number.isSafeInteger(f.value) && f.value>=0 && f.value<=8640000000000000))))throw new Error('Invalid own content filter');
  groups.set(f.sourceKey,[...(groups.get(f.sourceKey)??[]),f]);
 }
 const args:unknown[]=[];
 const bind=(value:unknown)=>{args.push(value);return `$${args.length}`;};
 const clauses=["e.visibility='public'","e.kind IN ('UNIVERSE','ARC','WORK','SEASON','EPISODE')"];
 let accountJoin='';
 if(account) {
  const selection=account.input;
  if(!text(account.owner,256) || (selection.status!==undefined && !['watching','plan_to_watch','completed','dropped','on_hold'].includes(selection.status)) ||
   (selection.favorite!==undefined && typeof selection.favorite!=='boolean') || (selection.completed!==undefined && typeof selection.completed!=='boolean'))
   throw new Error('Invalid own account content');
  accountJoin=`JOIN (SELECT DISTINCT ON(s.canonical_entity_id) s.*,floor(extract(epoch FROM s.updated_at)*1000)::double precision AS "_updatedAt"
   FROM user_entity_status s JOIN users u ON u.id=s.user_id WHERE s.user_id=${bind(account.owner)} AND s.canonical_entity_id IS NOT NULL
   AND (s.entity_type<>'SERIES' OR s.release_entity_id IS NULL)
   ORDER BY s.canonical_entity_id,COALESCE(s.updated_at,TIMESTAMPTZ 'epoch') DESC,s.id DESC) activity
   ON activity.canonical_entity_id=e.id AND activity.entity_type=CASE WHEN e.kind='WORK' THEN 'SERIES' ELSE e.kind END`;
  if(selection.status!==undefined)clauses.push(`activity.status=${bind(selection.status)}`);
  if(selection.favorite!==undefined)clauses.push(`activity.is_favorite=${bind(selection.favorite)}`);
  if(selection.completed!==undefined)clauses.push(`activity.completed=${bind(selection.completed)}`);
 }
 if(input.kind!==undefined)clauses.push(`e.kind=${bind(input.kind)}`);
 if(input.after!==undefined)clauses.push(`e.id>${bind(input.after.toLowerCase())}`);
 if(input.parentId!==undefined) {
  const parent=bind(input.parentId.toLowerCase());
  clauses.push(`EXISTS(SELECT 1 FROM canonical_entities p WHERE p.id=${parent} AND p.visibility='public' AND (
   EXISTS(SELECT 1 FROM canonical_memberships m WHERE m.parent_id=p.id AND m.child_id=e.id) OR
   EXISTS(SELECT 1 FROM canonical_arcs a WHERE a.universe_id=p.id AND a.arc_id=e.id) OR
   EXISTS(SELECT 1 FROM canonical_arc_episodes a WHERE a.arc_id=p.id AND a.episode_id=e.id)))`);
 }
 const currentJoin='canonical_content_fact_heads h JOIN canonical_content_facts f USING(entity_id,alias_id,source_key,field,observed_at)';
 for(const [source,group] of groups) {
  const sourceParam=bind(source);
  const matches=group.map(f=>{
   const field=bind(f.field),type=bind(f.type);
   let predicate:string;
   if(f.op==='contains')predicate=`f.value ? ${bind(f.value)}::text`;
   else if(f.op==='eq')predicate=`f.value=${bind(JSON.stringify(f.value))}::jsonb`;
   else predicate=`CASE WHEN f.value_type IN ('number','instant') THEN f.value::text::numeric END ${f.op==='gte'?'>=':'<='} ${bind(f.value)}::numeric`;
   return `EXISTS(SELECT 1 FROM ${currentJoin} WHERE h.entity_id=e.id AND h.alias_id=a.id AND h.source_key=${sourceParam}
    AND h.field=${field} AND f.value_type=${type} AND ${predicate})`;
  });
  clauses.push(`EXISTS(SELECT 1 FROM canonical_aliases a WHERE a.entity_id=e.id AND a.state='active' AND ${matches.join(' AND ')})`);
 }
 if(input.query?.length) {
  const pattern=bind('%'+input.query.replace(/[\\%_]/g,'\\$&')+'%');
  clauses.push(`(EXISTS(SELECT 1 FROM canonical_text_variants t WHERE t.entity_id=e.id AND t.value ILIKE ${pattern}) OR
   EXISTS(SELECT 1 FROM ${currentJoin} JOIN canonical_aliases a ON a.id=h.alias_id AND a.state='active'
    WHERE h.entity_id=e.id AND h.field NOT LIKE 'source.%' AND (
     (f.value_type='string' AND f.value #>> '{}' ILIKE ${pattern}) OR
     (f.value_type='string-list' AND EXISTS(SELECT 1 FROM jsonb_array_elements_text(CASE WHEN f.value_type='string-list' THEN f.value ELSE '[]'::jsonb END) label
      WHERE label ILIKE ${pattern})))))`);
 }
 const size=bind(limit+1);
 const rows=(await client.query<OwnContentItem & {_accountActivity?:Record<string,unknown>}>(`WITH page AS (
  SELECT e.id,e.kind,e.revision${account?',to_jsonb(activity) AS "_accountActivity"':''} FROM canonical_entities e ${accountJoin} WHERE ${clauses.join(' AND ')} ORDER BY e.id LIMIT ${size}
 ) SELECT p.*,COALESCE((SELECT jsonb_agg(jsonb_build_object('field',t.field,'locale',t.locale,'form',t.form,'sourceKey',t.source_key,'value',t.value,'revision',t.revision)
   ORDER BY t.field,t.locale,t.form,t.source_key) FROM canonical_text_variants t WHERE t.entity_id=p.id),'[]'::jsonb) AS texts,
  COALESCE((SELECT jsonb_agg(jsonb_build_object('field',f.field,'type',f.value_type,'value',f.value,'observedAt',f.observed_at::double precision,
   'namespace',a.namespace,'externalId',a.value,'sourceKey',f.source_key) ORDER BY a.id,f.source_key,f.field)
   FROM ${currentJoin} JOIN canonical_aliases a ON a.id=h.alias_id AND a.state='active' WHERE h.entity_id=p.id),'[]'::jsonb) AS facts
  FROM page p ORDER BY p.id`,args)).rows;
 const items=rows.slice(0,limit).map(row=>{
  const {_accountActivity:activity,...content}=row;
  if(!account)return {...content,accountActivity:undefined};
  if(!activity || activity.user_id!==account.owner)throw new Error('Own account activity scope mismatch');
  if(!uuid(activity.id) || !['watching','plan_to_watch','completed','dropped','on_hold'].includes(activity.status as string) ||
    ['is_favorite','completed','contains_spoilers'].some(field=>activity[field]!==null && typeof activity[field]!=='boolean') ||
    (activity._updatedAt!==null && (typeof activity._updatedAt!=='number' || !Number.isSafeInteger(activity._updatedAt))))
   throw new Error('Invalid stored own account activity');
  const data=readActivity(activity);
  const accountActivity:OwnAccountActivity={id:activity.id as string,status:activity.status as OwnAccountStatus|null,
   favorite:activity.is_favorite as boolean|null,completed:activity.completed as boolean|null,containsSpoilers:activity.contains_spoilers as boolean|null,
   updatedAt:activity._updatedAt as number|null,watchedSeconds:data.watched_seconds,totalSeconds:data.total_seconds,
   userScore:data.user_score,externalSourceScore:data.external_source_score,opinion:data.user_opinion,audioTrack:data.audio_track_used,subtitleTrack:data.subtitle_track_used};
  return {...content,accountActivity};
 }),hasMore=rows.length>limit;
 return {items,hasMore,nextCursor:hasMore?items[items.length-1].id:null};
}

export async function readOwnContentPage(client:PoolClient,input:OwnContentPageInput) {
 const page=await readContentPage(client,input);
 return {...page,items:page.items.map(({accountActivity,...content})=>content)};
}

/** Internal account reader: authenticatedOwner must come from the trusted session, never a browser-supplied owner. */
export async function readOwnAccountContentPage(client:PoolClient,authenticatedOwner:string,input:OwnAccountContentInput) {
 const page=await readContentPage(client,input,{owner:authenticatedOwner,input});
 return {...page,items:page.items.map(row=>({...row,accountActivity:row.accountActivity!}))};
}
