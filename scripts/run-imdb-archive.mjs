import fs from 'node:fs';
import {projectTypescript} from './lib/project-typescript.mjs';
const runtime=projectTypescript();
try{
 const args=process.argv.slice(2);
 if(args.length!==3 || !['--prepare','--resume'].includes(args[0]) || args[1]!=='--input')throw new Error('invalid_arguments');
 if(fs.statSync(args[2]).size>65536)throw new Error('invalid_arguments');
 const input=JSON.parse(fs.readFileSync(args[2],'utf8'));
 const keys=args[0]==='--prepare'?['path','dataset','compression','observedAt','archiveRoot','expectedManifest']:['fileId','archiveRoot','maxBatches'];
 if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!keys.includes(key)))throw new Error('invalid_arguments');
 if(fs.existsSync('.env'))process.loadEnvFile('.env');process.env.NODE_ENV='production';
 const db=runtime.load('src/lib/postgres.ts'),execution=runtime.load('src/lib/imdbArchiveExecution.ts');await db.ensurePostgresSchema();
 const result=args[0]==='--prepare'?await execution.prepareImdbDatasetArchive(input):await execution.resumeImdbDatasetArchive(input);
 console.log(JSON.stringify({status:args[0]==='--prepare'?'prepared':'committed',...result}));
}catch(error){
 const code=error.message==='Database configuration unavailable'?'database_configuration_unavailable':
 error.message==='invalid_arguments' || error.message.startsWith('Invalid IMDb archive')?'invalid_arguments':
 error.message==='IMDb archive unavailable'?'archive_unavailable':
 error.message==='IMDb execution file identity changed'?'file_identity_changed':'imdb_archive_execution_failed';
 console.error(JSON.stringify({status:'failed',code}));process.exitCode=1;
}finally{await runtime.close();}
