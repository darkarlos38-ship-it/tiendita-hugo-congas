(()=>{'use strict';
const $=id=>document.getElementById(id);
let orders=[],catalogPhotos=new Map();
const money=n=>'S/ '+(Number(n||0)/100).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
const photoOkay=url=>typeof url==='string'&&(
 /^\/(?:images|media)\/[a-zA-Z0-9._/-]+$/.test(url)||
 /^https:\/\/[^\s<>"']+$/i.test(url)
);
function purchaseSummary(card,o){
 const wrap=element('section','',card);wrap.className='order-purchase';
 const top=element('div','',wrap);top.className='purchase-top';
 const caption=element('div','',top);
 element('span','PRODUCTOS QUE DEBE PREPARAR',caption).className='eyebrow';
 element('h3','Qué compró este cliente',caption);
 const amount=element('div','',top);amount.className='purchase-amount';
 element('small','TOTAL PAGADO',amount);
 element('strong',money(o.amountCents),amount);
 element('small','Pago confirmado por Izipay',amount);
 const goods=element('div','',wrap);goods.className='purchase-goods';
 for(const it of Array.isArray(o.items)?o.items:[]){
  const line=element('div','',goods);line.className='purchase-item';
  const picture=catalogPhotos.get(String(it.id));
  if(picture){
   const img=element('img','',line);img.src=picture;img.alt='Foto del instrumento';img.loading='lazy';img.className='purchase-photo';
  }else{
   const placeholder=element('span','📦',line);placeholder.className='purchase-placeholder';placeholder.setAttribute('aria-hidden','true');
  }
  const info=element('div','',line);info.className='purchase-description';
  element('b',String(it.title||'Producto registrado sin nombre'),info);
  const quantity=Number(it.qty)||1;
  element('div',quantity+' '+(quantity===1?'unidad':'unidades'),info).className='purchase-quantity';
  if(it.unit_cents!==undefined&&Number.isSafeInteger(Number(it.unit_cents))&&Number(it.unit_cents)>=0){
   element('p','Precio unitario: '+money(it.unit_cents)+' · Subtotal: '+money(Number(it.unit_cents)*quantity),info).className='purchase-price';
  }
 }
 element('p','Antes de preparar la caja, comprueba los nombres y cantidades de estos productos.',wrap).className='summary-help';
}
async function loadPhotos(){
 try{
  const res=await fetch('/api/catalog',{credentials:'same-origin',cache:'no-store'});
  if(!res.ok)return;
  const body=await res.json();
  for(const p of Array.isArray(body.products)?body.products:[])
   if(photoOkay(p.image))catalogPhotos.set(String(p.id),p.image);
 }catch{/* Las fotos son opcionales: el monto y los productos siguen visibles. */}
}

const names={ACCEPTED:'Pedido aceptado',PACKING:'Siendo empaquetado',SHIPPED:'Enviado con repartidor o transportista',AGENCY_ARRIVED:'Llegó a la agencia de destino',DELIVERED:'Pedido entregado',CUSTOMER_CONFIRMED:'Recepción confirmada',PROOF_UPLOADED:'Constancia registrada'};
const next={ACCEPTED:['PACKING'],PACKING:['SHIPPED'],SHIPPED:['AGENCY_ARRIVED','DELIVERED'],AGENCY_ARRIVED:['DELIVERED'],DELIVERED:[]};
const node=(tag,text)=>{const v=document.createElement(tag);if(text!==undefined)v.textContent=String(text||'');return v};
const element=(tag,text,parent)=>{const v=node(tag,text);if(parent)parent.appendChild(v);return v};
const time=v=>v?new Date(v).toLocaleString('es-PE'):'—';
const message=(text,error=false)=>{const s=$('status');s.textContent=text;s.classList.toggle('error',error)};
function field(parent,label,value='',type='text',maximum=160){
 const wrap=element('div','',parent);wrap.className='group';
 const title=element('label',label,wrap);
 const input=element('input','',wrap);input.type=type;input.maxLength=maximum;input.value=value;
 title.appendChild(input);
 return input;
}
async function api(url,options={}){
 const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
 const j=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(j.error||'No fue posible completar la operación');
 return j;
}
function view(){
 const list=$('orders');list.replaceChildren();
 const search=$('search').value.toLowerCase().trim();
 const shown=orders.filter(o=>[o.id,o.buyer?.name,o.buyer?.email,o.buyer?.district,o.trackingNumber,...(o.items||[]).map(x=>x.title)].join(' ').toLowerCase().includes(search));
 if(!shown.length){list.appendChild(node('p','No hay pedidos pagados que coincidan.'));return}
 for(const o of shown){
  const card=element('article','',list);card.className='card';
  card.id='pedido-'+o.id;
  const header=element('div','',card);header.className='actions';
  const title=element('h2','Pedido '+o.id,header);
  const pill=element('span',names[o.status]||o.status,header);pill.className='pill';
  purchaseSummary(card,o);
  const recipient=element('section','',card);recipient.className='purchase-recipient';
  const who=element('div','',recipient);
  element('span','ENTREGAR A',who).className='eyebrow';
  element('strong',o.buyer?.name||'Nombre no registrado',who);
  element('p',[o.buyer?.phone,o.buyer?.email].filter(Boolean).join(' · ')||'Sin datos de contacto',who);
  const where=element('div','',recipient);
  element('span','DIRECCIÓN DE ENTREGA',where).className='eyebrow';
  element('strong',[o.buyer?.address,o.buyer?.district].filter(Boolean).join(' · ')||'Dirección no registrada',where);
  if(o.buyer?.deliveryReference)element('p','Referencia: '+o.buyer.deliveryReference,where);
  element('h3','1. Preparar y enviar el pedido',card).className='step-heading';
  const grid=element('div','',card);grid.className='grid';
  const modeWrap=element('div','',grid);modeWrap.className='group';element('label','Modalidad de envío',modeWrap);
  const mode=element('select','',modeWrap);
  for(const [val,name] of [['LOCAL','Entrega local'],['PROVINCE','Envío a provincias']]){const option=node('option',name);option.value=val;mode.append(option)}
  mode.value=o.shippingMode;
  const carrier=field(grid,'Repartidor / Empresa transportista',o.carrier);
  const number=field(grid,'Número de guía / referencia',o.trackingNumber);
  const agency=field(grid,'Agencia y ciudad de destino',o.agency);
  const trackingUrl=field(grid,'Enlace HTTPS de seguimiento (opcional)',o.trackingUrl,'url',350);
  const steps=element('div','',grid);steps.className='group';
  element('label','Cambiar estado del pedido',steps);
  const state=element('select','',steps);
  const allowed=[o.status,...(next[o.status]||[])].filter(s=>s!=='AGENCY_ARRIVED'||mode.value==='PROVINCE');
  for(const s of allowed){const opt=node('option',names[s]||s);opt.value=s;state.append(opt)}
  function changeMode(){
   state.replaceChildren();
   for(const s of [o.status,...(next[o.status]||[])].filter(s=>s!=='AGENCY_ARRIVED'||mode.value==='PROVINCE')){
    const opt=node('option',names[s]||s);opt.value=s;state.append(opt)}
   if(o.status==='DELIVERED')mode.disabled=true;
   if(['SHIPPED','AGENCY_ARRIVED'].includes(o.status))mode.disabled=true;
  }
  mode.onchange=changeMode;
  const buttons=element('div','',card);buttons.className='actions';
  const save=element('button','Guardar cambios del pedido',buttons);
  if(o.customerConfirmedAt)save.disabled=true;
  const progress=element('p','',card);progress.className='status';progress.setAttribute('role','status');
  save.onclick=async()=>{
   save.disabled=true;progress.textContent='Actualizando seguimiento…';
   try{
    const data={status:state.value,shippingMode:mode.value,carrier:carrier.value.trim(),trackingNumber:number.value.trim(),
     agency:agency.value.trim(),trackingUrl:trackingUrl.value.trim()};
    await api('/api/gestion/seguimiento/'+encodeURIComponent(o.id),{
     method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
    progress.textContent='Estado actualizado correctamente.';await load();
   }catch(e){progress.textContent=e.message;save.disabled=false}
  };
  element('hr','',card).className='divider';
  const proof=element('div','',card);proof.className='proof';
  element('h3','2. Fotografía o constancia de entrega',proof);
  if(o.evidenceKind){
   element('p','Evidencia registrada el '+time(o.evidenceUploadedAt)+(o.evidenceKind==='CARRIER_PROOF'?' · Operador logístico':' · Entrega local'),proof);
   const a=element('a','Ver foto o constancia protegida',proof);a.href='/api/gestion/seguimiento/'+encodeURIComponent(o.id)+'/proof';a.target='_blank';a.rel='noopener';
  }else if(o.status==='DELIVERED'){
   element('p','La entrega figura cerrada. No es posible registrar nuevas fotos.',proof);
  }else{
   element('p','La jefa recibe la foto del repartidor o constancia de la agencia y la sube aquí. No se debe fotografiar al cliente sin su autorización.',proof).className='hint';
   const row=element('div','',proof);row.className='grid';
   const kindWrap=element('div','',row);kindWrap.className='group';element('label','Tipo de evidencia',kindWrap);
   const kind=element('select','',kindWrap);
   for(const [v,t] of [['DELIVERY_PHOTO','Fotografía de entrega'],['CARRIER_PROOF','Constancia de transportista']]){
    const op=node('option',t);op.value=v;kind.append(op)}
   kind.value=o.shippingMode==='PROVINCE'?'CARRIER_PROOF':'DELIVERY_PHOTO';
   const picWrap=element('div','',row);picWrap.className='group';element('label','Foto JPG, PNG o WebP (máximo 3 MB)',picWrap);
   const pic=element('input','',picWrap);pic.type='file';pic.accept='image/jpeg,image/png,image/webp';pic.setAttribute('capture','environment');
   const upload=element('button','Subir evidencia privada a R2',proof);
   upload.onclick=async()=>{
    if(!pic.files?.[0]){progress.textContent='Selecciona una foto primero.';return}
    upload.disabled=true;progress.textContent='Guardando foto de entrega…';
    try{
     const body=new FormData();body.append('image',pic.files[0]);body.append('kind',kind.value);
     await api('/api/gestion/seguimiento/'+encodeURIComponent(o.id)+'/proof',{method:'POST',body});
     progress.textContent='Evidencia protegida registrada.';await load();
    }catch(e){progress.textContent=e.message;upload.disabled=false}
   };
  }
  const history=element('details','',card);history.style.marginTop='18px';
  element('summary','Historial de seguimiento',history);
  const events=element('ol','',history);events.className='events';
  for(const e of o.history||[])element('li',(names[e.status]||e.status)+' · '+time(e.at)+(e.detail?' · '+e.detail:''),events);
  if(o.customerConfirmedAt)element('p','El comprador confirmó la recepción el '+time(o.customerConfirmedAt),card);
 }
}
async function load(){
 message('Cargando pedidos pagados…');
 try{
  const response=await api('/api/gestion/seguimiento');orders=response.orders||[];
  await loadPhotos();
  message(orders.length+' pedidos con seguimiento disponibles.');view();
  if(location.hash.startsWith('#pedido-HC-LIVE-')){
   const target=document.getElementById(decodeURIComponent(location.hash.slice(1)));
   if(target)target.scrollIntoView({block:'start'});
  }
 }catch(e){message(e.message,true)}
}
$('reload').onclick=load;$('search').oninput=view;load();
})();
