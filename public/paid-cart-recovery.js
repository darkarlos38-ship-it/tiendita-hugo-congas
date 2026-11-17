// Recuperación del carrito de una compra real ya confirmada.
// No crea intentos de pago: consulta D1 y sincroniza solo el pedido autenticado.
(()=>{
 'use strict';
 const attemptKey='hc_checkout_live_attempt_20261117_retry1';
 function attempt(){
  try{return JSON.parse(sessionStorage.getItem(attemptKey)||'null')}catch{return null}
 }
 async function recover(){
  const record=attempt(),orderId=String(record?.orderId||'');
  if(!record?.submitted||!/^HC-LIVE-[0-9a-f-]{36}$/i.test(orderId))return;
  try{
   const r=await fetch('/api/izipay/order-status-live',{
    method:'POST',headers:{'Content-Type':'application/json'},
    cache:'no-store',body:JSON.stringify({orderId})
   });
   if(!r.ok)return;
   const state=await r.json();
   if(state.orderId!==orderId||state.status!=='PAID')return;
   sessionStorage.removeItem('hc_checkout_live_cart');
   record.completed=true;sessionStorage.setItem(attemptKey,JSON.stringify(record));
   const sync=await fetch('/api/customer/cart/consume-paid',{
    method:'POST',headers:{'Content-Type':'application/json'},
    credentials:'same-origin',cache:'no-store',body:JSON.stringify({orderId})
   });
   // Un invitado no tiene carrito de cuenta. Si la sincronización falla, conservar
   // el carrito visible para facilitar una verificación manual, sin nuevos cobros.
   if(!sync.ok&&sync.status!==401)return;
   if(typeof cart!=='undefined'&&Array.isArray(cart)){
    // No se borran productos ajenos a la compra en la cuenta guardada;
    // una recarga restaura el carrito ya conciliado desde Cloudflare.
    if(sync.ok){
     const flag='hc_paid_cart_recovered_'+orderId;
     if(!sessionStorage.getItem(flag)){
      sessionStorage.setItem(flag,'1');
      location.reload();
     }
    }
   }
  }catch{/* Fallo de red: no borra carritos ni inicia otro pago. */}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',recover,{once:true});
 else recover();
})();
