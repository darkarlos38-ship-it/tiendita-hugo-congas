(function(){
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const api=async(path,method='GET',data)=>{const res=await fetch('/api/'+path,{method,credentials:'same-origin',headers:data?{'Content-Type':'application/json'}:{},body:data?JSON.stringify(data):undefined});const j=await res.json();if(!res.ok)throw Error(j.error||'Error del servidor');return j};
let editId=null,allProducts=[],inlineMode=false,inlineSettings={};
// Conservar el escaparate de demostración cuando todavía no hay productos reales
// en una sección. El administrador solo gestiona los productos reales de D1.
const showcaseExamples = PRODUCTS.map(p=>({...p,id:-Math.abs(Number(p.id))}));
const showcaseSections = ['bestseller','new','audio'];
function publicProductsFrom(real){
 const overrides=inlineSettings.demoOverrides||{};
 const demos=showcaseExamples.filter(p=>!overrides[String(p.id)]?.hidden).map(p=>({...p,...(overrides[String(p.id)]||{})}));
 return [...real,...demos];
}

function mediaSelectors(){return {hero:'.ds-hero__media',promoLarge:'.dsp-promo-card--large',promoTop:'.dsp-promo-card--top',promoBottom:'.dsp-promo-card--bottom',faq:'.dsp-faq-card'};}
function refreshBannerMedia(){
 const saved=inlineSettings.inlineMedia||{};
 for(const [key,selector] of Object.entries(mediaSelectors())){
  const el=document.querySelector(selector);if(!el||saved[key]===undefined)continue;
  if(!el.dataset.hcOriginalBg)el.dataset.hcOriginalBg=getComputedStyle(el).backgroundImage;
  if(saved[key]===''){el.style.setProperty('background-image','linear-gradient(115deg,#0b0b0b,#202020)','important');continue}
  const gradient=key==='hero'?'linear-gradient(90deg,#050505 0%,rgba(0,0,0,.6) 42%,rgba(0,0,0,.15) 100%)':'linear-gradient(90deg,rgba(0,0,0,.88),rgba(0,0,0,.17))';
  el.style.setProperty('background-image',gradient+',url("'+saved[key].replace(/["\\]/g,'')+'")','important');
  el.style.setProperty('background-size','cover','important');el.style.setProperty('background-position','center','important');
 }
}

function message(s){$('hc-admin-msg').textContent=s;}
function showPanel(){ $('hc-admin-shell').hidden=false; document.body.style.overflow='hidden';checkSession(); }
function hidePanel(){$('hc-admin-shell').hidden=true;document.body.style.overflow=''}
async function checkSession(){const s=await api('session');$('hc-login').hidden=s.authenticated;$('hc-workspace').hidden=!s.authenticated;if(s.authenticated){await reloadAdmin();ensureClaimsAdmin()}}
async function reloadPublic(){try{const data=await api('catalog');const actual=Array.isArray(data.products)?data.products:[];allProducts=actual;inlineSettings=data.settings||{};PRODUCTS.splice(0,PRODUCTS.length,...publicProductsFrom(actual)); if(data.settings.heroTitle){const h=document.querySelector('.ds-hero h1');if(h)h.textContent=data.settings.heroTitle}if(data.settings.heroText){const p=document.querySelector('.ds-hero__content > p');if(p)p.textContent=data.settings.heroText} $('hc-hero-title').value=data.settings.heroTitle||'';$('hc-hero-text').value=data.settings.heroText||'';renderHomeCarousels();renderArchiveGrid();refreshBannerMedia();if(inlineMode)queueInlineControls();}catch(e){console.error('No se pudo cargar el catálogo',e)}}
async function reloadAdmin(){await reloadPublic();$('hc-item-list').innerHTML=allProducts.map(p=>`<div class="hc-ad-row"><span>${esc(p.title)} <small>${esc(p.brand)} · S/ ${Number(p.price).toFixed(2)} · Stock ${p.stock||0}</small></span><button data-edit="${p.id}">Editar</button></div>`).join('');$('hc-item-list').querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>editProduct(Number(b.dataset.edit)))}
function resetForm(){editId=null;$('hc-product-form').reset();$('hc-save-product').textContent='Añadir producto';$('hc-delete-product').hidden=true;$('hc-image-preview').removeAttribute('src');$('hc-image-path').value='';$('hc-product-form').querySelector('[name="section"]').value='new';}
function editProduct(id){const p=allProducts.find(x=>x.id===id);if(!p)return;resetForm();editId=id;for(const k of ['title','brand','category','catLabel','price','oldPrice','stock','desc','section']){const el=$('hc-product-form').elements.namedItem(k);if(el)el.value=p[k]??''}$('hc-image-path').value=p.image||'';if(p.image)$('hc-image-preview').src=p.image;$('hc-save-product').textContent='Guardar cambios';$('hc-delete-product').hidden=false;switchTab('products');$('hc-product-form').scrollIntoView({block:'start',behavior:'smooth'})}
function switchTab(which){for(const tab of ['products','settings'])$('hc-tab-'+tab).hidden=tab!==which;$('hc-switch-products').classList.toggle('selected',which==='products');$('hc-switch-settings').classList.toggle('selected',which==='settings')}

function ensureClaimsAdmin(){
 if($('hc-claims-admin'))return;
 const wrap=document.createElement('div');wrap.id='hc-claims-admin';wrap.style.cssText='padding:16px;border:1px solid #444;border-radius:12px;margin:16px 0;background:#111;color:#fff';
 wrap.innerHTML=`<h3 style="color:#fff;margin:0 0 12px">Datos legales y Libro de Reclamaciones</h3>
 <p style="color:#bbb">Completa los datos del titular. Sin ellos el libro no permitirá enviar reclamaciones.</p>
 <form id="hc-provider-form" style="display:grid;gap:8px"><label>Razón social o nombre legal<input name="legalName" required maxlength="200"></label><label>RUC (11 dígitos)<input name="ruc" required inputmode="numeric" pattern="[0-9]{11}" maxlength="11"></label><label>Domicilio legal<input name="address" required maxlength="300"></label><button type="submit" style="background:#ffd600;color:#111;padding:10px;border:0;border-radius:8px">Guardar datos legales</button></form>
 <button type="button" id="hc-claims-refresh" style="margin:16px 0 8px;background:#ffd600;color:#111;padding:10px;border:0;border-radius:8px">Ver reclamaciones recibidas</button><div id="hc-claims-list" style="display:grid;gap:10px"></div>`;
 $('hc-workspace').appendChild(wrap);
 api('provider').then(p=>{for(const k of ['legalName','ruc','address'])wrap.querySelector('[name="'+k+'"]').value=p[k]||''}).catch(()=>{});
 $('hc-provider-form').onsubmit=async e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.target));try{await api('provider','PUT',data);message('Datos legales guardados')}catch(err){message(err.message)}};
 $('hc-claims-refresh').onclick=async()=>{const list=$('hc-claims-list');list.textContent='Consultando...';try{const res=await api('claims');list.replaceChildren();if(!res.claims.length){list.textContent='No hay reclamaciones registradas';return;}for(const c of res.claims){const d=c.details||{};const div=document.createElement('div');div.style.cssText='border:1px solid #555;padding:12px;border-radius:8px;overflow-wrap:anywhere';const h=document.createElement('strong');h.textContent=c.number+' · '+c.status+' · '+c.created_at;const p=document.createElement('pre');p.style.cssText='white-space:pre-wrap;font:13px/1.6 inherit;color:#ddd';p.textContent=[d.tipo,d.nombres+' '+d.apellidos,'Documento: '+d.documento_tipo+' '+d.documento,'Correo: '+d.correo,'Teléfono: '+d.telefono,'Producto o servicio: '+d.bien_descripcion,'Monto: S/ '+d.monto,'Detalle: '+d.detalle,'Pedido: '+d.pedido].join('\n');div.append(h,p);list.appendChild(div)}}catch(err){list.textContent=err.message}};
}

