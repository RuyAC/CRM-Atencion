import {createRequire} from 'node:module';
import {mkdir, mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';
import {validVideo} from '../server/media-validation.mjs';

const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/ruyal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.resolve('.impeccable/review/product-editor');
const temporary=await mkdtemp(path.join(os.tmpdir(),'atencion-product-editor-'));
await mkdir(out,{recursive:true});
const results=[],errors=[],geometry=[];
let app,browser,base,ctx,page;
async function check(name,run){try{await run();results.push({name,result:'passed'});console.log('PASS '+name);}catch(error){results.push({name,result:'failed',error:error.message});process.exitCode=1;throw error;}}
async function action(action,payload={}){const response=await ctx.request.post(base+'/api/action',{data:{action,payload}});assert.equal(response.status(),200,await response.text());const body=await response.json();return body.result??body;}
async function state(){return (await ctx.request.get(base+'/api/state')).json();}
async function shot(name){
  const measures=await page.evaluate(()=>{
    const dialog=document.querySelector('dialog[open],[role="dialog"]');const rect=dialog.getBoundingClientRect();
    const overflowing=[dialog,...dialog.querySelectorAll('*')].filter(el=>el.clientWidth>0&&el.scrollWidth>el.clientWidth+2&&getComputedStyle(el).overflowX==='visible').map(el=>el.className);
    return {width:innerWidth,height:innerHeight,overflow:Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)>innerWidth+1,dialog:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},overflowing};
  });
  assert.equal(measures.overflow,false);assert.deepEqual(measures.overflowing,[]);geometry.push({name,...measures});
  await page.screenshot({path:path.join(out,name+'.png')});
}
const dialog=()=>page.getByRole('dialog');
const field=name=>dialog().getByLabel(name,{exact:true});
async function openEdit(){await page.getByRole('button',{name:'Editar PRUEBA',exact:true}).click();await dialog().waitFor();}
async function switchMedia(label){await dialog().getByText(label,{exact:true}).click();}
try{
  app=createApp({dbPath:path.join(temporary,'primary.sqlite'),mediaDir:path.join(temporary,'uploads'),host:'127.0.0.1',port:0});
  const address=await app.listen();base=`http://127.0.0.1:${address.port}`;
  browser=await chromium.launch({headless:true,channel:'msedge'});
  ctx=await browser.newContext({viewport:{width:1119,height:841},reducedMotion:'reduce',serviceWorkers:'block'});
  await ctx.route('**/*',route=>new URL(route.request().url()).origin===base?route.continue():route.abort('blockedbyclient'));
  page=await ctx.newPage();page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  await action('auth.login',{email:'ventas@matebar.com',password:'Chamaii2026!'});
  const initial=await state(),product=initial.products.find(item=>item.id==='produto-2')||initial.products[0];
  await action('entity.save',{entity:'products',item:{...product,name:'PRUEBA',price:2500,promoPrice:2000,description:'Plato de prueba funcional. No disponible para consumo.',tags:['Vegetariano'],featured:false,available:false,videoUrl:''}});
  await page.goto(base+'/dashboard/menu');await page.getByRole('heading',{name:'Menú digital',exact:true}).waitFor();
  await check('Nuevo producto abre el formulario vacío y Escape devuelve el foco',async()=>{
    const trigger=page.getByRole('button',{name:'Nuevo producto',exact:true});await trigger.click();await dialog().waitFor();
    assert.equal(await field('Nombre del producto').inputValue(),'');await shot('new-product-desktop');
    await page.keyboard.press('Escape');await dialog().waitFor({state:'hidden'});assert.equal(await trigger.evaluate(el=>el===document.activeElement),true);
  });
  await check('Editor reproduce foto, video y barra fija sin desborde en escritorio y móvil',async()=>{
    await openEdit();
    for(const [width,height]of [[1119,841],[1440,1000],[768,900],[390,844],[320,740]]){
      await page.setViewportSize({width,height});
      if(width<800){await field('Nombre del producto').scrollIntoViewIfNeeded();await shot(`details-${width}`);}
      await switchMedia('Foto vertical');await shot(`photo-${width}`);
      await switchMedia('Video Reels');await shot(`video-${width}`);
    }
    await page.setViewportSize({width:1119,height:841});await switchMedia('Foto vertical');
  });
  await check('Precios y descripción actualizan descuento, ahorro y vista previa',async()=>{
    assert.equal(await field('Precio normal (Bs)').inputValue(),'25');assert.equal(await field('Precio promocional (opcional)').inputValue(),'20');
    assert.match(await dialog().innerText(),/20% de descuento/);await field('Precio normal (Bs)').fill('30');await field('Precio promocional (opcional)').fill('15');
    assert.match(await dialog().innerText(),/50% de descuento/);await field('Descripción detallada del plato').fill('Descripción actualizada de prueba.');
  });
  await check('Etiquetas, Enter y destacado se pueden añadir y quitar sin enviar el formulario',async()=>{
    await dialog().getByRole('button',{name:'Picante',exact:true}).click();await field('Etiqueta personalizada').fill('Sin lactosa');await field('Etiqueta personalizada').press('Enter');
    await dialog().getByRole('button',{name:'Quitar Sin lactosa',exact:true}).waitFor();assert.equal(await dialog().count(),1);
    await dialog().getByRole('button',{name:'Quitar Sin lactosa',exact:true}).click();await field('Etiqueta personalizada').fill('Del chef');await dialog().getByRole('button',{name:'Agregar',exact:true}).click();
    await field('Producto destacado en el menú').check();
  });
  await check('Una promoción inválida mantiene el formulario y permite corregir el precio',async()=>{
    await field('Precio promocional (opcional)').fill('35');await dialog().getByRole('button',{name:'Guardar cambios',exact:true}).click();
    await dialog().getByRole('alert').waitFor();assert.equal(await field('Nombre del producto').inputValue(),'PRUEBA');await field('Precio promocional (opcional)').fill('15');
  });
  await check('Consejos de medios se despliegan y las pestañas conservan sus enlaces',async()=>{
    await switchMedia('Video Reels');const help=dialog().getByRole('button',{name:/Consejos para subir el video vertical/});await help.click();assert.equal(await help.getAttribute('aria-expanded'),'false');await help.click();assert.equal(await help.getAttribute('aria-expanded'),'true');
    await field('Enlace del video').fill('/assets/editor-test.webm');await switchMedia('Foto vertical');assert.equal(await field('Enlace de la foto').inputValue(),product.imageUrl);await switchMedia('Video Reels');assert.equal(await field('Enlace del video').inputValue(),'/assets/editor-test.webm');await field('Enlace del video').fill('');
  });
  await check('Subida real de imagen y video muestra vista previa y rechaza archivos grandes',async()=>{
    await switchMedia('Foto vertical');
    const file=dialog().locator('input[type="file"]');
    await file.setInputFiles({name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(5*1024*1024+1)});
    await dialog().getByRole('alert').waitFor();
    const photo=await readFile('public/assets/produto-1.jpg');
    await file.setInputFiles({name:'plato.jpg',mimeType:'image/jpeg',buffer:photo});
    await page.waitForFunction(()=>document.querySelector('input[aria-label="Enlace de la foto"]')?.value.startsWith('/uploads/'));
    await switchMedia('Video Reels');
    const videoBase64=await page.evaluate(async()=>{
      const canvas=document.createElement('canvas');canvas.width=90;canvas.height=160;const paint=canvas.getContext('2d');paint.fillStyle='#f50046';paint.fillRect(0,0,90,160);
      const stream=canvas.captureStream(10),chunks=[],recorder=new MediaRecorder(stream,{mimeType:'video/webm'});
      const ended=new Promise(resolve=>{recorder.ondataavailable=event=>chunks.push(event.data);recorder.onstop=resolve;});recorder.start();for(let frame=0;frame<5;frame++){paint.fillStyle=frame%2?'#f50046':'#d5003d';paint.fillRect(0,0,90,160);stream.getVideoTracks()[0].requestFrame?.();await new Promise(resolve=>setTimeout(resolve,70));}recorder.stop();await ended;stream.getTracks().forEach(track=>track.stop());
      const bytes=new Uint8Array(await new Blob(chunks,{type:'video/webm'}).arrayBuffer());let data='';for(const byte of bytes)data+=String.fromCharCode(byte);return btoa(data);
    });
    const videoBytes=Buffer.from(videoBase64,'base64');
    assert(validVideo(videoBytes,'video/webm'),`Recorded WebM invalid: ${videoBytes.length} bytes, header ${videoBytes.subarray(0,48).toString('hex')}`);
    const uploaded=page.waitForResponse(response=>response.url().endsWith('/api/action')&&response.request().postData()?.includes('upload.create'));
    await dialog().locator('input[type="file"]').setInputFiles({name:'test.webm',mimeType:'video/webm',buffer:videoBytes});
    const uploadResponse=await uploaded;assert.equal(uploadResponse.status(),200,await uploadResponse.text());
    await page.waitForFunction(()=>document.querySelector('input[aria-label="Enlace del video"]')?.value.startsWith('/uploads/'));
    await dialog().locator('video').waitFor();
  });
  await check('Guardar persiste valores, medios, etiquetas y la disponibilidad previa',async()=>{
    await dialog().getByRole('button',{name:'Guardar cambios',exact:true}).click();await dialog().waitFor({state:'hidden'});
    const saved=(await state()).products.find(item=>item.id===product.id);assert.equal(saved.price,3000);assert.equal(saved.promoPrice,1500);assert.equal(saved.featured,true);assert.equal(saved.available,false);assert.deepEqual(saved.tags,['Vegetariano','Picante','Del chef']);assert(saved.imageUrl.startsWith('/uploads/'));assert(saved.videoUrl.startsWith('/uploads/'));
    await openEdit();assert.equal(await field('Precio normal (Bs)').inputValue(),'30');await page.keyboard.press('Escape');
  });
  await check('Crear un producto nuevo lo guarda con la moneda y categoría del restaurante',async()=>{
    await page.getByRole('button',{name:'Nuevo producto',exact:true}).click();await dialog().waitFor();await field('Nombre del producto').fill('Producto nuevo UI');await field('Precio normal (Bs)').fill('12.50');
    await dialog().getByRole('button',{name:'Guardar producto',exact:true}).click();await dialog().waitFor({state:'hidden'});
    const saved=(await state()).products.find(item=>item.name==='Producto nuevo UI');assert.equal(saved.price,1250);assert.equal(saved.available,true);assert(saved.categoryId);
  });
  await check('Foco contenido, movimiento reducido y cero excepciones JavaScript',async()=>{
    await openEdit();const close=dialog().getByRole('button',{name:/Cerrar/});await close.focus();await page.keyboard.press('Shift+Tab');assert.equal(await dialog().evaluate(el=>el.contains(document.activeElement)),true);
    const motion=await dialog().evaluate(el=>getComputedStyle(el).animationDuration);assert.equal(motion,'0s');assert.deepEqual(errors,[]);
  });
}catch(error){console.error(error.stack);process.exitCode=1;}
finally{
  await writeFile(path.join(out,'results.json'),JSON.stringify({fixture:'SQLite, medios y navegador aislados; solicitudes externas bloqueadas; Mate bar principal intacto',results,errors,geometry},null,2));
  await browser?.close();await app?.close();assert.equal(path.dirname(path.resolve(temporary)),path.resolve(os.tmpdir()));assert(path.basename(temporary).startsWith('atencion-product-editor-'));await rm(temporary,{recursive:true,force:true});
}
