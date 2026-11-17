// Confirmación visual de pago: siempre consulta el pedido en D1.
// Nunca crea cobros, reintenta pagos ni confía en el estado local como prueba de pago.
(()=>{
 'use strict';
 const attemptKey='hc_checkout_live_attempt_20261117_retry1';
 const payment=document.getElementById('payment');
 if(!payment)return;
 let inflight=false,confirmed=false,checks=0;
 const panel=document.createElement('section');
 panel.id='hc-live-payment-result';
 panel.hidden=true;
 panel.setAttribute('role','status');
 panel.setAttribute('aria-live','polite');
 panel.style.cssText='border:1px solid #575757;border-radius:12px;background:#1b1b1b;padding:18px;margin-top:18px';
 const heading=document.createElement('h2');
 heading.style.margin='0 0 8px';
 const detail=document.createElement('p');
 detail.style.margin='0 0 12px';
 const orderLine=document.createElement('p');
 orderLine.style.cssText='overflow-wrap:anywhere;color:#f9c929;margin:0 0 12px';
 const verify=document.createElement('button');
 verify.type='button';
 verify.textContent='Consultar estado del pedido';
 verify.style.marginTop='7px';
 const back=document.createElement('a');
 back.href='/';
 back.textContent='Volver a la tienda';
 back.style.display='inline-block';
 back.style.marginTop='12px';
 panel.append(heading,detail,orderLine,verify,back);
 payment.insertAdjacentElement('afterend',panel);
 const getAttempt=()=>{
  try{
   const a=JSON.parse(sessionStorage.getItem(attemptKey)||'null');
   return a&&typeof a==='object'?a:null;
  }catch{return null}
 };
 function showPending(orderId,review=false){
  if(confirmed)return;
  panel.hidden=false;
  heading.textContent=review?'Pedido en revisión':'Estamos comprobando tu pago';
  detail.textContent=review
   ?'El pedido requiere verificación manual. No pagues otra vez; comunícate con la tienda indicando el número de pedido.'
   :'Si ya pulsaste Pagar, no hagas otro intento. Izipay puede tardar unos instantes en confirmar la operación.';
  orderLine.textContent='Pedido: '+orderId;
  verify.hidden=false;
  // Nunca habilitar un segundo intento para la misma compra.
  const payButton=document.getElementById('pay-button');
  if(payButton)payButton.disabled=true;
 }
 function showPaid(orderId){
  if(confirmed)return;
  confirmed=true;
  panel.hidden=false;
  heading.textContent='¡Pago confirmado!';
  heading.style.color='#70db9b';
  detail.textContent='Tu compra quedó registrada correctamente. Guarda este número para consultar el seguimiento de tu pedido.';
  orderLine.textContent='Pedido: '+orderId;
  verify.hidden=true;
  document.getElementById('checkout-form').hidden=true;
  const blocked=document.getElementById('blocked');
  if(blocked)blocked.hidden=true;
  const status=document.getElementById('status');
  if(status)status.textContent='';
  payment.replaceChildren();
  const attempt=getAttempt();
  if(attempt&&attempt.orderId===orderId){
   attempt.completed=true;
   sessionStorage.setItem(attemptKey,JSON.stringify(attempt));
  }
  // Borrar únicamente el carrito de checkout tras leer PAID desde D1.
  // El carrito guardado de la cuenta se actualiza de manera idempotente en el Worker.
  sessionStorage.removeItem('hc_checkout_live_cart');
  fetch('/api/customer/cart/consume-paid',{
   method:'POST',headers:{'Content-Type':'application/json'},
   credentials:'same-origin',cache:'no-store',body:JSON.stringify({orderId})
  }).then(r=>{
   if(r.status===401)return; // Un comprador invitado no tiene carrito persistente.
   if(!r.ok)throw Error('sync unavailable');
  }).catch(()=>{
   detail.textContent+=' Si todavía ves productos en tu carrito guardado, no vuelvas a pagar; solicita verificar la sincronización del pedido.';
  });
  panel.scrollIntoView({block:'center',behavior:'smooth'});
 }
 async function checkNow(){
  if(inflight||confirmed)return;
  const attempt=getAttempt(),orderId=String(attempt?.orderId||'');
  if(!attempt?.submitted||!/^HC-LIVE-[0-9a-f-]{36}$/i.test(orderId))return;
  inflight=true;
  try{
   const r=await fetch('/api/izipay/order-status-live',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({orderId}),cache:'no-store'
   });
   if(!r.ok)throw Error('Estado no disponible');
   const data=await r.json();
   if(data.orderId!==orderId)throw Error('Referencia inesperada');
   if(data.status==='PAID')showPaid(orderId);
   else showPending(orderId,data.status==='REVIEW_REQUIRED');
  }catch{
   showPending(orderId);
   detail.textContent='No se pudo consultar el estado en este momento. No repitas el pago; usa el botón para verificar este mismo pedido.';
  }finally{inflight=false}
 }
 verify.addEventListener('click',checkNow);
 checkNow();
 const timer=setInterval(()=>{
  if(confirmed){clearInterval(timer);return}
  if(!document.hidden&&checks++<180)checkNow();
 },5000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkNow()});
 window.addEventListener('pageshow',checkNow);
})();