// EDICIÓN VISUAL: el dueño administra sobre el escaparate, sin cambiar de página.
let inlinePending=false;
function ensureInlineEditor(){
 if($('hc-inline-toolbar'))return;
 const style=document.createElement('style');style.textContent=`
 body.hc-inline-mode .mas-product,body.hc-inline-mode .dsp-prod-card,body.hc-inline-mode .dsp-promo-card,body.hc-inline-mode .dsp-faq-card,body.hc-inline-mode .ds-hero{position:relative!important}
 .hc-inline-controls{position:absolute;z-index:100;top:9px;right:9px;display:flex;gap:5px;pointer-events:auto}
 .hc-inline-controls button{border:1px solid #575757!important;border-radius:7px!important;background:#101010!important;color:#fff!important;box-shadow:0 3px 18px #000b!important;padding:7px 9px!important;font-size:12px!important;line-height:1.2!important;cursor:pointer!important}
 .hc-inline-controls button.hc-img-remove{background:#4c1818!important;border-color:#9b4949!important}
 .hc-inline-controls button:hover{border-color:#ffd600!important;color:#ffd600!important}
 .hc-inline-toolbar{position:fixed;z-index:99988;bottom:18px;left:50%;transform:translateX(-50%);background:#171717;border:1px solid #555;box-shadow:0 14px 55px #000b;border-radius:14px;padding:10px;display:flex;align-items:center;gap:8px;color:#fff;font:600 13px Arial,sans-serif;max-width:95vw;flex-wrap:wrap;justify-content:center}
 .hc-inline-toolbar button,.hc-inline-dialog button{border:1px solid #555;border-radius:9px;padding:10px 12px;background:#292929;color:#fff;cursor:pointer;font:600 13px Arial,sans-serif}
 .hc-inline-toolbar button.primary,.hc-inline-dialog button.primary{background:#ffda00;color:#111;border:0}
 .hc-inline-dialog{position:fixed;z-index:99999;right:15px;top:15px;bottom:15px;width:min(440px,calc(100vw - 30px));background:#111;border:1px solid #484848;border-radius:16px;box-shadow:0 20px 90px #000e;display:flex;flex-direction:column;color:#fff;font:14px Arial,sans-serif}
 .hc-inline-dialog[hidden],.hc-inline-toolbar[hidden]{display:none!important}
 .hc-inline-dialog .hc-inline-head{padding:16px;display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #363636}
 .hc-inline-dialog .hc-inline-body{padding:16px;overflow-y:auto;display:grid;gap:12px}
 .hc-inline-dialog label{display:grid;gap:5px;font-weight:600;color:#eee}
 .hc-inline-dialog input,.hc-inline-dialog select,.hc-inline-dialog textarea{background:#1e1e1e;color:#fff;border:1px solid #555;padding:10px;border-radius:8px;width:100%;font:14px Arial,sans-serif}
 .hc-inline-dialog input:focus,.hc-inline-dialog select:focus{outline:2px solid #ffda00}
 .hc-inline-dialog .hc-preview-photo{height:150px;max-width:100%;object-fit:contain;border-radius:9px;background:#202020}
 .hc-inline-dialog small,.hc-inline-dialog .hc-inline-status{color:#ddd;line-height:1.5}
 .hc-inline-dialog .hc-inline-actions{display:flex;gap:8px;flex-wrap:wrap}
 body.hc-inline-mode .mas-product,body.hc-inline-mode .dsp-prod-card{outline:1px dashed #8d7613}
 @media(max-width:600px){.hc-inline-toolbar{bottom:8px;width:calc(100vw - 20px)}.hc-inline-controls{right:4px;top:4px}.hc-inline-controls button{padding:5px!important;font-size:11px!important}}
 `;document.head.appendChild(style);
 const bar=document.createElement('div');bar.id='hc-inline-toolbar';bar.className='hc-inline-toolbar';bar.hidden=true;
 bar.innerHTML='<span>✏ Edición en pantalla</span><button id="hc-inline-new" class="primary">+ Instrumento</button><button id="hc-inline-panel">Panel completo</button><button id="hc-inline-end">Terminar</button>';
 document.body.appendChild(bar);
 $('hc-inline-new').onclick=()=>{setInlineMode(false);showPanel();resetForm();switchTab('products')};
 $('hc-inline-panel').onclick=()=>{setInlineMode(false);showPanel()};
 $('hc-inline-end').onclick=()=>setInlineMode(false);
 const dialog=document.createElement('div');dialog.id='hc-inline-dialog';dialog.className='hc-inline-dialog';dialog.hidden=true;
 dialog.innerHTML='<div class="hc-inline-head"><strong id="hc-inline-title">Editar imagen</strong><button type="button" id="hc-inline-close" aria-label="Cerrar">✕</button></div><div class="hc-inline-body" id="hc-inline-body"></div>';
 document.body.appendChild(dialog);$('hc-inline-close').onclick=()=>dialog.hidden=true;
}
function setInlineMode(on){
 ensureInlineEditor();inlineMode=!!on;document.body.classList.toggle('hc-inline-mode',inlineMode);$('hc-inline-toolbar').hidden=!inlineMode;
 if(!inlineMode){$('hc-inline-dialog').hidden=true;document.querySelectorAll('.hc-inline-controls').forEach(x=>x.remove());}
 else queueInlineControls();
}
function queueInlineControls(){
 if(inlinePending)return;inlinePending=true;
 requestAnimationFrame(()=>{inlinePending=false;if(inlineMode)drawInlineControls()});
}
function drawInlineControls(){
 if(!inlineMode)return;
 document.querySelectorAll('.mas-product,.dsp-prod-card').forEach(card=>{
  if(card.querySelector(':scope > .hc-inline-controls'))return;
  const trigger=card.querySelector('[onclick*="openProductSheet"]');
  const m=trigger?.getAttribute('onclick')?.match(/openProductSheet\((-?\d+)\)/);
  if(!m)return;const id=Number(m[1]);
  const controls=document.createElement('div');controls.className='hc-inline-controls';
  const edit=document.createElement('button');edit.textContent='✎ Editar';edit.type='button';edit.onclick=e=>{e.stopPropagation();editInlineProduct(id)};
  const remove=document.createElement('button');remove.className='hc-img-remove';remove.textContent='✕ Foto';remove.title='Quitar foto (conserva instrumento)';remove.type='button';remove.onclick=async e=>{e.stopPropagation();if(!confirm('¿Quitar la fotografía de este instrumento?'))return;try{await updateInlineProduct(id,{image:''});await reloadAdmin()}catch(err){alert(err.message)}};
  controls.append(edit,remove);card.prepend(controls);
 });
 for(const [key,sel] of Object.entries(mediaSelectors())){
  const target=document.querySelector(sel);const media=key==='hero'?document.querySelector('.ds-hero'):target;if(!target||!media||media.querySelector(':scope > .hc-inline-controls'))continue;
  const controls=document.createElement('div');controls.className='hc-inline-controls';
  const edit=document.createElement('button');edit.type='button';edit.textContent='✎ Cambiar imagen';edit.onclick=e=>{e.preventDefault();e.stopPropagation();editInlineBanner(key)};
  const remove=document.createElement('button');remove.type='button';remove.textContent='✕ Foto';remove.className='hc-img-remove';remove.onclick=async e=>{e.stopPropagation();if(!confirm('¿Quitar esta imagen del banner?'))return;try{await api('inline-media','PUT',{key,image:''});await reloadPublic()}catch(err){alert(err.message)}};
  controls.append(edit,remove);media.appendChild(controls);
 }
}
async function updateInlineProduct(id,changes){
 if(id<0)return api('demo','PUT',{id,action:'save',changes});
 const product=allProducts.find(p=>Number(p.id)===id);if(!product)throw Error('No encontré el instrumento');
 return api('products/'+id,'PUT',{...product,...changes});
}
async function uploadInlinePhoto(file){
 const f=new FormData();f.append('image',file);const res=await fetch('/api/image-upload',{method:'POST',body:f,credentials:'same-origin'});
 const body=await res.json();if(!res.ok)throw Error(body.error||'No se pudo subir');return body.url;
}
function inlinePhotoControls(body,url=''){
 const photo=document.createElement('div');photo.style.display='grid';photo.style.gap='8px';
 photo.innerHTML='<label>Imagen desde tu computadora (JPG, PNG o WebP)<input type="file" id="hc-inline-file" accept="image/jpeg,image/png,image/webp"></label><small>La carga de archivos se habilitará al conectar Cloudflare R2. Por ahora puedes pegar la URL HTTPS de la foto.</small><label>O enlace HTTPS de la imagen<input id="hc-inline-url" type="url" placeholder="https://..." value="'+esc(url)+'"></label><img class="hc-preview-photo" id="hc-inline-preview" alt="Vista previa de foto">';
 body.appendChild(photo);
 const inp=photo.querySelector('#hc-inline-url'),prev=photo.querySelector('#hc-inline-preview');prev.src=url||'';prev.hidden=!url;
 inp.oninput=()=>{prev.src=inp.value||'';prev.hidden=!inp.value};
 return async()=>{const file=photo.querySelector('#hc-inline-file').files[0];return file?await uploadInlinePhoto(file):inp.value.trim()};
}
function openInlineDialog(title){ensureInlineEditor();$('hc-inline-title').textContent=title;$('hc-inline-dialog').hidden=false;const body=$('hc-inline-body');body.replaceChildren();return body;}
function addInlineStatus(body){const p=document.createElement('p');p.className='hc-inline-status';p.setAttribute('aria-live','polite');body.appendChild(p);return p}
function editInlineProduct(id){
 const p=PRODUCTS.find(x=>Number(x.id)===id);if(!p)return;
 const body=openInlineDialog('Editar instrumento en la portada');const getPhoto=inlinePhotoControls(body,p.image||'');
 const form=document.createElement('form');form.style.display='grid';form.style.gap='10px';
 form.innerHTML='<label>Nombre<input name="title" required maxlength="180" value="'+esc(p.title)+'"></label><label>Marca<input name="brand" required value="'+esc(p.brand)+'"></label><label>Precio S/<input name="price" type="number" min="0" step="0.01" required value="'+Number(p.price)+'"></label><label>Precio anterior S/<input name="oldPrice" type="number" min="0" step="0.01" value="'+Number(p.oldPrice||p.price)+'"></label><label>Stock<input name="stock" type="number" min="0" step="1" value="'+Number(p.stock||0)+'"></label><label>Descripción<textarea name="desc" rows="3">'+esc(p.desc||'')+'</textarea></label><div class="hc-inline-actions"><button class="primary" type="submit">Guardar cambios</button><button id="hc-inline-delete" type="button">Eliminar instrumento</button></div>';
 body.appendChild(form);const status=addInlineStatus(body);
 form.onsubmit=async e=>{e.preventDefault();status.textContent='Guardando...';try{const changes=Object.fromEntries(new FormData(form));changes.image=await getPhoto();await updateInlineProduct(id,changes);await reloadAdmin();status.textContent='Guardado correctamente en Cloudflare D1';$('hc-inline-dialog').hidden=true}catch(err){status.textContent=err.message}};
 form.querySelector('#hc-inline-delete').onclick=async()=>{if(!confirm('¿Eliminar este instrumento del escaparate?'))return;try{if(id<0)await api('demo','PUT',{id,action:'hide'});else await api('products/'+id,'DELETE');await reloadAdmin();$('hc-inline-dialog').hidden=true}catch(err){status.textContent=err.message}};
}
function editInlineBanner(key){
 const body=openInlineDialog('Cambiar imagen de la portada');const saved=inlineSettings.inlineMedia?.[key];const getPhoto=inlinePhotoControls(body,saved||'');
 const save=document.createElement('button');save.type='button';save.className='primary';save.textContent='Guardar imagen';body.appendChild(save);const status=addInlineStatus(body);
 save.onclick=async()=>{status.textContent='Guardando...';try{const image=await getPhoto();if(!image)throw Error('Escribe la URL de la fotografía o selecciona un archivo');await api('inline-media','PUT',{key,image});await reloadPublic();$('hc-inline-dialog').hidden=true}catch(err){status.textContent=err.message}};
}

