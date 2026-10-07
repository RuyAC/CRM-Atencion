import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.mjs';
import { periodStart } from '../server/reporting.mjs';
import { digest, hashSecret } from '../server/security.mjs';

async function fixture(dbPath = ':memory:') {
  const mediaDir = mkdtempSync(path.join(os.tmpdir(), 'mate-saas-media-'));
  const app = createApp({ dbPath, mediaDir, host: '127.0.0.1', port: 0 });
  const address = await app.listen();
  return { app, url: `http://127.0.0.1:${address.port}`, async close() { await app.close(); rmSync(mediaDir, { recursive: true, force: true }); } };
}
function client(url, initialCookie = '') {
  let cookie = initialCookie;
  async function send(route, init = {}) {
    const response = await fetch(url + route, { ...init, headers: { ...(cookie ? { cookie } : {}), ...init.headers } });
    const next = response.headers.getSetCookie()[0]; if (next) cookie = next.split(';')[0];
    return { status: response.status, body: await response.json() };
  }
  return {
    get: (route = '/api/state') => send(route),
    action: (action, payload = {}, headers = {}) => send('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ action, payload }) }),
    async login(email = 'admin@local.test', password = 'DemoOwner-ChangeMe!') {
      const result = await this.action('auth.login', { email, password }); assert.equal(result.status, 200, result.body.error); return result;
    },
    cookie: () => cookie,
  };
}
const saveStaff = (actor, item) => actor.action('entity.save', { entity: 'staff', item });
const ownerInput = { id: 'second-owner', name: 'Ana', email: 'ana@example.test', role: 'OWNER', active: true, password: 'Owner123!', pin: '6543' };
const principalId = 'platform-admin-local';

test('SaaS authentication uses a separate platform principal, never a restaurant owner or PIN', async t => {
  const f = await fixture(); t.after(() => f.close());
  const admin = client(f.url), sales = client(f.url), anonymous = client(f.url), manager = client(f.url), staff = client(f.url), pin = client(f.url), extraOwner = client(f.url);
  assert.equal((await anonymous.get('/api/saas/state')).status, 401);
  const login = await admin.login();
  assert.equal(login.body.result.role, 'PLATFORM_ADMIN'); assert.equal(login.body.result.id, principalId);
  await sales.login('ventas@matebar.com'); await manager.login('gerente@local.test', 'DemoManager-ChangeMe!'); await staff.login('garcom@local.test', 'DemoStaff-ChangeMe!');
  assert.equal((await pin.action('auth.pin', { staffId: 'owner-local', pin: '8041' })).status, 200);
  assert.equal((await saveStaff(sales, { ...ownerInput, saasAdmin: true, grants: ['platform'] })).status, 200);
  await extraOwner.login(ownerInput.email, ownerInput.password);
  for (const [actor, status] of [[sales, 403], [manager, 403], [staff, 403], [pin, 401], [extraOwner, 403]]) {
    assert.equal((await actor.get('/api/saas/state')).status, status);
    assert.equal((await actor.get()).body.viewer.saasAdmin, false);
  }
  const state = (await admin.get()).body;
  assert.equal(state.viewer.saasAdmin, true); assert.equal(state.viewer.scope, 'platform'); assert.equal(state.viewer.monitorAuthorized, false);
  assert.equal(state.requests.length, 0); assert.equal(state.orders.length, 0); assert.equal(state.networks.length, 0);
  assert.ok(state.tables.every(table => table.token === ''));
  assert.ok(state.staff.every(member => member.id !== principalId && member.email !== 'admin@local.test'));
  assert.equal(f.app.db.prepare('SELECT id FROM credentials WHERE id=?').get(principalId), undefined);
  assert.equal(f.app.db.prepare("SELECT data FROM entities WHERE kind='staff' AND id=?").get(principalId), undefined);
  assert.equal((await admin.get('/api/saas/state')).status, 200);
  const platformPin = client(f.url);
  assert.equal((await platformPin.action('auth.pin', { staffId: principalId, pin: '8041' })).status, 401);
  f.app.db.prepare('UPDATE platform_admins SET active=0 WHERE id=?').run(principalId);
  assert.equal((await admin.get('/api/saas/state')).status, 401);
  assert.equal((await admin.get()).body.viewer.saasAdmin, false);
});

test('SaaS administrator cannot administer, operate or restore the restaurant even when the monitor is public', async t => {
  const f = await fixture(); t.after(() => f.close()); const admin = client(f.url), sales = client(f.url), customer = client(f.url);
  await admin.login(); await sales.login('ventas@matebar.com');
  const pending = (await customer.action('request.create', { token: 'table-01', type: 'CALL' })).body.result;
  assert.equal((await sales.action('settings.save', { settings: { tvRequirePin: false } })).status, 200);
  assert.equal((await admin.get()).body.viewer.monitorAuthorized, false);
  for (const [action, payload] of [
    ['entity.save', { entity: 'staff', item: { id: 'owner-local', password: 'Changed123!' } }],
    ['entity.delete', { entity: 'staff', id: 'staff-local' }],
    ['settings.save', { settings: { paused: true } }], ['table.rotate', { id: 'mesa-01' }],
    ['request.accept', { id: pending.id }], ['request.complete', { id: pending.id }],
    ['request.create', { token: 'table-02', type: 'CALL' }], ['request.cancel', { token: 'table-01', id: pending.id }],
    ['kitchen.create', { tableId: 'mesa-01', items: [{ productId: 'produto-1', quantity: 1 }] }],
    ['kitchen.update', { id: 'none', status: 'preparing' }],
    ['staff.pinReveal', { id: 'owner-local' }], ['media.upload', {}], ['backup.export', {}], ['backup.restore', {}],
  ]) assert.equal((await admin.action(action, payload)).status, 403, action);
  assert.equal((await admin.get('/api/export?format=json')).status, 403);
  assert.equal((await admin.get('/api/network')).status, 403);
  assert.equal((await admin.get('/api/saas/state')).body.summary.pendingRequests, 1);
  assert.equal((await sales.action('request.accept', { id: pending.id })).status, 200);
});

test('SaaS projections contain client accounts and canonical emails but no platform credentials or team member', async t => {
  const f = await fixture(); t.after(() => f.close()); const admin = client(f.url), sales = client(f.url); await admin.login();
  let result = (await admin.get('/api/saas/state')).body;
  assert.equal(result.accounts.length, 1); assert.equal(result.accounts[0].id, 'owner-local'); assert.equal(result.accounts[0].email, 'ventas@matebar.com');
  assert.equal(result.accounts[0].createdAt, null); assert.equal(result.accounts[0].lastLoginAt, null);
  assert.equal(result.viewer.email, 'admin@local.test'); assert.equal(result.activity.length, 0);
  assert.deepEqual(result.summary, { accounts: 1, activeAccounts: 1, restaurants: 1, staff: 3, tables: 5, products: 6, requestsToday: 0, pendingRequests: 0 });
  await sales.login('ventas@matebar.com');
  assert.equal((await saveStaff(sales, ownerInput)).status, 200);
  assert.equal((await saveStaff(sales, { id: 'credentialless', name: 'Legacy', email: 'legacy@example.test', role: 'OWNER', password: 'Abc123', pin: '0000' })).status, 200);
  f.app.db.prepare('DELETE FROM credentials WHERE id=?').run('credentialless');
  assert.equal((await sales.action('settings.save', { settings: { paused: true } })).status, 200);
  assert.equal((await sales.action('entity.save', { entity: 'tables', item: { id: 'mesa-05', active: false } })).status, 200);
  result = (await admin.get('/api/saas/state')).body;
  assert.equal(result.accounts.length, 2); assert.ok(result.accounts[0].lastLoginAt); assert.equal(result.activity[0].actorEmail, 'ventas@matebar.com');
  assert.ok(result.accounts[1].createdAt); assert.equal(result.accounts[1].lastLoginAt, null);
  assert.equal(result.restaurants[0].owners[0].email, 'ventas@matebar.com'); assert.equal(result.restaurants[0].activeTables, 4); assert.equal(result.restaurants[0].servicePaused, true);
  for (const forbidden of ['password_hash', 'pin_hash', 'pin_cipher', 'password', 'tvPin', 'wifiPassword', 'token', 'saas_admin_grants', 'platform_admins']) {
    assert.ok(!JSON.stringify(result).includes(`"${forbidden}"`), forbidden);
  }
  assert.deepEqual(Object.keys(result.viewer).sort(), ['email', 'id', 'name']);
  assert.deepEqual(Object.keys(result.accounts[0]).sort(), ['active', 'createdAt', 'email', 'id', 'lastLoginAt', 'name', 'restaurantId', 'restaurantName']);
});

test('password changes and staff administration cannot cross the platform identity boundary', async t => {
  const f = await fixture(); t.after(() => f.close()); const admin = client(f.url), sales = client(f.url); await admin.login(); await sales.login('ventas@matebar.com');
  for (const change of [{ name: 'Takeover' }, { email: 'stolen@example.test' }, { password: 'Takeover123!' }, { pin: '9999' }, { role: 'MANAGER' }, { active: false }]) {
    assert.equal((await saveStaff(sales, { ...ownerInput, id: ` ${principalId} `, ...change })).status, 403);
  }
  for (const id of ['owner-local', 'new-user']) assert.equal((await saveStaff(sales, { ...ownerInput, id, email: 'ADMIN@LOCAL.TEST' })).status, 409);
  assert.equal((await sales.action('staff.pinReveal', { id: principalId })).status, 403);
  assert.equal((await sales.action('staff.pinReveal', { id: 'owner-local' })).body.result.pin, '8041');
  assert.equal((await admin.action('auth.password', { current: 'DemoOwner-ChangeMe!', newPassword: 'Platform2026!' })).status, 200);
  const another = client(f.url);
  assert.equal((await another.action('auth.login', { email: 'admin@local.test', password: 'DemoOwner-ChangeMe!' })).status, 401);
  await another.login('admin@local.test', 'Platform2026!');
  assert.equal((await sales.action('auth.password', { current: 'DemoOwner-ChangeMe!', newPassword: 'Restaurant2026!' })).status, 200);
  await another.login('admin@local.test', 'Platform2026!');
  await sales.login('ventas@matebar.com', 'Restaurant2026!');
  assert.equal((await saveStaff(sales, { id: 'owner-local', role: 'MANAGER' })).status, 400);
  assert.equal((await sales.get()).body.viewer.saasAdmin, false);
});

test('restaurant backups omit the platform principal and restore leaves platform credentials, grants and sessions intact', async t => {
  const f = await fixture(); t.after(() => f.close()); const admin = client(f.url), sales = client(f.url), extraOwner = client(f.url); await admin.login(); await sales.login('ventas@matebar.com');
  await saveStaff(sales, ownerInput);
  let backup = (await sales.action('backup.export')).body.result;
  assert.equal((await sales.get('/api/export?format=json')).status, 200);
  assert.ok(!JSON.stringify(backup).includes('admin@local.test')); assert.ok(!JSON.stringify(backup).includes(principalId));
  assert.ok(!Object.keys(backup).some(key => key.startsWith('saas') || key === 'platform_admins' || key === 'grants'));
  const platform = f.app.db.prepare('SELECT * FROM platform_admins').all();
  const grants = f.app.db.prepare('SELECT * FROM saas_admin_grants').all();
  const injected = structuredClone(backup);
  injected.entities.staff.push({ id: principalId, name: 'Injected', email: 'fake@example.test', role: 'OWNER', active: true });
  assert.equal((await sales.action('backup.restore', { backup: injected })).status, 400);
  const reserved = structuredClone(backup); reserved.credentials[1].email = 'admin@local.test'; reserved.entities.staff[1].email = 'admin@local.test';
  assert.equal((await sales.action('backup.restore', { backup: reserved })).status, 400);
  // A different surviving restaurant owner can replace owner-local without
  // affecting the independent SaaS principal.
  backup.entities.staff = backup.entities.staff.filter(member => member.id !== 'owner-local');
  backup.credentials = backup.credentials.filter(member => member.id !== 'owner-local');
  backup.saas_admin_grants = [{ user_id: 'second-owner' }]; backup.platform_admins = [{ id: principalId, email: 'stolen@example.test', active: 0 }];
  backup.entities.staff.find(member => member.id === 'second-owner').saasAdmin = true;
  assert.equal((await sales.action('backup.restore', { backup })).status, 200);
  assert.deepEqual(f.app.db.prepare('SELECT * FROM platform_admins').all(), platform);
  assert.deepEqual(f.app.db.prepare('SELECT * FROM saas_admin_grants').all(), grants);
  assert.equal((await admin.get('/api/saas/state')).status, 200, 'platform session survives restaurant restoration');
  assert.equal((await sales.get()).body.viewer.user, null);
  await extraOwner.login(ownerInput.email, ownerInput.password);
  assert.equal((await extraOwner.get('/api/saas/state')).status, 403);
  const clean = (await extraOwner.action('backup.export')).body.result;
  assert.equal(clean.entities.staff.find(member => member.id === 'second-owner').saasAdmin, undefined);
  assert.ok(!JSON.stringify(clean).includes(principalId));
});

test('legacy restaurant backup email migrates without altering platform password or access', async t => {
  const f = await fixture(); t.after(() => f.close()); const admin = client(f.url), sales = client(f.url); await admin.login(); await sales.login('ventas@matebar.com');
  const backup = (await sales.action('backup.export')).body.result;
  backup.entities.staff.find(member => member.id === 'owner-local').email = 'admin@local.test';
  backup.credentials.find(member => member.id === 'owner-local').email = 'admin@local.test';
  backup.credentials.find(member => member.id === 'owner-local').password_hash = hashSecret('LegacyRestaurant2026!');
  backup.restaurant.contactEmail = 'admin@local.test';
  assert.equal((await sales.action('backup.restore', { backup })).status, 200);
  await sales.login('ventas@matebar.com', 'LegacyRestaurant2026!');
  await admin.login('admin@local.test', 'DemoOwner-ChangeMe!');
  assert.equal((await sales.get()).body.restaurant.contactEmail, 'ventas@matebar.com');
  assert.equal((await admin.get('/api/saas/state')).body.accounts[0].email, 'ventas@matebar.com');
});

function makeLegacy(app, grant = true) {
  const db = app.db, member = JSON.parse(db.prepare("SELECT data FROM entities WHERE kind='staff' AND id='owner-local'").get().data);
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare("UPDATE entities SET data=? WHERE kind='staff' AND id='owner-local'").run(JSON.stringify({ ...member, name: 'Administrador', email: 'admin@local.test' }));
    db.prepare('UPDATE credentials SET email=?,password_hash=? WHERE id=?').run('admin@local.test', hashSecret('OriginalOwner2026!'), 'owner-local');
    const r = JSON.parse(db.prepare('SELECT value FROM meta WHERE key=?').get('restaurant').value);
    db.prepare('UPDATE meta SET value=? WHERE key=?').run(JSON.stringify({ ...r, contactEmail: 'admin@local.test' }), 'restaurant');
    db.exec("DELETE FROM platform_admins; DELETE FROM saas_admin_grants; DELETE FROM meta WHERE key='saas_identity_v2';");
    if (grant) db.prepare('INSERT INTO saas_admin_grants(user_id) VALUES (?)').run('owner-local');
    db.prepare('INSERT INTO sessions(id_hash,user_id,scope,expires) VALUES (?,?,?,?)').run(digest('legacy-cookie'), 'owner-local', 'password', Date.now() + 86400000);
    db.prepare('INSERT INTO saas_accounts(user_id,created_at,last_login_at) VALUES (?,NULL,?)').run('owner-local', '2026-10-06T12:00:00.000Z');
    db.prepare('INSERT INTO saas_activity(id,type,actor_id,actor_name,actor_email,created_at,restaurant_name) VALUES (?,?,?,?,?,?,?)')
      .run('legacy-login', 'account.login', 'owner-local', 'Administrador', 'admin@local.test', '2026-10-06T12:00:00.000Z', 'Mate bar');
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

test('identity migration preserves data and secrets, invalidates old cookies and retains honest history', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'mate-saas-db-')), dbPath = path.join(directory, 'restaurant.sqlite');
  let f = await fixture(dbPath); t.after(async () => { await f.close(); rmSync(directory, { recursive: true, force: true }); });
  makeLegacy(f.app);
  const oldCredential = f.app.db.prepare('SELECT * FROM credentials WHERE id=?').get('owner-local');
  const preserved = f.app.db.prepare("SELECT * FROM entities WHERE kind<>'staff'").all();
  await f.close(); f = await fixture(dbPath);
  const stale = client(f.url, 'chamaii_session=legacy-cookie');
  assert.equal((await stale.get()).body.viewer.user, null); assert.equal((await stale.get('/api/saas/state')).status, 401);
  const currentCredential = f.app.db.prepare('SELECT * FROM credentials WHERE id=?').get('owner-local');
  assert.equal(currentCredential.email, 'ventas@matebar.com');
  for (const field of ['password_hash', 'pin_hash', 'pin_cipher']) assert.equal(currentCredential[field], oldCredential[field]);
  assert.equal(f.app.db.prepare('SELECT password_hash FROM platform_admins WHERE id=?').get(principalId).password_hash, oldCredential.password_hash);
  assert.deepEqual(f.app.db.prepare("SELECT * FROM entities WHERE kind<>'staff'").all(), preserved);
  const admin = client(f.url), sales = client(f.url), pin = client(f.url); await admin.login('admin@local.test', 'OriginalOwner2026!');
  let state = (await admin.get('/api/saas/state')).body;
  assert.equal(state.accounts[0].lastLoginAt, null);
  const event = state.activity.find(item => item.id === 'legacy-login');
  assert.equal(event.actorEmail, 'admin@local.test'); assert.equal(event.createdAt, '2026-10-06T12:00:00.000Z'); assert.equal(event.type, 'account.login.legacy');
  assert.equal(event.label, 'Acceso anterior a la separación de cuentas');
  await sales.login('ventas@matebar.com', 'OriginalOwner2026!'); assert.equal((await pin.action('auth.pin', { staffId: 'owner-local', pin: '8041' })).status, 200);
  const cookie = admin.cookie(); state = (await admin.get('/api/saas/state')).body;
  await f.close(); f = await fixture(dbPath);
  const resumed = client(f.url, cookie);
  assert.deepEqual((await resumed.get('/api/saas/state')).body.accounts, state.accounts);
  assert.equal((await resumed.get()).body.viewer.saasAdmin, true);
  assert.deepEqual(f.app.db.prepare('SELECT user_id FROM saas_admin_grants').all().map(row => row.user_id), [principalId]);
});

