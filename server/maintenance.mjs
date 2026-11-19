import {readdirSync,lstatSync,unlinkSync,statfsSync,existsSync,rmSync} from 'node:fs';
import path from 'node:path';
import {verifyFullBackup} from './backups.mjs';
// Only managed UUID upload names in this restaurant's own directory can be removed.
export function inspectMedia(entry,root,{remove=false,now=Date.now(),minAgeHours=168}={}){
 const refs=new Set();
 const collect=value=>{if(typeof value==='string'&&value.startsWith(entry.prefix))refs.add(value.slice(entry.prefix.length));else if(value&&typeof value==='object')for(const v of Object.values(value))collect(v);};
 for(const row of entry.app.db.prepare('SELECT value FROM meta').all()){try{collect(JSON.parse(row.value));}catch{}}
 for(const row of entry.app.db.prepare('SELECT data FROM entities').all())collect(JSON.parse(row.data));
 let totalBytes=0;const candidates=[];
 if(existsSync(root))for(const f of readdirSync(root,{withFileTypes:true})){if(!f.isFile()||f.isSymbolicLink())continue;const full=path.resolve(root,f.name),s=lstatSync(full);totalBytes+=s.size;if(/^[a-f0-9]{8}-[a-f0-9-]{27}\.(jpg|png|webp|gif|mp4|webm|mov)$/i.test(f.name)&&!refs.has(f.name)&&now-s.mtimeMs>=minAgeHours*3600000)candidates.push({name:f.name,bytes:s.size});}
 if(remove)for(const file of candidates)unlinkSync(path.join(root,file.name));
 return {totalBytes,unusedBytes:candidates.reduce((n,f)=>n+f.bytes,0),files:candidates.length,minAgeHours,removed:remove};
}
export function diskStatus(root){try{const s=statfsSync(root);return {freeBytes:Number(s.bavail)*Number(s.bsize),totalBytes:Number(s.blocks)*Number(s.bsize)};}catch{return null;}}
export function retainBackups(root,{keep=7,maxAgeDays=30,now=Date.now()}={}){
 if(!existsSync(root))return {removed:0};
 const candidates=[];
 for(const d of readdirSync(root,{withFileTypes:true})){if(!d.isDirectory()||d.isSymbolicLink()||!/^\d{4}-\d{2}-\d{2}T[\dTZ-]+-[a-f0-9-]{36}$/.test(d.name))continue;try{const manifest=verifyFullBackup(path.join(root,d.name));candidates.push({name:d.name,at:Date.parse(manifest.createdAt)});}catch{}}
 candidates.sort((a,b)=>b.at-a.at);let removed=0;
 for(const item of candidates.slice(keep)){if(now-item.at<maxAgeDays*86400000)continue;const target=path.resolve(root,item.name);if(path.dirname(target)!==path.resolve(root))throw new Error('Ruta de retención inválida.');rmSync(target,{recursive:true});removed++;}
 return {removed};
}
