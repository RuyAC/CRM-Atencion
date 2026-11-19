import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,readFileSync,writeFileSync,mkdirSync,cpSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createApp} from '../server/index.mjs';
import {verifyFullBackup} from '../server/backups.mjs';
import {subscriptionStore} from '../server/subscriptions.mjs';
import {digest} from '../server/security.mjs';
import {PLANS} from '../shared/plans.mjs';
import {checkEnvironment} from '../scripts/preflight.mjs';
import {clientIp} from '../server/http-policy.mjs';
const registration=(email,plan='essential',interval='monthly')=>({restaurantName:'Piloto',ownerName:'Propietario',email,password:'PilotoSeguro2026!',confirmPassword:'PilotoSeguro2026!',plan,interval});
async function fixture(t,production=false){const directory=mkdtempSync(path.join(os.tmpdir(),'atencion-launch-')),mail=[];const app=createApp({port:0,host:'127.0.0.1',dbPath:path.join(directory,'data','platform.sqlite'),mediaDir:path.join(directory,'uploads'),backupDir:path.join(directory,'backups'),production,publicOrigin:production?'https://atencion.example':'',bootstrap:production?{name:'Inicial',ownerPassword:'OwnerBootstrap2026!',adminPassword:'AdminBootstrap2026!',monitorPin:'913782',ownerEmail:'initial@example.test',adminEmail:'platform@example.test'}:null,sendMail:async item=>mail.push(item)});const address=await app.listen();const url=`http://127.0.0.1:${address.port}`;t.after(async()=>{await app.close();assert.equal(path.dirname(directory),os.tmpdir());assert(path.basename(directory).startsWith('atencion-launch-'));rmSync(directory,{recursive:true,force:true});});return {app,directory,mail,url};}
function client(f){let cookie='';return {async action(action,payload={}){const r=await fetch(f.url+'/api/action',{method:'POST',headers:{'Content-Type':'application/json',cookie},body:JSON.stringify({action,payload})});if(r.headers.getSetCookie()[0])cookie=r.headers.getSetCookie()[0].split(';')[0];return {status:r.status,body:await r.json()};},async get(route='/api/state'){const r=await fetch(f.url+route,{headers:{cookie}});return {status:r.status,body:await r.json()};},cookie:()=>cookie};}
async function platform(f){const c=client(f);assert.equal((await c.action('auth.login',{email:'admin@local.test',password:'Atencion2026!'})).status,200);return c;}

test('free demo preserves chosen plan, starts with one table and allows the full chosen plan for seven days and upgrades without data loss',async t=>{
 const f=await fixture(t),a=client(f),admin=await platform(f);
 const result=await a.action('auth.register',{...registration('trial@example.test','business','annual'),demo:true,trialDays:999,endsAt:'2099-01-01'});
 assert.equal(result.status,200);const r=result.body.result,entry=f.app.entries.find(e=>e.app.restaurant().id===r.restaurant.id);
 let state=(await a.get()).body;assert.equal(state.tables.length,1);assert.equal(state.subscription.plan,'business');assert.equal(state.subscription.interval,'annual');assert.equal(state.subscription.effectiveStatus,'trial');assert.equal(state.subscription.planDetails.tables,100);
 assert(Math.abs(Date.parse(state.subscription.endsAt)-Date.now()-7*86400000)<10000);
 assert.equal((await a.action('entity.save',{entity:'tables',item:{number:2,name:'Mesa 2',active:true}})).status,200);
 assert.equal((await a.action('request.create',{token:state.tables[0].token,type:'CALL'})).status,200);
 const old=entry.app.subscription.read();entry.app.db.prepare("UPDATE meta SET value=? WHERE key='subscription_v1'").run(JSON.stringify({...old,endsAt:new Date(Date.now()-1000).toISOString()}));
 assert.equal((await a.get()).body.subscription.effectiveStatus,'expired');assert.equal((await a.action('request.create',{token:state.tables[0].token,type:'CALL'})).status,402);
 assert.equal((await activate(admin,r)).status,200);assert.equal((await a.get()).body.requests.length,1);
 assert.equal((await a.action('entity.save',{entity:'tables',item:{number:3,name:'Mesa 3',active:true}})).status,200);
});

