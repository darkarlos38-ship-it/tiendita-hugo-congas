(()=>{'use strict';// Integración aditiva: no reemplaza admin-ui.js, sus eventos ni su HTML.
const LINK='/panel-gestion.html';function attach(){const workspace=document.getElementById('hc-workspace');const actions=workspace?.querySelector('.hc-admin-actions');if(actions&&!document.getElementById('hc-gestion-access')){const a=document.createElement('a');a.id='hc-gestion-access';a.href=LINK;a.textContent='▦ Panel de gestión';a.style.cssText='display:inline-flex;align-items:center;justify-content:center;background:#f9d407;color:#090909;padding:10px 14px;border-radius:9px;font-weight:800;font-size:13px;text-decoration:none;min-height:39px';actions.insertBefore(a,actions.lastElementChild)}const inlinebar=document.getElementById('hc-inline-panel')?.parentElement;if(inlinebar&&!document.getElementById('hc-gestion-inline')){const a=document.createElement('a');a.id='hc-gestion-inline';a.href=LINK;a.textContent='▦ Gestión';a.style.cssText='color:#f9d407;border:1px solid #665500;padding:9px 12px;border-radius:7px;font-size:13px;font-weight:700;text-decoration:none';inlinebar.insertBefore(a,document.getElementById('hc-inline-end'))}}function init(){attach();new MutationObserver(attach).observe(document.body,{childList:true,subtree:true})}if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init()})();

// Conector aditivo del botón del carrito: evita editar public/index.html manualmente.
// El pago permanece OCULTO mientras el Worker diga production=false.
(()=>{
  'use strict';
  function setupHugoCheckout(){
    const button=document.getElementById('hc-checkout-test-button');
    if(!button || document.getElementById('hc-checkout-live-button'))return;
    button.id='hc-checkout-live-button';
    button.setAttribute('onclick','hcCheckoutLive()');
    const label=button.querySelector('span');
    if(label)label.textContent='Pagar con Izipay';
    button.style.setProperty('display','none','important');
    const script=document.createElement('script');
    script.src='/checkout-live-entry.js';
    script.defer=true;
    document.body.appendChild(script);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setupHugoCheckout,{once:true});
  else setupHugoCheckout();
})();

// Nuevas categorías y galería sin modificar el carrito ni las reglas de Izipay.
(()=>{const s=document.createElement('script');s.src='/hugo-mejoras.js';s.defer=true;document.head.appendChild(s)})();
