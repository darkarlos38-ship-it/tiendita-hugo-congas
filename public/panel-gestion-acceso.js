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

// Hugo Congas: subcategorías navegables en filtros laterales.
// No modifica datos, checkout, cookies ni los controles de administración.
(()=>{'use strict';
 const GROUPS={
  percusion:['Campanas','Contracampanas','Timbales','Congas','Bongós','Maracas','Baquetas','Platillos','Parantes','Clamps','Herrajes metálicos','Accesorios metálicos','Cencerros','Parches','Baterías','Otros de percusión'],
  cuerdas:['Guitarras acústicas','Guitarras eléctricas','Guitarras electroacústicas','Cuerdas','Accesorios y soportes','Otros de cuerdas'],
  bajos:['Bajos eléctricos','Bajos acústicos','Amplificadores','Cuerdas para bajo','Accesorios para bajo'],
  vientos:['Trompetas','Trombones','Saxofones','Flautas','Boquillas','Otros de vientos'],
  teclados:['Pianos digitales','Teclados','Sintetizadores','Controladores MIDI','Pedales y soportes','Otros teclados'],
  audio:['Micrófonos','Micrófonos inalámbricos','Consolas y mezcladoras','Interfaces de audio','Parlantes activos','Parlantes pasivos','Monitores','Cables y conectores','Soportes para micrófonos','Otros de audio']
 };
 const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const isContra=p=>p?.category==='percusion'&&/\bcontra\s*campanas?\b/.test(norm(p.title)+' '+norm(p.catLabel));
 const matches=(p,cat,sub)=>{
  if(!p||p.category!==cat)return false;
  const want=norm(sub),leaf=norm(String(p.catLabel||'').split(',').pop()),title=norm(p.title);
  if(cat==='percusion'&&want==='contracampanas')return isContra(p);
  if(cat==='percusion'&&want==='campanas')return !isContra(p)&&(/\bcampanas?\b/.test(title)||/\bcampanas?\b/.test(leaf));
  return leaf===want||leaf.includes(want)||(want.includes(leaf)&&leaf.length>3)||((!leaf||leaf===norm(cat))&&title.includes(want));
 };
 let expanded='percusion',active='',previousSignature='',lastCatalogSize=-1;
 const style=document.createElement('style');style.textContent=`
 #sidebarCatList>li.hc-side-sub{list-style:none!important;margin:0 0 5px!important;padding:0 0 0 13px!important;background:transparent!important}
 #sidebarCatList .hc-side-inner{padding:4px 0 7px 10px;border-left:1px solid #4a4025;display:grid;gap:1px}
 #sidebarCatList .hc-side-option{display:flex;align-items:center;justify-content:space-between;gap:7px;width:100%;padding:7px 9px!important;margin:0!important;border:0!important;background:transparent!important;border-radius:7px;color:#d5d5d5!important;font-size:12px!important;line-height:1.25;text-align:left;cursor:pointer}
 #sidebarCatList .hc-side-option:hover,#sidebarCatList .hc-side-option[aria-current=true]{background:#342b10!important;color:#ffda55!important}
 #sidebarCatList .hc-side-option small{color:#aaa;flex-shrink:0;font-size:11px}
 #sidebarCatList .hc-side-option:focus-visible{outline:2px solid #f9cc29;outline-offset:1px}
 #sidebarCatList>li[data-cat] > button{position:relative}
 @media(max-width:700px){#sidebarCatList .hc-side-option{font-size:13px!important;min-height:35px}}
 `;document.head.appendChild(style);
 function products(){try{return Array.isArray(PRODUCTS)?PRODUCTS:[]}catch{return []}}
 function populate(){
  const list=document.getElementById('sidebarCatList');if(!list)return;
  const prods=products(),signature=prods.map(p=>[p.id,p.category,p.catLabel,p.title].join('|')).join(';');
  if(signature===previousSignature&&list.querySelector('.hc-side-sub')&&lastCatalogSize===prods.length)return;
  previousSignature=signature;lastCatalogSize=prods.length;
  for(const old of list.querySelectorAll('li.hc-side-sub'))old.remove();
  for(const category of Object.keys(GROUPS)){
   const parent=list.querySelector(`button[data-cat="${category}"]`)?.closest('li');if(!parent)continue;
   const li=document.createElement('li');li.className='hc-side-sub';li.dataset.group=category;
   li.hidden=expanded!==category;li.style.display=expanded===category?'':'none';
   const box=document.createElement('div');box.className='hc-side-inner';
   for(const sub of GROUPS[category]){
    const count=prods.filter(p=>matches(p,category,sub)).length;
    const btn=document.createElement('button');btn.type='button';btn.className='hc-side-option';btn.dataset.sub=sub;btn.setAttribute('aria-current',String(active===category+'|'+sub));
    const label=document.createElement('span');label.textContent=sub;
    const small=document.createElement('small');small.textContent=String(count);
    const check=document.createElement('span');check.className='dsp-check-box';check.style.display='none';btn.append(check,label,small);
    btn.addEventListener('click',e=>{
     e.preventDefault();e.stopPropagation();expanded=category;active=category+'|'+sub;
     if(typeof window.hcHGChoose==='function')window.hcHGChoose(category,sub);
     else if(typeof window.filterCatalog==='function')window.filterCatalog(category);
     for(const button of list.querySelectorAll('.hc-side-option'))button.setAttribute('aria-current',String(button===btn));
     document.getElementById('catalogo')?.scrollIntoView({behavior:'smooth',block:'start'});
    });box.appendChild(btn);
   }
   li.append(box);parent.insertAdjacentElement('afterend',li);
  }
 }
 function show(category){
  const list=document.getElementById('sidebarCatList');if(!list)return;
  expanded=category;active='';
  for(const li of list.querySelectorAll('li.hc-side-sub')){
   const visible=li.dataset.group===category;li.hidden=!visible;li.style.display=visible?'':'none';
  }
  for(const b of list.querySelectorAll('.hc-side-option'))b.setAttribute('aria-current','false');
 }
 function init(){
  const list=document.getElementById('sidebarCatList');if(!list)return;
  if(!list.dataset.hcSubcategorySidebar){
   list.dataset.hcSubcategorySidebar='1';
   list.addEventListener('click',e=>{
    const button=e.target.closest('button[data-cat]');if(!button)return;
    const category=button.dataset.cat;
    show(GROUPS[category]?category:'');
    // Quitar el filtro de hoja anterior al elegir otra categoría general.
    const s=document.querySelector('#hc-hg-categories select');
    if(s&&s.value){s.value='';s.dispatchEvent(new Event('change'))}
   },true);
  }
  populate();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
 // El catálogo D1 se carga después del HTML; reconstruir contadores solo si cambian los productos.
 document.addEventListener('DOMContentLoaded',()=>{
  const grid=document.getElementById('archiveProductsGrid');if(grid){let scheduled=false;new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;populate()})}).observe(grid,{childList:true,subtree:false})}
  setTimeout(populate,900);
 },{once:true});
})();