test('every free demo exposes all chosen plan features and enforces its normal table limit',async t=>{
 const f=await fixture(t);
 for(const plan of Object.values(PLANS)){
  const a=client(f);assert.equal((await a.action('auth.register',{...registration(`demo-${plan.id}@example.test`,plan.id),demo:true})).status,200);
  const state=(await a.get()).body;assert.equal(state.tables.length,1);assert.deepEqual(state.subscription.planDetails,plan);
  for(let number=2;number<=plan.tables;number++)assert.equal((await a.action('entity.save',{entity:'tables',item:{number,name:`Mesa ${number}`,active:true}})).status,200);
  assert.equal((await a.action('entity.save',{entity:'tables',item:{number:plan.tables+1,name:'Exceso',active:true}})).status,403);
 }
});

test('production free demo still requires owner email verification before receiving calls',async t=>{
 const f=await fixture(t,true),a=client(f);assert.equal((await a.action('auth.register',{...registration('demoverify@example.test','pro'),demo:true})).status,200);
 const state=(await a.get()).body;assert.equal(state.tables.length,1);assert.equal(state.subscription.serviceEnabled,true);
 assert.equal((await a.action('request.create',{token:state.tables[0].token,type:'CALL'})).status,403);
 assert.equal((await a.action('auth.verification.send')).status,200);
 const token=new URLSearchParams(new URL(f.mail.at(-1).url).hash.slice(1)).get('token');assert.equal((await a.action('auth.verify',{token})).status,200);
 assert.equal((await a.action('request.create',{token:state.tables[0].token,type:'CALL'})).status,200);
});
async function activate(c,r,overrides={}){return c.action('saas.subscription.update',{restaurantId:r.restaurant.id,plan:r.subscription.plan,interval:r.subscription.interval,status:'active',endsAt:new Date(Date.now()+86400000).toISOString(),...overrides});}

