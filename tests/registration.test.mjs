import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync, readdirSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';

const registration = (email, restaurantName='Restaurante Nuevo') => ({restaurantName, ownerName:'Propietario Nuevo', email, password:'Registro2026!', confirmPassword:'Registro2026!'});
async function fixture(persistent=false) {
  const directory=mkdtempSync(path.join(os.tmpdir(),'atencion-registration-test-'));
  const options={dbPath:persistent?path.join(directory,'primary.sqlite'):':memory:',mediaDir:path.join(directory,'uploads'),host:'127.0.0.1',port:0};
  let app, url;
  async function start(){app=createApp(options);const address=await app.listen();url=`http://127.0.0.1:${address.port}`;}
  await start();
  return {get app(){return app;},get url(){return url;},directory,async restart(){await app.close();await start();},async close(){await app.close();assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert(path.basename(directory).startsWith('atencion-registration-test-'));rmSync(directory,{recursive:true,force:true});}};
}
function client(f) {
  let cookie='';
  return {
    async action(action,payload={},headers={}){const response=await fetch(f.url+'/api/action',{method:'POST',headers:{'Content-Type':'application/json',cookie,...headers},body:JSON.stringify({action,payload})});const issued=response.headers.getSetCookie()[0];if(issued)cookie=issued.split(';')[0];return {status:response.status,body:await response.json()};},
    async get(route='/api/state'){const response=await fetch(f.url+route,{headers:{cookie}});return {status:response.status,body:await response.json()};},
    async login(email,password='Registro2026!'){const response=await this.action('auth.login',{email,password});assert.equal(response.status,200);},
    cookie:()=>cookie,
  };
}
async function register(actor,email,name){const response=await actor.action('auth.register',registration(email,name));assert.equal(response.status,200,JSON.stringify(response.body));return response.body.result;}

test('registration creates an isolated restaurant owner, real registration date, empty menu and unique QR tables',async t=>{
  const f=await fixture();t.after(()=>f.close());const owner=client(f),platform=client(f);
  const account=await register(owner,' NUEVO@EXAMPLE.TEST ','Café Nuevo');
  const state=(await owner.get()).body;
  assert.equal(account.email,'nuevo@example.test');assert.equal(state.restaurant.name,'Café Nuevo');assert.equal(state.restaurant.currency,'BOB');
  assert.equal(state.viewer.user.role,'OWNER');assert.equal(state.viewer.saasAdmin,false);assert.equal(state.viewer.scope,'password');
  assert.equal(state.tables.length,5);assert.equal(new Set(state.tables.map(table=>table.token)).size,5);assert(state.tables.every(table=>table.token.length>=24));
  for(const kind of ['products','categories','networks','orders','requests'])assert.deepEqual(state[kind],[]);
  assert.equal(state.staff.length,1);assert.equal(state.buttons.length,3);assert.match(account.monitorPin,/^\d{4}$/);
  await platform.login('admin@local.test','DemoOwner-ChangeMe!');const catalogue=(await platform.get('/api/saas/state')).body;
  assert.equal(catalogue.summary.restaurants,2);assert.equal(catalogue.summary.accounts,2);
  const customer=catalogue.accounts.find(row=>row.email===account.email);assert(customer.createdAt);assert.equal(customer.restaurantId,account.restaurant.id);
  assert(!JSON.stringify(catalogue).includes('password_hash'));assert(!catalogue.accounts.some(row=>row.email==='admin@local.test'));
});

test('validation, case-insensitive duplicate emails and platform/staff reservations never add a restaurant',async t=>{
  const f=await fixture();t.after(()=>f.close());const actor=client(f);
  for(const email of ['ADMIN@LOCAL.TEST',' ventas@matebar.com ','gerente@local.test'])assert.equal((await actor.action('auth.register',registration(email))).status,409);
  for(const change of [{restaurantName:' '},{ownerName:'X'},{email:'no-email'},{password:'short',confirmPassword:'short'},{confirmPassword:'Different2026!'}])assert.equal((await actor.action('auth.register',{...registration('invalid@example.test'),...change})).status,400);
  assert.equal(f.app.db.prepare('SELECT COUNT(*) AS total FROM tenant_restaurants').get().total,0);
  assert.equal((await actor.get()).body.restaurant.name,'Mate bar');
});

test('parallel registrations serialize email uniqueness, use independent slugs and ignore privilege injection',async t=>{
  const f=await fixture();t.after(()=>f.close());const a=client(f),b=client(f);
  const responses=await Promise.all([a.action('auth.register',{...registration('same@example.test','Mate bar'),role:'PLATFORM_ADMIN',id:'platform-admin-local',saasAdmin:true}),b.action('auth.register',registration('SAME@example.test','Mate bar'))]);
  assert.deepEqual(responses.map(row=>row.status).sort(),[200,409]);
  const actor=responses[0].status===200?a:b;
  assert.equal((await actor.get()).body.viewer.user.role,'OWNER');assert.equal((await actor.get('/api/saas/state')).status,403);
  const other=await register(client(f),'other@example.test','Mate bar');assert.equal(other.restaurant.slug,'mate-bar-3');
});

