import {createRequire} from 'node:module';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';
const {chromium}=createRequire(import.meta.url)('C:/Users/ruyal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir=mkdtempSync(path.join(os.tmpdir(),'atencion-free-demo-')),out=path.resolve('.impeccable/review/free-demo');mkdirSync(out,{recursive:true});
let app,browser;const errors=[];
try{
 app=createApp({dbPath:path.join(dir,'platform.sqlite'),mediaDir:path.join(dir,'uploads'),port:0,host:'127.0.0.1'});const address=await app.listen(),base=`http://127.0.0.1:${address.port}`;
 browser=await chromium.launch({headless:true,channel:'msedge'});const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(base+'/');const cta=page.getByRole('link',{name:'Demo gratis',exact:true});assert.equal(await cta.getAttribute('href'),'/register?demo=1');await cta.click();
 await page.getByRole('heading',{name:'Crea tu demo gratis',exact:true}).waitFor();
 await page.getByLabel('Plan',{exact:true}).selectOption('pro');await page.getByLabel('Período',{exact:true}).selectOption('annual');
 for(const [label,value] of [['Nombre del restaurante','Demo del Cliente'],['Nombre del propietario','Propietaria Demo'],['Correo electrónico','free-demo@example.test'],['Contraseña','DemoSegura2026!'],['Confirmar contraseña','DemoSegura2026!']])await page.getByLabel(label,{exact:true}).fill(value);
 await page.getByRole('button',{name:'Crear mi demo gratis',exact:true}).click();await page.getByText('1 mesa con su propio QR',{exact:true}).waitFor();
 await page.getByRole('link',{name:'Ir al panel de mi restaurante',exact:false}).click();await page.getByText(/Demo gratis/).first().waitFor();
 const state=await (await context.request.get(base+'/api/state')).json();assert.equal(state.tables.length,1);assert.equal(state.subscription.plan,'pro');assert.equal(state.subscription.interval,'annual');assert.equal(state.subscription.effectiveStatus,'trial');
 assert.equal(state.subscription.planDetails.tables,50);const extra=await context.request.post(base+'/api/action',{data:{action:'entity.save',payload:{entity:'tables',item:{number:2,name:'Mesa 2',active:true}}}});assert.equal(extra.status(),200);
 const call=await context.request.post(base+'/api/action',{data:{action:'request.create',payload:{token:state.tables[0].token,type:'CALL'}}});assert.equal(call.status(),200);
 await page.goto(base+'/dashboard/billing');await page.getByText(/Demo gratis con todas las funciones y límites/).waitFor();await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(out,'billing-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);writeFileSync(path.join(out,'results.json'),JSON.stringify({passed:true,checks:['CTA hacia registro','Elección Pro anual','Demo de siete días con una mesa inicial y límites del plan','Llamada real aceptada por el servidor','Aviso de vencimiento y móvil sin desbordamiento'],errors},null,2));console.log('Demo gratis verificada: registro, plan, una mesa, llamada real y móvil; sin errores JavaScript.');
}finally{await browser?.close();await app?.close();assert.equal(path.dirname(dir),os.tmpdir());assert(path.basename(dir).startsWith('atencion-free-demo-'));rmSync(dir,{recursive:true,force:true});}
