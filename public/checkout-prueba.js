// Checkout de laboratorio: no habilita ventas reales.
const $=id=>document.getElementById(id);let chosen=[];
const safe=s=>String(s).replace(/[&<>"']/g,'');
(async()=>{try{
 let cart=JSON.parse(sessionStorage.getItem('hc_checkout_test_cart')||'[]');if(!Array.isArray(cart))cart=[];
 const r=await fetch('/api/catalog',{cache:'no-store'});if(!r.ok)throw Error('No pudimos leer el catálogo');const db=await r.json();let total=0;
 chosen=cart.map(i=>{let prod=(db.products||[]).find(p=>String(p.id)===String(i.id));if(!prod||Number(prod.id)<=0||Number(prod.price)<=0||Number(prod.stock)<Number(i.qty)||!Number.isSafeInteger(Number(i.qty)))throw Error('El carrito contiene instrumentos de demostración o sin stock. Registra productos reales en el administrador.');total+=Math.round(Number(prod.price)*100)*i.qty;return {id:prod.id,qty:i.qty,title:prod.title,price:prod.price};});
 if(!chosen.length)throw Error('El carrito está vacío. Agrega instrumentos desde la tienda.');
 $('items').replaceChildren();for(const p of chosen){const div=document.createElement('div');div.className='item';const left=document.createElement('span');left.textContent=p.qty+' × '+p.title;const right=document.createElement('strong');right.textContent='S/ '+(p.price*p.qty).toFixed(2);div.append(left,right);$('items').append(div)}
 $('total').textContent='Subtotal de instrumentos: S/ '+(total/100).toFixed(2);
}catch(err){$('items').textContent=err.message;$('btn').disabled=true;}})();
$('frm').addEventListener('submit',async ev=>{ev.preventDefault();const btn=$('btn');btn.disabled=true;$('msg').textContent='Conectando con Izipay (prueba)…';$('payment').replaceChildren();try{
 const resp=await fetch('/api/izipay/checkout-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:chosen.map(({id,qty})=>({id,qty})),name:$('name').value,email:$('email').value,phone:$('phone').value,district:$('district').value,address:$('address').value})});const v=await resp.json();if(!resp.ok)throw Error(v.error||'No se pudo crear el formulario');
 const div=document.createElement('div');div.className='kr-embedded';div.setAttribute('kr-form-token',v.formToken);$('payment').append(div);
 const script=document.createElement('script');script.src='https://static.micuentaweb.pe/static/js/krypton-client/V4.0/stable/kr-payment-form.min.js';script.setAttribute('kr-public-key',v.publicKey);script.setAttribute('kr-language','es-Es');script.onload=()=>{const css=document.createElement('link');css.rel='stylesheet';css.href='https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/classic.css';document.head.append(css);const ext=document.createElement('script');ext.src='https://static.micuentaweb.pe/static/js/krypton-client/V4.0/ext/classic.js';document.head.append(ext);$('msg').textContent='Formulario de prueba generado. Pedido: '+v.orderId;};script.onerror=()=>{$('msg').textContent='No se pudo mostrar el formulario de Izipay';};document.head.append(script);
}catch(err){$('msg').textContent=err.message;}finally{btn.disabled=false;}});
