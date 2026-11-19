import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApp } from '../server/index.mjs';
import { normalizeIp, isLoopback, parseLocalCidr, matchesLocalCidr, networkAllowsIp, localInterfaces, canRegisterLocalCidr } from '../server/network.mjs';

const physicalInterfaces = {
  'Wi-Fi': [{ family: 'IPv4', internal: false, address: '192.168.50.10', netmask: '255.255.255.0', cidr: '192.168.50.10/24' }],
  Ethernet: [{ family: 'IPv4', internal: false, address: '192.168.60.10', netmask: '255.255.255.0', cidr: '192.168.60.10/24' }],
  'vEthernet (WSL)': [{ family: 'IPv4', internal: false, address: '172.25.208.1', netmask: '255.255.240.0', cidr: '172.25.208.1/20' }],
  Loopback: [{ family: 'IPv4', internal: true, address: '127.0.0.1', netmask: '255.0.0.0', cidr: '127.0.0.1/8' }],
};

async function fixture(t) {
  const mediaDir = mkdtempSync(path.join(os.tmpdir(), 'atencion-network-media-'));
  const app = createApp({ dbPath: ':memory:', mediaDir, host: '127.0.0.1', port: 0 });
  let sourceIp = null;
  // Simulate LAN peers at the socket boundary; production still obtains its IP from the socket.
  app.server.prependListener('request', request => {
    if (sourceIp) Object.defineProperty(request.socket, 'remoteAddress', { value: sourceIp, configurable: true });
  });
  const address = await app.listen();
  t.after(async () => { await app.close(); rmSync(mediaDir, { recursive: true, force: true }); });
  return { app, url: `http://127.0.0.1:${address.port}`, setSourceIp(ip) { sourceIp = ip; } };
}

function client(url) {
  let cookie = '';
  async function send(route, init = {}) {
    const response = await fetch(url + route, { ...init, headers: { ...(cookie ? { cookie } : {}), ...init.headers } });
    const nextCookie = response.headers.getSetCookie()[0];
    if (nextCookie) cookie = nextCookie.split(';')[0];
    return { status: response.status, body: await response.json() };
  }
  return {
    get: (route, headers = {}) => send(route, { headers }),
    action: (action, payload = {}, headers = {}) => send('/api/action', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ action, payload }),
    }),
    async login(email = 'ventas@matebar.com', password = 'Atencion2026!') {
      const result = await this.action('auth.login', { email, password }); assert.equal(result.status, 200); return result;
    },
  };
}

test('local CIDR parsing canonicalizes host bits and limits ranges to private /16 through /30', () => {
  for (const [input, canonical] of [
    ['192.168.50.211/24', '192.168.50.0/24'], ['10.7.255.255/16', '10.7.0.0/16'],
    ['172.16.2.7/30', '172.16.2.4/30'], ['172.31.255.255/16', '172.31.0.0/16'],
  ]) assert.equal(parseLocalCidr(input)?.cidr, canonical, input);
  for (const input of [
    '', '192.168.50.0', '192.168.50.0/0', '10.0.0.0/8', '192.168.0.0/15', '192.168.50.0/31', '192.168.50.1/32',
    '203.0.113.0/24', '172.15.0.0/16', '172.32.0.0/16', '127.0.0.0/24', '169.254.0.0/16',
    '192.168.256.1/24', '192.168.050.0/24', '192.168.50.0/24/1', '192.168.50.0/-1', '192.168.50.0/24.0',
    '192.168.50.0/ 24', '192.168.50.0/024', 'fd00::/64', '::ffff:192.168.50.0/24',
  ]) assert.equal(parseLocalCidr(input), null, input);
});

