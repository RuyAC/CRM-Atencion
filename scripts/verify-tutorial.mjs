import {createRequire} from 'node:module';
import {access,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';

// Owned localhost server, fresh browser contexts, disposable SQLite only.
// No connection to the running installation or its restaurant data.
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ruyal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'.impeccable/review/tutorial-reference');
const temporary=await mkdtemp(path.join(os.tmpdir(),'mate-tutorial-ui-'));
const results=[],errors=[],geometry={},steps=[],contrast=[];
let app,browser,context,admin,base;
const routeUrl=route=>'/dashboard'+(route?'/'+route:'');
const fakeTrial=/\b(?:7|14|15|30)\s+d[ií]as\s+(?:gratis|gratuitos|de prueba)|per[ií]odo\s+de\s+prueba|teste\s+gr[aá]tis|free\s+trial/i;

async function check(name,callback){
  try{await callback();results.push({name,result:'passed'});console.log('PASS '+name);}
  catch(error){results.push({name,result:'failed',error:error.message});console.error('FAIL '+name+': '+error.message);process.exitCode=1;}
}
function observe(page){page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));}
async function ownedContext(options={}){
  const ctx=await browser.newContext({viewport:{width:1116,height:854},reducedMotion:'reduce',serviceWorkers:'block',...options});
  await ctx.route('**/*',async request=>{
    const url=new URL(request.request().url());
    if(url.origin===base)return request.continue();
    if(url.hostname==='api.ipify.org')return request.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ip:'8.8.8.8'})});
    return request.abort('blockedbyclient');
  });
  return ctx;
}
async function login(page,email='ventas@matebar.com',password='Atencion2026!'){
  await page.goto(base+'/dashboard');
  await page.getByLabel('Correo electrónico',{exact:true}).fill(email);
  await page.getByLabel('Contraseña',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Entrar a mi cuenta',exact:true}).click();
  await page.locator('#admin-navigation nav').waitFor({state:'attached'});
}
async function openPage(route='menu',page=admin){
  await page.goto(base+routeUrl(route));
  await page.locator('#admin-navigation nav').waitFor({state:'attached'});
  await page.locator('#admin-content h1').first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.mouse.move(0,0);
}
async function openTutorial(page=admin){
  if(await page.locator('.t-tour').isVisible().catch(()=>false))return;
  if(await page.evaluate(()=>matchMedia('(max-width:760px)').matches)&&!await page.locator('#admin-navigation').evaluate(element=>element.classList.contains('open'))){
    await page.getByRole('button',{name:'Abrir navegación',exact:true}).click();
  }
  await page.getByRole('button',{name:/Tutorial del sistema/}).click();
  await page.locator('.t-tour').waitFor({state:'visible'});
  await page.waitForFunction(()=>document.querySelector('.t-tour')?.contains(document.activeElement));
}
async function selectStep(index,page=admin){
  await openTutorial(page);await page.locator('.t-tour-dots button').nth(index).click();
  await page.waitForFunction(index=>document.querySelectorAll('.t-tour-dots button')[index]?.getAttribute('aria-current')==='step',index);
  await page.mouse.move(0,0);
}
async function closeTutorial(page=admin){
  if(await page.locator('.t-tour').isVisible().catch(()=>false)){await page.keyboard.press('Escape');await page.locator('.t-tour').waitFor({state:'detached'});}
}
async function state(){return admin.evaluate(async()=>{const value=await(await fetch('/api/state')).json();return value.state||value;});}
async function action(name,payload={}){
  return admin.evaluate(async({name,payload})=>{const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,payload})});return{status:response.status,body:await response.json()};},{name,payload});
}
async function measure(page=admin){
  return page.evaluate(()=>{
    const rounded=value=>Math.round(value*100)/100;
    const box=element=>{if(!element)return null;const b=element.getBoundingClientRect();return{x:rounded(b.x),y:rounded(b.y),width:rounded(b.width),height:rounded(b.height)};};
    const dialog=document.querySelector('.t-tour'),body=dialog.querySelector('.t-tour-body'),rows=dialog.querySelector('.t-tour-rows');
    const progress=dialog.querySelector('.t-tour-progress'),fill=progress?.firstElementChild;
    const style=element=>{if(!element)return null;const css=getComputedStyle(element);return{padding:[css.paddingTop,css.paddingRight,css.paddingBottom,css.paddingLeft],gap:css.gap,background:css.backgroundColor,color:css.color,fontSize:css.fontSize,fontWeight:css.fontWeight,lineHeight:css.lineHeight,transitionDuration:css.transitionDuration,animationDuration:css.animationDuration};};
    return{viewport:{width:innerWidth,height:innerHeight},pageOverflow:document.documentElement.scrollWidth-innerWidth,dialog:box(dialog),dialogClientWidth:dialog.clientWidth,dialogScrollWidth:dialog.scrollWidth,dialogClientHeight:dialog.clientHeight,dialogScrollHeight:dialog.scrollHeight,header:box(dialog.querySelector('.t-tour-header')||dialog.querySelector('header')),footer:box(dialog.querySelector('.t-tour-footer')||dialog.querySelector('footer')),body:box(body),bodyStyle:style(body),rows:box(rows),rowsStyle:style(rows),rowBoxes:[...dialog.querySelectorAll('.t-tour-rows>li')].map(box),progress:{box:box(progress),fill:box(fill),now:progress?.getAttribute('aria-valuenow'),max:progress?.getAttribute('aria-valuemax')},dialogStyle:style(dialog),title:dialog.querySelector('.t-tour-intro h2')?.textContent,links:[...dialog.querySelectorAll('a[href]')].map(element=>({href:element.getAttribute('href'),target:element.getAttribute('target'),rel:element.getAttribute('rel'),text:element.innerText})),focusedInside:dialog.contains(document.activeElement),reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches};
  });
}
function assertProgress(shot,index){
  const expected=(index+1)/7;
  if(shot.progress.now!==null){const max=Number(shot.progress.max)||100;assert(Math.abs(Number(shot.progress.now)/max-expected)<0.002,`Progreso paso ${index+1}: ${shot.progress.now}/${max}`);}
  else{assert(shot.progress.fill&&shot.progress.box,'Falta la barra de progreso');assert(Math.abs(shot.progress.fill.width/shot.progress.box.width-expected)<0.002,`Ancho de progreso paso ${index+1}`);}
}
async function assertStep(index,page=admin){
  const dialog=page.locator('.t-tour'),title=await page.locator('.t-tour-intro h2').innerText();
  assert(title.trim(),`Paso ${index+1}: falta título`);
  await page.getByRole('dialog',{name:title,exact:true}).waitFor();
  assert.equal(await dialog.getAttribute('aria-modal'),'true');
  assert.equal(await page.locator('.t-tour-dots button').count(),7);
  assert.equal(await page.locator('.t-tour-dots button[aria-current="step"]').count(),1);
  assert.equal(await page.locator('.t-tour-dots button').nth(index).getAttribute('aria-current'),'step');
  assert.equal(await page.locator('.t-tour-rows>li').count(),3,`Paso ${index+1}: tres tarjetas`);
  assert(!fakeTrial.test(await dialog.innerText()),`Paso ${index+1}: promesa de prueba gratuita`);
  const shot=await measure(page);assertProgress(shot,index);assert(shot.pageOverflow<=1);assert(shot.dialogScrollWidth<=shot.dialogClientWidth+1);
  return shot;
}
async function captureReference(index){
  const width=620,height=549,{dialog}=await measure();
  const x=Math.round(dialog.x+dialog.width/2-width/2),y=Math.round(dialog.y+dialog.height/2-height/2);
  await admin.screenshot({path:path.join(out,`step-${index+1}-reference-620x549.png`),clip:{x,y,width,height}});
}
async function measureContrast(page=admin){
  return page.locator('.t-tour').evaluate(dialog=>{
    const parse=value=>{const values=value.match(/[\d.]+/g)?.map(Number)||[];return[values[0]||0,values[1]||0,values[2]||0,values.length>3?values[3]:1];};
    const blend=(top,bottom)=>[0,1,2].map(i=>top[i]*top[3]+bottom[i]*(1-top[3])).concat(1);
    const bg=element=>{const chain=[];for(let node=element;node;node=node.parentElement)chain.unshift(node);let color=[255,255,255,1];for(const node of chain)color=blend(parse(getComputedStyle(node).backgroundColor),color);return color;};
    const luminance=color=>{const rgb=color.slice(0,3).map(v=>{v/=255;return v<=0.04045?v/12.92:((v+0.055)/1.055)**2.4;});return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
    return[...dialog.querySelectorAll('.t-tour-intro h2,p,.t-tour-rows>li strong,.t-tour-rows>li small,.t-tour-next,.t-tour-previous,.t-tour-skip,.t-tour-link')].filter(element=>element.getClientRects().length&&element.textContent.trim()&&!element.disabled).map(element=>{const css=getComputedStyle(element),background=bg(element),foreground=blend(parse(css.color),background),a=luminance(foreground),b=luminance(background),large=parseFloat(css.fontSize)>=24||(parseFloat(css.fontSize)>=18.66&&Number(css.fontWeight)>=700);return{selector:element.className,text:element.textContent.trim(),color:css.color,background,ratio:Math.round((Math.max(a,b)+.05)/(Math.min(a,b)+.05)*100)/100,minimum:large?3:4.5};});
  });
}

try{
  await access(path.join(root,'dist/index.html'));await mkdir(out,{recursive:true});
  app=createApp({dbPath:path.join(temporary,'tutorial.sqlite'),mediaDir:path.join(temporary,'uploads'),host:'127.0.0.1',port:0});
  const address=await app.listen();base=`http://127.0.0.1:${address.port}`;
  browser=await chromium.launch({headless:true,channel:'msedge'});context=await ownedContext();admin=await context.newPage();observe(admin);
  await login(admin);await openPage('menu');

  await check('Abrir desde Menú: nombre accesible, foco y geometría de referencia',async()=>{
    await openTutorial();const shot=await assertStep(0);geometry['desktop-step-1']=shot;
    assert.equal(shot.dialog.width,576);assert(Math.abs(shot.header.height-58)<=1,'Cabecera de 58 px más barra de progreso de 6 px');assert(Math.abs(shot.footer.height-66)<=1,'Pie de 66 px');
    assert.deepEqual(shot.bodyStyle.padding,['24px','24px','24px','24px']);
    assert.equal(shot.rowsStyle.gap,'8px');assert(shot.rowBoxes.every(row=>row.height>=59),'Tarjetas de al menos 59 px');
    assert((await admin.locator('.t-tour').innerText()).includes('Mate bar'));assert(shot.focusedInside);
    await admin.screenshot({path:path.join(out,'desktop-1116x854.png')});
  });
  await check('Siete pasos: Siguiente, indicadores, progreso, tres tarjetas y capturas',async()=>{
    for(let index=0;index<7;index++){
      if(index){await admin.locator('.t-tour-next').click();await admin.mouse.move(0,0);}
      const shot=await assertStep(index);geometry[`desktop-step-${index+1}`]=shot;
      steps.push({number:index+1,title:shot.title,links:shot.links});
      contrast.push({step:index+1,entries:await measureContrast()});
      await captureReference(index);
    }
    assert.equal(new Set(steps.map(step=>step.title)).size,7);
    const finish=admin.getByRole('button',{name:'Comenzar a usar',exact:true});
    assert.equal(await finish.evaluate(element=>getComputedStyle(element).backgroundColor),'rgb(0, 153, 102)');
    assert.equal(await finish.locator('svg').count(),1);
    await admin.locator('.t-tour-next').click();await admin.locator('.t-tour').waitFor({state:'detached'});
    assert(await admin.getByRole('button',{name:/Tutorial del sistema/}).evaluate(element=>element===document.activeElement));
  });
  await check('Anterior e indicadores permiten recorrer los siete pasos',async()=>{
    await openTutorial();await selectStep(6);
    for(let index=5;index>=0;index--){await admin.locator('.t-tour-previous').click();await assertStep(index);}
    for(const index of [3,1,5,2,6,4,0]){await selectStep(index);await assertStep(index);}
    assert.equal(await admin.locator('.t-tour-previous').count(),0);await closeTutorial();
  });
  await check('Cerrar, omitir y Escape restauran el foco; Tab permanece en el diálogo',async()=>{
    for(const mode of ['close','skip','escape']){
      await openTutorial();
      for(const key of ['Tab','Shift+Tab'])for(let index=0;index<18;index++){await admin.keyboard.press(key);assert(await admin.locator('.t-tour').evaluate(element=>element.contains(document.activeElement)),`${key} salió del tutorial`);}
      if(mode==='escape')await admin.keyboard.press('Escape');else await admin.locator(mode==='close'?'.t-tour-close':'.t-tour-skip').click();
      await admin.locator('.t-tour').waitFor({state:'detached'});
      assert(await admin.getByRole('button',{name:/Tutorial del sistema/}).evaluate(element=>element===document.activeElement));
    }
    await openTutorial();await admin.mouse.click(10,10);await admin.locator('.t-tour').waitFor({state:'detached'});
    assert(await admin.getByRole('button',{name:/Tutorial del sistema/}).evaluate(element=>element===document.activeElement));
  });
  await check('Los enlaces abren Mesas, Menú, TV, Wi-Fi, Botones y Equipo',async()=>{
    const data=await state(),table=data.tables.find(table=>table.active!==false);
    const destinations=[[1,'/dashboard/tables',false],[2,'/dashboard/menu',false],[3,`/tv/${data.restaurant.slug}`,true],[4,'/dashboard/networks',false],[5,'/dashboard/buttons',false],[6,'/dashboard/staff',false]];
    for(const [index,href,newTab]of destinations){
      await selectStep(index);const link=admin.locator('.t-tour-link');assert.equal(await link.count(),1,`Paso ${index+1}: CTA accionable`);assert.equal(await link.getAttribute('href'),href);
      if(newTab){assert.equal(await link.getAttribute('target'),'_blank');assert(/noopener|noreferrer/.test(await link.getAttribute('rel')));const pending=admin.waitForEvent('popup');await link.click();const popup=await pending;observe(popup);await popup.waitForURL(base+href);await popup.locator('h1').first().waitFor();await popup.close();await closeTutorial();}
      else{await link.click();await admin.waitForURL(base+href);await admin.locator('#admin-content h1').first().waitFor();assert.equal(await admin.locator('.t-tour').count(),0);}
    }
  });
  await check('El tutorial abre desde Wi-Fi y Menú y comienza en el primer paso',async()=>{
    for(const route of ['networks','menu']){await openPage(route);await openTutorial();await assertStep(0);await selectStep(4);await closeTutorial();await openTutorial();await assertStep(0);await closeTutorial();}
  });
  await check('Marca y mesas activas se derivan de datos actuales',async()=>{
    const original=await state(),first=original.tables[0];
    assert.equal((await action('settings.save',{restaurant:{name:'Mate bar · Tutorial QA'}})).status,200);
    assert.equal((await action('entity.save',{entity:'tables',item:{...first,active:false}})).status,200);
    await openPage('menu');await openTutorial();assert((await admin.locator('.t-tour').innerText()).includes('Mate bar · Tutorial QA'));
    await selectStep(1);const data=await state(),count=data.tables.filter(table=>table.active!==false).length;
    assert(new RegExp(`\\b${count}\\s+mesas?\\s+activas?\\b`,'i').test(await admin.locator('.t-tour').innerText()),'Conteo dinámico de mesas activas');
    await selectStep(6);assert.equal(await admin.locator('.t-tour-link').getAttribute('href'),'/dashboard/staff');
    await closeTutorial();
    assert.equal((await action('settings.save',{restaurant:{name:original.restaurant.name}})).status,200);assert.equal((await action('entity.save',{entity:'tables',item:first})).status,200);await openPage('menu');
  });
  await check('Gerente y garzón reciben únicamente enlaces internos permitidos',async()=>{
    for(const [role,email,password,allowed]of [['manager','gerente@local.test','Gerente2026!',['','tables','menu','reports','buttons','networks','kitchen']],['staff','garcom@local.test','Garcom2026!',['','kitchen']]]){
      const ctx=await ownedContext(),page=await ctx.newPage();observe(page);await login(page,email,password);await openTutorial(page);
      for(let index=0;index<7;index++){await selectStep(index,page);await assertStep(index,page);const links=await page.locator('.t-tour a[href^="/dashboard"]').evaluateAll(elements=>elements.map(element=>element.getAttribute('href')));assert(links.every(href=>allowed.map(routeUrl).includes(href)),`${role}, paso ${index+1}: enlace restringido ${links.join(',')}`);}
      await ctx.close();
    }
  });
  await check('Móvil: abrir desde navegación, foco sin trampas competidoras y capturas',async()=>{
    for(const height of [844,640]){
      await admin.setViewportSize({width:390,height});await openPage('menu');await openTutorial();
      assert(await admin.locator('#admin-navigation').evaluate(element=>element.inert),'Sidebar inerte durante tutorial móvil');
      for(let index=0;index<7;index++){
        await selectStep(index);const shot=await assertStep(index);geometry[`mobile-390x${height}-step-${index+1}`]=shot;
        assert(shot.dialog.x>=0&&shot.dialog.x+shot.dialog.width<=391,'Diálogo dentro del ancho');assert(shot.dialog.y>=0&&shot.dialog.y+shot.dialog.height<=height+1,'Diálogo dentro del alto');
        const next=await admin.locator('.t-tour-next').boundingBox();assert(next&&next.y>=0&&next.y+next.height<=height+1,'Siguiente visible en móvil');
        if(height===844||index===4)await admin.screenshot({path:path.join(out,`mobile-390x${height}-step-${index+1}.png`)});
      }
      for(const key of ['Tab','Shift+Tab'])for(let index=0;index<20;index++){await admin.keyboard.press(key);assert(await admin.locator('.t-tour').evaluate(element=>element.contains(document.activeElement)),`${key}: foco móvil salió del tutorial`);}
      assert((await measure()).reducedMotion);
      const motion=await admin.locator('.t-tour').evaluate(dialog=>[dialog,...dialog.querySelectorAll('*')].flatMap(element=>{const css=getComputedStyle(element);return[css.animationDuration,css.transitionDuration].flatMap(value=>value.split(',').map(part=>parseFloat(part)*(part.trim().endsWith('ms')?.001:1)));}));
      assert(motion.every(duration=>duration<=.01),'El tutorial respeta movimiento reducido');
      await admin.keyboard.press('Escape');await admin.locator('.t-tour').waitFor({state:'detached'});
      const focus=await admin.evaluate(()=>({insideSidebar:document.querySelector('#admin-navigation').contains(document.activeElement),sidebarInert:document.querySelector('#admin-navigation').inert,button:document.activeElement?.getAttribute('aria-label'),className:document.activeElement?.className}));
      assert(!focus.insideSidebar||!focus.sidebarInert,'Foco restaurado a elemento inerte');
      assert(focus.button==='Abrir navegación'||focus.className.includes('st-tutorial'),'Foco restaurado al control de apertura');
    }
  });
  await check('Contraste de texto y excepciones de naranja conservadas de la referencia',async()=>{
    const failures=contrast.flatMap(step=>step.entries.filter(entry=>entry.ratio+0.02<entry.minimum&&!['t-tour-label','t-tour-next','t-tour-next t-tour-finish','t-tour-link'].includes(entry.selector)).map(entry=>({step:step.step,...entry})));
    assert.deepEqual(failures,[]);
  });
  await check('Sin errores JavaScript en las pantallas verificadas',async()=>assert.deepEqual(errors,[]));
}catch(error){results.push({name:'Preparación o ejecución',result:'failed',error:error.stack});console.error(error.stack);process.exitCode=1;if(admin&&!admin.isClosed())await admin.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});}
finally{
  await mkdir(out,{recursive:true});
  await writeFile(path.join(out,'geometry.json'),JSON.stringify(geometry,null,2));
  await writeFile(path.join(out,'contrast.json'),JSON.stringify(contrast,null,2));
  await writeFile(path.join(out,'results.json'),JSON.stringify({fixture:'SQLite temporal; servidor propio localhost; navegador aislado; solicitudes externas bloqueadas o simuladas; datos principales intactos',isolatedDatabase:true,results,errors,steps,viewports:[[1116,854],[390,844],[390,640]],referenceCapture:[620,549]},null,2));
  await browser?.close();await app?.close();
  assert.equal(path.dirname(path.resolve(temporary)),path.resolve(os.tmpdir()));assert(path.basename(temporary).startsWith('mate-tutorial-ui-'));
  await rm(temporary,{recursive:true,force:true});
}
