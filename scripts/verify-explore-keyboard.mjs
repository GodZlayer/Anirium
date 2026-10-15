import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const source=fs.readFileSync('src/app/page.tsx','utf8');
const tree=ts.createSourceFile('page.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
let card;
function visit(node){
 if(ts.isJsxOpeningElement(node)){
  const attrs=node.attributes.properties;
  if(attrs.some(a=>ts.isJsxAttribute(a)&&a.name.getText(tree)==='aria-label'&&a.initializer?.getText(tree)==='{`Abrir ${title}`}'))card=node;
 }
 ts.forEachChild(node,visit);
}
visit(tree);assert.ok(card);
const attrs=card.attributes.properties;
const attr=name=>attrs.find(a=>ts.isJsxAttribute(a)&&a.name.getText(tree)===name);
assert.equal(attr('role').initializer.text,'button');
assert.equal(attr('tabIndex').initializer.expression.getText(tree),'0');
assert.ok(attr('className').initializer.text.includes('focus-visible:outline'));
let selected=[], prevented=0;const anime={mal_id:99};
const handler=vm.runInNewContext(ts.transpileModule('('+attr('onKeyDown').initializer.expression.getText(tree)+')',{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{setSelectedAnime:value=>selected.push(value),anime});
for(const key of ['Enter',' '])handler({key,preventDefault:()=>prevented++});
assert.deepEqual(selected,[anime,anime]);assert.equal(prevented,2);
handler({key:'ArrowRight',preventDefault:()=>prevented++});assert.equal(selected.length,2);assert.equal(prevented,2);
assert.ok(source.includes('aria-label="Página anterior do catálogo"'));
assert.ok(source.includes('aria-label="Próxima página do catálogo"'));
assert.ok(fs.readFileSync('src/components/Navbar.tsx','utf8').includes('aria-label="Buscar obra ou franquia"'));
console.log('Actual Explore card keyboard handler activates the same anime on Enter/Space, ignores unrelated keys; role, tab stop, focus outline, search and pagination names present. Browser focus/dialog acceptance still pending.');
