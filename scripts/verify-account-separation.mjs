import {createRequire} from 'node:module';
import {access, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';

// Focused verification owns its server, fresh browser and disposable database.
// It never connects to port 3001 or changes the installation's restaurant data.
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.impeccable/review/account-separation');
const temporary = await mkdtemp(path.join(os.tmpdir(), 'atencion-account-separation-'));
const results = [], errors = [], screenshots = [];
const contexts = [];
let app, browser, base;

async function check(name, run) {
  try {
    await run();
    results.push({name, result: 'passed'});
    console.log('PASS ' + name);
  } catch (error) {
    results.push({name, result: 'failed', error: error.message});
    console.error('FAIL ' + name + ': ' + error.message);
    process.exitCode = 1;
    throw error;
  }
}

async function context(width = 1440, height = 1000) {
  const actor = await browser.newContext({viewport: {width, height}, reducedMotion: 'reduce', serviceWorkers: 'block'});
  contexts.push(actor);
  await actor.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort('blockedbyclient'));
  const page = await actor.newPage();
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => errors.push({url: page.url(), message: error.message}));
  return {actor, page};
}

async function request(actor, route = '/api/state') {
  const response = await actor.request.get(base + route);
  return {status: response.status(), body: await response.json()};
}

async function action(actor, name, payload = {}) {
  const response = await actor.request.post(base + '/api/action', {data: {action: name, payload}});
  return {status: response.status(), body: await response.json()};
}

async function restaurantLogin(page, email, expected = '/dashboard') {
  await page.goto(base + '/login');
  await page.getByRole('button', {name: 'Entrar a mi cuenta', exact: true}).waitFor();
  assert.equal(await page.getByLabel('Correo electrónico', {exact: true}).inputValue(), '');
  assert.equal(await page.getByLabel('Contraseña', {exact: true}).inputValue(), '');
  await page.getByLabel('Correo electrónico', {exact: true}).fill(email);
  await page.getByLabel('Contraseña', {exact: true}).fill('DemoOwner-ChangeMe!');
  await page.getByRole('button', {name: 'Entrar a mi cuenta', exact: true}).click();
  await page.waitForURL(base + expected);
  await page.getByRole('heading', {name: expected === '/saas' ? 'Administración local' : 'Panel principal', exact: true}).waitFor();
}

async function capture(page, fileName) {
  assert(await page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth + 1), 'Hay desbordamiento horizontal');
  await page.screenshot({path: path.join(out, fileName), fullPage: true});
  screenshots.push(fileName);
}

