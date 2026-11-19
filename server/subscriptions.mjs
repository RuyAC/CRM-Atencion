import {planFor,PLANS} from '../shared/plans.mjs';
import {TRIAL_DAYS} from '../shared/trial.mjs';
import {randomUUID} from 'node:crypto';
const error=(message,status=403)=>{throw Object.assign(new Error(message),{status,code:'PLAN_LIMIT'});};
export function subscriptionStore(db,{production=false}={}){
 db.exec(`CREATE TABLE IF NOT EXISTS subscription_events(id TEXT PRIMARY KEY,created_at TEXT NOT NULL,actor_id TEXT NOT NULL,data TEXT NOT NULL);`);
 const read=()=>{const row=db.prepare("SELECT value FROM meta WHERE key='subscription_v1'").get();return row?JSON.parse(row.value):{plan:'business',interval:'monthly',status:production?'pending':'legacy',endsAt:null,graceDays:3};};
 const write=value=>db.prepare("INSERT INTO meta(key,value) VALUES('subscription_v1',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(value));
 function snapshot(){const s=read(),plan={...planFor(s.plan)};let effectiveStatus=s.status;
  if(s.status==='active'&&s.endsAt&&Date.now()>Date.parse(s.endsAt))effectiveStatus=Date.now()<=Date.parse(s.endsAt)+s.graceDays*86400000?'grace':'expired';
  if(s.status==='trial'&&(!s.endsAt||Date.now()>Date.parse(s.endsAt)))effectiveStatus='expired';
  return {...s,effectiveStatus,planDetails:plan,amount:plan[s.interval==='annual'?'annual':'monthly'],currency:'BOB',serviceEnabled:['active','grace','legacy','trial'].includes(effectiveStatus)};
 }
 function initialize(plan,interval,{legacy=false,trial=false}={}){if(!PLANS[plan]||!['monthly','annual'].includes(interval))error('El plan o período no es válido.',400);write({plan,interval,status:trial?'trial':legacy?'legacy':'pending',createdAt:new Date().toISOString(),endsAt:trial?new Date(Date.now()+TRIAL_DAYS*86400000).toISOString():null,graceDays:trial?0:3});return snapshot();}
 function update(payload,actor,all){
  const old=read(),plan=payload.plan??old.plan,interval=payload.interval??old.interval,status=payload.status??old.status,graceDays=payload.graceDays??old.graceDays;
  if(!PLANS[plan]||!['monthly','annual'].includes(interval)||!['pending','active','suspended'].includes(status)||!Number.isInteger(graceDays)||graceDays<0||graceDays>14)error('Datos de suscripción inválidos.',400);
  const p=planFor(plan),endsAt=payload.endsAt===undefined?old.endsAt:payload.endsAt;
  if(endsAt!==null&&(!Number.isFinite(Date.parse(endsAt))||typeof endsAt!=='string'))error('Fecha de vencimiento inválida.',400);
  if(status==='active'&&(!endsAt||Date.parse(endsAt)<=Date.now()))error('Para activar, indica un vencimiento futuro.',400);
  if(all('tables').filter(x=>x.active!==false).length>p.tables)error('Desactiva mesas antes de reducir el plan.',409);
  if(p.staff&&all('staff').filter(x=>x.active!==false).length>p.staff)error('Reduce los usuarios activos antes de cambiar de plan.',409);
  if(!p.videos&&all('products').some(x=>x.videoUrl))error('Retira los videos antes de cambiar a Esencial.',409);
  if(!p.roles&&all('staff').some(x=>x.active!==false&&x.role==='MANAGER'))error('Cambia los perfiles de gerente antes de reducir el plan.',409);
  if(p.customButtons&&all('buttons').filter(x=>x.active!==false&&!['btn-call','btn-menu','btn-bill'].includes(x.id)).length>p.customButtons)error('Reduce los botones adicionales antes de cambiar de plan.',409);
  if(!p.kitchen&&all('tables').some(x=>x.sector))error('Retira los sectores antes de cambiar de plan.',409);
  const value={...old,plan,interval,status,endsAt,graceDays,updatedAt:new Date().toISOString()};
  db.exec('BEGIN IMMEDIATE');try{write(value);db.prepare('INSERT INTO subscription_events VALUES(?,?,?,?)').run(randomUUID(),value.updatedAt,actor,JSON.stringify({before:old,after:value,paymentReference:String(payload.paymentReference||'').slice(0,200)}));db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  return snapshot();
 }
 function service(){if(!snapshot().serviceEnabled)error('El servicio está pendiente de activación, vencido o suspendido. Contacta a Atencion.',402);}
 function feature(key){if(!snapshot().planDetails[key])error('Esta función no está incluida en tu plan.');}
 function entity(kind,item,all){const p=snapshot().planDetails;
  const limit=kind==='tables'?p.tables:kind==='staff'?p.staff:kind==='buttons'?p.customButtons:null;
  const eligible=x=>x.active!==false&&(kind!=='buttons'||!['btn-call','btn-menu','btn-bill'].includes(x.id));
  if(limit&&eligible(item)&&all(kind).filter(x=>x.id!==item.id&&eligible(x)).length>=limit)error(`Tu plan permite hasta ${limit} ${kind==='tables'?'mesas activas':kind==='staff'?'usuarios activos':'botones adicionales'}.`);
  if(kind==='products'&&item.videoUrl)feature('videos');
  if(kind==='staff'&&item.role==='MANAGER')feature('roles');
  if(kind==='orders')feature('kitchen');
 }
 return {read,snapshot,initialize,update,service,feature,entity};
}
