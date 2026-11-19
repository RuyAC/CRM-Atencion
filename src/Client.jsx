import {useEffect, useMemo, useRef, useState} from 'react';
import {useStore, act, money} from './lib';
import {Icon, Logo} from './ui';
import './client.css';

const requestActive = r => r.status === 'pending' || r.status === 'accepted' || r.status === 'serving';
const asDate = value => value ? new Date(value).getTime() : 0;

function RestaurantMark({restaurant, small = false}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [restaurant.logoUrl]);
  return <div className={`client-restaurant-mark ${small ? 'small' : ''}`}>
    {restaurant.logoUrl && !failed ? <img src={restaurant.logoUrl} alt="" onError={() => setFailed(true)}/> : restaurant.name?.slice(0, 1).toUpperCase() || 'M'}
  </div>;
}

function ClientDialog({children, onClose, className = '', label}) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const previousFocus = document.activeElement;
    dialog.showModal();
    const old = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = old;
      if (dialog.open) dialog.close();
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({preventScroll: true});
    };
  }, []);
  return <dialog ref={ref} className={`client-dialog ${className}`} aria-label={label} onCancel={e => {e.preventDefault(); onClose();}} onClick={e => {if (e.target === e.currentTarget) onClose();}}>{children}</dialog>;
}

function Price({product, story = false}) {
  const promoted = product.promoPrice != null && product.promoPrice >= 0 && product.promoPrice < product.price;
  return <span className={`client-price ${story ? 'story-price' : ''}`}>
    {promoted && !story ? <del>{money(product.price)}</del> : null}
    <strong>{money(promoted ? product.promoPrice : product.price)}</strong>
    {promoted && story ? <del>{money(product.price)}</del> : null}
  </span>;
}

const tagNames = {'vegetarian': 'Vegetariano', 'gluten-free': 'Sin gluten', 'spicy': 'Picante', 'popular': 'Más pedido', 'new': 'Novedad', 'homemade': 'Artesanal', 'house-special': 'Especial de la casa'};
function tagLabel(tag) {return typeof tag === 'string' ? tagNames[tag] || tag : tag.label || tag.name;}

function ProductMedia({product, story = false}) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [product.id, product.imageUrl, product.videoUrl]);
  if (story && product.videoUrl && !failed) return <video key={product.videoUrl} className="story-media" src={product.videoUrl} poster={product.imageUrl || undefined} controls autoPlay={!(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)} muted playsInline preload="metadata" onError={() => setFailed(true)}/>;
  if (product.imageUrl && !failed) return <img className={story ? 'story-media' : ''} src={product.imageUrl} alt={story ? product.name : ''} loading={story ? 'eager' : 'lazy'} onError={() => setFailed(true)}/>;
  return <span className={`client-media-placeholder ${story ? 'story-media' : ''}`}><Icon name="utensils" size={story ? 64 : 32}/>{story ? <span>{product.name}</span> : null}</span>;
}

function ProductStory({products, index, setIndex, close}) {
  const product = products[index];
  const start = useRef(null);
  const move = direction => setIndex((index + direction + products.length) % products.length);
  useEffect(() => {
    const key = e => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {e.preventDefault(); setIndex(i => (i + 1) % products.length);}
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {e.preventDefault(); setIndex(i => (i - 1 + products.length) % products.length);}
    };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [products.length, setIndex]);
  return <ClientDialog onClose={close} className="client-story-dialog" label={`Menú: ${product.name}`}>
    <div className="client-story-stage" onTouchStart={e => {start.current = {x: e.touches[0].clientX, y: e.touches[0].clientY};}} onTouchEnd={e => {
      if (!start.current || !e.changedTouches[0] || products.length < 2) return;
      const dx = e.changedTouches[0].clientX - start.current.x, dy = e.changedTouches[0].clientY - start.current.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) > 50) move(Math.abs(dx) > Math.abs(dy) ? dx < 0 ? 1 : -1 : dy < 0 ? 1 : -1);
      start.current = null;
    }}>
      <ProductMedia product={product} story/>
      <button className="story-close" onClick={close} aria-label="Cerrar producto"><Icon name="x" size={20}/></button>
      {products.length > 1 ? <div className="story-progress" aria-label={`${index + 1} de ${products.length}`}>
        {products.map((p, i) => <span key={p.id} className={i <= index ? 'seen' : ''}/>)}
      </div> : null}
      {products.length > 1 ? <><button className="story-arrow previous" onClick={() => move(-1)} aria-label="Producto anterior"><Icon name="chevron-left" size={24}/></button><button className="story-arrow next" onClick={() => move(1)} aria-label="Siguiente producto"><Icon name="chevron-right" size={24}/></button></> : null}
      <div className="story-description">
        <div className="story-tags"><span className="menu-tag">MENÚ</span>{(product.tags || []).map(tag => <span className="story-tag" key={tagLabel(tag)}>{/vegetar/i.test(tagLabel(tag)) ? <Icon name="sprout" size={13}/> : null}{tagLabel(tag)}</span>)}{product.available === false ? <span className="story-tag">Agotado</span> : null}</div>
        <h2>{product.name}</h2>
        <div className="story-price-row"><Price product={product} story/><span>Desliza para navegar</span></div>
        <p>{product.description}</p>
      </div>
    </div>
  </ClientDialog>;
}

