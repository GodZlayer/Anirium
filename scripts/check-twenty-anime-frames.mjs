import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile), directory=path.resolve('storage/app/catalog/probes/twenty-anime');
const playback=JSON.parse(fs.readFileSync(path.join(directory,'playback.json'))), frames=[];
const retryFile=path.join(directory,'playback-retry.json');
const retries=fs.existsSync(retryFile)?JSON.parse(fs.readFileSync(retryFile)).results:[];
const verificationFile=path.join(directory,'playback-verification.json');
if(fs.existsSync(verificationFile))retries.push(...JSON.parse(fs.readFileSync(verificationFile)).results);
for(const item of [...playback.results,...retries].filter(item=>item.image)) {
  const {stdout}=await run('ffmpeg',['-v','error','-i',path.join(directory,item.frame),'-vf','scale=32:32,format=gray','-frames:v','1','-f','rawvideo','pipe:1'],{encoding:'buffer',windowsHide:true,timeout:10000});
  const pixels=[...stdout], mean=pixels.reduce((a,b)=>a+b,0)/pixels.length;
  const fraction=pixels.filter(value=>value>24).length/pixels.length;
  const deviation=Math.sqrt(pixels.reduce((a,b)=>a+(b-mean)**2,0)/pixels.length);
  frames.push({id:item.id,frame:item.frame,validDecode:pixels.length===1024,nonBlackFraction:Number(fraction.toFixed(3)),standardDeviation:Number(deviation.toFixed(2)),visibleImage:deviation>1.5});
}
fs.writeFileSync(path.join(directory,'frames.json'),JSON.stringify({checkedAt:new Date().toISOString(),frames},null,2));
console.log(JSON.stringify({checked:frames.length,visible:frames.filter(frame=>frame.visibleImage).length,works:new Set(frames.filter(frame=>frame.visibleImage).map(frame=>frame.id)).size}));
