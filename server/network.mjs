import net from 'node:net';
import os from 'node:os';

export const normalizeIp = value => String(value || '').replace(/^::ffff:/i, '');
export const isLoopback = value => normalizeIp(value) === '::1' || /^127\./.test(normalizeIp(value));
const ipv4Number = value => net.isIPv4(value) ? value.split('.').reduce((result,part)=>(result*256+Number(part))>>>0,0) : null;
const privateAddress = value => /^10\./.test(value)||/^192\.168\./.test(value)||/^172\.(1[6-9]|2\d|3[01])\./.test(value);

export function parseLocalCidr(value) {
  const [address,rawPrefix,...extra]=String(value||'').split('/');
  const number=ipv4Number(address),prefix=Number(rawPrefix);
  if(extra.length||number===null||!/^\d{1,2}$/.test(rawPrefix||'')||prefix<16||prefix>30||!privateAddress(address))return null;
  const mask=(0xffffffff << (32-prefix))>>>0,network=(number&mask)>>>0;
  const canonical=[24,16,8,0].map(shift=>(network>>>shift)&255).join('.')+'/'+prefix;
  return {address,number,prefix,mask,network,cidr:canonical};
}
export function matchesLocalCidr(ip,cidr) {
  const range=parseLocalCidr(cidr),number=ipv4Number(normalizeIp(ip));
  return range!==null&&number!==null&&((number&range.mask)>>>0)===range.network;
}
export function networkAllowsIp(network,ip) {
  if(network.active===false)return false;
  const current=normalizeIp(ip),saved=normalizeIp(network.ip);
  return saved===current||(isLoopback(saved)&&isLoopback(current))||Boolean(network.localCidr&&matchesLocalCidr(current,network.localCidr));
}
export function localInterfaces(interfaces=os.networkInterfaces()) {
  return Object.entries(interfaces).flatMap(([name,entries])=>(entries||[]).filter(item=>item.family==='IPv4'&&!item.internal).map(item=>{
    const subnet=parseLocalCidr(item.cidr);
    const virtual=/vethernet|wsl|docker|virtual|vmware|hyper-v|loopback|tun|tap|vpn|tailscale|zerotier|wireguard|nordlynx|warp/i.test(name);
    return {name,address:item.address,netmask:item.netmask,cidr:subnet?.cidr||'',virtual};
  }));
}
export function canRegisterLocalCidr(cidr,clientIp,interfaces=localInterfaces()) {
  const range=parseLocalCidr(cidr);
  if(!range||range.cidr!==cidr)return false;
  return interfaces.some(item=>!item.virtual&&item.cidr===range.cidr)&&(isLoopback(clientIp)||matchesLocalCidr(clientIp,range.cidr));
}
