import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readdirSync,readFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';
import {credentials} from '../server/seed.mjs';
import {reportDateBounds} from '../server/reporting.mjs';
import {csvCell} from '../server/http-policy.mjs';

async function fixture(t,options={}){
  const directory=mkdtempSync(path.join(os.tmpdir(),'atencion-qa-fixed-'));
  const app=createApp({dbPath:':memory:',mediaDir:path.join(directory,'uploads'),host:'127.0.0.1',port:0,...options});
  const address=await app.listen(),base=`http://127.0.0.1:${address.port}`;
  t.after(async()=>{await app.close();assert.equal(path.dirname(directory),os.tmpdir());assert(path.basename(directory).startsWith('atencion-qa-fixed-'));rmSync(directory,{recursive:true,force:true});});
  function client(){let cookie='';return {
    async action(action,payload={},headers={}){const r=await fetch(base+'/api/action',{method:'POST',headers:{'Content-Type':'application/json',cookie,...headers},body:JSON.stringify({action,payload})});const issued=r.headers.getSetCookie()[0];if(issued)cookie=issued.split(';')[0];return {status:r.status,body:await r.json(),cookie:issued};},
    async get(route='/api/state'){const r=await fetch(base+route,{headers:{cookie}});return {status:r.status,body:await r.json()};},
    async text(route){const r=await fetch(base+route,{headers:{cookie}});return {status:r.status,text:await r.text()};},
    async login(email=credentials[0].email,password=credentials[0].password){const result=await this.action('auth.login',{email,password});assert.equal(result.status,200);return result;}
  };}
  return {app,base,directory,client};
}

test('QA public state allowlist never exposes configured Wi-Fi password to guests or PIN users',async t=>{
  const f=await fixture(t),owner=f.client(),guest=f.client(),monitor=f.client();await owner.login();
  await owner.action('settings.save',{settings:{wifiPassword:'private-qa-value',wifiName:'private-network'}});
  for(const route of ['/api/state','/api/state?token=table-01','/api/state?restaurant=mate-bar']){const {body}=await guest.get(route);assert.equal(body.settings.wifiPassword,undefined);assert.equal(body.settings.wifiName,undefined);assert.equal(body.settings.presenceMode,'basic');}
  await monitor.action('auth.pin',{pin:credentials[0].pin});assert.equal((await monitor.get()).body.settings.wifiPassword,undefined);
  assert.equal((await owner.get()).body.settings.wifiPassword,'private-qa-value');
});

test('QA configured HTTPS origin accepts proxy requests and rejects spoofed forwarded origins; cookies are Secure',async t=>{
  const f=await fixture(t,{publicOrigin:'https://atencion.example.test'}),owner=f.client();
  const accepted=await owner.action('auth.login',{email:credentials[0].email,password:credentials[0].password},{host:'internal:3001',origin:'https://atencion.example.test','x-forwarded-proto':'https'});
  assert.equal(accepted.status,200);assert.match(accepted.cookie,/; Secure/);assert.match(accepted.cookie,/HttpOnly/);
  const rejected=await owner.action('settings.save',{settings:{paused:true}},{origin:'https://evil.example','x-forwarded-host':'atencion.example.test','x-forwarded-proto':'https'});assert.equal(rejected.status,403);
  const logout=await owner.action('auth.logout');assert.match(logout.cookie,/; Secure/);
  const local=await fixture(t);assert.doesNotMatch((await local.client().login()).cookie,/; Secure/);
});

test('QA HTTPS configuration propagates to registered restaurants and presence cookies',async t=>{
  const f=await fixture(t,{publicOrigin:'https://atencion.example.test'}),user=f.client();
  const headers={origin:'https://atencion.example.test'};
  const registration=await user.action('auth.register',{restaurantName:'Seguro',ownerName:'Dueño',email:'safe@qa.test',password:'Private-Registration-Password!',confirmPassword:'Private-Registration-Password!'},headers);
  assert.equal(registration.status,200);assert.match(registration.cookie,/; Secure/);
  await user.action('entity.save',{entity:'networks',item:{name:'Prueba',ip:'127.0.0.1'}},headers);
  await user.action('settings.save',{settings:{presenceMode:'strict'}},headers);
  const token=(await user.get()).body.tables[0].token;
  const proof=await f.client().action('presence.check',{token},headers);assert.equal(proof.status,200);assert.equal(proof.body.result.allowed,true);assert.match(proof.cookie,/; Secure/);
});

