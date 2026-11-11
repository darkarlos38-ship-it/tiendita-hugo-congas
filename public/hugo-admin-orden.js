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
