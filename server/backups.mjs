import {backup,DatabaseSync} from 'node:sqlite';
import {mkdirSync,copyFileSync,readdirSync,readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
const sha=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
function files(root,prefix=''){return readdirSync(path.join(root,prefix),{withFileTypes:true}).flatMap(e=>{if(e.isSymbolicLink())throw new Error('No se admiten enlaces simbólicos en respaldos.');const p=path.join(prefix,e.name);return e.isDirectory()?files(root,p):[p];});}
export async function createFullBackup(entries,mediaDir,backupRoot){
 const id=`${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`,staging=path.resolve(backupRoot,`${id}.partial`),destination=path.resolve(backupRoot,id);
 mkdirSync(staging,{recursive:true,mode:0o700});mkdirSync(path.join(staging,'data','tenants'),{recursive:true});mkdirSync(path.join(staging,'uploads'),{recursive:true});
 for(const entry of entries){const source=entry.dbPath;const relative=entry.id==='primary'?'platform.sqlite':path.join('tenants',`${entry.id}.sqlite`),target=path.join(staging,'data',relative);await backup(entry.app.db,target);const copy=new DatabaseSync(target);try{copy.exec("PRAGMA journal_mode=DELETE");}finally{copy.close();}if(source&&source!==':memory:'){if(!existsSync(source+'.key'))throw new Error('Falta la clave de la base de datos.');copyFileSync(source+'.key',target+'.key');}}
 if(existsSync(mediaDir))for(const relative of files(mediaDir)){const target=path.join(staging,'uploads',relative);mkdirSync(path.dirname(target),{recursive:true});copyFileSync(path.join(mediaDir,relative),target);}
 const manifest={format:'atencion-full-v1',createdAt:new Date().toISOString(),files:files(staging).map(relative=>({path:relative.replaceAll('\\','/'),sha256:sha(path.join(staging,relative))}))};
 writeFileSync(path.join(staging,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});renameSync(staging,destination);return {path:destination,createdAt:manifest.createdAt,files:manifest.files.length};
}
export function verifyFullBackup(root){
 const manifest=JSON.parse(readFileSync(path.join(root,'manifest.json'),'utf8'));if(manifest.format!=='atencion-full-v1'||!Array.isArray(manifest.files))throw new Error('Formato de respaldo inválido.');
 const seen=new Set();for(const item of manifest.files){const file=path.resolve(root,item.path);if(!file.startsWith(path.resolve(root)+path.sep)||seen.has(file)||!existsSync(file)||sha(file)!==item.sha256)throw new Error(`Integridad de respaldo inválida: ${item.path}`);seen.add(file);if(file.endsWith('.sqlite')){const db=new DatabaseSync(file,{readOnly:true});try{if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok')throw new Error('SQLite no supera integrity_check.');}finally{db.close();}}}
 const actual=files(root).filter(p=>p!=='manifest.json');if(actual.length!==seen.size||!seen.has(path.resolve(root,'data','platform.sqlite')))throw new Error('El inventario del respaldo está incompleto.');return manifest;
}
