import {readdirSync,lstatSync,createReadStream} from 'node:fs';
import path from 'node:path';
function header(name,size){const b=Buffer.alloc(512),oct=(n,len)=>Math.floor(n).toString(8).padStart(len-1,'0')+'\0';b.write(name,0,100);b.write(oct(0o600,8),100);b.write(oct(0,8),108);b.write(oct(0,8),116);b.write(oct(size,12),124);b.write(oct(Date.now()/1000,12),136);b.fill(32,148,156);b.write('0',156);b.write('ustar\0',257);b.write('00',263);const sum=b.reduce((n,x)=>n+x,0);b.write(sum.toString(8).padStart(6,'0')+'\0 ',148);return b;}
export async function* accountArchive(entry,mediaRoot){
 const app=entry.app,meta=key=>JSON.parse(app.db.prepare('SELECT value FROM meta WHERE key=?').get(key)?.value||'null');
 const settings={...meta('settings')};delete settings.wifiPassword;delete settings.tvPin;
 const entities={};for(const kind of ['tables','categories','products','buttons','staff','networks','orders'])entities[kind]=app.all(kind);
 const data=Buffer.from(JSON.stringify({format:'atencion-portability-v1',exportedAt:new Date().toISOString(),restaurant:app.restaurant(),settings,entities,requests:app.db.prepare('SELECT data FROM requests').all().map(r=>JSON.parse(r.data)),subscription:app.subscription.snapshot(),notice:'Exportación de datos y archivos. No incluye contraseñas, PIN, secretos ni accesos SaaS. No es un respaldo restaurable.'},null,2));
 yield header('datos.json',data.length);yield data;yield Buffer.alloc((512-data.length%512)%512);
 for(const f of readdirSync(mediaRoot,{withFileTypes:true})){if(!f.isFile()||f.isSymbolicLink()||!/^[a-f0-9-]{36}\.(jpg|png|webp|gif|mp4|webm|mov)$/i.test(f.name))continue;const file=path.join(mediaRoot,f.name),s=lstatSync(file);if(!s.isFile()||s.isSymbolicLink())continue;yield header('archivos/'+f.name,s.size);let read=0;for await(const chunk of createReadStream(file)){read+=chunk.length;yield chunk;}if(read!==s.size)throw new Error('El archivo cambió durante la exportación.');yield Buffer.alloc((512-s.size%512)%512);}
 yield Buffer.alloc(1024);
}