test('local CIDR admits two distinct clients and rejects the adjacent subnets', () => {
  for (const ip of ['192.168.50.21', '192.168.50.22', '::ffff:192.168.50.22']) assert.equal(matchesLocalCidr(ip, '192.168.50.0/24'), true, ip);
  for (const ip of ['192.168.49.255', '192.168.51.0', '10.0.0.21', '127.0.0.1', '::1', 'bad']) assert.equal(matchesLocalCidr(ip, '192.168.50.0/24'), false, ip);
  assert.equal(matchesLocalCidr('172.16.2.3', '172.16.2.4/30'), false);
  assert.equal(matchesLocalCidr('172.16.2.4', '172.16.2.4/30'), true);
  assert.equal(matchesLocalCidr('172.16.2.7', '172.16.2.4/30'), true);
  assert.equal(matchesLocalCidr('172.16.2.8', '172.16.2.4/30'), false);
});

test('network authorization preserves exact IPs, IPv4 mapping and local loopback without widening an inactive network', () => {
  assert.equal(normalizeIp('::FFFF:192.168.50.21'), '192.168.50.21');
  assert.equal(isLoopback('::ffff:127.0.0.1'), true);
  assert.equal(isLoopback('192.168.50.21'), false);
  assert.equal(networkAllowsIp({ ip: '203.0.113.21' }, '::ffff:203.0.113.21'), true);
  assert.equal(networkAllowsIp({ ip: '203.0.113.21' }, '203.0.113.22'), false);
  assert.equal(networkAllowsIp({ ip: '127.0.0.1' }, '::1'), true);
  const saved = { ip: '203.0.113.21', localCidr: '192.168.50.0/24' };
  assert.equal(networkAllowsIp(saved, '192.168.50.22'), true);
  assert.equal(networkAllowsIp(saved, '192.168.51.22'), false);
  assert.equal(networkAllowsIp({ ...saved, active: false }, '203.0.113.21'), false);
  assert.equal(networkAllowsIp({ ...saved, active: false }, '192.168.50.22'), false);
});

test('interface detection canonicalizes subnets, filters internal and IPv6 entries and marks virtual adapters', () => {
  const addresses = localInterfaces({ ...physicalInterfaces, IPv6: [{ family: 'IPv6', internal: false, address: 'fd00::1', cidr: 'fd00::1/64' }] });
  assert.deepEqual(addresses.map(item => [item.name, item.cidr, item.virtual]), [
    ['Wi-Fi', '192.168.50.0/24', false], ['Ethernet', '192.168.60.0/24', false], ['vEthernet (WSL)', '172.25.208.0/20', true],
  ]);
  for (const name of ['Docker', 'VMware', 'TUN', 'TAP', 'VPN', 'Tailscale', 'ZeroTier', 'WireGuard', 'NordLynx', 'Cloudflare WARP', 'WARP']) {
    const detected = localInterfaces({ [name]: physicalInterfaces['Wi-Fi'] });
    assert.equal(detected[0].virtual, true, name);
    assert.equal(canRegisterLocalCidr('192.168.50.0/24', '127.0.0.1', detected), false, name);
  }
});

test('registration requires the canonical subnet of a physical interface and a local requester', () => {
  const addresses = localInterfaces(physicalInterfaces);
  for (const ip of ['127.0.0.1', '::1', '::ffff:127.0.0.1', '192.168.50.21', '::ffff:192.168.50.22']) {
    assert.equal(canRegisterLocalCidr('192.168.50.0/24', ip, addresses), true, ip);
  }
  for (const [cidr, ip] of [
    ['192.168.50.10/24', '127.0.0.1'], ['192.168.50.0/16', '127.0.0.1'], ['192.168.51.0/24', '127.0.0.1'],
    ['172.25.208.0/20', '127.0.0.1'], ['192.168.50.0/24', '192.168.60.21'], ['192.168.50.0/24', '203.0.113.21'],
    ['0.0.0.0/0', '127.0.0.1'],
  ]) assert.equal(canRegisterLocalCidr(cidr, ip, addresses), false, `${cidr} from ${ip}`);
});

