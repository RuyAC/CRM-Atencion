import {defaultDatabasePath} from './database-path.mjs';
import {randomBytes, randomInt, randomUUID} from 'node:crypto';
import {existsSync, mkdirSync, unlinkSync,rmSync,readdirSync,readFileSync,lstatSync} from 'node:fs';
import {Readable} from 'node:stream';
import {pipeline} from 'node:stream/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {digest,verifySecret} from './security.mjs';
import {createFinance} from './finance.mjs';
import {accountArchive} from './account-export.mjs';
import {periodStart} from './reporting.mjs';
import {deploymentOptions,allowedOrigin,clientIp,securityHeaders,csvCell} from './http-policy.mjs';
import {createFullBackup} from './backups.mjs';
import {credentials as demoCredentials} from './seed.mjs';
import {PLANS} from '../shared/plans.mjs';
import {createAccountSecurity} from './account-security.mjs';
import {createCommercial} from './commercial.mjs';
import {inspectMedia,diskStatus,retainBackups} from './maintenance.mjs';
import {verifyFullBackup} from './backups.mjs';

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
  options = deploymentOptions(options);
  const entries = [];
  let serverErrors=0;
  let accountSecurity;
  const dbPath = options.dbPath || defaultDatabasePath(ROOT);
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
      onInternalError:()=>{serverErrors++;},
      accountStatus:user=>({verified:!options.production||!!accountSecurity?.verified(entry,user),required:options.production,mailConfigured:accountSecurity?.mailConfigured()||false}),
      canServe:()=>!options.production||entities(entry.app,'staff').some(user=>user.role==='OWNER'&&user.active!==false&&accountSecurity?.verified(entry,user)),
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
  const primary = {id: 'primary', prefix: '/uploads/',dbPath};
  primary.app = createRestaurantApp({...options, ...guards(primary)});
  entries.push(primary);
  primary.app.db.exec('CREATE TABLE IF NOT EXISTS tenant_restaurants (id TEXT PRIMARY KEY, created_at TEXT NOT NULL)');
  primary.app.db.exec(`CREATE TABLE IF NOT EXISTS account_lifecycle(restaurant_id TEXT PRIMARY KEY,entry_id TEXT NOT NULL,kind TEXT NOT NULL,status TEXT NOT NULL,requested_at TEXT NOT NULL,not_before TEXT NOT NULL,completed_at TEXT); CREATE TABLE IF NOT EXISTS tenant_deletions(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,completed_at TEXT);`);
  primary.app.db.exec('CREATE TABLE IF NOT EXISTS account_events(id TEXT PRIMARY KEY,restaurant_id TEXT NOT NULL,actor_id TEXT NOT NULL,type TEXT NOT NULL,created_at TEXT NOT NULL)');
  const accountEvent=(restaurant,actor,type)=>primary.app.db.prepare('INSERT INTO account_events VALUES(?,?,?,?,?)').run(randomUUID(),restaurant,actor,type,new Date().toISOString());
  function purgeTenantFiles(id){
    fail(/^est-[a-f0-9-]{36}$/.test(id),'Identificador de eliminación inválido.',500);
    if(tenantDirectory){const file=path.resolve(tenantDirectory,id+'.sqlite');fail(path.dirname(file)===path.resolve(tenantDirectory),'Ruta de datos inválida.',500);for(const suffix of ['', '.key','-wal','-shm'])if(existsSync(file+suffix)){fail(!lstatSync(file+suffix).isSymbolicLink(),'No se elimina un enlace simbólico.',500);unlinkSync(file+suffix);}
      const archived=path.join(tenantDirectory,'backups');if(existsSync(archived))for(const name of readdirSync(archived)){const candidate=path.join(archived,name);if(!/^before-restore-[\d-]+[a-f0-9-]+\.json$/.test(name)||!lstatSync(candidate).isFile()||lstatSync(candidate).isSymbolicLink())continue;try{if(JSON.parse(readFileSync(candidate,'utf8')).restaurant?.id===id)unlinkSync(candidate);}catch{}}
    }
    const uploads=path.resolve(mediaDir,id);fail(path.dirname(uploads)===path.resolve(mediaDir),'Ruta de archivos inválida.',500);if(existsSync(uploads)){fail(!lstatSync(uploads).isSymbolicLink(),'No se elimina un enlace simbólico.',500);rmSync(uploads,{recursive:true});}
  }
  for(const row of primary.app.db.prepare('SELECT id FROM tenant_deletions WHERE completed_at IS NULL').all()){purgeTenantFiles(row.id);primary.app.db.prepare('UPDATE tenant_deletions SET completed_at=? WHERE id=?').run(new Date().toISOString(),row.id);}
  function loadTenant(id, seed = null) {
    fail(/^est-[a-f0-9-]{36}$/.test(id), 'El registro del restaurante no es válido.', 500);
    const tenantPath = tenantDirectory ? path.join(tenantDirectory, `${id}.sqlite`) : ':memory:';
    if (!seed) fail(tenantPath !== ':memory:' && existsSync(tenantPath), 'No se encontró la base de un restaurante registrado.', 500);
    const entry = {id, prefix: `/uploads/${id}/`, dbPath: tenantPath};
    entry.app = createRestaurantApp({dbPath: tenantPath, mediaDir: path.join(mediaDir, id), distDir: options.distDir,
      port: 0, host: options.host, publicOrigin: options.publicOrigin, production: options.production, mediaQuotaBytes:options.mediaQuotaBytes, seed, mediaUrlPrefix: entry.prefix, ...guards(entry)});
    entry.handler = entry.app.server.listeners('request')[0];
    return entry;
  }
  for (const row of primary.app.db.prepare('SELECT id FROM tenant_restaurants WHERE id NOT IN (SELECT id FROM tenant_deletions) ORDER BY rowid').all()) entries.push(loadTenant(row.id));
  const primaryHandler = primary.app.server.listeners('request')[0];
  primary.handler = primaryHandler;
  accountSecurity=createAccountSecurity({db:primary.app.db,entries,publicOrigin:options.publicOrigin,production:options.production,sendMail:options.sendMail});
  const commercial=createCommercial(primary.app.db);
  const finance=createFinance(primary.app.db),sensitiveLimits=new Map(),exporting=new Map();
  const lifecycle=id=>primary.app.db.prepare('SELECT * FROM account_lifecycle WHERE restaurant_id=?').get(id)||null;
  function ownerAccess(session,request){const v=session?.app.viewer(request);fail(v?.scope==='password'&&v.user?.role==='OWNER','Solo un propietario con contraseña puede gestionar la cuenta.',403);return v;}
  function reauthenticate(session,request,password){const v=session.app.viewer(request),key=clientIp(request)+':'+v.user?.id,old=sensitiveLimits.get(key),row=old&&Date.now()-old.at<600000?old:{at:Date.now(),count:0};row.count++;sensitiveLimits.set(key,row);for(const [k,r]of sensitiveLimits)if(Date.now()-r.at>600000)sensitiveLimits.delete(k);fail(row.count<=5,'Demasiados intentos. Espera diez minutos.',429);const credential=session.app.db.prepare(`SELECT password_hash FROM ${v.scope==='platform'?'platform_admins':'credentials'} WHERE id=?`).get(v.user.id);fail(credential&&verifySecret(String(password||''),credential.password_hash),'Confirma tu contraseña actual.',401);sensitiveLimits.delete(key);return v;}
  function platformAccess(session,request){fail(session===primary&&primary.app.viewer(request).scope==='platform','Acceso reservado a la plataforma.',403);const snapshot=primary.app.saasSnapshot(request);fail(process.env.REQUIRE_PLATFORM_MFA!=='true'||primary.app.mfa.enabled(snapshot.viewer.id),'Configura doble factor antes de operar la plataforma.',403);return snapshot;}
  const registrationLimits = new Map();
  let backingUp=false,lastBackup=null,backupError=null;
  async function runBackup(){fail(!backingUp,'Hay un respaldo en curso.',409);fail(options.backupDir||process.env.BACKUP_DIR,'Configura BACKUP_DIR.',503);backingUp=true;try{const root=options.backupDir||process.env.BACKUP_DIR;lastBackup=await createFullBackup(entries,mediaDir,root);verifyFullBackup(lastBackup.path);retainBackups(root);backupError=null;return lastBackup;}catch(error){backupError='Falló el respaldo; revisa almacenamiento y permisos.';throw error;}finally{backingUp=false;}}
  const backupTimer=setInterval(()=>{if((options.backupDir||process.env.BACKUP_DIR)&&!backingUp)runBackup().catch(()=>console.error(JSON.stringify({event:'backup_failed',time:new Date().toISOString()})));},Number(process.env.BACKUP_INTERVAL_HOURS||24)*3600000);backupTimer.unref();
  const sessionEntry = request => {
    const raw = (request.headers.cookie || '').split(';').map(part => part.trim()).find(part => part.startsWith('atencion_session='))?.slice('atencion_session='.length);
    if (!raw) return null;
    const key = digest(raw);
    return entries.find(entry => entry.app.db.prepare('SELECT user_id FROM sessions WHERE id_hash=? AND expires>?').get(key, Date.now())) || null;
  };
  const tokenEntry = token => entries.find(entry => entities(entry.app, 'tables').some(table => table.token === token));

  function register(request, response, payload) {
    const ip = clientIp(request);
    for(const [key,row] of registrationLimits)if(Date.now()-row.since>600000)registrationLimits.delete(key);
    const limit = registrationLimits.get(ip);
    const current = limit && Date.now() - limit.since < 600000 ? limit : {count: 0, since: Date.now()};
    current.count++; registrationLimits.set(ip, current);
    fail(current.count <= 10, 'Demasiados intentos de registro. Espera diez minutos.', 429);
    fail(!options.production||entries.length<Number(process.env.MAX_RESTAURANTS||500),'El registro está temporalmente cerrado. Contacta a Atencion.',503);
    fail(['restaurantName', 'ownerName', 'email', 'password', 'confirmPassword'].every(key => typeof payload[key] === 'string'), 'Completa los datos del restaurante y del propietario.');
    const name = String(payload.restaurantName || '').trim();
    const ownerName = String(payload.ownerName || '').trim();
    const email = String(payload.email || '').trim().toLowerCase();
    const password = String(payload.password || '');
    fail(name.length >= 2 && name.length <= 100, 'El nombre del restaurante debe tener entre 2 y 100 caracteres.');
    fail(ownerName.length >= 2 && ownerName.length <= 100, 'Ingresa el nombre del propietario (entre 2 y 100 caracteres).');
    fail(email.length <= 160 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Ingresa un correo electrónico válido.');
    fail(password.length >= 8 && password.length <= 200 && password === password.trim(), 'La contraseña debe tener entre 8 y 200 caracteres, sin espacios al inicio ni al final.');
    fail(!options.production||password.length>=12,'Usa una contraseña de al menos 12 caracteres.');
    fail(!options.production || !demoCredentials.some(user=>user.password===password), 'Elige una contraseña distinta de las cuentas de demostración.');
    fail(payload.confirmPassword === password, 'Las contraseñas no coinciden.');
    const legal=commercial.config();
    fail(!options.production||!legal.legalPublished||payload.acceptLegal===true&&payload.legalVersion===legal.legalVersion,'Acepta los términos y la política de privacidad vigentes.');
    const plan=payload.plan||(options.production?'essential':'business'),interval=payload.interval||'monthly';
    fail(PLANS[plan]&&['monthly','annual'].includes(interval),'Selecciona un plan y período válidos.');
    fail(!emailConflict(email, null), 'Este correo ya tiene una cuenta. Inicia sesión o usa otro correo.', 409);
    const id = `est-${randomUUID()}`, ownerId = `owner-${randomUUID()}`;
    let pin;do{pin=String(randomInt(1000,10000));}while(['1234','2345','3456','8041','8042','8043'].includes(pin));
    let slug = slugify(name), suffix = 2;
    const baseSlug = slug;
    while (slugConflict(slug, null)) slug = `${baseSlug}-${suffix++}`;
    const restaurant = {...defaults.initialRestaurant, id, name, slug, contactEmail: email, logoUrl: '', coverUrl: '', publicBaseUrl: options.publicOrigin||''};
    const staff = {id: ownerId, name: ownerName, email, role: 'OWNER', active: true};
    const trial=payload.demo===true;
    const seed = {
      restaurant, settings: structuredClone(defaults.initialSettings), monitorPin: pin,
      entities: {tables: Array.from({length: trial?1:5}, (_, index) => ({id: `mesa-${randomUUID()}`, number: index + 1,
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
      entry.app.subscription.initialize(plan,interval,{trial,legacy:!trial&&!options.production&&!payload.plan});
      entry.app.db.prepare('INSERT INTO saas_accounts(user_id,created_at,last_login_at) VALUES (?,?,?)').run(ownerId, createdAt, createdAt);
      primary.app.db.prepare('INSERT INTO tenant_restaurants(id,created_at) VALUES (?,?)').run(id, createdAt);
      entry.app.setSession(response, ownerId, 'password');
      if(legal.legalPublished&&payload.acceptLegal===true)commercial.consent(ownerId,legal.legalVersion);
      primary.app.db.exec('COMMIT');
      entries.push(entry);
    } catch (error) {
      primary.app.db.exec('ROLLBACK');
      if (entry) { entry.app.close(); for (const suffix of ['', '.key', '-wal', '-shm']) if (entry.dbPath !== ':memory:' && existsSync(entry.dbPath + suffix)) unlinkSync(entry.dbPath + suffix); }
      throw error;
    }
    return {...staff, restaurant, monitorPin: pin,subscription:entry.app.subscription.snapshot()};
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
    for(const restaurant of restaurants){const entry=entries.find(e=>e.app.restaurant().id===restaurant.id);restaurant.subscription=entry.app.subscription.snapshot();restaurant.platformMode=options.production?'production':'local';}
    return {...snapshot, accounts, restaurants, summary, security:{...primary.app.mfa.status(snapshot.viewer.id),required:process.env.REQUIRE_PLATFORM_MFA==='true'},activity: activity.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 100)};
  }

  primary.app.server.removeAllListeners('request');
  primary.app.server.on('request', async (request, response) => {
    securityHeaders(response,options.production);
    try {
      const url = new URL(request.url, 'http://local');
      const session = sessionEntry(request);
      if(['/api/account/payments.csv','/api/saas/payments.csv'].includes(url.pathname)&&request.method==='GET'){
        const restaurantId=url.pathname.startsWith('/api/account/')?(ownerAccess(session,request),session.app.restaurant().id):(platformAccess(session,request),null);
        async function* csv(){yield '\uFEFF'+['id','restaurante','fecha','importe_centavos','moneda','referencia','plan','ciclo','inicio','fin','anulado','motivo'].join(',')+'\r\n';for(const p of finance.iterate(restaurantId))yield [p.id,p.restaurantId,p.createdAt,p.amountCents,p.currency,p.reference,p.plan,p.interval,p.periodStart,p.periodEnd,p.voidedAt||'',p.voidReason||''].map(csvCell).join(',')+'\r\n';}
        response.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="atencion-pagos.csv"','Cache-Control':'no-store'});await pipeline(Readable.from(csv()),response);return;
      }
      if(url.pathname==='/api/account/state'&&request.method==='GET'){ownerAccess(session,request);json(response,200,{lifecycle:lifecycle(session.app.restaurant().id),payments:finance.list(session.app.restaurant().id),canDelete:session!==primary});return;}
      if(url.pathname==='/api/account/export'&&request.method==='GET'){
        ownerAccess(session,request);fail(!backingUp,'Espera a que termine el respaldo.',409);exporting.set(session,(exporting.get(session)||0)+1);
        response.writeHead(200,{'Content-Type':'application/x-tar','Content-Disposition':'attachment; filename="atencion-datos.tar"','Cache-Control':'no-store'});
        try{await pipeline(Readable.from(accountArchive(session,session===primary?mediaDir:path.join(mediaDir,session.id))),response);}finally{exporting.set(session,exporting.get(session)-1);}return;
      }
      if(url.pathname==='/api/saas/finance'&&request.method==='GET'){platformAccess(session,request);json(response,200,{payments:finance.list(),renewals:entries.map(e=>({restaurantId:e.app.restaurant().id,name:e.app.restaurant().name,...e.app.subscription.snapshot()})).filter(s=>s.endsAt&&Date.parse(s.endsAt)<=Date.now()+30*86400000),requests:primary.app.db.prepare("SELECT * FROM account_lifecycle WHERE status='pending'").all()});return;}
      if(url.pathname==='/api/public/config'&&request.method==='GET'){json(response,200,commercial.config());return;}
      if(url.pathname==='/api/saas/leads'&&request.method==='GET'){fail(session===primary&&primary.app.viewer(request).scope==='platform','Acceso reservado a la plataforma.',403);platformAccess(session,request);json(response,200,{leads:commercial.list()});return;}
      if(url.pathname==='/api/saas/ops'&&request.method==='GET'){fail(session===primary,'Acceso reservado a la plataforma.',403);platformAccess(session,request);json(response,200,{uptimeSeconds:Math.floor(process.uptime()),memoryBytes:process.memoryUsage().rss,restaurants:entries.length,lastBackup:lastBackup?{createdAt:lastBackup.createdAt,files:lastBackup.files}:null,backupError,backingUp,mailConfigured:accountSecurity.mailConfigured(),serverErrors,disk:diskStatus(mediaDir),backupDisk:diskStatus(options.backupDir||process.env.BACKUP_DIR||mediaDir),commercialConfigured:!!commercial.config().salesEmail,legalPublished:commercial.config().legalPublished});return;}
      let body;
      if (url.pathname === '/api/action' && request.method === 'POST') {
        fail(!backingUp,'Respaldo en curso. Reintenta en unos segundos.',503);
        fail(allowedOrigin(request,options.publicOrigin), 'El origen no está permitido.', 403);
        body = await primary.app.readBody(request); request.atencionBody = body;
        fail(body && typeof body === 'object' && !Array.isArray(body), 'La acción no es válida.');
        if (body.payload === undefined) body.payload = {};
        fail(body.payload && typeof body.payload === 'object' && !Array.isArray(body.payload), 'La acción no es válida.');
        if(body.action?.startsWith('saas.'))platformAccess(session,request);
        if(['account.cancel','account.deletion.request','account.deletion.withdraw'].includes(body.action)){
          ownerAccess(session,request);reauthenticate(session,request,body.payload.password);const id=session.app.restaurant().id,current=lifecycle(id),now=new Date().toISOString();
          if(body.action==='account.deletion.withdraw'){fail(current?.kind==='delete'&&current.status==='pending','No hay una eliminación pendiente.');primary.app.db.prepare("UPDATE account_lifecycle SET status='withdrawn' WHERE restaurant_id=?").run(id);accountEvent(id,session.app.viewer(request).user.id,'deletion.withdraw');json(response,200,{ok:true,result:{message:'Solicitud retirada. El servicio permanece suspendido; coordina su reactivación.'}});return;}
          const kind=body.action==='account.cancel'?'cancel':'delete';fail(kind!=='delete'||session!==primary,'La instalación principal contiene la plataforma y no se elimina desde aquí.',409);fail(body.payload.confirmName===session.app.restaurant().name,'Escribe el nombre exacto del restaurante.');
          fail(!current||current.kind!=='delete'||current.status!=='pending'||kind==='delete','Primero retira la solicitud de eliminación.',409);
          if(!(current?.status==='pending'&&current.kind===kind)){session.app.subscription.update({status:'suspended'},ownerAccess(session,request).user.id,k=>entities(session.app,k));primary.app.db.prepare('INSERT INTO account_lifecycle VALUES(?,?,?,?,?,?,NULL) ON CONFLICT(restaurant_id) DO UPDATE SET kind=excluded.kind,status=excluded.status,requested_at=excluded.requested_at,not_before=excluded.not_before,completed_at=NULL').run(id,session.id,kind,'pending',now,new Date(Date.now()+(kind==='delete'?7:0)*86400000).toISOString());session.app.changed();}
          json(response,200,{ok:true,result:{message:kind==='delete'?'Eliminación solicitada. La atención se suspendió. Puedes retirar la solicitud antes de que el proveedor elimine los datos activos, como mínimo dentro de siete días.':'Servicio suspendido y cancelación registrada. Tus datos se conservan; no se generan cobros automáticos.'}});return;
        }
        if(body.action==='saas.payment.record'){const target=entries.find(e=>e.app.restaurant().id===body.payload.restaurantId);fail(target,'Restaurante no encontrado.',404);json(response,200,{ok:true,result:finance.record(body.payload,primary.app.viewer(request).user.id,target.app.restaurant().id)});return;}
        if(body.action==='saas.payment.void'){json(response,200,{ok:true,result:finance.voidPayment(body.payload,primary.app.viewer(request).user.id)});return;}
        if(body.action==='saas.account.delete'){
          const v=reauthenticate(primary,request,body.payload.password);if(primary.app.mfa.enabled(v.user.id))primary.app.verifyMfa(request,v.user.id,body.payload.code);
          const target=entries.find(e=>e.app.restaurant().id===body.payload.restaurantId),record=target&&lifecycle(target.app.restaurant().id);fail(target&&target!==primary,'Restaurante no eliminable.',409);fail(record?.kind==='delete'&&record.status==='pending'&&Date.parse(record.not_before)<=Date.now(),'No hay solicitud elegible; respeta los siete días de seguridad.',409);fail(body.payload.confirmName===target.app.restaurant().name&&body.payload.backupPolicyAccepted===true,'Confirma el nombre y la política de respaldos.');fail(!exporting.get(target),'Hay una exportación en curso.',409);
          const members=entities(target.app,'staff');primary.app.db.exec('BEGIN IMMEDIATE');try{primary.app.db.prepare('INSERT INTO tenant_deletions VALUES(?,?,NULL)').run(target.id,new Date().toISOString());primary.app.db.prepare('DELETE FROM tenant_restaurants WHERE id=?').run(target.id);primary.app.db.prepare("UPDATE account_lifecycle SET status='deleted',completed_at=? WHERE restaurant_id=?").run(new Date().toISOString(),target.app.restaurant().id);accountEvent(target.app.restaurant().id,v.user.id,'deletion.execute');primary.app.db.prepare('DELETE FROM account_tokens WHERE entry_id=?').run(target.id);primary.app.db.prepare('DELETE FROM verified_emails WHERE entry_id=?').run(target.id);for(const m of members){primary.app.db.prepare('DELETE FROM legal_consents WHERE user_id=?').run(m.id);primary.app.db.prepare('DELETE FROM commercial_leads WHERE lower(email)=?').run(String(m.email).toLowerCase());}primary.app.db.exec('COMMIT');}catch(e){primary.app.db.exec('ROLLBACK');throw e;}
          entries.splice(entries.indexOf(target),1);await target.app.close();purgeTenantFiles(target.id);primary.app.db.prepare('UPDATE tenant_deletions SET completed_at=? WHERE id=?').run(new Date().toISOString(),target.id);json(response,200,{ok:true,result:{message:'Datos activos eliminados. Los registros financieros y las copias históricas siguen sujetos a su política de conservación.'}});return;
        }
        if (body.action === 'auth.register') { json(response, 200, {ok: true, result: register(request, response, body.payload)}); return; }
        if(body.action==='commercial.lead.create'){json(response,200,{ok:true,result:commercial.create(body.payload,clientIp(request))});return;}
        if(body.action==='saas.lead.update'){fail(session===primary&&primary.app.viewer(request).scope==='platform','Acceso reservado a la plataforma.',403);primary.app.saasSnapshot(request);json(response,200,{ok:true,result:commercial.update(body.payload,primary.app.viewer(request).user.id)});return;}
        if(['saas.media.inspect','saas.media.cleanup'].includes(body.action)){
          fail(body.action!=='saas.media.cleanup'||![...exporting.values()].some(Boolean),'Espera a que terminen las exportaciones.',409);
          fail(session===primary&&primary.app.viewer(request).scope==='platform','Acceso reservado a la plataforma.',403);primary.app.saasSnapshot(request);
          fail(body.action!=='saas.media.cleanup'||body.payload.confirm===true,'Confirma la limpieza.');
          const result=entries.map(entry=>({restaurantId:entry.app.restaurant().id,restaurantName:entry.app.restaurant().name,...inspectMedia(entry,entry===primary?mediaDir:path.join(mediaDir,entry.id),{remove:body.action==='saas.media.cleanup'})}));
          json(response,200,{ok:true,result});return;
        }
        if(body.action==='saas.backup.create'){primary.app.saasSnapshot(request);json(response,200,{ok:true,result:await runBackup()});return;}
        if(['auth.forgot','auth.reset','auth.verify','auth.verification.send'].includes(body.action)){json(response,200,{ok:true,result:await accountSecurity.action(body.action,body.payload,request,session)});return;}
        if(body.action==='saas.subscription.update'){
          fail(session===primary&&primary.app.viewer(request).scope==='platform','Solo la administración SaaS puede cambiar suscripciones.',403);
          primary.app.saasSnapshot(request);
          const entry=entries.find(e=>e.app.restaurant().id===body.payload.restaurantId);fail(entry,'Restaurante no encontrado.',404);
          const result=entry.app.subscription.update(body.payload,primary.app.viewer(request).user.id,k=>entities(entry.app,k));entry.app.changed();json(response,200,{ok:true,result});return;
        }
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
      if (!response.headersSent) json(response, error.status || 500, {ok: false, error: error.status ? error.message : 'No se pudo completar la solicitud.', code: error.code||(error.status === 409 ? 'ACCOUNT_CONFLICT' : error.status === 403 ? 'FORBIDDEN' : 'VALIDATION')});
      else response.end();
      if (!error.status){serverErrors++;console.error(JSON.stringify({event:'server_error',time:new Date().toISOString()}));}
    }
  });
  const originalClose = primary.app.close;
  return {...primary.app, entries,runBackup, close: async () => {clearInterval(backupTimer);while(backingUp)await new Promise(resolve=>setTimeout(resolve,20));for (const entry of entries.slice(1)) await entry.app.close(); await originalClose(); }};
}
