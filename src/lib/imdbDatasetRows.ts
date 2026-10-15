export const imdbDatasetHeaders={
 basics:'tconst\ttitleType\tprimaryTitle\toriginalTitle\tisAdult\tstartYear\tendYear\truntimeMinutes\tgenres',
 ratings:'tconst\taverageRating\tnumVotes',
 episode:'tconst\tparentTconst\tseasonNumber\tepisodeNumber'
} as const;
const missing='\\N';
function columns(line:string,count:number) {
 if(typeof line!=='string' || line.length>1048576 || /[\0\r\n]/.test(line))throw new Error('Invalid IMDb row');
 const values=line.split('\t');if(values.length!==count)throw new Error('Invalid IMDb columns');return values;
}
function id(value:string) {if(!/^tt[0-9]{7,12}$/.test(value))throw new Error('Invalid IMDb title ID');return value;}
function text(value:string) {if(!value || value===missing)throw new Error('Invalid IMDb required text');return value;}
function integer(value:string,max:number,nullable=true):number|null {
 if(nullable && value===missing)return null;
 if(!/^(0|[1-9][0-9]*)$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value)>max)throw new Error('Invalid IMDb integer');
 return Number(value);
}
export function parseImdbBasicsRow(line:string) {
 const [titleId,titleType,primaryTitle,originalTitle,adult,start,end,runtime,genres]=columns(line,9);
 if(!['0','1',missing].includes(adult))throw new Error('Invalid IMDb boolean');
 const genreList=genres===missing?null:genres.split(',');
 if(genreList && (genreList.length>3 || genreList.some(value=>!value.trim())))throw new Error('Invalid IMDb genres');
 return {titleId:id(titleId),titleType:text(titleType),primaryTitle:text(primaryTitle),originalTitle:text(originalTitle),
  isAdult:adult===missing?null:adult==='1',startYear:integer(start,9999),endYear:integer(end,9999),runtimeMinutes:integer(runtime,2147483647),genres:genreList};
}
export function parseImdbRatingRow(line:string) {
 const [titleId,rating,votes]=columns(line,3);
 if(!/^(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(rating) || !Number.isFinite(Number(rating)) || Number(rating)>10)throw new Error('Invalid IMDb rating');
 return {titleId:id(titleId),averageRating:Number(rating),numVotes:integer(votes,Number.MAX_SAFE_INTEGER,false)!};
}
export function parseImdbEpisodeRow(line:string) {
 const [titleId,parentTitleId,season,episode]=columns(line,4);
 if(titleId===parentTitleId)throw new Error('Invalid IMDb episode parent');
 return {titleId:id(titleId),parentTitleId:id(parentTitleId),seasonNumber:integer(season,2147483647),episodeNumber:integer(episode,2147483647)};
}