window.addEventListener('DOMContentLoaded',async()=>{
 const launch=document.createElement('button');launch.id='hc-admin-launch';launch.textContent='⚙ Administrador';launch.title='Administración de Tiendita Musical Hugo Congas';launch.onclick=async()=>{try{const s=await api('session');if(s.authenticated)setInlineMode(!inlineMode);else showPanel()}catch(e){showPanel()}};document.body.appendChild(launch);
 const shell=document.createElement('div');shell.id='hc-admin-shell';shell.hidden=true;shell.innerHTML=`<div class="hc-admin-dialog" role="dialog" aria-modal="true" aria-label="Administrador"><div class="hc-admin-head"><strong>HUGO CONGAS <small>Administración</small></strong><button id="hc-admin-close" aria-label="Cerrar">✕</button></div><div class="hc-admin-scroll"><div id="hc-login"><h2>Acceso administrativo</h2><p>Ingresa con las credenciales configuradas en el servidor.</p><form id="hc-login-form"><label>Usuario<input name="user" autocomplete="username" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label><button type="submit">Ingresar</button></form></div><div id="hc-workspace" hidden><div class="hc-admin-actions"><button id="hc-switch-products" class="selected">Instrumentos</button><button id="hc-switch-settings">Textos principales</button><button id="hc-logout" class="hc-muted">Salir</button></div><section id="hc-tab-products"><h2>Productos de la tienda</h2><p>Agregar y modificar instrumentos, marca, categoría, precio, stock y enlace de fotografía.</p><button id="hc-new" class="hc-soft">+ Nuevo instrumento</button><form id="hc-product-form"><div class="hc-form-grid"><label class="hc-span">Nombre del instrumento<input name="title" maxlength="180" required></label><label>Marca<input name="brand" required></label><label>Categoría<select name="category"><option value="percusion">Percusión</option><option value="vientos">Vientos</option><option value="cuerdas">Guitarras</option><option value="bajos">Bajos</option><option value="teclados">Teclados y pianos</option><option value="audio">Audio profesional</option></select></label><label>Subcategoría<input name="catLabel" placeholder="Ej.: Percusión, Congas"></label><label>Precio S/<input type="number" name="price" step="0.01" min="0" required></label><label>Precio anterior S/<input type="number" name="oldPrice" step="0.01" min="0"></label><label>Stock<input type="number" name="stock" step="1" min="0" value="0"></label><label>Sección<select name="section"><option value="new">Novedades</option><option value="bestseller">Destacados</option><option value="audio">Audio</option></select></label><label class="hc-span">Descripción<textarea name="desc" rows="3"></textarea></label><label class="hc-span">URL de foto (HTTPS o /images/archivo.jpg)<input id="hc-image-path" type="text" placeholder="https://..."></label><img id="hc-image-preview" class="hc-preview" alt="Vista previa"/><div class="hc-form-actions hc-span"><button type="submit" id="hc-save-product">Añadir producto</button><button type="button" id="hc-delete-product" hidden>Eliminar</button></div></div></form><h3>Instrumentos registrados</h3><div id="hc-item-list"></div></section><section id="hc-tab-settings" hidden><h2>Textos de portada</h2><form id="hc-settings-form"><label>Titular principal<input id="hc-hero-title" required></label><label>Descripción de portada<textarea id="hc-hero-text" rows="4" required></textarea></label><button type="submit">Guardar textos</button></form><p>Para proteger el diseño aprobado, la franja de colores y su mensaje permanecen fijos. WhatsApp: 916 200 641.</p></section></div><p id="hc-admin-msg" aria-live="polite"></p></div></div>`;document.body.appendChild(shell);
 $('hc-admin-close').onclick=hidePanel;shell.addEventListener('click',e=>{if(e.target===shell)hidePanel()});document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!shell.hidden)hidePanel()});
 $('hc-login-form').onsubmit=async e=>{e.preventDefault();try{const f=new FormData(e.target);await api('login','POST',{user:f.get('user'),password:f.get('password')});e.target.reset();message('Acceso autorizado');await checkSession();hidePanel();setInlineMode(true)}catch(err){message(err.message)}};
 $('hc-logout').onclick=async()=>{await api('logout','POST');await checkSession();message('Sesión cerrada')};$('hc-new').onclick=()=>{resetForm();message('Formulario listo para un nuevo instrumento')};$('hc-switch-products').onclick=()=>switchTab('products');$('hc-switch-settings').onclick=()=>switchTab('settings');
 $('hc-image-path').onchange=()=>{const url=$('hc-image-path').value.trim();if(url)$('hc-image-preview').src=url;else $('hc-image-preview').removeAttribute('src');};
 $('hc-product-form').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target),obj={};for(const [k,v]of f.entries())obj[k]=v;obj.image=$('hc-image-path').value;try{await api(editId?'products/'+editId:'products',editId?'PUT':'POST',obj);resetForm();await reloadAdmin();message('Instrumento guardado correctamente')}catch(err){message(err.message)}};
 $('hc-delete-product').onclick=async()=>{if(!editId||!confirm('¿Eliminar este instrumento del catálogo?'))return;try{await api('products/'+editId,'DELETE');resetForm();await reloadAdmin();message('Instrumento eliminado')}catch(err){message(err.message)}};
 $('hc-settings-form').onsubmit=async e=>{e.preventDefault();try{await api('settings','PUT',{heroTitle:$('hc-hero-title').value,heroText:$('hc-hero-text').value});await reloadPublic();message('Textos actualizados')}catch(err){message(err.message)}};
 await reloadPublic();
 const main=document.querySelector('main#content')||document.body;
 new MutationObserver(()=>{if(inlineMode)queueInlineControls()}).observe(main,{subtree:true,childList:true});
 if(window.__HC_PREVIEW__)setInlineMode(true);
});
})();