test('revoked legacy and platform grants never return during migration or restart', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'mate-saas-revoked-')), dbPath = path.join(directory, 'restaurant.sqlite');
  let f = await fixture(dbPath); t.after(async () => { await f.close(); rmSync(directory, { recursive: true, force: true }); });
  makeLegacy(f.app, false);
  await f.close(); f = await fixture(dbPath);
  const admin = client(f.url); await admin.login('admin@local.test', 'OriginalOwner2026!');
  assert.equal((await admin.get('/api/saas/state')).status, 403); assert.equal((await admin.get()).body.viewer.monitorAuthorized, false);
  f.app.db.prepare('INSERT INTO saas_admin_grants(user_id) VALUES (?)').run(principalId);
  assert.equal((await admin.get('/api/saas/state')).status, 200);
  f.app.db.prepare('DELETE FROM saas_admin_grants WHERE user_id=?').run(principalId);
  f.app.db.prepare('UPDATE meta SET value=? WHERE key=?').run('false', 'saas_bootstrap_v1');
  const cookie = admin.cookie(); await f.close(); f = await fixture(dbPath);
  const resumed = client(f.url, cookie);
  assert.equal((await resumed.get('/api/saas/state')).status, 403);
  assert.equal(f.app.db.prepare('SELECT COUNT(*) AS total FROM saas_admin_grants').get().total, 0);
});

