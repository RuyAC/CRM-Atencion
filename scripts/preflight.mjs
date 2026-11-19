import {existsSync,mkdirSync,accessSync,constants} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function checkEnvironment(env=process.env){
 const failures=[];const need=(condition,message)=>{if(!condition)failures.push(message);};
 need(Number(process.versions.node.split('.')[0])>=24,'Node.js 24 o superior');
 need(env.NODE_ENV==='production','NODE_ENV=production');
 let origin;try{origin=new URL(env.ATENCION_PUBLIC_ORIGIN);need(origin.protocol==='https:'&&origin.pathname==='/'&&!origin.search&&!origin.hash&&!origin.username&&!origin.password,'Origen HTTPS sin ruta ni credenciales');}catch{failures.push('ATENCION_PUBLIC_ORIGIN válido');}
 if(env.DOMAIN&&origin)need(env.DOMAIN===origin.host,'DOMAIN debe coincidir con ATENCION_PUBLIC_ORIGIN');
 const sample=v=>!v||/REEMPLAZAR|tu-dominio|example|local\.test/i.test(v);
 for(const key of ['ATENCION_OWNER_EMAIL','ATENCION_ADMIN_EMAIL'])need(!sample(env[key])&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(env[key]),`${key} real`);
 need(env.ATENCION_OWNER_EMAIL!==env.ATENCION_ADMIN_EMAIL,'Correos distintos para propietario y administración SaaS');
 const dbPath=env.DB_PATH||'';need(path.isAbsolute(dbPath),'DB_PATH absoluto y persistente');
 if(!dbPath||!existsSync(dbPath)){
  need(!!env.ATENCION_RESTAURANT_NAME,'ATENCION_RESTAURANT_NAME');
  for(const key of ['ATENCION_OWNER_PASSWORD','ATENCION_ADMIN_PASSWORD'])need(!sample(env[key])&&env[key].length>=16,`${key} único de al menos 16 caracteres`);
  need(env.ATENCION_OWNER_PASSWORD!==env.ATENCION_ADMIN_PASSWORD,'Contraseñas iniciales distintas');need(/^\d{6,8}$/.test(env.ATENCION_MONITOR_PIN||''),'PIN inicial de 6 a 8 cifras');
 }
 for(const key of ['MEDIA_DIR','BACKUP_DIR'])need(path.isAbsolute(env[key]||''),`${key} absoluto`);
 need(!sample(env.RESEND_API_KEY)&&!sample(env.MAIL_FROM),'Correo Resend configurado con dominio verificado');
 need(Number(env.BACKUP_INTERVAL_HOURS||24)>=1&&Number(env.BACKUP_INTERVAL_HOURS||24)<=168,'Intervalo de respaldos de 1 a 168 horas');
 need(Number.isInteger(Number(env.MAX_RESTAURANTS||500))&&Number(env.MAX_RESTAURANTS||500)>0,'MAX_RESTAURANTS entero positivo');
 if(origin)need(!sample(origin.hostname),'Dominio público definitivo');
 return failures;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const errors=checkEnvironment();if(errors.length){console.error('Configuración pendiente:\n'+errors.map(x=>`- ${x}`).join('\n'));process.exitCode=1;}else{for(const key of ['MEDIA_DIR','BACKUP_DIR']){mkdirSync(process.env[key],{recursive:true});accessSync(process.env[key],constants.W_OK);}console.log('Configuración de producción válida. Falta validar DNS, entrega de correo y respaldo externo con el proveedor.');}
}
