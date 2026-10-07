import {Icon} from './ui';

export default function LocalBanner(){
  return <section className="st-local-banner" aria-label="Estado de la versión local"><div className="st-local-copy"><div className="st-local-meta"><span>LOCAL</span><Icon name="clock" size={14}/><small>Sin vencimiento</small></div><h2>Tu versión local de Atencion está activa</h2><p>Todas las funciones habilitadas para tu restaurante.</p><div className="st-local-progress-label"><span>Acceso completo</span><span>Versión local activa</span></div><div className="st-local-progress"><span/></div></div><a className="st-local-link" href="/dashboard/billing"><Icon name="credit-card" size={16}/>Ver versión local<Icon name="chevron-right" size={16}/></a></section>;
}
