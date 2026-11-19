import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.mjs';
import { periodStart } from '../server/reporting.mjs';

async function fixture(dbPath = ':memory:') {
  const mediaDir = mkdtempSync(path.join(os.tmpdir(), 'atencion-test-media-'));
  const app = createApp({ dbPath, mediaDir, port: 0, host: '127.0.0.1' });
  const address = await app.listen();
  const url = `http://127.0.0.1:${address.port}`;
  return { app, url, async close() { await app.close(); rmSync(mediaDir, { recursive: true, force: true }); } };
}

function client(url) {
  let cookie = '';
  return {
    async get(route = '/api/state') { const response = await fetch(`${url}${route}`, { headers: cookie ? { cookie } : {} }); return { status: response.status, body: await response.json() }; },
    async action(action, payload = {}) {
      const response = await fetch(`${url}/api/action`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify({ action, payload }) });
      const newCookie = response.headers.getSetCookie()[0]; if (newCookie) cookie = newCookie.split(';')[0];
      return { status: response.status, body: await response.json() };
    },
    async login(email = 'ventas@matebar.com', password = 'Atencion2026!') { const result = await this.action('auth.login', { email, password }); assert.equal(result.status, 200); return result; },
    cookie: () => cookie,
  };
}

test('authentication, role enforcement, PIN scope, password revocation and safe public state', async t => {
  const f = await fixture(); t.after(() => f.close());
  const owner = client(f.url), stranger = client(f.url), staff = client(f.url), pin = client(f.url);
  assert.equal((await stranger.action('entity.save', { entity: 'categories', item: { name: 'Hacked' } })).status, 401);
  assert.equal((await owner.action('auth.login', { email: 'ventas@matebar.com', password: 'bad' })).status, 401);
  await owner.login(); await staff.login('garcom@local.test', 'Garcom2026!');
  assert.equal((await owner.get()).body.viewer.user.role, 'OWNER');
  assert.equal((await staff.action('settings.save', { settings: { paused: true } })).status, 403);
  const state = (await stranger.get()).body;
  assert.equal(state.viewer.user, null); assert.deepEqual(state.requests, []);
  assert.ok(state.tables.every(table => !table.token));
  assert.ok(state.staff.every(member => !('email' in member)));
  assert.equal(state.settings.tvPin, '');
  assert.ok(!JSON.stringify(state).includes('scrypt:'));
  assert.equal((await pin.action('auth.pin', { pin: '9999' })).status, 401);
  assert.equal((await pin.action('auth.pin', { pin: '1234' })).status, 200);
  assert.equal((await pin.get()).body.viewer.monitorAuthorized, true);
  assert.equal((await pin.action('settings.save', { settings: { paused: true } })).status, 401);
  assert.deepEqual((await owner.action('staff.pinReveal', { id: 'staff-local' })).body.result, { pin: '3456' });
  assert.equal((await staff.action('staff.pinReveal', { id: 'staff-local' })).status, 403);
  const secondOwner = client(f.url); await secondOwner.login();
  assert.equal((await owner.action('auth.password', { current: 'Atencion2026!', newPassword: 'Changed2026!' })).status, 200);
  assert.equal((await secondOwner.get()).body.viewer.user, null);
  assert.equal((await owner.get()).body.viewer.user.role, 'OWNER');
  assert.equal((await owner.action('auth.logout')).status, 200);
  assert.equal((await owner.get()).body.viewer.user, null);
  assert.equal((await owner.action('auth.login', { email: 'ventas@matebar.com', password: 'Atencion2026!' })).status, 401);
  await owner.login('ventas@matebar.com', 'Changed2026!');
});