test('network diagnostics require an administrator and ignore forged forwarded headers', async t => {
  t.mock.method(os, 'networkInterfaces', () => physicalInterfaces);
  const f = await fixture(t), owner = client(f.url), stranger = client(f.url), staff = client(f.url), pin = client(f.url);
  assert.equal((await stranger.get('/api/network')).status, 401);
  await staff.login('garcom@local.test', 'Garcom2026!');
  assert.equal((await staff.get('/api/network')).status, 403);
  assert.equal((await pin.action('auth.pin', { pin: '1234' })).status, 200);
  assert.equal((await pin.get('/api/network')).status, 401);
  await owner.login();
  const result = await owner.get('/api/network', { 'X-Forwarded-For': '203.0.113.99', 'X-Real-IP': '203.0.113.99', Forwarded: 'for=203.0.113.99' });
  assert.equal(result.status, 200);
  assert.equal(result.body.ip, '127.0.0.1'); assert.equal(result.body.remoteIp, '127.0.0.1');
  assert.deepEqual(result.body.addresses, localInterfaces(physicalInterfaces));
});

test('the API rejects virtual, unrelated, noncanonical and overly broad subnet registrations', async t => {
  t.mock.method(os, 'networkInterfaces', () => physicalInterfaces);
  const f = await fixture(t), owner = client(f.url); await owner.login();
  for (const localCidr of ['172.25.208.0/20', '192.168.51.0/24', '192.168.50.10/24', '192.168.0.0/16', '0.0.0.0/0']) {
    const response = await owner.action('entity.save', { entity: 'networks', item: { name: 'Rejected', ip: '203.0.113.21', localCidr } });
    assert.equal(response.status, 400, localCidr);
  }
  f.setSourceIp('192.168.60.21');
  const forged = await owner.action('entity.save', { entity: 'networks', item: { name: 'Forged', ip: '203.0.113.21', localCidr: '192.168.50.0/24' } }, { 'X-Forwarded-For': '192.168.50.21' });
  assert.equal(forged.status, 400);
  assert.deepEqual((await owner.get('/api/state')).body.networks, []);
});

test('presence authorizes two LAN clients while an outsider cannot supply an authorized forwarded IP', async t => {
  t.mock.method(os, 'networkInterfaces', () => physicalInterfaces);
  const f = await fixture(t), owner = client(f.url), customer = client(f.url); await owner.login();
  assert.equal((await owner.action('entity.save', { entity: 'networks', item: { name: 'Restaurant LAN', ip: '203.0.113.21', localCidr: '192.168.50.0/24' } })).status, 200);
  await owner.action('settings.save', { settings: { presenceMode: 'wifi' } });
  for (const ip of ['192.168.50.21', '::ffff:192.168.50.22']) {
    f.setSourceIp(ip);
    const result = await customer.action('presence.check', { token: 'table-05' });
    assert.equal(result.body.result.allowed, true, ip); assert.equal(result.body.result.reason, 'wifi');
  }
  f.setSourceIp('192.168.51.21');
  const result = await customer.action('presence.check', { token: 'table-05' }, { 'X-Forwarded-For': '192.168.50.21' });
  assert.equal(result.body.result.allowed, false);
  assert.equal((await customer.action('request.create', { token: 'table-05', type: 'CALL' }, { 'X-Forwarded-For': '192.168.50.21' })).status, 403);
});

test('strict proof stays bound to its client and changing the subnet invalidates it even when the exact IP remains authorized', async t => {
  t.mock.method(os, 'networkInterfaces', () => physicalInterfaces);
  const f = await fixture(t), owner = client(f.url), customer = client(f.url); await owner.login();
  const saved = await owner.action('entity.save', { entity: 'networks', item: { name: 'Restaurant LAN', ip: '192.168.50.21', localCidr: '192.168.50.0/24' } });
  assert.equal(saved.status, 200);
  await owner.action('settings.save', { settings: { presenceMode: 'strict', cooldownSeconds: 0 } });
  f.setSourceIp('192.168.50.21');
  assert.equal((await customer.action('request.create', { token: 'table-05', type: 'CALL' })).status, 403);
  assert.equal((await customer.action('presence.check', { token: 'table-05' })).body.result.allowed, true);
  f.setSourceIp('192.168.50.22');
  assert.equal((await customer.action('request.create', { token: 'table-05', type: 'CALL' })).status, 403);
  f.setSourceIp('192.168.50.21');
  const call = await customer.action('request.create', { token: 'table-05', type: 'CALL' }); assert.equal(call.status, 200);
  assert.equal((await customer.action('request.cancel', { token: 'table-05', id: call.body.result.id })).status, 200);
  f.setSourceIp('127.0.0.1');
  assert.equal((await owner.action('entity.save', { entity: 'networks', item: { ...saved.body.result, localCidr: '192.168.60.0/24' } })).status, 200);
  f.setSourceIp('192.168.50.21');
  const stale = await customer.action('request.create', { token: 'table-05', type: 'CALL' });
  assert.equal(stale.status, 403); assert.match(stale.body.error, /sesión/i);
  assert.equal((await customer.action('presence.check', { token: 'table-05' })).body.result.allowed, true);
  assert.equal((await customer.action('request.create', { token: 'table-05', type: 'CALL' })).status, 200);
});

