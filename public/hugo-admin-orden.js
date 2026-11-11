/* Tiendita Musical Hugo Congas — eliminar instrumentos y ordenar arrastrando.
   Sólo interfaz de administrador. No modifica fotografías, checkout, stock ni pagos.
   El orden se persiste mediante /api/catalog-order en el JSON del catálogo D1. */
(()=>{
  'use strict';
  const gridId='archiveProductsGrid';
  const $=id=>document.getElementById(id);
  const cardSelector='li.dsp-prod-card';
  let savedOrder=[];
  let orderReady=false;
  let saving=false;
  let pending=false;
  let pointerState=null;

  const products=()=>{try{return typeof PRODUCTS!=='undefined'&&Array.isArray(PRODUCTS)?PRODUCTS:[]}catch{return []}};
  const productIds=()=>products().map(p=>String(p.id));
  const uniq=a=>[...new Set(a)];
  const active=()=>document.body?.classList.contains('hc-inline-mode');
  const idOf=card=>{
    const match=card?.querySelector('[onclick*="openProductSheet"]')?.getAttribute('onclick')?.match(/openProductSheet\((-?\d+)\)/);
    return match?.[1]??null;
  };
  const grid=() => $(gridId);
  const visibleCards=()=>[...(grid()?.querySelectorAll(cardSelector)||[])].filter(el=>!el.hidden && getComputedStyle(el).display!=='none');
  const visibleIds=()=>visibleCards().map(idOf).filter(Boolean);
  function canonical(){
    const available=new Set(productIds());
    return uniq([...savedOrder.filter(id=>available.has(id)),...productIds()]);
  }
  function applyOrder(){
    if(!orderReady)return;
    const all=products();if(all.length<2)return;
    const map=new Map(canonical().map((id,i)=>[id,i]));
    const indices=new Map(all.map((p,i)=>[String(p.id),i]));
    all.sort((a,b)=>(map.get(String(a.id))??Number.MAX_SAFE_INTEGER)-(map.get(String(b.id))??Number.MAX_SAFE_INTEGER)||(indices.get(String(a.id))-indices.get(String(b.id))));
  }
  function rerender(){
    applyOrder();
    if(typeof window.renderArchiveGrid==='function')window.renderArchiveGrid();
    if(typeof window.renderHomeCarousels==='function')window.renderHomeCarousels();
    decorateSoon();
  }
  function status(message,isError=false){
    const note=$('hc-order-status');if(!note)return;
    note.textContent=message;note.dataset.error=String(!!isError);
  }
  function api(path,method,body){
    return fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}).then(async r=>{
      const json=await r.json().catch(()=>({}));
      if(!r.ok)throw new Error(json.error||`Error ${r.status}`);
      return json;
    });
  }
  async function fetchOrder(){
    const r=await fetch('/api/catalog',{credentials:'same-origin',cache:'no-store'});
    if(!r.ok)throw new Error('No se pudo consultar el orden del catálogo');
    const data=await r.json();
    savedOrder=Array.isArray(data.settings?.displayOrder)?uniq(data.settings.displayOrder.map(String)):[];
    orderReady=true;
    rerender();
  }
  async function deleteInstrument(id,btn){
    if(!active()||saving)return;
    const p=products().find(x=>String(x.id)===String(id));
    const title=p?.title||`ID ${id}`;
    if(!confirm(`¿Eliminar el instrumento «${title}» del catálogo?\n\nSe quitará de la tienda. No se eliminan las fotografías almacenadas ni el historial de ventas.`))return;
    btn.disabled=true;saving=true;
    status('Eliminando instrumento...');
    try{
      if(Number(id)<0)await api('/api/demo','PUT',{id:Number(id),action:'hide'});
      else await api('/api/products/'+encodeURIComponent(id),'DELETE',{});
      status('Instrumento eliminado. Actualizando catálogo...');
      window.location.reload();
    }catch(e){
      saving=false;btn.disabled=false;
      status(e.message,true);alert('No se pudo eliminar: '+e.message);
    }
  }
  function decorateDelete(card){
    const controls=card.querySelector(':scope > .hc-inline-controls');
    const old=controls?.querySelector('button.hc-img-remove');
    if(!old||old.dataset.hcDeleteInstrument)return;
    const id=idOf(card);if(id===null)return;
    // Reemplazar sólo el botón de FOTO de la tarjeta; dejar intacto el de los banners.
    // cloneNode descarta el antiguo onclick que quitaba únicamente la fotografía.
    const button=old.cloneNode(false);
    button.type='button';button.classList.add('hc-delete-instrument');
    button.dataset.hcDeleteInstrument='1';
    button.textContent='✕ Eliminar instrumento';
    button.title='Eliminar este instrumento del catálogo';
    button.setAttribute('aria-label','Eliminar instrumento '+(products().find(p=>String(p.id)===id)?.title||''));
    button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();deleteInstrument(id,button)});
    old.replaceWith(button);
  }
  async function saveOrder(before,after){
    if(!orderReady){status('Todavía no se cargó el orden de los instrumentos.',true);rerender();return;}
    if(before.join('|')===after.join('|'))return;
    if(new Set(before).size!==before.length||new Set(after).size!==after.length||before.length!==after.length||!before.every(id=>after.includes(id))){
      status('No se pudo validar el nuevo orden.',true);rerender();return;
    }
    const full=canonical(),oldVisible=new Set(before),queue=[...after];
    const updated=full.map(id=>oldVisible.has(id)?queue.shift():id);
    saving=true;status('Guardando el nuevo orden...');
    try{
      await api('/api/catalog-order','PUT',{ids:updated});
      savedOrder=updated;orderReady=true;
      status('Orden guardado. Los clientes verán la nueva posición.');
      rerender();
    }catch(e){
      status('No se guardó el orden: '+e.message,true);
      alert('No se pudo guardar el orden: '+e.message+'\nNo se cambió el catálogo.');
      try{await fetchOrder()}catch{rerender()}
    }finally{saving=false;}
  }
  function decorateDrag(card){
    if(card.querySelector(':scope > .hc-order-handle'))return;
    const id=idOf(card);if(id===null)return;
    const handle=document.createElement('button');
    handle.type='button';handle.className='hc-order-handle';
    handle.textContent='⠿ Mover';handle.title='Arrastra para cambiar la posición del instrumento';
    handle.setAttribute('aria-label','Mover instrumento');
    const stop=e=>{e.preventDefault();e.stopPropagation()};
    handle.addEventListener('click',stop);
    handle.addEventListener('pointerdown',e=>{
      if(!active()||saving||e.button!==0)return;
      if($('catalogSortSelect')?.value!=='featured'){
        alert('Para ordenar los instrumentos, selecciona «Ordenar por popularidad» en el catálogo.');return;
      }
      const before=visibleIds();
      if(before.length<2||!before.includes(id))return;
      e.preventDefault();e.stopPropagation();
      pointerState={card,handle,before,x:e.clientX,y:e.clientY,moved:false};
      handle.setPointerCapture?.(e.pointerId);
      card.classList.add('hc-order-active');
      status('Mueve el instrumento y suelta para guardar la nueva posición.');
    });
    card.prepend(handle);
  }
  // Detectar movimiento en todo el documento: mover una tarjeta dentro del DOM
  // puede perder la captura del puntero en algunos navegadores.
  function movePointer(e){
    if(!pointerState)return;
    const state=pointerState,card=state.card;
    if(!state.moved&&Math.hypot(e.clientX-state.x,e.clientY-state.y)<7)return;
    state.moved=true;
    const other=document.elementFromPoint(e.clientX,e.clientY)?.closest(cardSelector);
    if(!other||other===card||other.parentElement!==grid()||other.hidden||getComputedStyle(other).display==='none')return;
    const rect=other.getBoundingClientRect();
    const centerY=rect.top+rect.height/2;
    const after=e.clientY>centerY || (Math.abs(e.clientY-centerY)<rect.height*.26 && e.clientX>rect.left+rect.width/2);
    grid().insertBefore(card,after?other.nextSibling:other);
  }
  function endPointer(e,cancelled){
    if(!pointerState)return;
    const state=pointerState;pointerState=null;
    state.card.classList.remove('hc-order-active');
    try{state.handle.releasePointerCapture?.(e.pointerId)}catch{}
    if(cancelled){rerender();return;}
    if(state.moved)void saveOrder(state.before,visibleIds());
  }
  function decorate(){
    if(!active())return;
    document.querySelectorAll('.mas-product, .dsp-prod-card').forEach(card=>{
      decorateDelete(card);
      if(card.matches(cardSelector) && card.parentElement===grid())decorateDrag(card);
    });
  }
  function decorateSoon(){
    if(pending)return;pending=true;
    requestAnimationFrame(()=>{pending=false;decorate()});
  }
  function setup(){
    const css=document.createElement('style');
    css.textContent=`
      body.hc-inline-mode .dsp-prod-card{position:relative!important}
      body.hc-inline-mode .hc-inline-controls{max-width:calc(100% - 66px);flex-wrap:wrap;justify-content:flex-end}
      body.hc-inline-mode .hc-inline-controls .hc-delete-instrument{font-size:11px!important;white-space:normal;line-height:1.1!important;max-width:130px}
      body.hc-inline-mode .hc-order-handle{position:absolute;top:9px;left:9px;z-index:101;background:#161616;color:#f4cc4d;border:1px solid #87702c;border-radius:7px;padding:7px 8px;font:700 12px Arial,sans-serif;cursor:grab;touch-action:none;user-select:none;white-space:nowrap}
      body.hc-inline-mode .hc-order-handle:active{cursor:grabbing}
      body.hc-inline-mode .hc-order-active{outline:2px dashed #e6bd33!important;opacity:.78}
      #hc-order-status{display:none;margin:10px 0;padding:10px 12px;background:#191919;color:#e0c36b;border:1px solid #5c5029;border-radius:9px;font:600 12px/1.4 Arial,sans-serif}
      body.hc-inline-mode #hc-order-status{display:block}
      #hc-order-status[data-error="true"]{color:#ffb2ae;border-color:#9b4444}
      body:not(.hc-inline-mode) .hc-order-handle{display:none!important}
    `;
    document.head.appendChild(css);
    const list=grid();
    if(list&&!$('hc-order-status')){
      const statusBar=document.createElement('div');statusBar.id='hc-order-status';
      statusBar.textContent='Administrador: arrastra desde «⠿ Mover» para ordenar. Se guarda automáticamente.';
      list.parentElement.insertBefore(statusBar,list);
    }
    // Se aplican al catálogo existente, sin reemplazar las funciones de la galería.
    const base=window.renderArchiveGrid;
    if(typeof base==='function')window.renderArchiveGrid=function(...args){applyOrder();const res=base.apply(this,args);decorateSoon();return res};
    const baseHome=window.renderHomeCarousels;
    if(typeof baseHome==='function')window.renderHomeCarousels=function(...args){applyOrder();const res=baseHome.apply(this,args);decorateSoon();return res};
    document.addEventListener('pointermove',movePointer,{passive:false});
    document.addEventListener('pointerup',e=>endPointer(e,false));
    document.addEventListener('pointercancel',e=>endPointer(e,true));
    new MutationObserver(decorateSoon).observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
    decorateSoon();
    fetchOrder().catch(e=>status('No se pudo cargar la posición guardada: '+e.message,true));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();


/* HUGO CONGAS / SOLO CELULAR (max-width: 767px)
   Filtros plegables y tamaño constante del visor de fotos.
   No altera lógica de producto, admin, catálogo, pagos ni escritorio. */
(()=>{
  'use strict';
  if(document.getElementById('hc-mobile-ui-style'))return;
  const style=document.createElement('style');
  style.id='hc-mobile-ui-style';
  style.textContent=`
  .hc-mobile-filters-toggle{display:none}
  @media screen and (max-width:767px){
    body.hc-catalog-mode .dsp-archive-wrap{padding:16px 12px 25px!important;min-width:0!important}
    body.hc-catalog-mode .dsp-cat-head{margin-bottom:12px!important;padding-bottom:12px!important}
    body.hc-catalog-mode .dsp-cat-title h2{font-size:clamp(21px,5.3vw,25px)!important;line-height:1.2!important}
    body.hc-catalog-mode .dsp-cat-title span{font-size:12px!important;white-space:normal!important}
    body.hc-catalog-mode .dsp-chips{display:flex!important;flex-wrap:nowrap!important;overflow-x:auto!important;overflow-y:hidden!important;gap:7px!important;margin-top:12px!important;padding:0 1px 8px!important;-webkit-overflow-scrolling:touch;scrollbar-width:thin;max-width:100%!important}
    body.hc-catalog-mode .dsp-chips .dsp-chip{flex:0 0 auto!important;width:auto!important;min-width:0!important;height:39px!important;padding:0 12px!important;border-radius:23px!important;font-size:13px!important;line-height:1.1!important;white-space:nowrap!important}
    body.hc-catalog-mode .dsp-chips .dsp-chip small{font-size:11px!important}
    body.hc-catalog-mode .dsp-shop-layout{display:block!important;min-width:0!important}
    body.hc-catalog-mode .hc-mobile-filters-toggle{display:flex!important;align-items:center;justify-content:space-between;width:100%;padding:12px 14px!important;margin:4px 0 14px!important;border:1px solid #655422!important;border-radius:11px!important;background:#191919!important;color:#f4cd55!important;font:700 14px/1.3 Arial,sans-serif!important;text-align:left;cursor:pointer}
    body.hc-catalog-mode .hc-mobile-filters-toggle .hc-mf-arrow{font-size:16px;transition:transform .2s}
    body.hc-catalog-mode.hc-mobile-filters-open .hc-mobile-filters-toggle .hc-mf-arrow{transform:rotate(180deg)}
    body.hc-catalog-mode:not(.hc-mobile-filters-open) .dsp-filters{display:none!important}
    body.hc-catalog-mode.hc-mobile-filters-open .dsp-filters{position:static!important;top:auto!important;display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:9px!important;padding:0!important;margin:0 0 15px!important;min-width:0!important}
    body.hc-catalog-mode.hc-mobile-filters-open .dsp-filters>.dsp-f{padding:12px!important;border:1px solid #3b3b3b!important;border-radius:10px!important;min-width:0!important}
    body.hc-catalog-mode.hc-mobile-filters-open .dsp-filters>.dsp-f .dsp-f-title{font-size:15px!important;margin-bottom:8px!important}
    body.hc-catalog-mode.hc-mobile-filters-open #sidebarCatList{max-height:265px!important;overflow-y:auto!important;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
    body.hc-catalog-mode.hc-mobile-filters-open #sidebarBrandList{max-height:180px!important;overflow-y:auto!important;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
    body.hc-catalog-mode.hc-mobile-filters-open .dsp-filters>.dsp-help{display:none!important}
    body.hc-catalog-mode.hc-mobile-filters-open .dsp-filters>.dsp-f li button{font-size:13px!important;min-height:30px!important}
    body.hc-product-mode .dsp-cat-head,
    body.hc-product-mode .hc-mobile-filters-toggle,
    body.hc-product-mode .dsp-filters,
    body.hc-product-mode #hc-hg-categories,
    body.hc-product-mode .shop-control-bar,
    body.hc-product-mode #archiveProductsGrid{display:none!important}
    body.hc-product-mode #hc-inline-detail{margin-top:0!important}
    body.hc-product-mode #hc-inline-detail .hc-detail-grid{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:16px!important}
    #hc-inline-detail .hc-gallery-customer{width:100%!important;max-width:100%!important;min-width:0!important}
    #hc-inline-detail .hc-gallery-customer .hc-detail-image,
    #hc-inline-detail .hc-detail-image{width:100%!important;max-width:100%!important;min-width:0!important;height:clamp(285px,85vw,385px)!important;min-height:0!important;max-height:none!important;box-sizing:border-box!important;padding:12px!important;display:flex!important;justify-content:center!important;align-items:center!important;overflow:hidden!important}
    #hc-inline-detail .hc-detail-image>img{display:block!important;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;object-position:center!important;flex:0 0 auto!important}
    #hc-inline-detail .hc-gallery-thumbs{display:flex!important;flex-wrap:nowrap!important;gap:8px!important;overflow-x:auto!important;max-width:100%!important}
    #hc-inline-detail .hc-gallery-thumbs button{flex:0 0 60px!important;width:60px!important;height:60px!important}
    #hc-inline-detail .hc-gallery-thumbs img{width:100%!important;height:100%!important;object-fit:contain!important}
  }
  `;
  document.head.appendChild(style);
  function setup(){
    const layout=document.querySelector('#catalogo .dsp-shop-layout')||document.querySelector('.dsp-shop-layout');
    const filter=layout?.querySelector('.dsp-filters');
    if(!layout||!filter||document.getElementById('hc-mobile-filters-toggle'))return;
    const button=document.createElement('button');
    button.type='button';
    button.id='hc-mobile-filters-toggle';
    button.className='hc-mobile-filters-toggle';
    button.setAttribute('aria-controls','hc-mobile-filter-group');
    button.setAttribute('aria-expanded','false');
    button.innerHTML='<span>☰ Filtros y subcategorías</span><span class="hc-mf-arrow" aria-hidden="true">⌄</span>';
    filter.id='hc-mobile-filter-group';
    filter.parentNode.insertBefore(button,filter);
    button.addEventListener('click',()=>{
      const open=!document.body.classList.contains('hc-mobile-filters-open');
      document.body.classList.toggle('hc-mobile-filters-open',open);
      button.setAttribute('aria-expanded',String(open));
    });
    // Al elegir una categoría o subcategoría, se libera espacio para ver los instrumentos.
    filter.addEventListener('click',e=>{
      if(!e.target.closest('#sidebarCatList button,#sidebarBrandList button'))return;
      if(!window.matchMedia('(max-width:767px)').matches)return;
      document.body.classList.remove('hc-mobile-filters-open');
      button.setAttribute('aria-expanded','false');
    });
    document.querySelector('#archiveChips')?.addEventListener('click',()=>{
      if(!window.matchMedia('(max-width:767px)').matches)return;
      document.body.classList.remove('hc-mobile-filters-open');
      button.setAttribute('aria-expanded','false');
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',setup,{once:true});else setup();
})();


/* Ajuste exclusivo del visor ampliado de CONTRA CAMPANA en pantallas móviles.
   El segundo archivo tiene menor resolución nativa: evitamos que se represente
   a su tamaño original, usando la misma área de exhibición sin deformar.
   No altera el catálogo, la galería de fichas, ni la versión de escritorio. */
(()=>{
  'use strict';
  const style=document.createElement('style');
  style.id='hc-contra-lightbox-mobile-equal';
  style.textContent=`
    @media screen and (max-width:767px){
      #hc-hg-lightbox.hc-hg-contra-equal img{
        width:100%!important;
        height:100%!important;
        min-width:0!important;
        min-height:0!important;
        max-width:100%!important;
        max-height:100%!important;
        object-fit:contain!important;
        object-position:center!important;
      }
    }
  `;
  document.head.appendChild(style);
  document.addEventListener('click',e=>{
    const main=e.target.closest?.('#hc-inline-detail .hc-detail-image img');
    if(!main)return;
    const detail=document.getElementById('hc-inline-detail');
    const title=(detail?.querySelector('.hc-detail-name')?.textContent||'').trim().toUpperCase();
    const brand=(detail?.querySelector('.hc-detail-meta')?.textContent||'').toUpperCase();
    const photos=detail?.querySelectorAll('.hc-gallery-thumbs button')?.length||0;
    const fix=window.matchMedia('(max-width:767px)').matches &&
      title==='CONTRA CAMPANA' && brand.includes('HUGO CONGAS') && photos===2;
    // Se ejecuta después del clic que abre el visor, sin interceptar su navegación.
    const overlay=document.getElementById('hc-hg-lightbox');
    overlay?.classList.toggle('hc-hg-contra-equal',fix);
  });
})();
