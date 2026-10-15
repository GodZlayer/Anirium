import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/lib/catalog.ts', 'utf8');
const contentModule={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/contentEntityInfo.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,contentModule);
const textModule={exports:{},require(name){if(name==='./contentEntityInfo')return contentModule.exports;throw new Error(name);}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/catalogTextVariants.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,textModule);
const ast = ts.createSourceFile('catalog.ts', source, ts.ScriptTarget.Latest, true);
const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node)
  && ['mapDbRowToAnime', 'searchAnimes', 'isFranchiseCorrelatedWithJevAndMal'].includes(node.name?.text));
assert.equal(functions.length, 3);
const code = ts.transpileModule(functions.map(node => node.getText(ast)).join('\n'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const rows = [
  { mal_id: 1, id_mal: 41, id_anilist: 1, canonical_entity_id:'work-fixture', composition_work_id:'group-work',composition_season_id:'release-season',composition_universe_id:'source-universe', title: 'Cowboy Bebop', episodes: 26, status: 'FINISHED', format: 'TV',
    images_json: {}, source_relations_json:[{namespace:'anilist:media',fromId:'1',fromType:'ANIME',toId:'5',toType:'ANIME',relationType:'SIDE_STORY'}], seasons_json: [{ id: 1, episodes: 26, title: 'Cowboy Bebop' }] },
  { mal_id: 5, title: 'Cowboy Bebop Movie', episodes: 1, status: 'FINISHED', format: 'MOVIE', images_json: {} },
];
for (const row of rows) row.text_variants_json=[{field:'title',locale:'und',form:'default',sourceKey:'fixture:indexed',value:row.title}];
let saved;
const malLookups=[];
const context = {
  exports: {}, console, withTransaction:async callback=>callback({}),hydrateCatalogAssets:async (_client,rows)=>rows, MEDIA_FIELDS: '',
  resolveCatalogText:textModule.exports.resolveCatalogText,
  query: async sql => sql.includes('ORDER BY score') ? [rows[0]] : [rows[1]],
  filterOfficialStreamingLinks: links => links || [],
  getPortugueseSearchCandidates: () => [],
  extractFranchiseName: () => 'Cowboy Bebop',
  clusterFranchises: async values => values,
  saveAnimesToCatalog: async values => { saved = values; },
  queryAniList: async () => { throw new Error('Local search unexpectedly requested remote data'); },
  areRelatedFranchises:()=>false,
  areMalConnected:async (a,b)=>{malLookups.push([a,b]);return false;},
  judgeFranchiseRelationWithJev:async ()=>false,
};
vm.runInNewContext(code, context);
const linkedSeason=context.exports.mapDbRowToAnime({mal_id:31,title:'Linked',images_json:{},source_nodes_json:[{namespace:'anilist:media',id:'31',type:'ANIME'}],composition_seasons_json:{'31':'canonical-season','32':'unproven'},seasons_json:[{id:31},{id:32}]});
assert.equal(linkedSeason.seasons[0].entityId,'canonical-season');
assert.equal(linkedSeason.seasons[0].id,31);
assert.equal(linkedSeason.seasons[1].entityId,undefined,'projection requires confirmed provider identity');
assert.equal(context.exports.mapDbRowToAnime({mal_id:12,title:'Zero',episodes:0,images_json:{}}).episodes,0);
assert.equal(context.exports.mapDbRowToAnime({mal_id:13,title:'Unknown',episodes:null,images_json:{}}).episodes,null);
const zeroScores=context.exports.mapDbRowToAnime({mal_id:15,title:'Scores',images_json:{},score:0,score_mal:0,score_anilist:0,score_imdb:0,score_episodes_avg:0,score_work_general:0});
for(const field of ['score','score_mal','score_anilist','score_imdb','score_episodes_avg','score_work_general']) assert.equal(zeroScores[field],0,'projection preserves zero '+field);
const unknownScores=context.exports.mapDbRowToAnime({mal_id:16,title:'Unknown scores',images_json:{},score:8,score_work_general:null});
assert.equal(unknownScores.score,8);
for(const field of ['score_mal','score_anilist','score_imdb','score_episodes_avg','score_work_general']) assert.equal(unknownScores[field],undefined,'unknown score is not inferred '+field);
const translated=context.exports.mapDbRowToAnime({mal_id:14,title:'Original',title_portuguese:'Legacy fallback',images_json:{},text_variants_json:[
  {field:'title',locale:'pt-br',form:'default',sourceKey:'verified',value:'Título canônico',revision:2},
]});
assert.equal(translated.title_portuguese,'Título canônico','actual catalog reader resolves known canonical locale before compatibility fallback');
assert.equal(translated.textVariants[0].revision,2);
const rawOnly=context.exports.mapDbRowToAnime({mal_id:17,title:'Original',images_json:{},title_english:'Unproven English',title_japanese:'Unproven native',title_portuguese:'Unproven Portuguese',synopsis:'Unindexed description'});
assert.equal(rawOnly.title,'','unindexed main title remains unknown');
const canonicalMain=context.exports.mapDbRowToAnime({mal_id:19,title:'Outdated raw title',images_json:{},text_variants_json:[{field:'title',locale:'und',form:'default',sourceKey:'verified',value:'Canonical main title'}]});
assert.equal(canonicalMain.title,'Canonical main title','main title comes from canonical variant');
for(const field of ['title_english','title_japanese','title_portuguese','synopsis']) assert.equal(rawOnly[field],undefined,'projection requires canonical text variants '+field);
const unknownLanguage=context.exports.mapDbRowToAnime({mal_id:18,title:'Original',images_json:{},text_variants_json:[{field:'description',locale:'und',form:'full',sourceKey:'legacy:catalog',value:'Preserved description'}]});
assert.equal(unknownLanguage.synopsis,'Preserved description','indexed description with unknown language remains available');
const result = await context.exports.searchAnimes('Cowboy Bebop');
assert.equal(result.length, 2);
for (const row of rows) {
  const value = result.find(item => item.mal_id === row.mal_id);
  assert.equal(value.episodes, row.episodes);
  assert.equal(value.status, row.status);
  assert.equal(saved.find(item => item.mal_id === row.mal_id).episodes, row.episodes);
  assert.equal(value.idMal,row.id_mal);
  assert.equal(value.idAnilist,row.id_anilist);
  assert.equal(value.workEntityId,row.composition_work_id);
  assert.equal(value.seasonEntityId,row.composition_season_id);
  assert.equal(value.universeEntityId,row.composition_universe_id);
  assert.equal(value.entityId,row.canonical_entity_id);
  assert.equal(JSON.stringify(value.sourceRelations),JSON.stringify(row.source_relations_json));
}
await context.exports.isFranchiseCorrelatedWithJevAndMal({title:'A',mal_id:100},{title:'B',mal_id:200});
assert.equal(malLookups.length,0,'ambiguous route IDs never become MAL lookup subjects');
await context.exports.isFranchiseCorrelatedWithJevAndMal({title:'A',mal_id:100,idMal:1},{title:'B',mal_id:200,idMal:2});
assert.deepEqual(malLookups,[[1,2]]);
console.log('PASS: local search and sibling search preserve episode metadata before persistence');