test('disabled legacy principal cannot be reactivated by identity migration', async t => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'mate-saas-disabled-')), dbPath = path.join(directory, 'restaurant.sqlite');
  let f = await fixture(dbPath); t.after(async () => { await f.close(); rmSync(directory, { recursive: true, force: true }); });
  makeLegacy(f.app);
  const member = JSON.parse(f.app.db.prepare("SELECT data FROM entities WHERE kind='staff' AND id='owner-local'").get().data);
  f.app.db.prepare("UPDATE entities SET data=? WHERE kind='staff' AND id='owner-local'").run(JSON.stringify({ ...member, active: false }));
  await f.close(); f = await fixture(dbPath);
  const admin = client(f.url);
  assert.equal((await admin.action('auth.login', { email: 'admin@local.test', password: 'OriginalOwner2026!' })).status, 401);
  assert.equal(f.app.db.prepare('SELECT active FROM platform_admins WHERE id=?').get(principalId).active, 0);
  assert.equal(f.app.db.prepare('SELECT COUNT(*) AS total FROM saas_admin_grants').get().total, 0);
});

test('history records successful restaurant owner logins only and retains the latest 100 events', async t => {
  const f = await fixture(); t.after(() => f.close()); const admin = client(f.url), sales = client(f.url), manager = client(f.url), staff = client(f.url), pin = client(f.url);
  assert.equal((await admin.action('auth.login', { email: 'admin@local.test', password: 'wrong' })).status, 401);
  await admin.login(); await manager.login('gerente@local.test', 'DemoManager-ChangeMe!'); await staff.login('garcom@local.test', 'DemoStaff-ChangeMe!');
  assert.equal((await pin.action('auth.pin', { staffId: 'owner-local', pin: '8041' })).status, 200);
  assert.equal(f.app.db.prepare('SELECT COUNT(*) AS total FROM saas_activity').get().total, 0);
  const insert = f.app.db.prepare('INSERT INTO saas_activity(id,type,actor_id,actor_name,actor_email,created_at,restaurant_name) VALUES (?,?,?,?,?,?,?)');
  for (let index = 0; index < 110; index++) insert.run(`older-${index}`, 'account.login', 'owner-local', 'Mate bar', 'ventas@matebar.com', new Date(1700000000000 + index * 1000).toISOString(), 'Mate bar');
  await sales.login('ventas@matebar.com');
  const state = (await admin.get('/api/saas/state')).body;
  assert.equal(state.activity.length, 100); assert.equal(state.activity[0].createdAt, state.accounts[0].lastLoginAt);
  assert.equal(state.activity[0].actorEmail, 'ventas@matebar.com'); assert.ok(!state.activity.some(item => item.id === 'older-0'));
  assert.equal(f.app.db.prepare('SELECT COUNT(*) AS total FROM saas_activity').get().total, 100);
});

