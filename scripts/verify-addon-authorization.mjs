import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const scope={exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/addonAuthorization.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,scope);
const installed=[
  {addon_id:'owned',enabled:true,config_json:{permissions:['network.external.fetch']},canonical_plugin_id:'plugin',selected_release_id:'release',selected_version:'1.0.0',selected_source_kind:'account-submitted'},
  {addon_id:'disabled',enabled:false,config_json:{}},
  {addon_id:'forged',enabled:'false',config_json:{}},
  {addon_id:'old-integer',enabled:1,config_json:{}},
  {addon_id:'other-account',enabled:true,config_json:{}},
];
const before=JSON.stringify(installed);
const result=scope.exports.projectAuthorizedAddons(installed,['owned','disabled','forged','old-integer','player-pro']);
assert.equal(result.length,1);assert.equal(result[0].id,'owned');
assert.equal(result[0].canonicalPluginId,'plugin');assert.equal(result[0].selectedReleaseId,'release');
assert.equal(result[0].authorizationPolicy,'account-addon-allowlist');assert.equal(result[0].grantedPermissions,undefined);
assert.equal(JSON.stringify(installed),before);
assert.equal(scope.exports.projectAuthorizedAddons(installed,[]).length,0);
console.log('PASS: account addon authorization projection preserves allowlist, rejects disabled/forged states, carries canonical IDs without granting requested permissions');
