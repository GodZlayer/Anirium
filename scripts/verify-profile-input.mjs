import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
const code=ts.transpileModule(fs.readFileSync('src/lib/apiInput.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
const {validateProfileUpdateInput}=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
for (const value of [{},{displayName:'Nome válido'}, {avatarUrl:''},{avatarUrl:'/avatars/user.png'}, {avatarUrl:'https://example.invalid/avatar'}, {settings:{theme:'default',preferredAudio:'Japonês (Original)',preferredSubtitles:'Português',autoNextEpisode:true,autoSkipIntro:false,telemetryHud:false,usePlayerOnEpisodes:true}}]) assert.equal(validateProfileUpdateInput(value),value);
for (const value of [{displayName:null},{displayName:' '},{displayName:'a'.repeat(101)},{displayName:'x\0'}, {avatarUrl:'javascript:alert(1)'},{avatarUrl:'data:image/svg+xml,a'},{avatarUrl:'http://example.invalid/x'},{avatarUrl:'//example.invalid/x'},{avatarUrl:'https://user:password@example.invalid/a'},{avatarUrl:'/\\host'}, {settings:null},{settings:[]},{settings:{admin:true}},{settings:{autoNextEpisode:'false'}},{settings:{theme:{}}},{settings:{preferredAudio:'a'.repeat(129)}}]) assert.throws(()=>validateProfileUpdateInput(value),error=>error.status===400&&error.reason==='invalid_profile_update');
console.log('Actual profile validator: explicit preference fields/types, bounded display name, HTTPS/local avatar paths and unsafe schemes rejected.');
