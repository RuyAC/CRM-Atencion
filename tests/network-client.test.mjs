import test from 'node:test';
import assert from 'node:assert/strict';
import {PUBLIC_IP_URL,isPublicIPv4,detectPublicIp,localCandidates} from '../src/network-client.js';

const physical = {name:'Wi-Fi',address:'192.168.50.10',cidr:'192.168.50.0/24',virtual:false};
const secondPhysical = {name:'Ethernet',address:'10.20.30.40',cidr:'10.20.30.0/24',virtual:false};
const virtual = {name:'vEthernet (WSL)',address:'172.25.208.1',cidr:'172.25.208.0/20',virtual:true};

test('public IP detection accepts real internet IPv4 addresses and rejects local or malformed results',() => {
  for (const ip of ['8.8.8.8','1.1.1.1','9.9.9.9','190.10.20.30']) assert.equal(isPublicIPv4(ip),true,ip);
  for (const ip of ['',null,'bad','8.8.8','8.8.8.8.8','256.8.8.8','8.8.8.-1','::1','::ffff:8.8.8.8','0.0.0.0','10.1.2.3','127.0.0.1','169.254.1.1','172.16.0.1','172.31.255.255','192.168.0.1','100.64.0.1','100.127.255.254','224.0.0.1','255.255.255.255']) assert.equal(isPublicIPv4(ip),false,String(ip));
});

test('public lookup omits cookies and referrer and forwards the caller abort signal',async () => {
  const controller = new AbortController();let invocation;
  const ip = await detectPublicIp(controller.signal,async (url,options) => {invocation={url,options};return {ok:true,json:async () => ({ip:'8.8.8.8'})};});
  assert.equal(ip,'8.8.8.8');assert.equal(invocation.url,PUBLIC_IP_URL);
  assert.equal(invocation.options.signal,controller.signal);assert.equal(invocation.options.credentials,'omit');
  assert.equal(invocation.options.referrerPolicy,'no-referrer');assert.equal(invocation.options.cache,'no-store');
});

test('a failed public lookup can be retried without preserving the previous failure',async () => {
  await assert.rejects(detectPublicIp(undefined,async () => ({ok:false,status:503,json:async () => ({})})),/IP pública/i);
  assert.equal(await detectPublicIp(undefined,async () => ({ok:true,json:async () => ({ip:'8.8.8.8'})})),'8.8.8.8');
});

test('lookup rejects invalid provider responses and propagates connection failures',async () => {
  for (const body of [{},{ip:'192.168.1.10'},{ip:'127.0.0.1'},{ip:'999.1.1.1'}]) await assert.rejects(detectPublicIp(undefined,async () => ({ok:true,json:async () => body})),/IP pública válida/i);
  await assert.rejects(detectPublicIp(undefined,async () => {throw new TypeError('Failed to fetch');}),/Failed to fetch/);
  await assert.rejects(detectPublicIp(undefined,async () => ({ok:true,json:async () => {throw new SyntaxError('Invalid JSON');}})),/Invalid JSON/);
});

test('an in-progress lookup terminates when its caller aborts',async () => {
  const controller = new AbortController();let started;
  const ready = new Promise(resolve => {started=resolve;});
  const lookup = detectPublicIp(controller.signal,async (_url,{signal}) => new Promise((_resolve,reject) => {
    signal.addEventListener('abort',() => reject(new DOMException('Aborted','AbortError')),{once:true});started();
  }));
  await ready;controller.abort();await assert.rejects(lookup,{name:'AbortError'});
});

test('local selection on the server filters WSL, VPN and adapters with no compatible subnet',() => {
  const candidates = localCandidates({remoteIp:'127.0.0.1',addresses:[physical,secondPhysical,virtual,{name:'VPN',cidr:'10.1.0.0/16',virtual:true},{name:'No CIDR',address:'169.254.1.1',cidr:'',virtual:false}]});
  assert.deepEqual(candidates,[physical,secondPhysical]);
  for (const remoteIp of ['::1','::ffff:127.0.0.1','::FFFF:127.0.0.1']) assert.deepEqual(localCandidates({remoteIp,addresses:[physical,virtual]}),[physical],remoteIp);
});

test('LAN clients can select only their physical subnet, including mapped IPv4 peers',() => {
  const addresses = [physical,secondPhysical,virtual];
  for (const remoteIp of ['192.168.50.21','192.168.50.22','::ffff:192.168.50.22','::FFFF:192.168.50.22']) assert.deepEqual(localCandidates({remoteIp,addresses}),[physical],remoteIp);
  assert.deepEqual(localCandidates({ip:'10.20.30.44',addresses}),[secondPhysical]);
  for (const remoteIp of ['192.168.51.21','8.8.8.8','not-an-ip']) assert.deepEqual(localCandidates({remoteIp,addresses}),[],remoteIp);
});

test('missing or failed local diagnostics produce an empty selection without breaking the form',() => {
  for (const value of [null,undefined,{}, {remoteIp:'127.0.0.1'}, {remoteIp:'127.0.0.1',addresses:[]}]) assert.deepEqual(localCandidates(value),[]);
});
