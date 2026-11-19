import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {diskStatus} from '../server/maintenance.mjs';
export async function probe({env=process.env,fetcher=fetch,disk=diskStatus,now=Date.now()}={}){
 const alerts=[];let url;try{url=new URL(env.HEALTH_URL||`${env.ATENCION_PUBLIC_ORIGIN}/api/health`);if(url.protocol!=='https:')throw Error();}catch{throw new Error('Configura un HEALTH_URL HTTPS válido.');}
 const started=Date.now();try{const response=await fetcher(url,{signal:AbortSignal.timeout(10000)});const body=await response.json();if(!response.ok||body.ok!==true)throw Error();}catch{alerts.push('El servicio no responde correctamente.');}
 for(const [label,root]of [['archivos',env.MEDIA_DIR],['respaldos',env.BACKUP_DIR]])if(root){const status=disk(root);if(!status)alerts.push(`No se puede consultar el disco de ${label}.`);else if(status.freeBytes<Number(env.MIN_FREE_BYTES||1024**3)||status.freeBytes/status.totalBytes<.1)alerts.push(`Espacio insuficiente en el disco de ${label}.`);}
 if(env.BACKUP_DIR){let latest=0;try{for(const item of readdirSync(env.BACKUP_DIR,{withFileTypes:true})){if(!item.isDirectory()||item.isSymbolicLink()||item.name.endsWith('.partial'))continue;try{const manifest=JSON.parse(readFileSync(path.join(env.BACKUP_DIR,item.name,'manifest.json'),'utf8'));if(manifest.format==='auntoque-full-v1')latest=Math.max(latest,Date.parse(manifest.createdAt)||0);}catch{}}}catch{}if(!latest||now-latest>Number(env.MAX_BACKUP_AGE_HOURS||30)*3600000)alerts.push('No hay un respaldo local reciente.');}
 if(env.OFFSITE_STATUS_FILE){let at=0;try{at=Number(readFileSync(env.OFFSITE_STATUS_FILE,'utf8').trim())*1000;}catch{}if(!at||now-at>Number(env.MAX_OFFSITE_AGE_HOURS||8)*3600000)alerts.push('La copia externa no registra una ejecución reciente.');}
 return {ok:!alerts.length,alerts,latencyMs:Date.now()-started,time:new Date(now).toISOString()};
}
export async function notifyProbe(result,{webhook,fetcher=fetch}={}){if(!webhook)return;const url=new URL(webhook);if(url.protocol!=='https:')throw new Error('ALERT_WEBHOOK requiere HTTPS.');const r=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:result.ok?'AUnToque: servicio recuperado.':`AUnToque: ${result.alerts.join(' ')}`}),signal:AbortSignal.timeout(10000)});if(!r.ok)throw new Error('No se pudo entregar la alerta.');}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 let previous='';const loop=process.argv.includes('--loop');
 do{try{const result=await probe();console.log(JSON.stringify({event:'monitor',...result}));const signature=result.alerts.join('|');if(signature!==previous){await notifyProbe(result,{webhook:process.env.ALERT_WEBHOOK});previous=signature;}if(!loop&&!result.ok)process.exitCode=1;}catch{console.error(JSON.stringify({event:'monitor_error',time:new Date().toISOString()}));if(!loop)process.exitCode=1;}if(loop)await new Promise(r=>setTimeout(r,Math.max(30,Number(process.env.MONITOR_INTERVAL_SECONDS)||60)*1000));}while(loop);
}
