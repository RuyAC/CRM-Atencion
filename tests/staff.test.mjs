import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.mjs';

async function fixture(t) {
  const mediaDir = mkdtempSync(path.join(os.tmpdir(), 'mate-staff-test-'));
  const app = createApp({ dbPath: ':memory:', mediaDir, host: '127.0.0.1', port: 0 });
  const address = await app.listen();
  t.after(async () => { await app.close(); rmSync(mediaDir, { recursive: true, force: true }); });
  return `http://127.0.0.1:${address.port}`;
}

function client(url) {
  let cookie = '';
  async function send(route, init = {}) {
    const response = await fetch(url + route, { ...init, headers: { ...(cookie ? { cookie } : {}), ...init.headers } });
    const next = response.headers.getSetCookie()[0];
    if (next) cookie = next.split(';')[0];
    return { status: response.status, body: await response.json() };
  }
  return {
    state: () => send('/api/state'),
    action: (action, payload = {}) => send('/api/action', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, payload }) }),
    async login(email = 'ventas@matebar.com', password = 'Chamaii2026!') {
      const result = await this.action('auth.login', { email, password });
      assert.equal(result.status, 200, result.body.error); return result;
    },
  };
}
const newMember = (extra = {}) => ({ name: 'Ana Prueba', email: 'ana@example.test', role: 'STAFF', password: 'Abc123', pin: '0876', ...extra });
const save = (actor, item) => actor.action('entity.save', { entity: 'staff', item });
const remove = (actor, id) => actor.action('entity.delete', { entity: 'staff', id });

test('team creation accepts a six-character password and exactly four PIN digits without exposing secrets', async t => {
  const url = await fixture(t), owner = client(url), member = client(url), pin = client(url);
  await owner.login();
  const saved = await save(owner, newMember());
  assert.equal(saved.status, 200);
  assert.equal(saved.body.result.password, undefined); assert.equal(saved.body.result.pin, undefined);
  await member.login('ana@example.test', 'Abc123');
  assert.equal((await pin.action('auth.pin', { staffId: saved.body.result.id, pin: '0876' })).status, 200);
  const state = (await owner.state()).body;
  assert.equal(state.staff.find(item => item.id === saved.body.result.id).password_hash, undefined);
  assert.equal((await owner.action('staff.pinReveal', { id: saved.body.result.id })).body.result.pin, '0876');
  assert.equal((await member.action('staff.pinReveal', { id: saved.body.result.id })).status, 403);
});

test('team creation rejects short passwords and every PIN outside four numeric digits atomically', async t => {
  const url = await fixture(t), owner = client(url); await owner.login();
  for (const password of ['', '12345']) {
    assert.equal((await save(owner, newMember({ password }))).status, 400);
  }
  for (const pin of ['', '123', '12345', '12345678', '12ab']) {
    assert.equal((await save(owner, newMember({ pin }))).status, 400, pin);
  }
  assert.equal((await owner.state()).body.staff.length, 3);
  assert.equal((await save(owner, newMember())).status, 200);
});

test('changing only a PIN preserves the login password and revokes password and monitor sessions', async t => {
  const url = await fixture(t), owner = client(url), member = client(url), monitor = client(url), newMonitor = client(url);
  await owner.login(); const id = (await save(owner, newMember())).body.result.id;
  await member.login('ana@example.test', 'Abc123');
  assert.equal((await monitor.action('auth.pin', { staffId: id, pin: '0876' })).status, 200);
  assert.equal((await save(owner, { id, pin: '0012' })).status, 200);
  assert.equal((await member.state()).body.viewer.user, null);
  assert.equal((await monitor.state()).body.viewer.user, null);
  assert.equal((await newMonitor.action('auth.pin', { staffId: id, pin: '0876' })).status, 401);
  assert.equal((await newMonitor.action('auth.pin', { staffId: id, pin: '0012' })).status, 200);
  await member.login('ana@example.test', 'Abc123');
  assert.equal((await owner.action('staff.pinReveal', { id })).body.result.pin, '0012');
});

