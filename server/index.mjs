import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import net from 'node:net';
import { hashSecret, verifySecret, digest, encryptPin, decryptPin } from './security.mjs';
import { periodStart, reportDateBounds } from './reporting.mjs';
import {allowedOrigin,cookieSecurity,csvCell,clientIp,securityHeaders} from './http-policy.mjs';
import {validateRestore} from './restore-validation.mjs';
import {validVideo} from './media-validation.mjs';
import {installationBootstrap,productionSeed,rejectDemoCredentials} from './bootstrap.mjs';
import {localInterfaces,canRegisterLocalCidr,networkAllowsIp} from './network.mjs';
import { createSaas } from './saas.mjs';
import {subscriptionStore} from './subscriptions.mjs';
import {createMfa} from './mfa.mjs';
import { createPlatformGateway } from './tenants.mjs';
import { restaurant as initialRestaurant, settings as initialSettings, entities as initialEntities, credentials } from './seed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const KINDS = ['tables', 'categories', 'products', 'buttons', 'staff', 'networks', 'orders'];
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mov': 'video/quicktime', '.woff': 'font/woff', '.woff2': 'font/woff2' };
const cookieName = 'chamaii_session';
const DEMO_GENERAL = { id: 'tv-general', name: 'Equipo de atención', email: '', role: 'STAFF', active: true };

