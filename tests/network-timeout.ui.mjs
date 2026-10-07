import { createRequire } from 'node:module';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createApp } from '../server/index.mjs';
import { localCandidates } from '../src/network-client.js';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const directory = await mkdtemp(path.join(os.tmpdir(), 'mate-network-timeout-'));
const app = createApp({ dbPath: path.join(directory, 'network.sqlite'), mediaDir: path.join(directory, 'uploads'), host: '127.0.0.1', port: 0 });
let browser, publicMode = 'pending';
const pendingRequests = [], errors = [];

try {
  const address = await app.listen(), base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({ headless: true, channel: 'msedge' });
  const context = await browser.newContext();
  await context.route('https://api.ipify.org/**', async route => {
    const responseIp = publicMode === 'pending' ? '9.9.9.9' : '8.8.8.8';
    let finish;
    if (publicMode === 'pending') {
      const completed = new Promise(resolve => { finish = resolve; });
      await new Promise(release => pendingRequests.push({ release, completed }));
    }
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ ip: responseIp }) }).catch(() => {});
    finish?.();
  });
  const admin = await context.newPage();
  admin.on('pageerror', error => errors.push(error.message));
  await admin.goto(base + '/dashboard');
  await admin.getByLabel('Correo electrónico', { exact: true }).fill('ventas@matebar.com');
  await admin.getByLabel('Contraseña', { exact: true }).fill('DemoOwner-ChangeMe!');
  await admin.getByRole('button', { name: 'Entrar a mi cuenta', exact: true }).click();
  await admin.getByRole('heading', { name: 'Panel principal', exact: true }).waitFor();
  const diagnostic = await (await context.request.get(base + '/api/network')).json();
  const physical = localCandidates(diagnostic)[0];
  assert(physical, 'Se necesita una interfaz física privada real para la prueba de LAN.');
  await context.route('**/api/network', route => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify({ ...diagnostic, addresses: [physical] }),
  }));
  await admin.goto(base + '/dashboard/networks');
  await admin.getByRole('alert').filter({ hasText: 'La detección tardó demasiado' }).waitFor({ timeout: 12000 });
  assert(await admin.getByRole('button', { name: 'Detectar mi conexión', exact: true }).isEnabled());
  assert(await admin.getByRole('button', { name: 'Registrar esta red', exact: true }).isDisabled());
  assert(await admin.getByRole('button', { name: 'Guardar esta IP ahora', exact: true }).isDisabled());
  await admin.getByRole('button', { name: 'Registrar manualmente', exact: true }).click();
  const dialog = admin.getByRole('dialog');
  assert.deepEqual(await dialog.getByRole('combobox', { name: /Autorizar teléfonos en la misma red local/ }).locator('option').evaluateAll(options => options.map(option => option.value)), ['', physical.cidr]);
  await admin.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  console.log('PASS timeout explícito conserva la LAN y habilita reintento');

  publicMode = 'success';
  await admin.getByRole('button', { name: 'Detectar mi conexión', exact: true }).click();
  await admin.waitForFunction(() => document.querySelector('[data-testid="current-public-ip"]')?.textContent === '8.8.8.8');
  assert.equal(await admin.getByTestId('current-public-ip').innerText(), '8.8.8.8');
  assert.equal(await admin.getByRole('alert').count(), 0);
  assert(await admin.getByRole('button', { name: 'Registrar esta red', exact: true }).isEnabled());
  assert.equal(await admin.getByRole('button', { name: 'Detectar mi conexión', exact: true }).count(), 0);
  const staleRequests = pendingRequests.splice(0);
  for (const request of staleRequests) request.release();
  await Promise.all(staleRequests.map(request => request.completed));
  await admin.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
  assert.equal(await admin.getByTestId('current-public-ip').innerText(), '8.8.8.8');
  await admin.getByRole('button', { name: 'Guardar esta IP ahora', exact: true }).click();
  await admin.getByRole('button', { name: 'IP registrada', exact: true }).waitFor();
  assert.equal(await admin.getByRole('dialog').count(), 0);
  const body = await (await context.request.get(base + '/api/state')).json();
  const saved = (body.state || body).networks.filter(network => network.ip === '8.8.8.8');
  assert.equal(saved.length, 1);
  assert.equal(saved[0].localCidr, physical.cidr);
  assert.deepEqual(errors, []);
  console.log('PASS reintento limpia el error, descarta la respuesta antigua y registra directamente con LAN física');
} finally {
  for (const request of pendingRequests) request.release();
  await browser?.close();
  await app.close();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
  assert(path.basename(directory).startsWith('mate-network-timeout-'));
  await rm(directory, { recursive: true, force: true });
}
