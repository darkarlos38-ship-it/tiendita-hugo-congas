'use strict';
const $=id=>document.getElementById(id);
let products=[];
const message=(txt,cls='')=>{const p=document.createElement('div');p.className=cls;p.textContent=txt;$('results').append(p)};
const key=()=>{const bytes=crypto.getRandomValues(new Uint8Array(16));return 'hc_concurrent_'+Array.from(bytes).map(x=>x.toString(16).padStart(2,'0')).join('')};
async function api(path,options){const res=await fetch(path,{credentials:'same-origin',cache:'no-store',...options});let body={};try{body=await res.json()}catch{}return {status:res.status,body,ok:res.ok}};
const post=(path,body)=>api(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
async function init(){try{const s=await api('/api/session');if(!s.body.authenticated){$('explanation').textContent='Inicia sesión primero en Administrador en la tienda.';return;}const c=await api('/api/catalog');if(!c.ok)throw Error('No se pudo leer el catálogo.');products=(c.body.products||[]).filter(p=>Number(p.stock)>=1&&Number(p.price)>0&&Number(p.id)>0);$('product').replaceChildren();if(!products.length){$('explanation').textContent='No hay instrumentos reales con stock disponible.';return;}for(const p of products){const op=document.createElement('option');op.value=String(p.id);op.textContent=`${p.title} · Stock: ${p.stock}`;$('product').append(op)}$('go').disabled=false;describe();}catch(e){$('explanation').textContent=e.message}}
function describe(){const p=products.find(x=>String(x.id)===$('product').value);if(!p)return;const qty=Math.floor(Number(p.stock)/2)+1;$('explanation').textContent=`Se enviarán dos solicitudes de ${qty} unidad(es) en paralelo para un stock de ${p.stock}. Como ambas juntas superan las existencias, solo una puede reservar. Primero probaremos también la idempotencia.`;}
$('refresh').addEventListener('click',init);$('product').addEventListener('change',describe);
$('go').addEventListener('click',async()=>{const p=products.find(x=>String(x.id)===$('product').value);if(!p)return;const qty=Math.floor(Number(p.stock)/2)+1;const btn=$('go');btn.disabled=true;$('results').replaceChildren();const reservations=new Set();let failed=false;
const reserve=async(k,q)=>{const r=await post('/api/izipay/staging-stock',{idempotencyKey:k,items:[{id:String(p.id),qty:q}]});if(r.ok&&r.body.id)reservations.add(r.body.id);return r};
try{
 message('1. Probando reserva repetida con el mismo identificador…','warn');
 const k1=key();const first=await reserve(k1,qty);if(!first.ok)throw Error(`No se pudo crear la reserva inicial (${first.status}): ${first.body.error||'Error'}. Libera reservas anteriores y vuelve a probar.`);
 const repeated=await reserve(k1,qty);
 if(repeated.ok&&repeated.body.reused===true&&repeated.body.id===first.body.id)message('✓ Idempotencia correcta: dos solicitudes iguales → una sola reserva.','ok');else{message('✗ Reintento no idempotente. No habilitar producción.','bad');failed=true}
 const altered=await reserve(k1,1===qty?2:1);
 if(altered.status===409)message('✓ La misma clave con un carrito diferente se rechaza.','ok');else{message('✗ Clave reutilizada con otro carrito no fue rechazada.','bad');failed=true}
 const released=await post('/api/izipay/staging-stock/release',{id:first.body.id});if(!released.ok)throw Error('No se pudo liberar la primera reserva. Revisa la lista de reservas manualmente.');reservations.delete(first.body.id);
 message('2. Enviando dos reservas simultáneas que superan el stock disponible…','warn');
 const outcomes=await Promise.all([reserve(key(),qty),reserve(key(),qty)]);
 const successes=outcomes.filter(x=>x.ok&&x.body.status==='RESERVED');const conflicts=outcomes.filter(x=>x.status===409);
 if(successes.length===1&&conflicts.length===1)message('✓ Concurrencia correcta: una reserva aceptada y otra rechazada por stock.','ok');else{message(`✗ Resultado inesperado: ${successes.length} aceptadas, ${conflicts.length} rechazadas, otros ${outcomes.length-successes.length-conflicts.length}. NO habilitar cobros reales.`,'bad');failed=true}
 message(failed?'RESULTADO: PRUEBAS NO SUPERADAS.':'RESULTADO: ENSAYOS SUPERADOS (solo inventario de laboratorio).',failed?'bad':'ok');
}catch(e){message('Error: '+e.message,'bad');message('Revisa si hay reservas anteriores activas. No habilites pagos reales.','warn')}
finally{for(const id of reservations){try{const r=await post('/api/izipay/staging-stock/release',{id});if(!r.ok)message('Advertencia: libera manualmente '+id,'warn')}catch{message('Advertencia: libera manualmente '+id,'warn')}}btn.disabled=false;message('Ensayo terminado. Los cobros reales siguen desactivados.');}
});
init();
