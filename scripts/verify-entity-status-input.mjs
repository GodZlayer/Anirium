import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync('src/lib/apiInput.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {validateEntityStatusInput,validateCanonicalEntityStatusInput}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
const valid={entityType:'EPISODE',entityId:'1:s0:e1',parentSeriesId:1,seasonIdx:0,episodeNumber:1,status:'watching',userScore:8.5,externalScore:9,userOpinion:'private opinion',containsSpoilers:false};
assert.equal(validateEntityStatusInput(valid),valid);
for(const [field,values] of Object.entries({entityType:['episode',{},null],entityId:['',' ',null,{},'a'.repeat(101),'id\0'],parentSeriesId:[0,'1',1.5],seasonIdx:[-1,'0',false],episodeNumber:[0,NaN,2147483648],status:['unknown',{},false],userScore:['8',Infinity,-1,10.1],externalScore:[{},NaN],userOpinion:[{},false,'a'.repeat(16001)],containsSpoilers:['false',0,{}]})) {
  for(const value of values) assert.throws(()=>validateEntityStatusInput({...valid,[field]:value}),error=>error.status===400&&error.reason==='invalid_entity_status');
}
for(const type of ['UNIVERSE','SERIES','SEASON','EPISODE']) validateEntityStatusInput({entityType:type,entityId:'id'});
validateEntityStatusInput({...valid,userScore:0,externalScore:10,userOpinion:'a'.repeat(16000)});
console.log('Actual entity status validator: entity/status enums, IDs, numeric metadata, scores, opinion size and boolean spoiler types passed.');

const canonical={...valid,entityId:"11111111-1111-4111-8111-111111111111"};
assert.equal(validateCanonicalEntityStatusInput(canonical),canonical);
for(const entityId of ["1:s0:e1","1","id"]) assert.throws(()=>validateCanonicalEntityStatusInput({...canonical,entityId}),e=>e.status===400);
console.log("Current public entity contract: UUID accepted, old coordinates/numeric identifiers rejected.");