test('selected subscription persists, enforces tables/videos/kitchen and cannot be activated by tenant or another tenant',async t=>{const f=await fixture(t),a=client(f),b=client(f);const r=(await a.action('auth.register',registration('a@example.test'))).body.result;await b.action('auth.register',registration('b@example.test','pro','annual'));const admin=await platform(f);assert.equal((await a.get()).body.subscription.effectiveStatus,'pending');assert.equal((await a.action('saas.subscription.update',{restaurantId:r.restaurant.id,status:'active'})).status,403);assert.equal((await b.action('entity.save',{restaurantSlug:r.restaurant.slug,entity:'categories',item:{name:'Intrusión'}})).status,403);assert.equal((await activate(admin,r)).status,200);
 for(let i=6;i<=20;i++)assert.equal((await a.action('entity.save',{entity:'tables',item:{number:i,name:`Mesa ${i}`,active:true}})).status,200);
 assert.equal((await a.action('entity.save',{entity:'tables',item:{number:21,name:'Exceso'}})).status,403);
 const category=(await a.action('entity.save',{entity:'categories',item:{name:'Platos'}})).body.result;
 assert.equal((await a.action('entity.save',{entity:'products',item:{name:'Video',price:100,categoryId:category.id,videoUrl:'https://example.com/video.mp4'}})).status,403);
 assert.equal((await a.action('kitchen.create',{})).status,403);
 assert.equal((await a.get('/api/export?format=csv')).status,403);
 const inventories=(await admin.get('/api/saas/state')).body.restaurants;assert.equal(inventories.find(x=>x.id===r.restaurant.id).subscription.plan,'essential');assert.equal(inventories.find(x=>x.slug!==r.restaurant.slug&&x.name==='Piloto').subscription.amount,2500);
 const entry=f.app.entries.find(e=>e.app.restaurant().id===r.restaurant.id);assert.equal(subscriptionStore(entry.app.db).snapshot().plan,'essential');
});
test('vencimiento, gracia, suspensión y restauración conservan suscripción y datos',async t=>{const f=await fixture(t),a=client(f),admin=await platform(f);const r=(await a.action('auth.register',registration('v@example.test','business'))).body.result;await activate(admin,r);const entry=f.app.entries.find(e=>e.app.restaurant().id===r.restaurant.id),s=entry.app.subscription.read();
 const set=value=>entry.app.db.prepare("UPDATE meta SET value=? WHERE key='subscription_v1'").run(JSON.stringify({...s,...value}));
 set({endsAt:new Date(Date.now()-86400000).toISOString(),graceDays:3});assert.equal(entry.app.subscription.snapshot().effectiveStatus,'grace');
 set({endsAt:new Date(Date.now()-4*86400000).toISOString(),graceDays:3});const token=(await a.get()).body.tables[0].token;assert.equal((await a.action('request.create',{token,type:'CALL'})).status,402);assert.equal((await a.get()).status,200);
 await activate(admin,r);const saved=(await a.action('backup.export')).body.result;assert(!JSON.stringify(saved).includes('subscription_v1'));assert.equal((await admin.action('saas.subscription.update',{restaurantId:r.restaurant.id,status:'suspended'})).status,200);assert.equal((await a.action('backup.restore',{backup:saved})).status,200);assert.equal(entry.app.subscription.snapshot().status,'suspended');
});
test('recovery is generic, tokens are hashed, one-use and revokes sessions without crossing accounts',async t=>{const f=await fixture(t),owner=client(f),guest=client(f);await owner.action('auth.register',registration('recover@example.test','business'));const known=await guest.action('auth.forgot',{email:'recover@example.test'}),unknown=await guest.action('auth.forgot',{email:'missing@example.test'});assert.deepEqual(known,unknown);assert.equal(f.mail.length,1);const token=new URLSearchParams(new URL(f.mail[0].url).hash.slice(1)).get('token');assert(f.app.db.prepare('SELECT hash FROM account_tokens WHERE hash=?').get(digest(token)));assert(!readFileSync(path.join(f.directory,'data','platform.sqlite')).includes(token));assert.equal((await guest.action('auth.reset',{token,password:'NewPassphrase2026!',confirmPassword:'NewPassphrase2026!'})).status,200);assert.equal((await owner.get()).body.viewer.user,null);assert.equal((await guest.action('auth.reset',{token,password:'AnotherPhrase2026!',confirmPassword:'AnotherPhrase2026!'})).status,400);assert.equal((await guest.action('auth.login',{email:'recover@example.test',password:'PilotoSeguro2026!'})).status,401);assert.equal((await guest.action('auth.login',{email:'recover@example.test',password:'NewPassphrase2026!'})).status,200);});
test('production requires verified owner for public attention; expired verification cannot be reused',async t=>{const f=await fixture(t,true),owner=client(f),admin=client(f);assert.equal((await admin.action('auth.login',{email:'platform@example.test',password:'AdminBootstrap2026!'})).status,200);const r=(await owner.action('auth.register',registration('verify@example.test','pro'))).body.result;assert.equal(r.restaurant.publicBaseUrl,'https://atencion.example');assert.equal((await activate(admin,r)).status,200);const token=(await owner.get()).body.tables[0].token;assert.equal((await owner.action('request.create',{token,type:'CALL'})).status,403);assert.equal((await owner.action('auth.verification.send')).status,200);const verifyToken=new URLSearchParams(new URL(f.mail.at(-1).url).hash.slice(1)).get('token');assert.equal((await owner.action('auth.verify',{token:verifyToken})).status,200);assert.equal((await owner.get()).body.viewer.account.verified,true);assert.equal((await owner.action('request.create',{token,type:'CALL'})).status,200);assert.equal((await owner.action('auth.verify',{token:verifyToken})).status,400);
 await owner.action('auth.forgot',{email:'verify@example.test'});const reset=new URLSearchParams(new URL(f.mail.at(-1).url).hash.slice(1)).get('token');f.app.db.prepare('UPDATE account_tokens SET expires=0 WHERE hash=?').run(digest(reset));assert.equal((await owner.action('auth.reset',{token:reset,password:'SafeReplacement2026!',confirmPassword:'SafeReplacement2026!'})).status,400);
});
test('full backup restores isolated tenants, keys, media and subscription; tampering is detected',async t=>{const f=await fixture(t),a=client(f),admin=await platform(f);const r=(await a.action('auth.register',registration('backup@example.test','business','annual'))).body.result;await activate(admin,r);const entry=f.app.entries.find(e=>e.app.restaurant().id===r.restaurant.id);mkdirSync(path.join(f.directory,'uploads',entry.id),{recursive:true});writeFileSync(path.join(f.directory,'uploads',entry.id,'sample.jpg'),'test-media');const result=await f.app.runBackup();const manifest=verifyFullBackup(result.path);assert(manifest.files.some(x=>x.path.endsWith('.sqlite.key')));const restored=path.join(f.directory,'restored');cpSync(result.path,restored,{recursive:true});const clone=createApp({dbPath:path.join(restored,'data','platform.sqlite'),mediaDir:path.join(restored,'uploads'),port:0,host:'127.0.0.1'});try{assert.equal(clone.entries.length,2);assert.equal(clone.entries[1].app.subscription.snapshot().amount,5000);assert.equal(clone.entries[1].app.restaurant().id,r.restaurant.id);assert.equal(readFileSync(path.join(restored,'uploads',entry.id,'sample.jpg'),'utf8'),'test-media');}finally{await clone.close();}writeFileSync(path.join(result.path,'uploads',entry.id,'sample.jpg'),'modified');assert.throws(()=>verifyFullBackup(result.path),/Integridad/);});
test('business export provides Excel XML with text cells and escaping; registration validates plan',async t=>{const f=await fixture(t),a=client(f);assert.equal((await a.action('auth.register',{...registration('bad@example.test'),plan:'free-admin'})).status,400);const r=(await a.action('auth.register',registration('excel@example.test','business'))).body.result;const response=await fetch(f.url+'/api/export?format=xls',{headers:{cookie:a.cookie()}});assert.equal(response.status,200);assert.match(response.headers.get('content-type'),/ms-excel/);assert.match(await response.text(),/<Workbook/);assert.equal(r.subscription.amount,500);});

