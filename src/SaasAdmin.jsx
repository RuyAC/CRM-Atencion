import {SecurityPanel,FinancePanel} from './AccountOperations';
import {LeadsPanel} from './Commercial';
import {SubscriptionEditor,OperationsPanel} from './ServiceReadiness';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {api, act} from './lib';
import {Icon, Logo, Modal} from './ui';
import './saas-admin.css';

const navigation = [
  {path: '/saas', label: 'Resumen', icon: 'dashboard'},
  {path: '/saas/accounts', label: 'Cuentas', icon: 'users'},
  {path: '/saas/restaurants', label: 'Restaurantes', icon: 'store'},
  {path: '/saas/activity', label: 'Actividad', icon: 'history'},
  {path:'/saas/finance',label:'Pagos y bajas',icon:'credit-card'},
  {path:'/saas/security',label:'Seguridad',icon:'shield'},
];
const dateOptions = {timeZone: 'America/La_Paz', day: '2-digit', month: 'short', year: 'numeric'};
const dateFormatter = new Intl.DateTimeFormat('es-BO', dateOptions);
const accessFormatter = new Intl.DateTimeFormat('es-BO', {...dateOptions, hour: '2-digit', minute: '2-digit'});
const numberFormatter = new Intl.NumberFormat('es-BO');
const EMPTY_ARRAY = [];

function dateLabel(value, fallback, includeTime = false) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Sin fecha registrada' : (includeTime ? accessFormatter : dateFormatter).format(date);
}

