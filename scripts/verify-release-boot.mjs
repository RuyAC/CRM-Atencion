import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {verifyRelease} from './release.mjs';

const destination=path.resolve(process.argv[2]||'');
assert(process.argv[2],'Indica la carpeta de entrega.');
verifyRelease(destination);
assert(!existsSync(path.join(destination,'dist','uploads')));
const dir=mkdtempSync(path.join(os.tmpdir(),'atencion-release-boot-'));
let app;
try {
  const {createApp}=await import(pathToFileURL(path.join(destination,'server','index.mjs')));
  app=createApp({dbPath:path.join(dir,'platform.sqlite'),mediaDir:path.join(dir,'uploads'),port:0,host:'127.0.0.1'});
  const address=await app.listen(),base=`http://127.0.0.1:${address.port}`;
  for(const route of ['/api/health','/','/saas/security','/saas/finance','/icon.svg']){
    const response=await fetch(base+route);assert.equal(response.status,200,route);
    if(route==='/api/health')assert.equal((await response.json()).ok,true);
    else assert((await response.text()).length>0);
  }
  verifyRelease(destination);
  console.log('Entrega verificada: arranque, health, páginas y recurso estático; datos temporales aislados.');
} finally {
  await app?.close();
  assert.equal(path.dirname(dir),os.tmpdir());
  assert(path.basename(dir).startsWith('atencion-release-boot-'));
  rmSync(dir,{recursive:true,force:true});
}
