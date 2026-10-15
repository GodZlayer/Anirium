import fs from 'node:fs';
import {projectTypescript} from './lib/project-typescript.mjs';
const runtime=projectTypescript();
try {
 const args=process.argv.slice(2);
 if(args.length!==2 || args[0]!=='--input')throw new Error('invalid_arguments');
 const bytes=fs.readFileSync(args[1]);
 if(bytes.length>65536)throw new Error('invalid_arguments');
 const input=JSON.parse(bytes.toString('utf8'));
 const keys=['path','dataset','compression','observedAt','expectedManifest','maxBatches'];
 if(!input || typeof input!=='object' || Array.isArray(input) || Object.keys(input).some(key=>!keys.includes(key)))throw new Error('invalid_arguments');
 if(fs.existsSync('.env'))process.loadEnvFile('.env');
 process.env.NODE_ENV='production';
 const db=runtime.load('src/lib/postgres.ts'),executor=runtime.load('src/lib/imdbDatasetExecution.ts');
 await db.ensurePostgresSchema();
 const result=await executor.executeImdbDatasetFile(input);
 console.log(JSON.stringify({status:'committed',...result}));
} catch(error) {
 const code=error.message==='Database configuration unavailable'?'database_configuration_unavailable':
  error.message==='invalid_arguments' || error.message==='Invalid IMDb execution input'?'invalid_arguments':
  error.message==='IMDb execution file identity changed'?'file_identity_changed':'imdb_import_failed';
 console.error(JSON.stringify({status:'failed',code}));process.exitCode=1;
}finally{await runtime.close();}