class AppError extends Error { constructor(message, status = 400, code = 'VALIDATION') { super(message); this.status = status; this.code = code; } }
const fail = (condition, message, status = 400, code) => { if (!condition) throw new AppError(message, status, code); };
const now = () => new Date().toISOString();
const bool = (value, fallback = false) => value === undefined ? fallback : Boolean(value);
const string = (value, maximum = 500) => String(value ?? '').trim().slice(0, maximum);
const integer = (value, min, max, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.round(parsed))) : fallback;
};
const baseSafeUrl = value => {
  const url = string(value, 2048);
  fail(!url || /^https?:\/\//i.test(url) || /^\/(?:uploads|assets)\/(?:[a-zA-Z0-9_-]+\/)?[a-zA-Z0-9_-][a-zA-Z0-9._-]*$/.test(url), 'Usa una URL http/https o un archivo de la aplicación.');
  return url;
};

function createRestaurantApp({ dbPath = path.join(ROOT, 'data', 'chamaii.sqlite'), mediaDir = path.join(ROOT, 'public', 'uploads'),
  distDir = path.join(ROOT, 'dist'), port = 3001, host = '0.0.0.0', seed = null, publicOrigin = '', production = false, bootstrap = null, mediaQuotaBytes = Number.MAX_SAFE_INTEGER,
  mediaUrlPrefix = '/uploads/', emailConflict = () => false, identityConflict = () => false, restaurantConflict = () => false, restoreGuard = () => {},accountStatus=()=>({verified:true,required:false}),canServe=()=>true,onInternalError=()=>{} } = {}) {
  let seedRestaurant = seed?.restaurant || initialRestaurant;
  const seedSettings = seed?.settings || initialSettings;
  let seedEntities = seed?.entities || initialEntities;
  let seedCredentials = seed?.credentials || credentials;
  const secureCookie = cookieSecurity(publicOrigin);
  const safeUrl = value => {
    const url = baseSafeUrl(value);
    if (url.startsWith('/uploads/')) fail(url.startsWith(mediaUrlPrefix) && !url.slice(mediaUrlPrefix.length).includes('/'), 'Selecciona un archivo de tu restaurante.');
    return url;
  };
  if (dbPath !== ':memory:') mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
  mkdirSync(mediaDir, { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS entities (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(kind,id));
    CREATE TABLE IF NOT EXISTS credentials (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, pin_hash TEXT NOT NULL, pin_cipher TEXT);
    CREATE TABLE IF NOT EXISTS sessions (id_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, scope TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS requests (id TEXT PRIMARY KEY, table_id TEXT NOT NULL, status TEXT NOT NULL, data TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS requests_by_table ON requests(table_id);
    CREATE UNIQUE INDEX IF NOT EXISTS unique_active_table ON requests(table_id) WHERE status IN ('pending','accepted');
    CREATE TABLE IF NOT EXISTS operations (operation_id TEXT PRIMARY KEY, result TEXT NOT NULL, created_at INTEGER NOT NULL);`);
  const getMeta = key => { const row = db.prepare('SELECT value FROM meta WHERE key = ?').get(key); return row ? JSON.parse(row.value) : undefined; };
  const setMeta = (key, value) => db.prepare('INSERT INTO meta(key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(key, JSON.stringify(value));
  const transaction = callback => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = callback(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  let bootstrapValues = null;
  if(production) {
    try {
      if(!seed && !getMeta('restaurant')) {
        bootstrapValues=installationBootstrap(bootstrap);
        const configured=productionSeed(initialRestaurant,initialEntities,credentials,bootstrapValues);
        seedRestaurant=configured.restaurant;seedEntities=configured.entities;seedCredentials=configured.credentials;
      } else rejectDemoCredentials(db,credentials);
    } catch(error) {db.close();throw error;}
  }
  let pinKey;
  if (dbPath === ':memory:') pinKey = randomBytes(32);
  else {
    const keyFile = `${dbPath}.key`;
    if (!existsSync(keyFile)) writeFileSync(keyFile, randomBytes(32), { mode: 0o600 });
    pinKey = readFileSync(keyFile);
    fail(pinKey.length === 32, 'La clave local de credenciales no es válida.', 500);
  }
  const all = kind => db.prepare('SELECT data FROM entities WHERE kind = ? ORDER BY rowid').all(kind).map(row => JSON.parse(row.data));
  const one = (kind, id) => { const row = db.prepare('SELECT data FROM entities WHERE kind = ? AND id = ?').get(kind, id); return row ? JSON.parse(row.data) : null; };
  const saveEntity = (kind, item) => db.prepare('INSERT INTO entities(kind,id,data) VALUES (?,?,?) ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data').run(kind, item.id, JSON.stringify(item));
  const requestById = id => { const row = db.prepare('SELECT data FROM requests WHERE id=?').get(id); return row ? JSON.parse(row.data) : null; };
  const requests = () => db.prepare('SELECT data FROM requests ORDER BY rowid DESC').all().map(row => JSON.parse(row.data));
  const saveRequest = item => db.prepare('INSERT INTO requests(id,table_id,status,data) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,data=excluded.data').run(item.id, item.tableId, item.status, JSON.stringify(item));
  if (!getMeta('restaurant')) transaction(() => {
    setMeta('restaurant', seedRestaurant); setMeta('settings', seedSettings); setMeta('version', 1);
    setMeta('tv_pin_hash', hashSecret(seed?.monitorPin || bootstrapValues?.monitorPin || '1234')); setMeta('tv_pin_cipher', encryptPin(seed?.monitorPin || bootstrapValues?.monitorPin || '1234', pinKey));
    for (const kind of KINDS) for (const item of seedEntities[kind]) saveEntity(kind, item);
    for (const user of seedCredentials) db.prepare('INSERT INTO credentials(id,email,password_hash,pin_hash,pin_cipher) VALUES (?,?,?,?,?)')
      .run(user.id, user.email, hashSecret(user.password), hashSecret(user.pin), encryptPin(user.pin, pinKey));
  });
  const clients = new Set();
  const rateLimits = new Map();
  let closed = false;
  const currentSettings = () => ({ ...seedSettings, ...getMeta('settings') });
  const currentRestaurant = () => ({ ...seedRestaurant, ...getMeta('restaurant') });
  const saas = createSaas({ bootstrap:bootstrapValues, db, all, one, requests, restaurant: currentRestaurant, settings: currentSettings, getMeta, setMeta, transaction, fail, now });
  const subscription=subscriptionStore(db,{production});
  const mfa=createMfa(db,pinKey);
  if(bootstrapValues){
    const ownerEmail=bootstrapValues.ownerEmail||process.env.ATENCION_OWNER_EMAIL;
    const adminEmail=bootstrapValues.adminEmail||process.env.ATENCION_ADMIN_EMAIL;
    if(ownerEmail){db.prepare("UPDATE credentials SET email=? WHERE id='owner-local'").run(ownerEmail);const owner=one('staff','owner-local');saveEntity('staff',{...owner,email:ownerEmail});setMeta('restaurant',{...currentRestaurant(),contactEmail:ownerEmail,publicBaseUrl:publicOrigin});}
    if(adminEmail)db.prepare("UPDATE platform_admins SET email=? WHERE id='platform-admin-local'").run(adminEmail);
  }
  const remoteIp = clientIp;
  const version = () => getMeta('version') || 1;
  function changed() {
    setMeta('version', version() + 1);
    for (const response of clients) response.write(`id: ${version()}\nevent: update\ndata: ${JSON.stringify({ version: version(), time: now() })}\n\n`);
  }
  const safeUser = user => user ? ({ id: user.id, name: user.name, email: user.email, role: user.role, active: user.active !== false }) : null;
  function viewer(request) {
    if (request.atencionPlatform) return {user: null, monitorAuthorized: false, scope: 'platform'};
    const raw = (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (!raw) return { user: null, monitorAuthorized: !currentSettings().tvRequirePin, scope: null };
    const session = db.prepare('SELECT user_id,scope,expires FROM sessions WHERE id_hash=?').get(digest(raw));
    if (!session || session.expires < Date.now()) return { user: null, monitorAuthorized: !currentSettings().tvRequirePin, scope: null };
    if (session.scope === 'platform') {
      const principal = saas.platformById(session.user_id);
      return { user: principal?.active ? saas.platformUser(principal) : null, monitorAuthorized: false, scope: 'platform' };
    }
    const user = session.user_id === DEMO_GENERAL.id ? DEMO_GENERAL : one('staff', session.user_id);
    if (!user || user.active === false) return { user: null, monitorAuthorized: !currentSettings().tvRequirePin, scope: null };
    return { user: safeUser(user), monitorAuthorized: true, scope: session.scope };
  }
  function requireOperator(request) { const v = viewer(request); fail(v.scope !== 'platform', 'La administración SaaS no opera el restaurante.', 403, 'FORBIDDEN'); fail(v.monitorAuthorized, 'Entra con tu usuario o PIN para atender.', 401, 'AUTH_REQUIRED'); return v; }
  function requireAdmin(request, owner = false) {
    const v = viewer(request);
    fail(v.scope !== 'platform', 'La administración SaaS no administra el restaurante.', 403, 'FORBIDDEN');
    fail(v.user && v.scope === 'password', 'Entra con correo y contraseña para administrar.', 401, 'AUTH_REQUIRED');
    fail(owner ? v.user.role === 'OWNER' : ['OWNER', 'MANAGER'].includes(v.user.role), 'Tu perfil no permite esta acción.', 403, 'FORBIDDEN');
    return v;
  }
  function state(request, url = new URL(request.url, 'http://local')) {
    const v = viewer(request), admin = Boolean(v.user && v.scope === 'password' && ['OWNER', 'MANAGER'].includes(v.user.role));
    const monitor = v.monitorAuthorized && (!currentSettings().tvRequirePin || Boolean(v.user));
    const token = url.searchParams.get('token');
    const tables = all('tables');
    const selected = tables.find(table => table.token === token && table.active !== false);
    const s = currentSettings();
    const publicKeys = ['welcomeTitle','welcomeSubtitle','currency','cooldownSeconds','presenceMode','sessionMinutes','radiusMeters','showUnavailable','tvRequirePin','tvShowActions','tvAutoAccept','tvAutoComplete','tvAutoAcceptSeconds','tvAutoCompleteSeconds','scheduleEnabled','paused','pauseMessage','hours'];
    const publicSettings = admin ? {...s,tvPin:''} : {...Object.fromEntries(publicKeys.map(key=>[key,s[key]])),tvPin:''};
    let visibleRequests = [];
    if (token) visibleRequests = selected ? db.prepare("SELECT data FROM requests WHERE table_id=? ORDER BY status IN ('pending','accepted') DESC,rowid DESC LIMIT 1").all(selected.id).map(row=>JSON.parse(row.data)) : [];
    else if (admin || monitor) {const days=subscription.snapshot().planDetails.historyDays;visibleRequests = requests().filter(r=>!days||['pending','accepted'].includes(r.status)||Date.parse(r.createdAt)>=Date.now()-days*86400000);}
    return {
      restaurant: currentRestaurant(), settings: publicSettings, subscription: admin ? subscription.snapshot() : {serviceEnabled:subscription.snapshot().serviceEnabled},
      tables: tables.map(table => admin ? table : ({ ...table, token: table === selected ? table.token : '', tokenVersion: undefined })),
      categories: all('categories'), products: all('products').map(p=>subscription.snapshot().planDetails.videos?p:{...p,videoUrl:''}), buttons: all('buttons'),
      staff: all('staff').map(user => admin ? safeUser(user) : ({ id: user.id, name: user.name, role: user.role, active: user.active !== false })),
      networks: admin ? all('networks') : [], requests: visibleRequests, orders: admin || monitor ? all('orders') : [],
      viewer: { user: v.user, monitorAuthorized: v.monitorAuthorized, scope: v.scope, saasAdmin: saas.canAccess(v),account:v.user&&v.scope==='password'?accountStatus(v.user):null }, version: version(), settingsRevision: getMeta('settings_revision') || 0, serverTime: now(),
    };
  }
  function setSession(response, userId, scope) {
    const raw = randomBytes(32).toString('base64url');
    const maxAge = ['password', 'platform'].includes(scope) ? 7 * 86400 : 12 * 3600;
    db.prepare('INSERT INTO sessions(id_hash,user_id,scope,expires) VALUES (?,?,?,?)').run(digest(raw), userId, scope, Date.now() + maxAge * 1000);
    response.setHeader('Set-Cookie', `${cookieName}=${raw}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secureCookie}`);
  }
  function logout(request, response) {
    const raw = (request.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (raw) db.prepare('DELETE FROM sessions WHERE id_hash=?').run(digest(raw));
    response.setHeader('Set-Cookie', `${cookieName}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secureCookie}`);
  }
  function throttle(key) {
    const entry = rateLimits.get(key) || { count: 0, since: Date.now() };
    if (Date.now() - entry.since > 10 * 60 * 1000) { entry.count = 0; entry.since = Date.now(); }
    entry.count++; rateLimits.set(key, entry);
    fail(entry.count <= 15, 'Demasiados intentos. Espera diez minutos e inténtalo de nuevo.', 429, 'RATE_LIMIT');
  }
  function tableByToken(token) { const table = all('tables').find(item => item.token === token && item.active !== false); fail(table, 'Este código QR está desactivado o no existe.', 404, 'TABLE_NOT_FOUND'); return table; }
  function openNow(s) {
    if (s.paused) return false;
    if (!s.scheduleEnabled) return true;
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: currentRestaurant().timezone || 'America/La_Paz', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
    const part = type => parts.find(item => item.type === type)?.value;
    const dayIndex = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(part('weekday'));
    const minute = Number(part('hour')) * 60 + Number(part('minute'));
    const toMinute = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
    const day = s.hours[dayIndex], previous = s.hours[(dayIndex + 6) % 7];
    if (day && !day.closed) {
      const start = toMinute(day.open), end = toMinute(day.close);
      if (start <= end ? minute >= start && minute <= end : minute >= start) return true;
    }
    return Boolean(previous && !previous.closed && toMinute(previous.open) > toMinute(previous.close) && minute <= toMinute(previous.close));
  }
  function presence(request, payload, response = null) {
    const table = tableByToken(string(payload.token, 128));
    const s = currentSettings();
    if (!openNow(s)) return { allowed: false, message: s.paused ? s.pauseMessage : 'Estamos fuera del horario de atención.', reason: 'closed' };
    if (s.presenceMode === 'basic') return { allowed: true, message: 'Presencia confirmada', reason: 'basic' };
    const ip = remoteIp(request);
    const ipAllowed = all('networks').some(network => networkAllowsIp(network,ip));
    const cookie = `mate_presence_${digest(table.token).slice(0,12)}`;
    const config = digest(JSON.stringify([s.presenceMode,s.latitude,s.longitude,s.radiusMeters,s.sessionMinutes,all('networks')]));
    const sign = value => createHmac('sha256',pinKey).update(value).digest('base64url');
    const stored = (request.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(cookie+'='))?.slice(cookie.length+1);
    let session = null;
    if (stored) { try { const [encoded,signature] = stored.split('.'), expected = sign(encoded), a = Buffer.from(signature||''), b = Buffer.from(expected);
      if (a.length === b.length && timingSafeEqual(a,b)) { const record=JSON.parse(Buffer.from(encoded,'base64url').toString()); if(record.table===table.id&&record.ip===ip&&record.config===config&&record.expires>Date.now())session=record; }
    } catch {} }
    function confirmed(reason,message) {
      if(response) { const proof=Buffer.from(JSON.stringify({table:table.id,ip,config,expires:Date.now()+s.sessionMinutes*60000})).toString('base64url');
        response.setHeader('Set-Cookie',`${cookie}=${proof}.${sign(proof)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${s.sessionMinutes*60}${secureCookie}`); }
      return {allowed:true,message,reason,sessionMinutes:s.sessionMinutes};
    }
    if (ipAllowed && s.presenceMode !== 'strict') return confirmed('wifi','Presencia confirmada por la red Wi-Fi');
    if (s.presenceMode === 'strict') {
      if (!ipAllowed) return {allowed:false,message:'Conéctate al Wi-Fi autorizado del restaurante.',reason:'wifi'};
      if (session || response) return confirmed('session','Presencia y sesión confirmadas');
      return {allowed:false,message:'Tu sesión de presencia venció. Recarga la página de la mesa para confirmarla.',reason:'session'};
    }
    if (s.presenceMode === 'wifi') return { allowed: false, message: 'Conéctate al Wi-Fi del restaurante para llamar al equipo.', reason: 'wifi' };
    if (session && !payload.coords && !payload.position) return {allowed:true,message:'Presencia confirmada por ubicación',reason:'location',sessionMinutes:s.sessionMinutes};
    const position = payload.coords || payload.position;
    if (position && s.latitude !== '' && s.longitude !== '') {
      const lat1 = Number(s.latitude), lng1 = Number(s.longitude), lat2 = Number(position.latitude), lng2 = Number(position.longitude);
      if ([lat1, lng1, lat2, lng2].every(Number.isFinite) && Math.abs(lat2) <= 90 && Math.abs(lng2) <= 180) {
        const radians = degree => degree * Math.PI / 180;
        const a = Math.sin(radians(lat2 - lat1) / 2) ** 2 + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(radians(lng2 - lng1) / 2) ** 2;
        const distance = 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return distance <= s.radiusMeters ? {...confirmed('location','Presencia confirmada por ubicación'),distance:Math.round(distance)} : {allowed:false,message:'Estás fuera del área del restaurante.',reason:'location',distance:Math.round(distance)};
      }
    }
    return { allowed: false, message: 'Activa tu ubicación o conéctate al Wi-Fi del restaurante.', reason: 'location' };
  }
  function event(item, type, actor, extra = {}) { item.events.push({ id: randomUUID(), type, at: now(), actorId: actor?.id || null, actorName: actor?.name || null, ...extra }); }
  function normalizeEntity(kind, input, existing, user) {
    const id = existing?.id || string(input.id, 100) || `${kind}-${randomUUID()}`;
    if (kind === 'tables') {
      const sector=string(input.sector??existing?.sector,80);if(sector)subscription.feature('kitchen');
      const number = integer(input.number ?? existing?.number, 1, 9999, null); fail(number, 'Ingresa un número de mesa válido.');
      fail(!all('tables').some(table => table.id !== id && table.number === number), 'Ya existe una mesa con este número.', 409);
      return { id, number, name: string(input.name ?? existing?.name, 100) || `Mesa ${String(number).padStart(2, '0')}`,
        token: existing?.token || randomBytes(24).toString('base64url'), tokenVersion: existing?.tokenVersion || 1, active: bool(input.active, existing?.active ?? true),sector };
    }
    if (kind === 'orders') {
      const data = { ...existing, ...input }, tableId = string(data.tableId, 100);
      fail(one('tables', tableId), 'Selecciona una mesa existente.');
      fail(Array.isArray(data.items) && data.items.length > 0 && data.items.length <= 100, 'Añade al menos un producto al pedido.');
      const items = data.items.map(entry => {
        const productId = string(entry.productId, 100), product = one('products', productId);
        const name = string(entry.name || product?.name, 140); fail(name, 'El producto no tiene nombre.');
        return { productId, name, quantity: integer(entry.quantity, 1, 99, 1) };
      });
      const status = data.status || 'pending'; fail(['pending', 'preparing', 'ready', 'delivered'].includes(status), 'Estado del pedido inválido.');
      return { id, tableId, tableName: one('tables', tableId).name, items, notes: string(data.notes, 1000), status,
        createdAt: existing?.createdAt || now(), preparedAt: data.preparedAt || null, readyAt: data.readyAt || null, deliveredAt: data.deliveredAt || null,
        staffId: existing?.staffId || user?.id || null, staffName: existing?.staffName || user?.name || null };
    }
    if (kind === 'categories') {
      const name = string(input.name ?? existing?.name, 100); fail(name, 'Ingresa el nombre de la categoría.');
      return { id, name, description: string(input.description ?? existing?.description, 500), order: integer(input.order ?? existing?.order, 0, 9999, all(kind).length) };
    }
    if (kind === 'products') {
      const data = { ...existing, ...input }, name = string(data.name, 140), categoryId = string(data.categoryId, 100);
      fail(name, 'Ingresa el nombre del producto.'); fail(one('categories', categoryId), 'Selecciona una categoría existente.');
      fail(Number.isInteger(Number(data.price)) && Number(data.price) >= 0 && Number(data.price) <= 100000000, 'Ingresa un precio válido.');
      const promoPrice = data.promoPrice === '' || data.promoPrice == null ? null : integer(data.promoPrice, 0, 100000000, null);
      fail(promoPrice === null || promoPrice < Number(data.price), 'El precio promocional debe ser menor que el precio normal.');
      return { id, categoryId, name, description: string(data.description, 3000), price: Number(data.price), promoPrice,
        imageUrl: safeUrl(data.imageUrl), videoUrl: safeUrl(data.videoUrl), tags: Array.isArray(data.tags) ? data.tags.slice(0, 20).map(tag => string(tag, 40)).filter(Boolean) : [],
        featured: bool(data.featured), available: bool(data.available, true), order: integer(data.order, 0, 9999, all(kind).length) };
    }
    if (kind === 'buttons') {
      const data = { ...existing, ...input }, type = data.type || 'CALL'; fail(['CALL', 'MENU', 'BILL_REQUEST', 'LINK'].includes(type), 'El tipo de botón no es válido.');
      const label = string(data.label, 80); fail(label, 'Ingresa el texto del botón.');
      const url = safeUrl(data.url); fail(type !== 'LINK' || url, 'Ingresa el enlace del botón.');
      return { id, label, description: string(data.description, 150), type, url, requirePresence: bool(data.requirePresence, ['CALL', 'BILL_REQUEST'].includes(type)),
        active: bool(data.active, true), order: integer(data.order, 0, 9999, all(kind).length) };
    }
    if (kind === 'networks') {
      const data = { ...existing, ...input }, name = string(data.name, 100), ip = string(data.ip, 100); fail(name, 'Ingresa el nombre de la red.'); fail(net.isIP(ip), 'Ingresa una dirección IP válida.');
      return { id, name, ip, localCidr: string(data.localCidr,50), active: bool(data.active, true), createdAt: existing ? existing.createdAt : now(), updatedAt: now() };
    }
    if (kind === 'staff') {
      const data = { ...existing, ...input }, role = data.role || 'STAFF'; fail(['OWNER', 'MANAGER', 'STAFF'].includes(role), 'El perfil no es válido.');
      fail(user.role === 'OWNER' || role === 'STAFF' && (!existing || existing.role === 'STAFF'), 'Solo el propietario puede administrar a otros administradores.', 403);
      const name = string(data.name, 100), email = string(data.email, 160).toLowerCase();
      fail(name, 'Ingresa el nombre.'); fail(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Ingresa un correo válido.');
      saas.guardStaffChange(user, id);
      fail(!identityConflict(id), 'Este identificador pertenece a otra cuenta.', 409);
      fail(!saas.reservedEmail(email), 'Este correo está reservado para la administración SaaS.', 409);
      fail(!emailConflict(email, id), 'Este correo ya está registrado en otra cuenta.', 409);
      fail(!all('staff').some(member => member.id !== id && member.email.toLowerCase() === email), 'Este correo ya está registrado.', 409);
      if (existing?.role === 'OWNER' && (role !== 'OWNER' || data.active === false)) fail(all('staff').filter(member => member.role === 'OWNER' && member.active !== false && member.id !== id).length, 'Mantén al menos un propietario activo.');
      const saved = { id, name, email, role, active: bool(data.active, true) };
      const prior = db.prepare('SELECT * FROM credentials WHERE id=?').get(id);
      const password = string(input.password, 200), pin = string(input.pin, 20);
      fail(!production || !credentials.some(user=>(password && user.password===password)||(pin && user.pin===pin)), 'No uses contraseñas ni PIN de demostración en producción.');
      if (!prior) { fail(password.length >= 6, 'La contraseña debe tener al menos seis caracteres.'); fail(/^\d{4}$/.test(pin), 'El PIN debe tener exactamente cuatro números.'); }
      if (password) fail(password.length >= 6, 'La contraseña debe tener al menos seis caracteres.');
      if (pin) fail(/^\d{4}$/.test(pin), 'El PIN debe tener exactamente cuatro números.');
      db.prepare('INSERT INTO credentials(id,email,password_hash,pin_hash,pin_cipher) VALUES (?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash,pin_hash=excluded.pin_hash,pin_cipher=excluded.pin_cipher')
        .run(id, email, password ? hashSecret(password) : prior.password_hash, pin ? hashSecret(pin) : prior.pin_hash, pin ? encryptPin(pin, pinKey) : prior.pin_cipher);
      if (!prior) saas.recordAccountCreated(id);
      if (password || pin || existing?.role !== role || !saved.active) db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
      return saved;
    }
  }
  function normalizeSettings(input) {
    const old = currentSettings(), next = { ...old };
    for (const key of ['welcomeTitle', 'welcomeSubtitle', 'wifiName', 'wifiPassword', 'pauseMessage']) if (key in input) next[key] = string(input[key], key === 'welcomeTitle' ? 60 : key === 'welcomeSubtitle' ? 180 : 200);
    for (const key of ['showUnavailable', 'tvRequirePin', 'tvShowActions', 'tvAutoAccept', 'tvAutoComplete', 'scheduleEnabled', 'paused']) if (key in input) next[key] = bool(input[key]);
    if ('presenceMode' in input) { fail(['basic', 'wifi', 'fallback', 'strict'].includes(input.presenceMode), 'El modo de presencia no es válido.'); next.presenceMode = input.presenceMode; }
    if ('currency' in input) { fail(/^[A-Z]{3}$/.test(input.currency), 'Moneda inválida.'); next.currency = input.currency; }
    for (const [key, min, max] of [['cooldownSeconds', 0, 300], ['sessionMinutes', 5, 1440], ['radiusMeters', 10, 10000], ['tvAutoAcceptSeconds', 5, 3600], ['tvAutoCompleteSeconds', 5, 7200]]) if (key in input) next[key] = integer(input[key], min, max, old[key]);
    for (const [key, max] of [['latitude', 90], ['longitude', 180]]) if (key in input) { const value = input[key]; fail(value === '' || Number.isFinite(Number(value)) && Math.abs(Number(value)) <= max, 'Coordenadas inválidas.'); next[key] = value === '' ? '' : Number(value); }
    if ('hours' in input) {
      fail(Array.isArray(input.hours) && input.hours.length === 7, 'Configura los siete días de la semana.');
      next.hours = input.hours.map((day, index) => {
        fail(/^([01]\d|2[0-3]):[0-5]\d$/.test(day.open) && /^([01]\d|2[0-3]):[0-5]\d$/.test(day.close), 'El horario no es válido.');
        return { day: string(day.day ?? old.hours[index].day, 20), index, closed: Boolean(day.closed), open: day.open, close: day.close };
      });
    }
    if (input.printOptions && typeof input.printOptions === 'object') {
      if(JSON.stringify(input.printOptions)!==JSON.stringify(old.printOptions))subscription.feature('branding');
      next.printOptions = { ...old.printOptions };
      for (const key of ['qr', 'nfc', 'name', 'logo', 'table', 'instructions', 'branding']) if (key in input.printOptions) next.printOptions[key] = bool(input.printOptions[key]);
      if ('theme' in input.printOptions) next.printOptions.theme = string(input.printOptions.theme, 30);
      if ('text' in input.printOptions) next.printOptions.text = string(input.printOptions.text, 300);
    }
    if (input.tvPin) { const pin = string(input.tvPin, 20); fail(!production || !credentials.some(user=>user.pin===pin), 'No uses PIN de demostración en producción.'); fail(/^\d{4,8}$/.test(pin), 'El PIN debe tener entre cuatro y ocho números.'); setMeta('tv_pin_hash', hashSecret(pin)); setMeta('tv_pin_cipher', encryptPin(pin, pinKey)); db.prepare("DELETE FROM sessions WHERE user_id='tv-general'").run(); }
    return next;
  }
  function normalizeRestaurant(input) {
    const r = currentRestaurant(), next = { ...r };
    if ('name' in input) { next.name = string(input.name, 140); fail(next.name, 'Ingresa el nombre del restaurante.'); }
    if ('slug' in input) { next.slug = string(input.slug, 100).toLowerCase(); fail(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(next.slug), 'Usa letras sin acentos, números y guiones en el enlace.'); fail(!restaurantConflict(next.slug), 'El enlace del restaurante ya está en uso.', 409); }
    if ('primaryColor' in input) { fail(/^#[0-9a-f]{6}$/i.test(input.primaryColor), 'El color no es válido.'); next.primaryColor = input.primaryColor; }
    for (const key of ['logoUrl', 'coverUrl']) if (key in input) next[key] = safeUrl(input[key]);
    if ('timezone' in input) { try { new Intl.DateTimeFormat('en', { timeZone: input.timezone }).format(); next.timezone = input.timezone; } catch { throw new AppError('La zona horaria no es válida.'); } }
    if ('currency' in input) { fail(/^[A-Z]{3}$/.test(input.currency), 'La moneda no es válida.'); next.currency = input.currency; }
    if ('language' in input) next.language = string(input.language, 20);
    for (const key of ['legalName','taxId','contactEmail','phone','address']) if (key in input) next[key] = string(input[key], key === 'address' ? 500 : 200);
    if ('publicBaseUrl' in input) {
      if (!input.publicBaseUrl) next.publicBaseUrl = '';
      else { let parsed; try { parsed = new URL(input.publicBaseUrl); } catch { throw new AppError('La dirección de los QR no es válida.'); }
        fail(['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password, 'Usa una dirección HTTP o HTTPS sin credenciales.'); next.publicBaseUrl = parsed.origin; }
    }
    return next;
  }
  async function action(request, response, body) {
    const { action: name, payload = {} } = body;
    fail(typeof name === 'string' && payload && typeof payload === 'object' && !Array.isArray(payload), 'La acción no es válida.');
    if(name.startsWith('mfa.')){
      const v=saas.requireAccess(viewer(request));
      if(name==='mfa.status')return {...mfa.status(v.user.id),required:process.env.REQUIRE_PLATFORM_MFA==='true'};
      throttle(`${remoteIp(request)}:mfa:${v.user.id}`);
      if(['mfa.setup','mfa.disable'].includes(name))fail(verifySecret(String(payload.password||''),saas.platformById(v.user.id).password_hash),'Confirma tu contraseña actual.',401);
      if(name==='mfa.setup')return mfa.setup(v.user);
      let result;
      if(name==='mfa.confirm')result=mfa.confirm(v.user.id,payload.code);
      else if(name==='mfa.disable'){fail(process.env.REQUIRE_PLATFORM_MFA!=='true','El doble factor es obligatorio en esta instalación.',403);mfa.verify(v.user.id,payload.code);mfa.disable(v.user.id);result={disabled:true};}
      else fail(false,'Acción no válida.');
      const raw=(request.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(`${cookieName}=`))?.slice(cookieName.length+1);
      db.prepare('DELETE FROM sessions WHERE user_id=? AND id_hash<>?').run(v.user.id,digest(raw||''));
      return result;
    }
    if(name==='subscription.read'){requireAdmin(request);return subscription.snapshot();}
    if(name.startsWith('request.')&&name!=='request.cancel'){subscription.service();fail(canServe(),'El propietario debe verificar su correo antes de activar la atención.',403,'EMAIL_UNVERIFIED');}
    if(name.startsWith('kitchen.')){subscription.service();subscription.feature('kitchen');}
    if (name === 'auth.login') {
      const email = string(payload.email, 160).toLowerCase(); throttle(`${remoteIp(request)}:login:${email}`);
      const platform = saas.platformByEmail(email);
      if (platform) {
        fail(platform.active && verifySecret(string(payload.password, 200), platform.password_hash), 'El correo o la contraseña son incorrectos.', 401, 'INVALID_CREDENTIALS');
        if(mfa.enabled(platform.id))mfa.verify(platform.id,payload.code);
        setSession(response, platform.id, 'platform');
        rateLimits.delete(`${remoteIp(request)}:login:${email}`); return saas.platformUser(platform);
      }
      const credential = db.prepare('SELECT * FROM credentials WHERE email=?').get(email);
      const member = credential && one('staff', credential.id);
      fail(member && member.active !== false && verifySecret(string(payload.password, 200), credential.password_hash), 'El correo o la contraseña son incorrectos.', 401, 'INVALID_CREDENTIALS');
      transaction(() => { setSession(response, member.id, 'password'); saas.recordOwnerLogin(member, credential.email); });
      rateLimits.delete(`${remoteIp(request)}:login:${email}`); return safeUser(member);
    }
    if (name === 'auth.logout') { logout(request, response); return { loggedOut: true }; }
    if (name === 'auth.pin') {
      throttle(`${remoteIp(request)}:pin`);
      const pin = string(payload.pin, 20), id = payload.staffId || payload.userId;
      let member;
      if (!id || id === 'tv-general' || id === 'general') {
        if (verifySecret(pin, getMeta('tv_pin_hash'))) member = DEMO_GENERAL;
      }
      if (!member) {
        const possible = id ? [one('staff', string(id, 100))].filter(Boolean) : all('staff');
        member = possible.find(user => { const cred = db.prepare('SELECT pin_hash FROM credentials WHERE id=?').get(user.id); return user.active !== false && cred && verifySecret(pin, cred.pin_hash); });
      }
      fail(member, 'El PIN es incorrecto. Inténtalo de nuevo.', 401, 'INVALID_PIN');
      setSession(response, member.id, 'monitor'); rateLimits.delete(`${remoteIp(request)}:pin`); return safeUser(member);
    }
    if (name === 'auth.password') {
      const v = viewer(request); fail(v.user && ['password', 'platform'].includes(v.scope), 'Entra con tu contraseña para cambiarla.', 401);
      if (v.scope === 'platform') saas.requireAccess(v);
      const credential = v.scope === 'platform' ? saas.platformById(v.user.id) : db.prepare('SELECT * FROM credentials WHERE id=?').get(v.user.id);
      fail(credential && verifySecret(string(payload.current ?? payload.currentPassword, 200), credential.password_hash), 'La contraseña actual es incorrecta.', 401);
      const newPassword = string(payload.newPassword, 200); fail(newPassword.length >= 8, 'La nueva contraseña debe tener al menos ocho caracteres.');
      fail(!production || !credentials.some(user=>user.password===newPassword), 'Elige una contraseña distinta de las cuentas de demostración.');
      db.prepare(`UPDATE ${v.scope === 'platform' ? 'platform_admins' : 'credentials'} SET password_hash=? WHERE id=?`).run(hashSecret(newPassword), v.user.id);
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(v.user.id); setSession(response, v.user.id, v.scope); return { changed: true };
    }
    if (name === 'staff.pinReveal') {
      const v = requireAdmin(request, true); saas.guardCredentialRead(v, string(payload.id, 100));
      if (payload.id === 'tv-general') return { pin: decryptPin(getMeta('tv_pin_cipher'), pinKey) };
      const credential = db.prepare('SELECT pin_cipher FROM credentials WHERE id=?').get(string(payload.id, 100));
      fail(credential, 'No se encontró al miembro del equipo.', 404); return { pin: decryptPin(credential.pin_cipher, pinKey) };
    }
    if (name === 'presence.check') return presence(request, payload, response);
    if (name === 'kitchen.create') {
      const v = requireOperator(request); fail(v.user, 'Identifícate para crear pedidos de cocina.', 401);
      const input = payload.item || payload;
      const saved = normalizeEntity('orders', { ...input, status: 'pending' }, null, v.user);
      saveEntity('orders', saved); changed(); return saved;
    }
    if (name === 'kitchen.update') {
      const v = requireOperator(request); fail(v.user, 'Identifícate para actualizar pedidos de cocina.', 401);
      const saved = transaction(() => {
        const prior = one('orders', string(payload.id, 100)); fail(prior, 'Pedido no encontrado.', 404);
        const stages = ['pending', 'preparing', 'ready', 'delivered'];
        fail(stages.indexOf(payload.status) === stages.indexOf(prior.status) + 1, 'Avanza el pedido al siguiente estado.', 409);
        const next = { ...prior, status: payload.status };
        if (payload.status === 'preparing') next.preparedAt = now();
        if (payload.status === 'ready') next.readyAt = now();
        if (payload.status === 'delivered') next.deliveredAt = now();
        if (payload.notes !== undefined) next.notes = string(payload.notes, 1000);
        saveEntity('orders', next); return next;
      }); changed(); return saved;
    }
    if (name === 'entity.save') {
      const v = requireAdmin(request), kind = payload.entity;
      fail(KINDS.includes(kind), 'El tipo de registro no es válido.'); fail(payload.item && typeof payload.item === 'object', 'Los datos no son válidos.');
      const saved = transaction(() => {
        const prior = payload.item.id ? one(kind, string(payload.item.id, 100)) : null;
        if(kind==='networks'&&payload.item.localCidr&&payload.item.localCidr!==prior?.localCidr)fail(canRegisterLocalCidr(String(payload.item.localCidr),remoteIp(request)),'Selecciona la red local física detectada para esta conexión.');
        const item = normalizeEntity(kind, payload.item, prior, v.user); subscription.entity(kind,item,all); saveEntity(kind, item); return item;
      }); changed(); return saved;
    }
    if (name === 'entity.delete') {
      const v = requireAdmin(request), kind = payload.entity, id = string(payload.id, 100);
      fail(KINDS.includes(kind), 'El tipo de registro no es válido.'); const item = one(kind, id); fail(item, 'No se encontró el registro.', 404);
      transaction(() => {
        if (kind === 'staff') {
          fail(v.user.role === 'OWNER' || item.role === 'STAFF', 'Solo el propietario puede eliminar administradores.', 403);
          saas.guardStaffChange(v.user, id);
          fail(v.user.id !== id, 'No puedes eliminar tu propio acceso.');
          if (item.role === 'OWNER') fail(all('staff').filter(member => member.role === 'OWNER' && member.active !== false && member.id !== id).length, 'Mantén al menos un propietario activo.');
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(id); db.prepare('DELETE FROM credentials WHERE id=?').run(id);
          saas.removeAccount(id);
        }
        if (kind === 'tables') fail(!requests().some(req => req.tableId === id && ['pending', 'accepted'].includes(req.status)), 'Finaliza o cancela la llamada de esta mesa antes de eliminarla.', 409);
        if (kind === 'categories') fail(!all('products').some(product => product.categoryId === id), 'Mueve o elimina primero los productos de esta categoría.', 409);
        db.prepare('DELETE FROM entities WHERE kind=? AND id=?').run(kind, id);
      }); changed(); return { deleted: true, id };
    }
    if (name === 'table.rotate') {
      requireAdmin(request); const table = one('tables', string(payload.id, 100)); fail(table, 'No se encontró la mesa.', 404);
      table.token = randomBytes(24).toString('base64url'); table.tokenVersion++; saveEntity('tables', table); changed(); return table;
    }
    if (name === 'settings.save') {
      const v = requireAdmin(request); if (payload.settings?.tvPin) fail(v.user.role === 'OWNER', 'Solo el propietario puede cambiar el PIN general.', 403);
      const saved = transaction(() => {
        const revision = getMeta('settings_revision') || 0;
        fail(payload.expectedRevision === undefined || payload.expectedRevision === revision, 'La configuración cambió en otra sesión. Recarga esta página antes de guardar.', 409, 'SETTINGS_CONFLICT');
        const s = normalizeSettings(payload.settings || {});
        if (payload.restaurant) setMeta('restaurant', normalizeRestaurant(payload.restaurant));
        if (payload.restaurant?.currency) s.currency = currentRestaurant().currency;
        else if (payload.settings?.currency) setMeta('restaurant', { ...currentRestaurant(), currency: s.currency });
        setMeta('settings', s);
        setMeta('settings_revision', revision + 1);
        return { settings: { ...s, tvPin: '' }, restaurant: currentRestaurant(), settingsRevision: revision + 1 };
      }); changed(); return saved;
    }
    if (name === 'request.create') {
      fail(viewer(request).scope !== 'platform', 'La administración SaaS no opera llamadas del restaurante.', 403, 'FORBIDDEN');
      const token = string(payload.token, 128), table = tableByToken(token), type = payload.type;
      fail(['CALL', 'BILL_REQUEST'].includes(type), 'El tipo de solicitud no es válido.');
      const button = payload.buttonId ? one('buttons', string(payload.buttonId, 100)) : all('buttons').find(item => item.type === type && item.active);
      fail(button && button.active && button.type === type, 'Esta acción no está disponible.', 409);
      if (button.requirePresence) { const p = presence(request, payload); fail(p.allowed, p.message, 403, 'PRESENCE_REQUIRED'); }
      else fail(openNow(currentSettings()), 'Estamos fuera del horario de atención.', 403, 'CLOSED');
      let saved;
      transaction(() => {
        const operationId = string(payload.operationId, 200);
        const operationKey = operationId ? `${table.id}:${operationId}` : '';
        if (operationKey) { const priorOperation = db.prepare('SELECT result FROM operations WHERE operation_id=?').get(operationKey); if (priorOperation) { saved = JSON.parse(priorOperation.result); return; } }
        const activeRow = db.prepare("SELECT data FROM requests WHERE table_id=? AND status IN ('pending','accepted')").get(table.id);
        if (activeRow) {
          saved = JSON.parse(activeRow.data);
          if (saved.type === 'CALL' && type === 'BILL_REQUEST') { saved.type = type; saved.buttonLabel = button.label; event(saved, 'converted', null, { from: 'CALL', to: type }); saveRequest(saved); }
        } else {
          const recent = requests().find(item => item.tableId === table.id && item.status === 'completed');
          if (recent && Date.now() - Date.parse(recent.completedAt) < currentSettings().cooldownSeconds * 1000) throw new AppError('Espera unos segundos antes de llamar de nuevo.', 429, 'COOLDOWN');
          saved = { id: randomUUID(), tableId: table.id, tableName: table.name, tableNumber: table.number, type, buttonLabel: button.label,
            status: 'pending', createdAt: now(), acceptedAt: null, completedAt: null, cancelledAt: null, staffId: null, staffName: null, events: [] };
          event(saved, 'created', null, { requestType: type }); saveRequest(saved);
        }
        if (operationKey) db.prepare('INSERT INTO operations(operation_id,result,created_at) VALUES (?,?,?)').run(operationKey, JSON.stringify(saved), Date.now());
      }); changed(); return saved;
    }
    if (name === 'request.cancel') {
      fail(viewer(request).scope !== 'platform', 'La administración SaaS no opera llamadas del restaurante.', 403, 'FORBIDDEN');
      const table = tableByToken(string(payload.token, 128));
      const saved = transaction(() => {
        const item = requestById(string(payload.id, 100)); fail(item && item.tableId === table.id, 'No se encontró esta solicitud en la mesa.', 404);
        fail(item.status === 'pending', 'Solo puedes cancelar una solicitud pendiente.', 409, 'INVALID_STATE');
        item.status = 'cancelled'; item.cancelledAt = now(); event(item, 'cancelled', null); saveRequest(item); return item;
      }); changed(); return saved;
    }
    if (name === 'request.accept' || name === 'request.complete') {
      const v = requireOperator(request), actor = v.user || DEMO_GENERAL;
      const saved = transaction(() => {
        const item = requestById(string(payload.id, 100)); fail(item, 'No se encontró la solicitud.', 404);
        if (name === 'request.accept') {
          fail(item.status === 'pending', 'Otra persona ya atendió o finalizó esta solicitud.', 409, 'ALREADY_ACCEPTED');
          item.status = 'accepted'; item.acceptedAt = now(); item.staffId = actor.id; item.staffName = actor.name; event(item, 'accepted', actor);
        } else {
          fail(item.status === 'accepted', 'Acepta la solicitud antes de finalizarla.', 409, 'INVALID_STATE');
          fail(actor.role !== 'STAFF' || item.staffId === actor.id || actor.id === DEMO_GENERAL.id, 'Esta solicitud está asignada a otro garzón.', 403, 'FORBIDDEN');
          item.status = 'completed'; item.completedAt = now(); event(item, 'completed', actor);
        }
        saveRequest(item); return item;
      }); changed(); return saved;
    }
    if (name === 'upload.create' || name === 'media.upload') {
      requireAdmin(request);
      const mime = string(payload.type || payload.mime, 100), allowed = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'video/mp4': '.mp4', 'video/webm': '.webm', 'video/quicktime': '.mov' };
      if(mime.startsWith('video/'))subscription.feature('videos');
      fail(allowed[mime], 'Carga JPG, PNG, WEBP, GIF, MP4, WEBM o MOV.');
      const base64 = String(payload.data || '').replace(/^data:[^,]*;base64,/, '');
      fail(/^[A-Za-z0-9+/]*={0,2}$/.test(base64), 'El archivo no es válido.'); const data = Buffer.from(base64, 'base64');
      const limit = mime.startsWith('image/') ? 5 * 1024 * 1024 : 10 * 1024 * 1024;
      fail(data.length && data.length <= limit, `El archivo debe tener hasta ${mime.startsWith('image/') ? '5' : '10'} MB.`);
      if (mime === 'image/png') fail(data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])), 'El archivo no es una imagen PNG válida.');
      if (mime === 'image/jpeg') fail(data[0] === 0xff && data[1] === 0xd8, 'El archivo no es una imagen JPEG válida.');
      if (mime === 'image/webp') fail(data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP', 'El archivo no es una imagen WEBP válida.');
      if (mime === 'image/gif') fail(['GIF87a', 'GIF89a'].includes(data.toString('ascii', 0, 6)), 'El archivo no es una imagen GIF válida.');
      if (mime.startsWith('video/')) fail(validVideo(data,mime), 'El archivo no contiene un video válido con el formato indicado.');
      const used = readdirSync(mediaDir,{withFileTypes:true}).filter(entry=>entry.isFile()).reduce((sum,entry)=>sum+statSync(path.join(mediaDir,entry.name)).size,0);
      fail(used + data.length <= Math.min(mediaQuotaBytes,subscription.snapshot().planDetails.mediaBytes), 'Se alcanzó el límite de almacenamiento del restaurante.', 413, 'MEDIA_QUOTA');
      const filename = `${randomUUID()}${allowed[mime]}`; writeFileSync(path.join(mediaDir, filename), data);
      return { url: `${mediaUrlPrefix}${filename}`, name: string(payload.name, 200), type: mime, size: data.length };
    }
    if (name === 'backup.export') { requireAdmin(request, true); return backup(); }
    if (name === 'backup.restore') {
      requireAdmin(request, true);
      let content = payload.backup || payload.data; fail(content && content.format === 'chamaii-local-v1', 'Backup inválido.');
      fail(content.restaurant && content.settings && content.entities && Array.isArray(content.requests), 'Backup incompleto.');
      for (const kind of KINDS) fail(Array.isArray(content.entities[kind]), 'Backup incompleto.');
      fail(Array.isArray(content.credentials) && content.entities.staff.some(member => member.role === 'OWNER' && member.active !== false), 'El respaldo debe contener un propietario activo.');
      content = saas.prepareRestore(content);
      validateRestore(content, safeUrl);
      restoreGuard(content);
      for(const kind of KINDS)for(const item of content.entities[kind])subscription.entity(kind,item,k=>content.entities[k]);
      if(dbPath!==':memory:'){const directory=path.join(path.dirname(path.resolve(dbPath)),'backups');mkdirSync(directory,{recursive:true});writeFileSync(path.join(directory,`before-restore-${Date.now()}-${randomUUID()}.json`),JSON.stringify(backup()),{mode:0o600});}
      transaction(() => {
        db.exec("DELETE FROM entities; DELETE FROM requests; DELETE FROM credentials; DELETE FROM sessions WHERE scope<>'platform'; DELETE FROM operations;");
        for (const kind of KINDS) for (const item of content.entities[kind]) saveEntity(kind, kind === 'staff' ? safeUser(item) : item);
        for (const item of content.requests) saveRequest(item);
        for (const member of content.credentials) {
          if (member.pin) fail(verifySecret(String(member.pin),member.pin_hash), 'El PIN del respaldo no coincide con sus credenciales.');
          db.prepare('INSERT INTO credentials(id,email,password_hash,pin_hash,pin_cipher) VALUES (?,?,?,?,?)').run(member.id, member.email, member.password_hash, member.pin_hash,member.pin?encryptPin(String(member.pin),pinKey):null);
        }
        if (content.tvPin) { fail(/^\d{4,8}$/.test(content.tvPin),'El PIN general del respaldo no es válido.'); setMeta('tv_pin_hash',hashSecret(content.tvPin)); setMeta('tv_pin_cipher',encryptPin(content.tvPin,pinKey)); }
        setMeta('restaurant', normalizeRestaurant(content.restaurant)); setMeta('settings', normalizeSettings(content.settings));
        setMeta('settings_revision', (getMeta('settings_revision') || 0) + 1);
        saas.afterRestore();
        if(production){try{rejectDemoCredentials(db,credentials);}catch(error){throw new AppError(error.message);}}
      }); logout(request, response); changed(); return { restored: true, loginRequired: true };
    }
    throw new AppError('La acción no existe.', 404, 'ACTION_NOT_FOUND');
  }
  function backup() {
    return { format: 'chamaii-local-v1', exportedAt: now(), restaurant: currentRestaurant(), settings: currentSettings(),
      entities: Object.fromEntries(KINDS.map(kind => [kind, kind === 'staff' ? all(kind).map(safeUser) : all(kind)])), requests: requests(),
      credentials: db.prepare('SELECT id,email,password_hash,pin_hash,pin_cipher FROM credentials').all().map(({pin_cipher,...member})=>({...member,pin:decryptPin(pin_cipher,pinKey)||null})),
      tvPin: decryptPin(getMeta('tv_pin_cipher'),pinKey) };
  }
  function json(response, status, body) { response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(JSON.stringify(body)); }
  async function readBody(request) {
    const chunks = []; let bytes = 0;
    for await (const chunk of request) { bytes += chunk.length; if (bytes > 15 * 1024 * 1024) throw new AppError('El archivo o la solicitud son demasiado grandes.', 413); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { throw new AppError('JSON inválido.'); }
  }
  function serveFile(request, response, filename, cache = false) {
    if (!existsSync(filename) || !statSync(filename).isFile()) return false;
    const type = MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream';
    const data = readFileSync(filename), range = request.headers.range;
    response.setHeader('Content-Type', type); response.setHeader('Cache-Control', cache ? 'public, max-age=86400' : 'no-cache'); response.setHeader('Accept-Ranges', 'bytes');
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match) { response.writeHead(416, { 'Content-Range': `bytes */${data.length}` }); response.end(); return true; }
      const start = match[1] ? Number(match[1]) : Math.max(0, data.length - Number(match[2]));
      const end = match[1] && match[2] ? Math.min(Number(match[2]), data.length - 1) : data.length - 1;
      if (start > end || start >= data.length) { response.writeHead(416, { 'Content-Range': `bytes */${data.length}` }); response.end(); return true; }
      response.writeHead(206, { 'Content-Length': end - start + 1, 'Content-Range': `bytes ${start}-${end}/${data.length}` }); response.end(request.method === 'HEAD' ? undefined : data.subarray(start, end + 1)); return true;
    }
    response.writeHead(200, { 'Content-Length': data.length }); response.end(request.method === 'HEAD' ? undefined : data); return true;
  }
  const server = http.createServer(async (request, response) => {
    securityHeaders(response,production);
    try {
      const url = new URL(request.url, 'http://local');
      if (request.method === 'OPTIONS') { response.writeHead(204); response.end(); return; }
      if (url.pathname === '/api/health') { json(response, 200, { ok: true, version: version(), database: 'sqlite', serverTime: now() }); return; }
      if (url.pathname === '/api/events' && request.method === 'GET') {
        response.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
        response.write(`retry: 2000\nid: ${version()}\nevent: update\ndata: ${JSON.stringify({ version: version(), time: now() })}\n\n`);
        clients.add(response); request.on('close', () => clients.delete(response)); return;
      }
      if (url.pathname === '/api/state' && request.method === 'GET') { json(response, 200, state(request, url)); return; }
      if (url.pathname === '/api/saas/state' && request.method === 'GET') { json(response, 200, saas.snapshot(viewer(request))); return; }
      if (url.pathname === '/api/network' && request.method === 'GET') {
        requireAdmin(request);
        const addresses = localInterfaces();
        json(response, 200, { ip: remoteIp(request), remoteIp: remoteIp(request), addresses, port: server.address()?.port || port }); return;
      }
      if (url.pathname === '/api/action' && request.method === 'POST') {
        const origin = request.headers.origin;
        if (origin) {
          fail(allowedOrigin(request,publicOrigin), 'El origen no está permitido.', 403, 'FORBIDDEN');
        }
        const result = await action(request, response, request.atencionBody || await readBody(request));
        // Newly issued cookies apply to the next request; callers refetch state after login/logout.
        json(response, 200, { ok: true, result, state: state(request, url) }); return;
      }
      if (url.pathname === '/api/export' && request.method === 'GET') {
        requireAdmin(request);
        if (url.searchParams.get('format') === 'json') { requireAdmin(request, true); response.setHeader('Content-Disposition', `attachment; filename="${currentRestaurant().slug}-respaldo-${new Date().toISOString().slice(0, 10)}.json"`); json(response, 200, backup()); return; }
        subscription.feature('reports');
        const start = url.searchParams.get('start'), end = url.searchParams.get('end');
        const period = url.searchParams.get('period') || 'all';
        fail(['day','week','month','year','all'].includes(period), 'El período no es válido.');
        const cutoff = periodStart(period,currentRestaurant().timezone);
        let bounds; try { bounds=reportDateBounds(start,end,currentRestaurant().timezone); } catch(error) { throw new AppError(error.message); }
        const filtered = requests().filter(item => Date.parse(item.createdAt) >= cutoff.getTime() && Date.parse(item.createdAt) >= bounds.start && Date.parse(item.createdAt) < bounds.end);
        const escape = csvCell;
        const rows = [['ID', 'Mesa', 'Tipo', 'Estado', 'Garzón', 'Creado', 'Aceptado', 'Finalizado', 'Cancelado', 'Espera (s)', 'Atención (s)', 'Total (s)'], ...filtered.map(item => [item.id, item.tableName || one('tables', item.tableId)?.name, item.type, item.status, item.staffName, item.createdAt, item.acceptedAt, item.completedAt, item.cancelledAt,
          item.acceptedAt ? Math.round((Date.parse(item.acceptedAt) - Date.parse(item.createdAt)) / 1000) : '',
          item.completedAt && item.acceptedAt ? Math.round((Date.parse(item.completedAt) - Date.parse(item.acceptedAt)) / 1000) : '',
          item.completedAt ? Math.round((Date.parse(item.completedAt) - Date.parse(item.createdAt)) / 1000) : ''])];
        if(url.searchParams.get('format')==='xls'){const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));response.writeHead(200,{'Content-Type':'application/vnd.ms-excel; charset=utf-8','Content-Disposition':`attachment; filename="${currentRestaurant().slug}-reporte.xls"`});response.end(`<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Solicitudes"><Table>${rows.map(row=>`<Row>${row.map(value=>`<Cell><Data ss:Type="String">${xml(value)}</Data></Cell>`).join('')}</Row>`).join('')}</Table></Worksheet></Workbook>`);return;}
        response.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${currentRestaurant().slug}-reporte-${new Date().toISOString().slice(0, 10)}.csv"` });
        response.end(`\ufeff${rows.map(row => row.map(escape).join(';')).join('\r\n')}`); return;
      }
      if (url.pathname.startsWith('/api/')) throw new AppError('No se encontró esta ruta.', 404);
      if (['GET', 'HEAD'].includes(request.method)) {
        const pathname = decodeURIComponent(url.pathname);
        if (pathname.startsWith('/uploads/')) {
          fail(pathname.startsWith(mediaUrlPrefix), 'No se encontró el archivo.', 404);
          const filename = path.resolve(mediaDir, pathname.slice(mediaUrlPrefix.length));
          if (filename.startsWith(path.resolve(mediaDir) + path.sep) && serveFile(request, response, filename, true)) return;
          throw new AppError('No se encontró el archivo.', 404);
        }
        const staticFile = path.resolve(distDir, `.${pathname}`);
        if (staticFile.startsWith(path.resolve(distDir) + path.sep) && serveFile(request, response, staticFile, pathname.startsWith('/assets/'))) return;
        if (serveFile(request, response, path.join(distDir, 'index.html'))) return;
        json(response, 503, { ok: false, error: 'La aplicación aún no está preparada. Ejecuta el inicio local.', code: 'FRONTEND_NOT_BUILT' }); return;
      }
      throw new AppError('El método no está permitido.', 405);
    } catch (error) {
      if (!response.headersSent) json(response, error.status || 500, { ok: false, error: error.status ? error.message : 'Ocurrió un error interno. Inténtalo de nuevo.', code: error.code || 'INTERNAL' });
      else response.end();
      if (!error.status){onInternalError();console.error(JSON.stringify({event:'restaurant_server_error',time:now()}));}
    }
  });
  const heartbeat = setInterval(() => { for (const response of clients) response.write(': heartbeat\n\n'); }, 15000); heartbeat.unref();
  const automation = setInterval(() => {
    if (closed) return;
    if(!subscription.snapshot().serviceEnabled||!canServe())return;
    const s = currentSettings(); if (!s.tvAutoAccept && !s.tvAutoComplete) return;
    let updated = false;
    transaction(() => {
      for (const item of requests()) {
        if (s.tvAutoAccept && item.status === 'pending' && Date.now() - Date.parse(item.createdAt) >= s.tvAutoAcceptSeconds * 1000) {
          item.status = 'accepted'; item.acceptedAt = now(); item.staffId = 'tv-auto'; item.staffName = 'TV automática'; event(item, 'auto-accepted', { id: 'tv-auto', name: 'TV automática' }); saveRequest(item); updated = true;
        } else if (s.tvAutoComplete && item.status === 'accepted' && Date.now() - Date.parse(item.acceptedAt) >= s.tvAutoCompleteSeconds * 1000) {
          item.status = 'completed'; item.completedAt = now(); event(item, 'auto-completed', { id: 'tv-auto', name: 'TV automática' }); saveRequest(item); updated = true;
        }
      }
    });
    if (updated) changed();
  }, 1000); automation.unref();
  const cleanup = setInterval(() => {
    db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    db.prepare('DELETE FROM operations WHERE created_at < ?').run(Date.now() - 86400000);
    for (const [key, value] of rateLimits) if (Date.now() - value.since > 10 * 60 * 1000) rateLimits.delete(key);
  }, 60000); cleanup.unref();
  return {
    server, db, viewer, setSession, readBody, subscription, changed, all, mfa, verifyMfa:(request,id,code)=>{throttle(`${remoteIp(request)}:mfa:${id}`);return mfa.verify(id,code);},restaurant: currentRestaurant, saasSnapshot: request => saas.snapshot(viewer(request)),
    listen: (listenPort = port, listenHost = host) => new Promise((resolve, reject) => {
      server.once('error', reject); server.listen(listenPort, listenHost, () => { server.off('error', reject); resolve(server.address()); });
    }),
    close: () => new Promise(resolve => {
      if (closed) { resolve(); return; } closed = true;
      clearInterval(heartbeat); clearInterval(automation); clearInterval(cleanup);
      for (const response of clients) response.end(); clients.clear();
      const finish = () => { db.close(); resolve(); };
      if (server.listening) { server.close(finish); server.closeIdleConnections(); } else finish();
    }),
  };
}

export function createApp(options = {}) {
  return createPlatformGateway(options, createRestaurantApp, {initialRestaurant, initialSettings, initialEntities});
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const app = createApp({ port: Number(process.env.PORT) || 3001, host: process.env.HOST || '0.0.0.0', dbPath: process.env.DB_PATH || undefined,mediaDir:process.env.MEDIA_DIR||undefined,mediaQuotaBytes:Number(process.env.MEDIA_QUOTA_BYTES)||undefined });
  const address = await app.listen();
  console.log(`AUnToque local: http://localhost:${address.port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await app.close(); process.exit(0); });
}
