import {mkdir,writeFile,access} from 'node:fs/promises';
import {entities} from '../server/seed.mjs';
await mkdir('public/assets',{recursive:true});
const provenance=[];
await Promise.all(entities.products.map(async(product)=>{
  if(!product.imageUrl.startsWith('https://'))return;
  const source=product.id==='produto-4'?entities.products.find(p=>p.id==='produto-5').imageUrl:product.imageUrl;
  const file=`public/assets/${product.id}.jpg`;
  provenance.push({file,origin:source,purpose:'Fotografía de demostración del menú; sustituible por contenido del restaurante.'});
  try{await access(file);return;}catch{}
  const response=await fetch(source);
  if(!response.ok)throw new Error(`${product.name}: ${response.status}`);
  await writeFile(file,new Uint8Array(await response.arrayBuffer()));
  console.log(file);
}));
await writeFile('public/assets/provenance.json',JSON.stringify(provenance,null,2));