function Menu({data, table, close}) {
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [storyIndex, setStoryIndex] = useState(null);
  const [storyProducts, setStoryProducts] = useState([]);
  const {restaurant, settings, categories = [], products = []} = data;
  const visible = useMemo(() => products.filter(p => p.active !== false && (settings.showUnavailable !== false && settings.showSoldOut !== false || p.available !== false)), [products, settings.showUnavailable, settings.showSoldOut]);
  const filtered = useMemo(() => {
    const text = search.toLocaleLowerCase('es-BO').trim();
    return visible.filter(p => (category === 'all' || p.categoryId === category) && (!text || [p.name, p.description, ...(p.tags || []).map(tagLabel)].join(' ').toLocaleLowerCase('es-BO').includes(text)));
  }, [visible, category, search]);
  const featured = visible.filter(p => p.featured && p.available !== false);
  const openStory = (list, i) => {setStoryProducts(list); setStoryIndex(i);};
  return <div className="client-menu-sheet">
    <button className="client-back" onClick={close}><Icon name="arrow-left" size={17}/>Volver a la mesa</button>
    <header className="client-menu-header"><RestaurantMark restaurant={restaurant} small/><div><h1>{restaurant.name}</h1><p><span>MENÚ</span>{table.name || `Mesa ${String(table.number).padStart(2, '0')}`}</p></div><span className="menu-result-count">{filtered.length} {filtered.length === 1 ? 'producto' : 'productos'}</span></header>
    <div className="client-search"><Icon name="search" size={22}/><input autoComplete="off" type="search" aria-label="Buscar en el menú" placeholder="Buscar en el menú..." value={search} onChange={e => setSearch(e.target.value)}/>{search ? <button onClick={() => setSearch('')} aria-label="Limpiar búsqueda"><Icon name="x" size={18}/></button> : null}</div>
    <nav className="client-categories" aria-label="Categorías del menú"><button className={category === 'all' ? 'selected' : ''} aria-pressed={category === 'all'} onClick={() => setCategory('all')}>Todos</button>{categories.filter(c => c.active !== false).map(c => <button className={category === c.id ? 'selected' : ''} key={c.id} onClick={() => setCategory(c.id)} aria-pressed={category === c.id}>{c.name}</button>)}</nav>
    {featured.length && category === 'all' && !search ? <section className="client-featured" aria-label="Destacados"><h2><Icon name="star" size={19}/>Destacados</h2><div>{featured.map((p, i) => <button className="client-feature" key={p.id} onClick={() => openStory(featured, i)}><ProductMedia product={p}/><span><strong>{p.name}</strong><Price product={p}/></span>{p.videoUrl ? <Icon name="play" size={24}/> : null}</button>)}</div></section> : null}
    <div className="client-product-grid">
      {filtered.map((product, i) => <button className={`client-product ${product.available === false ? 'unavailable' : ''}`} key={product.id} onClick={() => openStory(filtered, i)} aria-label={`Ver ${product.name}${product.available === false ? ', agotado' : ''}`}>
        <span className="client-product-image"><ProductMedia product={product}/>{product.available === false ? <span className="sold-out-overlay">Agotado</span> : product.videoUrl ? <span className="product-play"><Icon name="play" size={16}/></span> : null}</span>
        <span className="client-product-copy"><strong>{product.name}</strong><span className="product-short-description">{product.description}</span><span className="product-price-line"><Price product={product}/>{product.available === false ? <span className="unavailable-badge">No disponible</span> : null}</span></span>
      </button>)}
    </div>
    {!filtered.length ? <div className="client-menu-empty"><Icon name={search ? 'search' : 'utensils'} size={42}/><h2>{search ? 'No se encontraron productos' : 'Estamos preparando el menú'}</h2><p>{search ? 'Prueba con otro nombre o elige una categoría.' : 'Pronto tendremos novedades para ti. Nuestro equipo puede ayudarte.'}</p>{search || category !== 'all' ? <button onClick={() => {setSearch(''); setCategory('all');}}>Ver todos los productos</button> : null}</div> : null}
    {storyIndex != null && storyProducts[storyIndex] ? <ProductStory products={storyProducts.map(p => products.find(current => current.id === p.id) || p)} index={storyIndex} setIndex={setStoryIndex} close={() => setStoryIndex(null)}/> : null}
  </div>;
}

