import assert from 'node:assert/strict';
import {serverLog} from './server-log-fixture.mjs';
const output=[];
const original=console.error;
console.error=value=>output.push(value);
try {
  serverLog.logServerFailure('postgres',{code:'23505',message:'SECRET password',detail:'PRIVATE opinion',stack:'SENSITIVE stack',query:'SQL username'});
  serverLog.logServerFailure('PRIVATE identity',{code:'PRIVATE token',toJSON(){throw new Error('must not serialize');}});
  serverLog.logServerFailure('user',{get code(){throw new Error('PRIVATE accessor');}});
  serverLog.logServerFailure('user',null);
} finally {console.error=original;}
assert.deepEqual(JSON.parse(output[0]),{event:'server_operation_failed',component:'postgres',code:'23505'});
assert.deepEqual(JSON.parse(output[1]),{event:'server_operation_failed',component:'server',code:'unknown'});
for(const value of output) assert.ok(!/SECRET|PRIVATE|SENSITIVE|SQL/.test(value));
assert.equal(output.length,4);
console.log('Actual server logger: fixed event/component and allowlisted codes only; messages, stacks, SQL, private fields and hostile accessors excluded.');
