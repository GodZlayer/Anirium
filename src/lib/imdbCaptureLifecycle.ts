import {mkdir,lstat,readdir,readFile,writeFile,unlink,rmdir} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve,dirname} from 'node:path';
export const imdbCaptureRoot=join(tmpdir(),'anirium-imdb-captures-v1');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
interface Lease {kind:'anirium-imdb-capture-v1';id:string;pid:number;createdAt:number}
async function rootDirectory(root:string) {
 const absolute=resolve(root);await mkdir(absolute,{recursive:true,mode:0o700});
 const info=await lstat(absolute);if(!info.isDirectory() || info.isSymbolicLink())throw new Error('Invalid IMDb capture root');
 return absolute;
}
async function leaseAt(root:string,id:string) {
 if(!uuid.test(id))return null;
 const directory=resolve(root,id);if(dirname(directory)!==root)return null;
 try {
  const info=await lstat(directory);if(!info.isDirectory() || info.isSymbolicLink())return null;
  const names=await readdir(directory);
  if(!names.includes('lease.json') || names.some(name=>!['lease.json','batches.jsonl'].includes(name)))return null;
  for(const name of names){const child=await lstat(join(directory,name));if(!child.isFile() || child.isSymbolicLink() || (name==='lease.json' && child.size>1024))return null;}
  const bytes=await readFile(join(directory,'lease.json'));if(bytes.length>1024)return null;
  const lease=JSON.parse(bytes.toString('utf8')) as Lease;
  if(Object.keys(lease).sort().join(',')!=='createdAt,id,kind,pid' || lease.kind!=='anirium-imdb-capture-v1' || lease.id!==id ||
   !Number.isSafeInteger(lease.pid) || lease.pid<1 || !Number.isSafeInteger(lease.createdAt) || lease.createdAt<0)return null;
  return {directory,names,lease,bytes,info};
 }catch{return null;}
}
function dead(pid:number) {
 try{process.kill(pid,0);return false;}
 catch(error){return (error as NodeJS.ErrnoException).code==='ESRCH';}
}
/** Conservative cleanup: live/reused PID, uncertain status, symlinks and unknown contents are preserved. */
export async function cleanupAbandonedImdbCaptures(root=imdbCaptureRoot) {
 const absolute=await rootDirectory(root);let removed=0;
 for(const id of await readdir(absolute)) {
  const first=await leaseAt(absolute,id);if(!first || !dead(first.lease.pid))continue;
  const current=await leaseAt(absolute,id);
  if(!current || !current.bytes.equals(first.bytes) || current.info.ino!==first.info.ino || current.info.dev!==first.info.dev || !dead(current.lease.pid))continue;
  try {
   // Only named regular files are removed; no recursive traversal or foreign data deletion.
   for(const name of current.names)await unlink(join(current.directory,name));
   await rmdir(current.directory);removed++;
  }catch{/* A concurrently changed or inaccessible entry is not forcefully removed. */}
 }
 return {removed};
}
export async function createImdbCaptureDirectory(root=imdbCaptureRoot) {
 if(!Number.isSafeInteger(process.pid) || process.pid<1)throw new Error('Invalid IMDb capture process');
 const absolute=await rootDirectory(root);await cleanupAbandonedImdbCaptures(absolute);
 const id=randomUUID(),directory=resolve(absolute,id);
 if(dirname(directory)!==absolute)throw new Error('Invalid IMDb capture path');
 await mkdir(directory,{mode:0o700});
 const lease:Lease={kind:'anirium-imdb-capture-v1',id,pid:process.pid,createdAt:Date.now()};
 await writeFile(join(directory,'lease.json'),JSON.stringify(lease),{flag:'wx',mode:0o600});
 return directory;
}
export async function releaseImdbCaptureDirectory(directory:string) {
 const absolute=resolve(directory),root=dirname(absolute),id=absolute.slice(root.length+1);
 const entry=await leaseAt(root,id);
 if(!entry || entry.lease.pid!==process.pid)throw new Error('IMDb capture ownership unavailable');
 for(const name of entry.names)await unlink(join(absolute,name));
 await rmdir(absolute);
}