try {
  await access(path.join(root, 'dist/index.html'));
  await mkdir(out, {recursive: true});
  app = createApp({dbPath: path.join(temporary, 'isolated.sqlite'), mediaDir: path.join(temporary, 'uploads'), host: '127.0.0.1', port: 0});
  const address = await app.listen();
  base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({headless: true, channel: 'msedge'});
  const platform = await context(), restaurant = await context();
  let platformId;

  await check('El administrador SaaS entra y conserva la lista exclusiva de clientes', async () => {
    await platform.page.goto(base + '/saas/accounts');
    await platform.page.getByRole('heading', {name: 'Administración de Atencion', exact: true}).waitFor();
    assert.equal(await platform.page.getByLabel('Correo electrónico', {exact: true}).inputValue(), '');
    assert.equal(await platform.page.getByLabel('Contraseña', {exact: true}).inputValue(), '');
    await platform.page.getByLabel('Correo electrónico', {exact: true}).fill('admin@local.test');
    await platform.page.getByLabel('Contraseña', {exact: true}).fill('DemoOwner-ChangeMe!');
    await platform.page.getByRole('button', {name: 'Entrar a la administración', exact: true}).click();
    await platform.page.getByRole('heading', {name: 'Cuentas de Atencion', exact: true}).waitFor();
    const snapshot = await request(platform.actor, '/api/saas/state');
    assert.equal(snapshot.status, 200);
    assert.equal(snapshot.body.viewer.email, 'admin@local.test');
    platformId = snapshot.body.viewer.id;
    assert.notEqual(platformId, 'owner-local');
    assert.deepEqual(snapshot.body.accounts.map(account => account.email), ['ventas@matebar.com']);
    assert.deepEqual(snapshot.body.restaurants[0].owners.map(owner => owner.email), ['ventas@matebar.com']);
    assert.equal(snapshot.body.summary.staff, 3);
    assert.equal(snapshot.body.activity.length, 0);
    const rows = platform.page.locator('.saas-account-table tbody tr:visible');
    await rows.getByText('ventas@matebar.com', {exact: true}).waitFor();
    assert(!(await rows.innerText()).includes('admin@local.test'));
    await capture(platform.page, 'desktop-client-account.png');
  });

  await check('La cuenta SaaS no obtiene equipo, monitor, PIN ni mutaciones del restaurante', async () => {
    const state = (await request(platform.actor)).body;
    assert.equal(state.viewer.user.role, 'PLATFORM_ADMIN');
    assert.equal(state.viewer.scope, 'platform');
    assert.equal(state.viewer.saasAdmin, true);
    assert.equal(state.viewer.monitorAuthorized, false);
    assert.deepEqual(state.requests, []);
    assert.deepEqual(state.orders, []);
    for (const [name, payload] of [
      ['settings.save', {settings: {paused: true}}],
      ['entity.save', {entity: 'staff', item: {name: 'No permitido', email: 'forbidden@example.test', role: 'STAFF', password: 'Denied2026!', pin: '4567'}}],
      ['staff.pinReveal', {id: 'owner-local'}],
      ['backup.export', {}],
    ]) assert.equal((await action(platform.actor, name, payload)).status, 403, name + ' debe estar denegado a la sesión SaaS');
    assert.equal((await action(platform.actor, 'auth.pin', {staffId: platformId, pin: '8041'})).status, 401);
  });

  await check('La navegación del SaaS ofrece login de cliente sin abrir directamente el panel', async () => {
    await platform.page.getByRole('button', {name: 'Ver cuenta de Mate bar', exact: true}).click();
    const dialog = platform.page.getByRole('dialog');
    await dialog.getByText('La administración del restaurante requiere iniciar sesión con su cuenta de cliente.', {exact: true}).waitFor();
    assert.equal(await dialog.getByRole('link', {name: 'Abrir restaurante', exact: true}).count(), 0);
    assert.equal(await dialog.getByRole('link', {name: 'Gestionar equipo', exact: true}).count(), 0);
    await platform.page.keyboard.press('Escape');
    await dialog.waitFor({state: 'hidden'});
    const link = platform.page.locator('.saas-sidebar').getByRole('link', {name: 'Entrar al restaurante', exact: true});
    assert.equal(await link.getAttribute('href'), '/login');
    await link.click();
    await platform.page.getByRole('button', {name: 'Entrar a mi cuenta', exact: true}).waitFor();
    assert.equal(await platform.page.locator('#admin-navigation').count(), 0);
    await platform.page.goto(base + '/dashboard');
    await platform.page.waitForURL(base + '/saas');
    await platform.page.getByRole('heading', {name: 'Administración local', exact: true}).waitFor();
  });

  await check('Ventas entra a Mate bar como propietario sin permiso SaaS', async () => {
    await restaurantLogin(restaurant.page, 'ventas@matebar.com');
    const state = (await request(restaurant.actor)).body;
    assert.equal(state.viewer.user.id, 'owner-local');
    assert.equal(state.viewer.user.email, 'ventas@matebar.com');
    assert.equal(state.viewer.user.role, 'OWNER');
    assert.equal(state.viewer.saasAdmin, false);
    assert.equal(state.staff.length, 3);
    assert(!state.staff.some(member => member.email === 'admin@local.test'));
    assert.equal(await restaurant.page.locator('#admin-navigation a[href="/saas"]').count(), 0);
    assert.equal((await action(restaurant.actor, 'settings.save', {settings: {paused: false}})).status, 200);
    const backup = await action(restaurant.actor, 'backup.export');
    assert.equal(backup.status, 200);
    assert(!backup.body.result.credentials.some(credential => credential.email === 'admin@local.test'));
    await capture(restaurant.page, 'desktop-restaurant.png');
  });

  await check('El propietario cliente recibe denegación real al entrar al SaaS', async () => {
    const denied = await request(restaurant.actor, '/api/saas/state');
    assert.equal(denied.status, 403);
    assert.equal(denied.body.accounts, undefined);
    await restaurant.page.goto(base + '/saas/accounts');
    await restaurant.page.getByRole('heading', {name: 'Acceso reservado a administradores de Atencion', exact: true}).waitFor();
    assert.equal(await restaurant.page.locator('.saas-account-table,.saas-account-cards').count(), 0);
    await capture(restaurant.page, 'restaurant-denied-saas.png');
  });

  await check('Entrar como plataforma desde el login común redirige al SaaS', async () => {
    const separate = await context();
    await restaurantLogin(separate.page, 'admin@local.test', '/saas');
    assert.equal(await separate.page.locator('#admin-navigation').count(), 0);
    assert.equal((await request(separate.actor, '/api/saas/state')).status, 200);
  });

  await check('Solo el acceso de ventas aparece en la actividad del restaurante', async () => {
    const snapshot = (await request(platform.actor, '/api/saas/state')).body;
    assert.deepEqual(snapshot.activity.map(entry => entry.actorEmail), ['ventas@matebar.com']);
    assert.equal(snapshot.accounts[0].lastLoginAt, snapshot.activity[0].createdAt);
    assert.equal(snapshot.accounts[0].createdAt, null);
  });

  await check('Móvil permite entrar al restaurante y ver la cuenta cliente sin errores ni desbordes', async () => {
    const mobile = await context(390, 844);
    await restaurantLogin(mobile.page, 'ventas@matebar.com');
    await capture(mobile.page, 'mobile-restaurant.png');
    await restaurantLogin(mobile.page, 'admin@local.test', '/saas');
    await mobile.page.goto(base + '/saas/accounts');
    await mobile.page.getByRole('heading', {name: 'Cuentas de Atencion', exact: true}).waitFor();
    await mobile.page.locator('.saas-account-cards').getByText('ventas@matebar.com', {exact: true}).waitFor();
    await capture(mobile.page, 'mobile-client-account.png');
  });

  await check('Sin excepciones JavaScript en los accesos, cambios de sesión y rutas verificadas', async () => assert.deepEqual(errors, []));
} catch (error) {
  console.error(error.stack);
  process.exitCode = 1;
} finally {
  await mkdir(out, {recursive: true});
  await writeFile(path.join(out, 'results.json'), JSON.stringify({fixture: 'SQLite y navegador aislados; sin acceso a datos principales; solicitudes externas bloqueadas', results, errors, screenshots}, null, 2));
  for (const actor of contexts) await actor.close();
  await browser?.close();
  await app?.close();
  const resolved = path.resolve(temporary);
  assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
  assert(path.basename(resolved).startsWith('atencion-account-separation-'));
  await rm(resolved, {recursive: true, force: true});
}
