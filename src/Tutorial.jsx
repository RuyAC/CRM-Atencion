import {useEffect,useId,useRef,useState} from 'react';
import {Icon,Logo} from './ui';
import './tutorial.css';

function tourSteps(data){
  const restaurant=data.restaurant.name||'Mate bar';
  const tables=data.tables.filter(table=>table.active!==false);
  const table=tables.find(item=>item.number===1)||tables[0];
  return [
    {theme:'welcome',icon:'bell',label:'Bienvenido a AUnToque',title:'¡Tu versión local ya está lista!',description:`Todo listo para modernizar la atención de ${restaurant}.`,rows:[
      ['Todas las funciones disponibles','Acceso completo a las funciones del sistema para tu operación.'],
      ['Sin suscripciones ni cobros','Sin cobros automáticos ni compromisos de permanencia.'],
      ['Clientes sin aplicación','El cliente escanea el QR de la mesa y abre la página en su celular.'],
    ],tip:'Sigue este recorrido de 1 minuto para conocer tu nuevo panel.'},
    {theme:'tables',icon:'dashboard',label:'Mesas y salón',title:'Mesas y códigos QR listos',description:'Cada mesa tiene un enlace y un código QR exclusivo para sus clientes.',rows:[
      [`${tables.length} ${tables.length===1?'mesa activa':'mesas activas'}`,'Listas para escanear con la cámara del celular y probar en vivo.'],
      ['Crea tantas mesas como necesites','Agrega salón, terraza, patio o barra con unos pocos toques.'],
      ['Carteles listos para imprimir','Descarga el QR o imprime los carteles y guárdalos como PDF.'],
    ],tip:table?`Abre ${table.name} en tu celular para ver la pantalla del cliente.`:'Crea una mesa para probar la pantalla del cliente.',action:{label:'Ver mesas',href:'/dashboard/tables',permission:'tables'}},
    {theme:'menu',icon:'book-open',label:'Menú digital',title:'Menú digital en el celular',description:'Presenta tus platos, porciones y bebidas con una imagen profesional.',rows:[
      ['Categorías y productos organizados','Separa entradas, platos principales, bebidas y postres.'],
      ['Fotos y descripciones atractivas','Agrega imágenes, videos y detalles para ayudar a tus clientes a elegir.'],
      ['Pausa rápida de productos','¿Se agotó un producto? Márcalo sin reimprimir el menú.'],
    ],tip:'El menú sigue disponible aunque pauses las nuevas llamadas.',action:{label:'Ver menú',href:'/dashboard/menu',permission:'menu'}},
    {theme:'tv',icon:'tv',label:'Modo TV y salón',title:'Panel del salón en tiempo real',description:'Ábrelo en la Smart TV del salón o en una tablet con sonido.',rows:[
      ['Llamadas en pantalla completa','Aparecen al instante con el tiempo de espera y la identificación de la mesa.'],
      ['Alertas sonoras suaves','Un sonido avisa al equipo cuando llega una nueva solicitud.'],
      ['Sin instalación necesaria','Funciona directamente en el navegador de la TV, tablet o computadora.'],
    ],tip:data.settings.tvRequirePin?'PIN de 4 dígitos para que solo el equipo atienda.':'Activa la protección con PIN en Configuración para limitar el acceso al equipo.',action:{label:'Abrir modo TV',href:`/tv/${data.restaurant.slug}`,external:true}},
    {theme:'wifi',icon:'wifi',label:'Protección Wi-Fi',title:'Seguridad contra llamadas falsas',description:'Valida que los clientes estén en el restaurante antes de llamar.',rows:[
      ['Protección mediante Wi-Fi','La validación por IP permite llamar desde las redes autorizadas.'],
      ['Registro en un clic','Conéctate al Wi-Fi del salón y guarda tu red autorizada.'],
      ['Modo flexible opcional','Puedes probar sin restricciones y activar la validación cuando quieras.'],
    ],tip:'Registra el Wi-Fi de tus clientes para proteger el salón.',action:{label:'Configurar Wi-Fi',href:'/dashboard/networks',permission:'networks'}},
    {theme:'buttons',icon:'sliders-vertical',label:'Botones de llamada',title:'Atención rápida y precisa',description:'El garzón llega a la mesa sabiendo lo que necesita el cliente.',rows:[
      ['Pedir la cuenta de forma sencilla','El cliente avisa al equipo y el pago se coordina directamente en la mesa.'],
      ['Botones a tu medida','Crea botones como «Hielo / limón», «Hablar con el gerente» o «Limpiar mesa».'],
      ['Más agilidad en el salón','Reduce las idas y vueltas del equipo y facilita la atención.'],
    ],tip:'Los botones claros ayudan a tu equipo durante las horas de mayor demanda.',action:{label:'Ajustar botones',href:'/dashboard/buttons',permission:'buttons'}},
    {theme:'ready',icon:'users',label:'Equipo y ¡listo!',title:'¡Salón conectado y listo!',description:'Registra a tu equipo y comienza a operar hoy mismo.',rows:[
      ['Acceso propio para garzones','Garzones y gerentes atienden y finalizan llamadas desde el celular.'],
      ['Reportes de atención','Consulta el tiempo medio de respuesta y las mesas con mayor movimiento.'],
      ['Soporte siempre a mano','Puedes volver a ver este recorrido cuando quieras desde el menú lateral.'],
    ],tip:'¡Listo! Descarga los carteles de tus mesas y prueba AUnToque en vivo.',action:{label:'Ver equipo',href:'/dashboard/staff',permission:'staff'}},
  ];
}