test('menus, settings, staff, requests, reports and backups stay in their restaurant',async t=>{
  const f=await fixture();t.after(()=>f.close());const a=client(f),b=client(f),mate=client(f),customer=client(f);
  const accountA=await register(a,'a@example.test','Restaurante A'),accountB=await register(b,'b@example.test','Restaurante B');await mate.login('ventas@matebar.com','DemoOwner-ChangeMe!');
  const category=(await a.action('entity.save',{entity:'categories',item:{name:'Carta exclusiva A'}})).body.result;
  assert.equal((await a.action('settings.save',{settings:{welcomeTitle:'Bienvenido a A'}})).status,200);
  assert.equal((await b.get()).body.categories.length,0);assert.equal((await mate.get()).body.categories.length,4);
  assert.equal((await b.action('entity.delete',{entity:'categories',id:category.id})).status,404);
  assert.equal((await a.action('settings.save',{restaurantSlug:accountB.restaurant.slug,settings:{paused:true}})).status,403);
  const publicB=(await a.get(`/api/state?restaurant=${accountB.restaurant.slug}`)).body;assert.equal(publicB.viewer.user,null);assert(publicB.tables.every(table=>table.token===''));
  const tablesB=(await b.get()).body.tables;const call=(await customer.action('request.create',{restaurantSlug:accountB.restaurant.slug,token:tablesB[0].token,type:'CALL'})).body.result;
  assert.equal((await b.get()).body.requests.length,1);assert.equal((await a.get()).body.requests.length,0);assert.equal((await mate.get()).body.requests.length,0);
  assert.equal((await a.action('request.accept',{id:call.id})).status,404);assert.equal((await a.action('request.accept',{restaurantSlug:accountB.restaurant.slug,id:call.id})).status,403);
  assert.equal((await b.action('request.accept',{id:call.id})).status,200);
  const backup=(await a.action('backup.export')).body.result;assert.equal(backup.restaurant.id,accountA.restaurant.id);assert.equal(backup.entities.products.length,0);
  assert.equal((await b.action('backup.restore',{backup})).status,400);assert.equal((await mate.get()).body.tables.length,5);
});

test('email and identity collisions cannot be introduced through staff edits or restaurant restoration',async t=>{
  const f=await fixture();t.after(()=>f.close());const a=client(f),b=client(f);await register(a,'a@example.test','A Nuevo');const other=await register(b,'b@example.test','B Nuevo');
  for(const item of [{name:'Duplicate',email:'ventas@matebar.com',password:'Secure2026!',pin:'4567'},{id:'platform-admin-local',name:'Forged',email:'forged@example.test',password:'Secure2026!',pin:'4567'}])assert.equal((await a.action('entity.save',{entity:'staff',item})).status,409);
  assert.equal((await a.action('settings.save',{restaurant:{slug:other.restaurant.slug}})).status,409);
  const backup=(await a.action('backup.export')).body.result;backup.credentials[0].email='b@example.test';backup.entities.staff[0].email='b@example.test';
  assert.equal((await a.action('backup.restore',{backup})).status,400);
  assert.equal((await a.get()).body.viewer.user.email,'a@example.test');
  const qrBackup=(await a.action('backup.export')).body.result;qrBackup.entities.tables[0].token=(await b.get()).body.tables[0].token;
  assert.equal((await a.action('backup.restore',{backup:qrBackup})).status,400);
});

test('public QR and monitor PIN select the right restaurant without inheriting another restaurant session',async t=>{
  const f=await fixture();t.after(()=>f.close());const owner=client(f),monitor=client(f),customer=client(f),mate=client(f);const registered=await register(owner,'tv@example.test','Monitor Nuevo');
  const table=(await owner.get()).body.tables[0];const state=(await customer.get(`/api/state?restaurant=${registered.restaurant.slug}&token=${table.token}`)).body;
  assert.equal(state.restaurant.name,'Monitor Nuevo');assert.equal(state.tables.find(row=>row.id===table.id).token,table.token);assert.equal(state.viewer.user,null);
  assert.equal((await monitor.action('auth.pin',{restaurantSlug:registered.restaurant.slug,pin:registered.monitorPin})).status,200);
  assert.equal((await monitor.get(`/api/state?restaurant=${registered.restaurant.slug}&monitor=1`)).body.viewer.scope,'monitor');
  assert.equal((await monitor.get('/api/saas/state')).status,403);
  await mate.login('ventas@matebar.com','DemoOwner-ChangeMe!');const foreign=(await mate.get(`/api/state?restaurant=${registered.restaurant.slug}&monitor=1`)).body;
  assert.equal(foreign.viewer.user,null);assert.equal(foreign.viewer.monitorAuthorized,false);
});

