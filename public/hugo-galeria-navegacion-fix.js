/* Tiendita Musical Hugo Congas — corrección aditiva 2026-11-10.
   No altera API, D1, pagos, almacenamiento ni editor de administración. */
(()=>{
'use strict';
const norm = s => String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
function catalog(){try{return Array.isArray(PRODUCTS)?PRODUCTS:[]}catch(e){return []}}
function matches(p, cat, sub){
 if (!p || p.category!==cat) return false;
 const want=norm(sub),name=norm(p.title),leaf=norm(p.catLabel||'');
 const contra=/\bcontra\s*campanas?\b/.test(name+' '+leaf);
 if(cat==='percusion' && want==='contracampanas')return contra;
 if(cat==='percusion' && want==='campanas')return !contra && /\bcampanas?\b/.test(name+' '+leaf);
 return leaf===want || leaf.includes(want) || (want.includes(leaf) && leaf.length>3) || name.includes(want);
}
const categoryNames={percusion:'Percusión Latina',cuerdas:'Guitarras',bajos:'Bajos',vientos:'Vientos',teclados:'Teclados',audio:'Audio Profesional'};
const groups={
 percusion:['Campanas','Contracampanas','Timbales','Congas','Bongós','Maracas','Baquetas','Platillos','Parantes','Clamps','Herrajes metálicos','Accesorios metálicos','Cencerros','Parches','Baterías'],
 cuerdas:['Guitarras acústicas','Guitarras eléctricas','Guitarras electroacústicas','Cuerdas','Accesorios y soportes'],
 bajos:['Bajos eléctricos','Bajos acústicos','Amplificadores','Cuerdas para bajo','Accesorios para bajo'],
 vientos:['Trompetas','Trombones','Saxofones','Flautas','Boquillas'],
 teclados:['Pianos digitales','Teclados','Sintetizadores','Controladores MIDI','Pedales y soportes'],
 audio:['Micrófonos','Micrófonos inalámbricos','Consolas y mezcladoras','Interfaces de audio','Parlantes activos','Parlantes pasivos','Monitores','Cables y conectores','Soportes para micrófonos']
};
let subSelection=null;
function showFilteredCards(){
 if(!subSelection)return;
 const {cat,sub}=subSelection,ids=new Set(catalog().filter(p=>matches(p,cat,sub)).map(p=>Number(p.id)));
 const grid=document.getElementById('archiveProductsGrid');if(!grid)return;
 let count=0;
 grid.querySelectorAll('.dsp-prod-card').forEach(card=>{
  const m=(card.querySelector('[onclick*="openProductSheet"]')?.getAttribute('onclick')||'').match(/openProductSheet\((-?\d+)\)/);
  const show=!!m && ids.has(Number(m[1]));card.hidden=!show;card.style.display=show?'':'none';if(show)count++;
 });
 grid.querySelectorAll('.dsp-mid').forEach(el=>el.style.display='none');
 const title=document.getElementById('archiveHeading'),crumb=document.getElementById('archiveBreadcrumb'),countEl=document.getElementById('archiveCountText');
 if(title)title.textContent=sub;if(crumb)crumb.textContent=categoryNames[cat]+' / '+sub;
 if(countEl)countEl.textContent=count+' '+(count===1?'producto disponible':'productos disponibles');
}
function markActive(btn){document.querySelectorAll('#sidebarCatList .hc-side-option').forEach(b=>b.setAttribute('aria-current',String(b===btn)))}
function setupNavigation(){
 const list=document.getElementById('sidebarCatList');if(!list || list.dataset.hcFinalFix)return;
 list.dataset.hcFinalFix='1';
 // Captura antes del manejador antiguo: impide que se ejecute dos veces.
 list.addEventListener('click',e=>{
  const subButton=e.target.closest('.hc-side-option');
  if(subButton && list.contains(subButton)){
   const li=subButton.closest('li[data-group]'),cat=li?.dataset.group,sub=subButton.dataset.sub;
   if(!cat||!sub)return;
   e.preventDefault();e.stopImmediatePropagation();
   subSelection={cat,sub};
   if(typeof window.filterCatalog==='function')window.filterCatalog(cat);
   showFilteredCards();markActive(subButton);
   document.getElementById('catalogo')?.scrollIntoView({behavior:'smooth',block:'start'});
   return;
  }
  const parent=e.target.closest('button[data-cat]');if(parent&&list.contains(parent))subSelection=null;
 },true);
 document.addEventListener('click',e=>{
  if(e.target.closest('#archiveChips button[data-cat], .ds-cat, [onclick*="filterCatalog"], [onclick*="resetCatalogFilters"]')&&!e.target.closest('#sidebarCatList .hc-side-option'))subSelection=null;
 },true);
 const grid=document.getElementById('archiveProductsGrid');
 if(grid){let queued=false;new MutationObserver(()=>{if(!subSelection||queued)return;queued=true;requestAnimationFrame(()=>{queued=false;showFilteredCards()})}).observe(grid,{childList:true});}
}
const style=document.createElement('style');style.textContent=`
#productSheetContent .dsp-single-gallery:has(.hc-fix-gallery){display:block!important;aspect-ratio:auto!important;height:auto!important;padding:12px!important;min-width:0}
.hc-fix-gallery{display:grid;gap:11px;width:100%;min-width:0}
.hc-fix-stage{aspect-ratio:1/1;min-height:200px;position:relative;display:flex;align-items:center;justify-content:center;border-radius:12px;overflow:hidden;background:#202023}
.hc-fix-main{display:block!important;width:100%!important;height:100%!important;position:absolute;inset:0;object-fit:contain!important;max-height:100%!important;max-width:100%!important;cursor:zoom-in}
.hc-fix-prev,.hc-fix-next{position:absolute;top:50%;transform:translateY(-50%);z-index:2;width:42px;height:42px;padding:0;border:1px solid #777;border-radius:50%;background:rgba(0,0,0,.78);color:#fff;font-size:26px;cursor:pointer}
.hc-fix-prev{left:10px}.hc-fix-next{right:10px}
.hc-fix-thumbs{display:flex;gap:8px;overflow-x:auto;max-width:100%;padding:3px 0 6px}
.hc-fix-thumbs button{flex:0 0 62px;width:62px;height:62px;background:#242426;border:1px solid #686868;border-radius:9px;padding:3px;cursor:pointer}
.hc-fix-thumbs button[aria-pressed="true"]{border:2px solid #f3cc31}
.hc-fix-thumbs img{display:block;width:100%;height:100%;object-fit:contain}
.hc-fix-zoom{position:fixed;inset:0;z-index:2147483647;background:rgba(0,0,0,.97);display:flex;justify-content:center;align-items:center;padding:65px 50px}
.hc-fix-zoom>img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain}
.hc-fix-zoom .hc-fix-close{position:absolute;top:12px;right:15px;width:42px;height:42px;background:#252525;color:#fff;border:1px solid #777;border-radius:50%;font-size:24px;cursor:pointer}
@media(max-width:700px){.hc-fix-zoom{padding:60px 10px}.hc-fix-prev,.hc-fix-next{width:36px;height:36px;font-size:21px}}
`;document.head.appendChild(style);
let closeZoom=null;
function setupGallery(){
 const content=document.getElementById('productSheetContent');if(!content)return;
 const h=content.querySelector('.dsp-single-grid h2'),target=content.querySelector('.dsp-single-gallery');
 if(!h||!target||target.querySelector('.hc-fix-gallery'))return;
 const prod=catalog().find(p=>p.title===h.textContent.trim());if(!prod)return;
 const photos=[...new Set([prod.image,...(Array.isArray(prod.gallery)?prod.gallery:[])].filter(x=>typeof x==='string'&&(/^(https?:\/\/|\/)/.test(x))))];
 if(!photos.length)return;
 let index=0,zoomImg=null;
 const root=document.createElement('div');root.className='hc-fix-gallery';
 const stage=document.createElement('div');stage.className='hc-fix-stage';
 const main=document.createElement('img');main.className='hc-fix-main';main.alt=prod.title;
 const thumbs=document.createElement('div');thumbs.className='hc-fix-thumbs';
 const choose=i=>{index=(i+photos.length)%photos.length;main.src=photos[index];if(zoomImg)zoomImg.src=main.src;[...thumbs.children].forEach((b,j)=>b.setAttribute('aria-pressed',String(i===j)));};
 const arrow=(name,symbol,step)=>{let b=document.createElement('button');b.type='button';b.className='hc-fix-'+name;b.textContent=symbol;b.setAttribute('aria-label',name==='prev'?'Fotografía anterior':'Fotografía siguiente');b.onclick=()=>choose(index+step);return b};
 const zoom=()=>{
  if(closeZoom)closeZoom();
  const layer=document.createElement('div');layer.className='hc-fix-zoom';layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label','Fotografía ampliada');
  zoomImg=document.createElement('img');zoomImg.src=main.src;zoomImg.alt=prod.title;
  const close=document.createElement('button');close.className='hc-fix-close';close.type='button';close.textContent='×';close.setAttribute('aria-label','Cerrar');
  const keys=e=>{if(e.key==='Escape')dismiss();if(e.key==='ArrowLeft')choose(index-1);if(e.key==='ArrowRight')choose(index+1)};
  const dismiss=()=>{layer.remove();document.removeEventListener('keydown',keys);zoomImg=null;closeZoom=null};closeZoom=dismiss;
  close.onclick=dismiss;layer.onclick=e=>{if(e.target===layer)dismiss()};
  layer.append(zoomImg,close);if(photos.length>1)layer.append(arrow('prev','‹',-1),arrow('next','›',1));
  document.body.appendChild(layer);document.addEventListener('keydown',keys);close.focus();
 };
 main.onclick=zoom;stage.append(main);if(photos.length>1)stage.append(arrow('prev','‹',-1),arrow('next','›',1));
 for(let i=0;i<photos.length;i++){const btn=document.createElement('button');btn.type='button';btn.setAttribute('aria-label','Mostrar fotografía '+(i+1));const img=document.createElement('img');img.src=photos[i];img.alt='';btn.append(img);btn.onclick=()=>choose(i);thumbs.append(btn)}
 root.append(stage);if(photos.length>1)root.append(thumbs);target.replaceChildren(root);choose(0);
}
function boot(){setupNavigation();const content=document.getElementById('productSheetContent');if(content){new MutationObserver(()=>{if(closeZoom)closeZoom();setupGallery()}).observe(content,{childList:true,subtree:false});setupGallery()}}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
