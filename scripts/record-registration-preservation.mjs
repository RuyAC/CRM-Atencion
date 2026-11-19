import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {copyFileSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import path from 'node:path';

const root=process.cwd(),out=path.join(root,'.impeccable/review/registration');
mkdirSync(out,{recursive:true});
const dbPath=path.join(root,'data/chamaii.sqlite'),db=new DatabaseSync(dbPath);
const tables=['meta','entities','credentials','requests','operations','platform_admins','saas_admin_grants','saas_accounts','saas_activity'];
const hashes=Object.fromEntries(tables.map(table=>[table,createHash('sha256').update(JSON.stringify(db.prepare(`SELECT * FROM ${table} ORDER BY rowid`).all())).digest('hex')]));
const counts=Object.fromEntries(db.prepare('SELECT kind,COUNT(*) AS total FROM entities GROUP BY kind').all().map(row=>[row.kind,row.total]));
if(process.argv[2]==='before'){
  const snapshot=path.join(root,'data/backups',`pre-registration-${Date.now()}.sqlite`);mkdirSync(path.dirname(snapshot),{recursive:true});
  db.exec(`VACUUM INTO '${snapshot.replaceAll("'","''")}'`);copyFileSync(`${dbPath}.key`,`${snapshot}.key`);
  writeFileSync(path.join(out,'before.json'),JSON.stringify({snapshot,hashes,counts},null,2));console.log(JSON.stringify({snapshot,counts}));
}else if(process.argv[2]==='after'){
  const previous=JSON.parse(readFileSync(path.join(out,'before.json'),'utf8'));
  const checks=Object.fromEntries(tables.map(table=>[table,hashes[table]===previous.hashes[table]]));
  const result={checkedAt:new Date().toISOString(),checks,counts,passed:Object.values(checks).every(Boolean)};
  writeFileSync(path.join(out,'live-data-preservation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(!result.passed)process.exitCode=1;
}else throw new Error('Use before or after');
db.close();
