// Ensayo privado: reserva stock de laboratorio y usa exclusivamente Izipay TEST.
const $=id=>document.getElementById(id);
let currentOrder='';let requestKey='';
(async()=>{try{
 const session=await fetch('/api/session',{credentials:'same-origin'}).then(r=>r.json());
 if(!session.authenticated)throw Error('Inicia sesión como administrador en la tienda antes de abrir este ensayo.');
 const catalog=await fetch('/api/catalog',{cache:'no-store'}).then(r=>r.json());
 const products=(catalog.products||[]).filter(p=>Number(p.id)>0&&Number(p.stock)>0&&Number(p.price)>0);
 $('product').replaceChildren();
 for(const p of products){const opt=document.createElement('option');opt.value=p.id;opt.textContent=`${p.title} · S/ ${Number(p.price).toFixed(2)} · Stock ${p.stock}`;$('product').append(opt)}
 if(!products.length)throw Error('Agrega instrumentos reales al catálogo antes de probar.');
}catch(e){$('msg').textContent=e.message;$('start').disabled=true}})();
$('frm').addEventListener('submit',async ev=>{
 ev.preventDefault();$('start').disabled=true;$('msg').textContent='Reservando inventario de prueba...';$('payment').replaceChildren();
 try{
  if(!requestKey)requestKey=crypto.randomUUID().replace(/-/g,'');
  const input={idempotencyKey:requestKey,items:[{id:$('product').value,qty:Number($('qty').value)}],name:$('name').value,email:$('email').value,phone:$('phone').value,district:$('district').value,address:$('address').value};
  const res=await fetch('/api/izipay/staging-checkout',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body:JSON.stringify(input)});
  const v=await res.json();if(!res.ok)throw Error(v.error||'No se pudo iniciar el ensayo');
  currentOrder=v.orderId;$('order').textContent='Pedido: '+currentOrder+' · S/ '+(v.amount/100).toFixed(2)+' · Envío gratis. Reserva hasta '+v.reservationExpiresAt;$('check').disabled=false;
  $('msg').textContent='Token Izipay TEST creado. Completa únicamente con tarjeta de prueba.';
  const div=document.createElement('div');div.className='kr-embedded';div.setAttribute('kr-form-token',v.formToken);$('payment').append(div);
  const script=document.createElement('script');script.src='https://static.micuentaweb.pe/static/js/krypton-client/V4.0/stable/kr-payment-form.min.js';script.setAttribute('kr-public-key',v.publicKey);script.setAttribute('kr-language','es-Es');
  script.onload=()=>{const css=document.createElement('link');css.rel='stylesheet';css.href='https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/classic.css';document.head.append(css);const ext=document.createElement('script');ext.src='https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/classic.js';document.head.append(ext)};
  script.onerror=()=>$('msg').textContent='El formulario no cargó; consulta el pedido antes de reintentar.';
  document.head.append(script);
 }catch(e){$('msg').textContent=e.message;}
 finally{$('start').disabled=false;}
});
$('check').addEventListener('click',async()=>{if(!currentOrder)return;try{const r=await fetch('/api/izipay/staging-checkout-status?id='+encodeURIComponent(currentOrder),{cache:'no-store'});const v=await r.json();if(!r.ok)throw Error(v.error||'No encontrado');$('status').textContent='Estado: '+v.status+(v.paidAt?' · Confirmación: '+v.paidAt:'')+'. Stock público no modificado.'}catch(e){$('status').textContent=e.message}});
