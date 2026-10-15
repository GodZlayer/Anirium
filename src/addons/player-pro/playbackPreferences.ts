const aliases: Record<string,string> = { 'Japonês (Original)':'jpn','Português (Brasil)':'por',English:'eng',ja:'jpn',jpn:'jpn',pt:'por','pt-BR':'por',por:'por',en:'eng',eng:'eng' };
function matching(available:string[], preference?:string){const wanted=preference ? aliases[preference] : undefined;return wanted ? available.find(item=>(aliases[item] ?? item)===wanted) : undefined;}
export function preferredAudio(available:string[], preference?:string){return matching(available,preference) ?? matching(available,'jpn') ?? available[0] ?? '';}
export function preferredSubtitle(available:string[], preference?:string){
 if(preference==='Desativado')return 'Desativado';
 if(!available.some(item=>item!=='Desativado'))return '';
 return matching(available,preference) ?? matching(available,'por') ?? matching(available,'eng') ?? available[0] ?? '';
}
export function nextKnownEpisode(episodes:Array<number|null|undefined>,season:number,episode:number){
 const count=episodes[season];
 if(!Number.isSafeInteger(count)||!count||count<1||!Number.isSafeInteger(episode)||episode<1||episode>count)return null;
 if(episode<count)return {episode:episode+1,season};
 const next=episodes[season+1];return Number.isSafeInteger(next)&&next!>0?{episode:1,season:season+1}:null;
}
export function shouldSkipIntro(enabled:boolean|undefined,position:number,duration:number,pending:boolean){return enabled===true&&Number.isFinite(position)&&position>=0&&position<5&&Number.isFinite(duration)&&duration>85&&!pending;}
export function finalEpisodeEnd(position:number,duration:number,windowEnd:boolean|undefined){return windowEnd===true||(Number.isFinite(position)&&Number.isFinite(duration)&&duration>0&&position>=duration-1);}
