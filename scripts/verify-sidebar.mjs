import {createRequire} from 'node:module';
import {access,mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';

// A fresh browser, owned localhost server, and disposable SQLite only.
// This verifier does not use the running installation or change its data.
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ruyal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const out=path.join(root,'.impeccable/review/sidebar-unified');
const directory=await mkdtemp(path.join(os.tmpdir(),'mate-sidebar-ui-'));
const routes=['','tables','menu','networks','buttons','staff','reports','kitchen','billing','settings'];
const viewports=[[1116,854],[1440,1000],[768,900],[390,844]];
const results=[],errors=[],geometry={},signatures={},focusStyles={};
let app,browser,context,admin,base;
const routeUrl=route=>'/dashboard'+(route?'/'+route:'');
async function check(name,callback){
  try{await callback();results.push({name,result:'passed'});console.log('PASS '+name);}
  catch(error){results.push({name,result:'failed',error:error.message});console.error('FAIL '+name+': '+error.message);process.exitCode=1;}
}
function observe(page){page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));}
async function ownedContext(options={}){
  const ctx=await browser.newContext({viewport:{width:1116,height:854},reducedMotion:'reduce',serviceWorkers:'block',...options});
  // Keep the entire check local, including the public-IP lookup on Wi-Fi.
  await ctx.route('**/*',async request=>{
    const url=new URL(request.request().url());
    if(url.origin===base)return request.continue();
    if(url.hostname==='api.ipify.org')return request.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({ip:'8.8.8.8'})});
    return request.abort('blockedbyclient');
  });
  return ctx;
}
async function login(page,email,password){
  await page.goto(base+'/dashboard');
  await page.getByLabel('Correo electrónico',{exact:true}).fill(email);
  await page.getByLabel('Contraseña',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Entrar a mi cuenta',exact:true}).click();
  await page.locator('#admin-navigation nav').waitFor({state:'attached'});
}
async function open(route,page=admin){
  await page.goto(base+routeUrl(route));
  await page.locator('#admin-navigation nav').waitFor({state:'attached'});
  await page.locator('#admin-content h1').first().waitFor();
  await page.evaluate(()=>document.fonts.ready);
  await page.mouse.move(1050,0);
}
async function snapshot(normalizeActive=false){
  return admin.evaluate(normalizeActive=>{
    const sidebar=document.querySelector('#admin-navigation');
    // Compare route-independent styles in the same state; separately verify
    // the selected row's actual palette and weight. Restore before painting.
    const active=normalizeActive?[...sidebar.querySelectorAll('nav a.active')]:[];
    active.forEach(element=>element.classList.remove('active'));
    try{
    const rounded=value=>Math.round(value*100)/100;
    const box=element=>{const b=element.getBoundingClientRect();return{x:rounded(b.x),y:rounded(b.y),width:rounded(b.width),height:rounded(b.height)};};
    const style=(element,colors=true)=>{const css=getComputedStyle(element);const properties=['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','paddingTop','paddingRight','paddingBottom','paddingLeft','marginTop','marginRight','marginBottom','marginLeft','gap','borderRadius','borderTopWidth','borderRightWidth','borderBottomWidth','borderLeftWidth','display','alignItems','justifyContent'];if(colors)properties.push('color','backgroundColor','borderTopColor','borderRightColor','borderBottomColor','borderLeftColor');return Object.fromEntries(properties.map(property=>[property,css[property]]));};
    const staticSelectors=['#admin-navigation','.a-brand','.brand-word','.st-establishment','.st-establishment>span','.st-establishment strong','.st-establishment small','.st-private-row','.st-private-row>span','.st-private-row button','.st-plan-row','.st-plan-row strong','.st-plan-row>a','#admin-navigation nav','.st-live-label','.st-tutorial','.st-tutorial strong','.st-tutorial small','.st-tutorial b','.st-sidebar-tools','.st-tv-link','.st-client-link','.st-monitor-links'];
    const staticElements=Object.fromEntries(staticSelectors.map(selector=>{const element=document.querySelector(selector);return[selector,element?{box:box(element),style:style(element)}:null];}));
    const links=[...sidebar.querySelectorAll('nav a')].map(element=>({href:element.getAttribute('href'),text:element.innerText,box:box(element),style:style(element,false),icon:style(element.querySelector('svg'),false),palette:{color:getComputedStyle(element).color,background:getComputedStyle(element).backgroundColor,icon:getComputedStyle(element.querySelector('svg')).color},current:element.getAttribute('aria-current')}));
    return{viewport:{width:innerWidth,height:innerHeight},overflow:document.documentElement.scrollWidth-innerWidth,sidebar:box(sidebar),sidebarScrollWidth:sidebar.scrollWidth,sidebarClientWidth:sidebar.clientWidth,sidebarScrollHeight:sidebar.scrollHeight,sidebarClientHeight:sidebar.clientHeight,sidebarScrollTop:sidebar.scrollTop,workspace:box(document.querySelector('.a-workspace')),main:box(document.querySelector('#admin-content')),inert:sidebar.inert,hidden:sidebar.getAttribute('aria-hidden'),transition:getComputedStyle(sidebar).transitionDuration,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches,staticElements,links};
    }finally{active.forEach(element=>element.classList.add('active'));}
  },normalizeActive);
}
try{
  await access(path.join(root,'dist/index.html'));await mkdir(out,{recursive:true});
  app=createApp({dbPath:path.join(directory,'sidebar.sqlite'),mediaDir:path.join(directory,'uploads'),host:'127.0.0.1',port:0});
  const address=await app.listen();base=`http://127.0.0.1:${address.port}`;
  browser=await chromium.launch({headless:true,channel:'msedge'});context=await ownedContext();
  admin=await context.newPage();observe(admin);
  await login(admin,'ventas@matebar.com','Chamaii2026!');

  await check('Las diez rutas comparten ancho, tipografía, espaciado y colores del sidebar',async()=>{
    let baseline,activePalette,inactivePalette,activeWeight;
    for(const route of routes){
      await open(route);const shot=await snapshot();geometry[`desktop-${route||'dashboard'}`]=shot;
      assert.equal(shot.sidebar.width,277,`${route||'dashboard'}: ancho`);
      assert.equal(shot.workspace.x,277,`${route||'dashboard'}: espacio de trabajo`);
      assert.deepEqual(['paddingTop','paddingRight','paddingBottom','paddingLeft'].map(property=>shot.staticElements['#admin-navigation'].style[property]),['5px','9px','9px','9px'],`${route||'dashboard'}: padding`);
      assert.equal(shot.sidebarScrollWidth,shot.sidebarClientWidth,`${route||'dashboard'}: desborde interno`);
      assert.deepEqual(shot.links.map(link=>link.href),routes.map(routeUrl));
      const current=shot.links.filter(link=>link.current==='page');assert.equal(current.length,1);
      assert.equal(current[0].href,routeUrl(route));
      const canonical=await snapshot(true);
      const signature={staticElements:canonical.staticElements,links:canonical.links.map(({palette,current,...link})=>link)};
      signatures[route||'dashboard']=signature;
      if(!baseline){baseline=signature;activePalette=current[0].palette;activeWeight=current[0].style.fontWeight;inactivePalette=shot.links.find(link=>!link.current).palette;}
      else assert.deepEqual(signature,baseline,`${route||'dashboard'}: estilos o geometría diferentes`);
      assert.deepEqual(current[0].palette,activePalette,`${route||'dashboard'}: colores activos`);
      assert.equal(current[0].style.fontWeight,activeWeight,`${route||'dashboard'}: peso del texto activo`);
      for(const link of shot.links.filter(link=>!link.current))assert.deepEqual(link.palette,inactivePalette,`${link.href}: colores inactivos`);
    }
    assert.equal(activePalette.background,'rgb(245, 0, 70)');assert.equal(activePalette.color,'rgb(255, 255, 255)');
  });
  await check('El foco y la selección del sidebar mantienen estilos iguales en las diez rutas',async()=>{
    let baseline;
    for(const route of routes){
      await open(route);await admin.keyboard.press('Tab');await admin.locator('#admin-navigation .a-brand').focus();
      const style=await admin.locator('#admin-navigation .a-brand').evaluate(element=>{
        const focus=getComputedStyle(element),selection=getComputedStyle(element,'::selection');
        return{focusVisible:element.matches(':focus-visible'),outlineColor:focus.outlineColor,outlineStyle:focus.outlineStyle,outlineWidth:focus.outlineWidth,outlineOffset:focus.outlineOffset,selectionColor:selection.color,selectionBackground:selection.backgroundColor};
      });
      focusStyles[route||'dashboard']=style;assert(style.focusVisible);
      if(!baseline)baseline=style;else assert.deepEqual(style,baseline,`${route||'dashboard'}: foco o selección diferentes`);
    }
  });
  await check('Wi-Fi → Menú → Configuración → Wi-Fi conserva navegación y sección activa',async()=>{
    await open('networks');
    for(const route of ['menu','settings','networks']){
      await admin.locator(`#admin-navigation nav a[href="${routeUrl(route)}"]`).click();
      await admin.waitForURL(base+routeUrl(route));await admin.locator('#admin-content h1').first().waitFor();
      assert.equal(await admin.locator('#admin-navigation [aria-current="page"]').getAttribute('href'),routeUrl(route));
      assert.equal(await admin.locator('#admin-navigation').evaluate(element=>element.getBoundingClientRect().width),277);
    }
  });
  await check('A 640 px de alto el sidebar desplaza y mantiene Cocina y herramientas accesibles',async()=>{
    await admin.setViewportSize({width:1116,height:640});await open('networks');
    const panel=admin.locator('#admin-navigation');
    assert(await panel.evaluate(element=>element.scrollHeight>element.clientHeight));
    await panel.locator('nav a[href="/dashboard/kitchen"]').scrollIntoViewIfNeeded();
    await panel.locator('nav a[href="/dashboard/kitchen"]').click();await admin.waitForURL(base+'/dashboard/kitchen');
    assert.equal(await panel.locator('[aria-current="page"]').getAttribute('href'),'/dashboard/kitchen');
    await panel.locator('.st-client-link').scrollIntoViewIfNeeded();
    assert(await panel.locator('.st-client-link').isVisible());
    await panel.evaluate(element=>{element.scrollTop=0;});
    assert(await panel.locator('.a-brand').isVisible());
    geometry['short-desktop-640']=await snapshot();
  });
  await check('Las diez rutas no desbordan horizontalmente a 1116, 1440, 768 y 390 px',async()=>{
    const failures=[];
    for(const [width,height] of viewports){
      await admin.setViewportSize({width,height});
      for(const route of routes){
        await open(route);const shot=await snapshot();geometry[`matrix-${width}-${route||'dashboard'}`]=shot;
        if(shot.overflow>1)failures.push(`${width}/${route||'dashboard'}: ${shot.overflow}px`);
        if(shot.sidebar.width!==(width<=760?280:277))failures.push(`${width}/${route||'dashboard'}: sidebar ${shot.sidebar.width}px`);
      }
    }
    assert.deepEqual(failures,[]);
  });
  await check('Capturas comparables Wi-Fi, Menú, Configuración y Menú móvil',async()=>{
    await admin.setViewportSize({width:1116,height:854});
    for(const [route,name] of [['networks','wifi-1116'],['menu','menu-1116'],['settings','settings-1116']]){await open(route);await admin.screenshot({path:path.join(out,name+'.png'),fullPage:true});}
    await admin.setViewportSize({width:390,height:844});await open('menu');await admin.screenshot({path:path.join(out,'menu-390.png'),fullPage:true});
  });
  await check('Móvil: sidebar inerte cerrado, Tab atrapado, Escape restaura foco y movimiento reducido',async()=>{
    await admin.setViewportSize({width:390,height:844});await open('menu');
    const panel=admin.locator('#admin-navigation'),trigger=admin.getByRole('button',{name:'Abrir navegación',exact:true});
    assert(await panel.evaluate(element=>element.inert));assert.equal(await panel.getAttribute('aria-hidden'),'true');
    await panel.locator('a').first().evaluate(element=>element.focus());assert(!await panel.evaluate(element=>element.contains(document.activeElement)));
    await trigger.focus();await admin.keyboard.press('Enter');await admin.waitForFunction(()=>document.querySelector('#admin-navigation')?.classList.contains('open'));
    assert(!await panel.evaluate(element=>element.inert));assert.equal(await panel.getAttribute('aria-hidden'),'false');
    assert.equal(await panel.evaluate(element=>element.getBoundingClientRect().width),280);
    assert.equal(await panel.evaluate(element=>getComputedStyle(element).padding),'12px');
    for(const key of ['Tab','Shift+Tab'])for(let index=0;index<24;index++){await admin.keyboard.press(key);assert(await panel.evaluate(element=>element.contains(document.activeElement)),`${key} salió del sidebar`);}
    await panel.evaluate(element=>{element.scrollTop=0;});
    geometry['mobile-open-390']=await snapshot();await admin.screenshot({path:path.join(out,'mobile-open-390.png')});
    assert(await admin.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches));
    assert.equal(await panel.evaluate(element=>getComputedStyle(element).transitionDuration),'0s');
    await admin.keyboard.press('Escape');await admin.waitForFunction(()=>document.querySelector('#admin-navigation')?.inert);
    assert(await trigger.evaluate(element=>document.activeElement===element));
  });
  await check('Tutorial, enlaces reales de cliente/TV y edición de producto siguen funcionando',async()=>{
    await admin.setViewportSize({width:1116,height:854});await open('menu');
    await admin.locator('.st-tutorial').click();await admin.locator('dialog.t-tour').waitFor();await admin.keyboard.press('Escape');
    await admin.getByRole('button',{name:'Editar Bruschetta de la casa',exact:true}).click();
    const editor=admin.getByRole('dialog',{name:'Editar producto',exact:true});await editor.waitFor();assert.equal(await editor.getByLabel('Nombre del producto',{exact:true}).inputValue(),'Bruschetta de la casa');await admin.keyboard.press('Escape');
    for(const [selector,expected,ready] of [['.st-client-link','/r/mate-bar/t/table-01','.client-table-header h1'],['.st-tv-link','/tv/mate-bar','.monitor-header h1']]){
      assert.equal(await admin.locator(selector).getAttribute('href'),expected);
      const popupPromise=admin.waitForEvent('popup');await admin.locator(selector).click();const popup=await popupPromise;observe(popup);
      await popup.waitForURL(base+expected);await popup.locator(ready).waitFor();await popup.close();
    }
  });
  await check('Gerente y garzón muestran solo rutas permitidas; Cocina permanece accesible',async()=>{
    for(const [name,email,password,allowed] of [['manager','gerente@local.test','Gerente2026!',['','tables','menu','networks','buttons','reports','kitchen']],['staff','garcom@local.test','Garcom2026!',['','kitchen']]]){
      const ctx=await ownedContext(),page=await ctx.newPage();observe(page);await login(page,email,password);
      assert.deepEqual(await page.locator('#admin-navigation nav a').evaluateAll(elements=>elements.map(element=>element.getAttribute('href'))),allowed.map(routeUrl));
      assert.equal(await page.locator('#admin-navigation a[href="/dashboard/billing"]').count(),0,`${name}: enlace de funciones restringido`);
      await page.locator('#admin-navigation nav a[href="/dashboard/kitchen"]').click();await page.waitForURL(base+'/dashboard/kitchen');await page.locator('#admin-content h1').waitFor();
      assert.equal(await page.locator('#admin-navigation [aria-current="page"]').getAttribute('href'),'/dashboard/kitchen');
      await open('settings',page);await page.getByRole('heading',{name:'Acceso restringido',exact:true}).waitFor();
      await page.locator('.st-private-row button').click();await page.waitForURL(base+'/login');await page.getByRole('button',{name:'Entrar a mi cuenta',exact:true}).waitFor();await ctx.close();
    }
  });
  await check('Salir termina la sesión del propietario',async()=>{await open('menu');await admin.locator('.st-private-row button').click();await admin.waitForURL(base+'/login');await admin.getByRole('button',{name:'Entrar a mi cuenta',exact:true}).waitFor();});
  await check('Sin errores JavaScript en las rutas verificadas',async()=>assert.deepEqual(errors,[]));
}catch(error){results.push({name:'Preparación o ejecución',result:'failed',error:error.stack});console.error(error.stack);process.exitCode=1;if(admin&&!admin.isClosed())await admin.screenshot({path:path.join(out,'failure.png'),fullPage:true}).catch(()=>{});}
finally{
  await mkdir(out,{recursive:true});
  await writeFile(path.join(out,'geometry.json'),JSON.stringify(geometry,null,2));
  await writeFile(path.join(out,'results.json'),JSON.stringify({fixture:'SQLite temporal; servidor propio localhost; navegador aislado; solicitudes externas bloqueadas o simuladas; datos principales intactos',isolatedDatabase:true,results,errors,routes:routes.map(routeUrl),viewports,signatures,focusStyles},null,2));
  await browser?.close();await app?.close();
  assert.equal(path.dirname(path.resolve(directory)),path.resolve(os.tmpdir()));assert(path.basename(directory).startsWith('mate-sidebar-ui-'));
  await rm(directory,{recursive:true,force:true});
}