test('QA stale settings version rejects a save without undoing concurrent pause',async t=>{
  const f=await fixture(t),owner=f.client();await owner.login();const original=(await owner.get()).body;
  const first=await owner.action('settings.save',{expectedRevision:original.settingsRevision,settings:{paused:true}});assert.equal(first.status,200);
  const stale=await owner.action('settings.save',{expectedRevision:original.settingsRevision,settings:original.settings,restaurant:{name:'STALE'}});assert.equal(stale.status,409);assert.equal(stale.body.code,'SETTINGS_CONFLICT');
  const current=(await owner.get()).body;assert.equal(current.settings.paused,true);assert.equal(current.restaurant.name,original.restaurant.name);
  assert.equal((await owner.action('settings.save',{expectedRevision:current.settingsRevision,restaurant:{name:'Fresh'}})).status,200);
});

test('QA anonymous skipCooldown flag never bypasses the enforced waiting period',async t=>{
  const f=await fixture(t),owner=f.client(),guest=f.client();await owner.login();await owner.action('settings.save',{settings:{cooldownSeconds:300}});
  const request=await guest.action('request.create',{token:'table-01',type:'CALL'});await owner.action('request.accept',{id:request.body.result.id});await owner.action('request.complete',{id:request.body.result.id});
  for(const flag of [undefined,true,1,'true']){const r=await guest.action('request.create',{token:'table-01',type:'CALL',skipCooldown:flag});assert.equal(r.status,429);}
});

test('QA invalid backup entities are rejected atomically and valid backup still restores',async t=>{
  const f=await fixture(t),owner=f.client();await owner.login();const backup=(await owner.action('backup.export')).body.result;
  for(const mutate of [b=>b.entities.products[0].price=-500,b=>b.entities.products[0].categoryId='missing',b=>b.entities.products[0].promoPrice=b.entities.products[0].price,b=>b.entities.tables.push({...b.entities.tables[0]}),b=>b.entities.products[0].imageUrl='javascript:alert(1)',b=>b.credentials[0].password_hash='scrypt:bad:bad',b=>b.entities.networks.push({id:'bad-network',name:'Bad',ip:'invalid'})]){
    const bad=structuredClone(backup);mutate(bad);const r=await owner.action('backup.restore',{backup:bad});assert.equal(r.status,400,JSON.stringify(r.body));const state=(await owner.get()).body;assert.equal(state.viewer.user.role,'OWNER');assert.deepEqual(state.products,backup.entities.products);
  }
  assert.equal((await owner.action('backup.restore',{backup})).status,200);await owner.login();
});

test('QA manual date reports use local days, handle DST and reject invalid dates',async t=>{
  const f=await fixture(t),owner=f.client();await owner.login();
  const insert=f.app.db.prepare('INSERT INTO requests(id,table_id,status,data) VALUES (?,?,?,?)');
  for(const [id,createdAt] of [['previous','2026-10-07T02:00:00Z'],['wanted','2026-10-08T02:00:00Z']])insert.run(id,'mesa-01','completed',JSON.stringify({id,tableId:'mesa-01',tableName:'Mesa 01',type:'CALL',status:'completed',createdAt,events:[]}));
  const csv=await owner.text('/api/export?start=2026-10-07&end=2026-10-07');assert.equal(csv.status,200);assert(csv.text.includes('wanted'));assert(!csv.text.includes('previous'));
  assert.equal((await owner.text('/api/export?start=2026-02-30')).status,400);
  const spring=reportDateBounds('2026-03-08','2026-03-08','America/New_York');assert.equal(spring.end-spring.start,23*3600000);
  const fall=reportDateBounds('2026-11-01','2026-11-01','America/New_York');assert.equal(fall.end-fall.start,25*3600000);
});

test('QA CSV export neutralizes formulas without breaking quoting',async t=>{
  for(const value of ['=1+1',' +1','-1','@SUM(1)','\t=1','\n=1'])assert(csvCell(value).startsWith('"\''));
  assert.equal(csvCell('Mesa "A"'),'"Mesa ""A"""');
  const f=await fixture(t),owner=f.client();await owner.login();await owner.action('entity.save',{entity:'tables',item:{id:'mesa-01',name:'=1+1'}});await f.client().action('request.create',{token:'table-01',type:'CALL'});
  const csv=await owner.text('/api/export');assert(csv.text.includes('"\'=1+1"'));assert(!csv.text.includes(';"=1+1";'));
});

