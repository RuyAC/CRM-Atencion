import {createRequire} from 'node:module';
import {mkdir, mkdtemp, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ruyal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(),out=path.join(root,'.impeccable/review/registration');
const temporary=await mkdtemp(path.join(os.tmpdir(),'atencion-registration-ui-'));
await mkdir(out,{recursive:true});
const results=[],errors=[],geometry=[];
let app,browser,base;
async function check(name,run){try{await run();results.push({name,result:'passed'});console.log('PASS '+name);}catch(error){results.push({name,result:'failed',error:error.message});console.error('FAIL '+name+': '+error.message);process.exitCode=1;throw error;}}
async function context(width=1440,height=1000){const ctx=await browser.newContext({viewport:{width,height},reducedMotion:'reduce',serviceWorkers:'block'});await ctx.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort('blockedbyclient'));const page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',err=>errors.push(err.message));return {ctx,page};}
async function fill(page,email,name='Restaurante UI'){for(const [label,value]of [['Nombre del restaurante',name],['Nombre del propietario','Propietario UI'],['Correo electrónico',email],['Contraseña','Registro2026!'],['Confirmar contraseña','Registro2026!']])await page.getByLabel(label,{exact:true}).fill(value);}
async function action(ctx,name,payload={}){const response=await ctx.request.post(base+'/api/action',{data:{action:name,payload}});return {status:response.status(),body:await response.json()};}
async function state(ctx,route='/api/state'){const response=await ctx.request.get(base+route);return {status:response.status(),body:await response.json()};}
async function shot(page,name){const measures=await page.evaluate(()=>({width:innerWidth,overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)>innerWidth+1}));assert.equal(measures.overflow,false);geometry.push({name,...measures});await page.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
try{
  app=createApp({dbPath:path.join(temporary,'primary.sqlite'),mediaDir:path.join(temporary,'uploads'),host:'127.0.0.1',port:0});const address=await app.listen();base=`http://127.0.0.1:${address.port}`;
  browser=await chromium.launch({headless:true,channel:'msedge'});const owner=await context(),platform=await context(),mate=await context(),customer=await context();
  await check('Login ofrece registro y la cuenta se crea con campos etiquetados y teclado',async()=>{
    await owner.page.goto(base+'/login');const link=owner.page.getByRole('link',{name:'Crear cuenta para mi restaurante',exact:true});await link.focus();await owner.page.keyboard.press('Enter');await owner.page.waitForURL(base+'/register');
    await owner.page.getByRole('heading',{name:'Crea la cuenta de tu restaurante',exact:true}).waitFor();
    for(const label of ['Nombre del restaurante','Nombre del propietario','Correo electrónico','Contraseña','Confirmar contraseña'])assert.equal(await owner.page.getByLabel(label,{exact:true}).inputValue(),'');
  });
  await check('Formulario y login funcionan sin desborde a 1440, 768, 390 y 320 px',async()=>{
    for(const [width,height]of [[1440,1000],[768,1000],[390,844],[320,740]]){await owner.page.setViewportSize({width,height});await owner.page.goto(base+'/register');await owner.page.getByRole('heading',{name:'Crea la cuenta de tu restaurante',exact:true}).waitFor();await shot(owner.page,`register-${width}`);await owner.page.goto(base+'/login');await owner.page.getByRole('link',{name:'Crear cuenta para mi restaurante',exact:true}).waitFor();await shot(owner.page,`login-${width}`);}
    await owner.page.setViewportSize({width:1440,height:1000});await owner.page.goto(base+'/register');
  });
  await check('Confirmación de contraseña y correo duplicado tienen errores anunciados y recuperables',async()=>{
    await fill(owner.page,'ventas@matebar.com');await owner.page.getByLabel('Confirmar contraseña',{exact:true}).fill('Incorrect2026!');await owner.page.getByRole('button',{name:'Crear cuenta de mi restaurante',exact:true}).click();await owner.page.getByRole('alert').getByText('Las contraseñas no coinciden. Revisa la confirmación.',{exact:true}).waitFor();
    await owner.page.getByLabel('Confirmar contraseña',{exact:true}).fill('Registro2026!');await owner.page.getByRole('button',{name:'Crear cuenta de mi restaurante',exact:true}).click();await owner.page.getByRole('alert').getByText('Este correo ya tiene una cuenta. Inicia sesión o usa otro correo.',{exact:true}).waitFor();
    assert.equal(await owner.page.getByLabel('Nombre del restaurante',{exact:true}).inputValue(),'Restaurante UI');
  });
  await check('Alta real abre la confirmación y el panel del nuevo restaurante con cinco mesas y menú vacío',async()=>{
    await owner.page.getByLabel('Correo electrónico',{exact:true}).fill('ui-owner@example.test');await owner.page.getByRole('button',{name:'Crear cuenta de mi restaurante',exact:true}).click();await owner.page.getByRole('heading',{name:'Tu restaurante ya tiene cuenta',exact:true}).waitFor();assert.match(await owner.page.locator('.a-register-pin').innerText(),/^\d{4}$/);await shot(owner.page,'registration-success-desktop');
    await owner.page.getByRole('link',{name:'Ir al panel de mi restaurante',exact:true}).click();await owner.page.getByRole('heading',{name:'Panel principal',exact:true}).waitFor();const snapshot=(await state(owner.ctx)).body;assert.equal(snapshot.restaurant.name,'Restaurante UI');assert.equal(snapshot.viewer.user.email,'ui-owner@example.test');assert.equal(snapshot.tables.length,5);assert.equal(snapshot.products.length,0);assert.equal(snapshot.viewer.saasAdmin,false);
    await owner.page.goto(base+'/dashboard/menu');await owner.page.getByRole('heading',{name:'Menú digital',exact:true}).waitFor();assert.equal(await owner.page.locator('.st-saas-link').count(),0);
  });
  await check('Una mesa nueva llama y solo el monitor y panel de su restaurante reciben la solicitud',async()=>{
    const snapshot=(await state(owner.ctx)).body;const table=snapshot.tables[0];await customer.page.goto(base+`/r/${snapshot.restaurant.slug}/t/${table.token}`);await customer.page.getByRole('button',{name:/Llamar al garzón/}).click();
    await owner.page.goto(base+'/dashboard');await owner.page.getByText('Mesa 01',{exact:true}).first().waitFor();assert.equal((await state(owner.ctx)).body.requests.length,1);
    const monitor=await context();await monitor.page.goto(base+`/tv/${snapshot.restaurant.slug}`);await monitor.page.getByText('Monitor de llamadas y salón',{exact:true}).waitFor();assert.equal((await state(monitor.ctx,`/api/state?restaurant=${snapshot.restaurant.slug}&monitor=1`)).body.viewer.monitorAuthorized,false);await monitor.ctx.close();
    await action(mate.ctx,'auth.login',{email:'ventas@matebar.com',password:'Chamaii2026!'});assert.equal((await state(mate.ctx)).body.requests.length,0);
  });
  await check('La cuenta creada aparece como cliente en las cuentas y restaurantes SaaS',async()=>{
    await action(platform.ctx,'auth.login',{email:'admin@local.test',password:'Chamaii2026!'});await platform.page.goto(base+'/saas/accounts');await platform.page.getByRole('heading',{name:'Cuentas de AUnToque',exact:true}).waitFor();await platform.page.locator('.saas-account-table').getByText('ui-owner@example.test',{exact:true}).waitFor();assert.equal((await state(platform.ctx,'/api/saas/state')).body.summary.restaurants,2);await shot(platform.page,'saas-registered-account');
    await platform.page.goto(base+'/saas/restaurants');await platform.page.locator('.saas-restaurant-table').getByText('Restaurante UI',{exact:true}).waitFor();assert.equal((await state(owner.ctx,'/api/saas/state')).status,403);
  });
  await check('Registro móvil, contraseña visible, confirmación y reingreso conservan el restaurante',async()=>{
    const mobile=await context(390,844);await mobile.page.goto(base+'/register');await fill(mobile.page,'mobile-owner@example.test','Restaurante Móvil');await mobile.page.getByRole('button',{name:'Mostrar contraseña',exact:true}).click();assert.equal(await mobile.page.getByLabel('Contraseña',{exact:true}).getAttribute('type'),'text');assert.equal(await mobile.page.getByRole('button',{name:'Ocultar contraseña',exact:true}).getAttribute('aria-pressed'),'true');
    await mobile.page.getByRole('button',{name:'Crear cuenta de mi restaurante',exact:true}).click();await mobile.page.getByRole('heading',{name:'Tu restaurante ya tiene cuenta',exact:true}).waitFor();await shot(mobile.page,'registration-success-mobile');
    await action(mobile.ctx,'auth.logout');await mobile.page.goto(base+'/login');await mobile.page.getByLabel('Correo electrónico',{exact:true}).fill('mobile-owner@example.test');await mobile.page.getByLabel('Contraseña',{exact:true}).fill('Registro2026!');await mobile.page.getByRole('button',{name:'Entrar a mi cuenta',exact:true}).click();await mobile.page.waitForURL(base+'/dashboard');assert.equal((await state(mobile.ctx)).body.restaurant.name,'Restaurante Móvil');await mobile.ctx.close();
  });
  await check('Sin excepciones JavaScript durante registro, navegación, mesa y monitor',async()=>assert.deepEqual(errors,[]));
}catch(error){console.error(error.stack);process.exitCode=1;}
finally{await writeFile(path.join(out,'results.json'),JSON.stringify({fixture:'SQLite, directorio de medios y navegador aislados; sin datos principales; red externa bloqueada',results,errors,geometry},null,2));await browser?.close();await app?.close();assert.equal(path.dirname(path.resolve(temporary)),path.resolve(os.tmpdir()));assert(path.basename(temporary).startsWith('atencion-registration-ui-'));await rm(temporary,{recursive:true,force:true});}
