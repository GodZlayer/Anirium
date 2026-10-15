import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=ts.createSourceFile('catalog.ts',fs.readFileSync('src/lib/catalog.ts','utf8'),ts.ScriptTarget.Latest,true);
for(const name of ['getLatestAiredEpisodes','getAiringSchedule']) {
  const fn=source.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text===name);
  for(const payload of [{},{data:{Page:{}}},{data:{Page:{airingSchedules:'bad'}}}]) {
    let persisted=0,errors=0;
    const context={exports:{},Date,JSON,ANILIST_URL:'https://fixture.invalid',MEDIA_FIELDS:'',
      centralizedFetch:async()=>payload,ensurePostgresSchema:async()=>{},query:async()=>[],
      persistFetchedAniListAirings:async()=>{persisted++;},logServerFailure:()=>{errors++;}};
    vm.runInNewContext(ts.transpileModule(fn.getText(source),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,context);
    assert.equal((await context.exports[name]()).length,0);
    assert.equal(errors,1,'invalid source response is observed as failure');
    assert.equal(persisted,0,'invalid source response never advances ingestion');
  }
}
console.log('PASS: native schedule/latest reject malformed upstream responses before persistence/checkpoint.');