test('request lifecycle, duplicate protection, conversion, atomic claim and cancellation ownership', async t => {
  const f = await fixture(); t.after(() => f.close());
  const a = client(f.url), b = client(f.url), customer = client(f.url);
  await a.login(); await b.login('gerente@local.test', 'Gerente2026!');
  const calls = await Promise.all(Array.from({ length: 5 }, () => customer.action('request.create', { token: 'table-05', type: 'CALL' })));
  assert.ok(calls.every(call => call.status === 200));
  const id = calls[0].body.result.id;
  assert.ok(calls.every(call => call.body.result.id === id));
  const initial = (await customer.get('/api/state?token=table-05')).body;
  assert.equal(initial.requests.length, 1); assert.equal(initial.tables.find(table => table.number === 5).token, 'table-05');
  assert.equal((await customer.get('/api/state?token=table-01')).body.requests.length, 0);
  assert.equal((await customer.action('request.cancel', { token: 'table-01', id })).status, 404);
  const converted = await customer.action('request.create', { token: 'table-05', type: 'BILL_REQUEST' });
  assert.equal(converted.body.result.id, id); assert.equal(converted.body.result.type, 'BILL_REQUEST');
  assert.equal(converted.body.result.events.filter(event => event.type === 'converted').length, 1);
  const claimed = await Promise.all([a.action('request.accept', { id }), b.action('request.accept', { id })]);
  assert.deepEqual(claimed.map(item => item.status).sort(), [200, 409]);
  assert.equal((await customer.action('request.cancel', { token: 'table-05', id })).status, 409);
  const completed = await a.action('request.complete', { id }); assert.equal(completed.status, 200);
  assert.equal(completed.body.result.status, 'completed');
  assert.ok(completed.body.result.createdAt <= completed.body.result.acceptedAt && completed.body.result.acceptedAt <= completed.body.result.completedAt);
  assert.equal((await customer.action('request.create', { token: 'table-05', type: 'CALL' })).status, 429);
  await a.action('settings.save', { settings: { cooldownSeconds: 0 } });
  const newCall = await customer.action('request.create', { token: 'table-05', type: 'CALL', operationId: 'retry-123' });
  const retry = await customer.action('request.create', { token: 'table-05', type: 'CALL', operationId: 'retry-123' });
  assert.equal(newCall.body.result.id, retry.body.result.id);
  const cancelled = await customer.action('request.cancel', { token: 'table-05', id: newCall.body.result.id });
  assert.equal(cancelled.body.result.status, 'cancelled');
  assert.ok(cancelled.body.result.cancelledAt);
  const csv = await fetch(`${f.url}/api/export?format=csv`, { headers: { cookie: a.cookie() } });
  assert.equal(csv.status, 200); const text = await csv.text(); assert.ok(text.includes(id)); assert.ok(text.includes('cancelled'));
});

test('staff member can only complete own assigned requests; PIN cannot administer', async t => {
  const f = await fixture(); t.after(() => f.close());
  const owner = client(f.url), staff = client(f.url), customer = client(f.url);
  await owner.login(); await staff.action('auth.pin', { staffId: 'staff-local', pin: '3456' });
  const request = (await customer.action('request.create', { token: 'table-01', type: 'CALL' })).body.result;
  await owner.action('request.accept', { id: request.id });
  assert.equal((await staff.action('request.complete', { id: request.id })).status, 403);
  assert.equal((await staff.action('entity.save', { entity: 'tables', item: { number: 100 } })).status, 401);
  const second = (await customer.action('request.create', { token: 'table-02', type: 'CALL' })).body.result;
  assert.equal((await staff.action('request.accept', { id: second.id })).status, 200);
  assert.equal((await staff.action('request.complete', { id: second.id })).status, 200);
});

test('CRUD, foreign category protection, QR rotation and persisted database survive restart', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'atencion-test-db-'));
  const dbPath = path.join(directory, 'restaurant.sqlite');
  let f = await fixture(dbPath); t.after(async () => { await f.close(); rmSync(directory, { recursive: true, force: true }); });
  const owner = client(f.url); await owner.login();
  const category = (await owner.action('entity.save', { entity: 'categories', item: { name: 'Prueba' } })).body.result;
  const product = (await owner.action('entity.save', { entity: 'products', item: { categoryId: category.id, name: 'Plato', price: 1234, available: true } })).body.result;
  assert.equal(product.price, 1234);
  assert.equal((await owner.action('entity.delete', { entity: 'categories', id: category.id })).status, 409);
  assert.equal((await owner.action('entity.save', { entity: 'tables', item: { number: 1 } })).status, 409);
  const rotated = (await owner.action('table.rotate', { id: 'mesa-05' })).body.result;
  assert.notEqual(rotated.token, 'table-05'); assert.equal(rotated.tokenVersion, 2);
  assert.equal((await client(f.url).action('request.create', { token: 'table-05', type: 'CALL' })).status, 404);
  const cookie = owner.cookie(); await f.close();
  f = await fixture(dbPath);
  const response = await fetch(`${f.url}/api/state`, { headers: { cookie } }); const state = await response.json();
  assert.equal(state.viewer.user.role, 'OWNER'); assert.ok(state.categories.some(item => item.id === category.id));
  assert.ok(state.products.some(item => item.id === product.id)); assert.equal(state.tables.find(table => table.id === 'mesa-05').token, rotated.token);
  assert.equal((await client(f.url).action('request.create', { token: rotated.token, type: 'CALL' })).status, 200);
});

