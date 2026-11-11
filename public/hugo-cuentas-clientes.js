/* Tiendita Musical Hugo Congas — cuentas de compradores y carrito en Cloudflare D1.
 * No modifica ni habilita Izipay, el inventario, ni los pedidos.
 * Los botones de identificación sólo se habilitan cuando el Worker confirma configuración.
 */
(()=>{
 'use strict';
 let enabled=false, emailEnabled=false, googleEnabled=false, logged=false, account=null;
 let pendingId=null, pendingAction=null, busy=false, lastEmail='';
 let initialized=false, writeQueue=Promise.resolve(), readCartPromise=null;
 const $=s=>document.querySelector(s);
 const byId=s=>document.getElementById(s);
 const canCart=()=>typeof cart!=='undefined'&&Array.isArray(cart);
 const products=()=>{try{return typeof PRODUCTS!=='undefined'?PRODUCTS:[]}catch{return []}};
 const activeItem=id=>products().find(p=>Number(p.id)===Number(id));
 const currentCart=()=>canCart()?cart:[];
 const validItems=items=>(Array.isArray(items)?items:[])
  .filter(x=>Number.isSafeInteger(Number(x.id))&&Number.isInteger(Number(x.qty))&&Number(x.qty)>0&&activeItem(x.id))
  .map(x=>({id:Number(x.id),qty:Math.min(20,Number(x.qty))}));
 const messages={working:'Procesando...',empty:'Introduce tus datos para continuar.'};
 async function request(path,method='GET',body){
  const r=await fetch(path,{method,credentials:'same-origin',cache:'no-store',headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
  const value=await r.json().catch(()=>({}));
  if(!r.ok)throw Error(value.error||`No se pudo completar la operación (${r.status}).`);
  return value;
 }
 function note(msg,error=false){const el=byId('hc-customer-status');if(el){el.textContent=msg||'';el.dataset.error=error?'1':'0'}}
 function setBusy(value){busy=value;document.querySelectorAll('#hc-customer-modal button[type=submit],#hc-customer-email-send').forEach(b=>b.disabled=!!value)}
 function showModal(view){
  const modal=byId('hc-customer-modal');if(!modal)return;
  const loggedView=byId('hc-customer-logged');const guestView=byId('hc-customer-guest');
  loggedView.hidden=(!logged);guestView.hidden=logged;
  if(logged){byId('hc-customer-email-label').textContent=account?.email||'';byId('hc-customer-greeting').textContent=account?.name||'Tu cuenta está conectada'}
  const google=byId('hc-google-signin');google.hidden=!googleEnabled;
  const mail=byId('hc-customer-email-form');mail.hidden=!emailEnabled;
  const unavailable=byId('hc-customer-unavailable');unavailable.hidden=enabled;
  if(view==='code'){byId('hc-customer-code-form').hidden=false;byId('hc-customer-email-form').hidden=true;byId('hc-customer-code-hint').textContent='Escribe el código enviado a '+lastEmail}
  if(view==='email'){byId('hc-customer-code-form').hidden=true;byId('hc-customer-email-form').hidden=!emailEnabled}
  note('');modal.hidden=false;document.body.classList.add('hc-customer-open');
  setTimeout(()=>modal.querySelector('input:not([hidden])')?.focus(),50);
 }
 function closeModal(){const modal=byId('hc-customer-modal');if(modal)modal.hidden=true;document.body.classList.remove('hc-customer-open')}
 function mergeItems(fromServer){
  const map=new Map();
  for(const item of validItems(fromServer))map.set(item.id,item.qty);
  for(const item of validItems(currentCart()))map.set(item.id,Math.min(20,(map.get(item.id)||0)+item.qty));
  return [...map].map(([id,qty])=>({id,qty}));
 }
 async function loadSavedCart(){
  if(!logged)return;
  try{
   const server=await request('/api/customer/cart');
   // Esperar a que admin-ui termine de recibir el catálogo D1; de otro modo
   // la restauración descartaría instrumentos reales que aún no se renderizaron.
   const wanted=(Array.isArray(server.items)?server.items:[]).map(x=>Number(x.id)).filter(id=>id>0);
   for(let tries=0;tries<24&&wanted.some(id=>!activeItem(id));tries++){
     await new Promise(resolve=>setTimeout(resolve,200));
   }
   if(!canCart())return;
   cart=mergeItems(server.items);
   if(typeof window.updateCartUI==='function')window.updateCartUI();
   if(currentCart().length!==validItems(server.items).length||currentCart().some((x,i)=>x.id!==Number(server.items?.[i]?.id)||x.qty!==Number(server.items?.[i]?.qty)))void saveCart();
  }catch(e){console.warn('No se pudo restaurar el carrito:',e.message)}
 }
 function saveCart(){
  if(!logged||!canCart())return Promise.resolve();
  const payload=validItems(currentCart());
  writeQueue=writeQueue.catch(()=>{}).then(()=>request('/api/customer/cart','PUT',{items:payload})).catch(err=>{console.warn('No se pudo sincronizar el carrito:',err.message);return null});
  return writeQueue;
 }
 function addNow(id){
  if(!Number.isSafeInteger(Number(id))||!activeItem(id))return;
  if(typeof originalAdd==='function')originalAdd(Number(id));
  if(logged)void saveCart();
 }
 function resume(){
  closeModal();
  const id=pendingId;pendingId=null;
  const action=pendingAction;pendingAction=null;
  if(id!==null){addNow(id);return}
  if(typeof action==='function')action();
 }
 async function afterLogin(){
  const me=await request('/api/customer/me');if(!me.authenticated)throw Error('La sesión no pudo verificarse.');
  logged=true;account=me.user;
  await loadSavedCart();
  resume();
 }
 function createUI(){
  if(byId('hc-customer-modal'))return;
  const css=document.createElement('style');css.id='hc-customer-style';css.textContent=`
  body.hc-customer-open{overflow:hidden!important}
  #hc-customer-modal[hidden],#hc-customer-modal [hidden]{display:none!important}
  #hc-customer-modal{position:fixed;inset:0;z-index:2147483646;display:flex;justify-content:center;align-items:center;padding:14px;background:rgba(0,0,0,.79);backdrop-filter:blur(9px)}
  #hc-customer-dialog{width:min(100%,450px);max-height:min(95dvh,790px);overflow-y:auto;position:relative;border-radius:22px;border:1px solid #5d502c;background:linear-gradient(160deg,#242222,#0d0d0e 72%);box-shadow:0 28px 90px #000b;padding:30px;color:#f5f5f5;font:15px/1.5 Arial,sans-serif;text-align:left}
  #hc-customer-dialog *{box-sizing:border-box}
  #hc-customer-dialog h2{font:800 clamp(23px,5vw,30px)/1.18 Arial,sans-serif;color:#fff;margin:7px 0 11px}
  #hc-customer-dialog p{color:#bbb;margin:7px 0 19px;font:400 14px/1.5 Arial,sans-serif}
  #hc-customer-dialog .hc-auth-eyebrow{color:#e6c44e;font:800 11px Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase}
  #hc-customer-dialog label{display:block;color:#d9d9d9;font:700 13px Arial,sans-serif;margin:12px 0 8px}
  #hc-customer-dialog input{width:100%;height:48px;background:#0b0b0b!important;border:1px solid #646464!important;border-radius:9px;padding:10px 12px;font-size:16px!important;color:#fff!important;outline:none;appearance:none}
  #hc-customer-dialog input:focus{border-color:#e6c34b!important;box-shadow:0 0 0 2px #e6c34b33}
  #hc-customer-dialog button{font-family:Arial,sans-serif;cursor:pointer}
  #hc-customer-dialog .hc-auth-primary{display:block;width:100%;min-height:46px;border:0;border-radius:9px;background:#dfba45!important;color:#101010!important;font-weight:800;font-size:15px;margin-top:16px}
  #hc-customer-dialog .hc-auth-google{display:flex;align-items:center;justify-content:center;gap:11px;width:100%;min-height:46px;border:1px solid #777;background:#fff!important;color:#222!important;border-radius:9px;text-decoration:none;font:700 14px Arial,sans-serif;margin-top:12px}
  #hc-customer-dialog .hc-auth-google svg{height:21px;width:21px;flex-shrink:0}
  #hc-customer-dialog .hc-auth-close{position:absolute;top:15px;right:17px;border:1px solid #5c5c5c;background:#272727;color:#fff;border-radius:50%;height:36px;width:36px;font-size:23px;line-height:1}
  #hc-customer-dialog .hc-auth-muted{font-size:12px;color:#aaa;display:block;margin-top:15px}
  #hc-customer-status{min-height:20px;color:#ead07c!important;margin:12px 0 0!important}
  #hc-customer-status[data-error='1']{color:#ffa5a5!important}
  #hc-customer-dialog .hc-auth-separator{text-align:center;display:flex;align-items:center;gap:12px;color:#aaa;font-size:12px;margin:18px 0 12px}
  #hc-customer-dialog .hc-auth-separator:before,#hc-customer-dialog .hc-auth-separator:after{content:'';height:1px;background:#444;flex:1}
  #hc-customer-dialog .hc-auth-secondary{background:transparent;color:#e6c44e;border:0;text-decoration:underline;padding:8px 0}
  @media(max-width:520px){#hc-customer-dialog{padding:24px 18px;border-radius:17px;max-height:92dvh}}
  `;
  document.head.appendChild(css);
  const root=document.createElement('div');root.id='hc-customer-modal';root.hidden=true;
  root.innerHTML=`<div id="hc-customer-dialog" role="dialog" aria-modal="true" aria-labelledby="hc-customer-title">
   <button type="button" class="hc-auth-close" id="hc-customer-close" aria-label="Cerrar">×</button>
   <div class="hc-auth-eyebrow">Tiendita Musical · Hugo Congas</div>
   <h2 id="hc-customer-title">Tu música, tu cuenta.</h2>
   <div id="hc-customer-guest">
     <p>Únete o inicia sesión solo cuando quieras añadir instrumentos al carrito. Tus productos quedarán guardados para tu próxima visita.</p>
     <a id="hc-google-signin" class="hc-auth-google" href="/api/customer/google/start" hidden>
      <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.5 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.24 5.48-4.76 7.18l7.73 6C44.42 38.04 46.98 31.89 46.98 24.55z"/><path fill="#FBBC05" d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.6.27-3.14.76-4.59l-7.97-6.2A23.94 23.94 0 0 0 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.91-5.8l-7.73-6c-2.15 1.44-4.9 2.3-8.18 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.5 42.62 14.62 48 24 48z"/></svg>
      Continuar con Google</a>
     <div class="hc-auth-separator" id="hc-email-separator">o continúa con tu correo</div>
     <form id="hc-customer-email-form" hidden><label for="hc-customer-email">Correo electrónico</label><input id="hc-customer-email" type="email" required autocomplete="email" placeholder="nombre@correo.com" maxlength="254"><button id="hc-customer-email-send" class="hc-auth-primary" type="submit">Recibir código de acceso</button></form>
     <form id="hc-customer-code-form" hidden><p id="hc-customer-code-hint"></p><label for="hc-customer-code">Código de 6 dígitos</label><input id="hc-customer-code" type="text" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required placeholder="000000"><button class="hc-auth-primary" type="submit">Entrar y guardar mi carrito</button><button class="hc-auth-secondary" type="button" id="hc-customer-change-email">Cambiar correo</button></form>
     <p id="hc-customer-unavailable" hidden>Las cuentas todavía no están activadas por el administrador. Puedes seguir cotizando sin registrarte.</p>
     <span class="hc-auth-muted">Solo usamos tu correo para identificar tu cuenta y conservar tu carrito. No compartimos tus datos con otros clientes. Consulta nuestra <a href="/privacidad-clientes.html" target="_blank" rel="noopener" style="color:#f4d47a">política de privacidad</a>.</span>
   </div>
   <div id="hc-customer-logged" hidden><p id="hc-customer-greeting"></p><p id="hc-customer-email-label"></p><button class="hc-auth-primary" id="hc-customer-see-cart" type="button">Ver mi carrito</button><button class="hc-auth-secondary" id="hc-customer-logout" type="button">Cerrar sesión</button><button class="hc-auth-secondary" id="hc-customer-delete" type="button" style="display:block;color:#f9a7a7;margin-top:8px">Eliminar mi cuenta y carrito</button></div>
   <p id="hc-customer-status" role="status" aria-live="polite"></p>
  </div>`;
  document.body.appendChild(root);
  root.addEventListener('click',e=>{if(e.target===root)closeModal()});
  byId('hc-customer-close').onclick=closeModal;
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!root.hidden)closeModal()});
  byId('hc-customer-change-email').onclick=()=>showModal('email');
  byId('hc-customer-see-cart').onclick=()=>{closeModal();window.openCartDrawer?.()};
  byId('hc-customer-logout').onclick=async()=>{
    setBusy(true);
    try{await request('/api/customer/logout','POST',{});logged=false;account=null;if(canCart()){cart=[];window.updateCartUI?.()}showModal('email');note('Sesión cerrada. Tu carrito sigue guardado en tu cuenta.');}
    catch(e){note(e.message,true)}finally{setBusy(false)}
  };
  byId('hc-customer-delete').onclick=async()=>{
    if(!confirm('¿Eliminar definitivamente tu cuenta y tu carrito guardado? Esta operación no se puede deshacer.'))return;
    setBusy(true);
    try{
      await request('/api/customer/delete','POST',{confirm:'BORRAR MI CUENTA'});
      logged=false;account=null;if(canCart()){cart=[];window.updateCartUI?.()}
      showModal('email');note('La cuenta y el carrito se eliminaron correctamente.');
    }catch(e){note(e.message,true)}finally{setBusy(false)}
  };
  byId('hc-customer-email-form').onsubmit=async e=>{
    e.preventDefault();if(busy)return;
    lastEmail=byId('hc-customer-email').value.trim().toLowerCase();setBusy(true);note('Enviando tu código...');
    try{await request('/api/customer/email/start','POST',{email:lastEmail});showModal('code');note('Código enviado. Revisa tu correo y la carpeta de spam.');}
    catch(e){note(e.message,true)}finally{setBusy(false)}
  };
  byId('hc-customer-code-form').onsubmit=async e=>{
    e.preventDefault();if(busy)return;setBusy(true);note('Comprobando código...');
    try{await request('/api/customer/email/verify','POST',{email:lastEmail,code:byId('hc-customer-code').value.trim()});await afterLogin();}
    catch(e){note(e.message,true)}finally{setBusy(false)}
  };
  byId('hc-google-signin').onclick=e=>{
    if(!googleEnabled){e.preventDefault();note('Google aún no está configurado.',true);return}
    const id=pendingId;
    if(id!==null)e.currentTarget.href='/api/customer/google/start?add='+encodeURIComponent(id);
    else e.currentTarget.href='/api/customer/google/start';
  };
 }
 const originalAdd=typeof window.addToCart==='function'?window.addToCart:null;
 const originalRemove=typeof window.removeFromCart==='function'?window.removeFromCart:null;
 const originalQuote=typeof window.sendCartWhatsApp==='function'?window.sendCartWhatsApp:null;
 const originalCheckout=typeof window.hcCheckoutTest==='function'?window.hcCheckoutTest:null;
 function intercept(){
  if(initialized)return;initialized=true;
  window.addToCart=function(id){
    if(!enabled||logged){addNow(id);return}
    pendingId=Number(id);pendingAction=null;showModal('email');
  };
  window.removeFromCart=function(id){if(originalRemove)originalRemove(id);if(logged)void saveCart()};
  if(originalQuote)window.sendCartWhatsApp=function(){if(enabled&&!logged){pendingId=null;pendingAction=originalQuote;showModal('email');return}return originalQuote()};
  if(originalCheckout)window.hcCheckoutTest=function(){if(enabled&&!logged){pendingId=null;pendingAction=originalCheckout;showModal('email');return}return originalCheckout()};
  const accountBtn=$('button[aria-label="Mi cuenta y cotizaciones"]');
  if(accountBtn){accountBtn.removeAttribute('onclick');accountBtn.title='Mi cuenta';accountBtn.addEventListener('click',e=>{e.preventDefault();showModal('email')})}
 }
 async function init(){
  createUI();intercept();
  try{
   const config=await request('/api/customer/config');
   emailEnabled=!!config.emailEnabled;googleEnabled=!!config.googleEnabled;enabled=emailEnabled||googleEnabled;
   const me=await request('/api/customer/me');logged=!!me.authenticated;account=me.user||null;
   if(logged){
    // Permitir que admin-ui.js termine de cargar productos desde D1.
    await new Promise(resolve=>setTimeout(resolve,450));
    await loadSavedCart();
   }
   const url=new URL(location.href);
   if(url.searchParams.has('hc_login')||url.searchParams.has('hc_add')){
    const action=url.searchParams.get('hc_login');
    const raw=url.searchParams.get('hc_add');
    url.searchParams.delete('hc_login');url.searchParams.delete('hc_add');
    history.replaceState(history.state,'',url.pathname+url.search+url.hash);
    if(action==='failed'){showModal('email');note('Google no pudo verificar el acceso. Intenta otra vez.',true)}
    else if(action==='google'&&logged){if(raw&&Number.isSafeInteger(Number(raw))){pendingId=Number(raw);resume()}else closeModal()}
   }
  }catch(e){console.warn('El módulo de cuentas no se pudo iniciar:',e.message)}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
