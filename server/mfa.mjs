import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {encryptPin,decryptPin,digest} from './security.mjs';
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes){let bits=0,value=0,out='';for(const byte of bytes){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=alphabet[(value>>>(bits-5))&31];bits-=5;}}if(bits)out+=alphabet[(value<<(5-bits))&31];return out;}
function decode(s){let bits=0,value=0,out=[];for(const c of s){value=(value<<5)|alphabet.indexOf(c);bits+=5;if(bits>=8){out.push((value>>>(bits-8))&255);bits-=8;}}return Buffer.from(out);}
export function totp(secret,time=Date.now(),digits=6){const counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(Math.floor(time/30000)));const h=createHmac('sha1',decode(secret)).update(counter).digest(),o=h.at(-1)&15;return String((h.readUInt32BE(o)&0x7fffffff)%10**digits).padStart(digits,'0');}
const fail=(ok,message,status=400)=>{if(!ok)throw Object.assign(new Error(message),{status,code:'MFA_REQUIRED'});};
export function createMfa(db,key){
 db.exec(`CREATE TABLE IF NOT EXISTS platform_mfa(user_id TEXT PRIMARY KEY,secret TEXT,pending TEXT,pending_until INTEGER,last_counter INTEGER DEFAULT -1,recovery TEXT NOT NULL DEFAULT '[]');`);
 const row=id=>db.prepare('SELECT * FROM platform_mfa WHERE user_id=?').get(id);
 function verify(id,code,{pending=false,now=Date.now()}={}){const r=row(id);const secret=decryptPin(pending?r?.pending||'':r?.secret||'',key);fail(secret&&(!pending||r.pending_until>now),'Configura el autenticador o solicita una clave nueva.',401);const text=String(code||'').replace(/\s/g,'');
  if(!pending&&/^[a-f0-9]{24}$/.test(text)){const codes=JSON.parse(r.recovery),hash=digest(text),index=codes.indexOf(hash);fail(index>=0,'Código de autenticación incorrecto o ya utilizado.',401);codes.splice(index,1);db.prepare('UPDATE platform_mfa SET recovery=? WHERE user_id=?').run(JSON.stringify(codes),id);return true;}
  fail(/^\d{6}$/.test(text),'Ingresa el código del autenticador o un código de recuperación.',401);let matched=-1;for(const offset of [-1,0,1]){const counter=Math.floor(now/30000)+offset;if(counter>=0&&timingSafeEqual(Buffer.from(text),Buffer.from(totp(secret,counter*30000))))matched=counter;}fail(matched>Number(r.last_counter),'Código incorrecto, vencido o ya utilizado. Espera el siguiente código.',401);db.prepare('UPDATE platform_mfa SET last_counter=? WHERE user_id=?').run(matched,id);return true;
 }
 function setup(user){fail(!row(user.id)?.secret,'El doble factor ya está activo.');const secret=base32(randomBytes(20));db.prepare(`INSERT INTO platform_mfa(user_id,pending,pending_until) VALUES(?,?,?) ON CONFLICT(user_id) DO UPDATE SET pending=excluded.pending,pending_until=excluded.pending_until,last_counter=-1`).run(user.id,encryptPin(secret,key),Date.now()+600000);return {secret,uri:`otpauth://totp/${encodeURIComponent('AUnToque:'+user.email)}?secret=${secret}&issuer=AUnToque&algorithm=SHA1&digits=6&period=30`};}
 function confirm(id,code){verify(id,code,{pending:true});const codes=Array.from({length:8},()=>randomBytes(12).toString('hex'));db.prepare('UPDATE platform_mfa SET secret=pending,pending=NULL,pending_until=NULL,recovery=? WHERE user_id=?').run(JSON.stringify(codes.map(digest)),id);return {recoveryCodes:codes};}
 return {enabled:id=>!!row(id)?.secret,status:id=>({enabled:!!row(id)?.secret,recoveryRemaining:JSON.parse(row(id)?.recovery||'[]').length}),verify,setup,confirm,disable:id=>db.prepare('DELETE FROM platform_mfa WHERE user_id=?').run(id)};
}