test('SaaS remains exclusive and cannot operate any registered restaurant, even a public monitor',async t=>{
  const f=await fixture();t.after(()=>f.close());const owner=client(f),platform=client(f);const registered=await register(owner,'secure@example.test','Secure Nuevo');
  const table=(await owner.get()).body.tables[0];await owner.action('settings.save',{settings:{tvRequirePin:false}});await platform.login('admin@local.test','DemoOwner-ChangeMe!');
  for(const action of ['settings.save','request.create','backup.export'])assert.equal((await platform.action(action,{restaurantSlug:registered.restaurant.slug,token:table.token,type:'CALL',settings:{paused:true}})).status,403);
  const state=(await platform.get(`/api/state?restaurant=${registered.restaurant.slug}&monitor=1`)).body;assert.equal(state.viewer.monitorAuthorized,false);assert.deepEqual(state.requests,[]);
  assert.equal((await owner.get('/api/saas/state')).status,403);
});

test('uploads are partitioned and one restaurant cannot attach another restaurant local file',async t=>{
  const f=await fixture();t.after(()=>f.close());const a=client(f),b=client(f);await register(a,'media-a@example.test','Media A');await register(b,'media-b@example.test','Media B');
  const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jfXkAAAAASUVORK5CYII=';
  const response=await a.action('media.upload',{name:'photo.png',type:'image/png',data:png});assert.equal(response.status,200,JSON.stringify(response.body));const url=response.body.result.url;
  assert.match(url,/^\/uploads\/est-[a-f0-9-]+\/.+\.png$/);assert.equal((await fetch(f.url+url)).status,200);
  assert.equal((await a.action('settings.save',{restaurant:{logoUrl:url}})).status,200);
  assert.equal((await b.action('settings.save',{restaurant:{logoUrl:url}})).status,400);
});

test('registration persists through restart and restaurant restoration preserves other businesses and SaaS',async t=>{
  const f=await fixture(true);t.after(()=>f.close());const a=client(f),b=client(f),platform=client(f);const account=await register(a,'persist-a@example.test','Persistente A');await register(b,'persist-b@example.test','Persistente B');await platform.login('admin@local.test','DemoOwner-ChangeMe!');
  const backup=(await a.action('backup.export')).body.result;
  await f.restart();assert.equal((await a.get()).body.restaurant.id,account.restaurant.id);assert.equal((await b.get()).body.restaurant.name,'Persistente B');
  assert.equal((await a.action('backup.restore',{backup})).status,200);assert.equal((await b.get()).body.viewer.user.email,'persist-b@example.test');
  assert.equal((await platform.get('/api/saas/state')).body.summary.restaurants,3);
  await a.login('persist-a@example.test');assert.equal((await a.get()).body.tables.length,5);assert.equal(readdirSync(path.join(f.directory,'tenants')).filter(name=>name.endsWith('.sqlite')).length,2);
});

test('SSE updates stay on their restaurant channel and registration enforces origin and bounded retry limits',async t=>{
  const f=await fixture();t.after(()=>f.close());const a=client(f),b=client(f);const first=await register(a,'stream-a@example.test','Stream A'),second=await register(b,'stream-b@example.test','Stream B');
  const abortA=new AbortController(),abortB=new AbortController();t.after(()=>{abortA.abort();abortB.abort();});
  const streamA=await fetch(f.url+`/api/events?restaurant=${first.restaurant.slug}`,{signal:abortA.signal}),streamB=await fetch(f.url+`/api/events?restaurant=${second.restaurant.slug}`,{signal:abortB.signal});
  const readerA=streamA.body.getReader(),readerB=streamB.body.getReader();await readerA.read();await readerB.read();
  let receivedB=false;const pendingB=readerB.read().then(()=>{receivedB=true;}).catch(()=>{});
  await a.action('entity.save',{entity:'categories',item:{name:'SSE exclusiva'}});
  const event=new TextDecoder().decode((await readerA.read()).value);assert(event.includes('event: update'));assert(!event.includes('SSE exclusiva'));
  await new Promise(resolve=>setTimeout(resolve,120));assert.equal(receivedB,false);abortB.abort();await pendingB;abortA.abort();
  assert.equal((await client(f).action('auth.register',registration('origin@example.test'),{Origin:'http://other.test'})).status,403);
  const limiter=client(f);for(let index=0;index<8;index++)assert.equal((await limiter.action('auth.register',registration('invalid-email'))).status,400);
  assert.equal((await limiter.action('auth.register',registration('rate@example.test'))).status,429);
});
