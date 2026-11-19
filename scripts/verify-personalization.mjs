import {createRequire} from 'node:module';
import {mkdtemp,mkdir,rm,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createApp} from '../server/index.mjs';

const require = createRequire(import.meta.url);
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/ruyal/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, '.impeccable/review/personalization');
const hashes = ['identidad','mensaje-mesa','tv-settings','seguridad','geofence','menu','horarios','cuenta-seguridad'];
const coverPresets = ['Restaurante moderno','Bistró y café','Bar y cervecería','Hamburguesería artesanal','Pizzería de horno'];
const logoPresets = ['Gastronomía','Burger y grill','Cafetería','Pizzería'];
const results = [], errors = [];
let app, browser, admin, customer, base;
const temporary = await mkdtemp(path.join(os.tmpdir(), 'mate-personalization-'));
const mediaDir = path.join(temporary,'media');
const dbPath = path.join(temporary,'personalization.sqlite');

async function check(name, callback) {
  await callback(); results.push({name,result:'passed'}); console.log('PASS '+name);
}
async function boot() {
  app = createApp({dbPath,mediaDir,host:'127.0.0.1',port:0});
  const address = await app.listen(); base = `http://127.0.0.1:${address.port}`;
}
function observe(page) {page.on('pageerror',error => errors.push(error.message));}
async function action(name,payload = {}) {
  return admin.evaluate(async ({name,payload}) => {
    const response = await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:name,payload})});
    return {status:response.status,body:await response.json()};
  },{name,payload});
}
async function state(page = admin,token = '') {
  return page.evaluate(async token => {
    const value = await (await fetch('/api/state'+(token?'?token='+encodeURIComponent(token):''))).json();
    return value.state || value;
  },token);
}
async function login() {
  await admin.goto(base+'/dashboard');
  if (await admin.getByRole('button',{name:'Entrar a mi cuenta',exact:true}).count()) {
    await admin.getByLabel('Correo electrónico',{exact:true}).fill('ventas@matebar.com');
    await admin.getByLabel('Contraseña',{exact:true}).fill('Chamaii2026!');
    await admin.getByRole('button',{name:'Entrar a mi cuenta',exact:true}).click();
  }
  await admin.getByRole('heading',{name:'Panel principal',exact:true}).waitFor({timeout:10000});
}
async function settings() {
  await admin.goto(base+'/dashboard/settings');
  await admin.getByRole('heading',{name:'Configuración del establecimiento',exact:true}).waitFor();
}
async function saveUI() {
  await admin.getByRole('button',{name:'Guardar cambios',exact:true}).first().click();
  await admin.getByText('Configuración guardada.',{exact:true}).waitFor();
}
async function noOverflow(page,label) {
  const metrics = await page.evaluate(() => ({width:innerWidth,scrollWidth:document.documentElement.scrollWidth}));
  assert(metrics.scrollWidth <= metrics.width + 1,`${label}: ${JSON.stringify(metrics)}`);
}
const desired = {
  restaurant:{name:'Mate bar · Verificación',primaryColor:'#0f766e',coverUrl:'/uploads/verificacion-portada.svg',logoUrl:'/uploads/verificacion-logo.svg'},
  settings:{welcomeTitle:'Bienvenido a nuestra mesa',welcomeSubtitle:'Consulta el menú y llama a nuestro equipo cuando lo necesites.'},
};

