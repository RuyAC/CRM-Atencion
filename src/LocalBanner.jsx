import {Icon} from './ui';

export default function LocalBanner(){
  return <section className="st-local-banner" aria-label="Servicio Atencion"><div className="st-local-copy"><div className="st-local-meta"><span>ATENCION</span><Icon name="clock" size={14}/><small>Tu restaurante conectado</small></div><h2>Configura la atención de tu restaurante</h2><p>Consulta las funciones, el estado y el vencimiento de tu plan.</p></div><a className="st-local-link" href="/dashboard/billing"><Icon name="credit-card" size={16}/>Ver suscripción<Icon name="chevron-right" size={16}/></a></section>;
}
