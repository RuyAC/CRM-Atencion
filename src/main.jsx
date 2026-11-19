import React,{lazy,Suspense,useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Admin from './Admin';
import Client from './Client';
import TV from './Monitor';
import './styles.css';

const SaasAdmin=lazy(()=>import('./SaasAdmin'));
const Register=lazy(()=>import('./Register'));
const AccountAccess=lazy(()=>import('./AccountAccess'));
const Landing=lazy(()=>import('./Landing'));
const ProductPages=lazy(()=>import('./ProductPages'));

class ErrorBoundary extends React.Component{constructor(props){super(props);this.state={error:null};}static getDerivedStateFromError(error){return{error};}render(){return this.state.error?<main className="app-error"><h1>No se pudo abrir esta pantalla</h1><p>{this.state.error.message}</p><button className="btn btn-primary" onClick={()=>location.reload()}>Volver a intentar</button></main>:this.props.children;}}
function App(){const[path,setPath]=useState(location.pathname);useEffect(()=>{const back=()=>setPath(location.pathname);window.addEventListener('popstate',back);return()=>window.removeEventListener('popstate',back);},[]);function navigate(url){history.pushState({},'',url);setPath(location.pathname);window.scrollTo(0,0);}return <ErrorBoundary key={path}>{['/demo','/contacto','/ayuda','/terminos','/privacidad'].includes(path)?<Suspense fallback={<p>Cargando…</p>}><ProductPages/></Suspense>:path==='/'?<Suspense fallback={<main className="app-loading">Cargando Atencion…</main>}><Landing/></Suspense>:['/forgot-password','/reset-password','/verify-email'].includes(path)?<Suspense fallback={<p>Cargando…</p>}><AccountAccess/></Suspense>:path==='/register'?<Suspense fallback={<main className="app-error" role="status"><p>Cargando registro…</p></main>}><Register/></Suspense>:path==='/saas'||path.startsWith('/saas/')?<Suspense fallback={<main className="app-error" role="status"><p>Cargando administración de Atencion…</p></main>}><SaasAdmin path={path}/></Suspense>:path.startsWith('/r/')?<Client/>:path.startsWith('/tv/')?<TV watch={path.endsWith('/watch')}/>:<Admin path={path==='/'?'/dashboard':path} navigate={navigate}/>}</ErrorBoundary>;}
createRoot(document.getElementById('root')).render(<App/>);
if('serviceWorker' in navigator&&import.meta.env.PROD)navigator.serviceWorker.register('/sw.js').catch(()=>{});
