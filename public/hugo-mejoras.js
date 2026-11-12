/* Hugo Congas – categorías y visor; no altera stock ni pagos */
(()=>{'use strict';
const SUB={
 percusion:['Campanas','Contracampanas','Cha-Cha','Timbales','Congas','Bongós','Maracas','Baquetas','Platillos','Parantes','Clamps','Accesorios de batucada','Accesorios metálicos','Cencerro','Parches','Baterías','Otros de percusión'],
 audio:['Micrófonos','Micrófonos inalámbricos','Consolas y mezcladoras','Interfaces de audio','Parlantes activos','Parlantes pasivos','Monitores','Cables y conectores','Soportes para micrófonos','Otros de audio'],
 vientos:['Trompetas','Trombones','Saxofones','Flautas','Boquillas','Otros de vientos'],
 cuerdas:['Guitarras acústicas','Guitarras eléctricas','Guitarras electroacústicas','Cuerdas','Accesorios y soportes','Otros de cuerdas'],
 bajos:['Bajos eléctricos','Bajos acústicos','Amplificadores','Cuerdas para bajo','Accesorios para bajo'],
 teclados:['Pianos digitales','Teclados','Sintetizadores','Controladores MIDI','Pedales y soportes','Otros teclados']
};
// Orden alfabético (español) de subcategorías, sin cambiar productos ni etiquetas guardadas.
for(const subcats of Object.values(SUB)) subcats.sort((a,b)=>a.localeCompare(b,'es-PE',{sensitivity:'base'}));
const CAT={percusion:'Percusión Latina',audio:'Audio Profesional',vientos:'Vientos',cuerdas:'Guitarras y Cuerdas',bajos:'Bajos',teclados:'Teclados'};
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const leaf=p=>String(p?.catLabel||'').split(',').pop().trim();
// Los títulos antiguos pueden decir CONTRA-CAMPANA o CONTRACAMPANA aunque
// se hayan subido con una etiqueta genérica. Se clasifican correctamente al mostrar.
const isContraCampana=p=>p?.category==='percusion'&&/\bcontra\s*campanas?\b/.test(norm(p.title));
// Cha-Cha SOLO para títulos con chacha/cha-cha/cha cha (y plurales).
const isChaCha=p=>p?.category==='percusion'&&/\bcha[\s-]*chas?\b/i.test(String(p.title||''));
const leafFor=p=>{
 if(isChaCha(p))return 'Cha-Cha';
 if(isContraCampana(p))return 'Contracampanas';
 const v=leaf(p),n=norm(v);
 if(n==='herrajes metalicos')return 'Accesorios de batucada';
 if(n==='cencerros')return 'Cencerro';
 return v;
};
const subMatches=(p,sub)=>{
 const wanted=norm(sub),label=norm(leafFor(p)),title=norm(p.title);
 if(!wanted)return true;
 // Un Cha-Cha no debe aparecer mezclado con Campanas, Contracampanas u otros.
 if(isChaCha(p))return wanted==='cha cha';
 if(p?.category==='percusion'&&(wanted==='campanas'||wanted==='contracampanas')){
   if(isContraCampana(p))return wanted==='contracampanas';
   if(wanted==='contracampanas')return /\bcontra\s*campanas?\b/.test(title)||/\bcontra\s*campanas?\b/.test(label);
   return /\bcampanas?\b/.test(label)||/\bcampanas?\b/.test(title);
 }
 return label===wanted||label.includes(wanted)||(wanted.includes(label)&&label.length>3)||((!label||label===norm(p.category))&&title.includes(wanted));
};
function classifyExisting(){
 if(typeof PRODUCTS==='undefined'||!Array.isArray(PRODUCTS))return;
 for(const p of PRODUCTS){
   if(isChaCha(p))p.catLabel='Percusión Latina, Cha-Cha';
   else if(isContraCampana(p))p.catLabel='Percusión Latina, Contracampanas';
   else if(p?.category==='percusion'&&norm(leaf(p))==='herrajes metalicos')p.catLabel='Percusión Latina, Accesorios de batucada';
   else if(p?.category==='percusion'&&norm(leaf(p))==='cencerros')p.catLabel='Percusión Latina, Cencerro';
 }
}

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&quot;'}[c]));
const css=`
#hc-inline-detail .hc-detail-image,.dsp-single-gallery{width:100%!important;max-width:420px!important;min-width:0!important;max-height:390px!important;overflow:hidden!important;display:flex!important;justify-content:center;align-items:center;background:#151515;border-radius:12px;position:relative!important;box-sizing:border-box!important}
#hc-inline-detail .hc-detail-image img,.dsp-single-gallery img{max-width:100%!important;width:auto!important;max-height:350px!important;height:auto!important;object-fit:contain!important;cursor:zoom-in!important}
#hc-inline-detail .hc-gallery-customer{width:min(100%,420px)!important;min-width:0!important;max-width:100%!important}
#hc-inline-detail .hc-gallery-thumbs{display:flex!important;max-width:100%;flex-wrap:nowrap!important;overflow-x:auto;gap:7px!important;padding:6px 0}
#hc-inline-detail .hc-gallery-thumbs button{flex:0 0 62px}
#hc-inline-detail .hc-detail-grid img,.dsp-single-grid .dsp-single-gallery img{max-width:100%!important;max-height:350px!important;object-fit:contain!important}
#hc-inline-detail .hc-detail-image ~ img,.dsp-single-gallery > img:not(:first-child){display:none!important}
/* Flechas flotantes elegantes DENTRO de la foto, nunca al costado ni debajo. */
#hc-inline-detail .hc-detail-image .hc-hg-nav{position:absolute!important;inset:0!important;z-index:5;display:flex!important;align-items:center!important;justify-content:space-between!important;margin:0!important;padding:10px!important;gap:0!important;pointer-events:none!important;background:transparent!important}
#hc-inline-detail .hc-hg-nav button{pointer-events:auto!important;display:grid!important;place-items:center!important;flex:0 0 auto!important;width:40px!important;height:40px!important;padding:0!important;border:1px solid rgba(255,255,255,.32)!important;border-radius:50%!important;background:rgba(11,11,11,.77)!important;box-shadow:0 4px 15px rgba(0,0,0,.35)!important;color:#fff!important;font:bold 26px/1 Arial,sans-serif!important;transition:background .16s,transform .16s!important;cursor:pointer!important}
#hc-inline-detail .hc-hg-nav button:hover,#hc-inline-detail .hc-hg-nav button:focus-visible{background:#e9bf22!important;color:#111!important;transform:scale(1.08)!important;outline:2px solid #f1d463!important;outline-offset:2px!important}
#hc-inline-detail .hc-detail-image>img{max-width:calc(100% - 28px)!important;max-height:345px!important;border-radius:8px!important;object-fit:contain!important}
#hc-inline-detail .hc-gallery-thumbs{margin:9px 0 0!important;padding:8px 0!important}
#hc-inline-detail .hc-gallery-thumbs button{border-radius:9px!important;border:1px solid #555!important;opacity:.74;transition:opacity .18s,border-color .18s}
#hc-inline-detail .hc-gallery-thumbs button[aria-pressed=true]{opacity:1;border:2px solid #f0c930!important}
#hc-inline-detail .hc-detail-image:after{content:'Haz clic para ampliar';position:absolute;bottom:9px;left:50%;transform:translateX(-50%);font:12px Arial,sans-serif;color:#eee;background:rgba(0,0,0,.6);border-radius:999px;padding:4px 11px;pointer-events:none;white-space:nowrap}
#hc-hg-lightbox[hidden]{display:none!important}#hc-hg-lightbox{position:fixed;z-index:2147483646;inset:0;background:rgba(0,0,0,.96);display:grid;grid-template-columns:60px minmax(0,1fr) 60px;grid-template-rows:55px minmax(0,1fr) 55px;align-items:center;justify-items:center;touch-action:pan-y;color:white}
#hc-hg-lightbox img{grid-column:2;grid-row:2;max-width:100%;max-height:calc(100dvh - 120px);height:auto;width:auto;object-fit:contain}#hc-hg-lightbox button{border:1px solid #777;color:white;background:rgba(20,20,20,.82);border-radius:50%;width:46px;height:46px;font:28px Arial;cursor:pointer;display:grid;place-items:center;transition:background .18s,transform .18s}#hc-hg-lightbox button:hover,#hc-hg-lightbox button:focus-visible{background:#f1c731;color:#111;transform:scale(1.07);outline:2px solid #fff}
#hc-hg-lightbox .hc-close{grid-column:3;grid-row:1}#hc-hg-lightbox .hc-prev{grid-column:1;grid-row:2}#hc-hg-lightbox .hc-next{grid-column:3;grid-row:2}#hc-hg-lightbox .hc-counter{grid-column:2;grid-row:3;color:#ddd;font:13px Arial}
#hc-hg-categories{margin:15px 0;padding:14px;border:1px solid #494125;border-radius:12px;background:#141310;color:#fff}#hc-hg-categories label{display:block;font-weight:700;font-size:13px;margin-bottom:8px}#hc-hg-categories select{width:min(100%,380px);padding:10px;border-radius:9px;background:#181818;color:#fff;border:1px solid #555}
@media(max-width:620px){#hc-inline-detail .hc-detail-image,.dsp-single-gallery{max-width:100%!important;max-height:310px!important}#hc-inline-detail .hc-detail-image img,.dsp-single-gallery img{max-height:270px!important}#hc-hg-lightbox{grid-template-columns:42px minmax(0,1fr) 42px}#hc-hg-lightbox button{width:36px;height:36px;font-size:24px}#hc-inline-detail .hc-hg-nav button{width:34px!important;height:34px!important;font-size:23px!important}#hc-inline-detail .hc-detail-image:after{font-size:10px}}
`;
const style=document.createElement('style');style.textContent=css;document.head.append(style);
function setupAdmin(){const form=document.getElementById('hc-product-form');if(!form||form.dataset.hgSubcat)return;form.dataset.hgSubcat='1';const category=form.elements.namedItem('category'),old=form.elements.namedItem('catLabel');if(!category||!old)return;const latin=category.querySelector('option[value=percusion]');if(latin)latin.textContent='Percusión Latina';
 const sel=document.createElement('select');sel.name='catLabel';sel.required=true;sel.id='hc-hg-subcategory';sel.style.cssText='width:100%;min-height:40px;background:#222;color:white';old.replaceWith(sel);
 const lab=sel.closest('label');if(lab)lab.childNodes[0].textContent='Subcategoría donde aparecerá el producto ';
 const rebuild=value=>{let current=String(value??sel.value??'');const prefix=CAT[category.value]||category.value;
  if(category.value==='percusion'){
   const n=norm(current.split(',').pop());
   if(n==='herrajes metalicos')current='Percusión Latina, Accesorios de batucada';
   if(n==='cencerros')current='Percusión Latina, Cencerro';
  }const values=(SUB[category.value]||['General']).map(x=>prefix+', '+x);if(current&&!values.some(v=>norm(v)===norm(current)))values.unshift(current);sel.replaceChildren(new Option('Selecciona subcategoría',''));values.forEach(v=>sel.add(new Option(v.split(',').slice(-1)[0].trim(),v)));sel.value=values.find(v=>norm(v)===norm(current))||'';};
 category.addEventListener('change',()=>rebuild(''));rebuild(old.value);
 form.addEventListener('click',e=>{if(e.target?.closest?.('#hc-save-product'))return;},true);
 const list=document.getElementById('hc-item-list');if(list){list.addEventListener('click',e=>{if(e.target.closest('[data-edit]')){const id=Number(e.target.closest('[data-edit]').dataset.edit);queueMicrotask(()=>{const p=(typeof PRODUCTS!=='undefined'?PRODUCTS:[]).find(x=>Number(x.id)===id);rebuild(p?.catLabel||'')})}},true)}
 const newbtn=document.getElementById('hc-new');newbtn?.addEventListener('click',()=>queueMicrotask(()=>{rebuild('');sel.value=''}));
 const titleField=form.elements.namedItem('title');
 titleField?.addEventListener('input',()=>{
   if(category.value==='percusion'){
     const p={category:'percusion',title:titleField.value};
     const destination=isChaCha(p)?'Percusión Latina, Cha-Cha':isContraCampana(p)?'Percusión Latina, Contracampanas':null;
     if(!destination)return;
     if(sel.value!==destination){rebuild(destination);sel.value=destination;}
   }
 });
 const bar=document.querySelector('#hc-workspace .hc-admin-actions');if(bar&&!document.getElementById('hc-hg-orders-link')){const a=document.createElement('a');a.id='hc-hg-orders-link';a.textContent='📦 Pedidos pagados';a.href='/gestion-pedidos.html';a.style.cssText='padding:10px 12px;background:#ffd400;color:#000;border-radius:8px;font-weight:800;text-decoration:none';bar.prepend(a)}
}
// Un filtro adicional real, sin sustituir el catálogo ni sus rutinas de precios/stock.
let selected={cat:'',sub:''};let wrapped=false;
function applySubFilter(){const grid=document.getElementById('archiveProductsGrid');if(!grid)return;const prod=typeof PRODUCTS!=='undefined'?PRODUCTS:[];let count=0;for(const card of grid.querySelectorAll('li.dsp-prod-card')){const h=card.querySelector('[onclick*="openProductSheet"]');const id=Number((h?.getAttribute('onclick')||'').match(/openProductSheet\((\d+)\)/)?.[1]);const p=prod.find(q=>Number(q.id)===id);const show=!selected.sub||(p&&p.category===selected.cat&&subMatches(p,selected.sub));card.hidden=!show;card.style.display=show?'':'none';if(show)count++}if(selected.sub){grid.querySelectorAll('li.dsp-mid').forEach(el=>el.style.display='none');const counter=document.getElementById('archiveCountText');if(counter)counter.textContent=`${count} ${count===1?'producto':'productos'} en ${selected.sub}`}}
function setupCategories(){const grid=document.getElementById('archiveProductsGrid');if(!grid)return;classifyExisting();
 if(!document.getElementById('hc-hg-categories')){const container=document.createElement('div');container.id='hc-hg-categories';const label=document.createElement('label');label.textContent='Explora por categoría y tipo de instrumento';const select=document.createElement('select');select.setAttribute('aria-label','Filtrar subcategorías');container.append(label,select);grid.parentNode.insertBefore(container,grid);const rebuild=()=>{select.replaceChildren(new Option('Todas las subcategorías',''));for(const [cat,subs] of Object.entries(SUB))for(const sub of subs)select.add(new Option(`${CAT[cat]} → ${sub}`,`${cat}|${sub}`))};rebuild();select.addEventListener('change',()=>{const [cat,sub]=select.value.split('|');selected={cat:cat||'',sub:sub||''};if(cat&&typeof window.filterCatalog==='function')window.filterCatalog(cat);else if(typeof window.filterCatalog==='function')window.filterCatalog('all');applySubFilter()});window.hcHGChoose=(cat,sub)=>{const target=[...select.options].find(o=>o.value===`${cat}|${sub}`)||[...select.options].find(o=>o.value.startsWith(cat+'|')&&norm(o.textContent).includes(norm(sub)));if(target){select.value=target.value;select.dispatchEvent(new Event('change'))}else{selected={cat:'',sub:''};window.filterCatalog?.(cat)}};
 }
 if(!wrapped&&typeof window.renderArchiveGrid==='function'){const orig=window.renderArchiveGrid;window.renderArchiveGrid=function(...args){const v=orig.apply(this,args);applySubFilter();return v};wrapped=true}
 // Menú de Percusión y Audio con secciones efectivas, no enlaces genéricos.
 const menu=document.getElementById('dspMegaGrid');if(menu&&!menu.dataset.hgMenus){menu.dataset.hgMenus='1';menu.addEventListener('click',e=>{const a=e.target.closest('a.dsp-mega__tile');if(!a)return;const category=(a.getAttribute('onclick')||'').match(/filterCatalog\('([^']+)'\)/)?.[1];const name=a.querySelector('span')?.textContent||'';if(!category||!SUB[category])return;const s=SUB[category].find(n=>norm(n)===norm(name)||norm(name).includes(norm(n)));if(s){e.preventDefault();e.stopPropagation();window.hcHGChoose(category,s);document.getElementById('dspMegaPanel')?.classList.remove('is-open','hc-force-open')}},true)}
 const fams=document.getElementById('dspMegaFams');let pending=false;
 const syncMega=()=>{if(pending)return;pending=true;queueMicrotask(()=>{pending=false;const family=(fams?.querySelector('.is-active a')?.textContent||'').trim();const category=family==='Percusión Latina'?'percusion':family==='Audio Profesional'?'audio':'';if(!category||menu.querySelector('.hc-hg-tile'))return;const fragment=document.createDocumentFragment();for(const sub of SUB[category]){const a=document.createElement('a');a.className='dsp-mega__tile hc-hg-tile';a.href='#catalogo';a.style.cssText='cursor:pointer;min-height:35px';a.textContent=sub;a.onclick=e=>{e.preventDefault();e.stopPropagation();window.hcHGChoose(category,sub);menu.closest('.dsp-mega')?.classList.remove('is-open','hc-force-open')};fragment.appendChild(a)}const all=document.createElement('a');all.className='dsp-mega__all hc-hg-tile';all.href='#catalogo';all.textContent='Ver todo en '+family;all.onclick=e=>{e.preventDefault();window.hcHGChoose(category,'');window.filterCatalog?.(category);menu.closest('.dsp-mega')?.classList.remove('is-open','hc-force-open')};fragment.appendChild(all);menu.replaceChildren(fragment)})};
 if(fams&&menu&&!menu.dataset.hgObserver){menu.dataset.hgObserver='1';new MutationObserver(syncMega).observe(menu,{childList:true});new MutationObserver(syncMega).observe(fams,{attributes:true,subtree:true,attributeFilter:['class']});syncMega()}

}
let gallery=[],pos=0,priorOverflow='';
function getLightbox(){let root=document.getElementById('hc-hg-lightbox');if(root)return root;root=document.createElement('div');root.id='hc-hg-lightbox';root.hidden=true;root.setAttribute('role','dialog');root.setAttribute('aria-modal','true');root.innerHTML='<button class="hc-close" type="button" aria-label="Cerrar">×</button><button class="hc-prev" type="button" aria-label="Foto anterior">‹</button><img alt="Fotografía ampliada del instrumento"><button class="hc-next" type="button" aria-label="Foto siguiente">›</button><span class="hc-counter"></span>';document.body.appendChild(root);root.querySelector('.hc-close').onclick=close;root.querySelector('.hc-prev').onclick=()=>move(-1);root.querySelector('.hc-next').onclick=()=>move(1);root.addEventListener('click',e=>{if(e.target===root)close()});let startX=null;root.addEventListener('touchstart',e=>{startX=e.touches[0]?.clientX},{passive:true});root.addEventListener('touchend',e=>{if(startX===null)return;const d=(e.changedTouches[0]?.clientX||0)-startX;if(Math.abs(d)>35)move(d<0?1:-1);startX=null},{passive:true});return root}
function draw(){const root=getLightbox();root.querySelector('img').src=gallery[pos];root.querySelector('.hc-counter').textContent=`Foto ${pos+1} de ${gallery.length} · usa las flechas ← →`}
function move(d){if(!gallery.length)return;pos=(pos+d+gallery.length)%gallery.length;draw()}
function close(){const root=getLightbox();root.hidden=true;document.body.style.overflow=priorOverflow}
function open(photos,i){gallery=[...new Set(photos.filter(Boolean))];if(!gallery.length)return;pos=Math.max(0,i)%gallery.length;priorOverflow=document.body.style.overflow;document.body.style.overflow='hidden';const root=getLightbox();root.hidden=false;draw();root.querySelector('.hc-close').focus()}

function photoSet() {
  const d = document.getElementById('hc-inline-detail');
  const id = d?.querySelector('.hc-detail-image')?.dataset.hcProductId;
  const items = typeof PRODUCTS !== 'undefined' ? PRODUCTS : [];
  const title = d?.querySelector('.hc-detail-name')?.textContent;
  const p = items.find(x => String(x.id) === id)
         || items.find(x => x.title === title);
  return p ? [p.image, ...(Array.isArray(p.gallery) ? p.gallery : [])] : [];
}

function setupGallery(){const legacy=document.getElementById('productSheetContent');if(legacy&&!legacy.dataset.hgLegacy){legacy.dataset.hgLegacy='1';legacy.addEventListener('click',e=>{const img=e.target.closest('.dsp-single-gallery img');if(!img)return;const title=legacy.querySelector('h2')?.textContent;const p=(typeof PRODUCTS!=='undefined'?PRODUCTS:[]).find(x=>x.title===title);const photos=p?[p.image,...(Array.isArray(p.gallery)?p.gallery:[])]:[img.src];open(photos,Math.max(0,photos.indexOf(img.getAttribute('src'))))})}const detail=document.getElementById('hc-inline-detail');if(!detail||detail.dataset.hgClick)return;detail.dataset.hgClick='1';detail.addEventListener('click',e=>{const el=e.target.closest('.hc-detail-image img');if(!el)return;const photos=photoSet();open(photos.length?photos:[el.src],Math.max(0,photos.indexOf(el.getAttribute('src'))))});
 document.addEventListener('keydown',e=>{const root=document.getElementById('hc-hg-lightbox');if(!root||root.hidden)return;if(e.key==='Escape')close();if(e.key==='ArrowRight')move(1);if(e.key==='ArrowLeft')move(-1)});
 // Añadir botones de navegación justo debajo de la foto principal.
 let scheduled=false;const observe=new MutationObserver(()=>{if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;const d=document.getElementById('hc-inline-detail');if(!d||d.hidden)return;const holder=d.querySelector('.hc-detail-image');if(!holder||holder.querySelector('.hc-hg-nav'))return;const photos=photoSet();if(photos.length<2)return;const bar=document.createElement('div');bar.className='hc-hg-nav';bar.innerHTML='<button type="button" aria-label="Fotografía anterior" title="Anterior">‹</button><button type="button" aria-label="Fotografía siguiente" title="Siguiente">›</button>';bar.children[0].onclick=()=>cycle(-1);bar.children[1].onclick=()=>cycle(1);holder.appendChild(bar)})});observe.observe(detail,{childList:true,subtree:true});
 function cycle(delta){const photos=photoSet();if(photos.length<2)return;const im=detail.querySelector('.hc-detail-image img');if(!im)return;let i=photos.indexOf(im.getAttribute('src'));if(i<0)i=0;i=(i+delta+photos.length)%photos.length;im.src=photos[i];detail.querySelectorAll('.hc-gallery-thumbs button').forEach((el,j)=>el.setAttribute('aria-pressed',String(j===i)))}
}
function init(){setupAdmin();setupCategories();setupGallery();const obs=new MutationObserver(()=>{setupAdmin();setupCategories()});obs.observe(document.body,{childList:true,subtree:true})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
