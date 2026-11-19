import {useEffect,useState} from 'react';
import {Bell,BookOpen,CheckCircle2,Clock,Pause,Play,Receipt,Smartphone,Tv,UserCheck} from 'lucide-react';
import './live-demo.css';

const scenes = [
  {title:'El cliente llama',description:'Mesa 04 solicita un garzón'},
  {title:'Aviso inmediato',description:'La solicitud entra en la cola en tiempo real'},
  {title:'El equipo atiende',description:'El garzón acepta la solicitud'},
  {title:'Cliente informado',description:'Notificación: tu garzón está en camino'},
];

export default function LiveDemo(){
  const [step,setStep]=useState(0);
  const [playing,setPlaying]=useState(()=>!window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [bill,setBill]=useState(false);
  useEffect(()=>{
    if(!playing)return;
    const timer=window.setInterval(()=>setStep(current=>(current+1)%scenes.length),2600);
    return()=>window.clearInterval(timer);
  },[playing]);
  useEffect(()=>{
    const media=window.matchMedia('(prefers-reduced-motion: reduce)');
    const changed=()=>{if(media.matches)setPlaying(false);};
    media.addEventListener('change',changed);
    return()=>media.removeEventListener('change',changed);
  },[]);
  function select(index){setStep(index);setPlaying(false);}
  function request(isBill){setBill(isBill);select(1);}

  return <section className="at-live-demo" id="demo" aria-label="Demostración de atención en vivo">
    <div className="at-live-header"><span><i className={playing?'is-playing':''}/> DEMO EN VIVO · TIEMPO REAL</span><button type="button" onClick={()=>setPlaying(value=>!value)} aria-label={playing?'Pausar demostración':'Continuar demostración'}>{playing?<Pause size={12}/>:<Play size={12}/>}<span>{playing?'Pausar':'Reproducir'}</span></button></div>
    <div className="at-live-steps" aria-label="Pasos de la demostración">{scenes.map((scene,index)=><button key={scene.title} type="button" onClick={()=>select(index)} aria-label={`${index+1}. ${scene.title}`} aria-current={step===index?'step':undefined} className={step===index?'is-current':step>index?'is-past':''}><span/><strong>{index+1}. {scene.title}</strong></button>)}</div>
    <div className="at-live-stage" aria-live={playing?'off':'polite'} aria-atomic="true">
      {step===0&&<div className="at-live-card at-live-client" key="client"><div className="at-live-card-head"><span><Smartphone size={16}/> Mesa 04 · Salón</span><small>Presencia confirmada</small></div><p>Toca para solicitar atención en tu mesa:</p><button type="button" className="at-live-call" onClick={()=>request(false)}><Bell size={16} fill="currentColor"/> Llamar al garzón</button><div className="at-live-shortcuts"><a href="#menu-digital"><BookOpen size={13}/> Ver menú</a><span>•</span><button type="button" onClick={()=>request(true)}><Receipt size={13}/> Pedir la cuenta</button></div></div>}
      {step===1&&<div className="at-live-card at-live-alert" key="alert"><div className="at-live-card-head"><span><Tv size={16}/> Panel del equipo y TV</span><small>NUEVA SOLICITUD (00:04s)</small></div><div className="at-live-queue"><span className="at-live-table">M04</span><div><h3>Mesa 04 — Salón principal</h3><p><Clock size={12}/>{bill?'Espera la cuenta':'Espera un garzón'} · hace 4 s</p></div><span className="at-live-pending">Pendiente</span></div></div>}
      {step===2&&<div className="at-live-card at-live-staff" key="staff"><div className="at-live-card-head"><span><UserCheck size={16}/> Celular del garzón (Lucas)</span><small>Atención rápida</small></div><div className="at-live-destination"><div><span>DESTINO</span><strong>Mesa 04 · {bill?'Solicitud de cuenta':'Llamada al garzón'}</strong></div><span>Espera: 12 s</span></div><button type="button" className="at-live-accept" onClick={()=>select(3)}><CheckCircle2 size={16}/> Atender solicitud de Mesa 04</button></div>}
      {step===3&&<div className="at-live-card at-live-confirmation" key="confirmation"><div className="at-live-card-head"><span><Smartphone size={16}/> Mesa 04 · Celular del cliente</span><small>Respuesta en 12 s</small></div><div className="at-live-success"><span><CheckCircle2 size={25}/></span><h3>¡Tu garzón está en camino!</h3><p>Lucas recibió tu solicitud y se dirige a la <strong>Mesa 04</strong>.</p></div></div>}
    </div>
    <div className="at-live-caption"><span>{scenes[step].description}</span><strong>Paso {step+1} de 4</strong></div>
    <p className="at-live-disclaimer">Simulación ilustrativa. No envía solicitudes al restaurante.</p>
  </section>;
}