function useSaasSnapshot() {
  const [snapshot, setSnapshot] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const alive = useRef(false);
  const controller = useRef(null);
  const requestId = useRef(0);
  const statusRef = useRef(status);
  statusRef.current = status;

  const clear = useCallback(() => {
    controller.current?.abort();
    ++requestId.current;
    setSnapshot(null);
    setStatus('loading');
    setLoading(true);
    setRefreshing(false);
    setError('');
  }, []);

  const refresh = useCallback(async () => {
    if (!alive.current) return;
    controller.current?.abort();
    const activeController = new AbortController();
    controller.current = activeController;
    const id = ++requestId.current;
    setRefreshing(true);
    setError('');
    try {
      const value = await api('/api/saas/state', {signal: activeController.signal});
      if (!alive.current || id !== requestId.current) return;
      setSnapshot(value);
      setStatus('ready');
      return value;
    } catch (err) {
      if (err.name === 'AbortError' || !alive.current || id !== requestId.current) return;
      if (err.status === 401 || err.status === 403) {
        setSnapshot(null);
        setStatus(err.status === 401 ? 'login' : 'denied');
      } else {
        setError(err.message || 'No se pudo cargar la administración.');
        setStatus('error');
      }
    } finally {
      if (alive.current && id === requestId.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    alive.current = true;
    refresh();
    const visible = () => {if (document.visibilityState === 'visible') refresh();};
    const poll = setInterval(() => {
      if (document.visibilityState === 'visible' && ['ready', 'error'].includes(statusRef.current)) refresh();
    }, 30000);
    document.addEventListener('visibilitychange', visible);
    return () => {
      alive.current = false;
      ++requestId.current;
      controller.current?.abort();
      clearInterval(poll);
      document.removeEventListener('visibilitychange', visible);
    };
  }, [refresh]);

  return {snapshot, loading, refreshing, status, error, refresh, clear};
}

function Button({children, icon, primary = false, className = '', ...props}) {
  return <button type="button" className={`saas-button ${primary ? 'saas-button-primary' : ''} ${className}`} {...props}>
    {icon ? <Icon name={icon} size={16}/> : null}{children}
  </button>;
}

function Status({active}) {
  return <span className={`saas-status ${active ? 'saas-status-active' : 'saas-status-inactive'}`}>
    <span aria-hidden="true"/>{active ? 'Activa' : 'Inactiva'}
  </span>;
}

function ServiceStatus({paused}) {
  return <span className={`saas-status ${paused ? 'saas-status-paused' : 'saas-status-active'}`}>
    <Icon name={paused ? 'pause' : 'check-circle'} size={13}/>{paused ? 'Atención pausada' : 'Atención activa'}
  </span>;
}

function EmptyState({icon = 'users', title, children, action}) {
  return <div className="saas-empty">
    <Icon name={icon} size={30}/><h3>{title}</h3><p>{children}</p>{action}
  </div>;
}

function Navigation({route, onNavigate}) {
  return <nav className="saas-navigation" aria-label="Administración de Atencion">
    {navigation.map(item => <a key={item.path} href={item.path} onClick={onNavigate}
      className={route === item.path ? 'active' : ''} aria-current={route === item.path ? 'page' : undefined}>
      <Icon name={item.icon} size={18}/><span>{item.label}</span>
    </a>)}
  </nav>;
}

function SidebarContent({route, viewer, logout, busy, onNavigate}) {
  return <>
    <a className="saas-brand" href="/saas" aria-label="Atencion, administración"><Logo size={28}/></a>
    <div className="saas-local-identity"><Icon name="shield-check" size={19}/><div><strong>Administración local</strong><span>Atencion en este equipo</span></div></div>
    <Navigation route={route} onNavigate={onNavigate}/>
    <div className="saas-sidebar-bottom">
      <a className="saas-restaurant-link" href="/login"><Icon name="store" size={17}/>Entrar al restaurante</a>
      <div className="saas-viewer"><span className="saas-avatar" aria-hidden="true">{viewer.name?.slice(0, 1).toUpperCase() || 'A'}</span><div><strong>{viewer.name || 'Administrador'}</strong><span>{viewer.email}</span></div></div>
      <Button icon="log-out" disabled={busy} onClick={logout}>{busy ? 'Cerrando sesión…' : 'Cerrar sesión'}</Button>
    </div>
  </>;
}

export default function SaasAdmin({path = '/saas'}) {
  const {snapshot, loading, refreshing, status, error, refresh, clear} = useSaasSnapshot();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const [accountId, setAccountId] = useState(null);
  const [restaurantId, setRestaurantId] = useState(null);
  const route = path.replace(/\/$/, '') || '/saas';

  useEffect(() => {
    const media = matchMedia('(min-width: 761px)');
    const closeOnDesktop = () => {if (media.matches) setMenuOpen(false);};
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);

  async function logout() {
    setBusy(true);
    setActionError('');
    try {
      await act('auth.logout');
      clear();
      setMenuOpen(false);
      setAccountId(null);
      setRestaurantId(null);
      await refresh();
    } catch (err) {
      setActionError(err.message || 'No se pudo cerrar la sesión. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <Loading/>;
  if (status === 'login') return <Login refresh={refresh}/>;
  if (status === 'denied') return <AccessState title="Acceso reservado a administradores de Atencion" icon="lock-keyhole">
    Tu sesión no tiene permiso para abrir la administración de Atencion. Continúa en el panel de tu restaurante.
  </AccessState>;
  if (!snapshot) return <AccessState title="No se pudo cargar la administración" icon="wifi-off"
    action={<Button icon="refresh-cw" primary disabled={refreshing} onClick={refresh}>{refreshing ? 'Reintentando…' : 'Reintentar'}</Button>}>
    {error || 'Comprueba que el servidor local esté disponible y vuelve a intentarlo.'}
  </AccessState>;

  const accounts = snapshot.accounts || EMPTY_ARRAY;
  const restaurants = snapshot.restaurants || EMPTY_ARRAY;
  const viewer = snapshot.viewer;
  const selectedAccount = accounts.find(account => account.id === accountId);
  const selectedRestaurant = restaurants.find(restaurant => restaurant.id === restaurantId);
  const sidebarProps = {route, viewer, logout, busy};
  let page;
  if(snapshot.security?.required&&!snapshot.security.enabled)page=<SecurityPanel/>;
  else if(route==='/saas/security')page=<SecurityPanel/>;
  else if(route==='/saas/finance')page=<FinancePanel/>;
  else if (route === '/saas/accounts') page = <Accounts accounts={accounts} onOpen={setAccountId}/>;
  else if (route === '/saas/restaurants') page = <Restaurants restaurants={restaurants} onOpen={setRestaurantId}/>;
  else if (route === '/saas/activity') page = <Activity activity={snapshot.activity || EMPTY_ARRAY}/>;
  else if (route === '/saas') page = <Overview snapshot={snapshot} onOpenAccount={setAccountId}/>;
  else page = <EmptyState icon="search" title="Esta sección no existe" action={<a className="saas-button saas-button-primary" href="/saas">Volver al resumen</a>}>Abre una sección desde la navegación de Atencion.</EmptyState>;

  return <div className="saas-app">
    <a className="saas-skip" href="#saas-content">Ir al contenido</a>
    <aside className="saas-sidebar"><SidebarContent {...sidebarProps}/></aside>
    <div className="saas-workspace">
      <header className="saas-topbar">
        <button className="saas-icon-button saas-menu-button" aria-label="Abrir navegación" aria-expanded={menuOpen} aria-controls={menuOpen ? 'saas-mobile-navigation' : undefined} onClick={() => setMenuOpen(true)}><Icon name="menu"/></button>
        <strong>Administración de Atencion</strong>
        <div className="saas-topbar-actions"><span className="saas-local-tag"><Icon name="database" size={13}/>Local</span><a href="/login" aria-label="Entrar al restaurante"><Icon name="store" size={15}/><span>Entrar al restaurante</span></a></div>
      </header>
      <main id="saas-content" className="saas-main" tabIndex={-1}>
        <div className="saas-sync-row"><span title="Zona horaria: America/La_Paz">{snapshot.generatedAt ? `Actualizado ${dateLabel(snapshot.generatedAt, '', true)}` : 'Datos de esta instalación'}</span>
          <Button icon="refresh-cw" disabled={refreshing || busy} onClick={refresh}>{refreshing ? 'Actualizando…' : 'Actualizar'}</Button>
        </div>
        {error || actionError ? <div className="saas-error-banner" role="alert"><Icon name="alert-circle" size={18}/><div><strong>{actionError || 'No se pudieron actualizar los datos.'}</strong>{error ? <p>{error} La información visible corresponde a la última actualización.</p> : null}</div>{error ? <Button onClick={refresh} disabled={refreshing}>Reintentar</Button> : null}</div> : null}
        {page}{route==='/saas'&&!(snapshot.security?.required&&!snapshot.security.enabled)?<><LeadsPanel/><OperationsPanel/></>:null}
      </main>
      <footer className="saas-footer"><span>Atencion · Administración local</span><span>Fechas en hora de Bolivia</span></footer>
    </div>
    {menuOpen ? <Modal title="Navegación" onClose={() => setMenuOpen(false)} className="saas-sidebar-modal"><div id="saas-mobile-navigation"><SidebarContent {...sidebarProps} onNavigate={() => setMenuOpen(false)}/></div></Modal> : null}
    {selectedAccount ? <AccountDetails account={selectedAccount} restaurants={restaurants} onClose={() => setAccountId(null)}/> : null}
    {selectedRestaurant ? <RestaurantDetails restaurant={selectedRestaurant} onSaved={refresh} onClose={() => setRestaurantId(null)}/> : null}
  </div>;
}

function Loading() {
  return <div className="saas-access saas-app"><a className="saas-access-brand" href="/dashboard"><Logo size={34}/></a>
    <div className="saas-loading" aria-busy="true" role="status"><p>Cargando la administración local…</p><div aria-hidden="true" className="saas-loading-block"/><div aria-hidden="true" className="saas-loading-block"/><div aria-hidden="true" className="saas-loading-block"/></div>
  </div>;
}

function AccessState({title, icon, children, action}) {
  return <div className="saas-access saas-app"><a className="saas-access-brand" href="/dashboard"><Logo size={34}/></a><section className="saas-access-panel"><Icon name={icon} size={28}/><h1>{title}</h1><p>{children}</p><div className="saas-access-actions">{action}<a className="saas-button" href="/dashboard"><Icon name="arrow-left" size={16}/>Volver al restaurante</a></div></section></div>;
}

function Login({refresh}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code,setCode]=useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      await act('auth.login', {email, password,code});
      setPassword('');
      await refresh();
    } catch (err) {
      setError(err.message || 'No se pudo iniciar sesión. Revisa tus credenciales.');
    } finally {
      setBusy(false);
    }
  }
  return <div className="saas-access saas-app"><a className="saas-access-brand" href="/dashboard"><Logo size={34}/></a><section className="saas-access-panel saas-login-panel">
    <span className="saas-login-icon"><Icon name="shield-check" size={26}/></span><h1>Administración de Atencion</h1><p>Entra con una cuenta autorizada para administrar Atencion.</p>
    <form onSubmit={submit} aria-busy={busy}>
      <label className="saas-field"><span>Correo electrónico</span><input name="email" type="email" autoComplete="username" required value={email} onChange={event => setEmail(event.target.value)} placeholder="nombre@ejemplo.com" disabled={busy}/></label>
      <label className="saas-field"><span>Contraseña</span><div className="saas-password"><input name="password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={busy}/><button type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} aria-pressed={showPassword} onClick={() => setShowPassword(value => !value)}><Icon name={showPassword ? 'eye-off' : 'eye'} size={18}/></button></div></label>
      <label className="saas-field"><span>Código del autenticador o de recuperación (si está activo)</span><input autoComplete="one-time-code" maxLength={30} value={code} onChange={e=>setCode(e.target.value)} disabled={busy}/></label>
      {error ? <div className="saas-form-error" role="alert"><Icon name="alert-circle" size={16}/>{error}</div> : null}
      <Button primary type="submit" disabled={busy} icon="arrow-right">{busy ? 'Entrando…' : 'Entrar a la administración'}</Button>
    </form>
    <p className="saas-login-note">Ser propietario de un restaurante no concede este acceso. Necesitas el permiso de administración de Atencion.</p><a className="saas-back-link" href="/login"><Icon name="store" size={15}/>Entrar al restaurante</a>
  </section></div>;
}

function Heading({title, children, actions}) {
  return <div className="saas-heading"><div><h1>{title}</h1><p>{children}</p></div>{actions ? <div className="saas-heading-actions">{actions}</div> : null}</div>;
}

function Overview({snapshot, onOpenAccount}) {
  const summary = snapshot.summary;
  const metrics = [
    ['Cuentas de Atencion', summary.accounts, 'users', 'Solo propietarios'],
    ['Restaurantes', summary.restaurants, 'store', 'En esta instalación'],
    ['Cuentas activas', summary.activeAccounts, 'user-check', `De ${numberFormatter.format(summary.accounts)} cuentas`],
    ['Solicitudes de hoy', summary.requestsToday, 'bell', `${numberFormatter.format(summary.pendingRequests)} pendientes actualmente`],
  ];
  return <>
    <Heading title="Administración local">Aquí administras cuentas de Atencion. Los equipos se gestionan en cada restaurante.</Heading>
    <div className="saas-metrics" aria-label="Resumen de esta instalación">{metrics.map(([label, value, icon, hint]) => <div className="saas-metric" key={label}><div className="saas-metric-label"><span>{label}</span><Icon name={icon} size={19}/></div><strong>{numberFormatter.format(value)}</strong><small>{hint}</small></div>)}</div>
    <Accounts accounts={snapshot.accounts || EMPTY_ARRAY} onOpen={onOpenAccount} embedded/>
    <section className="saas-scope-note"><Icon name="info" size={18}/><div><h2>Restaurantes de Atencion</h2><p>Los restaurantes pueden crear su cuenta desde el login. Cada negocio mantiene sus propios datos. Gestiona el plan, el vencimiento y la activación desde Restaurantes; los pagos se registran manualmente.</p><a href="/saas/restaurants">Ver restaurantes<Icon name="arrow-right" size={14}/></a></div></section>
  </>;
}

function safeCsvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\uFEFF]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function exportAccounts(accounts) {
  const header = ['Nombre', 'Correo electrónico', 'Restaurante', 'Estado', 'Fecha de registro (America/La_Paz)', 'Último acceso (America/La_Paz)'];
  const rows = accounts.map(account => [account.name, account.email, account.restaurantName, account.active ? 'Activa' : 'Inactiva', dateLabel(account.createdAt, 'Cuenta existente'), dateLabel(account.lastLoginAt, 'Sin registros aún', true)]);
  const csv = '\uFEFF' + [header, ...rows].map(row => row.map(safeCsvCell).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([csv], {type: 'text/csv;charset=utf-8;'}));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'atencion-cuentas.csv';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Accounts({accounts, onOpen, embedded = false}) {
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [exportMessage, setExportMessage] = useState('');
  const filtered = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('es');
    return accounts.filter(account => {
      const matchesState = stateFilter === 'all' || (stateFilter === 'active' ? account.active : !account.active);
      return matchesState && (!query || [account.name, account.email, account.restaurantName].some(value => String(value || '').toLocaleLowerCase('es').includes(query)));
    });
  }, [accounts, search, stateFilter]);
  const exportButton = <Button icon="download" title="Descargar las cuentas visibles en formato CSV" disabled={!filtered.length} onClick={() => {exportAccounts(filtered); setExportMessage(`Se exportaron ${filtered.length} ${filtered.length === 1 ? 'cuenta' : 'cuentas'}.`);}}>Exportar cuentas</Button>;
  return <section className={`saas-accounts ${embedded ? 'saas-accounts-embedded' : ''}`} aria-label="Cuentas de Atencion">
    {embedded ? <div className="saas-section-heading"><div><h2>Cuentas de Atencion</h2><p>Los propietarios de los restaurantes de esta instalación.</p></div>{exportButton}</div> : <Heading title="Cuentas de Atencion" actions={exportButton}>Consulta las cuentas propietarias. Los gerentes y garzones se administran en Equipo, dentro de cada restaurante.</Heading>}
    <div className="saas-panel">
      <div className="saas-filters">
        <label className="saas-search"><span className="saas-visually-hidden">Buscar cuentas</span><Icon name="search" size={18}/><input type="search" placeholder="Buscar por nombre, correo o restaurante" value={search} onChange={event => {setSearch(event.target.value); setExportMessage('');}}/></label>
        <label className="saas-filter-state"><span>Estado de cuenta</span><select value={stateFilter} onChange={event => {setStateFilter(event.target.value); setExportMessage('');}}><option value="all">Todas las cuentas</option><option value="active">Activas</option><option value="inactive">Inactivas</option></select></label>
      </div>
      <div className="saas-results-meta"><span role="status">{filtered.length} {filtered.length === 1 ? 'cuenta' : 'cuentas'}{filtered.length !== accounts.length ? ` de ${accounts.length}` : ''}</span><span>Fechas en hora de Bolivia</span></div>
      {filtered.length ? <>
        <div className="saas-table-wrap saas-account-table"><table><caption className="saas-visually-hidden">Cuentas propietarias de Atencion</caption><thead><tr><th scope="col">Nombre</th><th scope="col">Correo</th><th scope="col">Restaurante</th><th scope="col">Estado</th><th scope="col">Registro</th><th scope="col">Último acceso</th><th scope="col"><span className="saas-visually-hidden">Acciones</span></th></tr></thead><tbody>{filtered.map(account => <tr key={account.id}>
          <th scope="row"><button className="saas-text-button" onClick={() => onOpen(account.id)}>{account.name || 'Sin nombre'}</button></th><td className="saas-email-cell">{account.email || 'Sin correo'}</td><td>{account.restaurantName || 'Sin restaurante asociado'}</td><td><Status active={account.active}/></td><td className="saas-date-cell">{dateLabel(account.createdAt, 'Cuenta existente')}</td><td className="saas-date-cell">{dateLabel(account.lastLoginAt, 'Sin registros aún', true)}</td><td><button className="saas-icon-button" aria-label={`Ver cuenta de ${account.name || account.email}`} onClick={() => onOpen(account.id)}><Icon name="chevron-right" size={18}/></button></td>
        </tr>)}</tbody></table></div>
        <ul className="saas-account-cards">{filtered.map(account => <li key={account.id}><div className="saas-account-card-heading"><div><button className="saas-text-button" onClick={() => onOpen(account.id)}>{account.name || 'Sin nombre'}</button><span>{account.email || 'Sin correo'}</span></div><Status active={account.active}/></div><dl><div><dt>Restaurante</dt><dd>{account.restaurantName || 'Sin restaurante asociado'}</dd></div><div><dt>Registro</dt><dd>{dateLabel(account.createdAt, 'Cuenta existente')}</dd></div><div><dt>Último acceso</dt><dd>{dateLabel(account.lastLoginAt, 'Sin registros aún', true)}</dd></div></dl><Button icon="arrow-right" onClick={() => onOpen(account.id)} aria-label={`Ver cuenta de ${account.name || account.email}`}>Ver cuenta</Button></li>)}</ul>
      </> : <EmptyState icon={accounts.length ? 'search' : 'users'} title={accounts.length ? 'No hay cuentas con esos filtros' : 'No hay cuentas propietarias'} action={accounts.length ? <Button onClick={() => {setSearch(''); setStateFilter('all');}}>Limpiar filtros</Button> : null}>{accounts.length ? 'Prueba con otro nombre, correo o restaurante, o cambia el estado.' : 'Las cuentas propietarias guardadas en esta instalación aparecerán aquí. Los miembros del equipo se consultan dentro de cada restaurante.'}</EmptyState>}
    </div>
    <p className="saas-export-message" role="status">{exportMessage}</p>
  </section>;
}

function AccountDetails({account, restaurants, onClose}) {
  const associated = restaurants.filter(restaurant => restaurant.id === account.restaurantId || restaurant.owners.some(owner => owner.id === account.id));
  return <Modal title={account.name || 'Cuenta de Atencion'} description="Cuenta de cliente de Atencion" onClose={onClose} className="saas-detail-modal">
    <div className="saas-detail-status"><Status active={account.active}/><span>{account.email || 'Sin correo registrado'}</span></div>
    <dl className="saas-detail-list"><div><dt>Fecha de registro</dt><dd>{dateLabel(account.createdAt, 'Cuenta existente')}</dd></div><div><dt>Último acceso</dt><dd>{dateLabel(account.lastLoginAt, 'Sin registros aún', true)}</dd></div></dl>
    <h3>Restaurantes asociados</h3>
    {associated.length ? <ul className="saas-associated-list">{associated.map(restaurant => <li key={restaurant.id}><Icon name="store" size={18}/><div><strong>{restaurant.name}</strong><span>{restaurant.slug}</span></div><ServiceStatus paused={restaurant.servicePaused}/></li>)}</ul> : <p className="saas-detail-note">Esta cuenta no tiene un restaurante asociado en la instalación.</p>}
    <p className="saas-detail-note">Las fechas se muestran en hora de Bolivia. «Cuenta existente» indica que el registro original no guardó una fecha.</p>
    <p className="saas-detail-note">La administración del restaurante requiere iniciar sesión con su cuenta de cliente.</p>
  </Modal>;
}

function Owners({owners}) {
  return owners.length ? <ul className="saas-owner-list">{owners.map(owner => <li key={owner.id}><strong>{owner.name || 'Propietario'}</strong><span>{owner.email || 'Sin correo'}{owner.active ? '' : ' · Cuenta inactiva'}</span></li>)}</ul> : <span className="saas-muted">Sin propietario asociado</span>;
}

function Resources({restaurant}) {
  return <dl className="saas-resources"><div><dt>Mesas activas</dt><dd>{restaurant.activeTables} / {restaurant.totalTables}</dd></div><div><dt>Productos</dt><dd>{restaurant.products}</dd></div><div><dt>Equipo</dt><dd>{restaurant.staff}</dd></div></dl>;
}

function Restaurants({restaurants, onOpen}) {
  return <>
    <Heading title="Restaurantes">Consulta los restaurantes, sus propietarios y los recursos guardados en esta instalación.</Heading>
    <section className="saas-panel" aria-label="Restaurantes de Atencion"><div className="saas-results-meta"><span>{restaurants.length} {restaurants.length === 1 ? 'restaurante' : 'restaurantes'}</span><span>Versión local</span></div>
      {restaurants.length ? <>
        <div className="saas-table-wrap saas-restaurant-table"><table><caption className="saas-visually-hidden">Restaurantes de esta instalación</caption><thead><tr><th scope="col">Restaurante</th><th scope="col">Propietarios y contacto</th><th scope="col">Recursos</th><th scope="col">Atención</th><th scope="col">Versión</th><th scope="col"><span className="saas-visually-hidden">Acciones</span></th></tr></thead><tbody>{restaurants.map(restaurant => <tr key={restaurant.id}><th scope="row"><button className="saas-text-button" onClick={() => onOpen(restaurant.id)}>{restaurant.name}</button><span className="saas-cell-subtitle">{restaurant.slug}</span><span className="saas-cell-subtitle">{restaurant.currency} · {restaurant.timezone}</span></th><td><Owners owners={restaurant.owners}/></td><td><Resources restaurant={restaurant}/></td><td><ServiceStatus paused={restaurant.servicePaused}/></td><td><span className="saas-edition">{restaurant.subscription?.planDetails?.name||'Sin plan'} · {restaurant.subscription?.effectiveStatus}</span></td><td><button className="saas-icon-button" aria-label={`Ver restaurante ${restaurant.name}`} onClick={() => onOpen(restaurant.id)}><Icon name="chevron-right" size={18}/></button></td></tr>)}</tbody></table></div>
        <ul className="saas-restaurant-cards">{restaurants.map(restaurant => <li key={restaurant.id}><div className="saas-account-card-heading"><div><button className="saas-text-button" onClick={() => onOpen(restaurant.id)}>{restaurant.name}</button><span>{restaurant.slug}</span></div><ServiceStatus paused={restaurant.servicePaused}/></div><p className="saas-card-location">{restaurant.currency} · {restaurant.timezone}</p><div className="saas-card-owners"><h3>Propietarios y contacto</h3><Owners owners={restaurant.owners}/></div><Resources restaurant={restaurant}/><div className="saas-card-footer"><span className="saas-edition">{restaurant.subscription?.planDetails?.name||'Sin plan'} · {restaurant.subscription?.effectiveStatus}</span><Button icon="arrow-right" onClick={() => onOpen(restaurant.id)} aria-label={`Ver restaurante ${restaurant.name}`}>Ver restaurante</Button></div></li>)}</ul>
      </> : <EmptyState icon="store" title="No hay restaurantes registrados">Los restaurantes guardados en esta instalación aparecerán aquí junto con sus propietarios y recursos.</EmptyState>}
    </section>
  </>;
}

function RestaurantDetails({restaurant, onClose,onSaved}) {
  return <Modal title={restaurant.name} description={restaurant.slug} onClose={onClose} className="saas-detail-modal">
    <div className="saas-detail-status"><ServiceStatus paused={restaurant.servicePaused}/><span className="saas-edition">{restaurant.subscription?.planDetails?.name||'Sin plan'} · {restaurant.subscription?.effectiveStatus}</span></div>
    <dl className="saas-detail-list"><div><dt>Moneda</dt><dd>{restaurant.currency}</dd></div><div><dt>Zona horaria</dt><dd>{restaurant.timezone}</dd></div><div><dt>Mesas activas / total</dt><dd>{restaurant.activeTables} / {restaurant.totalTables}</dd></div><div><dt>Productos</dt><dd>{restaurant.products}</dd></div><div><dt>Miembros del equipo</dt><dd>{restaurant.staff}</dd></div></dl>
    <SubscriptionEditor restaurant={restaurant} onSaved={onSaved}/><h3>Propietarios y contacto</h3><Owners owners={restaurant.owners}/>
    <p className="saas-detail-note">Los recursos y la pausa de atención se gestionan en el panel del restaurante.</p>
    <p className="saas-detail-note">La administración del restaurante requiere iniciar sesión con su cuenta de cliente.</p>
  </Modal>;
}

function Activity({activity}) {
  return <>
    <Heading title="Actividad">Accesos exitosos de propietarios registrados desde que se habilitó el historial. Fechas en la zona horaria de Bolivia.</Heading>
    <section className="saas-panel" aria-label="Historial de accesos"><div className="saas-section-heading saas-panel-heading"><h2>Accesos de propietarios</h2><span className="saas-muted">{activity.length} {activity.length === 1 ? 'registro' : 'registros'}</span></div>
      {activity.length ? <ol className="saas-activity-list">{activity.map(entry => <li key={entry.id}><span className="saas-activity-icon"><Icon name="key-round" size={19}/></span><div><strong>{entry.label || 'Inicio de sesión'}</strong><p>{entry.actorName || 'Propietario'}<span> · </span>{entry.restaurantName || 'Restaurante'}</p><span className="saas-activity-email">{entry.actorEmail}</span></div><time dateTime={entry.createdAt}>{dateLabel(entry.createdAt, 'Sin fecha registrada', true)}</time></li>)}</ol> : <EmptyState icon="history" title="Sin accesos registrados todavía">Los próximos accesos exitosos de propietarios aparecerán aquí. Las sesiones anteriores a este registro no se reconstruyen.</EmptyState>}
    </section>
  </>;
}
