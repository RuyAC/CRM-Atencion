import {createRequire} from 'node:module';
import {access, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';

// This batch owns its localhost server, disposable SQLite and fresh browser.
// It never connects to the running installation or the primary database.
const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.impeccable/review/saas');
const directory = await mkdtemp(path.join(os.tmpdir(), 'atencion-saas-ui-'));
const routes = [
  ['/saas', 'Administración local', 'overview'],
  ['/saas/accounts', 'Cuentas de Atencion', 'accounts'],
  ['/saas/restaurants', 'Restaurantes', 'restaurants'],
  ['/saas/activity', 'Actividad', 'activity'],
];
const viewports = [[1440, 1000], [768, 900], [390, 844], [320, 740]];
const results = [], errors = [], consoleErrors = [], geometry = {}, focusStyles = {}, deniedResponses = [];
let app, browser, context, restaurantContext, page, base, initial;

async function check(name, callback) {
  try {
    await callback();
    results.push({name, result: 'passed'});
    console.log('PASS ' + name);
  } catch (error) {
    results.push({name, result: 'failed', error: error.message});
    console.error('FAIL ' + name + ': ' + error.message);
    process.exitCode = 1;
  }
}

function observe(target) {
  target.setDefaultTimeout(10000);
  target.on('pageerror', error => errors.push({url: target.url(), error: error.message}));
  target.on('console', message => {
    if (message.type() === 'error') consoleErrors.push({url: target.url(), text: message.text()});
  });
}

async function ownedContext(options = {}) {
  const ctx = await browser.newContext({viewport: {width: 1440, height: 1000}, reducedMotion: 'reduce', serviceWorkers: 'block', acceptDownloads: true, ...options});
  await ctx.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === base) return route.continue();
    return route.abort('blockedbyclient');
  });
  return ctx;
}

async function action(ctx, name, payload = {}, expected = 200) {
  const response = await ctx.request.post(base + '/api/action', {data: {action: name, payload}});
  const body = await response.json();
  assert.equal(response.status(), expected, `${name}: ${JSON.stringify(body)}`);
  return body;
}

async function snapshot() {
  const response = await context.request.get(base + '/api/saas/state');
  assert.equal(response.status(), 200);
  return response.json();
}

async function open(route, target = page) {
  const expected = routes.find(item => item[0] === route);
  await target.goto(base + route);
  await target.locator('#saas-content').getByRole('heading', {name: expected[1], exact: true}).waitFor();
  await target.evaluate(() => document.fonts.ready);
  await target.mouse.move(0, 0);
}

