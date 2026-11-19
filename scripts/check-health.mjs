const url=process.env.HEALTH_URL;
if(!url||!url.startsWith('https://'))throw new Error('Configura HEALTH_URL=https://tu-dominio/api/health');
const started=Date.now();
try{const response=await fetch(url,{signal:AbortSignal.timeout(10000)});const body=await response.json();if(!response.ok||body.ok!==true)throw new Error('Respuesta de salud no válida');console.log(JSON.stringify({event:'health_ok',latencyMs:Date.now()-started,time:new Date().toISOString()}));}
catch{console.error(JSON.stringify({event:'health_failed',time:new Date().toISOString()}));if(process.env.ALERT_WEBHOOK)await fetch(process.env.ALERT_WEBHOOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'AUnToque no supera el control de disponibilidad. Revisa el servidor.'}),signal:AbortSignal.timeout(10000)}).catch(()=>{});process.exitCode=1;}
