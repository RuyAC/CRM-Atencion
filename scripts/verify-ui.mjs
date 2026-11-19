import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ruyal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.APP_URL||'http://127.0.0.1:3001';
const out='.impeccable/review';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const errors=[],results=[];
function observe(page){page.on('pageerror',e=>errors.push(e.message));}
async function check(name,fn){await fn();results.push({name,result:'passed'});console.log('PASS '+name);}
const adminContext=await browser.newContext({viewport:{width:1440,height:1000}}),publicContext=await browser.newContext({viewport:{width:390,height:844}}),monitorContext=await browser.newContext({viewport:{width:1280,height:720}});
const admin=await adminContext.newPage(),client=await publicContext.newPage(),tv=await monitorContext.newPage();[admin,client,tv].forEach(observe);
try{
  await check('Inicio de sesión y panel administrativo',async()=>{await admin.goto(base+'/dashboard');await admin.getByLabel('Correo electrónico',{exact:true}).fill('ventas@matebar.com');await admin.getByLabel('Contraseña',{exact:true}).fill('Atencion2026!');await admin.getByRole('button',{name:'Entrar a mi cuenta'}).click();await admin.getByRole('heading',{name:'Panel principal',exact:true}).waitFor({timeout:15000});});
  const data=await admin.evaluate(async()=>await(await fetch('/api/state')).json());
  const state=data.state||data;const table=state.tables.find(t=>t.number===5)||state.tables[0];const route=`/r/${state.restaurant.slug}/t/${table.token}`;
  for(const request of state.requests.filter(r=>r.tableId===table.id&&['pending','accepted'].includes(r.status))){await admin.evaluate(async({request,token})=>{await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:request.status==='pending'?'request.cancel':'request.complete',payload:{id:request.id,token}})});},{request,token:table.token});}
  await admin.screenshot({path:out+'/desktop.png',fullPage:true});
  await check('Cliente móvil abre la mesa correcta',async()=>{await client.goto(base+route);await client.getByRole('heading',{name:state.restaurant.name,exact:true}).waitFor();assert(await client.getByText(table.name,{exact:false}).count()>0);});
  await client.screenshot({path:out+'/mobile.png',fullPage:true});
  await check('Monitor protegido con PIN',async()=>{await tv.goto(base+`/tv/${state.restaurant.slug}`);await tv.getByRole('button',{name:/Modo general.*TV/i}).click();for(const digit of '1234')await tv.getByRole('button',{name:digit,exact:true}).click();await tv.getByRole('button',{name:'Entrar al monitor'}).click();await tv.locator('.monitor-header h1').waitFor();});
  await check('Llamada aparece automáticamente en panel y monitor',async()=>{await client.getByRole('button',{name:/Llamar al garzón|Llamar al mesero/}).click();await admin.locator('.a-request').filter({hasText:table.name}).waitFor({timeout:5000});await tv.locator('.monitor-queue-card').filter({hasText:table.name}).waitFor({timeout:5000});});
  await admin.screenshot({path:out+'/dashboard-call.png',fullPage:true});await tv.screenshot({path:out+'/monitor.png',fullPage:true});
  await check('Atender y finalizar actualiza al cliente',async()=>{await admin.getByRole('button',{name:/Atender|Aceptar/}).first().click();await client.getByText(/en camino/i).first().waitFor();await admin.getByRole('button',{name:/Finalizar/}).first().click();await client.getByText(/realizad|completad/i).first().waitFor();});
  await check('Menú con búsqueda y ficha multimedia',async()=>{await client.getByRole('button',{name:/Ver menú/}).click();const search=client.getByRole('searchbox');await search.fill('Burger');const product=client.getByRole('button',{name:/Burger de la casa/}).first();await product.waitFor();await product.click();await client.getByRole('dialog').waitFor();await client.screenshot({path:out+'/menu-story.png',fullPage:true});await client.keyboard.press('Escape');await search.fill('no-hay-este-plato');await client.getByText(/No se encontr|Ningún/i).first().waitFor();});
  await check('Todas las secciones del administrador cargan',async()=>{for(const name of ['tables','menu','networks','buttons','staff','reports','billing','settings','kitchen']){await admin.goto(base+'/dashboard/'+name);await admin.getByRole('heading',{level:1}).first().waitFor();await admin.screenshot({path:out+`/admin-${name}.png`,fullPage:true});assert(!await admin.getByText('No se pudo abrir esta pantalla',{exact:true}).count());}});
  await check('Responsive administrativo sin desborde horizontal',async()=>{await admin.setViewportSize({width:390,height:844});await admin.goto(base+'/dashboard');await admin.getByRole('heading',{level:1}).first().waitFor();assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));await admin.screenshot({path:out+'/admin-mobile.png',fullPage:true});});
  await check('Cliente sin desborde horizontal',async()=>{await client.goto(base+route);await client.getByRole('heading',{name:state.restaurant.name,exact:true}).waitFor();assert(await client.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));});
  assert.deepEqual(errors,[],'Errores de React/navegador');
  await writeFile(out+'/ui-results.json',JSON.stringify({results,errors},null,2));
}catch(error){await writeFile(out+'/ui-results.json',JSON.stringify({results,errors,failure:error.message},null,2));await admin.screenshot({path:out+'/failure-admin.png',fullPage:true});await client.screenshot({path:out+'/failure-client.png',fullPage:true});throw error;}finally{await browser.close();}