test('QA video uploads reject text and truncated containers; per-restaurant quota is enforced',async t=>{
  const f=await fixture(t,{mediaQuotaBytes:100}),owner=f.client();await owner.login();
  for(const type of ['video/mp4','video/webm','video/quicktime'])assert.equal((await owner.action('upload.create',{type,data:Buffer.from('not a video').toString('base64')})).status,400);
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jDhoAAAAASUVORK5CYII=';
  assert.equal((await owner.action('upload.create',{type:'image/png',data:png})).status,200);
  const full=await owner.action('upload.create',{type:'image/png',data:png});assert.equal(full.status,413);assert.equal(full.body.code,'MEDIA_QUOTA');
});

test('QA customer state stays bounded with history and prioritizes active request',async t=>{
  const f=await fixture(t),insert=f.app.db.prepare('INSERT INTO requests(id,table_id,status,data) VALUES (?,?,?,?)');
  insert.run('active','mesa-01','pending',JSON.stringify({id:'active',tableId:'mesa-01',status:'pending',createdAt:new Date().toISOString(),events:[]}));
  f.app.db.exec('BEGIN');for(let i=0;i<5000;i++)insert.run(`old-${i}`,'mesa-01','completed',JSON.stringify({id:`old-${i}`,tableId:'mesa-01',status:'completed',createdAt:'2020-01-01T00:00:00Z',events:[]}));f.app.db.exec('COMMIT');
  const result=await f.client().get('/api/state?token=table-01');assert.equal(result.body.requests.length,1);assert.equal(result.body.requests[0].id,'active');assert(Buffer.byteLength(JSON.stringify(result.body))<15000);
  assert.equal((await f.client().get('/api/state?token=table-02')).body.requests.length,0);
});

test('QA production requires explicit secure initialization and independent credentials',async t=>{
  assert.throws(()=>createApp({production:true,dbPath:':memory:'}),/HTTPS/);
  assert.throws(()=>createApp({production:true,publicOrigin:'https://qa.test',dbPath:':memory:',bootstrap:{}}),/RESTAURANT_NAME/);
  const bootstrap={name:'Real Restaurant',ownerPassword:'PrivateOwner-QA-Only-123!',adminPassword:'PrivatePlatform-QA-Only-456!',monitorPin:'951762'};
  const f=await fixture(t,{production:true,publicOrigin:'https://qa.test',bootstrap});
  assert.equal((await f.client().action('auth.login',{email:credentials[0].email,password:credentials[0].password})).status,401);
  assert.equal((await f.client().action('auth.login',{email:'admin@local.test',password:bootstrap.ownerPassword})).status,401);
  const owner=f.client();await owner.login(credentials[0].email,bootstrap.ownerPassword);const state=(await owner.get()).body;assert.equal(state.restaurant.name,bootstrap.name);assert.equal(state.products.length,0);assert.equal(state.tables.length,0);assert.equal(state.staff.length,1);
  await f.client().login('admin@local.test',bootstrap.adminPassword);
  assert.equal((await owner.action('settings.save',{settings:{tvPin:credentials[0].pin}})).status,400);
  assert.equal((await owner.action('auth.password',{currentPassword:bootstrap.ownerPassword,newPassword:credentials[0].password})).status,400);
  assert.equal((await f.client().action('auth.register',{restaurantName:'Blocked Demo',ownerName:'Test Owner',email:'demo@qa.test',password:credentials[0].password,confirmPassword:credentials[0].password})).status,400);
});

test('QA production refuses an existing demo database and preserves it',async t=>{
  const directory=mkdtempSync(path.join(os.tmpdir(),'atencion-qa-fixed-'));t.after(()=>{assert.equal(path.dirname(directory),os.tmpdir());assert(path.basename(directory).startsWith('atencion-qa-fixed-'));rmSync(directory,{recursive:true,force:true});});
  const options={dbPath:path.join(directory,'test.sqlite'),mediaDir:path.join(directory,'uploads'),port:0,host:'127.0.0.1'};
  const original=createApp(options);await original.close();
  assert.throws(()=>createApp({...options,production:true,publicOrigin:'https://qa.test'}),/demostración/);
  const recovered=createApp(options);assert.equal(recovered.restaurant().name,'Mate bar');await recovered.close();
});
