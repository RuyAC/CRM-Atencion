export const PUBLIC_IP_URL='https://api.ipify.org?format=json';

export function isPublicIPv4(value) {
  const parts=String(value||'').split('.');
  if(parts.length!==4||parts.some(part=>!/^\d{1,3}$/.test(part)||Number(part)>255))return false;
  const [a,b]=parts.map(Number);
  return a>0&&a<224&&a!==10&&a!==127&&!(a===169&&b===254)&&!(a===172&&b>=16&&b<=31)&&!(a===192&&b===168)&&!(a===100&&b>=64&&b<=127);
}

export async function detectPublicIp(signal,fetcher=fetch) {
  const response=await fetcher(PUBLIC_IP_URL,{signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw new Error('No se pudo consultar la IP pública. Vuelve a intentar o escríbela manualmente.');
  const result=await response.json();
  if(!isPublicIPv4(result.ip))throw new Error('La consulta no devolvió una IP pública válida. Vuelve a intentar.');
  return result.ip;
}

export function localCandidates(result) {
  const remote=String(result?.remoteIp||result?.ip||'').replace(/^::ffff:/i,''),loopback=remote==='::1'||/^127\./.test(remote);
  return (result?.addresses||[]).filter(item=>{
    if(item.virtual||!item.cidr)return false;
    if(loopback)return true;
    const [address,prefix]=item.cidr.split('/'),mask=(0xffffffff<<(32-Number(prefix)))>>>0;
    const number=ip=>/^\d+\.\d+\.\d+\.\d+$/.test(ip)?ip.split('.').reduce((n,v)=>(n*256+Number(v))>>>0,0):null;
    const client=number(remote),network=number(address);
    return client!==null&&network!==null&&((client&mask)>>>0)===((network&mask)>>>0);
  });
}