async function layout(target = page) {
  return target.evaluate(() => {
    const rounded = value => Math.round(value * 100) / 100;
    const box = element => {
      if (!element) return null;
      const b = element.getBoundingClientRect();
      return {x: rounded(b.x), y: rounded(b.y), width: rounded(b.width), height: rounded(b.height)};
    };
    const visible = element => Boolean(element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden');
    const selectors = ['.saas-sidebar', '.saas-workspace', '.saas-topbar', '#saas-content', '.saas-heading', '.saas-filters', '.saas-account-table', '.saas-account-cards', '.saas-restaurant-table', '.saas-restaurant-cards', 'dialog[open]'];
    const controls = [...document.querySelectorAll('button,input,select,a')].filter(visible).map(element => ({name: element.getAttribute('aria-label') || element.textContent.trim() || element.getAttribute('placeholder'), tag: element.tagName, box: box(element)}));
    const overflowing = [...document.querySelectorAll('body *')].filter(visible).map(element => ({tag: element.tagName, className: element.getAttribute('class'), box: box(element)})).filter(item => item.box.x < -1 || item.box.x + item.box.width > innerWidth + 1).slice(0, 20);
    const motion = [...document.querySelectorAll('.saas-app *')].filter(visible).map(element => {
      const style = getComputedStyle(element);
      return {selector: element.tagName.toLowerCase() + (element.className && typeof element.className === 'string' ? '.' + element.className.trim().replaceAll(' ', '.') : ''), animationName: style.animationName, animationDuration: style.animationDuration, transitionDuration: style.transitionDuration};
    }).filter(item => item.animationName !== 'none' || item.transitionDuration.split(',').some(value => parseFloat(value) > 0));
    return {viewport: {width: innerWidth, height: innerHeight}, pageOverflow: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - innerWidth, boxes: Object.fromEntries(selectors.map(selector => [selector, box(document.querySelector(selector))])), controls, overflowing, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, motion};
  });
}

async function noOverflow(label) {
  const shot = await layout();
  geometry[label] = shot;
  assert(shot.pageOverflow <= 1, `${label}: desborde horizontal de ${shot.pageOverflow}px`);
  return shot;
}

function accountTrigger(name = 'Mate bar', target = page) {
  return target.getByRole('button', {name: 'Ver cuenta de ' + name, exact: true});
}

async function closeDialog(target = page) {
  await target.keyboard.press('Escape');
  await target.getByRole('dialog').waitFor({state: 'hidden'});
}

async function trapDialog(target = page) {
  const dialog = target.getByRole('dialog');
  assert.equal(await dialog.evaluate(element => element.tagName), 'DIALOG');
  assert(await dialog.evaluate(element => element.open && element.matches(':modal')));
  for (const key of ['Tab', 'Shift+Tab']) {
    for (let index = 0; index < 12; index++) {
      await target.keyboard.press(key);
      assert(await dialog.evaluate(element => element.contains(document.activeElement)), `${key} salió del diálogo`);
    }
  }
}

function csvRows(text) {
  const rows = [], row = [];
  let field = '', quoted = false;
  text = text.replace(/^\uFEFF/, '');
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {field += '"'; index++;}
      else quoted = !quoted;
    } else if (char === ',' && !quoted) {row.push(field); field = '';}
    else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index++;
      row.push(field); rows.push([...row]); row.length = 0; field = '';
    } else field += char;
  }
  if (field || row.length) {row.push(field); rows.push(row);}
  assert(!quoted, 'CSV tiene una celda sin cierre');
  return rows;
}

async function exportCsv(fileName) {
  const downloadPending = page.waitForEvent('download');
  await page.getByRole('button', {name: 'Exportar cuentas', exact: true}).click();
  const download = await downloadPending;
  assert.equal(download.suggestedFilename(), 'atencion-cuentas.csv');
  const destination = path.join(out, fileName);
  await download.saveAs(destination);
  const text = await readFile(destination, 'utf8');
  assert.equal(text.charCodeAt(0), 0xFEFF, 'CSV debe conservar BOM UTF-8');
  return csvRows(text);
}

async function denial(name, credentials = null, pin = null) {
  const ctx = await ownedContext(), denied = await ctx.newPage();
  observe(denied);
  try {
    if (credentials) await action(ctx, 'auth.login', credentials);
    if (pin) await action(ctx, 'auth.pin', pin);
    const state = await (await ctx.request.get(base + '/api/state')).json();
    assert.equal(state.viewer.saasAdmin, false, name + ': permiso global inesperado');
    if (credentials) {
      await denied.goto(base + '/dashboard');
      await denied.locator('#admin-navigation nav').waitFor({state: 'attached'});
      assert.equal(await denied.locator('#admin-navigation a[href="/saas"]').count(), 0, name + ': enlace reservado visible');
    }
    for (const [route] of routes) {
      const response = await ctx.request.get(base + '/api/saas/state');
      const body = await response.json();
      assert([401, 403].includes(response.status()), name + ': respuesta no reservada');
      assert.equal(body.accounts, undefined);
      deniedResponses.push({principal: name, route, status: response.status()});
      await denied.goto(base + route);
      await denied.getByRole('heading', {name: response.status() === 401 ? 'Administración de Atencion' : 'Acceso reservado a administradores de Atencion', exact: true}).waitFor();
      const text = await denied.locator('body').innerText();
      for (const secret of ['admin@local.test', 'ventas@matebar.com', 'Administrador', 'owner-extra@local.test', 'Cuenta extra de prueba', 'csv-formula@local.test']) assert(!text.includes(secret), `${name}/${route}: expone ${secret}`);
      assert.equal(await denied.locator('.saas-account-table,.saas-account-cards,.saas-viewer').count(), 0);
      assert(await denied.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) <= innerWidth + 1));
    }
  } finally {await ctx.close();}
}

