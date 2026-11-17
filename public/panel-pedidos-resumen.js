// Resumen de ventas para administración; solo consulta pedidos pagados verificados.
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const fmt=cents=>'S/ '+(Number(cents||0)/100).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
 const labels={ACCEPTED:'Pedido aceptado',PACKING:'Empaquetando',SHIPPED:'Enviado',AGENCY_ARRIVED:'En agencia de destino',DELIVERED:'Entregado'};
 const el=(tag,txt,parent,klass)=>{
  const n=document.createElement(tag);
  if(txt!==undefined)n.textContent=String(txt||'');
  if(klass)n.className=klass;
  if(parent)parent.appendChild(n);
  return n;
 };
 async function run(){
  const out=$('hc-dashboard-sales'),status=$('hc-dashboard-sales-status');
  if(!out||!status)return;
  try{
   // El panel principal requiere sesión administrativa válida, y el endpoint
   // de pedidos vuelve a exigir la sesión para cada consulta.
   const auth=await fetch('/api/session',{credentials:'same-origin',cache:'no-store'});
   if(!auth.ok||!(await auth.json()).authenticated)return;
   const r=await fetch('/api/gestion/seguimiento',{credentials:'same-origin',cache:'no-store'});
   const body=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(body.error||'Error al consultar las ventas');
   const orders=Array.isArray(body.orders)?body.orders:[];
   out.replaceChildren();
   if(!orders.length){status.textContent='Aún no hay ventas pagadas por preparar.';return}
   status.textContent=orders.length+' ventas confirmadas · Mostrando las 8 más recientes.';
   for(const o of orders.slice(0,8)){
    const card=el('article',undefined,out,'sales-order');
    const head=el('div',undefined,card,'sales-top');
    const buyer=el('div',undefined,head);
    el('div','VENTA CONFIRMADA · '+(labels[o.status]||o.status),buyer,'sales-caption');
    el('div',o.buyer?.name||'Cliente sin nombre registrado',buyer,'sales-name');
    const money=el('div',undefined,head);
    el('div','TOTAL PAGADO',money,'sales-caption');
    el('strong',fmt(o.amountCents),money,'sales-amount');
    for(const item of Array.isArray(o.items)?o.items:[]){
     const line=el('div',undefined,card);
     el('div',String(item.title||'Instrumento sin nombre registrado'),line,'sales-item');
     const qty=Number(item.qty)||1;
     el('div',qty+' '+(qty===1?'unidad':'unidades'),line,'sales-qty');
    }
    const addr=[o.buyer?.address,o.buyer?.district].filter(Boolean).join(' · ');
    el('div','ENTREGA: '+(addr||'Dirección no registrada'),card,'sales-address');
    el('div','Estado: '+(labels[o.status]||o.status),card,'sales-status');
    const action=el('a','Abrir este pedido y preparar el envío',card,'sales-action');
    action.href='/seguimiento-gestion.html#pedido-'+encodeURIComponent(o.id);
   }
  }catch(err){status.textContent='No se pudieron cargar las ventas: '+err.message}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run,{once:true});else run();
})();