test('presence checks IP, GPS fallback, pause and closed hours on server', async t => {
  const f = await fixture(); t.after(() => f.close());
  const owner = client(f.url), customer = client(f.url); await owner.login();
  const check = payload => customer.action('presence.check', { token: 'table-05', ...payload });
  assert.equal((await check()).body.result.allowed, true);
  await owner.action('settings.save', { settings: { presenceMode: 'wifi' } });
  assert.equal((await check()).body.result.allowed, false);
  assert.equal((await customer.action('request.create', { token: 'table-05', type: 'CALL' })).status, 403);
  const network = (await owner.action('entity.save', { entity: 'networks', item: { name: 'Local', ip: '127.0.0.1' } })).body.result;
  assert.equal((await check()).body.result.allowed, true);
  await owner.action('entity.delete', { entity: 'networks', id: network.id });
  await owner.action('settings.save', { settings: { presenceMode: 'fallback', latitude: -16.5, longitude: -68.15, radiusMeters: 100 } });
  assert.equal((await check({ coords: { latitude: -16.5, longitude: -68.15 } })).body.result.allowed, true);
  assert.equal((await check({ coords: { latitude: 0, longitude: 0 } })).body.result.allowed, false);
  await owner.action('settings.save', { settings: { presenceMode: 'basic', paused: true } });
  assert.equal((await customer.action('request.create', { token: 'table-05', type: 'BILL_REQUEST' })).status, 403);
  const hours = (await owner.get()).body.settings.hours.map(day => ({ ...day, closed: true }));
  await owner.action('settings.save', { settings: { paused: false, scheduleEnabled: true, hours } });
  assert.equal((await check()).body.result.allowed, false);
  assert.equal((await customer.get('/api/state?token=table-05')).status, 200); // Menu remains readable.
});

test('media upload persists a valid file, is served with ranges and rejects unsafe URLs', async t => {
  const f = await fixture(); t.after(() => f.close());
  const owner = client(f.url); await owner.login();
  const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jDhoAAAAASUVORK5CYII=';
  const upload = await owner.action('upload.create', { name: '../test.png', type: 'image/png', data: png });
  assert.equal(upload.status, 200); assert.match(upload.body.result.url, /^\/uploads\/[\w-]+\.png$/);
  const image = await fetch(`${f.url}${upload.body.result.url}`); assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await image.arrayBuffer()).toString('base64'), png);
  const ranged = await fetch(`${f.url}${upload.body.result.url}`, { headers: { range: 'bytes=0-7' } });
  assert.equal(ranged.status, 206); assert.equal((await ranged.arrayBuffer()).byteLength, 8);
  assert.equal((await owner.action('upload.create', { name: 'bad.svg', type: 'image/svg+xml', data: png })).status, 400);
  assert.equal((await owner.action('upload.create', { name: 'bad.png', type: 'image/png', data: 'aGVsbG8=' })).status, 400);
  assert.equal((await owner.action('entity.save', { entity: 'buttons', item: { label: 'Unsafe', type: 'LINK', url: 'javascript:alert(1)' } })).status, 400);
});

