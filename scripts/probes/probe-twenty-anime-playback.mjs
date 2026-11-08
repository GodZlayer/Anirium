import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const option=name=>process.argv.find(value=>value.startsWith('--'+name+'='))?.slice(name.length+3);
const run=promisify(execFile), output=path.resolve(option('output')||'storage/app/catalog/probes/twenty-anime');
fs.mkdirSync(output,{recursive:true});
const docker='C:/Program Files/Docker/Docker/resources/bin/docker.exe';
const base='http://127.0.0.1:4004';
const plan=JSON.parse(fs.readFileSync(option('plan')||path.join(output,'catalog.json')));
const selectedIDs=process.argv.find(value=>value.startsWith('--ids='))?.slice(6).split(',').map(Number);
const resultFile=selectedIDs?(process.argv.includes('--verification')?'playback-verification.json':'playback-retry.json'):'playback.json';
const results=[];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const save=()=>fs.writeFileSync(path.join(output,resultFile),JSON.stringify({observedAt:new Date().toISOString(),generation:plan.generation,mode:'real native Service plus FFmpeg image decode; browser UI checked separately',results},null,2));
async function session(){const {stdout}=await run(docker,['exec','anirium_app','php','storage/app/catalog/probes/twenty-anime/session.php'],{timeout:90000,windowsHide:true});return JSON.parse(stdout);}
for(const item of selectedIDs?selectedIDs.map(id=>plan.results.find(item=>item.id===id)).filter(Boolean):plan.results){
  const proof={id:item.id,title:item.title,group:item.group,episode:item.launchTarget||1,state:'starting',image:false};
  results.push(proof);save();
  if(item.group==='futuro'){proof.state='not-attempted-unreleased';save();console.log(JSON.stringify(proof));continue;}
  console.log(JSON.stringify({id:item.id,title:item.title,state:'testing',episode:proof.episode}));
  const started=Date.now(); let deadline=started+300000;
  let credential;
  let renewalTimer=null;
  const request=async(route,options={})=>{
    const response=await fetch(base+route,{...options,headers:{Authorization:'Bearer '+credential.token,'X-Anirium-Device':credential.deviceId,...options.headers},signal:AbortSignal.timeout(Math.max(1000,Math.min(60000,deadline-Date.now())))});
    if(!response.ok)throw Error('http-'+response.status);
    return response.json();
  };
  try{
    credential=await session();
    deadline=Date.now()+240000;
    proof.phase='providers';save();
    const prepare=await request('/playback/prepare',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:credential.token,deviceId:credential.deviceId,title:item.title,season:1,episode:proof.episode,malId:item.id,episodeCount:item.total||0,format:item.format||(item.group==='recente-completo'&&item.total===1?'MOVIE':'TV')})});
    proof.sources=prepare.sources;
    if(!prepare.playbackTicket)throw Error(prepare.status==='no-sources'?'no-sources':'no-ticket');
    const ticket=encodeURIComponent(prepare.playbackTicket);
    if(selectedIDs)renewalTimer=setInterval(async()=>{try{credential=await session();await request('/playback/renew',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({playbackTicket:prepare.playbackTicket,token:credential.token,deviceId:credential.deviceId})});}catch{proof.renewalFailed=true;}},120000);
    proof.phase='inventory';save();
    let manifest;
    while(Date.now()<deadline){manifest=await request('/manifest');if(manifest.windowOnDemand&&manifest.qualities?.length)break;await delay(2000);}
    if(!manifest?.windowOnDemand||!manifest.qualities?.length)throw Error('inventory-timeout');
    proof.quality=manifest.qualities.includes('720p')?'720p':manifest.qualities.at(-1);
    proof.phase='window';save();
    if(selectedIDs)deadline=Date.now()+300000;
    const audio=manifest.audioChoices?.includes('jpn')?'jpn':manifest.audioChoices?.[0]||manifest.audios?.[0]||'';
    let state=await request('/playback/session?playbackTicket='+ticket,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'seek',quality:proof.quality,audio,subtitle:'',position:0,playing:false,bufferSeconds:30})});
    while(state.window?.status==='preparing'&&Date.now()<deadline){await delay(1500);state=await request('/playback/session?playbackTicket='+ticket);}
    if(state.window?.status!=='ready')throw Error('window-'+(state.window?.status||'timeout'));
    proof.episodeDuration=state.window.episodeDuration;
    if(selectedIDs){const stats=await request('/stats');proof.activeMediaTitles=[...new Set((stats.activeSessions||[]).map(item=>item.title).filter(value=>typeof value==='string'&&!/https?:|magnet:|token=|key=|ticket=/i.test(value)).map(value=>value.slice(0,160)))].slice(0,5);}
    proof.phase='decode';save();
    const source=new URL(state.window.playlistUrl,base);source.searchParams.set('playbackTicket',prepare.playbackTicket);
    const frame=path.join(output,item.id+'.jpg');
    await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-rw_timeout','15000000','-i',source.href,'-ss',selectedIDs?'20':'2','-frames:v','1','-vf','scale=480:-2',frame],{timeout:30000,windowsHide:true,maxBuffer:65536});
    const bytes=fs.readFileSync(frame);if(bytes.length<100||bytes[0]!==255||bytes[1]!==216)throw Error('invalid-frame');
    proof.image=true;proof.frame=item.id+'.jpg';proof.bytes=bytes.length;proof.state='decoded-frame';delete proof.phase;
    if(selectedIDs){proof.additionalFrames=[];for(const second of [10,20]){const extra=path.join(output,item.id+'-'+second+'.jpg');await run('ffmpeg',['-hide_banner','-loglevel','error','-y','-rw_timeout','15000000','-i',source.href,'-ss',String(second),'-frames:v','1','-vf','scale=480:-2',extra],{timeout:30000,windowsHide:true,maxBuffer:65536});if(fs.existsSync(extra))proof.additionalFrames.push({second,file:path.basename(extra),bytes:fs.statSync(extra).size});}}
  }catch(error){proof.state=error.message?.match(/^(http-\d+|no-sources|no-ticket|inventory-timeout|window-[a-z]+|invalid-frame)$/)?.[0]||'failed-or-timeout';}
  finally{if(renewalTimer)clearInterval(renewalTimer);}
  proof.seconds=Math.round((Date.now()-started)/1000);save();console.log(JSON.stringify(proof));
}
