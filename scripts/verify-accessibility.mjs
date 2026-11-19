import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ruyal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const browser=await chromium.launch({headless:true,channel:'msedge'}),page=await browser.newPage({viewport:{width:390,height:844}}),base=process.env.APP_URL||'http://127.0.0.1:3001';
const results=[];
try{
  await page.goto(base+'/dashboard');await page.getByLabel('Correo electrónico',{exact:true}).fill('ventas@matebar.com');await page.getByLabel('Contraseña',{exact:true}).fill('Chamaii2026!');await page.getByRole('button',{name:'Entrar a mi cuenta'}).click();await page.getByRole('heading',{name:'Panel principal',exact:true}).waitFor();
  const skip=page.locator('.a-skip');assert(await skip.evaluate(el=>el.getBoundingClientRect().bottom<=0));await skip.focus();assert(await skip.evaluate(el=>el.getBoundingClientRect().top>=0&&el.getBoundingClientRect().right<=innerWidth));results.push({name:'Enlace de salto oculto, visible completo al enfocar',result:'passed'});
  const menu=page.locator('.a-mobile-menu');assert(await page.locator('.a-sidebar').evaluate(el=>el.inert));await menu.focus();await page.keyboard.press('Enter');assert(await page.locator('.a-sidebar').evaluate(el=>!el.inert));
  for(let i=0;i<20;i++){assert(await page.evaluate(()=>!!document.activeElement.closest('.a-sidebar')));await page.keyboard.press('Tab');}
  await page.keyboard.press('Escape');assert(await menu.evaluate(el=>document.activeElement===el));assert(await page.locator('.a-sidebar').evaluate(el=>el.inert));results.push({name:'Navegación móvil aislada; Tab, Escape y retorno de foco',result:'passed'});
  await page.setViewportSize({width:1440,height:1000});assert(await page.locator('.a-sidebar').evaluate(el=>!el.inert));results.push({name:'Navegación de escritorio permanece accesible',result:'passed'});
  const contrasts=[];
  for(const route of ['','tables','menu']){await page.goto(base+'/dashboard'+(route?'/'+route:''));await page.locator('.a-page-heading h1').waitFor();const values=await page.evaluate(()=>{
    const parse=s=>s.match(/[\d.]+/g)?.map(Number)||[255,255,255],lum=rgb=>rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((s,v,i)=>s+v*[.2126,.7152,.0722][i],0);
    const samples=['.a-page-heading p','.a-stat p','.a-empty p','.a-footer','.a-status','.a-count','.a-search input'];return samples.flatMap(selector=>[...document.querySelectorAll(selector)].slice(0,8).map(el=>{const pseudo=selector==='.a-search input'?'::placeholder':undefined;const foreground=getComputedStyle(el,pseudo).color;let node=el,bg;while(node){const candidate=getComputedStyle(node).backgroundColor;const parts=parse(candidate);if(parts.length===3||parts[3]>0){bg=candidate;break;}node=node.parentElement;}bg||='rgb(255,255,255)';const a=lum(parse(foreground)),b=lum(parse(bg));return {selector,foreground,background:bg,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05)};}));
  });contrasts.push(...values);}
  for(const value of contrasts)assert(value.ratio>=4.5,`${value.selector}: ${value.ratio.toFixed(2)}:1`);results.push({name:'Textos secundarios, placeholders y estados revisados: contraste ≥ 4,5:1',result:'passed',samples:contrasts.length});
  await writeFile('.impeccable/review/accessibility-results.json',JSON.stringify({results,contrasts},null,2));console.log(results.map(r=>'PASS '+r.name).join('\n'));
}finally{await browser.close();}
