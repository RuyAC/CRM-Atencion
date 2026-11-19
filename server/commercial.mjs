import {randomUUID} from 'node:crypto';
const fail=(ok,message,status=400)=>{if(!ok)throw Object.assign(new Error(message),{status});};
const email=value=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value||'');
export function commercialConfig(env=process.env){
 const clean=(key,max=500)=>String(env[key]||'').trim().slice(0,max);
 const config={provider:clean('BUSINESS_NAME',140),address:clean('BUSINESS_ADDRESS'),jurisdiction:clean('BUSINESS_JURISDICTION',200),salesEmail:clean('SALES_EMAIL',160),supportEmail:clean('SUPPORT_EMAIL',160),whatsapp:clean('BUSINESS_WHATSAPP',20).replace(/\D/g,''),paymentInstructions:clean('PAYMENT_INSTRUCTIONS',2000),cancellationPolicy:clean('CANCELLATION_POLICY',2000),privacyRetention:clean('PRIVACY_RETENTION',2000),supportHours:clean('SUPPORT_HOURS',300),legalVersion:clean('LEGAL_VERSION',50)};
 if(!email(config.salesEmail))config.salesEmail='';if(!email(config.supportEmail))config.supportEmail='';if(!/^\d{8,15}$/.test(config.whatsapp))config.whatsapp='';
 config.legalPublished=env.LEGAL_PUBLISHED==='true'&&['provider','address','jurisdiction','supportEmail','cancellationPolicy','privacyRetention','legalVersion'].every(k=>config[k]&&!/REEMPLAZAR|example|tu-dominio/i.test(config[k]));
 return config;
}
export function createCommercial(db,{env=process.env}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS commercial_leads(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,name TEXT NOT NULL,email TEXT NOT NULL,restaurant TEXT NOT NULL,kind TEXT NOT NULL,message TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'new'); CREATE TABLE IF NOT EXISTS commercial_events(id TEXT PRIMARY KEY,lead_id TEXT NOT NULL,actor TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL); CREATE TABLE IF NOT EXISTS legal_consents(user_id TEXT PRIMARY KEY,version TEXT NOT NULL,created_at TEXT NOT NULL);`);
 const limits=new Map();
 const config=()=>commercialConfig(env);
 function create(payload,ip){
  const now=Date.now();for(const [key,row]of limits)if(now-row.at>3600000)limits.delete(key);const row=limits.get(ip)||{count:0,at:now};row.count++;limits.set(ip,row);fail(row.count<=8,'Demasiadas solicitudes. Inténtalo dentro de una hora.',429);
  fail(!payload.website,'Solicitud no válida.');
  const text=(key,max)=>{fail(typeof payload[key]==='string'&&payload[key].trim().length<=max,`Revisa el campo ${key}.`);return payload[key].trim();};
  const name=text('name',120),address=text('email',160).toLowerCase(),restaurant=text('restaurant',140),message=text('message',2000),kind=payload.kind||'demo';
  fail(name.length>=2&&restaurant.length>=2&&email(address),'Completa nombre, restaurante y correo válido.');fail(['demo','activation','renewal','upgrade','support'].includes(kind),'Tipo de solicitud no válido.');fail(payload.consent===true,'Autoriza el uso de tus datos para atender esta solicitud.');
  const recent=db.prepare('SELECT id FROM commercial_leads WHERE email=? AND kind=? AND created_at>?').get(address,kind,new Date(now-60000).toISOString());
  if(!recent)db.prepare('INSERT INTO commercial_leads(id,created_at,name,email,restaurant,kind,message) VALUES(?,?,?,?,?,?,?)').run(randomUUID(),new Date(now).toISOString(),name,address,restaurant,kind,message);
  return {message:'Solicitud guardada. El equipo podrá revisarla en su panel comercial. No se ha realizado ningún cobro.'};
 }
 function update(payload,actor){fail(['new','contacted','closed'].includes(payload.status),'Estado no válido.');fail(db.prepare('SELECT id FROM commercial_leads WHERE id=?').get(payload.id),'Solicitud no encontrada.',404);db.exec('BEGIN IMMEDIATE');try{db.prepare('UPDATE commercial_leads SET status=? WHERE id=?').run(payload.status,payload.id);db.prepare('INSERT INTO commercial_events VALUES(?,?,?,?,?)').run(randomUUID(),payload.id,actor,payload.status,new Date().toISOString());db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return {saved:true};}
 return {config,create,update,list:()=>db.prepare('SELECT * FROM commercial_leads ORDER BY created_at DESC LIMIT 300').all(),consent:(user,version)=>db.prepare('INSERT OR REPLACE INTO legal_consents VALUES(?,?,?)').run(user,version,new Date().toISOString())};
}
