import {useId, useRef, useState} from 'react';
import {Modal, Icon} from './ui';
import {money} from './lib';
import './product-editor.css';

const presets=[['Más pedido','⭐'],['Vegetariano','🌱'],['Sin gluten','🌾'],['Picante','🌶️'],['Artesanal','👨‍🍳'],['Novedad','🆕'],['Especial de la casa','🥩']];
function Field({label,children,count,...props}){
  const id=useId();return <div className="pe-field"><label htmlFor={id}>{label}{count!==undefined?<small>{count} caracteres</small>:null}</label>{children?children(id):<input id={id} aria-label={label} {...props}/>}</div>;
}
async function upload(file,execute){
  const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('No se pudo leer el archivo. Inténtalo de nuevo.'));reader.readAsDataURL(file);});
  return (await execute('upload.create',{name:file.name,type:file.type,data})).url;
}
export default function ProductEditor({item,data,execute,busy,onClose}){
  const [value,setValue]=useState(()=>({...item,tags:[...(item.tags||[])]}));
  const [priceText,setPriceText]=useState(()=>String((item.price||0)/100)),[promoText,setPromoText]=useState(()=>item.promoPrice==null?'':String(item.promoPrice/100));
  const [media,setMedia]=useState('image'),[tag,setTag]=useState(''),[help,setHelp]=useState(true),[uploading,setUploading]=useState(false),[error,setError]=useState(''),[mediaError,setMediaError]=useState(''),[previewError,setPreviewError]=useState(false);
  const fileRef=useRef(null),errorRef=useRef(null),formId=useId(),helpId=useId();
  const isPhoto=media==='image',mediaKey=isPhoto?'imageUrl':'videoUrl',url=value[mediaKey]||'',normal=priceText,promo=promoText;
  const saving=busy||uploading,discount=value.promoPrice!=null&&value.price>0&&value.promoPrice<value.price;
  const currency=data.settings?.currency||data.restaurant?.currency||'BOB',currencyLabel=currency==='BOB'?'Bs':currency==='BRL'?'R$':currency;
  const category=data.categories.find(category=>category.id===value.categoryId);
  function update(key,next){setValue(current=>({...current,[key]:next}));setError('');if(key==='imageUrl'||key==='videoUrl'){setMediaError('');setPreviewError(false);}}
  function changeMedia(next){setMedia(next);setMediaError('');setPreviewError(false);}
  function addTag(){const clean=tag.trim().slice(0,40);if(clean&&!value.tags.includes(clean)&&value.tags.length<20)update('tags',[...value.tags,clean]);setTag('');}
  async function loadFile(event){
    const file=event.target.files?.[0];event.target.value='';if(!file)return;
    const limit=isPhoto?5:10,types=isPhoto?['image/jpeg','image/png','image/webp']:['video/mp4','video/webm','video/quicktime'];
    if(!types.includes(file.type)){setMediaError(isPhoto?'Usa una imagen JPG, PNG o WEBP.':'Usa un video MP4, MOV o WEBM.');return;}
    if(file.size>limit*1024*1024){setMediaError(`El archivo supera ${limit} MB. Elige uno más pequeño.`);return;}
    const key=mediaKey;setMediaError('');setUploading(true);
    try{update(key,await upload(file,execute));}catch(error){setMediaError(error.message||'No se pudo subir el archivo. Inténtalo de nuevo.');}finally{setUploading(false);}
  }
  async function save(event){
    event.preventDefault();if(saving)return;setError('');
    if(value.promoPrice!=null&&value.promoPrice>=value.price){setError('El precio promocional debe ser menor que el precio normal.');requestAnimationFrame(()=>errorRef.current?.focus());return;}
    try{await execute('entity.save',{entity:'products',item:value},'¡Producto guardado!');onClose();}catch(error){setError(error.message||'No se pudo guardar. Inténtalo de nuevo.');requestAnimationFrame(()=>errorRef.current?.focus());}
  }
  const title=item.id?`Editar: ${item.name}`:'Nuevo producto';
  const footer=<div className="pe-footer"><span className="pe-live"><i/>Menú actualizado en tiempo real para los clientes en las mesas</span><div><button type="button" className="pe-button" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" form={formId} className="pe-button pe-primary" disabled={saving}><Icon name="check" size={16}/>{saving?'Guardando…':item.id?'Guardar cambios':'Guardar producto'}</button></div></div>;
  return <Modal className="pe-dialog" title={title} description="Agrega platos, porciones y bebidas, y personaliza fotos y videos verticales para el menú digital." onClose={saving?()=>{}:onClose} footer={footer}>
    <form id={formId} className="pe-grid" onSubmit={save} aria-busy={saving}>
      <section className="pe-information" aria-labelledby={`${formId}-information`}>
        <div className="pe-section-heading"><h3 id={`${formId}-information`}>INFORMACIÓN DEL MENÚ</h3><span>Datos principales</span></div>
        <div className="pe-fields">
          <Field label="Nombre del producto" required maxLength={140} value={value.name||''} onChange={event=>update('name',event.target.value)} disabled={saving}/>
          <Field label="Categoría en el menú">{id=><select id={id} aria-label="Categoría en el menú" required value={value.categoryId||''} disabled={saving} onChange={event=>update('categoryId',event.target.value)}><option value="">Selecciona una categoría</option>{data.categories.map(category=><option key={category.id} value={category.id}>{category.name}</option>)}</select>}</Field>
          <div className="pe-prices"><Field label={`Precio normal (${currencyLabel})`} type="number" required min="0" max="1000000" step="0.01" value={normal} disabled={saving} onChange={event=>{setPriceText(event.target.value);update('price',Math.round(Number(event.target.value)*100));}}/><Field label="Precio promocional (opcional)" type="number" min="0" step="0.01" value={promo} disabled={saving} onChange={event=>{setPromoText(event.target.value);update('promoPrice',event.target.value===''?null:Math.round(Number(event.target.value)*100));}}/></div>
          {discount?<div className="pe-promotion"><strong><Icon name="sparkles" size={13}/>Promoción activa: {Math.round((1-value.promoPrice/value.price)*100)}% de descuento</strong><span>Ahorro de {money(value.price-value.promoPrice)} para el cliente</span></div>:null}
          <Field label="Descripción detallada del plato" count={(value.description||'').length}>{id=><textarea id={id} aria-label="Descripción detallada del plato" maxLength={3000} rows={3} value={value.description||''} disabled={saving} onChange={event=>update('description',event.target.value)}/>}</Field>
          <div className="pe-tags"><h4>Etiquetas y sellos alimentarios</h4><div className="pe-preset-tags">{presets.map(([name,emoji])=><button type="button" key={name} aria-label={name} aria-pressed={value.tags.includes(name)} disabled={saving} className={value.tags.includes(name)?'selected':''} onClick={()=>update('tags',value.tags.includes(name)?value.tags.filter(tag=>tag!==name):[...value.tags,name].slice(0,20))}><span aria-hidden="true">{emoji}</span>{name}{value.tags.includes(name)?<Icon name="check" size={11}/>:null}</button>)}</div>
            <div className="pe-custom-tag"><input aria-label="Etiqueta personalizada" maxLength={40} value={tag} placeholder="Otra etiqueta personalizada (presiona Enter)" disabled={saving||value.tags.length>=20} onChange={event=>setTag(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();addTag();}}}/><button type="button" disabled={saving||value.tags.length>=20} onClick={addTag}>Agregar</button></div>
            {value.tags.length?<div className="pe-selected-tags">{value.tags.map(tag=><span key={tag}>{presets.find(([name])=>name===tag)?.[1]?<span aria-hidden="true">{presets.find(([name])=>name===tag)[1]}</span>:null}{tag}<button type="button" disabled={saving} aria-label={`Quitar ${tag}`} onClick={()=>update('tags',value.tags.filter(current=>current!==tag))}><Icon name="x" size={11}/></button></span>)}</div>:null}
          </div>
          <label className="pe-featured"><input type="checkbox" aria-label="Producto destacado en el menú" checked={!!value.featured} disabled={saving} onChange={event=>update('featured',event.target.checked)}/><span><strong><Icon name="star" size={14}/>Producto destacado en el menú</strong><small>Fijado en el carrusel superior del menú para darle más visibilidad.</small></span></label>
          {error?<p className="pe-error" ref={errorRef} tabIndex={-1} role="alert">{error}</p>:null}
        </div>
      </section>
      <section className="pe-studio" aria-labelledby={`${formId}-studio`}>
        <div className="pe-section-heading"><h3 id={`${formId}-studio`}>ESTUDIO DE MEDIOS (9:16)</h3><span>Stories y Reels</span></div>
        <div className="pe-media-tabs" aria-label="Tipo de medio"><button type="button" aria-pressed={isPhoto} disabled={saving} onClick={()=>changeMedia('image')}><Icon name="image" size={13}/>Foto vertical{value.imageUrl?<i aria-label="Foto cargada"/>:null}</button><button type="button" aria-pressed={!isPhoto} disabled={saving||data.subscription?.planDetails?.videos===false} title={data.subscription?.planDetails?.videos===false?'Videos disponibles desde Pro':undefined} onClick={()=>changeMedia('video')}><Icon name="film" size={13}/>Video Reels{value.videoUrl?<i aria-label="Video cargado"/>:null}</button></div>
        <div className="pe-media-panel">
          <div className={`pe-phone ${isPhoto?'photo':'video'}`}><div className="pe-camera"/>
            {url&&!previewError?isPhoto?<><img src={url} alt="Vista previa de la foto del producto" onError={()=>setPreviewError(true)}/><span className="pe-stories">9:16 STORIES</span><div className="pe-photo-caption"><small>{category?.name||'MENÚ'}</small><strong>{value.name||'Nombre del producto'}</strong><b>{money(discount?value.promoPrice:value.price)}{discount?<del>{money(value.price)}</del>:null}</b></div></>:<video key={url} src={url} controls playsInline preload="metadata" onError={()=>setPreviewError(true)}/>:<div className="pe-phone-empty"><span><Icon name={isPhoto?'image':'film'} size={20}/></span><strong>{previewError?'No se pudo mostrar el archivo':isPhoto?'Ninguna foto cargada':'Ningún video cargado'}</strong><p>{previewError?'Revisa el enlace o carga otro archivo.':isPhoto?'Agrega una foto vertical para destacar tu plato.':'Graba hasta 10 segundos en vertical para cautivar a tus clientes.'}</p></div>}
          </div>
          <button type="button" className="pe-upload" disabled={saving} onClick={()=>fileRef.current?.click()}><Icon name="upload" size={15}/>{uploading?'Subiendo archivo…':isPhoto?'Cargar foto vertical (JPG, PNG, WEBP)':'Cargar video vertical (MP4, MOV, WEBM)'}</button>
          <input ref={fileRef} type="file" hidden accept={isPhoto?'image/jpeg,image/png,image/webp':'video/mp4,video/quicktime,video/webm'} onChange={loadFile}/>
          <div className="pe-media-link"><span>o enlace:</span><input aria-label={isPhoto?'Enlace de la foto':'Enlace del video'} inputMode="url" type="text" disabled={saving} value={url} placeholder={isPhoto?'https://…/foto.jpg':'https://…/video.mp4'} onChange={event=>update(mediaKey,event.target.value)}/>{url?<button type="button" disabled={saving} aria-label={isPhoto?'Eliminar foto':'Eliminar video'} onClick={()=>update(mediaKey,'')}><Icon name="trash" size={13}/></button>:null}</div>
          {mediaError?<p className="pe-error" role="alert">{mediaError}</p>:null}
          <button type="button" className="pe-help-toggle" aria-expanded={help} aria-controls={helpId} onClick={()=>setHelp(current=>!current)}><span><span aria-hidden="true">💡</span>Consejos para subir {isPhoto?'la foto':'el video'} vertical</span><small>{help?'Ocultar':'Mostrar'}<Icon name={help?'chevron-up':'chevron-down'} size={11}/></small></button>
          {help?<div id={helpId} className="pe-help"><div><span className="pe-help-icon"><Icon name={isPhoto?'smartphone':'film'} size={17}/></span><section><strong>{isPhoto?'Toma la foto':'Graba el video'} con el celular en vertical (9:16)</strong><p>{isPhoto?'Para una mejor visualización al deslizar los platos, utiliza fotos tomadas con el celular de pie, en proporción 9:16 (por ejemplo, 1080 × 1920 píxeles).':'Tus clientes ven el menú en su smartphone y los videos se muestran en formato Reels o Stories. Filmar en vertical ofrece una experiencia más atractiva y apetitosa.'}</p></section></div><ul><li>Orientación: <strong>Vertical 9:16</strong></li><li>{isPhoto?<>Tamaño ideal: <strong>1080 × 1920 px</strong></>:<>Duración ideal: <strong>Hasta 10 s</strong></>}</li><li>{isPhoto?<>Formatos: <strong>JPG, PNG, WEBP (hasta 5 MB)</strong></>:<>Tamaño máximo: <strong>10 MB (MP4, MOV, WEBM)</strong></>}</li></ul></div>:null}
        </div>
      </section>
    </form>
  </Modal>;
}