test('preflight rejects placeholders and unsafe origins without printing secrets',()=>{const result=checkEnvironment({NODE_ENV:'production',ATENCION_PUBLIC_ORIGIN:'http://example.com',ATENCION_OWNER_EMAIL:'admin@local.test',ATENCION_ADMIN_EMAIL:'admin@local.test',ATENCION_OWNER_PASSWORD:'REEMPLAZAR',ATENCION_ADMIN_PASSWORD:'REEMPLAZAR'});assert(result.some(x=>x.includes('HTTPS')));assert(result.some(x=>x.includes('Correo'))||result.some(x=>x.includes('EMAIL')));assert(result.some(x=>x.includes('DB_PATH')));assert(!JSON.stringify(result).includes('REEMPLAZAR'));});
test('only an explicitly trusted reverse proxy can supply the real client address',()=>{const before=process.env.TRUSTED_PROXY_IPS;try{process.env.TRUSTED_PROXY_IPS='127.0.0.1';assert.equal(clientIp({socket:{remoteAddress:'::ffff:127.0.0.1'},headers:{'x-real-ip':'190.10.20.30'}}),'190.10.20.30');assert.equal(clientIp({socket:{remoteAddress:'192.168.1.8'},headers:{'x-real-ip':'190.10.20.30'}}),'192.168.1.8');}finally{if(before===undefined)delete process.env.TRUSTED_PROXY_IPS;else process.env.TRUSTED_PROXY_IPS=before;}});

test('staff and custom-action limits reject atomically, downgrade conflicts and history window are enforced',async t=>{const f=await fixture(t),owner=client(f),admin=await platform(f);const r=(await owner.action('auth.register',registration('limits@example.test','essential'))).body.result;await activate(admin,r);
 for(let i=0;i<4;i++)assert.equal((await owner.action('entity.save',{entity:'staff',item:{name:`Equipo ${i}`,email:`staff${i}@example.test`,password:'StaffPassphrase2026!',pin:`879${i}`,role:'STAFF',active:true}})).status,200);
 assert.equal((await owner.action('entity.save',{entity:'staff',item:{name:'Exceso',email:'excess@example.test',password:'StaffPassphrase2026!',pin:'8798',role:'STAFF',active:true}})).status,403);
 const entry=f.app.entries.find(e=>e.app.restaurant().id===r.restaurant.id);assert.equal(entry.app.db.prepare('SELECT count(*) AS n FROM credentials').get().n,5);
 for(let i=0;i<2;i++)assert.equal((await owner.action('entity.save',{entity:'buttons',item:{label:`Adicional ${i}`,type:'CALL',active:true}})).status,200);
 assert.equal((await owner.action('entity.save',{entity:'buttons',item:{label:'Otro adicional',type:'CALL',active:true}})).status,403);
 const old={id:'old-request',tableId:'archived',tableName:'Mesa antigua',type:'CALL',status:'completed',createdAt:'2020-01-01T00:00:00Z',events:[]};entry.app.db.prepare('INSERT INTO requests VALUES(?,?,?,?)').run(old.id,old.tableId,old.status,JSON.stringify(old));assert(!(await owner.get()).body.requests.some(x=>x.id===old.id));
 assert.equal((await activate(admin,r,{plan:'business'})).status,200);assert((await owner.get()).body.requests.some(x=>x.id===old.id));
 const category=(await owner.action('entity.save',{entity:'categories',item:{name:'Videos'}})).body.result;assert.equal((await owner.action('entity.save',{entity:'products',item:{name:'Con video',categoryId:category.id,price:500,videoUrl:'https://example.com/plato.mp4'}})).status,200);assert.equal((await activate(admin,r,{plan:'essential'})).status,409);
});
