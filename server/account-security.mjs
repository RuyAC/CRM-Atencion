import {randomBytes} from 'node:crypto';
import {digest,hashSecret} from './security.mjs';
import {clientIp} from './http-policy.mjs';
import {credentials as demoCredentials} from './seed.mjs';
const fail=(ok,message,status=400)=>{if(!ok)throw Object.assign(new Error(message),{status,code:'ACCOUNT_SECURITY'});};
export function createAccountSecurity({db,entries,publicOrigin,production,sendMail}){
 db.exec(`CREATE TABLE IF NOT EXISTS account_tokens(hash TEXT PRIMARY KEY,entry_id TEXT NOT NULL,user_id TEXT NOT NULL,scope TEXT NOT NULL,kind TEXT NOT NULL,email TEXT NOT NULL,credential_digest TEXT NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS verified_emails(entry_id TEXT NOT NULL,user_id TEXT NOT NULL,email TEXT NOT NULL,PRIMARY KEY(entry_id,user_id));`);
 const limits=new Map();
 const identity=(entry,userId,scope)=>entry.app.db.prepare(`SELECT * FROM ${scope==='platform'?'platform_admins':'credentials'} WHERE id=?`).get(userId);
 const verified=(entry,user)=>!!db.prepare('SELECT 1 FROM verified_emails WHERE entry_id=? AND user_id=? AND email=?').get(entry.id,user.id,user.email);
 function throttle(request,email){const now=Date.now();for(const [key,row]of limits)if(now-row.at>3600000)limits.delete(key);for(const key of [`ip:${clientIp(request)}`,`email:${email}`]){const row=limits.get(key)||{at:now,count:0};row.count++;limits.set(key,row);fail(row.count<=(key.startsWith('ip:')?30:5),'Demasiados intentos. Inténtalo más tarde.',429);}}
 async function deliver(to,subject,url){
  if(sendMail)return sendMail({to,subject,url});
  const key=process.env.RESEND_API_KEY,from=process.env.MAIL_FROM;
  fail(key&&from,'El servicio de correo no está configurado. Contacta a soporte.',503);
  const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json'},body:JSON.stringify({from,to:[to],subject,text:`${subject}\n\nAbre este enlace de AUnToque:\n${url}\n\nSi no lo solicitaste, ignora este mensaje. El enlace tiene vencimiento y solo se puede usar una vez.`})});
  fail(response.ok,'No se pudo enviar el correo. Inténtalo más tarde.',503);
 }
 async function issue(entry,userId,scope,kind){
  const user=identity(entry,userId,scope);fail(user,'Acceso no disponible.',404);
  const raw=randomBytes(32).toString('base64url'),hash=digest(raw),expires=Date.now()+(kind==='reset'?30*60000:24*3600000);
  db.prepare('DELETE FROM account_tokens WHERE expires<? OR (entry_id=? AND user_id=? AND kind=?)').run(Date.now(),entry.id,userId,kind);
  db.prepare('INSERT INTO account_tokens VALUES(?,?,?,?,?,?,?,?)').run(hash,entry.id,userId,scope,kind,user.email,digest(user.password_hash),expires);
  try{await deliver(user.email,kind==='reset'?'AUnToque: restablece tu contraseña':'AUnToque: verifica tu correo',`${publicOrigin||'http://localhost:3001'}/${kind==='reset'?'reset-password':'verify-email'}#token=${raw}`);}catch(e){db.prepare('DELETE FROM account_tokens WHERE hash=?').run(hash);throw e;}
 }
 async function action(name,payload,request,session){
  if(name==='auth.forgot'){
   const email=String(payload.email||'').trim().toLowerCase();throttle(request,email);
   // Both known and unknown addresses receive the same HTTP response.
   const entry=entries.find(e=>e.app.db.prepare('SELECT id FROM credentials WHERE lower(email)=?').get(email)||e.app.db.prepare('SELECT id FROM platform_admins WHERE lower(email)=?').get(email));
   if(entry){const admin=entry.app.db.prepare('SELECT id FROM platform_admins WHERE lower(email)=? AND active=1').get(email);const user=admin||entry.app.db.prepare('SELECT id FROM credentials WHERE lower(email)=?').get(email);const member=admin||entry.app.all('staff').find(m=>m.id===user?.id&&m.active!==false);if(member)try{await issue(entry,user.id,admin?'platform':'password','reset');}catch{console.error(JSON.stringify({event:'mail_delivery_failed',kind:'reset',time:new Date().toISOString()}));}}
   return {message:'Si el correo corresponde a una cuenta activa, recibirás un enlace para restablecer la contraseña.'};
  }
  if(name==='auth.verification.send'){
   const v=session?.app.viewer(request);fail(v?.scope==='password'&&v.user,'Inicia sesión con tu contraseña.',401);throttle(request,v.user.email);await issue(session,v.user.id,'password','verify');return {message:'Revisa tu correo para verificar tu cuenta.'};
  }
  fail(['auth.reset','auth.verify'].includes(name),'Acción no válida.');
  const token=String(payload.token||'');throttle(request,digest(token));fail(/^[A-Za-z0-9_-]{43}$/.test(token),'El enlace no es válido o venció.');
  const record=db.prepare('SELECT * FROM account_tokens WHERE hash=?').get(digest(token));fail(record&&record.expires>Date.now()&&record.kind===(name==='auth.reset'?'reset':'verify'),'El enlace no es válido o venció.');
  const entry=entries.find(e=>e.id===record.entry_id),user=entry&&identity(entry,record.user_id,record.scope);fail(user&&user.email===record.email&&digest(user.password_hash)===record.credential_digest,'El enlace ya no es válido.');
  if(name==='auth.reset'){
   const password=payload.password;fail(typeof password==='string'&&password.length>=12&&password.length<=200&&password===password.trim()&&password===payload.confirmPassword,'Usa una contraseña de 12 a 200 caracteres y confirma que coincida.');
   fail(!production||!demoCredentials.some(c=>c.password===password),'Elige una contraseña distinta de las cuentas de demostración.');
   entry.app.db.prepare(`UPDATE ${record.scope==='platform'?'platform_admins':'credentials'} SET password_hash=? WHERE id=?`).run(hashSecret(password),user.id);
   entry.app.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
  }else db.prepare('INSERT INTO verified_emails VALUES(?,?,?) ON CONFLICT(entry_id,user_id) DO UPDATE SET email=excluded.email').run(entry.id,user.id,user.email);
  db.prepare('DELETE FROM account_tokens WHERE entry_id=? AND user_id=?').run(entry.id,user.id);entry.app.changed();return {message:name==='auth.reset'?'Contraseña actualizada. Inicia sesión nuevamente.':'Correo verificado.'};
 }
 return {action,verified,issue,mailConfigured:()=>!!sendMail||!!(process.env.RESEND_API_KEY&&process.env.MAIL_FROM)};
}
