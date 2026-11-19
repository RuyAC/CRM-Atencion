import net from 'node:net';
import {parseLocalCidr} from './network.mjs';
const reject = message => { throw Object.assign(new Error(`Respaldo inválido: ${message}`), {status:400,code:'INVALID_BACKUP'}); };
const check = (condition,message) => {if(!condition)reject(message);};
const text = (value,max=3000) => typeof value==='string' && value.length<=max;
const money = value => Number.isSafeInteger(value) && value>=0 && value<=100000000;
const date = value => typeof value==='string' && Number.isFinite(Date.parse(value));
export function validateRestore(content, safeUrl) {
  const e=content.entities, sets={};
  for(const [kind,items] of Object.entries(e)){
    check(Array.isArray(items)&&items.length<=100000,`cantidad de ${kind}`);
    sets[kind]=new Set();
    for(const item of items){check(item&&text(item.id,100)&&item.id.length>0&&!sets[kind].has(item.id),`identificador de ${kind}`);sets[kind].add(item.id);for(const flag of ['active','available','featured','requirePresence'])check(item[flag]===undefined||typeof item[flag]==='boolean',`indicador ${flag}`);}
  }
  const numbers=new Set(),tokens=new Set();
  for(const t of e.tables){check(Number.isInteger(t.number)&&t.number>=1&&t.number<=9999&&!numbers.has(t.number),'número de mesa');numbers.add(t.number);check(text(t.name,100)&&t.name.trim(),'nombre de mesa');check(text(t.token,128)&&t.token.length>0&&!tokens.has(t.token),'QR duplicado o inválido');tokens.add(t.token);}
  for(const c of e.categories)check(text(c.name,100)&&c.name.trim(),'nombre de categoría');
  for(const p of e.products){check(text(p.name,140)&&p.name.trim()&&text(p.description??'',3000),'producto');check(sets.categories.has(p.categoryId),'categoría inexistente');check(money(p.price),'precio');check(p.promoPrice==null||money(p.promoPrice)&&p.promoPrice<p.price,'promoción');safeUrl(p.imageUrl);safeUrl(p.videoUrl);check(Array.isArray(p.tags)&&p.tags.length<=20&&p.tags.every(t=>text(t,40)),'etiquetas');}
  for(const b of e.buttons){check(['CALL','BILL_REQUEST','MENU','LINK'].includes(b.type)&&text(b.label,80)&&b.label.trim(),'botón');safeUrl(b.url);check(b.type!=='LINK'||b.url,'enlace vacío');}
  for(const member of e.staff)check(text(member.name,100)&&member.name.trim()&&text(member.email,160)&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(member.email),'miembro del equipo');
  for(const network of e.networks){check(text(network.name,100)&&network.name.trim()&&typeof network.ip==='string'&&net.isIP(network.ip),'red autorizada');check(!network.localCidr||parseLocalCidr(network.localCidr)?.cidr===network.localCidr,'subred autorizada');}
  for(const credential of content.credentials){check(/^scrypt:[a-f0-9]{32}:[a-f0-9]{64}$/.test(credential.password_hash)&&/^scrypt:[a-f0-9]{32}:[a-f0-9]{64}$/.test(credential.pin_hash),'formato de credenciales');}
  for(const order of e.orders){check(sets.tables.has(order.tableId),'mesa del pedido');check(['pending','preparing','ready','delivered'].includes(order.status)&&date(order.createdAt),'estado del pedido');check(Array.isArray(order.items)&&order.items.length>0&&order.items.length<=100&&order.items.every(i=>text(i.name,140)&&Number.isInteger(i.quantity)&&i.quantity>=1&&i.quantity<=99),'contenido del pedido');}
  const requestIds=new Set(),activeTables=new Set();
  for(const r of content.requests){check(text(r.id,100)&&!requestIds.has(r.id),'identificador de llamada');requestIds.add(r.id);check(['CALL','BILL_REQUEST'].includes(r.type)&&['pending','accepted','completed','cancelled'].includes(r.status)&&date(r.createdAt)&&Array.isArray(r.events),'llamada');if(['pending','accepted'].includes(r.status)){check(sets.tables.has(r.tableId)&&!activeTables.has(r.tableId),'llamada activa sin mesa o duplicada');activeTables.add(r.tableId);}for(const key of ['acceptedAt','completedAt','cancelledAt'])check(r[key]==null||date(r[key]),'fecha de llamada');}
}
