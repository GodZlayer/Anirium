import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import * as jsx from 'react/jsx-runtime';
function compile(file){return ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;}
let effects=[],shows=0,closes=0,closed=0;
const dialog={open:false,showModal(){assert.equal(this.open,false);this.open=true;shows++;},close(){this.open=false;closes++;}};
const exports={};
vm.runInNewContext(compile('src/components/ModalDialog.tsx'),{exports,require:name=>name==='react/jsx-runtime'?jsx:{useRef:()=>({current:dialog}),useLayoutEffect:effect=>effects.push(effect)}});
let element=exports.default({label:'Fixture',className:'fixture',children:'Content',onClose:()=>closed++});
assert.equal(element.type,'dialog');assert.equal(element.props.open,undefined);
assert.equal(element.props['aria-label'],'Fixture');
const effect=effects[0];let cleanup=effect();assert.equal(shows,1);
cleanup();assert.equal(closes,1);
cleanup=effect();assert.equal(shows,2,'StrictMode setup-cleanup-setup reopens native modal');
let prevented=0,stopped=0;
element.props.onCancel({preventDefault:()=>prevented++,stopPropagation:()=>stopped++});
assert.equal(closed,1);assert.equal(prevented,1);assert.equal(stopped,1);
cleanup();assert.equal(dialog.open,false);cleanup();assert.equal(closes,2,'cleanup is idempotent');
const user={user:null,level:0,watchHistory:[],bookmarks:[],bookmarkItems:[],hasPlayerAddon:false,isLoading:false};
function load(name){
 const exports={};vm.runInNewContext(compile('src/components/'+name+'.tsx'),{exports,require:dep=>dep==='react'?React:dep==='react/jsx-runtime'?jsx:dep==='lucide-react'?new Proxy({},{get:()=>()=>React.createElement('svg')}):dep.includes('UserContext')?{useUser:()=>user}:dep==='./ModalDialog'?{__esModule:true,default:({children,label,className})=>React.createElement('dialog',{'aria-label':label,className},children)}:dep==='./LevelSwitcher'?{__esModule:true,default:()=>null}:{},console});return exports.default;
}
const anime={mal_id:99,title:'Fixture',title_english:'Fixture',images:{webp:{large_image_url:'https://fixture.invalid/cover.jpg'},jpg:{large_image_url:'https://fixture.invalid/cover.jpg'}},genres:[],themes:[],demographics:[],studios:[],seasons:[],episodes:1,status:'Finished Airing',type:'TV',score:0};
for(const [name,closedProps,openProps] of [
 ['AnimeModal',{anime:null},{anime}],
 ['FranchiseModal',{franchise:null},{franchise:{representativeAnime:anime,rootTitle:'Fixture',memberAnimes:[anime]}}],
 ['UserProfileModal',{isOpen:false},{isOpen:true}],
 ['LevelSwitcher',{isOpen:false},{isOpen:true}],
]){
 const component=load(name), callbacks={onClose(){},onPlayEpisode(){},onSelectAnime(){}};
 assert.equal(renderToStaticMarkup(React.createElement(component,{...callbacks,...closedProps})), '');
 const html=renderToStaticMarkup(React.createElement(component,{...callbacks,...openProps}));
 assert.ok(html.includes('<dialog'),'Open '+name+' renders dialog');assert.ok(html.includes('aria-label='));
}
console.log('Actual native dialog lifecycle, StrictMode replay, cancellation isolation and idempotent cleanup passed; all four actual modal components render closed/open with React SSR fixtures. Native browser focus, nested Escape and layout acceptance remain pending.');
