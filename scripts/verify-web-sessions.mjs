import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import ts from 'typescript';
import pg from 'pg';

const require = createRequire(import.meta.url);
const { NextRequest } = require('next/server');
const connection = process.env.DATABASE_URL;
assert.ok(connection, 'Use the isolated session fixture runner');
assert.equal(new URL(connection).pathname, '/anirium_security_fixture', 'Refuse production database names');
const pool = new pg.Pool({ connectionString: connection });
const env = { NODE_ENV: 'production', ANIRIUM_OPEN_BETA: 'true', GOOGLE_CLIENT_ID: 'fixture-client',
  ANIRIUM_IDENTITY_KEYRING_FILE: process.env.ANIRIUM_IDENTITY_KEYRING_FILE, ANIRIUM_DATA_KEYRING_FILE: process.env.ANIRIUM_DATA_KEYRING_FILE,
  ANIRIUM_SERVICE_SECRET: crypto.randomBytes(32).toString('hex') };
const modules = new Map();
const registeredManifests = [];
const database = {
  ensurePostgresSchema: async () => {},
  query: async (sql, params) => (await pool.query(sql, params)).rows,
  queryOne: async (sql, params) => (await pool.query(sql, params)).rows[0] || null,
  withTransaction: undefined,
};
// Run the actual transaction helper against the same disposable fixture pool.
const actualDatabase = {};
const databaseCode = ts.transpileModule(fs.readFileSync('src/lib/postgres.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
vm.runInNewContext(databaseCode,{exports:actualDatabase,URL,Buffer,global:{},console,process:{env:{NODE_ENV:'production',DATABASE_URL:connection}},require(name){
  if(name==='./serverLog')return load('src/lib/serverLog.ts');
  if(name==='pg')return{...pg,Pool:class{constructor(){return pool;}}};
  return require(name);
}});
database.withTransaction=actualDatabase.withTransaction;
// Only the external Google identity verifier is stubbed. Route code, session
// helper, PostgreSQL SQL, lease and Service-token verification remain real.
class FixtureOAuth {
  async verifyIdToken({ idToken, audience }) {
    assert.equal(audience, 'fixture-client');
    if (idToken === 'invalid') throw new Error('fixture invalid credential');
    return { getPayload: () => ({ sub: idToken === 'other-account' ? 'fixture-other' : 'fixture-google', email: idToken === 'other-account' ? 'other@example.invalid' : 'fixture@example.invalid',
      email_verified: idToken !== 'unverified', name: idToken === 'other-account' ? '' : 'Fixture', picture: '' }) };
  }
}
function load(path) {
  if (modules.has(path)) return modules.get(path);
  const exports = {};
  modules.set(path, exports);
  const compiled = ts.transpileModule(fs.readFileSync(path, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true,
  } }).outputText;
  const context = vm.createContext({ exports, process: { env, cwd: process.cwd, platform: process.platform }, console: { ...console, error() {} }, Buffer, crypto, TextDecoder, Uint8Array, URL, URLSearchParams, setTimeout, clearTimeout,
    require(name) {
      if (name === 'google-auth-library') return { OAuth2Client: FixtureOAuth };
      if (name === './postgres' || name === '@/lib/postgres') return database;
      if (name === '@/lib/extensions/addonRegistry') return { addonRegistry: { registerExternalManifest: manifest => registeredManifests.push(manifest), getInstalledAddons: () => registeredManifests, getActiveTheme: () => null, syncUserAddons() {}, enableAddon() {}, disableAddon() {} } };
      if (name === '@/lib/extensions/manifestInput') return load('src/lib/extensions/manifestInput.ts');
      if (name === '../apiInput') return load('src/lib/apiInput.ts');
      const library = { '@/lib/userProfiles': 'userProfiles', '@/lib/serviceSessions': 'serviceSessions',
        '@/lib/serviceAuth': 'serviceAuth', '@/lib/apiInput': 'apiInput', '@/lib/webSession': 'webSession', './webSession': 'webSession', '@/lib/privateProfile': 'privateProfile', './externalIdentity': 'externalIdentity', './identityLookup': 'identityLookup', './privateProfile': 'privateProfile', './privateData': 'privateData', './privateActivity': 'privateActivity', './apiInput': 'apiInput', './serverLog': 'serverLog', '@/lib/serverLog': 'serverLog', '@/lib/writeBudget': 'writeBudget', '@/lib/entityStatusPage': 'entityStatusPage', '@/lib/entityCommentPage': 'entityCommentPage', './entityPageInput': 'entityPageInput', '@/lib/privateActivity': 'privateActivity' }[name];
      return library ? load(`src/lib/${library}.ts`) : require(name);
    } });
  vm.runInContext(compiled, context, { filename: path });
  return exports;
}
const req = (path, cookie = '', method = 'GET', body, headers = {}) => new NextRequest(`https://fixture.invalid${path}`, {
  method, headers: { Cookie: cookie, 'Content-Type': 'application/json', ...headers },
  ...(body ? { body: JSON.stringify(body) } : {}),
});
try {
  // The fixture database is empty, and the application DDL is the source of truth.
  const schema = fs.readFileSync('src/lib/postgres.ts', 'utf8').match(/const schemaSQL = `([\s\S]*?)`;/)?.[1];
  assert.ok(schema);
  await pool.query(schema);
  // Exercise upgrade from the previous six-action constraint and idempotence.
  await pool.query("ALTER TABLE user_write_budget DROP CONSTRAINT user_write_budget_action_v2_check; ALTER TABLE user_write_budget ADD CONSTRAINT user_write_budget_action_check CHECK(action IN ('save_progress','save_entity_status','add_comment','update_profile','toggle_bookmark','toggle_addon'))");
  await pool.query(schema);
  await pool.query(schema);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM pg_constraint WHERE conrelid='user_write_budget'::regclass AND conname='user_write_budget_action_check'")).rows[0].count,0);
  const auth = load('src/app/api/auth/google/route.ts');
  const user = load('src/app/api/user/route.ts');
  const service = load('src/app/api/service/session/route.ts');
  const validation = load('src/app/api/service/session/validate/route.ts');
  const helper = load('src/lib/webSession.ts');
  const profiles = load('src/lib/userProfiles.ts');
  const sources = load('src/app/api/sources/route.ts');
  for(const pageQuery of ['limit=21','entity_type=bad','cursor=bad','limit=4&limit=5']) {
    assert.equal((await user.GET(req('/api/user?action=get_all_statuses&'+pageQuery))).status,400);
  }
  for(const pageQuery of ['entity_type=SERIES&entity_id=1&limit=21','entity_type=bad&entity_id=1','entity_type=SERIES&entity_id=1&cursor=bad','entity_type=SERIES&entity_id=1&entity_id=2','entity_type=SERIES','entity_type=SERIES&entity_id=%00']) {
    assert.equal((await user.GET(req('/api/user?action=get_entity_status&'+pageQuery))).status,400);
  }
  for (const patch of [{entityType:'INVALID'}, {userScore:'8'}, {containsSpoilers:'false'}, {userOpinion:{}}, {entityId:'a'.repeat(101)}]) {
    const rejected = await user.POST(req('/api/user','', 'POST', {action:'save_entity_status',entityType:'SERIES',entityId:'1',...patch}));
    assert.equal(rejected.status,400,'invalid entity status rejected before authentication/database mutation');
  }
  assert.equal((await pool.query('SELECT count(*)::int as count FROM user_entity_status')).rows[0].count,0);
  const player = crypto.randomUUID();
  const serviceHeaders = { 'x-anirium-device': 'fixture-device', 'x-anirium-player-session': player };
  const legacy = 'anirium_session=attacker-selected';
  assert.equal((await service.GET(req('/api/service/session', legacy, 'GET', undefined,
    { ...serviceHeaders, 'x-anirium-session': 'attacker-selected' }))).status, 401);
  const response = await auth.POST(req('/api/auth/google', legacy, 'POST', { credential: 'valid' },
    { 'x-anirium-session': 'attacker-selected' }));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.sessionId, undefined);
  assert.equal(response.headers.get('x-anirium-session'), null);
  const cookie1 = response.cookies.get(helper.WEB_SESSION_COOKIE);
  assert.match(cookie1.value, /^[a-f0-9]{64}$/);
  assert.equal(cookie1.httpOnly, true);
  assert.equal(cookie1.secure, true);
  assert.equal(cookie1.sameSite, 'lax');
  assert.equal(cookie1.maxAge, 2592000);
  assert.equal(response.cookies.get('anirium_session').maxAge, 0);
  const browser1 = `${helper.WEB_SESSION_COOKIE}=${cookie1.value}`;
  const addonOwner=body.user.id;
  const addonBefore=(await pool.query('SELECT * FROM user_addons ORDER BY user_id,addon_id')).rows;
  for (const manifest of [{id:'player-pro',name:'Spoof'}, {id:{},name:'Coerced'}, {id:'fixture.bad',name:'Bad',capabilities:[{}]}, {id:'fixture.bad',name:'Bad',manifestUrl:'file:///secret'}]) {
    assert.equal((await sources.POST(req('/api/sources',browser1,'POST',{action:'install_manifest',manifest}))).status,400);
  }
  assert.deepEqual((await pool.query('SELECT * FROM user_addons ORDER BY user_id,addon_id')).rows,addonBefore,'rejected manifests do not mutate PostgreSQL');
  const installed=await sources.POST(req('/api/sources',browser1,'POST',{action:'install_manifest',manifest:{id:'fixture.provider',name:'Provider',capabilities:['magnet.search'],manifestUrl:'https://example.invalid/manifest'}}));
  assert.equal(installed.status,200);
  const installedRow=(await pool.query("SELECT config_json FROM user_addons WHERE user_id=$1 AND addon_id='fixture.provider'",[addonOwner])).rows[0];
  assert.equal(installedRow.config_json._anirium_private,1);
  assert.ok(!JSON.stringify(installedRow.config_json).includes('example.invalid'));
  assert.equal(registeredManifests.length,0,'account install does not publish into shared registry');
  const otherLogin=await auth.POST(req('/api/auth/google','','POST',{credential:'other-account'}));
  assert.equal(otherLogin.status,200);
  const otherLoginPayload=await otherLogin.json();
  assert.match(otherLoginPayload.user.id,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.match(otherLoginPayload.user.username,/^user_[0-9a-f]{24}$/);
  assert.equal(otherLoginPayload.user.display_name,otherLoginPayload.user.username,'missing Google name uses pseudonym, never email prefix');
  const otherCookie=otherLogin.cookies.get(helper.WEB_SESSION_COOKIE);
  const otherBrowser=`${helper.WEB_SESSION_COOKIE}=${otherCookie.value}`;
  assert.equal((await sources.POST(req('/api/sources',otherBrowser,'POST',{action:'install_manifest',manifest:{id:'fixture.provider',name:'Other account provider',manifestUrl:'https://other.invalid/manifest'}}))).status,200);
  for (const [cookie,expectedUrl] of [[browser1,'https://example.invalid/manifest'],[otherBrowser,'https://other.invalid/manifest'],['',null]]) {
    const listing=await sources.GET(req('/api/sources?action=list_addons',cookie));
    assert.equal(listing.status,200);
    assert.equal(listing.headers.get('cache-control'),'private, no-store');
    assert.equal(listing.headers.get('vary'),'Cookie');
    const addons=(await listing.json()).addons;
    if(expectedUrl) assert.equal(addons.find(addon=>addon.id==='fixture.provider').manifestUrl,expectedUrl,'same addon ID resolves only current account private config');
    else assert.equal(addons.length,0,'anonymous listing reveals no private config');
  }

  for(let attempt=1;attempt<10;attempt++) assert.equal((await sources.POST(req('/api/sources',browser1,'POST',{action:'install_manifest',manifest:{id:'fixture.provider',name:'Provider',capabilities:['magnet.search'],manifestUrl:'https://example.invalid/manifest'}}))).status,200,'first ten installs accepted');
  const finalInstalledRow=(await pool.query("SELECT config_json FROM user_addons WHERE user_id=$1 AND addon_id='fixture.provider'",[addonOwner])).rows[0];
  const blockedInstall=await sources.POST(req('/api/sources',browser1,'POST',{action:'install_manifest',manifest:{id:'fixture.blocked',name:'Blocked'}}));
  assert.equal(blockedInstall.status,429);assert.match(blockedInstall.headers.get('retry-after'),/^[1-9][0-9]*$/);
  assert.equal(blockedInstall.headers.get('cache-control'),'no-store');
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM user_addons WHERE addon_id='fixture.blocked'")).rows[0].count,0);
  for(const addonId of [{},42,'','../fixture.provider','a'.repeat(101)]) assert.equal((await sources.POST(req('/api/sources',browser1,'POST',{action:'uninstall_addon',addonId}))).status,400);
  assert.equal((await pool.query("SELECT count(*)::int AS count FROM user_write_budget WHERE user_id=$1 AND action='uninstall_addon'",[addonOwner])).rows[0].count,0,'invalid removal does not consume bucket');
  assert.equal((await sources.POST(req('/api/sources',browser1,'POST',{action:'uninstall_addon',addonId:'fixture.absent'}))).status,200);
  await pool.query("UPDATE user_write_budget SET hits=31 WHERE user_id=$1 AND action='uninstall_addon'",[addonOwner]);
  assert.equal((await sources.POST(req('/api/sources',browser1,'POST',{action:'uninstall_addon',addonId:'fixture.provider'}))).status,429);
  assert.deepEqual((await pool.query("SELECT config_json FROM user_addons WHERE user_id=$1 AND addon_id='fixture.provider'",[addonOwner])).rows[0].config_json,finalInstalledRow.config_json,'limited uninstall leaves encrypted config intact');
  const originalTier=(await pool.query('SELECT level_tier FROM users WHERE id=$1',[addonOwner])).rows[0].level_tier;
  await pool.query('UPDATE users SET level_tier=3 WHERE id=$1',[addonOwner]);
  assert.equal((await sources.POST(req('/api/sources',browser1,'POST',{action:'register_manifest',manifest:{id:'fixture.dev',name:'Developer'}}))).status,200);
  assert.equal(registeredManifests.length,1);
  await pool.query("UPDATE user_write_budget SET hits=11 WHERE user_id=$1 AND action='register_manifest'",[addonOwner]);
  assert.equal((await sources.POST(req('/api/sources',browser1,'POST',{action:'register_manifest',manifest:{id:'fixture.devblocked',name:'Blocked'}}))).status,429);
  assert.equal(registeredManifests.length,1,'limited developer registration cannot alter catalog');
  await pool.query('UPDATE users SET level_tier=$2 WHERE id=$1',[addonOwner,originalTier]);


  // Real mutation routes at account capacity, not merely the storage helper.
  for(let index=0;index<49;index++) await profiles.installUserAddon(addonOwner,{id:`cap.api.${index}`,name:'Capacity fixture'});
  const beforeCapApi=(await pool.query('SELECT addon_id,enabled,config_json FROM user_addons WHERE user_id=$1 ORDER BY addon_id',[addonOwner])).rows;
  await pool.query("UPDATE user_write_budget SET hits=1,window_start=FLOOR(EXTRACT(EPOCH FROM statement_timestamp())/60)::bigint WHERE user_id=$1 AND action='install_manifest'",[addonOwner]);
  const capResponses=[
    await sources.POST(req('/api/sources',browser1,'POST',{action:'install_manifest',manifest:{id:'cap.api.denied',name:'Denied'}})),
    await user.POST(req('/api/user',browser1,'POST',{action:'toggle_addon',addonId:'cap.api.toggle-denied',enabled:true})),
  ];
  for(const response of capResponses) {
    assert.equal(response.status,409);
    assert.equal(response.headers.get('cache-control'),'no-store');
    const data=await response.json();
    assert.equal(data.success,false);assert.equal(data.error,'addon_install_limit');
    assert.equal(data.message,'Limite de 50 extensões atingido. Remova uma extensão para instalar outra.');
    assert.ok(data.message.length<=100);
  }
  assert.deepEqual((await pool.query('SELECT addon_id,enabled,config_json FROM user_addons WHERE user_id=$1 ORDER BY addon_id',[addonOwner])).rows,beforeCapApi,'HTTP409 leaves every addon row unchanged');
  assert.equal((await user.POST(req('/api/user',browser1,'POST',{action:'toggle_addon',addonId:'player-pro',enabled:false}))).status,200,'official Player preference is usable through real API at capacity');
  await pool.query("DELETE FROM user_addons WHERE user_id=$1 AND (addon_id LIKE 'cap.api.%' OR addon_id='player-pro')",[addonOwner]);

  await profiles.installUserAddon(addonOwner,{id:'fixture.toggle',name:'Fixture toggle',enabled:true});
  const originalAddon=(await pool.query("SELECT enabled,config_json FROM user_addons WHERE user_id=$1 AND addon_id='fixture.toggle'",[addonOwner])).rows[0];
  for(const cookie of ['',browser1]) {
    const deniedGet=await sources.GET(req('/api/sources?action=toggle_addon&addonId=fixture.toggle&enable=false',cookie));
    assert.equal(deniedGet.status,405);assert.equal(deniedGet.headers.get('allow'),'POST');
    assert.equal((await deniedGet.json()).replacement,'/api/user');
  }
  assert.deepEqual((await pool.query("SELECT enabled,config_json FROM user_addons WHERE user_id=$1 AND addon_id='fixture.toggle'",[addonOwner])).rows[0],originalAddon,'GET never changes stored addon state');
  assert.equal((await user.POST(req('/api/user',browser1,'POST',{action:'toggle_addon',addonId:'fixture.toggle',enabled:false}))).status,200);
  assert.equal((await pool.query("SELECT enabled FROM user_addons WHERE user_id=$1 AND addon_id='fixture.toggle'",[addonOwner])).rows[0].enabled,false);
  await pool.query("UPDATE user_write_budget SET hits=31,window_start=FLOOR(EXTRACT(EPOCH FROM statement_timestamp())/60)::bigint+1 WHERE user_id=$1 AND action='toggle_addon'",[addonOwner]);
  assert.equal((await user.POST(req('/api/user',browser1,'POST',{action:'toggle_addon',addonId:'fixture.toggle',enabled:true}))).status,429);
  assert.equal((await pool.query("SELECT enabled FROM user_addons WHERE user_id=$1 AND addon_id='fixture.toggle'",[addonOwner])).rows[0].enabled,false,'budget cannot be bypassed through sources GET');
  const profileBefore=(await pool.query('SELECT id,display_name,avatar_url,settings_json,profile_private FROM users ORDER BY id')).rows;
  for(const patch of [{settings:{admin:true}}, {settings:{autoSkipIntro:'false'}}, {settings:[]}, {displayName:' '}, {avatarUrl:'javascript:alert(1)'}]) {
    assert.equal((await user.POST(req('/api/user',browser1,'POST',{action:'update_profile',...patch}))).status,400);
  }
  assert.deepEqual((await pool.query('SELECT id,display_name,avatar_url,settings_json,profile_private FROM users ORDER BY id')).rows,profileBefore,'invalid profile updates leave all stored fields unchanged');
  const updatedPreference=await user.POST(req('/api/user',browser1,'POST',{action:'update_profile',settings:{autoSkipIntro:true}}));
  assert.equal(updatedPreference.status,200);
  assert.equal((await updatedPreference.json()).user.settings.autoSkipIntro,true);
  const savedOpinion = await user.POST(req('/api/user',browser1,'POST',{action:'save_entity_status',entityType:'SERIES',entityId:'1',parentSeriesId:1,userScore:8.5,userOpinion:'fixture-private-opinion',containsSpoilers:false}));
  assert.equal(savedOpinion.status,200);
  const privateRow=(await pool.query("SELECT activity_private,user_score,user_opinion FROM user_entity_status WHERE entity_type='SERIES' AND entity_id='1'")).rows[0];
  assert.equal(privateRow.activity_private._anirium_private,1);
  assert.equal(privateRow.user_score,null);assert.equal(privateRow.user_opinion,null);
  assert.ok(!JSON.stringify(privateRow.activity_private).includes('fixture-private-opinion'));
  const comment = {action:'add_comment',entityType:'SERIES',entityId:'1',parentSeriesId:1,content:'Public fixture comment',isSpoiler:false};
  for (const patch of [{content:{}},{content:' '},{content:'a'.repeat(4001)},{isSpoiler:'false'},{parentCommentId:'bad'}]) {
    assert.equal((await user.POST(req('/api/user','', 'POST',{...comment,...patch}))).status,400);
  }
  const rootComment=await user.POST(req('/api/user',browser1,'POST',comment));
  assert.equal(rootComment.status,200);
  const rootId=(await rootComment.json()).commentId;
  const reply=await user.POST(req('/api/user',browser1,'POST',{...comment,parentCommentId:rootId,content:'Public fixture reply'}));
  assert.equal(reply.status,200);
  for (const patch of [{entityId:'2'},{entityType:'UNIVERSE'},{parentCommentId:crypto.randomUUID()}]) {
    const invalidReply=await user.POST(req('/api/user',browser1,'POST',{...comment,parentCommentId:rootId,...patch}));
    assert.equal(invalidReply.status,400);
  }
  assert.equal((await pool.query('SELECT count(*)::int as count FROM entity_comments')).rows[0].count,2,'invalid reply does not create cross-entity or orphan comments');
  await pool.query("UPDATE user_write_budget SET hits=11,window_start=FLOOR(EXTRACT(EPOCH FROM statement_timestamp())/60)::bigint+1 WHERE action='add_comment'");
  const deniedComment=await user.POST(req('/api/user',browser1,'POST',comment));
  assert.equal(deniedComment.status,429);
  assert.match(deniedComment.headers.get('retry-after'),/^[1-9][0-9]*$/);
  assert.equal(deniedComment.headers.get('cache-control'),'no-store');
  assert.equal((await pool.query('SELECT count(*)::int AS count FROM entity_comments')).rows[0].count,2,'rate-denied route makes no comment mutation');
  const commentOwner=(await pool.query('SELECT user_id FROM entity_comments WHERE id=$1',[rootId])).rows[0].user_id;
  const publicAuthor=(await profiles.getAllProfiles()).find(profile=>profile.id===commentOwner);
  const storedAuthor=(await pool.query('SELECT display_name,avatar_url,profile_private FROM users WHERE id=$1',[commentOwner])).rows[0];
  assert.equal(storedAuthor.display_name,'Conta');assert.equal(storedAuthor.avatar_url,'');
  assert.ok(!JSON.stringify(storedAuthor.profile_private).includes(publicAuthor.display_name));
  const adminUsers=load('src/app/api/admin/users/route.ts');
  assert.equal((await adminUsers.GET(req('/api/admin/users'))).status,403);
  assert.equal((await adminUsers.GET(req('/api/admin/users',browser1))).status,403,'member cannot read administrative profiles');
  const originalAuthorTier=(await pool.query('SELECT level_tier FROM users WHERE id=$1',[commentOwner])).rows[0].level_tier;
  await pool.query('UPDATE users SET level_tier=3 WHERE id=$1',[commentOwner]);
  const adminResponse=await adminUsers.GET(req('/api/admin/users',browser1));
  assert.equal(adminResponse.status,200);assert.equal(adminResponse.headers.get('cache-control'),'private, no-store');
  const adminPayload=await adminResponse.json();
  const adminAuthor=adminPayload.users.find(profile=>profile.id===commentOwner);
  assert.equal(adminAuthor.displayName,publicAuthor.display_name);assert.equal(adminAuthor.avatarUrl,publicAuthor.avatar_url);
  assert.ok(adminPayload.users.every(profile=>profile.profile_private===undefined));
  await pool.query('UPDATE users SET level_tier=$1 WHERE id=$2',[originalAuthorTier,commentOwner]);
  await pool.query(`INSERT INTO entity_comments(user_id,entity_type,entity_id,content,created_at)
    SELECT $1,'SERIES','1','Page fixture '||n,'2026-10-03T12:00:00.123456Z'::timestamptz FROM generate_series(1,23) n`,[commentOwner]);
  await pool.query("UPDATE entity_comments SET created_at='2026-10-03T12:00:00.123456Z' WHERE entity_id='1'");
  await pool.query("INSERT INTO entity_comments(user_id,entity_type,entity_id,content) VALUES($1,'SERIES','other','Excluded comment')",[commentOwner]);
  await pool.query("INSERT INTO entity_comments(user_id,entity_type,entity_id,content,created_at) VALUES($1,'SERIES','1','Legacy date',NULL)",[commentOwner]);
  const expectedComments=(await pool.query("SELECT id FROM entity_comments WHERE entity_type='SERIES' AND entity_id='1' ORDER BY COALESCE(created_at,TIMESTAMPTZ '1970-01-01 00:00:00+00'),id")).rows.map(row=>row.id);
  const planClient=await pool.connect();
  try {
    await planClient.query('SET enable_seqscan=off');
    const plan=await planClient.query(`EXPLAIN (FORMAT JSON) SELECT id FROM entity_comments
      WHERE entity_type='SERIES' AND entity_id='1'
      ORDER BY COALESCE(created_at,TIMESTAMPTZ '1970-01-01 00:00:00+00'),id LIMIT 5`);
    assert.ok(JSON.stringify(plan.rows).includes('idx_pg_comments_page'),'keyset index supports ordered bounded reads');
  } finally { await planClient.query('RESET enable_seqscan');planClient.release(); }
  let commentCursor=null,firstCommentCursor=null;const seenComments=[];
  do {
    const params=new URLSearchParams({action:'get_entity_status',entity_type:'SERIES',entity_id:'1',limit:'4'});
    if(commentCursor)params.set('cursor',commentCursor);
    const response=await user.GET(req('/api/user?'+params));assert.equal(response.status,200);
    assert.equal(response.headers.get('cache-control'),'private, no-store');
    const page=await response.json();assert.equal(page.status,null,'anonymous response excludes private activity');
    assert.ok(page.comments.length<=4);
    for(const item of page.comments) {
      assert.equal(item.entity_id,'1');assert.equal(item.user_id,undefined);assert.equal(item._page_time,undefined);
      assert.equal(item.settings_json,undefined);assert.equal(item.email,undefined);assert.equal(item.google_id,undefined);
      assert.equal(item.profile_private,undefined);assert.equal(item._author_private,undefined);assert.equal(item._author_id,undefined);
      assert.equal(item.display_name,publicAuthor.display_name);assert.equal(item.avatar_url,publicAuthor.avatar_url);
    }
    seenComments.push(...page.comments.map(item=>item.id));commentCursor=page.nextCommentCursor;firstCommentCursor??=commentCursor;
    assert.ok(seenComments.length<100,'comment pagination must terminate');
  } while(commentCursor);
  assert.deepEqual(seenComments,expectedComments,'actual anonymous API reaches all tied timestamps exactly once');
  assert.equal((await user.GET(req('/api/user?action=get_entity_status&entity_type=SERIES&entity_id=other&cursor='+firstCommentCursor))).status,400,'cursor cannot be reused for another entity');
  const maximumPage=await (await user.GET(req('/api/user?action=get_entity_status&entity_type=SERIES&entity_id=1&limit=20'))).json();
  assert.equal(maximumPage.comments.length,20);assert.ok(maximumPage.nextCommentCursor);
  const defaultPage=await (await user.GET(req('/api/user?action=get_entity_status&entity_type=SERIES&entity_id=1'))).json();
  assert.equal(defaultPage.comments.length,4);
  const priorTier=(await pool.query('SELECT level_tier FROM users WHERE id=$1',[commentOwner])).rows[0].level_tier;
  await pool.query('UPDATE users SET level_tier=2 WHERE id=$1',[commentOwner]);
  const privateDetail=await (await user.GET(req('/api/user?action=get_entity_status&entity_type=SERIES&entity_id=1',browser1))).json();
  assert.equal(privateDetail.status.user_opinion,'fixture-private-opinion');
  assert.equal(privateDetail.status.activity_private,undefined);
  await pool.query('UPDATE users SET level_tier=$2 WHERE id=$1',[commentOwner,priorTier]);
  const emptyPage=await (await user.GET(req('/api/user?action=get_entity_status&entity_type=SERIES&entity_id=missing'))).json();
  assert.deepEqual(emptyPage.comments,[]);assert.equal(emptyPage.nextCommentCursor,null);
  const key1 = helper.readWebSessionId(req('/api/user', browser1));
  assert.notEqual(key1, cookie1.value);
  const rows = await pool.query('SELECT key FROM active_session');
  assert.ok(rows.rows.some(row => row.key === key1));
  assert.ok(rows.rows.every(row => row.key !== cookie1.value && row.key !== 'attacker-selected'));
  // A copied database key cannot authenticate through either transport.
  assert.equal((await service.GET(req('/api/service/session', `${helper.WEB_SESSION_COOKIE}=${key1}`, 'GET', undefined, serviceHeaders))).status, 401);
  assert.equal((await service.GET(req('/api/service/session', '', 'GET', undefined,
    { ...serviceHeaders, 'x-anirium-session': key1 }))).status, 401);
  const activated = await user.POST(req('/api/user', browser1, 'POST', { action: 'activate_anirium_plus' }));
  assert.equal(activated.status, 200);
  const granted = await service.GET(req('/api/service/session', browser1, 'GET', undefined, serviceHeaders));
  assert.equal(granted.status, 200);
  const token1 = (await granted.json()).token;
  const validate = token => validation.GET(req('/api/service/session/validate', '', 'GET', undefined,
    { Authorization: `Bearer ${token}`, 'x-anirium-device': 'fixture-device' }));
  assert.equal((await validate(token1)).status, 200);
  const unverified = await auth.POST(req('/api/auth/google', browser1, 'POST', { credential: 'unverified' }));
  assert.equal(unverified.status, 400);
  assert.equal(unverified.cookies.get(helper.WEB_SESSION_COOKIE), undefined);
  assert.equal((await validate(token1)).status, 200, 'failed login must not revoke the current session');
  const rotated = await auth.POST(req('/api/auth/google', browser1, 'POST', { credential: 'valid' }));
  assert.equal(rotated.status, 200);
  const cookie2 = rotated.cookies.get(helper.WEB_SESSION_COOKIE);
  assert.notEqual(cookie2.value, cookie1.value);
  assert.equal((await profiles.getActiveUserProfile(false, key1)), null);
  assert.equal((await validate(token1)).status, 401);
  const browser2 = `${helper.WEB_SESSION_COOKIE}=${cookie2.value}`;
  const key2 = helper.readWebSessionId(req('/api/user', browser2));
  const grant2 = await service.GET(req('/api/service/session', browser2, 'GET', undefined, serviceHeaders));
  assert.equal(grant2.status, 200);
  const token2 = (await grant2.json()).token;
  await pool.query('UPDATE active_session SET updated_at=$1 WHERE key=$2', [Date.now() - 31*86400000, key2]);
  assert.equal((await validate(token2)).status, 401, 'server expiry applies even with a retained cookie');
  await pool.query('UPDATE active_session SET updated_at=$1 WHERE key=$2', [Date.now(), key2]);
  const loggedOut = await user.POST(req('/api/user', browser2, 'POST', { action: 'logout' }));
  assert.equal(loggedOut.status, 200);
  assert.equal(loggedOut.cookies.get(helper.WEB_SESSION_COOKIE).maxAge, 0);
  assert.equal((await profiles.getActiveUserProfile(false, key2)), null);
  assert.equal((await profiles.getActiveUserProfile(true, 'missing-session')), null, 'production never returns a privileged demo fallback');
  assert.equal((await validate(token2)).status, 401);
  console.log('Actual session/login/logout/Service routes + disposable PostgreSQL passed: server rotation, hashed storage, cookie security, header/legacy rejection, failed-login isolation, expiry and token revocation. Google verifier stubbed; no browser or installed acceptance claimed.');
} finally { await pool.end(); }
