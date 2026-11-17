(()=>{'use strict';
const $=id=>document.getElementById(id);
const labels={ACCEPTED:'Pedido aceptado',PACKING:'Pedido siendo empaquetado',SHIPPED:'Pedido enviado',AGENCY_ARRIVED:'Pedido llegó a la agencia de destino',DELIVERED:'Pedido entregado',CUSTOMER_CONFIRMED:'Recepción confirmada',PROOF_UPLOADED:'Constancia de entrega adjuntada'};
const node=(tag,value)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=String(value);return n};
const add=(parent,tag,value)=>{const n=node(tag,value);parent.appendChild(n);return n};
const date=v=>v?new Date(v).toLocaleString('es-PE'):'—';
const money=v=>'S/ '+(Number(v||0)/100).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
const note=(msg)=>{$('status').textContent=msg};
async function api(url,options={}){
 const r=await fetch(url,{credentials:'same-origin',cache:'no-store',...options});
 const body=await r.json().catch(()=>({}));
 if(!r.ok)throw Error(body.error||'No se pudo consultar el pedido ('+r.status+')');
 return body;
}
function view(orders){
 const list=$('orders');list.replaceChildren();
 if(!orders.length){const empty=add(list,'div','Aún no tienes compras pagadas asociadas al correo con el que ingresaste.');empty.className='empty';return}
 for(const o of orders){
  const card=add(list,'article');card.className='card';
  add(card,'h2','Pedido '+o.id);
  const dateLine=add(card,'p','Compra verificada: '+date(o.paidAt)+' · '+money(o.amountCents));dateLine.className='date';
  for(const it of o.items||[]){const p=add(card,'p',String(it.qty||1)+' × '+String(it.title||it.id));p.className='meta'}
  const mode=add(card,'p',o.shippingMode==='PROVINCE'?'Envío a provincias':'Entrega local');mode.className='info';
  if(o.carrier)add(card,'p','Transportista / repartidor: '+o.carrier).className='meta';
  if(o.trackingNumber)add(card,'p','Número de guía: '+o.trackingNumber).className='meta';
  if(o.agency)add(card,'p','Agencia o ciudad de destino: '+o.agency).className='meta';
  if(o.trackingUrl){
   const link=add(card,'a','Consultar guía en la empresa de transporte');
   link.href=o.trackingUrl;link.target='_blank';link.rel='noopener noreferrer';link.className='proof-link';
  }
  const stages=['ACCEPTED','PACKING','SHIPPED',...(o.shippingMode==='PROVINCE'?['AGENCY_ARRIVED']:[]),'DELIVERED'];
  const rank=stages.indexOf(o.status);
  const events=o.history||[];
  const timeline=add(card,'ol');timeline.className='timeline';
  for(let i=0;i<stages.length;i++){
   const s=stages[i],li=add(timeline,'li');if(i<=rank)li.className='done';
   add(li,'strong',labels[s]);
   const matching=events.filter(e=>e.status===s);const last=matching[matching.length-1];
   const fallback=s==='ACCEPTED'?o.paidAt:s==='DELIVERED'?o.deliveredAt:null;
   add(li,'small',i<=rank?date(last?.at||fallback):'Pendiente');
  }
  if(o.shippingMode==='PROVINCE'&&o.status!=='DELIVERED'&&o.status!=='AGENCY_ARRIVED'){
   add(card,'p','Para verificar dónde está tu pedido, consulta el número de guía con el transportista. La llegada a la ciudad no significa que el destinatario ya lo haya recibido.').className='muted';
  }
  if(o.evidenceKind){
   const proof=add(card,'p','Constancia registrada el '+date(o.evidenceUploadedAt));proof.className='meta';
   const link=add(card,'a','Ver fotografía o constancia de entrega');
   link.href='/api/customer/orders/'+encodeURIComponent(o.id)+'/proof';
   link.target='_blank';link.rel='noopener';link.className='proof-link';
  }
  if(o.status==='DELIVERED'&&!o.customerConfirmedAt){
   const confirm=add(card,'div');confirm.className='confirmation';
   add(confirm,'p','La tienda registró la entrega. Si ya recibiste los productos correctamente, puedes confirmar tu conformidad.');
   const button=add(confirm,'button','Confirmo que recibí mi pedido');
   const line=add(confirm,'p');line.className='msg';
   button.onclick=async()=>{
    if(!window.confirm('¿Confirmas que recibiste correctamente este pedido?'))return;
    button.disabled=true;line.textContent='Registrando tu conformidad…';
    try{await api('/api/customer/orders/'+encodeURIComponent(o.id)+'/confirm',{method:'POST'});line.textContent='Recepción confirmada. Gracias.';await load()}
    catch(e){line.textContent=e.message;button.disabled=false}
   };
   add(confirm,'p','Si hay algún problema, no confirmes todavía. Comunícate con la tienda indicando tu número de pedido.').className='muted';
  }
  if(o.customerConfirmedAt){
   const confirmed=add(card,'p','Recepción confirmada por tu cuenta el '+date(o.customerConfirmedAt));
   confirmed.className='confirmation';
  }
 }
}
async function load(){
 note('Consultando pedidos…');
 try{const data=await api('/api/customer/orders');view(data.orders||[]);note('Información actualizada.')}
 catch(e){
  $('orders').replaceChildren();
  const msg=add($('orders'),'div',e.message);msg.className='empty';
  add($('orders'),'p','Inicia sesión en la tienda con el correo utilizado en tu compra y vuelve a Mis pedidos.').className='muted';
  note('No fue posible consultar los pedidos.');
 }
}
$('reload').onclick=load;load();
})();
