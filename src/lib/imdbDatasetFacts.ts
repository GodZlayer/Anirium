import type { PoolClient } from 'pg';
import { recordContentFacts,type ContentFact } from './contentFacts';
import { parseImdbBasicsRow,parseImdbRatingRow } from './imdbDatasetRows';

/** Internal import primitive: caller verifies file provenance and owns the SQL transaction. No identity inference. */
export async function recordImdbDatasetRow(client:PoolClient,entityId:string,dataset:'basics'|'ratings',line:string,observedAt:number) {
 if(!['basics','ratings'].includes(dataset) || typeof entityId!=='string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(entityId) ||
   !Number.isSafeInteger(observedAt) || observedAt<0 || observedAt>8640000000000000)throw new Error('Invalid IMDb observation');
 const {titleId,facts}=buildImdbDatasetFacts(dataset,line);
 const sourceKey=`imdb:dataset:${dataset}`;
 await recordContentFacts(client,entityId,{namespace:'imdb:title',externalId:titleId,sourceKey,observedAt},facts);
 return {entityId,titleId,sourceKey,observedAt,fieldCount:facts.length};
}

/** Expected typed observations from one validated source row; shared by writer and item proof construction. */
export function buildImdbDatasetFacts(dataset:'basics'|'ratings',line:string) {
 if(!['basics','ratings'].includes(dataset))throw new Error('Invalid IMDb dataset');
 const facts:ContentFact[]=[];
 const add=(field:string,type:ContentFact['type'],value:unknown)=>{
  facts.push(value===null?{field,type:'null',value:null}:{field,type,value} as ContentFact);
 };
 let titleId:string;
 if(dataset==='basics') {
  const row=parseImdbBasicsRow(line);titleId=row.titleId;
  add('media.titleType','string',row.titleType);add('media.primaryTitle','string',row.primaryTitle);add('media.originalTitle','string',row.originalTitle);
  add('media.isAdult','boolean',row.isAdult);add('media.startYear','number',row.startYear);add('media.endYear','number',row.endYear);
  add('media.durationMinutes','number',row.runtimeMinutes);add('media.genres','string-list',row.genres);
 } else {
  const row=parseImdbRatingRow(line);titleId=row.titleId;
  add('media.averageRating','number',row.averageRating);add('media.numVotes','number',row.numVotes);
 }
 add('source.id','string',titleId);
 return {titleId,facts};
}