try {
  await access(path.join(root,'dist/index.html'));
  await mkdir(out,{recursive:true}); await mkdir(mediaDir,{recursive:true});
  await writeFile(path.join(mediaDir,'verificacion-logo.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120"><rect width="120" height="120" rx="24" fill="#0f766e"/><text x="60" y="78" text-anchor="middle" fill="white" font-family="sans-serif" font-size="64">M</text></svg>');
  await writeFile(path.join(mediaDir,'verificacion-portada.svg'),'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300"><rect width="1200" height="300" fill="#0f766e"/><rect x="700" width="500" height="300" fill="#134e4a"/></svg>');
  await boot();
  browser = await chromium.launch({headless:true,channel:'msedge'});
  const adminContext = await browser.newContext({viewport:{width:1440,height:1000}});
  const customerContext = await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  admin = await adminContext.newPage(); customer = await customerContext.newPage(); observe(admin); observe(customer);
  await login();

  await check('API: persiste identidad, color, imágenes y bienvenida en una base aislada',async () => {
    const result = await action('settings.save',desired); assert.equal(result.status,200,JSON.stringify(result.body));
    const saved = await state();
    for (const [key,value] of Object.entries(desired.restaurant)) assert.equal(saved.restaurant[key],value,key);
    for (const [key,value] of Object.entries(desired.settings)) assert.equal(saved.settings[key],value,key);
  });
  await check('API: textos de bienvenida respetan los límites 60 y 180',async () => {
    for (const [field,limit] of [['welcomeTitle',60],['welcomeSubtitle',180]]) {
      const result = await action('settings.save',{settings:{[field]:'X'.repeat(limit+1)}});
      if (result.status === 200) assert((await state()).settings[field].length<=limit,`${field}: el servidor excede ${limit}`);
      else assert(result.status>=400 && result.status<500,JSON.stringify(result.body));
    }
    assert.equal((await action('settings.save',desired)).status,200);
  });
  await check('API: rechaza color y enlaces inválidos sin alterar la identidad',async () => {
    for (const restaurant of [{primaryColor:'azul'},{logoUrl:'javascript:alert(1)'},{coverUrl:'data:text/html,prueba'}]) {
      const result = await action('settings.save',{restaurant}); assert.equal(result.status,400,JSON.stringify(result.body));
    }
    const saved = await state(); assert.equal(saved.restaurant.primaryColor,desired.restaurant.primaryColor);assert.equal(saved.restaurant.logoUrl,desired.restaurant.logoUrl);
  });
  await settings();
  await check('Configuración continua: todas las secciones y enlaces están presentes',async () => {
    for (const id of hashes) {
      assert.equal(await admin.locator(`#${id}`).count(),1,`Falta #${id}`);
      assert.equal(await admin.locator(`a[href="#${id}"]`).count(),1,`Falta el enlace #${id}`);
      assert(await admin.locator(`#${id}`).isVisible(),`La sección #${id} está oculta`);
    }
    for (const label of ['Nombre del establecimiento','Código del color','URL de portada','URL del logotipo','Título principal de bienvenida','Subtítulo']) await admin.getByLabel(label,{exact:true}).waitFor();
    assert.equal(await admin.getByLabel('Título principal de bienvenida',{exact:true}).getAttribute('maxlength'),'60');
    assert.equal(await admin.getByLabel('Subtítulo',{exact:true}).getAttribute('maxlength'),'180');
  });
  await check('Presets de portada y logotipo cambian la imagen seleccionada',async () => {
    for (const [names,label] of [[coverPresets,'URL de portada'],[logoPresets,'URL del logotipo']]) {
      const choices = new Set();
      for (const name of names) {
        const choice = admin.getByRole('button',{name,exact:true});
        await choice.waitFor(); await choice.click();
        const value = await admin.getByLabel(label,{exact:true}).inputValue();
        assert(value && /^https?:\/\/|^\/(?:assets|uploads)\//.test(value),`${name}: ${value}`); choices.add(value);
      }
      assert.equal(choices.size,names.length,'Los presets deben seleccionar imágenes diferentes');
    }
  });
  await check('Formulario: guardar y recargar conserva los seis campos de personalización',async () => {
    for (const [label,value] of [
      ['Nombre del establecimiento',desired.restaurant.name],['Código del color',desired.restaurant.primaryColor],
      ['URL de portada',desired.restaurant.coverUrl],['URL del logotipo',desired.restaurant.logoUrl],
      ['Título principal de bienvenida',desired.settings.welcomeTitle],['Subtítulo',desired.settings.welcomeSubtitle],
    ]) await admin.getByLabel(label,{exact:true}).fill(value);
    await saveUI(); await admin.reload(); await admin.getByLabel('Nombre del establecimiento',{exact:true}).waitFor();
    const saved = await state();
    for (const [key,value] of Object.entries(desired.restaurant)) assert.equal(saved.restaurant[key],value);
    for (const [key,value] of Object.entries(desired.settings)) assert.equal(saved.settings[key],value);
    assert.equal(await admin.getByLabel('Nombre del establecimiento',{exact:true}).inputValue(),desired.restaurant.name);
  });
  await check('Cliente refleja nombre, portada, logo, color y textos guardados',async () => {
    await customer.goto(base+'/r/mate-bar/t/table-05');
    await customer.getByRole('heading',{name:desired.restaurant.name,exact:true}).waitFor();
    await customer.getByRole('heading',{name:desired.settings.welcomeTitle,exact:true}).waitFor();
    await customer.getByText(desired.settings.welcomeSubtitle,{exact:true}).waitFor();
    assert.equal(await customer.locator('.client-page').evaluate(el => getComputedStyle(el).getPropertyValue('--client-primary').trim()),desired.restaurant.primaryColor);
    assert.equal(await customer.locator('.client-cover img').getAttribute('src'),desired.restaurant.coverUrl);
    assert.equal(await customer.locator('.client-restaurant-mark img').getAttribute('src'),desired.restaurant.logoUrl);
    await customer.waitForFunction(() => [...document.querySelectorAll('.client-cover img,.client-restaurant-mark img')].every(image => image.complete && image.naturalWidth>0));
    const publicState = await state(customer,'table-05'); assert.equal(publicState.restaurant.name,desired.restaurant.name);
    assert.equal((await action('settings.save',{restaurant:{logoUrl:'/assets/logo-inexistente.svg'}})).status,200);await customer.waitForFunction(()=>document.querySelector('.client-restaurant-mark')?.textContent.trim()==='M');assert.equal((await action('settings.save',desired)).status,200);await customer.locator('.client-restaurant-mark img').waitFor();
  });
  await check('Sincronización: cliente abierto recibe cambios de personalización',async () => {
    const title = 'Nuestro equipo está listo para ayudarte';
    assert.equal((await action('settings.save',{settings:{welcomeTitle:title}})).status,200);
    await customer.getByRole('heading',{name:title,exact:true}).waitFor({timeout:5000});
    assert.equal((await action('settings.save',desired)).status,200);
    await customer.getByRole('heading',{name:desired.settings.welcomeTitle,exact:true}).waitFor({timeout:5000});
  });
  await check('Responsive: configuración continua y cliente en 390, 768 y 1440 px',async () => {
    for (const width of [390,768,1440]) {
      await admin.setViewportSize({width,height:900});await customer.setViewportSize({width,height:900});
      await settings(); await noOverflow(admin,`Configuración ${width}`);await noOverflow(customer,`Cliente ${width}`);
      for (const id of hashes) assert(await admin.locator(`#${id}`).isVisible(),`Sección oculta ${width} #${id}`);
      await admin.screenshot({path:path.join(out,`settings-${width}.png`),fullPage:true});
      await customer.screenshot({path:path.join(out,`client-${width}.png`),fullPage:true});
    }
  });
  await check('Teclado: enlaces de sección, campos y presets son accesibles',async () => {
    for (const id of hashes) {
      const link = admin.locator(`a[href="#${id}"]`);await link.focus();await admin.keyboard.press('Enter');
      assert.equal(new URL(admin.url()).hash,`#${id}`);
      assert(await admin.locator(`#${id}`).isVisible());
    }
    const title = admin.getByLabel('Título principal de bienvenida',{exact:true});await title.focus();
    assert(await title.evaluate(el => document.activeElement===el));await admin.keyboard.press('Tab');
    assert(await admin.evaluate(() => document.activeElement!==document.body));
    const preset = admin.getByRole('button',{name:coverPresets[0],exact:true});await preset.focus();await admin.keyboard.press('Enter');
    assert.notEqual(await admin.getByLabel('URL de portada',{exact:true}).inputValue(),desired.restaurant.coverUrl);
    assert(await preset.evaluate(el => getComputedStyle(el).outlineStyle!=='none'),'El foco de teclado debe ser visible');
    await action('settings.save',desired);
  });
  await check('Persistencia real después de reiniciar el servidor aislado',async () => {
    await adminContext.close();await customerContext.close();await app.close();await boot();
    const response = await fetch(base+'/api/state?token=table-05');const saved = await response.json();
    for (const [key,value] of Object.entries(desired.restaurant)) assert.equal(saved.restaurant[key],value);
    for (const [key,value] of Object.entries(desired.settings)) assert.equal(saved.settings[key],value);
  });
  assert.deepEqual(errors,[],'Errores del navegador');
  await writeFile(path.join(out,'results.json'),JSON.stringify({results,errors,isolatedDatabase:true,viewports:[390,768,1440]},null,2));
} catch (error) {
  await mkdir(out,{recursive:true});
  await writeFile(path.join(out,'results.json'),JSON.stringify({results,errors,failure:error.message,isolatedDatabase:true},null,2));
  if (admin && !admin.isClosed()) await admin.screenshot({path:path.join(out,'failure-admin.png'),fullPage:true}).catch(()=>{});
  throw error;
} finally {
  await browser?.close();await app?.close();
  assert.equal(path.dirname(path.resolve(temporary)),path.resolve(os.tmpdir()),'La limpieza debe permanecer en la carpeta temporal');
  assert(path.basename(temporary).startsWith('mate-personalization-'),'Solo se elimina la carpeta aislada de esta verificación');
  await rm(temporary,{recursive:true,force:true});
}
