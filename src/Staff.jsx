import {useId,useState} from 'react';
import {Icon,Modal} from './ui';
import LocalBanner from './LocalBanner';
import './staff.css';

const ROLE_OPTIONS=[['OWNER','Owner (Propietario)'],['MANAGER','Manager (Gerente)'],['STAFF','Staff (Atención de mesas)']];
const ROLE_GUIDE=[
  {role:'OWNER',icon:'shield',title:'OWNER (Propietario)',description:'Acceso total e irrestricto: configuración, seguridad, horarios, suscripción y gestión del equipo.'},
  {role:'MANAGER',icon:'user-check',title:'MANAGER (Gerente)',description:'Acceso a llamadas, edición del menú, gestión de mesas, regeneración de códigos QR e informes.'},
  {role:'STAFF',icon:'shield-check',title:<span>STAFF (Atención /<br/>Garzón)</span>,description:'Acceso al panel operativo y al Modo TV/Celular para atender y finalizar mesas con su PIN.'}
];

function generatePassword(){
  const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789$!';
  const values=crypto.getRandomValues(new Uint32Array(8));
  return Array.from(values,n=>alphabet[n%alphabet.length]).join('');
}
function generatePin(){return String(crypto.getRandomValues(new Uint32Array(1))[0]%10000).padStart(4,'0');}
function Button({children,primary=false,icon,className='',...props}){return <button type="button" className={`st-button ${primary?'st-primary':''} ${className}`} {...props}>{icon?<Icon name={icon} size={15}/>:null}{children}</button>;}
function Field({label,children,...props}){const id=useId();return <div className="st-field"><label htmlFor={id}>{label}</label>{children?<select id={id} {...props}>{children}</select>:<input id={id} {...props}/>}</div>;}
function ErrorMessage({children}){return children?<p className="st-error" role="alert"><Icon name="alert-circle" size={15}/>{children}</p>:null;}
function PasswordBlock({value,onChange,visible,setVisible,disabled}){
  const id=useId(),hint=useId();
  return <div className="st-secret-block st-password-block"><div className="st-secret-header"><label htmlFor={id}><Icon name="lock" size={14}/>Contraseña de acceso (mín. 6 caracteres)</label><button type="button" disabled={disabled} onClick={()=>onChange(generatePassword())}><Icon name="sparkles" size={13}/>Generar contraseña</button></div><div className="st-secret-input"><input id={id} aria-describedby={hint} type={visible?'text':'password'} required minLength={6} maxLength={200} autoComplete="new-password" spellCheck={false} value={value} onChange={e=>onChange(e.target.value)} disabled={disabled}/><button type="button" aria-label={visible?'Ocultar contraseña':'Mostrar contraseña'} aria-pressed={visible} disabled={disabled} onClick={()=>setVisible(!visible)}><Icon name={visible?'eye-off':'eye'} size={17}/></button></div><small id={hint}>El colaborador usará el correo y la contraseña para entrar al panel del restaurante.</small></div>;
}
function PinBlock({value,onChange,disabled}){
  const id=useId(),hint=useId();
  return <div className="st-secret-block st-pin-block"><div className="st-secret-header"><label htmlFor={id}><Icon name="key" size={14}/>PIN de acceso al salón (4 dígitos)</label><button type="button" disabled={disabled} onClick={()=>onChange(generatePin())}><Icon name="sparkles" size={13}/>Generar aleatorio</button></div><input id={id} aria-describedby={hint} className="st-pin-input" type="text" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} minLength={4} required autoComplete="off" spellCheck={false} value={value} onChange={e=>onChange(e.target.value.replace(/\D/g,'').slice(0,4))} disabled={disabled}/><small id={hint}>El garzón ingresará este PIN en el celular o en la TV para asumir la atención de las mesas rápidamente.</small></div>;
}

