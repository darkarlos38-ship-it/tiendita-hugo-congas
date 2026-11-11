/* HUGO CONGAS: galería del visor real #hc-inline-detail. Solo presentación. */
(()=>{'use strict';
const CSS=`
#hc-inline-detail .hc-final-gallery{display:grid!important;grid-template-columns:minmax(0,1fr)!important;gap:10px!important;max-width:100%!important;width:100%!important;min-width:0!important}
#hc-inline-detail .hc-final-stage{position:relative!important;width:100%!important;aspect-ratio:1/1!important;min-height:220px!important;max-height:min(65vh,650px)!important;border-radius:12px!important;background:#202022!important;overflow:hidden!important;display:grid!important;place-items:center!important}
#hc-inline-detail .hc-final-stage img{display:block!important;width:100%!important;height:100%!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important;position:absolute!important;inset:0!important;cursor:zoom-in!important}
#hc-inline-detail .hc-final-arrow,.hc-final-overlay .hc-final-arrow{position:absolute!important;z-index:3!important;top:50%!important;transform:translateY(-50%)!important;display:grid!important;place-items:center!important;width:42px!important;height:42px!important;border:1px solid #666!important;border-radius:50%!important;background:rgba(10,10,10,.83)!important;color:white!important;font:700 27px Arial,sans-serif!important;cursor:pointer!important;line-height:1!important;padding:0!important}
.hc-final-prev{left:10px!important}.hc-final-next{right:10px!important}
#hc-inline-detail .hc-final-thumbs{display:flex!important;flex-direction:row!important;align-items:center!important;gap:8px!important;max-width:100%!important;overflow-x:auto!important;padding:3px 1px 8px!important}
#hc-inline-detail .hc-final-thumbs button{flex:0 0 66px!important;width:66px!important;height:66px!important;padding:3px!important;border-radius:9px!important;border:1px solid #555!important;background:#242424!important;cursor:pointer!important;overflow:hidden!important}
#hc-inline-detail .hc-final-thumbs button[aria-pressed="true"]{border:2px solid #e8c452!important}
#hc-inline-detail .hc-final-thumbs img{display:block!important;width:100%!important;height:100%!important;max-height:100%!important;object-fit:contain!important}
#hc-inline-detail .hc-detail-grid{min-width:0!important}
#hc-inline-detail .hc-detail-grid>div{min-width:0!important}
.hc-final-overlay{position:fixed!important;inset:0!important;z-index:2147483647!important;background:rgba(0,0,0,.97)!important;display:flex!important;align-items:center!important;justify-content:center!important;padding:60px 55px!important}
.hc-final-overlay>img{display:block!important;max-width:100%!important;max-height:100%!important;object-fit:contain!important}
.hc-final-overlay .hc-final-close{position:absolute!important;top:12px!important;right:16px!important;border:1px solid #666!important;border-radius:50%!important;width:44px!important;height:44px!important;background:#262626!important;color:#fff!important;font-size:25px!important;cursor:pointer!important}
@media(max-width:700px){.hc-final-overlay{padding:55px 12px!important}#hc-inline-detail .hc-final-arrow,.hc-final-overlay .hc-final-arrow{width:36px!important;height:36px!important;font-size:21px!important}}
`;
const style=document.createElement('style');style.textContent=CSS;document.head.appendChild(style);
const getProducts=()=>{try{return typeof PRODUCTS!=='undefined'&&Array.isArray(PRODUCTS)?PRODUCTS:[]}catch{return []}};
let zoomClose=null;
function install(){
 const detail=document.getElementById('hc-inline-detail');if(!detail||detail.hidden)return;
 const name=detail.querySelector('.hc-detail-name')?.textContent?.trim();
 const wrap=detail.querySelector('.hc-detail-image');if(!name||!wrap)return;
 const p=getProducts().find(x=>x.title===name);if(!p)return;
 const urls=[...new Set([p.image,...(Array.isArray(p.gallery)?p.gallery:[])].filter(v=>typeof v==='string'&&/^(https?:\/\/|\/)/i.test(v)))];
 if(!urls.length)return;
 const key=String(p.id)+'|'+urls.join('|');
 if(wrap.dataset.hcFinalGalleryKey===key&&wrap.querySelector('.hc-final-gallery'))return;
 if(zoomClose)zoomClose();
 let idx=0,zoomImg=null;
 const gallery=document.createElement('div');gallery.className='hc-final-gallery';
 const stage=document.createElement('div');stage.className='hc-final-stage';
 const main=document.createElement('img');main.alt=p.title;main.loading='eager';
 const thumbs=document.createElement('div');thumbs.className='hc-final-thumbs';thumbs.setAttribute('aria-label','Fotografías del instrumento');
 function choose(n){idx=(n+urls.length)%urls.length;main.src=urls[idx];main.alt=p.title+' — fotografía '+(idx+1);if(zoomImg)zoomImg.src=urls[idx];[...thumbs.children].forEach((b,i)=>b.setAttribute('aria-pressed',String(idx===i)))}
 function arrow(isPrev){const b=document.createElement('button');b.type='button';b.className='hc-final-arrow '+(isPrev?'hc-final-prev':'hc-final-next');b.textContent=isPrev?'‹':'›';b.setAttribute('aria-label',isPrev?'Fotografía anterior':'Fotografía siguiente');b.onclick=e=>{e.stopPropagation();choose(idx+(isPrev?-1:1))};return b}
 function zoom(){if(zoomClose)zoomClose();const layer=document.createElement('div');layer.className='hc-final-overlay';layer.setAttribute('role','dialog');layer.setAttribute('aria-modal','true');layer.setAttribute('aria-label','Fotografía ampliada');const picture=document.createElement('img');picture.src=urls[idx];picture.alt=p.title;zoomImg=picture;const close=document.createElement('button');close.type='button';close.className='hc-final-close';close.textContent='×';close.setAttribute('aria-label','Cerrar');function end(){layer.remove();document.removeEventListener('keydown',keys);zoomClose=null;zoomImg=null}function keys(e){if(e.key==='Escape')end();else if(e.key==='ArrowLeft')choose(idx-1);else if(e.key==='ArrowRight')choose(idx+1)}close.onclick=end;layer.onclick=e=>{if(e.target===layer)end()};layer.append(picture,close);if(urls.length>1)layer.append(arrow(true),arrow(false));document.body.append(layer);document.addEventListener('keydown',keys);zoomClose=end;close.focus()}
 main.addEventListener('click',zoom);stage.append(main);
 if(urls.length>1){stage.append(arrow(true),arrow(false));urls.forEach((url,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('aria-label','Ver fotografía '+(i+1));const img=document.createElement('img');img.src=url;img.alt='';b.append(img);b.onclick=()=>choose(i);thumbs.append(b)})}
 gallery.append(stage);if(urls.length>1)gallery.append(thumbs);
 // El renderizador antiguo crea una caja de miniaturas. La reemplazamos sin tocar datos.
 const parent=wrap.parentElement;
 if(parent?.classList.contains('hc-gallery-customer')){
   for(const el of [...parent.children])if(el!==wrap)el.remove();
 }
 wrap.dataset.hcGalleryKey=key; // Evita que admin-ui vuelva a inyectar la galería anterior.
 wrap.dataset.hcFinalGalleryKey=key;
 wrap.replaceChildren(gallery);choose(0);
}
function start(){const detail=document.getElementById('hc-inline-detail');if(!detail)return;let queued=false;const schedule=()=>{if(queued)return;queued=true;queueMicrotask(()=>{queued=false;install()})};new MutationObserver(schedule).observe(detail,{subtree:true,childList:true});schedule()}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