export default function Client() {
  const token = decodeURIComponent(location.pathname.split('/t/')[1]?.split('/')[0] || '');
  const {data, loading, connected, error: loadError, refresh} = useStore({token});
  const [menu, setMenu] = useState(() => new URLSearchParams(location.search).get('menu') === '1');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [billDialog, setBillDialog] = useState(false);
  const [presence, setPresence] = useState(null);
  const [now, setNow] = useState(Date.now());
  const coordsRef = useRef(null);
  useEffect(() => {const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer);}, []);
  const mode = data?.settings?.presenceMode || 'basic';
  useEffect(() => {
    if (!data) return;
    let ignore = false;
    const cached = coordsRef.current;
    const maxAge = Math.max(1, Number(data.settings?.sessionMinutes) || 90) * 60000;
    if (cached && Date.now() - cached.createdAt >= maxAge) coordsRef.current = null;
    act('presence.check', {token, coords: coordsRef.current?.value}).then(value => {if (!ignore) setPresence(value);}).catch(() => {if (!ignore) setPresence({allowed: false});});
    return () => {ignore = true;};
  }, [token, mode, !!data, data?.settings?.paused, data?.settings?.scheduleEnabled, data?.settings?.sessionMinutes]);
  if (loading && !data) return <main className="client-page"><div className="client-loading"><span className="client-spinner"/>Abriendo tu mesa...</div></main>;
  if (!data) return <main className="client-page"><div className="client-error-sheet"><Icon name="wifi-off" size={42}/><h1>No se pudo abrir la mesa</h1><p>{loadError || 'Revisa tu conexión e inténtalo de nuevo.'}</p><button onClick={refresh}>Intentar de nuevo</button></div></main>;
  const {restaurant, settings = {}, tables = [], requests = [], buttons = []} = data;
  const table = tables.find(t => t.token === token) || (data.table?.token === token ? data.table : null);
  if (!table || table.active === false || restaurant.slug !== location.pathname.split('/')[2]) return <main className="client-page"><div className="client-error-sheet"><Icon name="qr-code" size={42}/><h1>Este código QR no está disponible</h1><p>Pide al equipo el código actualizado de tu mesa.</p></div></main>;
  const current = requests.filter(r => r.tableId === table.id).sort((a, b) => asDate(b.createdAt) - asDate(a.createdAt))[0];
  const countdown = current?.status === 'completed' ? Math.max(0, Math.ceil(((asDate(current.completedAt) + (settings.cooldownSeconds ?? 10) * 1000) - now) / 1000)) : 0;
  const active = current && (requestActive(current) || current.status === 'completed' && countdown > 0) ? current : null;
  const isBill = active?.type === 'BILL_REQUEST' || active?.type === 'bill';
  const pending = active?.status === 'pending';
  const serving = active?.status === 'accepted' || active?.status === 'serving';
  const completed = active?.status === 'completed';
  const enabled = buttons.filter(b => b.active !== false).sort((a, b) => (a.order || 0) - (b.order || 0));
  const callButton = enabled.find(b => b.type === 'CALL');
  const menuButton = enabled.find(b => b.type === 'MENU');
  const billButton = enabled.find(b => b.type === 'BILL_REQUEST');
  const extras = enabled.filter(b => b !== callButton && b !== menuButton && b !== billButton);
  function cachedCoordinates() {
    const cached = coordsRef.current;
    if (!cached) return null;
    const maxAge = Math.max(1, Number(settings.sessionMinutes) || 90) * 60000;
    if (Date.now() - cached.createdAt >= maxAge) {coordsRef.current = null; return null;}
    return cached.value;
  }
  async function locate() {
    const cached = cachedCoordinates();
    if (cached) return cached;
    if (!navigator.geolocation) throw new Error('Tu navegador no ofrece ubicación. Usa el Wi-Fi del restaurante.');
    const coords = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(p => resolve({latitude: p.coords.latitude, longitude: p.coords.longitude, accuracy: p.coords.accuracy}), () => reject(new Error('Ubicación no autorizada. Permite el acceso a tu ubicación o conéctate al Wi-Fi del restaurante.')), {enableHighAccuracy: true, timeout: 15000, maximumAge: 60000}));
    coordsRef.current = {value: coords, createdAt: Date.now()};
    return coords;
  }
  async function create(button, type) {
    if (busy) return;
    if (type === 'MENU') {setMenu(true); return;}
    if (type === 'EXTERNAL' || type === 'LINK') {
      try {const url = new URL(button.url); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); window.open(url.href, '_blank', 'noopener,noreferrer');} catch {setError('Este enlace todavía no está configurado. Pide ayuda al equipo.');}
      return;
    }
    setBusy(true); setError('');
    try {
      let coords = cachedCoordinates();
      if (button?.requirePresence) {
        let check = await act('presence.check', {token, coords});
        if (!check.allowed && check.reason === 'location' && mode === 'fallback') {
          coords = await locate();
          check = await act('presence.check', {token, coords});
        }
        setPresence(check);
        if (!check.allowed) throw new Error(check.message || 'No pudimos confirmar tu presencia. Conéctate al Wi-Fi del restaurante.');
      }
      const operationId = typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-')}`;
      await act('request.create', {token, type, buttonId: button?.id, coords, operationId, skipCooldown: completed});
      if (type === 'BILL_REQUEST') setBillDialog(true);
    } catch (e) {setError(e.message || 'No se pudo enviar. Revisa tu conexión e inténtalo de nuevo.');}
    finally {setBusy(false);}
  }
  async function cancel() {
    if (!active || busy) return;
    setBusy(true); setError('');
    try {await act('request.cancel', {id: active.id, token}); setBillDialog(false);} catch (e) {setError(e.message);} finally {setBusy(false);}
  }
  const stateClass = completed ? 'completed' : serving ? 'serving' : pending ? isBill ? 'bill-pending' : 'pending' : 'ready';
  const mainTitle = completed ? '¡Atención realizada!' : serving ? isBill ? '¡La cuenta está en camino!' : '¡El garzón está en camino!' : pending ? isBill ? '¡Cuenta solicitada!' : '¡Garzón llamado!' : callButton?.label || 'Llamar al garzón';
  return <main className="client-page" style={{'--client-primary': restaurant.primaryColor || '#0284c7'}}>
    {!connected ? <div className="client-connection-warning" role="status"><Icon name="wifi-off" size={16}/>Conexión interrumpida. Reconectando...</div> : null}
    {menu ? <Menu data={data} table={table} close={() => setMenu(false)}/> : <div className="client-table-sheet">
      {restaurant.coverUrl ? <div className="client-cover"><img src={restaurant.coverUrl} alt=""/></div> : null}
      <header className="client-table-header"><RestaurantMark restaurant={restaurant}/><h1>{restaurant.name}</h1><div className="client-table-badges"><span className="client-table-badge">{table.name || `Mesa ${String(table.number).padStart(2, '0')}`}</span><span className={`client-presence-badge ${presence?.allowed ? '' : 'unconfirmed'}`}><Icon name={presence?.allowed ? 'wifi' : presence?.reason === 'closed' ? 'clock' : 'map-pin'} size={16}/>{presence?.allowed ? 'Presencia confirmada' : presence?.reason === 'closed' ? settings.paused ? 'Atención pausada' : 'Fuera de horario' : mode === 'basic' ? 'Confirmando presencia' : 'Validación de presencia'}</span></div></header>
      <div className="client-welcome"><h2>{settings.welcomeTitle || '¿Cómo podemos ayudarte?'}</h2><p>{settings.welcomeSubtitle || 'Toca el botón de abajo para llamar a nuestro equipo directamente a tu mesa.'}</p></div>
      {error ? <div className="client-action-error" role="alert"><Icon name="circle-alert" size={19}/><span>{error}</span><button onClick={() => setError('')} aria-label="Cerrar aviso"><Icon name="x" size={16}/></button></div> : null}
      {callButton || active ? <div className={`client-main-action ${stateClass}`} aria-live="polite">
        <button className="client-main-button" onClick={() => create(callButton, 'CALL')} disabled={busy || !connected || !!active}>
          <span className="client-main-icon">{busy ? <span className="client-spinner"/> : <Icon name={completed ? 'circle-check' : serving ? 'user-check' : isBill ? 'receipt' : 'bell'} size={40}/>}</span>
          {active ? <span className="client-state-eyebrow">{completed ? '¡TODO LISTO!' : serving ? 'EN ATENCIÓN' : 'ESPERANDO ATENCIÓN'}</span> : null}
          <strong>{busy ? 'Enviando...' : mainTitle}</strong>
          <span className="client-main-description">{completed ? `Tu mesa estará disponible en ${countdown}s` : serving ? `${active.staffName || 'Equipo de atención'} está yendo a tu mesa.` : pending ? 'Nuestro equipo ya fue avisado. Espera un momento.' : 'Estamos listos para atenderte'}</span>
          {!active ? <span className="client-touch-hint"><Icon name="hand" size={15}/>Toca para llamar</span> : null}
        </button>
        {pending ? <button className="client-cancel" disabled={busy} onClick={cancel}><Icon name="x" size={16}/>{isBill ? 'Cancelar pedido de cuenta' : 'Cancelar llamada'}</button> : completed ? <button className="client-cancel" disabled={busy || !connected} onClick={() => create(callButton, 'CALL')}>Llamar nuevamente<Icon name="arrow-right" size={16}/></button> : null}
      </div> : null}
      <div className="client-secondary-actions">
        {menuButton ? <button className="client-secondary-action menu" onClick={() => setMenu(true)}><span className="client-secondary-icon"><Icon name="book-open" size={28}/></span><span><strong>{menuButton.label || 'Ver menú'}</strong><small>Fotos y precios</small></span><Icon name="chevron-right" size={20}/></button> : null}
        {billButton ? <button className="client-secondary-action bill" onClick={() => create(billButton, 'BILL_REQUEST')} disabled={busy || !connected || isBill || serving || completed}><span className="client-secondary-icon"><Icon name="receipt" size={28}/></span><span><strong>{isBill ? 'Cuenta solicitada' : pending ? 'Cambiar a cuenta' : billButton.label || 'Pedir la cuenta'}</strong><small>Pago en la mesa</small></span><Icon name={isBill ? 'check' : 'chevron-right'} size={20}/></button> : null}
      </div>
      {extras.length ? <div className="client-extra-actions">{extras.map(b => <button key={b.id} disabled={busy || !connected && b.type !== 'MENU' && b.type !== 'EXTERNAL' && b.type !== 'LINK'} onClick={() => create(b, b.type)}><Icon name={b.type === 'EXTERNAL' || b.type === 'LINK' ? 'external-link' : b.type === 'MENU' ? 'book-open' : 'bell'} size={22}/><span>{b.label}</span><Icon name="chevron-right" size={18}/></button>)}</div> : null}
      {settings.wifiName ? <div className="client-wifi-info"><Icon name="wifi" size={17}/><span>Wi-Fi: <strong>{settings.wifiName}</strong>{settings.wifiPassword ? <> · Contraseña: <strong>{settings.wifiPassword}</strong></> : null}</span></div> : null}
      <footer className="client-provider"><Logo size={18}/><span>Tecnología para una mejor experiencia</span></footer>
    </div>}
    {billDialog ? <ClientDialog label="Cuenta solicitada" onClose={() => setBillDialog(false)} className="client-bill-dialog"><span className="client-success-icon"><Icon name="circle-check" size={36}/></span><h2>¡Cuenta solicitada!</h2><p>Nuestro equipo ya fue avisado y llevará la cuenta a tu mesa.</p><button className="client-confirm" onClick={() => setBillDialog(false)}>Perfecto</button><button className="client-dialog-cancel" disabled={busy} onClick={cancel}>Cancelar</button></ClientDialog> : null}
  </main>;
}

