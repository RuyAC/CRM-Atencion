import {useId, useRef, useState} from 'react';
import {act} from './lib';
import {Icon, Logo} from './ui';
import './registration.css';

function Field({label, hint, ...props}) {
  const id=useId();
  return <label className="a-field" htmlFor={id}><span>{label}</span><input id={id} {...props} aria-label={label} aria-describedby={hint?`${id}-hint`:undefined}/>{hint?<small id={`${id}-hint`}>{hint}</small>:null}</label>;
}

export default function Register() {
  const [form,setForm]=useState({restaurantName:'',ownerName:'',email:'',password:'',confirmPassword:''});
  const [show,setShow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null);
  const errorRef=useRef(null);
  function update(event){setForm(current=>({...current,[event.target.name]:event.target.value}));setError('');}
  async function submit(event){
    event.preventDefault();setError('');
    if(form.password!==form.confirmPassword){setError('Las contraseñas no coinciden. Revisa la confirmación.');requestAnimationFrame(()=>errorRef.current?.focus());return;}
    setBusy(true);
    try {const account=await act('auth.register',form);setForm(current=>({...current,password:'',confirmPassword:''}));setResult(account);}
    catch(err){setError(err.message||'No se pudo crear la cuenta. Inténtalo de nuevo.');requestAnimationFrame(()=>errorRef.current?.focus());}
    finally{setBusy(false);}
  }
  return <main className="a-login a-register"><a className="a-login-brand" href="/login" aria-label="Atencion, inicio de sesión"><Logo/></a>
    {result?<section className="a-login-box a-register-success" aria-labelledby="registration-title">
      <span className="a-login-icon"><Icon name="check-circle" size={29}/></span><h1 id="registration-title">Tu restaurante ya tiene cuenta</h1>
      <p><strong>{result.restaurant.name}</strong> está listo para configurar su menú y empezar a atender.</p>
      <dl><div><dt>Correo de acceso</dt><dd>{result.email}</dd></div><div><dt>Mesas iniciales</dt><dd>5 mesas con su propio QR</dd></div><div><dt>PIN del monitor</dt><dd className="a-register-pin">{result.monitorPin}</dd></div></dl>
      <p className="a-register-help">Guarda el PIN para conectar el monitor. También puedes consultarlo y cambiarlo en Configuración.</p>
      <a className="a-btn primary" href="/dashboard">Ir al panel de mi restaurante<Icon name="arrow-right" size={18}/></a>
    </section>:<section className="a-login-box" aria-labelledby="registration-title">
      <span className="a-login-icon"><Icon name="store" size={29}/></span><h1 id="registration-title">Crea la cuenta de tu restaurante</h1>
      <p>Configura tu menú, genera los QR de tus mesas y recibe las llamadas de tus clientes.</p>
      <form onSubmit={submit} aria-busy={busy}>
        <Field label="Nombre del restaurante" name="restaurantName" autoComplete="organization" minLength={2} maxLength={100} required value={form.restaurantName} onChange={update} disabled={busy}/>
        <Field label="Nombre del propietario" name="ownerName" autoComplete="name" minLength={2} maxLength={100} required value={form.ownerName} onChange={update} disabled={busy}/>
        <Field label="Correo electrónico" name="email" type="email" autoComplete="username" maxLength={160} required value={form.email} onChange={update} disabled={busy}/>
        <div className="a-password-field"><Field label="Contraseña" hint="Al menos 8 caracteres." name="password" type={show?'text':'password'} autoComplete="new-password" minLength={8} maxLength={200} required value={form.password} onChange={update} disabled={busy}/>
          <button className="a-register-show" type="button" aria-label={show?'Ocultar contraseña':'Mostrar contraseña'} aria-pressed={show} onClick={()=>setShow(current=>!current)} disabled={busy}><Icon name={show?'eye-off':'eye'} size={19}/></button></div>
        <Field label="Confirmar contraseña" name="confirmPassword" type={show?'text':'password'} autoComplete="new-password" minLength={8} maxLength={200} required value={form.confirmPassword} onChange={update} disabled={busy}/>
        {error?<p className="a-register-error" ref={errorRef} tabIndex={-1} role="alert"><Icon name="alert-circle" size={18}/><span>{error}</span></p>:null}
        <p className="a-register-help">Empezarás con 5 mesas y el menú vacío. Tus datos se guardan por separado de los demás restaurantes. Moneda inicial: Bs.</p>
        <button className="a-btn primary" type="submit" disabled={busy}>{busy?'Creando tu restaurante…':'Crear cuenta de mi restaurante'}<Icon name="arrow-right" size={18}/></button>
      </form>
      <p className="a-register-login">¿Ya tienes cuenta? <a href="/login">Iniciar sesión</a></p>
    </section>}
    <small>Atencion · Atención inteligente, experiencia memorable.</small>
  </main>;
}
