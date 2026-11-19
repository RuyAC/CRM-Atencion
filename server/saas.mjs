import { randomUUID } from 'node:crypto';
import { periodStart } from './reporting.mjs';
import { hashSecret } from './security.mjs';

// Platform identities and authority are installation metadata. Neither belongs
// to restaurant staff or restaurant backups.
export function createSaas({ bootstrap = null, db, all, one, requests, restaurant, settings, getMeta, setMeta, transaction, fail, now }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS platform_admins (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS saas_admin_grants (user_id TEXT PRIMARY KEY);
    CREATE TABLE IF NOT EXISTS saas_accounts (user_id TEXT PRIMARY KEY, created_at TEXT, last_login_at TEXT);
    CREATE TABLE IF NOT EXISTS saas_activity (
      id TEXT PRIMARY KEY, type TEXT NOT NULL, actor_id TEXT NOT NULL,
      actor_name TEXT NOT NULL, actor_email TEXT NOT NULL, created_at TEXT NOT NULL,
      restaurant_name TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS saas_activity_created ON saas_activity(created_at);
  `);
  if (getMeta('saas_identity_v2') === undefined) transaction(() => {
    const principal = one('staff', 'owner-local');
    const credential = db.prepare('SELECT * FROM credentials WHERE id=?').get('owner-local');
    const wasGranted = Boolean(db.prepare('SELECT user_id FROM saas_admin_grants WHERE user_id=?').get('owner-local'));
    const firstSaasInstall = getMeta('saas_bootstrap_v1') === undefined;
    if (principal?.role === 'OWNER' && credential) {
      fail(!db.prepare('SELECT id FROM credentials WHERE lower(email)=? AND id<>?').get('ventas@matebar.com', principal.id),
        'El correo de Mate bar ya pertenece a otra cuenta. No se pudo separar la administración SaaS.', 409);
      fail(!db.prepare('SELECT id FROM credentials WHERE lower(email)=? AND id<>?').get('admin@local.test', principal.id),
        'El correo de administración SaaS ya pertenece a otro miembro del restaurante.', 409);
      const platformId = 'platform-admin-local';
      db.prepare('INSERT OR IGNORE INTO platform_admins(id,name,email,password_hash,active) VALUES (?,?,?,?,?)')
        .run(platformId, 'Administrador de AUnToque', 'admin@local.test', bootstrap ? hashSecret(bootstrap.adminPassword) : credential.password_hash, principal.active !== false ? 1 : 0);
      // A previously revoked grant stays revoked. Restarting or restoring a
      // restaurant backup must never bootstrap platform access again.
      if (principal.active !== false && (firstSaasInstall || wasGranted)) {
        db.prepare('INSERT OR IGNORE INTO saas_admin_grants(user_id) VALUES (?)').run(platformId);
      }
      db.prepare('UPDATE credentials SET email=? WHERE id=?').run('ventas@matebar.com', principal.id);
      db.prepare("UPDATE entities SET data=? WHERE kind='staff' AND id=?")
        .run(JSON.stringify({ ...principal, email: 'ventas@matebar.com', name: principal.name === 'Administrador' ? 'Mate bar' : principal.name }), principal.id);
      const r = restaurant();
      if (r.contactEmail?.toLowerCase() === 'admin@local.test') setMeta('restaurant', { ...r, contactEmail: 'ventas@matebar.com' });
      // Existing cookies represented both identities. They cannot cross the
      // new authorization boundary; PIN/password values remain unchanged.
      db.prepare('DELETE FROM sessions WHERE user_id=?').run(principal.id);
      if (credential.email.toLowerCase() === 'admin@local.test') {
        db.prepare('UPDATE saas_accounts SET last_login_at=NULL WHERE user_id=?').run(principal.id);
        db.prepare("UPDATE saas_activity SET type='account.login.legacy' WHERE actor_id=? AND lower(actor_email)=? AND type='account.login'")
          .run(principal.id, 'admin@local.test');
      }
    }
    db.prepare('DELETE FROM saas_admin_grants WHERE user_id NOT IN (SELECT id FROM platform_admins)').run();
    setMeta('saas_bootstrap_v1', true);
    setMeta('saas_identity_v2', true);
  });

  db.prepare('UPDATE platform_admins SET name=? WHERE name=?').run('Administrador de AUnToque','Administrador de Atencion');
  const platformById = id => db.prepare('SELECT * FROM platform_admins WHERE id=?').get(id);
  const platformByEmail = email => db.prepare('SELECT * FROM platform_admins WHERE lower(email)=?').get(email.toLowerCase());
  const platformUser = row => row ? ({ id: row.id, name: row.name, email: row.email, role: 'PLATFORM_ADMIN', active: Boolean(row.active) }) : null;
  const reservedEmail = email => Boolean(platformByEmail(email));
  const hasGrant = id => Boolean(id && db.prepare('SELECT user_id FROM saas_admin_grants WHERE user_id=?').get(id));
  const canAccess = v => Boolean(v?.scope === 'platform' && v.user?.role === 'PLATFORM_ADMIN' && v.user.active !== false && platformById(v.user.id)?.active && hasGrant(v.user.id));
  function requireAccess(v) {
    fail(v.user && ['password', 'platform'].includes(v.scope), 'Entra con correo y contraseña para administrar la plataforma.', 401, 'AUTH_REQUIRED');
    fail(canAccess(v), 'Tu cuenta no tiene acceso a la administración SaaS.', 403, 'FORBIDDEN');
    return v;
  }
  function guardCredentialRead(v, id) {
    fail(!platformById(id), 'La cuenta SaaS no forma parte del equipo del restaurante.', 403, 'FORBIDDEN');
  }
  function guardStaffChange(actor, id) {
    fail(!platformById(id), 'La cuenta SaaS no forma parte del equipo del restaurante.', 403, 'FORBIDDEN');
  }
  function recordAccountCreated(id) {
    db.prepare('INSERT OR IGNORE INTO saas_accounts(user_id,created_at,last_login_at) VALUES (?,?,NULL)').run(id, now());
  }
  function recordOwnerLogin(member, email) {
    if (member.role !== 'OWNER') return;
    const createdAt = now();
    db.prepare(`INSERT INTO saas_accounts(user_id,created_at,last_login_at) VALUES (?,NULL,?)
      ON CONFLICT(user_id) DO UPDATE SET last_login_at=excluded.last_login_at`).run(member.id, createdAt);
    db.prepare(`INSERT INTO saas_activity(id,type,actor_id,actor_name,actor_email,created_at,restaurant_name)
      VALUES (?,?,?,?,?,?,?)`).run(randomUUID(), 'account.login', member.id, member.name, email, createdAt, restaurant().name);
    db.prepare('DELETE FROM saas_activity WHERE id NOT IN (SELECT id FROM saas_activity ORDER BY created_at DESC, rowid DESC LIMIT 100)').run();
  }
  function removeAccount(id) {
    db.prepare('DELETE FROM saas_accounts WHERE user_id=?').run(id);
  }
  function prepareRestore(input) {
    const content = structuredClone(input);
    const ids = new Set(), emails = new Set();
    // Backups from before identity separation used the SaaS address for the
    // restaurant owner. Import that restaurant identity under its client email.
    for (const member of [...content.entities.staff, ...content.credentials]) {
      if (member.id === 'owner-local' && member.email?.toLowerCase() === 'admin@local.test') member.email = 'ventas@matebar.com';
    }
    if (content.restaurant.contactEmail?.toLowerCase() === 'admin@local.test') content.restaurant.contactEmail = 'ventas@matebar.com';
    for (const member of content.entities.staff) {
      fail(typeof member.id === 'string' && member.id.trim() === member.id && !ids.has(member.id) && !platformById(member.id), 'El equipo del respaldo contiene un acceso inválido.');
      fail(['OWNER', 'MANAGER', 'STAFF'].includes(member.role), 'El perfil del respaldo no es válido.');
      fail(typeof member.email === 'string' && !reservedEmail(member.email), 'El respaldo no puede importar cuentas SaaS al restaurante.');
      ids.add(member.id);
    }
    const credentialIds = new Set();
    for (const credential of content.credentials) {
      const member = content.entities.staff.find(item => item.id === credential.id);
      fail(member && !credentialIds.has(credential.id) && typeof credential.email === 'string', 'Las credenciales del respaldo no corresponden al equipo.');
      credential.email = credential.email.trim().toLowerCase(); member.email = member.email.trim().toLowerCase();
      fail(credential.email === member.email && !reservedEmail(credential.email) && !emails.has(credential.email), 'El respaldo contiene un correo duplicado o reservado.');
      fail(typeof credential.password_hash === 'string' && typeof credential.pin_hash === 'string', 'Las credenciales del respaldo son inválidas.');
      credentialIds.add(credential.id); emails.add(credential.email);
    }
    fail(content.entities.staff.some(member => member.role === 'OWNER' && member.active !== false && credentialIds.has(member.id)), 'El respaldo debe conservar un propietario activo del restaurante.');
    return content;
  }
  function afterRestore() {
    // Restaurant accounts can be removed; platform identities and grants are
    // independent and untouched by restaurant restoration.
    const ids = new Set(all('staff').map(member => member.id));
    for (const { user_id: id } of db.prepare('SELECT user_id FROM saas_accounts').all()) if (!ids.has(id)) removeAccount(id);
  }
  function snapshot(v) {
    requireAccess(v);
    const r = restaurant(), members = all('staff'), tables = all('tables'), products = all('products');
    const credentialRows = new Map(db.prepare('SELECT id,email FROM credentials').all().map(row => [row.id, row]));
    const metadata = new Map(db.prepare('SELECT user_id,created_at,last_login_at FROM saas_accounts').all().map(row => [row.user_id, row]));
    const owners = members.filter(member => member.role === 'OWNER' && credentialRows.has(member.id));
    const accounts = owners.map(member => ({
      id: member.id, name: member.name, email: credentialRows.get(member.id).email, active: member.active !== false,
      restaurantId: r.id, restaurantName: r.name, createdAt: metadata.get(member.id)?.created_at || null,
      lastLoginAt: metadata.get(member.id)?.last_login_at || null,
    }));
    const cutoff = periodStart('day', r.timezone).getTime(), allRequests = requests();
    return {
      viewer: { id: v.user.id, name: v.user.name, email: platformById(v.user.id).email },
      summary: {
        accounts: accounts.length, activeAccounts: accounts.filter(member => member.active).length, restaurants: 1,
        staff: members.length, tables: tables.length, products: products.length,
        requestsToday: allRequests.filter(item => Date.parse(item.createdAt) >= cutoff).length,
        pendingRequests: allRequests.filter(item => item.status === 'pending').length,
      },
      accounts,
      restaurants: [{
        id: r.id, name: r.name, slug: r.slug, currency: r.currency, timezone: r.timezone,
        activeTables: tables.filter(table => table.active !== false).length, totalTables: tables.length,
        products: products.length, staff: members.length,
        owners: accounts.map(({ id, name, email, active }) => ({ id, name, email, active })),
        servicePaused: Boolean(settings().paused), platformMode: 'local',
      }],
      activity: db.prepare('SELECT * FROM saas_activity ORDER BY created_at DESC, rowid DESC LIMIT 100').all().map(row => ({
        id: row.id, type: row.type, label: row.type === 'account.login.legacy' ? 'Acceso anterior a la separación de cuentas' : 'Inicio de sesión de propietario', actorName: row.actor_name,
        actorEmail: row.actor_email, createdAt: row.created_at, restaurantName: row.restaurant_name,
      })),
      generatedAt: now(),
    };
  }
  return { platformById, platformByEmail, platformUser, reservedEmail, canAccess, requireAccess, guardCredentialRead, guardStaffChange, recordAccountCreated, recordOwnerLogin, removeAccount, prepareRestore, afterRestore, snapshot };
}
