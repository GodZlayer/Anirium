import {projectTypescript} from './lib/project-typescript.mjs';
const runtime=projectTypescript();
try {
  const source=runtime.load('src/lib/airingCollector.ts');
  const start=Math.floor(Date.now()/86400000)*86400000;
  const page=await source.fetchAniListAiringPage({start,end:start+86400000,pageSize:1,page:1},
    (url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(30000)}));
  console.log(JSON.stringify({mode:'read-only-source',status:'validated',count:page.entries.length,hasMore:page.hasMore}));
} catch(error) {
  console.error(JSON.stringify({mode:'read-only-source',status:'failed',code:error.status===429?'rate_limited':'source_probe_failed'}));
  process.exitCode=1;
} finally {await runtime.close();}
