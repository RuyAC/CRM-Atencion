import {existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawn} from 'node:child_process';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
process.chdir(root);
if(Number(process.versions.node.split('.')[0])<24){console.error('Atencion necesita Node.js 24 o superior. Instala la versión LTS desde https://nodejs.org.');process.exit(1);}
const port=Number(process.env.PORT)||3001;
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('El puerto configurado no es válido.');
const url=`http://localhost:${port}`;
function open(){if(process.env.NO_BROWSER==='1')return;const child=process.platform==='win32'?spawn('cmd.exe',['/c','start','',url+'/dashboard'],{stdio:'ignore',windowsHide:true}):spawn(process.platform==='darwin'?'open':'xdg-open',[url+'/dashboard'],{stdio:'ignore'});child.on('error',()=>{});child.unref();}
try{const response=await fetch(url+'/api/state',{signal:AbortSignal.timeout(1200)});const state=await response.json();if(state.restaurant?.id){console.log(`Atencion ya está abierto: ${url}/dashboard`);open();process.exit(0);}}catch{}
if(!existsSync('node_modules/vite/bin/vite.js')){console.error('Faltan dependencias. Ejecuta npm install en esta carpeta antes de iniciar.');process.exit(1);}
if(!existsSync('dist/index.html')){console.log('Preparando la aplicación por primera vez…');await new Promise((resolve,reject)=>{const child=spawn(process.execPath,['node_modules/vite/bin/vite.js','build'],{cwd:root,stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error('No se pudo preparar la aplicación.')));});}
const {createApp}=await import('../server/index.mjs');
const app=createApp({port,host:'0.0.0.0',dbPath:process.env.DB_PATH||undefined});
try{await app.listen();}catch(error){await app.close();console.error(error.code==='EADDRINUSE'?`Otra aplicación está usando el puerto ${port}. Cierra esa aplicación o configura otro puerto.`:error.message);process.exit(1);}
console.log(`\nAtencion: ${url}/dashboard\nMantén esta ventana abierta durante el servicio. Ctrl+C detiene la aplicación.\n`);
open();
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exit(0);});
