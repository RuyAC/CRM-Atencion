import {createApp} from '../server/index.mjs';
import {credentials} from '../server/seed.mjs';
import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {createRequire} from 'node:module';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=path.resolve('.impeccable/review/qa-fixes');await mkdir(output,{recursive:true});
const directory=await mkdtemp(path.join(os.tmpdir(),'atencion-qa-fixed-ui-'));
const app=createApp({dbPath:':memory:',mediaDir:path.join(directory,'uploads'),port:0,host:'127.0.0.1'});
const address=await app.listen(),base=`http://127.0.0.1:${address.port}`,results=[],errors=[];let browser;
const record=name=>{results.push({name,result:'passed'});console.log('PASS '+name);};
try{
 browser=await chromium.launch({headless:true,channel:'msedge'});
 const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce',serviceWorkers:'block'});
 await context.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort());
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
 const action=async(action,payload)=>{const r=await context.request.post(base+'/api/action',{data:{action,payload}});assert.equal(r.status(),200,await r.text());return r.json();};
 await action('auth.login',{email:credentials[0].email,password:credentials[0].password});
 await page.goto(base+'/dashboard/settings');await page.locator('#identidad').waitFor();
 const field=page.locator('#identidad input[type="text"], #identidad input:not([type])').first();
 await field.fill('QA CONCURRENT');
 await action('settings.save',{settings:{paused:true}});
 await page.getByRole('button',{name:'Guardar cambios',exact:true}).first().click();
 await page.getByRole('button',{name:'Cargar configuración actual'}).waitFor();
 let state=await(await context.request.get(base+'/api/state')).json();assert.equal(state.settings.paused,true);assert.notEqual(state.restaurant.name,'QA CONCURRENT');
 record('Edición obsoleta muestra conflicto y conserva la pausa concurrente');
 page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Cargar configuración actual'}).click();
 await page.getByRole('button',{name:'Cargar configuración actual'}).waitFor({state:'hidden'});
 await field.fill('QA UPDATED');await page.getByRole('button',{name:'Guardar cambios',exact:true}).first().click();
 await page.getByText('Configuración guardada.',{exact:true}).first().waitFor();
 state=await(await context.request.get(base+'/api/state')).json();assert.equal(state.restaurant.name,'QA UPDATED');assert.equal(state.settings.paused,true);
 record('Recargar y editar de nuevo guarda sin revertir cambios de otra sesión');
 await field.fill('QA UNSAVED');
 const menu=page.locator('.a-sidebar a[href="/dashboard/menu"]');
 let warned=false;page.once('dialog',async dialog=>{warned=true;assert.match(dialog.message(),/sin guardar/);await dialog.dismiss();});await menu.click();assert(warned);assert(page.url().includes('/settings'));assert.equal(await field.inputValue(),'QA UNSAVED');
 record('Cancelar salida conserva formulario y cambios sin guardar');
 let unload=false;page.once('dialog',async dialog=>{unload=dialog.type()==='beforeunload';await dialog.dismiss();});await page.reload({timeout:5000}).catch(()=>{});assert(unload);
 record('Recarga advierte sobre cambios sin guardar');
 const accept=dialog=>dialog.accept();page.on('dialog',accept);await menu.click();await page.getByRole('heading',{name:'Menú digital',exact:true}).waitFor();page.off('dialog',accept);
 state=await(await context.request.get(base+'/api/state')).json();assert.equal(state.restaurant.name,'QA UPDATED');record('Descartar permite salir sin guardar el borrador');
 await action('settings.save',{settings:{paused:false}});
 const product=state.products[0];await action('entity.save',{entity:'products',item:{...product,promoPrice:0}});
 const customer=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});const client=await customer.newPage();client.on('pageerror',error=>errors.push(error.message));
 await client.goto(base+`/r/${state.restaurant.slug}/t/${state.tables[0].token}?menu=1`);
 const card=client.getByRole('button',{name:`Ver ${product.name}`,exact:true});await card.waitFor();assert.match(await card.locator('.client-price strong').innerText(),/0[,.]00/);
 await card.click();assert.match(await client.locator('.story-price strong').innerText(),/0[,.]00/);await client.keyboard.press('Escape');record('Promoción cero aparece tanto en tarjeta como en ficha del cliente');
 await client.screenshot({path:path.join(output,'zero-promotion.png'),fullPage:true});
 for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:1000});for(const route of ['','tables','menu','networks','buttons','staff','reports','billing','settings','kitchen']){
   await page.goto(base+'/dashboard'+(route?'/'+route:''));await page.getByRole('heading',{level:1}).first().waitFor();assert(await page.evaluate(()=>Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)<=innerWidth+1),`${route} ${width}`);
 }}record('Las diez secciones cargan sin desborde en 320, 390, 768 y 1440 px');
 assert.deepEqual(errors,[]);record('Cero excepciones JavaScript en los flujos corregidos');
 await browser.close();browser=null;
 for(const script of ['verify-ui.mjs','verify-accessibility.mjs']){
   const result=await new Promise(resolve=>{let log='';const processChild=spawn(process.execPath,['scripts/'+script],{cwd:process.cwd(),env:{...process.env,APP_URL:base},stdio:['ignore','pipe','pipe'],windowsHide:true});processChild.stdout.on('data',c=>{log+=c;process.stdout.write(c);});processChild.stderr.on('data',c=>{log+=c;process.stderr.write(c);});processChild.on('error',error=>resolve({code:1,log:error.message}));processChild.on('close',code=>resolve({code,log}));});
   await writeFile(path.join(output,script+'.txt'),result.log);assert.equal(result.code,0,script+' falló');record(script+' completa aprobada');
 }
}catch(error){results.push({result:'failed',error:error.stack});process.exitCode=1;console.error(error);}
finally{await writeFile(path.join(output,'results.json'),JSON.stringify({results,errors},null,2));await browser?.close();await app.close();assert.equal(path.dirname(directory),os.tmpdir());assert(path.basename(directory).startsWith('atencion-qa-fixed-ui-'));await rm(directory,{recursive:true,force:true});}