export default function Tutorial({data,allowed=[],onClose,returnFocusRef}){
  const [step,setStep]=useState(0);
  const dialogRef=useRef(null),headingRef=useRef(null),closeRef=useRef(onClose);
  const titleId=useId(),descriptionId=useId();
  closeRef.current=onClose;
  useEffect(()=>{
    const dialog=dialogRef.current;
    const previous=returnFocusRef?.current||document.activeElement;
    const oldOverflow=document.body.style.overflow;
    document.body.style.overflow='hidden';
    dialog.showModal();
    headingRef.current?.focus({preventScroll:true});
    const cancel=event=>{event.preventDefault();closeRef.current();};
    const keyboard=event=>{
      if(event.key==='Escape')event.stopPropagation();
      if(event.key!=='Tab')return;
      const controls=[...dialog.querySelectorAll('button:not(:disabled),a[href]')].filter(node=>node.getClientRects().length);
      const first=controls[0],last=controls.at(-1);
      if(event.shiftKey&&(document.activeElement===first||!controls.includes(document.activeElement))){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!controls.includes(document.activeElement))){event.preventDefault();first?.focus();}
    };
    dialog.addEventListener('cancel',cancel);
    dialog.addEventListener('keydown',keyboard);
    return()=>{
      dialog.removeEventListener('cancel',cancel);
      dialog.removeEventListener('keydown',keyboard);
      document.body.style.overflow=oldOverflow;
      if(previous instanceof HTMLElement&&previous.isConnected&&!previous.closest('[inert]'))previous.focus({preventScroll:true});
    };
  },[returnFocusRef]);
  const steps=tourSteps(data),current=steps[step];
  const action=current.action;
  const canOpen=action&&(!action.permission||allowed.includes(action.permission));
  const progress=(step+1)/steps.length*100;
  return <dialog ref={dialogRef} className="t-tour" aria-modal="true" aria-labelledby={titleId} aria-describedby={descriptionId} onClick={event=>{
    if(event.target!==dialogRef.current)return;
    const box=dialogRef.current.getBoundingClientRect();
    if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)onClose();
  }}>
    <div className="t-tour-progress" role="progressbar" aria-label="Progreso del tutorial" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-valuetext={`Paso ${step+1} de ${steps.length}`}><span style={{width:`${progress}%`}}/></div>
    <header className="t-tour-header"><div><span className="t-tour-badge">Tour rápido</span><span className="t-tour-counter" aria-live="polite" aria-atomic="true">Paso {step+1} de {steps.length}</span></div><div><button className="t-tour-skip" type="button" onClick={onClose}>Omitir</button><button className="t-tour-close" type="button" aria-label="Cerrar tutorial" onClick={onClose}><Icon name="x" size={18}/></button></div></header>
    <div className={`t-tour-body t-tour-${current.theme}`}>
      <div className="t-tour-intro"><span className="t-tour-icon">{step===0?<Logo compact size={44}/>:<Icon name={current.icon} size={20}/>}</span><div><p className="t-tour-label">{step===0?current.label:`Paso ${step+1} de ${steps.length} · ${current.label}`}</p><h2 ref={headingRef} id={titleId} tabIndex={-1}>{current.title}</h2><p className="t-tour-description" id={descriptionId}>{current.description}</p></div></div>
      <ul className="t-tour-rows">{current.rows.map(([title,description])=><li key={title}><span className="t-tour-check"><Icon name="check-circle" size={13}/></span><div><strong>{title}</strong><p>{description}</p></div></li>)}</ul>
      <div className="t-tour-tip"><Icon name="lightbulb" size={15}/><p>{current.tip}</p>{canOpen?<a className="t-tour-link" href={action.href} target={action.external?'_blank':undefined} rel={action.external?'noopener noreferrer':undefined}>{action.label}<Icon name={action.external?'external':'arrow-right'} size={11}/></a>:null}</div>
    </div>
    <footer className="t-tour-footer"><nav className="t-tour-dots" aria-label="Pasos del tutorial">{steps.map((item,index)=><button key={item.theme} type="button" aria-label={`Ir al paso ${index+1}`} aria-current={index===step?'step':undefined} onClick={()=>setStep(index)}><span className={index===step?'active':''}/></button>)}</nav><div className="t-tour-actions">{step>0?<button className="t-tour-previous" type="button" onClick={()=>setStep(value=>value-1)}><Icon name="arrow-left" size={13}/>Anterior</button>:null}<button className={step===steps.length-1?'t-tour-next t-tour-finish':'t-tour-next'} type="button" onClick={step===steps.length-1?onClose:()=>setStep(value=>value+1)}>{step===steps.length-1?'Comenzar a usar':'Siguiente paso'}<Icon name={step===steps.length-1?'sparkles':'arrow-right'} size={14}/></button></div></footer>
  </dialog>;
}
