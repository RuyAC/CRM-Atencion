import {useEffect, useRef, useState} from 'react';
import {useStore, act, playChime} from './lib';
import {Icon, Modal, Logo} from './ui';
import './monitor.css';

const at = value => value ? new Date(value).getTime() : 0;
const elapsed = (date, now) => {
  const seconds = Math.max(0, Math.floor((now - at(date)) / 1000));
  if (seconds < 60) return seconds < 10 ? 'AHORA' : `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
};
const tableName = (request, tables) => {
  const table = tables.find(t => t.id === request.tableId);
  return table?.name || request.tableName || `Mesa ${String(table?.number || request.tableNumber || '?').padStart(2, '0')}`;
};
const requestLabel = request => request.buttonLabel || request.label || (request.type === 'BILL_REQUEST' ? 'Pedir la cuenta' : request.type === 'CALL' ? 'Llamar al garzón' : 'Solicitud especial');
const requestIcon = request => request.type === 'BILL_REQUEST' ? 'receipt' : 'bell';

function MonitorAccess({data, onDone, cancel, watch}) {
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);
  const staff = data.staff || [];
  async function submit(e, value = pin) {
    e?.preventDefault();
    if (value.length !== 4 || busy) return;
    setBusy(true); setError('');
    try {await act('auth.pin', {pin: value, userId: selected === 'tv' ? undefined : selected}); onDone();} catch (e) {setError(e.code === 'INVALID_PIN' ? 'PIN incorrecto. Inténtalo de nuevo.' : e.message || 'No pudimos verificar el PIN. Revisa tu conexión.'); setPin(''); input.current?.focus();} finally {setBusy(false);}
  }
  function digit(value) {if (!busy && pin.length < 4) setPin(pin + value);}
  return <main className={`monitor-access ${watch ? 'watch-access' : ''}`}>
    <div className="monitor-access-panel">
      {cancel ? <button className="monitor-access-back" onClick={cancel}><Icon name="arrow-left" size={18}/>Volver al monitor</button> : null}
      <div className="monitor-access-brand"><span className="monitor-brand-icon"><Icon name="bell-ring" size={33}/></span><h1>{data.restaurant?.name}</h1><p>{watch ? 'Atención desde tu reloj' : 'Monitor de llamadas y salón'}</p></div>
      {selected == null ? <><h2>¿Quién usará este dispositivo?</h2><p className="monitor-access-hint">Selecciona tu nombre para identificar las atenciones.</p><div className="monitor-identity-list">{staff.filter(s => s.active !== false).map(person => <button key={person.id} onClick={() => {setSelected(person.id); setPin(''); setError('');}}><span className="monitor-avatar">{person.name?.slice(0, 1).toUpperCase()}</span><span><strong>{person.name}</strong><small>{person.role === 'OWNER' ? 'Propietario' : person.role === 'MANAGER' ? 'Administrador' : 'Garzón'}</small></span><Icon name="chevron-right" size={19}/></button>)}<button className="monitor-general-choice" onClick={() => setSelected('tv')}><span className="monitor-avatar"><Icon name="tv" size={24}/></span><span><strong>Modo general · TV</strong><small>Usar el PIN del restaurante</small></span><Icon name="chevron-right" size={19}/></button></div></> : <form onSubmit={submit}>
        <button type="button" className="monitor-selected-identity" onClick={() => {setSelected(null); setPin(''); setError('');}}><Icon name="arrow-left" size={16}/>{selected === 'tv' ? 'Modo general · TV' : staff.find(p => p.id === selected)?.name || 'Garzón'}</button>
        <h2>Ingresa tu PIN</h2><p className="monitor-access-hint">Código de acceso de 4 dígitos</p>
        <label className="monitor-pin-field"><span className="sr-only">PIN de acceso</span><input ref={input} autoFocus autoComplete="off" type="password" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} value={pin} disabled={busy} onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}/><span aria-hidden="true">{[0,1,2,3].map(i => <i key={i} className={pin[i] ? 'filled' : ''}>{pin[i] ? '●' : ''}</i>)}</span></label>
        {error ? <p className="monitor-access-error" role="alert">{error}</p> : null}
        <div className="monitor-keypad">{[1,2,3,4,5,6,7,8,9].map(n => <button type="button" key={n} disabled={busy} onClick={() => digit(String(n))}>{n}</button>)}<button type="button" onClick={() => setPin('')} disabled={busy} aria-label="Limpiar PIN"><Icon name="x" size={22}/></button><button type="button" onClick={() => digit('0')} disabled={busy}>0</button><button type="button" onClick={() => setPin(pin.slice(0, -1))} disabled={busy} aria-label="Borrar último dígito"><Icon name="delete" size={22}/></button></div>
        <button className="monitor-enter" disabled={busy || pin.length !== 4} type="submit">{busy ? 'Verificando...' : 'Entrar al monitor'}<Icon name="arrow-right" size={18}/></button>
      </form>}
      <div className="monitor-access-footer"><Icon name="lock-keyhole" size={13}/>Acceso seguro del equipo</div>
    </div>
  </main>;
}

function QueueCard({request, tables, now, actions, operate, busy}) {
  return <article className={`monitor-queue-card ${request.type === 'BILL_REQUEST' ? 'bill-request' : ''}`}>
    <div className="monitor-queue-title"><h3>{tableName(request, tables)}</h3><span className="monitor-wait-time"><Icon name="clock" size={13}/>{elapsed(request.createdAt, now)}</span></div>
    <div className="monitor-queue-details"><span className="monitor-request-label"><Icon name={requestIcon(request)} size={13}/>{requestLabel(request)}</span><time>{new Date(request.createdAt).toLocaleTimeString('es-BO', {hour:'2-digit',minute:'2-digit'})}</time></div>
    {actions ? <button className="monitor-attend" disabled={busy} onClick={() => operate('request.accept', request)}><Icon name="user-check" size={18}/>{busy ? 'Atendiendo...' : 'Atender'}</button> : null}
  </article>;
}

function ServingCard({request, tables, now, actions, operate, busy, operator}) {
  const age = elapsed(request.acceptedAt || request.createdAt, now).toLowerCase();
  const assignedElsewhere = operator?.role === 'STAFF' && operator.id !== 'tv-general' && request.staffId !== operator.id;
  return <article className="monitor-serving-card"><div><h3>{tableName(request, tables)}</h3><p><Icon name="user-check" size={13}/>{request.staffName || 'Equipo de atención'}{request.type === 'BILL_REQUEST' ? <Icon name="receipt" size={13}/> : null}</p></div><span className="monitor-serving-time">{age === 'ahora' ? age : `hace ${age}`}</span><i className="monitor-live-dot"/>{actions ? <button className="monitor-complete" disabled={busy || assignedElsewhere} title={assignedElsewhere ? `Asignada a ${request.staffName || 'otro garzón'}` : undefined} onClick={() => operate('request.complete', request)} aria-label={`Finalizar ${tableName(request, tables)}`}><Icon name="check" size={18}/>{busy ? 'Guardando...' : 'Finalizar'}</button> : null}</article>;
}

function Watch({data, pending, serving, connected, now, operate, busy, identify, lock, sound, toggleSound, notify, notifications}) {
  const [index, setIndex] = useState(0);
  const queue = [...pending, ...serving];
  const request = queue[Math.min(index, Math.max(0, queue.length - 1))];
  const assignedElsewhere = request?.status === 'accepted' && data.viewer?.user?.role === 'STAFF' && data.viewer.user.id !== 'tv-general' && request.staffId !== data.viewer.user.id;
  return <main className="monitor-watch"><div className="monitor-watch-face">
    <header><button onClick={identify} aria-label="Identificar garzón"><Icon name="user-round" size={20}/></button><span>{data.viewer?.user?.name?.split(' ')[0] || 'Equipo'}</span><i className={`monitor-live-dot ${connected ? '' : 'offline'}`}/><button onClick={lock} aria-label="Bloquear"><Icon name="lock-keyhole" size={18}/></button></header>
    <time>{new Date(now).toLocaleTimeString('es-BO',{hour:'2-digit',minute:'2-digit'})}</time>
    {!connected ? <p className="watch-disconnected" role="status">Sin conexión · reconectando</p> : null}
    {request ? <>
      <div className={`watch-request-kind ${request.status === 'pending' ? 'waiting' : 'accepted'}`}><Icon name={requestIcon(request)} size={18}/>{request.status === 'pending' ? 'ESPERANDO' : 'EN ATENCIÓN'}</div>
      <h1>{tableName(request, data.tables || [])}</h1><p className="watch-request-label">{requestLabel(request)}</p><span className="watch-wait">{elapsed(request.createdAt, now)}</span>
      <button className={`watch-main-action ${request.status === 'pending' ? 'attend' : 'finish'}`} disabled={!!busy || !connected || assignedElsewhere} onClick={() => operate(request.status === 'pending' ? 'request.accept' : 'request.complete', request)}><Icon name={request.status === 'pending' ? 'user-check' : 'check'} size={26}/>{busy ? 'Guardando...' : request.status === 'pending' ? 'Atender' : 'Finalizar'}</button>
      {assignedElsewhere ? <p className="watch-assigned">Asignada a {request.staffName || 'otro garzón'}</p> : null}
      {queue.length > 1 ? <nav className="watch-pagination"><button onClick={() => setIndex(i => (i - 1 + queue.length) % queue.length)} aria-label="Solicitud anterior"><Icon name="chevron-left" size={22}/></button><span>{Math.min(index + 1, queue.length)} / {queue.length}</span><button onClick={() => setIndex(i => (i + 1) % queue.length)} aria-label="Siguiente solicitud"><Icon name="chevron-right" size={22}/></button></nav> : null}
    </> : <div className="watch-empty"><span><Icon name="circle-check" size={52}/></span><h1>{connected ? 'Todo al día' : 'Reconectando'}</h1><p>{connected ? 'Las nuevas llamadas aparecerán aquí.' : 'Esperando conexión con el salón.'}</p></div>}
    <footer><span>{data.restaurant.name}</span><div className="watch-alert-controls"><button className={sound ? 'enabled' : ''} onClick={toggleSound} aria-label={sound ? 'Desactivar sonido' : 'Activar sonido'} aria-pressed={sound}><Icon name={sound ? 'volume-2' : 'volume-x'} size={16}/></button><button className={notify ? 'enabled' : ''} onClick={notifications} aria-label={notify ? 'Desactivar notificaciones' : 'Activar notificaciones'} aria-pressed={notify}><Icon name="bell-ring" size={16}/></button><a href={`/tv/${data.restaurant.slug}`} aria-label="Abrir monitor de salón"><Icon name="monitor" size={16}/></a></div></footer>
  </div></main>;
}

export default function Monitor({watch = location.pathname.endsWith('/watch')}) {
  const {data, loading, connected, error: loadingError, refresh} = useStore({monitor: true});
  const [now, setNow] = useState(Date.now());
  const [theme, setTheme] = useState(() => localStorage.getItem('matebar.monitor.theme.v1') || 'dark');
  const [sound, setSound] = useState(false);
  const [mode, setMode] = useState(() => localStorage.getItem('matebar.monitor.mode.v1') || 'tv');
  const [identify, setIdentify] = useState(false);
  const [help, setHelp] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState('');
  const [notify, setNotify] = useState(() => localStorage.getItem('matebar.monitor.notifications.v1') === 'true' && 'Notification' in window && Notification.permission === 'granted');
  const [install, setInstall] = useState(null);
  const knownRequests = useRef(null);
  useEffect(() => {const interval = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(interval);}, []);
  useEffect(() => {const handler = e => {e.preventDefault(); setInstall(e);}; window.addEventListener('beforeinstallprompt', handler); return () => window.removeEventListener('beforeinstallprompt', handler);}, []);
  const pending = (data?.requests || []).filter(r => r.status === 'pending').sort((a,b) => at(a.createdAt) - at(b.createdAt));
  const serving = (data?.requests || []).filter(r => r.status === 'accepted' || r.status === 'serving').sort((a,b) => at(a.acceptedAt) - at(b.acceptedAt));
  const pendingKey = pending.map(r => r.id).join('|');
  useEffect(() => {
    if (!data || !connected) return;
    const current = new Set(pending.map(r => r.id));
    if (knownRequests.current) {
      const newRequests = pending.filter(r => !knownRequests.current.has(r.id));
      if (newRequests.length) {
        if (sound) playChime();
        if (notify && 'Notification' in window && Notification.permission === 'granted') for (const r of newRequests) showNotification(r);
        if (notify && navigator.vibrate) navigator.vibrate([180,80,180]);
      }
    }
    knownRequests.current = current;
  }, [pendingKey, connected, !!data, sound, notify]);
  async function operate(action, request) {
    setBusy(request.id); setError('');
    try {await act(action, {id: request.id});} catch(e) {setError(e.message || 'No se pudo guardar. Inténtalo de nuevo.');} finally {setBusy(null);}
  }
  async function lock() {try {await act('auth.logout', {}); setIdentify(false); refresh();} catch(e) {setError(e.message);}}
  async function toggleSound() {
    if (sound) {setSound(false); return;}
    if (!window.AudioContext && !window.webkitAudioContext) {setError('Este navegador no puede reproducir alertas. Las llamadas seguirán apareciendo en pantalla.'); return;}
    try {await playChime(); setSound(true);} catch {setError('El navegador bloqueó el sonido. Pulsa de nuevo para activarlo.');}
  }
  async function showNotification(request) {
    const title = `${tableName(request, data.tables || [])} · ${requestLabel(request)}`;
    const options = {body:'Una mesa está esperando atención.',tag:request.id,icon:'/icon-192.png',data:{url:`/tv/${data.restaurant.slug}${watch ? '/watch' : ''}`}};
    try {
      const registration = await navigator.serviceWorker?.getRegistration();
      if (registration) await registration.showNotification(title, options);
      else {
        const notification = new Notification(title, options);
        notification.onclick = () => {window.focus(); notification.close();};
      }
    } catch {setError('Este navegador no puede mostrar avisos del sistema. Las llamadas siguen apareciendo en el monitor.');}
  }
  async function notifications() {
    if (notify) {setNotify(false); localStorage.setItem('matebar.monitor.notifications.v1','false'); return;}
    if (!('Notification' in window) || !window.isSecureContext) {setError('Este navegador o conexión no ofrece notificaciones. Mantén el monitor abierto para ver las llamadas.'); return;}
    try {
      const permission = await Notification.requestPermission();
      if (permission === 'granted') {setNotify(true); localStorage.setItem('matebar.monitor.notifications.v1','true'); if (navigator.vibrate) navigator.vibrate(150);} else setError('Las notificaciones no están autorizadas. Puedes activarlas en los permisos del navegador.');
    } catch {setError('No pudimos activar las notificaciones. Revisa los permisos de tu navegador.');}
  }
  async function fullscreen() {try {if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen();} catch {setError('Este dispositivo no permite pantalla completa.');}}
  if (loading && !data) return <main className="monitor-loading"><span className="monitor-load-spinner"/>Conectando con el salón...</main>;
  if (!data) return <main className="monitor-loading"><Icon name="wifi-off" size={40}/><p>{loadingError || 'No pudimos conectar con el restaurante.'}</p><button onClick={refresh}>Volver a intentar</button></main>;
  if (location.pathname.split('/')[2] !== data.restaurant.slug) return <main className="monitor-loading"><Icon name="store" size={40}/><p>No encontramos este restaurante.</p></main>;
  const {restaurant, settings = {}, tables = [], requests = [], viewer = {}} = data;
  const authorized = viewer.monitorAuthorized || viewer.user || settings.tvRequirePin === false;
  if (!authorized || identify) return <MonitorAccess data={data} watch={watch} onDone={() => {setIdentify(false); refresh();}} cancel={authorized ? () => setIdentify(false) : null}/>;
  const showActions = settings.tvShowActions !== false && mode === 'touch';
  const dayOptions = {timeZone:restaurant.timezone || 'America/La_Paz'};
  const today = new Date(now).toLocaleDateString('en-CA', dayOptions);
  const completed = requests.filter(r => r.status === 'completed' && new Date(r.completedAt).toLocaleDateString('en-CA', dayOptions) === today).length;
  if (watch) return <><Watch data={data} pending={pending} serving={serving} connected={connected} now={now} operate={operate} busy={busy} identify={() => setIdentify(true)} lock={lock} sound={sound} toggleSound={toggleSound} notify={notify} notifications={notifications}/>{error ? <div className="watch-error" role="alert">{error}<button onClick={() => setError('')} aria-label="Cerrar error"><Icon name="x" size={16}/></button></div> : null}</>;
  return <main className={`monitor-page ${theme === 'light' ? 'monitor-light' : ''}`}>
    <header className="monitor-header"><div className="monitor-brand"><span className="monitor-brand-icon"><Icon name="bell-ring" size={34}/></span><div><div className="monitor-brand-title"><h1>{restaurant.name}</h1><span className={`monitor-live-badge ${connected ? '' : 'disconnected'}`}>{connected ? 'EN VIVO' : 'SIN CONEXIÓN'}</span></div><p>Monitor de llamadas y salón</p></div></div><div className="monitor-clock"><time>{new Date(now).toLocaleTimeString('es-BO',{hour12:false})}</time><span>HORA LOCAL</span></div><nav className="monitor-controls" aria-label="Opciones de monitor"><button className="monitor-app-button" onClick={() => setHelp(true)}><Icon name="bell-ring" size={23}/><span>App celular</span></button><button className="monitor-mode-button" onClick={() => {const value = mode === 'tv' ? 'touch' : 'tv'; setMode(value); localStorage.setItem('matebar.monitor.mode.v1',value);}}><Icon name={mode === 'tv' ? 'tv' : 'hand'} size={23}/><span>{mode === 'tv' ? 'TV en alto' : 'Pantalla táctil'}</span></button><button className="monitor-theme-button" onClick={() => {const value = theme === 'dark' ? 'light' : 'dark'; setTheme(value); localStorage.setItem('matebar.monitor.theme.v1',value);}}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={25}/><span>{theme === 'dark' ? 'Claro' : 'Oscuro'}</span></button><button className={`monitor-icon-button ${sound ? 'sound-on' : ''}`} onClick={toggleSound} aria-label={sound ? 'Desactivar sonido' : 'Activar sonido'} aria-pressed={sound}><Icon name={sound ? 'volume-2' : 'volume-x'} size={25}/></button><button className="monitor-icon-button" onClick={fullscreen} aria-label="Alternar pantalla completa"><Icon name="maximize" size={24}/></button><button className="monitor-icon-button" onClick={lock} aria-label="Bloquear monitor"><Icon name="lock-keyhole" size={24}/></button></nav></header>
    <div className="monitor-operator-bar"><span>Dispositivo operado por:</span><button onClick={() => setIdentify(true)}><span className="operator-avatar"><Icon name="user-check" size={15}/></span><strong>{viewer.user?.name || 'Identificar garzón'}</strong><small>CAMBIAR</small></button><button className="monitor-alert-help" onClick={() => setHelp(true)}><Icon name="bell-ring" size={15}/>App y alertas</button></div>
    {error ? <div className="monitor-error" role="alert"><Icon name="circle-alert" size={18}/><span>{error}</span><button aria-label="Cerrar error" onClick={() => setError('')}><Icon name="x" size={16}/></button></div> : null}
    {!connected ? <div className="monitor-reconnecting" role="status"><Icon name="wifi-off" size={16}/>Conexión interrumpida. Reconectando; los datos podrían estar desactualizados.</div> : null}
    <div className="monitor-main"><section className="monitor-pending-section"><div className="monitor-section-title"><span className="monitor-section-count waiting">{pending.length}</span><div><div className="monitor-section-name"><h2>Esperando atención</h2><span className="monitor-salon-badge">{pending.length} EN EL SALÓN</span></div><p>El equipo debe atender estas solicitudes</p></div></div><div className="monitor-queue-grid">{pending.map(request => <QueueCard key={request.id} request={request} tables={tables} now={now} actions={showActions} operate={operate} busy={busy === request.id || !connected}/>)}</div>{!pending.length ? <div className="monitor-empty"><span><Icon name="circle-check" size={44}/></span><h3>Todo al día por aquí</h3><p>No hay llamadas esperando atención.</p></div> : null}</section><aside className="monitor-serving-section"><div className="monitor-section-title"><span className="monitor-section-count serving">{serving.length}</span><h2>En atención</h2><span className="monitor-active-badge">{serving.length} ACTIVAS</span></div><div className="monitor-serving-list">{serving.map(request => <ServingCard key={request.id} request={request} operator={viewer.user} tables={tables} now={now} actions={showActions} operate={operate} busy={busy === request.id || !connected}/>)}</div>{!serving.length ? <div className="monitor-serving-empty">Ninguna mesa en atención</div> : null}<section className="monitor-metrics"><h3>DESEMPEÑO DE HOY</h3><div><div><strong>{completed}</strong><span>AUnToquees completadas</span></div><div><strong>{pending.length + serving.length}</strong><span>Llamadas activas</span></div></div></section>{settings.tvAutoAccept || settings.tvAutoComplete ? <div className="monitor-auto-note"><Icon name="timer" size={14}/>Modo automático activado</div> : null}</aside></div>
    <footer className="monitor-footer"><span><i className={`monitor-live-dot ${connected ? '' : 'offline'}`}/>{connected ? 'Sincronización en tiempo real activa' : 'Esperando conexión'} · Pantallas táctiles y celular</span><div><Logo compact size={18}/><span>· Display v1.2</span></div></footer>
    {help ? <Modal title="App y alertas" onClose={() => setHelp(false)} className="monitor-help-dialog"><div className="monitor-help-intro"><span><Icon name="smartphone" size={34}/></span><p>Lleva las llamadas del salón en tu teléfono y recibe avisos mientras esta pantalla esté activa.</p></div><div className="monitor-help-row"><Icon name="download" size={22}/><div><h3>Instala la aplicación</h3><p>{install ? 'Agrega el monitor a tu dispositivo para abrirlo en un toque.' : 'En tu navegador, abre el menú y elige “Instalar aplicación” o “Añadir a pantalla de inicio”.'}</p>{install ? <button onClick={async () => {await install.prompt(); await install.userChoice; setInstall(null);}}>Instalar ahora</button> : null}</div></div><div className="monitor-help-row"><Icon name="bell-ring" size={22}/><div><h3>Notificaciones y vibración</h3><p>Permite las alertas de este dispositivo. La disponibilidad depende de tu navegador.</p><button onClick={notifications}>{notify ? 'Desactivar notificaciones' : 'Activar notificaciones'}</button></div></div><div className="monitor-help-row"><Icon name="watch" size={22}/><div><h3>Vista para reloj</h3><p>Una pantalla compacta para atender y finalizar llamadas desde un navegador compatible.</p><a href={`/tv/${restaurant.slug}/watch`}>Abrir vista de reloj<Icon name="arrow-up-right" size={15}/></a></div></div><p className="monitor-help-note">Mantén el monitor visible y activa el sonido para recibir las llamadas en vivo.</p></Modal> : null}
  </main>;
}

export const TV = Monitor;



