import {projectTypescript} from './lib/project-typescript.mjs';
const runtime=projectTypescript();
try {
  const source=runtime.load('src/lib/anilistMediaIngestion.ts');
  const {media}=await source.fetchAniListMediaSnapshot(21459,(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(30000)}));
  console.log(JSON.stringify({mode:'read-only-source',status:'validated',provider:'anilist',id:media.id,relations:media.relations.edges.length}));
} catch(error) {
  console.error(JSON.stringify({mode:'read-only-source',status:'failed',code:error.status===429?'source_rate_limited':'media_contract_unverified'}));
  process.exitCode=1;
} finally {await runtime.close();}