test('request counters respect the restaurant day and distinguish pending from accepted requests', async t => {
  const f = await fixture(); t.after(() => f.close()); const admin = client(f.url), sales = client(f.url), customer = client(f.url); await admin.login(); await sales.login('ventas@matebar.com');
  const yesterday = (await customer.action('request.create', { token: 'table-01', type: 'CALL' })).body.result;
  yesterday.createdAt = new Date(periodStart('day', 'America/La_Paz').getTime() - 1).toISOString();
  f.app.db.prepare('UPDATE requests SET data=? WHERE id=?').run(JSON.stringify(yesterday), yesterday.id);
  const today = (await customer.action('request.create', { token: 'table-02', type: 'CALL' })).body.result;
  await sales.action('request.accept', { id: today.id });
  const state = (await admin.get('/api/saas/state')).body;
  assert.equal(state.summary.requestsToday, 1); assert.equal(state.summary.pendingRequests, 1);
});

test('mutations validate the complete local origin and SSE discloses only version and time', async t => {
  const f = await fixture(); t.after(() => f.close()); const sales = client(f.url); await sales.login('ventas@matebar.com');
  assert.equal((await sales.action('entity.save', { entity: 'staff', item: { id: 'owner-local', password: 'Takeover123!' } }, { Origin: 'http://127.0.0.1:9999' })).status, 403);
  assert.equal((await sales.action('entity.save', { entity: 'staff', item: { id: 'owner-local', password: 'Takeover123!' } }, { Origin: 'http://localhost:9999' })).status, 403);
  const controller = new AbortController();
  const response = await fetch(f.url + '/api/events', { signal: controller.signal }), reader = response.body.getReader();
  await reader.read();
  assert.equal((await sales.action('entity.save', { entity: 'staff', item: { id: 'owner-local', name: 'Nuevo nombre' } }, { Origin: f.url })).status, 200);
  const event = new TextDecoder().decode((await reader.read()).value);
  const data = JSON.parse(event.split('\n').find(line => line.startsWith('data: ')).slice(6));
  assert.deepEqual(Object.keys(data).sort(), ['time', 'version']); assert.ok(!event.includes('Nuevo nombre')); assert.ok(!event.includes('ventas@matebar.com')); assert.ok(!event.includes('admin@local.test'));
  controller.abort();
});