export default function Staff({data,execute,busy}){
  const [dialog,setDialog]=useState(null),[revealed,setRevealed]=useState({}),[visiblePassword,setVisiblePassword]=useState(true),[pending,setPending]=useState(''),[error,setError]=useState(''),[rowError,setRowError]=useState(null),[sessionChanged,setSessionChanged]=useState(false);
  const user=data.viewer?.user,owner=user?.role==='OWNER',locked=busy||Boolean(pending);
  const members=data.staff||[];
  function open(mode,member){setError('');setRowError(null);setVisiblePassword(true);setDialog({mode,item:member?{...member,password:mode==='password'?generatePassword():'',pin:mode==='pin'?generatePin():''}:{name:'',email:'',role:'STAFF',password:generatePassword(),pin:generatePin(),active:true}});}
  function close(){if(!locked){setDialog(null);setError('');}}
  function update(key,value){setDialog(current=>({...current,item:{...current.item,[key]:value}}));setError('');}
  function ownAccessChanged(item){const prior=members.find(member=>member.id===item.id);return item.id===user?.id&&Boolean(item.password||item.pin||item.role&&item.role!==prior?.role||item.active===false);}
  async function save(event){
    event.preventDefault();if(locked)return;
    const item={...dialog.item};
    if(!item.password)delete item.password;if(!item.pin)delete item.pin;
    if(dialog.mode==='new'&&(!item.password||item.password.length<6)){setError('La contraseña debe tener al menos 6 caracteres.');return;}
    if(item.pin&&!/^\d{4}$/.test(item.pin)){setError('Ingresa un PIN de exactamente 4 dígitos.');return;}
    setPending('save');setError('');
    try{await execute('entity.save',{entity:'staff',item},dialog.mode==='new'?'Miembro añadido al equipo.':dialog.mode==='pin'?'PIN actualizado.':dialog.mode==='password'?'Contraseña actualizada.':'Miembro actualizado.');if(item.id)setRevealed(current=>({...current,[item.id]:null}));setDialog(null);if(ownAccessChanged(item))setSessionChanged(true);}
    catch(err){setError(err.message||'No se pudo guardar. Inténtalo de nuevo.');}
    finally{setPending('');}
  }
  async function reveal(member){
    if(locked)return;setRowError(null);
    if(revealed[member.id]){setRevealed(current=>({...current,[member.id]:null}));return;}
    setPending(`pin-${member.id}`);
    try{const result=await execute('staff.pinReveal',{id:member.id});setRevealed(current=>({...current,[member.id]:result.pin||result}));}
    catch(err){setRowError({id:member.id,message:err.message||'No se pudo mostrar el PIN. Vuelve a intentar.'});}
    finally{setPending('');}
  }
  async function changeRole(member,role){
    if(locked||role===member.role)return;setPending(`role-${member.id}`);setRowError(null);
    try{await execute('entity.save',{entity:'staff',item:{id:member.id,role}},'Función actualizada.');if(member.id===user?.id)setSessionChanged(true);}
    catch(err){setRowError({id:member.id,message:err.message||'No se pudo actualizar la función.'});}
    finally{setPending('');}
  }
  async function remove(){
    if(locked)return;setPending('delete');setError('');
    try{await execute('entity.delete',{entity:'staff',id:dialog.item.id},'Miembro eliminado.');setDialog(null);}
    catch(err){setError(err.message||'No se pudo eliminar el miembro. Inténtalo de nuevo.');}
    finally{setPending('');}
  }
  return <div className="st-page">
    <LocalBanner/>
    <header className="st-heading"><div><h1>Equipo y permisos (RBAC)</h1><p>Registra garzones y gerentes, define funciones y gestiona el PIN de 4 dígitos para identificarse en el salón.</p></div><Button primary icon="plus" disabled={locked||(data.subscription?.planDetails?.staff!=null&&members.filter(m=>m.active!==false).length>=data.subscription.planDetails.staff)} onClick={()=>open('new')}><span>Invitar<br/>miembro</span></Button></header>
    <div className="st-role-guide">{ROLE_GUIDE.map(role=><section key={role.role} className={`st-role-card st-${role.role.toLowerCase()}`}><h2><Icon name={role.icon} size={15}/>{role.title}</h2><p>{role.description}</p></section>)}</div>
    <div className="st-member-list">{members.map(member=>{
      const mayEdit=owner||member.role==='STAFF',isSelf=member.id===user?.id;
      return <article className="st-member" key={member.id}><div className="st-member-identity"><span className="st-avatar" aria-hidden="true">{member.name?.slice(0,1).toUpperCase()||'?'}</span><div className="st-member-details"><div className="st-member-name"><button type="button" disabled={locked||!mayEdit} title="Editar nombre y correo" aria-label={`Editar miembro ${member.name}`} onClick={()=>open('edit',member)}>{member.name}</button><span className={`st-role-badge st-${member.role.toLowerCase()}`}>{member.role}</span></div><p><Icon name="mail" size={13}/><span>{member.email}</span></p>{member.active===false?<small className="st-inactive">Inactivo</small>:null}</div></div><div className="st-member-controls"><div className="st-control-line"><div className="st-pin-display"><Icon name="lock" size={14}/><span>PIN salón:</span><strong>{revealed[member.id]||'••••'}</strong><button type="button" disabled={locked||!owner} aria-label={`${revealed[member.id]?'Ocultar':'Mostrar'} PIN de ${member.name}`} aria-pressed={Boolean(revealed[member.id])} title={owner?'': 'Solo el propietario puede consultar el PIN'} onClick={()=>reveal(member)}><Icon name={revealed[member.id]?'eye-off':'eye'} size={14}/></button></div><Button icon="key" disabled={locked||!mayEdit} onClick={()=>open('pin',member)}>Cambiar PIN</Button><Button icon="lock" disabled={locked||!mayEdit} onClick={()=>open('password',member)}>Cambiar contraseña</Button></div><div className="st-control-line"><select className="st-role-select" aria-label={`Función de ${member.name}`} disabled={locked||!mayEdit} value={member.role} onChange={event=>changeRole(member,event.target.value)}>{ROLE_OPTIONS.map(([value,label])=><option key={value} value={value} disabled={(!owner&&value!=='STAFF')||(value==='MANAGER'&&data.subscription?.planDetails?.roles===false)}>{label}</option>)}</select><button className="st-delete" type="button" aria-label={`Eliminar ${member.name}`} title={isSelf?'No puedes eliminar tu propio acceso':'Eliminar miembro'} disabled={locked||isSelf||!mayEdit} onClick={()=>open('delete',member)}><Icon name="trash" size={16}/></button></div></div>{rowError?.id===member.id?<ErrorMessage>{rowError.message}</ErrorMessage>:null}</article>;
    })}</div>
    {!members.length?<div className="st-empty"><Icon name="users" size={26}/><p>Aún no hay miembros en el equipo.</p><Button primary onClick={()=>open('new')}>Invitar miembro</Button></div>:null}
    {dialog?<Modal className={`st-modal ${dialog.mode==='new'?'st-new-member':''}`} title={dialog.mode==='new'?'Nuevo miembro del equipo':dialog.mode==='edit'?'Editar miembro del equipo':dialog.mode==='pin'?'Cambiar PIN del salón':dialog.mode==='password'?'Cambiar contraseña':'Eliminar miembro del equipo'} description={dialog.mode==='new'?'Registra un colaborador, define el correo, la contraseña de acceso, la función y el PIN de 4 dígitos.':dialog.mode==='delete'?`¿Quieres eliminar a ${dialog.item.name}? Su acceso al restaurante quedará desactivado.`:`${dialog.item.name} · ${dialog.item.email}`} onClose={close}>
      {dialog.mode==='delete'?<div className="st-form"><ErrorMessage>{error}</ErrorMessage><div className="st-form-actions"><Button primary disabled={locked} onClick={remove}>{pending==='delete'?'Eliminando…':'Eliminar miembro'}</Button><Button disabled={locked} onClick={close}>Cancelar</Button></div></div>:<form className="st-form" onSubmit={save}>
        {['new','edit'].includes(dialog.mode)?<><Field label="Nombre completo" required maxLength={100} autoComplete="name" placeholder="Ej.: Carlos Oliveira" autoFocus value={dialog.item.name} onChange={e=>update('name',e.target.value)} disabled={locked}/><Field label="Correo de acceso" required type="email" maxLength={160} autoComplete="off" placeholder="carlos@restaurante.com" value={dialog.item.email} onChange={e=>update('email',e.target.value)} disabled={locked}/></>:null}
        {['new','password'].includes(dialog.mode)?<PasswordBlock value={dialog.item.password} onChange={value=>update('password',value)} visible={visiblePassword} setVisible={setVisiblePassword} disabled={locked}/>:null}
        {['new','edit'].includes(dialog.mode)?<Field label="Función / Nivel de acceso" value={dialog.item.role} onChange={e=>update('role',e.target.value)} disabled={locked}>{ROLE_OPTIONS.map(([value,label])=><option key={value} value={value} disabled={(!owner&&value!=='STAFF')||(value==='MANAGER'&&data.subscription?.planDetails?.roles===false)}>{label}</option>)}</Field>:null}
        {['new','pin'].includes(dialog.mode)?<PinBlock value={dialog.item.pin} onChange={value=>update('pin',value)} disabled={locked}/>:null}
        {dialog.mode==='edit'?<label className="st-active-field"><input type="checkbox" checked={dialog.item.active!==false} disabled={locked} onChange={e=>update('active',e.target.checked)}/>Miembro activo</label>:null}
        {dialog.item.id===user?.id&&['pin','password'].includes(dialog.mode)?<p className="st-access-hint">Al guardar, tendrás que volver a iniciar sesión con tus credenciales actualizadas.</p>:null}
        <ErrorMessage>{error}</ErrorMessage><div className="st-form-actions"><Button type="submit" primary disabled={locked}>{pending==='save'?'Guardando…':dialog.mode==='new'?'Añadir al equipo':'Guardar cambios'}</Button><Button disabled={locked} onClick={close}>Cancelar</Button></div>
      </form>}
    </Modal>:null}
    {sessionChanged?<Modal className="st-modal" title="Tu acceso se ha actualizado" description="Vuelve a iniciar sesión para continuar con tus credenciales y permisos actualizados." onClose={()=>window.location.assign('/dashboard')}><div className="st-form"><Button primary onClick={()=>window.location.assign('/dashboard')}>Volver a iniciar sesión</Button></div></Modal>:null}
  </div>;
}
