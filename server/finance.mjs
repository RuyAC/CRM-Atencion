import {randomUUID} from 'node:crypto';
const fail=(ok,message,status=400)=>{if(!ok)throw Object.assign(new Error(message),{status});};
export function createFinance(db){
 db.exec(`CREATE TABLE IF NOT EXISTS payments(id TEXT PRIMARY KEY,operation_id TEXT NOT NULL UNIQUE,restaurant_id TEXT NOT NULL,created_at TEXT NOT NULL,actor_id TEXT NOT NULL,data TEXT NOT NULL,voided_at TEXT,void_actor TEXT,void_reason TEXT);`);
 function record(p,actor,restaurantId){
  fail(/^[a-zA-Z0-9_-]{12,100}$/.test(p.operationId||''),'Identificador de operación inválido.');
  fail(Number.isSafeInteger(p.amountCents)&&p.amountCents>0&&p.amountCents<=100000000,'Importe inválido en centavos.');
  fail(['transfer','qr','cash','other'].includes(p.method),'Selecciona el medio de pago.');
  fail(typeof p.reference==='string'&&p.reference.trim().length>=2&&p.reference.length<=200,'Ingresa una referencia de pago.');
  fail(['essential','pro','business'].includes(p.plan)&&['monthly','annual'].includes(p.interval),'Plan o período inválido.');
  fail(typeof p.periodStart==='string'&&typeof p.periodEnd==='string'&&Number.isFinite(Date.parse(p.periodStart))&&Date.parse(p.periodEnd)>Date.parse(p.periodStart),'Indica un período válido.');
  const data={amountCents:p.amountCents,currency:'BOB',method:p.method,reference:p.reference.trim(),plan:p.plan,interval:p.interval,periodStart:new Date(p.periodStart).toISOString(),periodEnd:new Date(p.periodEnd).toISOString()};
  const existing=db.prepare('SELECT * FROM payments WHERE operation_id=?').get(p.operationId);if(existing){fail(existing.restaurant_id===restaurantId&&existing.data===JSON.stringify(data),'La operación ya fue usada con otros datos.',409);return project(existing);}
  const id=randomUUID();db.prepare('INSERT INTO payments(id,operation_id,restaurant_id,created_at,actor_id,data) VALUES(?,?,?,?,?,?)').run(id,p.operationId,restaurantId,new Date().toISOString(),actor,JSON.stringify(data));return project(db.prepare('SELECT * FROM payments WHERE id=?').get(id));
 }
 function project(row){return {id:row.id,restaurantId:row.restaurant_id,createdAt:row.created_at,...JSON.parse(row.data),voidedAt:row.voided_at,voidReason:row.void_reason};}
 function list(restaurantId){return (restaurantId?db.prepare('SELECT * FROM payments WHERE restaurant_id=? ORDER BY created_at DESC LIMIT 1000').all(restaurantId):db.prepare('SELECT * FROM payments ORDER BY created_at DESC LIMIT 1000').all()).map(project);}
 function voidPayment(p,actor){fail(typeof p.reason==='string'&&p.reason.trim().length>=5&&p.reason.length<=500,'Explica el motivo de la anulación (5 a 500 caracteres).');const r=db.prepare('SELECT * FROM payments WHERE id=?').get(p.id);fail(r,'Pago no encontrado.',404);fail(!r.voided_at,'Este pago ya fue anulado.',409);db.prepare('UPDATE payments SET voided_at=?,void_actor=?,void_reason=? WHERE id=?').run(new Date().toISOString(),actor,p.reason.trim(),p.id);return {voided:true};}
 function* iterate(restaurantId){const rows=restaurantId?db.prepare('SELECT * FROM payments WHERE restaurant_id=? ORDER BY created_at DESC').iterate(restaurantId):db.prepare('SELECT * FROM payments ORDER BY created_at DESC').iterate();for(const row of rows)yield project(row);}
 return {record,list,voidPayment,iterate};
}
