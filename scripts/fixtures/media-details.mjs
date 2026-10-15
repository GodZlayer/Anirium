// Complete controlled source fields; never used as a fallback by operational ingestion.
export function mediaDetailsFixture() {
 return {description:'Descrição própria 日本語',genres:['Adventure','Sci-Fi'],synonyms:['Outro nome','別名'],duration:0,isAdult:false,isLicensed:true,
  season:'FALL',seasonYear:2026,source:'ORIGINAL',updatedAt:0,hashtag:null,siteUrl:'https://anilist.co/anime/980001/',
  bannerImage:'https://example.invalid/banner.webp',coverImage:{extraLarge:'https://example.invalid/cover.webp',large:null,medium:null,color:'#123abc'},
  startDate:{year:2026,month:10,day:null},endDate:{year:null,month:null,day:null}};
}