test('changing only a password rejects old credentials, preserves the PIN and revokes all member sessions', async t => {
  const url = await fixture(t), owner = client(url), member = client(url), monitor = client(url);
  await owner.login(); const id = (await save(owner, newMember())).body.result.id;
  await member.login('ana@example.test', 'Abc123');
  assert.equal((await monitor.action('auth.pin', { staffId: id, pin: '0876' })).status, 200);
  assert.equal((await save(owner, { id, password: 'New456' })).status, 200);
  assert.equal((await member.state()).body.viewer.user, null);
  assert.equal((await monitor.state()).body.viewer.user, null);
  assert.equal((await member.action('auth.login', { email: 'ana@example.test', password: 'Abc123' })).status, 401);
  await member.login('ana@example.test', 'New456');
  assert.equal((await monitor.action('auth.pin', { staffId: id, pin: '0876' })).status, 200);
  assert.equal((await save(owner, { id, password: '12345' })).status, 400);
  assert.equal((await member.state()).body.viewer.user.id, id, 'a rejected credential edit keeps the existing session');
});

test('only an owner may promote staff; role changes revoke sessions but preserve both credentials', async t => {
  const url = await fixture(t), owner = client(url), manager = client(url), member = client(url), monitor = client(url);
  await owner.login(); await manager.login('gerente@local.test', 'Gerente2026!');
  const id = (await save(owner, newMember())).body.result.id;
  await member.login('ana@example.test', 'Abc123');
  assert.equal((await monitor.action('auth.pin', { staffId: id, pin: '0876' })).status, 200);
  assert.equal((await save(manager, { id, role: 'MANAGER' })).status, 403);
  assert.equal((await member.state()).body.viewer.user.role, 'STAFF');
  assert.equal((await save(member, { id, role: 'OWNER' })).status, 403);
  assert.equal((await save(owner, { id, role: 'MANAGER' })).status, 200);
  assert.equal((await member.state()).body.viewer.user, null);
  assert.equal((await monitor.state()).body.viewer.user, null);
  assert.equal((await member.login('ana@example.test', 'Abc123')).body.result.role, 'MANAGER');
  assert.equal((await monitor.action('auth.pin', { staffId: id, pin: '0876' })).body.result.role, 'MANAGER');
});

test('the last active owner cannot be demoted, deactivated or deleted', async t => {
  const url = await fixture(t), owner = client(url); await owner.login();
  assert.equal((await save(owner, { id: 'owner-local', role: 'MANAGER' })).status, 400);
  assert.equal((await save(owner, { id: 'owner-local', active: false })).status, 400);
  assert.equal((await remove(owner, 'owner-local')).status, 400);
  const state = (await owner.state()).body;
  assert.equal(state.viewer.user.role, 'OWNER');
  assert.equal(state.staff.filter(item => item.role === 'OWNER' && item.active).length, 1);
});

test('deleting a member removes login and PIN credentials and immediately revokes existing sessions', async t => {
  const url = await fixture(t), owner = client(url), member = client(url), monitor = client(url);
  await owner.login(); const id = (await save(owner, newMember())).body.result.id;
  await member.login('ana@example.test', 'Abc123');
  assert.equal((await monitor.action('auth.pin', { staffId: id, pin: '0876' })).status, 200);
  assert.equal((await remove(owner, id)).status, 200);
  assert.equal((await member.state()).body.viewer.user, null);
  assert.equal((await monitor.state()).body.viewer.user, null);
  assert.equal((await member.action('auth.login', { email: 'ana@example.test', password: 'Abc123' })).status, 401);
  assert.equal((await monitor.action('auth.pin', { staffId: id, pin: '0876' })).status, 401);
  assert.equal((await owner.action('staff.pinReveal', { id })).status, 404);
  assert.equal((await owner.state()).body.staff.some(item => item.id === id), false);
});

test('the separate self-service password policy and general TV PIN policy remain unchanged', async t => {
  const url = await fixture(t), owner = client(url); await owner.login();
  assert.equal((await owner.action('auth.password', { current: 'Chamaii2026!', newPassword: 'Abc123' })).status, 400);
  assert.equal((await owner.action('settings.save', { settings: { tvPin: '12345678' } })).status, 200);
  assert.equal((await owner.action('staff.pinReveal', { id: 'tv-general' })).body.result.pin, '12345678');
});