test('local CIDR is persisted across restart and retained on partial network updates', async t => {
  t.mock.method(os, 'networkInterfaces', () => physicalInterfaces);
  const directory = mkdtempSync(path.join(os.tmpdir(), 'atencion-network-db-'));
  const options = { dbPath: path.join(directory, 'restaurant.sqlite'), mediaDir: path.join(directory, 'uploads'), host: '127.0.0.1', port: 0 };
  let app = createApp(options);
  t.after(async () => { await app.close(); rmSync(directory, { recursive: true, force: true }); });
  const firstAddress = await app.listen(), owner = client(`http://127.0.0.1:${firstAddress.port}`); await owner.login();
  const saved = await owner.action('entity.save', { entity: 'networks', item: { name: 'Restaurant LAN', ip: '203.0.113.21', localCidr: '192.168.50.0/24' } }); assert.equal(saved.status, 200);
  await app.close(); app = createApp(options);
  const secondAddress = await app.listen(), restoredOwner = client(`http://127.0.0.1:${secondAddress.port}`); await restoredOwner.login();
  const restored = (await restoredOwner.get('/api/state')).body.networks.find(item => item.id === saved.body.result.id);
  assert.equal(restored.localCidr, '192.168.50.0/24');
  const updated = await restoredOwner.action('entity.save', { entity: 'networks', item: { id: restored.id, name: 'Renamed LAN', active: false } });
  assert.equal(updated.status, 200); assert.equal(updated.body.result.localCidr, '192.168.50.0/24'); assert.equal(updated.body.result.active, false);
});

test('network dates come from the server and preserve creation on partial updates', async t => {
  const f = await fixture(t), owner = client(f.url); await owner.login();
  const before = Date.now();
  const saved = await owner.action('entity.save', { entity: 'networks', item: { name: 'Red verificada', ip: '8.8.8.8', createdAt: '1900-01-01', updatedAt: '1900-01-01' } });
  assert.equal(saved.status, 200);
  assert(Date.parse(saved.body.result.createdAt) >= before);
  assert(Date.parse(saved.body.result.updatedAt) >= before);
  const updated = await owner.action('entity.save', { entity: 'networks', item: { id: saved.body.result.id, active: false, createdAt: '1900-01-01', updatedAt: '1900-01-01' } });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.result.createdAt, saved.body.result.createdAt);
  assert(Date.parse(updated.body.result.updatedAt) >= Date.parse(saved.body.result.updatedAt));
  assert.equal(updated.body.result.name, 'Red verificada');
  assert.equal(updated.body.result.ip, '8.8.8.8');
  const restored = (await owner.get('/api/state')).body.networks.find(n => n.id === saved.body.result.id);
  assert.equal(restored.updatedAt, updated.body.result.updatedAt);
  const legacy = { id: 'legacy-wifi', name: 'Red antigua', ip: '1.1.1.1', active: true };
  f.app.db.prepare('INSERT INTO entities(kind,id,data) VALUES (?,?,?)').run('networks', legacy.id, JSON.stringify(legacy));
  const editedLegacy = await owner.action('entity.save', { entity: 'networks', item: { id: legacy.id, active: false } });
  assert.equal(editedLegacy.status, 200);
  assert.equal(editedLegacy.body.result.createdAt, undefined);
  assert(Date.parse(editedLegacy.body.result.updatedAt) >= before);
});
