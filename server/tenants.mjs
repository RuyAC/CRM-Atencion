import {randomBytes, randomInt, randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, unlinkSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest} from './security.mjs';
import {periodStart} from './reporting.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const fail = (condition, message, status = 400) => {
  if (!condition) throw Object.assign(new Error(message), {status});
};
const json = (response, status, value) => {
  response.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
  response.end(JSON.stringify(value));
};
const entities = (app, kind) => app.db.prepare('SELECT data FROM entities WHERE kind=? ORDER BY rowid').all(kind).map(row => JSON.parse(row.data));
const slugify = name => name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'restaurante';

// Each restaurant runs the existing application against its own SQLite and
// upload directory. The gateway owns registration, routing and SaaS inventory.
export function createPlatformGateway(options, createRestaurantApp, defaults) {
  const entries = [];
  const dbPath = options.dbPath || path.join(ROOT, 'data', 'chamaii.sqlite');
  const mediaDir = options.mediaDir || path.join(ROOT, 'public', 'uploads');
  const tenantDirectory = dbPath === ':memory:' ? null : path.join(path.dirname(path.resolve(dbPath)), 'tenants');
  const emailConflict = (email, exclude) => entries.some(entry => entry !== exclude && (
    entry.app.db.prepare('SELECT id FROM credentials WHERE lower(email)=?').get(email.toLowerCase()) ||
    entry.app.db.prepare('SELECT id FROM platform_admins WHERE lower(email)=?').get(email.toLowerCase())
  ));
  const slugConflict = (slug, exclude) => entries.some(entry => entry !== exclude && entry.app.restaurant().slug === slug);
  const identityConflict = (id, exclude) => entries.some(entry => entry !== exclude && (
    entry.app.db.prepare('SELECT id FROM credentials WHERE id=?').get(id) || entry.app.db.prepare('SELECT id FROM platform_admins WHERE id=?').get(id)
  ));
  function guards(entry) {
    return {
      emailConflict: email => emailConflict(email, entry),
      identityConflict: id => identityConflict(id, entry),
      restaurantConflict: slug => slugConflict(slug, entry),
      restoreGuard: content => {
        fail(content.restaurant.id === entry.app.restaurant().id, 'Este respaldo pertenece a otro restaurante.');
        fail(!slugConflict(content.restaurant.slug, entry), 'El enlace del restaurante ya está en uso.');
        for (const credential of content.credentials) fail(!emailConflict(credential.email, entry), 'El respaldo contiene un correo de otra cuenta.');
        for (const member of content.entities.staff) fail(!identityConflict(member.id, entry), 'El respaldo contiene accesos de otro restaurante.');
        for (const table of content.entities.tables) fail(!entries.some(other => other !== entry && entities(other.app, 'tables').some(existing => existing.token === table.token)), 'El respaldo contiene un QR de otro restaurante.');
        const urls = [content.restaurant.logoUrl, content.restaurant.coverUrl, ...content.entities.products.flatMap(product => [product.imageUrl, product.videoUrl])];
        for (const url of urls.filter(Boolean)) if (url.startsWith('/uploads/')) {
          fail(url.startsWith(entry.prefix) && !url.slice(entry.prefix.length).includes('/'), 'El respaldo contiene archivos de otro restaurante.');
        }
      },
    };
  }
  const primary = {id: 'primary', prefix: '/uploads/'};
  primary.app = createRestaurantApp({...options, ...guards(primary)});
  entries.push(primary);
  primary.app.db.exec('CREATE TABLE IF NOT EXISTS tenant_restaurants (id TEXT PRIMARY KEY, created_at TEXT NOT NULL)');
  function loadTenant(id, seed = null) {
    fail(/^est-[a-f0-9-]{36}$/.test(id), 'El registro del restaurante no es válido.', 500);
    const tenantPath = tenantDirectory ? path.join(tenantDirectory, `${id}.sqlite`) : ':memory:';
    if (!seed) fail(tenantPath !== ':memory:' && existsSync(tenantPath), 'No se encontró la base de un restaurante registrado.', 500);
    const entry = {id, prefix: `/uploads/${id}/`, dbPath: tenantPath};
    entry.app = createRestaurantApp({dbPath: tenantPath, mediaDir: path.join(mediaDir, id), distDir: options.distDir,
      port: 0, host: options.host, seed, mediaUrlPrefix: entry.prefix, ...guards(entry)});
    entry.handler = entry.app.server.listeners('request')[0];
    return entry;
  }
  for (const row of primary.app.db.prepare('SELECT id FROM tenant_restaurants ORDER BY rowid').all()) entries.push(loadTenant(row.id));
  const primaryHandler = primary.app.server.listeners('request')[0];
  primary.handler = primaryHandler;
  const registrationLimits = new Map();
  const sessionEntry = request => {
    const raw = (request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('chamaii_session='))?.slice('chamaii_session='.length);
    if (!raw) return null;
    const key = digest(raw);
    return entries.find(entry => entry.app.db.prepare('SELECT user_id FROM sessions WHERE id_hash=? AND expires>?').get(key, Date.now())) || null;
  };
  const tokenEntry = token => entries.find(entry => entities(entry.app, 'tables').some(table => table.token === token));

  function register(request, response, payload) {
    const ip = request.socket.remoteAddress || '';
    const limit = registrationLimits.get(ip);
    const current = limit && Date.now() - limit.since < 600000 ? limit : {count: 0, since: Date.now()};
    current.count++; registrationLimits.set(ip, current);
    fail(current.count <= 10, 'Demasiados intentos de registro. Espera diez minutos.', 429);
    fail(['restaurantName', 'ownerName', 'email', 'password', 'confirmPassword'].every(key => typeof payload[key] === 'string'), 'Completa los datos del restaurante y del propietario.');
    const name = String(payload.restaurantName || '').trim();
    const ownerName = String(payload.ownerName || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    fail(name.length >= 2 && name.length <= 100, 'El nombre del restaurante debe tener entre 2 y 100 caracteres.');
    fail(ownerName.length >= 2 && ownerName.length <= 100, 'Ingresa el nombre del propietario (entre 2 y 100 caracteres).');
    fail(email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Ingresa un correo electrónico válido.');
    fail(password.length >= 8 && password.length <= 200 && password === password.trim(), 'La contraseña debe tener entre 8 y 200 caracteres, sin espacios al inicio ni al final.');
    fail(payload.confirmPassword === password, 'Las contraseñas no coinciden.');
    fail(!emailConflict(email, null), 'Este correo ya tiene una cuenta. Inicia sesión o usa otro correo.', 409);
    const id = `est-${randomUUID()}`, ownerId = `owner-${randomUUID()}`, pin = String(randomInt(1000, 10000));
    let slug = slugify(name), suffix = 2;
    const baseSlug = slug;
    while (slugConflict(slug, null)) slug = `${baseSlug}-${suffix++}`;
    const restaurant = {...defaults.initialRestaurant, id, name, slug, contactEmail: email, logoUrl: '', coverUrl: '', publicBaseUrl: ''};
    const staff = {id: ownerId, name: ownerName, email, role: 'OWNER', active: true};
    const seed = {
      restaurant, settings: structuredClone(defaults.initialSettings), monitorPin: pin,
      entities: {tables: Array.from({length: 5}, (_, index) => ({id: `mesa-${randomUUID()}`, number: index + 1,
        name: `Mesa ${String(index + 1).padStart(2, '0')}`, token: randomBytes(24).toString('base64url'), tokenVersion: 1, active: true})),
        categories: [], products: [], buttons: structuredClone(defaults.initialEntities.buttons), staff: [staff], networks: [], orders: []},
      credentials: [{id: ownerId, email, password, pin}],
    };
    let entry;
    const createdAt = new Date().toISOString();
    if (tenantDirectory) mkdirSync(tenantDirectory, {recursive: true});
    primary.app.db.exec('BEGIN IMMEDIATE');
    try {
      entry = loadTenant(id, seed);
      entry.app.db.prepare('INSERT INTO saas_accounts(user_id,created_at,last_login_at) VALUES (?,?,?)').run(ownerId, createdAt, createdAt);
      primary.app.db.prepare('INSERT INTO tenant_restaurants(id,created_at) VALUES (?,?)').run(id, createdAt);
      entry.app.setSession(response, ownerId, 'password');
      primary.app.db.exec('COMMIT');
      entries.push(entry);
    } catch (error) {
      primary.app.db.exec('ROLLBACK');
      if (entry) { entry.app.close(); for (const suffix of ['', '.key', '-wal', '-shm']) if (entry.dbPath !== ':memory:' && existsSync(entry.dbPath + suffix)) unlinkSync(entry.dbPath + suffix); }
      throw error;
    }
    return {...staff, restaurant, monitorPin: pin};
  }

  function inventory(snapshot) {
    const accounts = [...snapshot.accounts], restaurants = [...snapshot.restaurants], activity = [...snapshot.activity];
    const summary = {...snapshot.summary};
    for (const entry of entries.slice(1)) {
      const app = entry.app, r = app.restaurant(), members = entities(app, 'staff'), tables = entities(app, 'tables'), products = entities(app, 'products');
      const credentials = new Map(app.db.prepare('SELECT id,email FROM credentials').all().map(row => [row.id, row.email]));
      const metadata = new Map(app.db.prepare('SELECT * FROM saas_accounts').all().map(row => [row.user_id, row]));
      const owners = members.filter(member => member.role === 'OWNER' && credentials.has(member.id)).map(member => ({
        id: member.id, name: member.name, email: credentials.get(member.id), active: member.active !== false,
        restaurantId: r.id, restaurantName: r.name, createdAt: metadata.get(member.id)?.created_at || null, lastLoginAt: metadata.get(member.id)?.last_login_at || null,
      }));
      const settings = JSON.parse(app.db.prepare("SELECT value FROM meta WHERE key='settings'").get().value);
      accounts.push(...owners);
      restaurants.push({id: r.id, name: r.name, slug: r.slug, currency: r.currency, timezone: r.timezone,
        activeTables: tables.filter(table => table.active !== false).length, totalTables: tables.length, products: products.length, staff: members.length,
        owners: owners.map(({id, name, email, active}) => ({id, name, email, active})), servicePaused: Boolean(settings.paused), platformMode: 'local'});
      const requests = app.db.prepare('SELECT data FROM requests').all().map(row => JSON.parse(row.data));
      summary.staff += members.length; summary.tables += tables.length; summary.products += products.length;
      summary.requestsToday += requests.filter(request => Date.parse(request.createdAt) >= periodStart('day', r.timezone).getTime()).length;
      summary.pendingRequests += requests.filter(request => request.status === 'pending').length;
      activity.push(...app.db.prepare('SELECT * FROM saas_activity').all().map(row => ({id: row.id, type: row.type, label: 'Inicio de sesión de propietario',
        actorName: row.actor_name, actorEmail: row.actor_email, createdAt: row.created_at, restaurantName: row.restaurant_name})));
    }
    summary.accounts = accounts.length; summary.activeAccounts = accounts.filter(account => account.active).length; summary.restaurants = restaurants.length;
    return {...snapshot, accounts, restaurants, summary, activity: activity.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100)};
  }

  primary.app.server.removeAllListeners('request');
  primary.app.server.on('request', async (request, response) => {
    response.setHeader('X-Content-Type-Options', 'nosniff'); response.setHeader('Referrer-Policy', 'same-origin');
    try {
      const url = new URL(request.url, 'http://local');
      const session = sessionEntry(request);
      let body;
      if (url.pathname === '/api/action' && request.method === 'POST') {
        const expectedOrigin = `${request.socket.encrypted ? 'https' : 'http'}://${request.headers.host}`;
        fail(!request.headers.origin || request.headers.origin === expectedOrigin, 'El origen no está permitido.', 403);
        body = await primary.app.readBody(request); request.atencionBody = body;
        fail(body && typeof body === 'object' && !Array.isArray(body), 'La acción no es válida.');
        if (body.payload === undefined) body.payload = {};
        fail(body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload), 'La acción no es válida.');
        if (body.action === 'auth.register') { json(response, 200, {ok: true, result: register(request, response, body.payload)}); return; }
      }
      if (url.pathname === '/api/saas/state' && request.method === 'GET') {
        fail(!session || session === primary, 'Tu cuenta de restaurante no tiene acceso a la administración SaaS.', 403);
        json(response, 200, inventory(primary.app.saasSnapshot(request))); return;
      }
      let target;
      if (body?.action === 'auth.login') {
        const email = String(body.payload.email || '').trim().toLowerCase();
        target = entries.find(entry => entry.app.db.prepare('SELECT id FROM platform_admins WHERE lower(email)=?').get(email) ||
          entry.app.db.prepare('SELECT id FROM credentials WHERE lower(email)=?').get(email)) || primary;
      }
      const slug = url.searchParams.get('restaurant') || body?.payload?.restaurantSlug;
      const token = url.searchParams.get('token') || body?.payload?.token;
      if (!target && slug) { target = entries.find(entry => entry.app.restaurant().slug === slug); fail(target, 'No encontramos este restaurante.', 404); }
      if (!target && token) target = tokenEntry(token);
      if (!target && url.pathname.startsWith('/uploads/est-')) target = entries.find(entry => url.pathname.startsWith(entry.prefix));
      target ||= session || primary;
      if (session === primary && primary.app.viewer(request).scope === 'platform' && target !== primary) request.atencionPlatform = true;
      if (session && session !== target && body && !['auth.login', 'auth.pin', 'presence.check', 'request.create', 'request.cancel', 'request.bill'].includes(body.action)) {
        fail(false, 'Tu sesión no permite administrar otro restaurante.', 403);
      }
      // A platform cookie must never become an anonymous restaurant operator
      // when a public token or slug selects another database.
      if (session === primary && primary.app.viewer(request).scope === 'platform' && target !== primary && body && !['auth.login', 'auth.pin'].includes(body.action)) {
        fail(false, 'La administración SaaS no opera el restaurante.', 403);
      }
      await target.handler(request, response);
    } catch (error) {
      if (!response.headersSent) json(response, error.status || 500, {ok: false, error: error.status ? error.message : 'No se pudo completar la solicitud.', code: error.status === 409 ? 'ACCOUNT_CONFLICT' : error.status === 403 ? 'FORBIDDEN' : 'VALIDATION'});
      else response.end();
      if (!error.status) console.error(error);
    }
  });
  const originalClose = primary.app.close;
  return {...primary.app, close: async () => { for (const entry of entries.slice(1)) await entry.app.close(); await originalClose(); }};
}
