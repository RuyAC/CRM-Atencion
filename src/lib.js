import {useCallback,useEffect,useRef,useState} from 'react';

const changes = new EventTarget();
let currency='BOB';
const pathRestaurant = () => {const parts=location.pathname.split('/');return ['r','tv'].includes(parts[1])?decodeURIComponent(parts[2]||''):'';};
export async function api(path,options={}) {
  const response=await fetch(path,{credentials:'include',...options,headers:{'Content-Type':'application/json',...options.headers}});
  const value=await response.json().catch(()=>({message:'El servidor no pudo responder.'}));
  if(!response.ok){const error=new Error(value.message||value.error||'No se pudo completar la acción.');error.code=value.code;error.status=response.status;throw error;}
  return value;
}
export async function act(action,payload={}) {
  const restaurantSlug=pathRestaurant();
  if(restaurantSlug)payload={...payload,restaurantSlug};
  const value=await api('/api/action',{method:'POST',body:JSON.stringify({action,payload})});
  changes.dispatchEvent(new Event('change'));
  return value.result??value;
}
export function useStore(options={}) {
  const token=typeof options==='string'?options:options.token;
  const monitor=Boolean(options.monitor);
  const restaurant=typeof options==='object'?options.restaurant||pathRestaurant():pathRestaurant();
  const query=new URLSearchParams();if(token)query.set('token',token);if(monitor)query.set('monitor','1');if(restaurant)query.set('restaurant',restaurant);
  const url='/api/state'+(query.size?'?'+query.toString():'');
  const streamQuery=new URLSearchParams();if(token)streamQuery.set('token',token);if(restaurant)streamQuery.set('restaurant',restaurant);
  const streamUrl='/api/events'+(streamQuery.size?'?'+streamQuery.toString():'');
  const [data,setData]=useState(null),[loading,setLoading]=useState(true),[connected,setConnected]=useState(false),[error,setError]=useState('');
  const fetching=useRef(false),dirty=useRef(false),alive=useRef(true),urlRef=useRef(url);urlRef.current=url;
  const refresh=useCallback(async()=>{
    if(fetching.current){dirty.current=true;return;}
    fetching.current=true;
    try {const value=await api(urlRef.current);if(alive.current){const state=value.state||value;currency=state.settings?.currency||state.restaurant?.currency||'BOB';setData(state);setError('');}}
    catch(err){if(alive.current){setError(err.message);setConnected(false);}}
    finally{fetching.current=false;if(alive.current)setLoading(false);if(dirty.current){dirty.current=false;refresh();}}
  },[]);
  useEffect(()=>{
    alive.current=true;setLoading(true);refresh();
    const stream=new EventSource(streamUrl,{withCredentials:true});
    stream.onopen=()=>{setConnected(true);refresh();};
    stream.onmessage=()=>{setConnected(true);refresh();};
    stream.addEventListener('state',()=>refresh());stream.addEventListener('change',()=>refresh());stream.addEventListener('update',()=>refresh());
    stream.onerror=()=>setConnected(false);
    const handle=()=>refresh();changes.addEventListener('change',handle);
    const visible=()=>{if(document.visibilityState==='visible')refresh();};document.addEventListener('visibilitychange',visible);
    const fallback=setInterval(refresh,30000);
    return()=>{alive.current=false;stream.close();changes.removeEventListener('change',handle);document.removeEventListener('visibilitychange',visible);clearInterval(fallback);};
  },[url,streamUrl,refresh,token]);
  return {data,loading,connected,error,refresh};
}
export function money(cents=0) {return new Intl.NumberFormat('es-BO',{style:'currency',currency,maximumFractionDigits:2}).format(Number(cents)/100);}
export function timeAgo(date){const seconds=Math.max(0,Math.floor((Date.now()-new Date(date).getTime())/1000));if(seconds<60)return 'Ahora';if(seconds<3600)return `hace ${Math.floor(seconds/60)} min`;return `hace ${Math.floor(seconds/3600)} h`;}
export const relativeTime=timeAgo;
export function useClock(){const[now,setNow]=useState(Date.now());useEffect(()=>{const id=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(id);},[]);return now;}
export function playBell(){try{const AudioContext=window.AudioContext||window.webkitAudioContext;const ctx=new AudioContext();[0,.18,.36].forEach((at,i)=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=[880,1108,1320][i];gain.gain.setValueAtTime(0,ctx.currentTime+at);gain.gain.linearRampToValueAtTime(.1,ctx.currentTime+at+.015);gain.gain.exponentialRampToValueAtTime(.001,ctx.currentTime+at+.3);osc.connect(gain);gain.connect(ctx.destination);osc.start(ctx.currentTime+at);osc.stop(ctx.currentTime+at+.35);});setTimeout(()=>ctx.close(),1100);}catch{}}
export const playChime=playBell;
