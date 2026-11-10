// Checkout definitivo: usa solo /api/izipay/checkout-live y respeta el doble bloqueo del Worker.
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const btn=$('pay-button'),msg=$('status'),blocked=$('blocked'),payment=$('payment');
 const key='hc_checkout_live_attempt_v1';
 let products=[],chosen=[],paymentAllowed=false,busy=false;
 const error=t=>{msg.textContent=String(t||'No se pudo continuar');};
 const fmt=cents=>'S/ '+(cents/100).toLocaleString('es-PE',{minimumFractionDigits:2,maximumFractionDigits:2});
 const inspectCart=()=>{
  let arr;try{arr=JSON.parse(sessionStorage.getItem('hc_checkout_live_cart')||'[]')}catch{arr=[]}
  if(!Array.isArray(arr)||!arr.length||arr.length>20)throw Error('El carrito está vacío. Agrega instrumentos desde la tienda.');
  const ids=new Set(),selected=[];let total=0;
  for(const item of arr){
    const id=String(item.id),qty=Number(item.qty);
    if(!/^\d{1,12}$/.test(id)||ids.has(id)||!Number.isSafeInteger(qty)||qty<1||qty>10)throw Error('Hay cantidades inválidas en tu carrito.');
    ids.add(id);
    const p=products.find(p=>String(p.id)===id),unit=Math.round(Number(p?.price)*100);
    if(!p||!Number.isSafeInteger(unit)||unit<1||Number(p.stock)<qty)throw Error('Un producto cambió o no tiene stock. Vuelve a la tienda y actualiza el carrito.');
    total+=unit*qty;
    if(!Number.isSafeInteger(total)||total>20000000)throw Error('El importe excede el límite permitido.');
    selected.push({id,qty,title:String(p.title),amount:unit*qty});
  }
  $('items').replaceChildren();
  for(const p of selected){const div=document.createElement('div');div.className='item';const span=document.createElement('span');span.textContent=p.qty+' × '+p.title;const strong=document.createElement('strong');strong.textContent=fmt(p.amount);div.append(span,strong);$('items').append(div)}
  $('total').textContent=fmt(total);
  return selected;
 };
 const load=async()=>{
  try{
    const [c,cat]=await Promise.all([fetch('/api/izipay/config',{cache:'no-store'}),fetch('/api/catalog',{cache:'no-store'})]);
    if(!c.ok||!cat.ok)throw Error('No se pudo consultar el estado de la tienda.');
    const config=await c.json(),data=await cat.json();products=Array.isArray(data.products)?data.products:[];
    chosen=inspectCart();paymentAllowed=config.production===true;
    if(!paymentAllowed){blocked.textContent='Los pagos en línea aún no están habilitados. Puedes solicitar tu compra por WhatsApp desde la tienda.';btn.textContent='Pago en línea no disponible';btn.disabled=true;return}
    blocked.hidden=true;btn.textContent='Continuar al pago seguro';btn.disabled=false;
  }catch(e){error(e.message);blocked.textContent='No fue posible iniciar el pago. Vuelve a la tienda.';btn.disabled=true}
 };
 async function fingerprint(data){
  const canonical=JSON.stringify({items:data.items,name:data.name,email:data.email,phone:data.phone,address:data.address,district:data.district});
  const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
  return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
 }
 function displayIzipay(result){
  if(!result.formToken||!result.publicKey)throw Error('Izipay no devolvió un formulario válido. Consulta antes de reintentar.');
  payment.replaceChildren();const wrapper=document.createElement('div');wrapper.className='kr-embedded';wrapper.setAttribute('kr-form-token',result.formToken);payment.append(wrapper);
  const script=document.createElement('script');script.src='https://static.micuentaweb.pe/static/js/krypton-client/V4.0/stable/kr-payment-form.min.js';
  script.setAttribute('kr-public-key',result.publicKey);script.setAttribute('kr-language','es-Es');
  script.onload=()=>{const css=document.createElement('link');css.rel='stylesheet';css.href='https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/classic.css';document.head.append(css);const ext=document.createElement('script');ext.src='https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/classic.js';document.head.append(ext);msg.textContent='Pedido '+result.orderId+' creado. Completa el pago únicamente en el formulario seguro de Izipay.'};
  script.onerror=()=>error('El formulario no cargó. No intentes iniciar una segunda compra; verifica tu pedido '+result.orderId+'.');
  document.head.append(script);
 }
 $('checkout-form').addEventListener('submit',async e=>{
  e.preventDefault();if(!paymentAllowed||busy||!chosen.length)return;
  busy=true;btn.disabled=true;msg.textContent='Validando tu compra…';
  const data={items:chosen.map(x=>({id:x.id,qty:x.qty})),name:$('name').value.trim(),email:$('email').value.trim(),phone:$('phone').value.trim(),address:$('address').value.trim(),district:$('district').value.trim()};
  try{
    const hash=await fingerprint(data);
    let previous;try{previous=JSON.parse(sessionStorage.getItem(key)||'null')}catch{previous=null}
    // Nunca crear una segunda intención sin confirmar qué pasó con la primera.
    if(previous?.submitted)throw Error('Ya existe un intento de compra en esta sesión'+(previous.orderId?' (pedido '+previous.orderId+')':'')+'. Verifica el resultado con la tienda antes de intentar otro pago.');
    if(previous&&previous.hash!==hash)throw Error('Cambiaste los datos de una compra iniciada. Vuelve al carrito y verifica el pedido anterior.');
    const intent=previous||{hash,idempotencyKey:crypto.randomUUID().replace(/-/g,'')+'_'+crypto.randomUUID().slice(0,8),submitted:false};
    intent.submitted=true;sessionStorage.setItem(key,JSON.stringify(intent));
    let resp,v;
    try{resp=await fetch('/api/izipay/checkout-live',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...data,idempotencyKey:intent.idempotencyKey})});v=await resp.json()}catch{throw Error('No hay confirmación del servidor. No repitas la compra; consulta con la tienda.')}
    if(!resp.ok){
      if(resp.status===503&&v?.mode==='disabled'&&!v?.orderId){intent.submitted=false;sessionStorage.setItem(key,JSON.stringify(intent));throw Error('Los pagos aún no están habilitados. No se hizo ningún cobro.')}
      intent.orderId=v?.orderId||null;sessionStorage.setItem(key,JSON.stringify(intent));throw Error((v?.error||'No se pudo crear el pago')+(v?.orderId?' Pedido: '+v.orderId:''));
    }
    intent.orderId=v.orderId;sessionStorage.setItem(key,JSON.stringify(intent));displayIzipay(v);
  }catch(e){error(e.message||'No se pudo finalizar la compra.')}finally{busy=false;btn.disabled=true}
 });
 load();
})();
