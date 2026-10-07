import {Icon,Logo} from './ui';
import './admin-sidebar.css';

export default function AdminSidebar({data,nav,allowed,sidebar,mobile,sidebarRef,onTutorial,onLogout,busy,route}){
  const firstTable=data.tables.find(table=>table.active!==false&&table.number===1)||data.tables.find(table=>table.active!==false);
  const clientUrl=firstTable?`/r/${data.restaurant.slug}/t/${firstTable.token}`:'';
  const labels={'':'Llamadas en tiempo real',tables:'Mesas y códigos QR',menu:'Menú digital',networks:'Redes autorizadas (Wi-Fi)',buttons:'Botones personalizados',staff:'Equipo y permisos',reports:'Reportes y métricas',billing:'Versión y funciones',settings:'Configuración'};
  const icons={'':'bell',tables:'dashboard',menu:'book-open',buttons:'sparkles'};
  return <aside ref={sidebarRef} id="admin-navigation" inert={mobile&&!sidebar} aria-hidden={mobile&&!sidebar} className={`a-sidebar st-sidebar ${sidebar?'open':''}`}>
    <a href="/dashboard" className="a-brand"><Logo size={28}/></a>
    <div className="st-establishment"><span>{data.restaurant.name?.slice(0,1).toUpperCase()||'M'}</span><div><strong>{data.restaurant.name}</strong><small>{data.restaurant.slug}</small></div></div>
    <div className="st-private-row"><span><Icon name="shield-check" size={13}/>Panel privado</span><button disabled={busy} onClick={onLogout}><Icon name="logout" size={12}/>Salir</button></div>
    <div className="st-plan-row"><strong><i/>Versión local</strong>{allowed.includes('billing')?<a href="/dashboard/billing">Ver funciones</a>:null}</div>
    <nav aria-label="Navegación principal">{nav.filter(([path])=>allowed.includes(path)).map(([path,label,icon])=><a key={path} className={path===route?'active':''} aria-current={path===route?'page':undefined} href={`/dashboard${path?'/'+path:''}`}><Icon name={icons[path]||icon} size={16}/><span>{path===''?<>Llamadas en tiempo<br/>real</>:labels[path]||label}</span>{path===''?<small className="st-live-label">EN VIVO</small>:null}</a>)}</nav>
    {data.viewer?.saasAdmin?<a className="st-saas-link" href="/saas"><Icon name="shield-check" size={16}/><span>Administrar Atencion</span><Icon name="chevron-right" size={14}/></a>:null}
    <button className="st-tutorial" onClick={onTutorial}><span><Icon name="sparkles" size={17}/></span><div><strong>Tutorial del sistema</strong><small>Conoce cada función</small></div><b>7 PASOS</b></button>
    <div className="st-sidebar-tools"><a className="st-tv-link" href={`/tv/${data.restaurant.slug}`} target="_blank" rel="noreferrer"><Icon name="monitor" size={13}/><strong>Modo TV ({data.restaurant.name})</strong><Icon name="external" size={13}/></a>{clientUrl?<a className="st-client-link" href={clientUrl} target="_blank" rel="noreferrer">Abrir {firstTable.name} (cliente)<Icon name="external" size={13}/></a>:null}<div className="st-monitor-links"><a href={`/tv/${data.restaurant.slug}`} target="_blank" rel="noreferrer"><Icon name="volume-2" size={13}/>Sonido del monitor</a><a href={`/tv/${data.restaurant.slug}`} target="_blank" rel="noreferrer"><Icon name="bell" size={13}/>Notificaciones</a></div></div>
  </aside>;
}
