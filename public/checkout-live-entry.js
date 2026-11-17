// Entrada de compra real del carrito. Fail-closed: el botón permanece oculto hasta que el Worker autorice.
(()=>{
  'use strict';
  const button=document.getElementById('hc-checkout-live-button');
  if(!button)return;
  button.style.setProperty('display','none','important');
  window.hcCheckoutLive=function(){
    try{
      if(typeof cart==='undefined'||!Array.isArray(cart)||cart.length===0){alert('Agrega un instrumento al carrito.');return}
      const items=cart.map(v=>({id:v.id,qty:v.qty}));
      if(items.some(v=>!Number.isSafeInteger(Number(v.qty))||Number(v.qty)<1))throw Error('Carrito inválido');
      // Una compra confirmada permite empezar otra solo al volver a entrar
      // voluntariamente desde el carrito; no se borra un intento pendiente.
      try{
        const key='hc_checkout_live_attempt_20261117_retry1';
        const previous=JSON.parse(sessionStorage.getItem(key)||'null');
        if(previous?.completed===true)sessionStorage.removeItem(key);
      }catch{}
      sessionStorage.setItem('hc_checkout_live_cart',JSON.stringify(items));
      location.assign('/checkout.html');
    }catch{alert('No se pudo preparar el carrito. Actualiza la página.')}
  };
  fetch('/api/izipay/config',{cache:'no-store'})
    .then(r=>{if(!r.ok)throw Error('not ready');return r.json()})
    .then(v=>{
      if(v.production!==true)return;
      button.style.setProperty('display','block','important');
      button.disabled=typeof cart==='undefined'||!Array.isArray(cart)||cart.length===0;
    }).catch(()=>{});
})();