try {
  await access(path.join(root, 'dist/index.html'));
  await mkdir(out, {recursive: true});
  app = createApp({dbPath: path.join(directory, 'saas.sqlite'), mediaDir: path.join(directory, 'uploads'), host: '127.0.0.1', port: 0});
  const address = await app.listen();
  base = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({headless: true, channel: 'msedge'});
  context = await ownedContext();
  page = await context.newPage();
  observe(page);

  await check('La cuenta inicial entra desde el acceso SaaS local', async () => {
    await page.goto(base + '/saas');
    await page.getByRole('heading', {name: 'Administración de Atencion', exact: true}).waitFor();
    assert.equal(await page.getByLabel('Contraseña', {exact: true}).inputValue(), '');
    await page.getByLabel('Correo electrónico', {exact: true}).fill('admin@local.test');
    await page.getByLabel('Contraseña', {exact: true}).fill('DemoOwner-ChangeMe!');
    await page.getByRole('button', {name: 'Entrar a la administración', exact: true}).click();
    await page.getByRole('heading', {name: 'Administración local', exact: true}).waitFor();
    initial = await snapshot();
    assert.equal(initial.viewer.email, 'admin@local.test');
    assert.notEqual(initial.viewer.id, 'owner-local');
    assert.equal(initial.accounts.length, 1);
    assert.equal(initial.accounts[0].id, 'owner-local');
    assert.equal(initial.accounts[0].email, 'ventas@matebar.com');
    assert(!initial.accounts.some(account => account.email === 'admin@local.test'));
    assert.equal(initial.accounts[0].createdAt, null);
    assert.equal(initial.accounts[0].restaurantName, 'Mate bar');
    assert.equal(initial.summary.accounts, 1);
    assert.equal(initial.summary.activeAccounts, 1);
    assert.equal(initial.summary.restaurants, 1);
    assert.equal(initial.summary.staff, 3);
    assert.equal(initial.summary.tables, 5);
    assert.equal(initial.summary.products, 6);
    assert.equal(initial.activity.length, 0, 'El login SaaS no pertenece a la actividad de restaurantes');
    assert.equal(initial.accounts[0].lastLoginAt, null);
  });

  await check('Las cuentas muestran al propietario real y distinguen fecha histórica desconocida', async () => {
    await open('/saas/accounts');
    const visibleRows = page.locator('.saas-account-table tbody tr:visible,.saas-account-cards>li:visible');
    await visibleRows.getByText('ventas@matebar.com', {exact: true}).waitFor();
    assert.equal(await visibleRows.count(), 1);
    const text = await visibleRows.innerText();
    assert(text.includes(initial.accounts[0].name));
    assert(text.includes('Mate bar'));
    assert(text.includes('Cuenta existente'));
    assert(!text.includes('admin@local.test'));
    assert(!text.includes('gerente@local.test'));
    assert(!text.includes('garcom@local.test'));
    assert.equal(await page.getByRole('status').filter({hasText: /^1 cuenta$/}).count(), 1);
  });

  await check('Cada ruta funciona sin desborde a 1440, 768, 390 y 320 px', async () => {
    const failures = [];
    for (const [width, height] of viewports) {
      await page.setViewportSize({width, height});
      for (const [route, heading, slug] of routes) {
        await open(route);
        const shot = await layout();
        geometry[`${slug}-${width}`] = shot;
        if (shot.pageOverflow > 1) failures.push(`${route}/${width}: ${shot.pageOverflow}px`);
        const activeLink = page.locator('.saas-navigation a[aria-current="page"]:visible');
        assert.equal(await activeLink.count() ? await activeLink.getAttribute('href') : null, width > 760 ? route : null);
        if (width === 1440) await page.screenshot({path: path.join(out, `desktop-${slug}.png`), fullPage: true});
        if (width === 390 && slug === 'accounts') await page.screenshot({path: path.join(out, 'mobile-accounts.png'), fullPage: true});
      }
    }
    assert.deepEqual(failures, []);
  });

  await check('Búsqueda por correo o restaurante, cero resultados, estado y limpiar filtros', async () => {
    await page.setViewportSize({width: 1440, height: 1000});
    await open('/saas/accounts');
    const search = page.getByRole('searchbox', {name: 'Buscar cuentas', exact: true});
    const filter = page.getByRole('combobox', {name: 'Estado de cuenta', exact: true});
    for (const query of ['VENTAS@MATEBAR.COM', 'Mate bar']) {
      await search.fill(query);
      assert.equal(await page.locator('.saas-account-table tbody tr:visible').count(), 1);
    }
    await search.fill('cuenta inexistente 987654');
    await page.getByRole('heading', {name: 'No hay cuentas con esos filtros', exact: true}).waitFor();
    assert(await page.getByRole('button', {name: 'Exportar cuentas', exact: true}).isDisabled());
    await page.getByRole('button', {name: 'Limpiar filtros', exact: true}).click();
    assert.equal(await search.inputValue(), '');
    assert.equal(await filter.inputValue(), 'all');
    await filter.selectOption('inactive');
    await page.getByRole('heading', {name: 'No hay cuentas con esos filtros', exact: true}).waitFor();
    await page.getByRole('button', {name: 'Limpiar filtros', exact: true}).click();
    assert.equal(await page.locator('.saas-account-table tbody tr:visible').count(), 1);
    await filter.selectOption('active');
    assert.equal(await page.locator('.saas-account-table tbody tr:visible').count(), 1);
    await filter.selectOption('all');
  });

  await check('CSV descarga las cuentas visibles con datos reales y fecha histórica explícita', async () => {
    await open('/saas/accounts');
    const rows = await exportCsv('initial-accounts.csv');
    assert.equal(rows.length, 2);
    assert.equal(rows[0][0], 'Nombre');
    assert.equal(rows[1][0], 'Mate bar');
    assert.equal(rows[1][1], 'ventas@matebar.com');
    assert.equal(rows[1][2], 'Mate bar');
    assert.equal(rows[1][3], 'Activa');
    assert.equal(rows[1][4], 'Cuenta existente');
    assert(!rows.flat().includes('gerente@local.test'));
    assert(!rows.flat().includes('admin@local.test'));
    await page.getByRole('status').filter({hasText: 'Se exportaron 1 cuenta.'}).waitFor();
  });

  await check('Detalle nativo: teclado contenido, Escape y retorno de foco a 1440 y 390 px', async () => {
    for (const [width, height] of [[1440, 1000], [390, 844]]) {
      await page.setViewportSize({width, height});
      await open('/saas/accounts');
      const trigger = accountTrigger();
      await trigger.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', {name: 'Mate bar', exact: true});
      await dialog.waitFor();
      await dialog.getByText('ventas@matebar.com', {exact: true}).waitFor();
      await dialog.getByText('Cuenta existente', {exact: true}).waitFor();
      assert.equal(await dialog.getByRole('link', {name: 'Abrir restaurante', exact: true}).count(), 0);
      assert.equal(await dialog.getByRole('link', {name: 'Gestionar equipo', exact: true}).count(), 0);
      await dialog.getByText('La administración del restaurante requiere iniciar sesión con su cuenta de cliente.', {exact: true}).waitFor();
      await trapDialog();
      const shot = await noOverflow(`detail-${width}`), box = shot.boxes['dialog[open]'];
      assert(box.x >= 0 && box.x + box.width <= width + 1);
      assert(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth + 1));
      if (width === 390) await page.screenshot({path: path.join(out, 'mobile-detail.png')});
      await closeDialog();
      assert(await trigger.evaluate(element => document.activeElement === element));
    }
  });

  await check('Navegación móvil: abre con teclado, contiene foco y Escape lo restaura', async () => {
    await page.setViewportSize({width: 390, height: 844});
    await open('/saas/accounts');
    const trigger = page.getByRole('button', {name: 'Abrir navegación', exact: true});
    assert.equal(await page.locator('.saas-sidebar a:visible').count(), 0);
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', {name: 'Navegación', exact: true});
    await dialog.waitFor();
    assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(await dialog.locator('.saas-navigation a').evaluateAll(elements => elements.map(element => element.getAttribute('href'))), routes.map(item => item[0]));
    await trapDialog();
    await noOverflow('mobile-sidebar-390');
    await page.screenshot({path: path.join(out, 'mobile-sidebar.png')});
    await closeDialog();
    assert(await trigger.evaluate(element => document.activeElement === element));
    assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
    await trigger.click();
    await page.getByRole('dialog').getByRole('link', {name: 'Restaurantes', exact: true}).click();
    await page.waitForURL(base + '/saas/restaurants');
    await page.getByRole('heading', {name: 'Restaurantes', exact: true}).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0);
  });

  await check('Sesión SaaS aislada y acceso explícito con la cuenta del restaurante', async () => {
    await page.setViewportSize({width: 1440, height: 1000});
    await page.goto(base + '/dashboard');
    await page.waitForURL(base + '/saas');
    await page.getByRole('heading', {name: 'Administración local', exact: true}).waitFor();
    assert.equal(await page.locator('#admin-navigation').count(), 0);
    const loginLink = page.locator('.saas-sidebar').getByRole('link', {name: 'Entrar al restaurante', exact: true});
    assert.equal(await loginLink.getAttribute('href'), '/login');
    await loginLink.click();
    await page.waitForURL(base + '/login');
    await page.getByRole('button', {name: 'Entrar a mi cuenta', exact: true}).waitFor();
    assert.equal(await page.getByLabel('Correo electrónico', {exact: true}).inputValue(), '');
    assert.equal(await page.getByLabel('Contraseña', {exact: true}).inputValue(), '');
    assert.equal(await page.locator('#admin-navigation').count(), 0);
    await open('/saas/restaurants');
    await page.getByRole('button', {name: 'Ver restaurante Mate bar', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Mate bar', exact: true});
    await dialog.waitFor();
    assert((await dialog.innerText()).includes('5 / 5'));
    assert((await dialog.innerText()).includes('America/La_Paz'));
    assert.equal(await dialog.getByRole('link', {name: 'Abrir restaurante', exact: true}).count(), 0);
    await dialog.getByText('La administración del restaurante requiere iniciar sesión con su cuenta de cliente.', {exact: true}).waitFor();
    await closeDialog();
  });

  await check('Foco visible, enlace de salto y movimiento reducido en las cuatro rutas', async () => {
    await page.setViewportSize({width: 1440, height: 1000});
    for (const [route, , slug] of routes) {
      await open(route);
      await page.keyboard.press('Tab');
      const skip = page.getByRole('link', {name: 'Ir al contenido', exact: true});
      await skip.focus();
      const focus = await skip.evaluate(element => {
        const css = getComputedStyle(element);
        return {focusVisible: element.matches(':focus-visible'), outlineWidth: css.outlineWidth, outlineStyle: css.outlineStyle, outlineColor: css.outlineColor, box: element.getBoundingClientRect().toJSON()};
      });
      focusStyles[slug] = focus;
      assert(focus.focusVisible);
      assert(focus.outlineStyle !== 'none' && parseFloat(focus.outlineWidth) > 0, route + ': foco no visible');
      await page.keyboard.press('Enter');
      assert(await page.locator('#saas-content').evaluate(element => document.activeElement === element));
      const shot = await layout();
      assert(shot.reducedMotion);
      const significantMotion = shot.motion.filter(item => item.animationName !== 'none' && item.animationDuration.split(',').some(value => parseFloat(value) > 0.01));
      assert.deepEqual(significantMotion, [], route + ': animación activa con movimiento reducido');
    }
  });

  await check('Propietarios adicionales son cuentas sin recibir permiso de plataforma', async () => {
    restaurantContext = await ownedContext();
    await action(restaurantContext, 'auth.login', {email: 'ventas@matebar.com', password: 'DemoOwner-ChangeMe!'});
    await action(restaurantContext, 'entity.save', {entity: 'staff', item: {id: 'owner-saas-ui-extra', name: 'Cuenta extra de prueba', email: 'owner-extra@local.test', role: 'OWNER', active: true, password: 'ExtraOwner2026!', pin: '6789'}});
    await action(restaurantContext, 'entity.save', {entity: 'staff', item: {id: 'owner-saas-ui-formula', name: '=HYPERLINK("https://example.test","CSV")', email: 'csv-formula@local.test', role: 'OWNER', active: false, password: 'FormulaOwner2026!', pin: '7890'}});
    const updated = await snapshot();
    assert.equal(updated.accounts.length, 3);
    assert.equal(updated.summary.activeAccounts, 2);
    assert.equal(updated.accounts.find(account => account.id === 'owner-local').createdAt, null);
    assert(updated.accounts.find(account => account.id === 'owner-saas-ui-extra').createdAt);
    assert(!updated.accounts.some(account => ['manager-local', 'staff-local'].includes(account.id)));
    await open('/saas/accounts');
    const filter = page.getByRole('combobox', {name: 'Estado de cuenta', exact: true});
    await filter.selectOption('active');
    assert.equal(await page.locator('.saas-account-table tbody tr:visible').count(), 2);
    await filter.selectOption('inactive');
    assert.equal(await page.locator('.saas-account-table tbody tr:visible').count(), 1);
    const rows = await exportCsv('formula-filtered-accounts.csv');
    assert.equal(rows.length, 2, 'CSV debe incluir solo las cuentas filtradas');
    assert.equal(rows[1][0], "'=HYPERLINK(\"https://example.test\",\"CSV\")");
    assert.equal(rows[1][1], 'csv-formula@local.test');
    assert.equal(rows[1][3], 'Inactiva');
    await filter.selectOption('all');
  });

  for (const [name, credentials, pin] of [
    ['anonymous', null, null],
    ['restaurant OWNER', {email: 'ventas@matebar.com', password: 'DemoOwner-ChangeMe!'}, null],
    ['manager', {email: 'gerente@local.test', password: 'DemoManager-ChangeMe!'}, null],
    ['staff', {email: 'garcom@local.test', password: 'DemoStaff-ChangeMe!'}, null],
    ['PIN owner', null, {staffId: 'owner-local', pin: '8041'}],
    ['additional OWNER', {email: 'owner-extra@local.test', password: 'ExtraOwner2026!'}, null],
  ]) await check(`${name}: las cuatro rutas deniegan datos privados y el enlace reservado`, () => denial(name, credentials, pin));

  await check('Actividad guarda accesos observados y conserva la fecha original desconocida', async () => {
    const state = await snapshot();
    assert.equal(state.accounts.find(account => account.id === 'owner-local').createdAt, null);
    assert.equal(state.activity.filter(entry => entry.actorEmail === 'admin@local.test').length, 0);
    assert.equal(state.activity.filter(entry => entry.actorEmail === 'ventas@matebar.com').length, 2);
    assert.equal(state.activity.filter(entry => entry.actorEmail === 'owner-extra@local.test').length, 1);
    assert(!state.activity.some(entry => ['gerente@local.test', 'garcom@local.test'].includes(entry.actorEmail)));
    await open('/saas/activity');
    assert.equal(await page.locator('.saas-activity-list>li').count(), 3);
    for (const time of await page.locator('.saas-activity-list time').evaluateAll(elements => elements.map(element => element.getAttribute('datetime')))) assert(Number.isFinite(Date.parse(time)));
  });

  await check('Salir limpia la información privada y conserva el formulario sin credenciales', async () => {
    await open('/saas');
    await page.getByRole('button', {name: 'Cerrar sesión', exact: true}).click();
    await page.getByRole('heading', {name: 'Administración de Atencion', exact: true}).waitFor();
    assert.equal(await page.getByLabel('Correo electrónico', {exact: true}).inputValue(), '');
    assert.equal(await page.getByLabel('Contraseña', {exact: true}).inputValue(), '');
    assert(!(await page.locator('body').innerText()).includes('admin@local.test'));
    assert.equal((await context.request.get(base + '/api/saas/state')).status(), 401);
  });

  await check('Sin errores JavaScript durante las rutas y controles verificados', async () => assert.deepEqual(errors, []));
} catch (error) {
  results.push({name: 'Preparación o ejecución', result: 'failed', error: error.stack});
  console.error(error.stack);
  process.exitCode = 1;
  if (page && !page.isClosed()) await page.screenshot({path: path.join(out, 'failure.png'), fullPage: true}).catch(() => {});
} finally {
  await mkdir(out, {recursive: true});
  await writeFile(path.join(out, 'geometry.json'), JSON.stringify(geometry, null, 2));
  await writeFile(path.join(out, 'results.json'), JSON.stringify({fixture: 'Servidor propio localhost; SQLite temporal; navegador aislado; solicitudes externas bloqueadas; datos principales intactos', isolatedDatabase: true, primaryDatabaseAccessed: false, routes: routes.map(item => item[0]), viewports, initialSummary: initial?.summary, results, errors, consoleErrors, deniedResponses, focusStyles}, null, 2));
  await restaurantContext?.close();
  await browser?.close();
  await app?.close();
  assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()));
  assert(path.basename(directory).startsWith('atencion-saas-ui-'));
  await rm(directory, {recursive: true, force: true});
}
