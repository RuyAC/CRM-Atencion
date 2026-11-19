import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdirSync, readFileSync, writeFileSync, copyFileSync} from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const directory = path.join(root, '.impeccable', 'review', 'account-separation');
mkdirSync(directory, {recursive: true});
const dbPath = path.join(root, 'data', 'chamaii.sqlite');
const db = new DatabaseSync(dbPath);
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const entities = db.prepare('SELECT kind,id,data FROM entities ORDER BY kind,id').all();
const owner = db.prepare('SELECT * FROM credentials WHERE id=?').get('owner-local');
const baseline = {
  capturedAt: new Date().toISOString(),
  preservedEntities: digest(entities.filter(row => row.kind !== 'staff')),
  preservedStaff: digest(entities.filter(row => row.kind === 'staff' && row.id !== 'owner-local')),
  requests: digest(db.prepare('SELECT * FROM requests ORDER BY id').all()),
  settings: digest(db.prepare('SELECT value FROM meta WHERE key=?').get('settings')),
  ownerPassword: digest(owner.password_hash),
  ownerPin: digest([owner.pin_hash, owner.pin_cipher]),
  counts: Object.fromEntries([...new Set(entities.map(row => row.kind))].map(kind => [kind, entities.filter(row => row.kind === kind).length])),
};
if (process.argv[2] === 'before') {
  const backupDirectory = path.join(root, 'data', 'backups');
  mkdirSync(backupDirectory, {recursive: true});
  const snapshot = path.join(backupDirectory, `pre-account-separation-${Date.now()}.sqlite`);
  db.exec(`VACUUM INTO '${snapshot.replaceAll("'", "''")}'`);
  copyFileSync(`${dbPath}.key`, `${snapshot}.key`);
  writeFileSync(path.join(directory, 'before.json'), JSON.stringify({...baseline, snapshot}, null, 2));
  console.log(JSON.stringify({snapshot, counts: baseline.counts}));
} else if (process.argv[2] === 'after') {
  const before = JSON.parse(readFileSync(path.join(directory, 'before.json'), 'utf8'));
  const principal = db.prepare('SELECT * FROM platform_admins WHERE id=?').get('platform-admin-local');
  const checks = Object.fromEntries(['preservedEntities', 'preservedStaff', 'requests', 'settings', 'ownerPassword', 'ownerPin'].map(key => [key, before[key] === baseline[key]]));
  checks.restaurantEmail = owner.email === 'ventas@matebar.com';
  checks.platformEmail = principal?.email === 'admin@local.test';
  checks.platformNotStaff = !entities.some(row => row.kind === 'staff' && row.id === 'platform-admin-local');
  checks.platformOnlyGrant = db.prepare('SELECT user_id FROM saas_admin_grants').all().every(row => row.user_id === 'platform-admin-local');
  const result = {capturedAt: baseline.capturedAt, checks, counts: baseline.counts, passed: Object.values(checks).every(Boolean)};
  writeFileSync(path.join(directory, 'live-data-preservation.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  if (!result.passed) process.exitCode = 1;
} else throw new Error('Use before or after.');
db.close();
