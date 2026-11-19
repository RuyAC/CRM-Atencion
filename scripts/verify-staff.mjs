import {createRequire} from 'node:module';
import {mkdir,mkdtemp,writeFile,rm} from 'node:fs/promises';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import {createApp} from '../server/index.mjs';

// This development check uses only an isolated in-memory database and temporary uploads.
// It never navigates to the reference service or changes the primary local database.
const require=createRequire(import.meta.url);
const {chromium,request}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ruyal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const mediaDir=await mkdtemp(path.join(os.tmpdir(),'mate-staff-ui-'));
const app=createApp({dbPath:':memory:',mediaDir,host:'127.0.0.1',port:0});
const address=await app.listen(),base=`http://127.0.0.1:${address.port}`;
const out='.impeccable/review/staff';
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
const context=await browser.newContext({viewport:{width:1119,height:867},reducedMotion:'reduce'});
const page=await context.newPage();page.setDefaultTimeout(8000);
const errors=[],results=[],geometry={},apiContexts=[];
page.on('pageerror',error=>errors.push(error.message));
async function check(name,fn){try{await fn();results.push({name,result:'passed'});console.log('PASS '+name);}catch(error){results.push({name,result:'failed',error:error.message});console.error('FAIL '+name+': '+error.message);if(await page.getByRole('dialog').count()){await page.keyboard.press('Escape');await waitClosed();}}}
async function action(actor,name,payload={}){const response=await actor.post(base+'/api/action',{data:{action:name,payload}});return {status:response.status(),body:await response.json()};}
async function state(actor=context.request){return (await actor.get(base+'/api/state')).json();}
async function apiClient(){const actor=await request.newContext();apiContexts.push(actor);return actor;}
async function login(actor,email,password){const result=await action(actor,'auth.login',{email,password});assert.equal(result.status,200,result.body.error);return result.body.result;}
function responseWait(predicate){const pending=page.waitForResponse(predicate);pending.catch(()=>{});return pending;}
async function submit(name='Guardar cambios'){const responsePromise=responseWait(response=>response.url().endsWith('/api/action')&&response.request().postDataJSON()?.action==='entity.save');await page.getByRole('dialog').getByRole('button',{name,exact:true}).click();return (await responsePromise).json();}
async function waitClosed(){await page.getByRole('dialog').waitFor({state:'hidden'});}
function row(name){return page.locator('.st-member').filter({has:page.getByRole('button',{name:`Editar miembro ${name}`,exact:true})});}
async function newDialog(){await page.getByRole('button',{name:'Invitar miembro',exact:true}).click();await page.getByRole('dialog',{name:'Nuevo miembro del equipo',exact:true}).waitFor();return page.getByRole('dialog');}
async function screenshots(){
  for(const [width,height] of [[1119,867],[1440,1000],[768,900],[390,844]]){
    await page.setViewportSize({width,height});await page.goto(base+'/dashboard/staff');await page.getByRole('heading',{name:'Equipo y permisos (RBAC)',exact:true}).waitFor();await page.evaluate(()=>document.fonts.ready);
    geometry[`page-${width}`]=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,sidebar:document.querySelector('.st-sidebar').getBoundingClientRect().toJSON(),banner:document.querySelector('.st-local-banner').getBoundingClientRect().toJSON(),roles:[...document.querySelectorAll('.st-role-card')].map(el=>el.getBoundingClientRect().toJSON()),member:document.querySelector('.st-member').getBoundingClientRect().toJSON(),heading:document.querySelector('.st-heading').getBoundingClientRect().toJSON()}));
    await page.screenshot({path:`${out}/staff-${width}.png`,fullPage:true});
  }
  for(const [width,height] of [[1440,1000],[533,773],[390,844]]){
    await page.setViewportSize({width,height});await page.goto(base+'/dashboard/staff');await page.getByRole('heading',{name:'Equipo y permisos (RBAC)',exact:true}).waitFor();const dialog=await newDialog();
    geometry[`dialog-${width}`]=await dialog.evaluate(el=>({box:el.getBoundingClientRect().toJSON(),overflow:el.scrollWidth-el.clientWidth,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,borderRadius:getComputedStyle(el).borderRadius,inputs:[...el.querySelectorAll('input')].map(input=>({type:input.type,width:input.getBoundingClientRect().width}))}));
    await page.screenshot({path:`${out}/dialog-${width}.png`});await page.keyboard.press('Escape');await waitClosed();
  }
}
let testMember,memberActor,monitorActor;
try{
  await page.goto(base+'/dashboard');await page.getByLabel('Correo electrónico',{exact:true}).fill('ventas@matebar.com');await page.getByLabel('Contraseña',{exact:true}).fill('Atencion2026!');await page.getByRole('button',{name:'Entrar a mi cuenta',exact:true}).click();await page.getByRole('heading',{name:'Panel principal',exact:true}).waitFor();
  for(const id of ['manager-local','staff-local'])assert.equal((await action(context.request,'entity.delete',{entity:'staff',id})).status,200);
  assert.equal((await action(context.request,'entity.save',{entity:'staff',item:{id:'owner-local',name:'Administrador Mate bar'}})).status,200);
  if(!process.env.STAFF_SKIP_SCREENSHOTS){await screenshots();await writeFile(out+'/geometry.json',JSON.stringify(geometry,null,2));
  await check('Composición de referencia y adaptación a cuatro anchos',async()=>{
    const desktop=geometry['page-1119'];assert.equal(desktop.banner.x,312);assert.equal(desktop.banner.y,23);assert(Math.abs(desktop.banner.height-152)<=1);assert.equal(desktop.roles.length,3);assert(Math.abs(desktop.roles[0].height-139)<=1);assert(desktop.roles.every(role=>Math.abs(role.y-desktop.roles[0].y)<1));
    for(const width of [1119,1440,768,390])assert(geometry[`page-${width}`].overflow<=1,`Desbordamiento de ${geometry[`page-${width}`].overflow}px a ${width}px`);
    for(const width of [1440,533,390]){const dialog=geometry[`dialog-${width}`];assert(dialog.box.width<=512);assert(dialog.overflow<=1);assert.equal(dialog.borderRadius,'16px');assert(dialog.box.x>=0&&dialog.box.y>=0);}
    assert.equal(geometry['dialog-533'].box.width,512);
  });}
  await page.setViewportSize({width:1119,height:867});await page.goto(base+'/dashboard/staff');await page.getByRole('heading',{name:'Equipo y permisos (RBAC)',exact:true}).waitFor();
  await check('Nuevo miembro: contraseña de ocho caracteres, PIN4 y generación/visibilidad',async()=>{
    const dialog=await newDialog(),password=dialog.getByLabel('Contraseña de acceso (mín. 6 caracteres)',{exact:true}),pin=dialog.getByLabel('PIN de acceso al salón (4 dígitos)',{exact:true});
    assert.match(await password.inputValue(),/^.{8}$/);assert.match(await pin.inputValue(),/^\d{4}$/);assert.equal(await password.getAttribute('type'),'text');
    await dialog.getByRole('button',{name:'Ocultar contraseña',exact:true}).click();assert.equal(await password.getAttribute('type'),'password');await dialog.getByRole('button',{name:'Mostrar contraseña',exact:true}).click();assert.equal(await password.getAttribute('type'),'text');
    await password.fill('before');await dialog.getByRole('button',{name:'Generar contraseña',exact:true}).click();assert.match(await password.inputValue(),/^.{8}$/);await dialog.getByRole('button',{name:'Generar aleatorio',exact:true}).click();assert.match(await pin.inputValue(),/^\d{4}$/);
    await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await waitClosed();
  });
  await check('Modal: Tab queda dentro, Escape cierra y devuelve foco al botón',async()=>{
    const trigger=page.getByRole('button',{name:'Invitar miembro',exact:true});await trigger.focus();await page.keyboard.press('Enter');await page.getByRole('dialog').waitFor();
    for(let index=0;index<24;index++){assert(await page.evaluate(()=>Boolean(document.activeElement.closest('dialog'))),`Tab ${index}: ${await page.evaluate(()=>document.activeElement.outerHTML.slice(0,150))}`);await page.keyboard.press('Tab');}
    for(let index=0;index<14;index++){assert(await page.evaluate(()=>Boolean(document.activeElement.closest('dialog'))),`Shift+Tab ${index} salió del diálogo`);await page.keyboard.press('Shift+Tab');}
    await page.keyboard.press('Escape');await waitClosed();assert(await trigger.evaluate(el=>document.activeElement===el),'El foco no volvió a Invitar miembro');
  });
  await check('Crear miembro acepta contraseña6 y habilita login y PIN reales',async()=>{
    const dialog=await newDialog();await dialog.getByLabel('Nombre completo',{exact:true}).fill('Ana Verificación');await dialog.getByLabel('Correo de acceso',{exact:true}).fill('ana@example.test');await dialog.getByLabel('Contraseña de acceso (mín. 6 caracteres)',{exact:true}).fill('Abc123');await dialog.getByLabel('PIN de acceso al salón (4 dígitos)',{exact:true}).fill('0876');
    const saved=await submit('Añadir al equipo');assert(saved.ok,saved.error);testMember=saved.result;await waitClosed();await row('Ana Verificación').waitFor();assert.equal(testMember.password,undefined);assert.equal(testMember.pin,undefined);
    memberActor=await apiClient();monitorActor=await apiClient();assert.equal((await login(memberActor,'ana@example.test','Abc123')).id,testMember.id);assert.equal((await action(monitorActor,'auth.pin',{staffId:testMember.id,pin:'0876'})).status,200);
  });
  await check('Mostrar y ocultar PIN de un miembro',async()=>{
    const member=row('Ana Verificación');await member.getByRole('button',{name:'Mostrar PIN de Ana Verificación',exact:true}).click();await member.locator('.st-pin-display strong').getByText('0876',{exact:true}).waitFor();await member.getByRole('button',{name:'Ocultar PIN de Ana Verificación',exact:true}).click();assert.equal(await member.locator('.st-pin-display strong').innerText(),'••••');
  });
  await check('Cambiar PIN conserva contraseña y revoca login y sesión del salón',async()=>{
    await row('Ana Verificación').getByRole('button',{name:'Cambiar PIN',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('PIN de acceso al salón (4 dígitos)',{exact:true}).fill('0012');assert((await submit()).ok);await waitClosed();assert.equal((await state(memberActor)).viewer.user,null);assert.equal((await state(monitorActor)).viewer.user,null);
    assert.equal((await action(monitorActor,'auth.pin',{staffId:testMember.id,pin:'0876'})).status,401);assert.equal((await action(monitorActor,'auth.pin',{staffId:testMember.id,pin:'0012'})).status,200);await login(memberActor,'ana@example.test','Abc123');
  });
  await check('Cambiar contraseña conserva PIN y rechaza credenciales anteriores',async()=>{
    await row('Ana Verificación').getByRole('button',{name:'Cambiar contraseña',exact:true}).click();await page.getByRole('dialog').getByLabel('Contraseña de acceso (mín. 6 caracteres)',{exact:true}).fill('New456');assert((await submit()).ok);await waitClosed();assert.equal((await state(memberActor)).viewer.user,null);assert.equal((await state(monitorActor)).viewer.user,null);assert.equal((await action(memberActor,'auth.login',{email:'ana@example.test',password:'Abc123'})).status,401);await login(memberActor,'ana@example.test','New456');assert.equal((await action(monitorActor,'auth.pin',{staffId:testMember.id,pin:'0012'})).status,200);
  });
  await check('Selector cambia rol; RBAC efectivo protege funciones del propietario',async()=>{
    const responsePromise=responseWait(response=>response.url().endsWith('/api/action')&&response.request().postDataJSON()?.payload.item?.role==='MANAGER');await row('Ana Verificación').getByLabel('Función de Ana Verificación',{exact:true}).selectOption('MANAGER');assert((await (await responsePromise).json()).ok);await row('Ana Verificación').locator('.st-role-badge').getByText('MANAGER',{exact:true}).waitFor();assert.equal((await state(memberActor)).viewer.user,null);assert.equal((await login(memberActor,'ana@example.test','New456')).role,'MANAGER');
    assert.equal((await action(memberActor,'entity.save',{entity:'staff',item:{id:testMember.id,role:'OWNER'}})).status,403);assert.equal((await action(memberActor,'staff.pinReveal',{id:testMember.id})).status,403);
    const restrictedContext=await browser.newContext();try{const restrictedPage=await restrictedContext.newPage();await login(restrictedContext.request,'ana@example.test','New456');await restrictedPage.goto(base+'/dashboard/staff');await restrictedPage.getByRole('heading',{name:'Acceso restringido',exact:true}).waitFor();assert.equal(await restrictedPage.getByRole('button',{name:'Invitar miembro',exact:true}).count(),0);}finally{await restrictedContext.close();}
  });
  await check('Editar nombre y correo mantiene los secretos y persiste al recargar',async()=>{
    await row('Ana Verificación').getByRole('button',{name:'Editar miembro Ana Verificación',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('Nombre completo',{exact:true}).fill('Ana Equipo');await dialog.getByLabel('Correo de acceso',{exact:true}).fill('ana-equipo@example.test');assert((await submit()).ok);await waitClosed();await page.reload();await row('Ana Equipo').waitFor();await row('Ana Equipo').getByText('ana-equipo@example.test',{exact:true}).waitFor();await login(memberActor,'ana-equipo@example.test','New456');assert.equal((await action(monitorActor,'auth.pin',{staffId:testMember.id,pin:'0012'})).status,200);
  });
  await check('Último propietario protegido con error visible en la fila',async()=>{
    const owner=row('Administrador Mate bar'),responsePromise=responseWait(response=>response.url().endsWith('/api/action')&&response.request().postDataJSON()?.payload.item?.id==='owner-local');await owner.getByLabel('Función de Administrador Mate bar',{exact:true}).selectOption('STAFF');const body=await(await responsePromise).json();assert.equal(body.ok,false);await owner.locator('.st-error').getByText('Mantén al menos un propietario activo.',{exact:true}).waitFor();assert.equal(await owner.getByLabel('Función de Administrador Mate bar',{exact:true}).inputValue(),'OWNER');assert(await owner.getByRole('button',{name:'Eliminar Administrador Mate bar',exact:true}).isDisabled());
  });
  await check('Correo duplicado se informa dentro del modal sin perder lo escrito',async()=>{
    const dialog=await newDialog();await dialog.getByLabel('Nombre completo',{exact:true}).fill('Correo duplicado');await dialog.getByLabel('Correo de acceso',{exact:true}).fill('ventas@matebar.com');assert.equal((await submit('Añadir al equipo')).ok,false);await dialog.locator('.st-error').getByText('Este correo ya está registrado.',{exact:true}).waitFor();assert.equal(await dialog.getByLabel('Nombre completo',{exact:true}).inputValue(),'Correo duplicado');await dialog.getByRole('button',{name:'Cancelar',exact:true}).click();await waitClosed();
  });
  await check('Eliminar pide confirmación; cancelar conserva y confirmar revoca accesos',async()=>{
    const member=row('Ana Equipo');await member.getByRole('button',{name:'Eliminar Ana Equipo',exact:true}).click();await page.getByRole('dialog').getByRole('button',{name:'Cancelar',exact:true}).click();await waitClosed();assert.equal((await state()).staff.some(item=>item.id===testMember.id),true);await member.getByRole('button',{name:'Eliminar Ana Equipo',exact:true}).click();const responsePromise=responseWait(response=>response.url().endsWith('/api/action')&&response.request().postDataJSON()?.action==='entity.delete');await page.getByRole('dialog').getByRole('button',{name:'Eliminar miembro',exact:true}).click();assert((await(await responsePromise).json()).ok);await waitClosed();await member.waitFor({state:'hidden'});assert.equal((await state(memberActor)).viewer.user,null);assert.equal((await state(monitorActor)).viewer.user,null);assert.equal((await action(memberActor,'auth.login',{email:'ana-equipo@example.test',password:'New456'})).status,401);assert.equal((await action(monitorActor,'auth.pin',{staffId:testMember.id,pin:'0012'})).status,401);
  });
  await check('Responsive móvil: navegación por teclado y movimiento reducido',async()=>{
    await page.setViewportSize({width:390,height:844});await page.goto(base+'/dashboard/staff');await page.getByRole('heading',{name:'Equipo y permisos (RBAC)',exact:true}).waitFor();const menu=page.getByRole('button',{name:'Abrir navegación',exact:true});await menu.focus();await page.keyboard.press('Enter');assert(await page.locator('.st-sidebar').evaluate(el=>!el.inert));for(let index=0;index<22;index++){assert(await page.evaluate(()=>Boolean(document.activeElement.closest('.st-sidebar'))));await page.keyboard.press('Tab');}await page.keyboard.press('Escape');assert(await menu.evaluate(el=>document.activeElement===el));assert(await page.locator('.st-sidebar').evaluate(el=>el.inert));assert(await page.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));assert(Number.parseFloat(await page.getByRole('button',{name:'Invitar miembro',exact:true}).evaluate(el=>getComputedStyle(el).transitionDuration))<=.00001);
  });
  await check('Sin errores JavaScript durante el circuito completo',async()=>assert.deepEqual(errors,[]));
}catch(error){results.push({name:'Preparación o dependencia de la prueba',result:'failed',error:error.stack});console.error(error.stack);}
finally{
  await writeFile(out+'/results.json',JSON.stringify({fixture:'SQLite :memory:; no modificaciones a datos principales',results,geometry,errors},null,2));
  for(const actor of apiContexts)await actor.dispose();await context.close();await browser.close();await app.close();
  const resolved=path.resolve(mediaDir);if(path.dirname(resolved)!==path.resolve(os.tmpdir())||!path.basename(resolved).startsWith('mate-staff-ui-'))throw new Error('Directorio temporal inválido');await rm(resolved,{recursive:true,force:true});
}
if(results.some(result=>result.result==='failed'))process.exitCode=1;
