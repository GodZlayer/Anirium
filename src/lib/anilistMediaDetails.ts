import type { ContentFact } from './contentFacts';

export interface AniListMediaDetails {
 description:string|null;genres:string[]|null;synonyms:string[]|null;duration:number|null;
 isAdult:boolean|null;isLicensed:boolean|null;season:string|null;seasonYear:number|null;source:string|null;
 updatedAt:number|null;hashtag:string|null;siteUrl:string|null;bannerImage:string|null;
 coverImage:{extraLarge:string|null;large:string|null;medium:string|null;color:string|null}|null;
 startDate:{year:number|null;month:number|null;day:number|null}|null;
 endDate:{year:number|null;month:number|null;day:number|null}|null;
}

export const anilistDetailFields=[
 'media.description','media.genres','media.synonyms','media.durationMinutes','media.isAdult','media.isLicensed',
 'media.season','media.seasonYear','media.source','media.sourceUpdatedAt','media.hashtag','media.siteUrl',
 'media.bannerImage','media.cover.extraLarge','media.cover.large','media.cover.medium','media.cover.color',
 'media.startDate.year','media.startDate.month','media.startDate.day',
 'media.endDate.year','media.endDate.month','media.endDate.day',
] as const;
export const anilistObservationFields=[
 'media.episodes','media.averageScore','media.status','media.format','media.countryOfOrigin','media.idMal',
 'title.romaji','title.english','title.native','source.topology.snapshot','source.topology.sha256',...anilistDetailFields,
];
const nullableInteger=(v:unknown,min:number,max:number)=>v===null || (typeof v==='number' && Number.isSafeInteger(v) && v>=min && v<=max);
const nullableString=(v:unknown,max:number)=>v===null || (typeof v==='string' && v.length<=max && !v.includes('\0'));
const nullableList=(v:unknown)=>v===null || (Array.isArray(v) && v.length<=1000 && v.every(s=>typeof s==='string' && !!s.trim() && s.length<=10000 && !s.includes('\0')));
export function validHttpsReference(v:unknown) {
 if(v===null)return true;
 if(typeof v!=='string' || v.length>4096 || !/^https:\/\/[A-Za-z0-9.-]+([/?#][^\s]*)?$/.test(v))return false;
 try {const u=new URL(v);return !!u.hostname && u.protocol==='https:' && !u.username && !u.password && !u.port;}catch{return false;}
}
function partialDate(v:any) {
 if(v===null)return true;
 if(!v || !nullableInteger(v.year,1,9999) || !nullableInteger(v.month,1,12) || !nullableInteger(v.day,1,31))return false;
 if(v.month!==null && v.day!==null) {
  const year=v.year??2000,days=[31,(year%4===0 && (year%100!==0 || year%400===0))?29:28,31,30,31,30,31,31,30,31,30,31];
  return v.day<=days[v.month-1];
 }
 return true;
}
/** Partial dates stay partial; source epoch seconds are explicitly converted to milliseconds. */
export function aniListMediaDetailFacts(media:any):ContentFact[] {
 if(!media || !nullableString(media.description,100000) || !nullableList(media.genres) || !nullableList(media.synonyms) ||
  !nullableInteger(media.duration,0,2147483647) || ![media.isAdult,media.isLicensed].every(v=>v===null || typeof v==='boolean') ||
  !nullableString(media.season,40) || !nullableInteger(media.seasonYear,1,9999) || !nullableString(media.source,80) ||
  !nullableInteger(media.updatedAt,0,2147483647) || !nullableString(media.hashtag,10000) || !validHttpsReference(media.siteUrl) ||
  !validHttpsReference(media.bannerImage) || !partialDate(media.startDate) || !partialDate(media.endDate) ||
  !(media.coverImage===null || (media.coverImage && ['extraLarge','large','medium'].every(k=>validHttpsReference(media.coverImage[k])) &&
    (media.coverImage.color===null || (typeof media.coverImage.color==='string' && /^#([a-fA-F0-9]{3}|[a-fA-F0-9]{6})$/.test(media.coverImage.color))))))
  throw new Error('Invalid AniList media details');
 const result:ContentFact[]=[];
 const add=(field:string,value:any,type:ContentFact['type'])=>result.push(value===null?{field,type:'null',value:null}:{field,type,value} as ContentFact);
 add('media.description',media.description,'string');add('media.genres',media.genres,'string-list');add('media.synonyms',media.synonyms,'string-list');
 add('media.durationMinutes',media.duration,'number');add('media.isAdult',media.isAdult,'boolean');add('media.isLicensed',media.isLicensed,'boolean');
 add('media.season',media.season,'string');add('media.seasonYear',media.seasonYear,'number');add('media.source',media.source,'string');
 add('media.sourceUpdatedAt',media.updatedAt===null?null:media.updatedAt*1000,'instant');add('media.hashtag',media.hashtag,'string');
 add('media.siteUrl',media.siteUrl,'string');add('media.bannerImage',media.bannerImage,'string');
 for(const key of ['extraLarge','large','medium','color'])add(`media.cover.${key}`,media.coverImage===null?null:media.coverImage[key],'string');
 for(const name of ['startDate','endDate'])for(const component of ['year','month','day'])
  add(`media.${name}.${component}`,media[name]===null?null:media[name][component],'number');
 return result;
}