test('SSE sends changes and reconnect returns current version without leaking data', async t => {
  const f = await fixture(); t.after(() => f.close());
  const owner = client(f.url); await owner.login();
  const controller = new AbortController();
  const response = await fetch(`${f.url}/api/events`, { signal: controller.signal });
  assert.equal(response.headers.get('content-type'), 'text/event-stream');
  const reader = response.body.getReader(); const first = new TextDecoder().decode((await reader.read()).value);
  assert.ok(first.includes('event: update')); assert.ok(first.includes('"version":1'));
  await owner.action('entity.save', { entity: 'categories', item: { name: 'SSE' } });
  const changed = new TextDecoder().decode((await reader.read()).value); assert.ok(changed.includes('"version":2'));
  assert.ok(!changed.includes('SSE')); assert.ok(!changed.includes('staff')); controller.abort();
  const secondController = new AbortController();
  const reconnect = await fetch(`${f.url}/api/events`, { signal: secondController.signal, headers: { 'Last-Event-ID': '1' } });
  const secondReader = reconnect.body.getReader(); const recovered = new TextDecoder().decode((await secondReader.read()).value);
  assert.ok(recovered.includes('"version":2')); secondController.abort();
});

test('seed image editing, external buttons, currency and QR LAN settings persist correctly', async t => {
  const f=await fixture();t.after(()=>f.close());const owner=client(f.url);await owner.login();
  const seeded=(await owner.get()).body.products[0];
  assert.equal((await owner.action('entity.save',{entity:'products',item:{...seeded,name:'Plato actualizado'}})).status,200);
  assert.equal((await owner.action('entity.save',{entity:'products',item:{...seeded,imageUrl:'/assets/../secret'}})).status,400);
  const link=await owner.action('entity.save',{entity:'buttons',item:{label:'Instagram',type:'LINK',url:'https://example.com/menu'}});
  assert.equal(link.status,200);assert.equal(link.body.result.type,'LINK');
  assert.equal((await owner.action('settings.save',{restaurant:{publicBaseUrl:'http://192.168.1.10:3001/path',currency:'USD',legalName:'Mate bar SRL',taxId:'1234'},settings:{currency:'BOB'}})).status,200);
  const state=(await owner.get()).body;
  assert.equal(state.restaurant.publicBaseUrl,'http://192.168.1.10:3001');assert.equal(state.restaurant.legalName,'Mate bar SRL');assert.equal(state.restaurant.taxId,'1234');
  assert.equal(state.restaurant.currency,'USD');assert.equal(state.settings.currency,'USD');
  assert.equal((await owner.action('settings.save',{restaurant:{publicBaseUrl:'javascript:alert(1)'}})).status,400);
});

test('kitchen tickets require identification and advance once through all stages',async t=>{
  const f=await fixture();t.after(()=>f.close());const owner=client(f.url),staff=client(f.url),customer=client(f.url);await owner.login();await staff.action('auth.pin',{staffId:'staff-local',pin:'3456'});
  const payload={tableId:'mesa-05',items:[{productId:'produto-2',quantity:2}],notes:'Sin cebolla'};
  assert.equal((await customer.action('kitchen.create',payload)).status,401);
  const created=await staff.action('kitchen.create',payload);assert.equal(created.status,200);const id=created.body.result.id;
  assert.equal(created.body.result.items[0].name,'Burger de la casa');assert.equal(created.body.result.staffId,'staff-local');
  assert.deepEqual((await customer.get()).body.orders,[]);
  assert.equal((await owner.action('kitchen.update',{id,status:'ready'})).status,409);
  for(const status of ['preparing','ready','delivered']){const changed=await staff.action('kitchen.update',{id,status});assert.equal(changed.status,200);assert.equal(changed.body.result.status,status);}
  const order=(await owner.get()).body.orders.find(o=>o.id===id);assert.ok(order.createdAt<=order.preparedAt&&order.preparedAt<=order.readyAt&&order.readyAt<=order.deliveredAt);
  assert.equal((await staff.action('kitchen.update',{id,status:'delivered'})).status,409);
});

