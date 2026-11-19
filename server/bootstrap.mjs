import {randomBytes,randomInt} from 'node:crypto';
import {verifySecret} from './security.mjs';

export function installationBootstrap(value) {
  return value || {name:process.env.ATENCION_RESTAURANT_NAME,ownerPassword:process.env.ATENCION_OWNER_PASSWORD,adminPassword:process.env.ATENCION_ADMIN_PASSWORD,monitorPin:process.env.ATENCION_MONITOR_PIN};
}
export function productionSeed(defaultRestaurant,defaultEntities,defaults,bootstrap) {
  const samplePasswords=defaults.map(user=>user.password);
  if(!bootstrap.name?.trim()||bootstrap.name.length>140)throw new Error('La instalación inicial requiere ATENCION_RESTAURANT_NAME.');
  for(const password of [bootstrap.ownerPassword,bootstrap.adminPassword]){
    if(typeof password!=='string'||password.trim()!==password||password.length<16||password.length>200||samplePasswords.includes(password))throw new Error('Configura contraseñas iniciales únicas de 16 a 200 caracteres para propietario y administrador SaaS.');
  }
  if(bootstrap.ownerPassword===bootstrap.adminPassword)throw new Error('Las contraseñas iniciales del restaurante y SaaS deben ser distintas.');
  if(!/^\d{6,8}$/.test(bootstrap.monitorPin||''))throw new Error('Configura ATENCION_MONITOR_PIN con 6 a 8 números.');
  let ownerPin;do{ownerPin=String(randomInt(1000,10000));}while(defaults.some(user=>user.pin===ownerPin));
  const owner={...defaultEntities.staff.find(user=>user.role==='OWNER'),name:bootstrap.name.trim()};
  return {
    restaurant:{...defaultRestaurant,name:bootstrap.name.trim(),slug:`restaurante-${randomBytes(6).toString('hex')}`},
    entities:{...structuredClone(defaultEntities),staff:[owner],tables:[],categories:[],products:[],networks:[],orders:[]},
    credentials:[{id:owner.id,email:owner.email,password:bootstrap.ownerPassword,pin:ownerPin}],
  };
}
export function rejectDemoCredentials(db,defaults) {
  const samples=defaults.map(user=>user.password);
  const records=db.prepare('SELECT password_hash FROM credentials').all();
  if(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='platform_admins'").get())records.push(...db.prepare('SELECT password_hash FROM platform_admins').all());
  if(records.some(record=>samples.some(password=>verifySecret(password,record.password_hash))))throw new Error('No se puede iniciar producción con credenciales de demostración. Cambia los accesos del restaurante y del SaaS antes de desplegar.');
  const pins=db.prepare('SELECT pin_hash FROM credentials').all().map(row=>row.pin_hash);
  const general=db.prepare("SELECT value FROM meta WHERE key='tv_pin_hash'").get();
  if(general)pins.push(JSON.parse(general.value));
  if(pins.some(hash=>defaults.some(user=>verifySecret(user.pin,hash))))throw new Error('No se puede iniciar producción con PIN de demostración. Cambia los PIN del equipo y del monitor.');
}
