import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const loaded=new Map();
function load(name){if(loaded.has(name))return loaded.get(name);const exports={};loaded.set(name,exports);vm.runInNewContext(ts.transpileModule(fs.readFileSync(`src/lib/${name}.ts`,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='./contentFacts'?{recordContentFacts(){throw new Error('Pure fact contract must not access storage');}}:load(n.slice(2))});return exports;}
const build=load('imdbDatasetFacts').buildImdbDatasetFacts;
const facts=build('basics','tt1234567\ttvSeries\t日本語\tOriginal\t0\t2026\t\\N\t0\tDrama,Animation').facts;
assert.equal(facts.length,9);assert.equal(new Set(facts.map(f=>f.field)).size,9);
assert.equal(facts.find(f=>f.field==='media.isAdult').value,false);
assert.equal(facts.find(f=>f.field==='media.durationMinutes').value,0);
assert.equal(facts.find(f=>f.field==='media.endYear').type,'null');
assert.equal(facts.find(f=>f.field==='media.genres').type,'string-list');
assert.equal(facts.find(f=>f.field==='source.id').value,'tt1234567');
const ratings=build('ratings','tt1234567\t0.0\t0');assert.equal(ratings.facts.length,3);assert.equal(ratings.facts.find(f=>f.field==='media.averageRating').value,0);
assert.throws(()=>build('unknown','tt1234567\t1\t1'));
assert.throws(()=>build('ratings','tt1234567\t11\t1'));
console.log('IMDb expected typed fact contract: pure storage-free mapping, unique complete fields, Unicode/false/zero/null/lists and invalid source rejection passed.');