test('strict presence requires authorised IP and signed session; settings changes invalidate proof',async t=>{
  const f=await fixture();t.after(()=>f.close());const owner=client(f.url),customer=client(f.url);await owner.login();
  await owner.action('settings.save',{settings:{presenceMode:'strict'}});
  await owner.action('entity.save',{entity:'networks',item:{name:'Red de prueba',ip:'127.0.0.1'}});
  assert.equal((await customer.action('request.create',{token:'table-05',type:'CALL'})).status,403);
  const presence=await customer.action('presence.check',{token:'table-05'});assert.equal(presence.body.result.allowed,true);assert.ok(customer.cookie().startsWith('mate_presence_'));
  const call=await customer.action('request.create',{token:'table-05',type:'CALL'});assert.equal(call.status,200);
  await customer.action('request.cancel',{token:'table-05',id:call.body.result.id});
  await owner.action('settings.save',{settings:{sessionMinutes:5}});
  assert.equal((await customer.action('request.create',{token:'table-05',type:'CALL'})).status,403);
  await customer.action('presence.check',{token:'table-05'});assert.equal((await customer.action('request.create',{token:'table-05',type:'CALL'})).status,200);
});

test('reports honour restaurant timezone and chosen period; backup preserves PINs and credentials',async t=>{
  assert.equal(periodStart('day','America/La_Paz',new Date('2026-10-06T02:00:00Z')).toISOString(),'2026-10-05T04:00:00.000Z');
  assert.equal(periodStart('day','Europe/Madrid',new Date('2026-07-01T12:00:00Z')).toISOString(),'2026-06-30T22:00:00.000Z');
  const f=await fixture();t.after(()=>f.close());const owner=client(f.url),customer=client(f.url);await owner.login();
  const old=(await customer.action('request.create',{token:'table-01',type:'CALL'})).body.result;
  old.createdAt=new Date(Date.now()-90*86400000).toISOString();f.app.db.prepare('UPDATE requests SET data=? WHERE id=?').run(JSON.stringify(old),old.id);
  const recent=(await customer.action('request.create',{token:'table-02',type:'BILL_REQUEST'})).body.result;
  const week=await(await fetch(f.url+'/api/export?format=csv&period=week',{headers:{cookie:owner.cookie()}})).text();
  assert.ok(week.includes(recent.id));assert.ok(!week.includes(old.id));assert.ok(week.includes('Garzón'));
  const all=await(await fetch(f.url+'/api/export?format=csv&period=all',{headers:{cookie:owner.cookie()}})).text();assert.ok(all.includes(old.id));
  const exported=await owner.action('backup.export');assert.equal(exported.status,200);const backup=exported.body.result;
  assert.equal((await owner.action('backup.restore',{backup})).status,200);await owner.login();
  assert.equal((await owner.action('staff.pinReveal',{id:'staff-local'})).body.result.pin,'3456');
  const pin=client(f.url);assert.equal((await pin.action('auth.pin',{pin:'1234'})).status,200);
  assert.equal((await owner.get()).body.requests.length,2);
});

test('passive monitor advances eligible requests with automatic actor and timestamps',async t=>{
  const f=await fixture();t.after(()=>f.close());const owner=client(f.url),customer=client(f.url);await owner.login();
  await owner.action('settings.save',{settings:{tvAutoAccept:true,tvAutoAcceptSeconds:5,tvAutoComplete:true,tvAutoCompleteSeconds:5}});
  const call=(await customer.action('request.create',{token:'table-05',type:'CALL'})).body.result;
  call.createdAt=new Date(Date.now()-6000).toISOString();f.app.db.prepare('UPDATE requests SET data=? WHERE id=?').run(JSON.stringify(call),call.id);
  async function waitFor(status){const deadline=Date.now()+2500;while(Date.now()<deadline){const r=(await owner.get()).body.requests.find(r=>r.id===call.id);if(r.status===status)return r;await new Promise(resolve=>setTimeout(resolve,100));}assert.fail('No se alcanzó el estado '+status);}
  const accepted=await waitFor('accepted');assert.equal(accepted.staffId,'tv-auto');assert.ok(accepted.acceptedAt);assert.ok(accepted.events.some(e=>e.type==='auto-accepted'));
  accepted.acceptedAt=new Date(Date.now()-6000).toISOString();f.app.db.prepare('UPDATE requests SET data=? WHERE id=?').run(JSON.stringify(accepted),call.id);
  const completed=await waitFor('completed');assert.ok(completed.completedAt);assert.ok(completed.events.some(e=>e.type==='auto-completed'));
});
