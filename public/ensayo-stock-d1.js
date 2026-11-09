const $=id=>document.getElementById(id), state={};
const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function api(path,opts){const r=await fetch(path,{credentials:'same-origin',...opts});let j={};try{j=await r.json()}catch{}if(!r.ok)throw Error(j.error||'Error HTTP '+r.status);return j}
async function refresh(){try{
 const [r,c]=await Promise.all([api('/api/inventory-v1/holds-test'),api('/api/catalog')]);
 const products=new Map((c.products||[]).map(p=>[String(p.id),p]));
 const prev=$('product').value;$('product').innerHTML=r.stocks.map(s=>`<option value="${escapeHtml(s.product_id)}">${escapeHtml(products.get(s.product_id)?.title||s.product_id)} — disponibles ${s.stock_on_hand-s.reserved_units}</option>`).join('');if(prev&&[...$('product').options].some(o=>o.value===prev))$('product').value=prev;
 $('stocks').innerHTML=r.stocks.map(s=>`<tr><td>${escapeHtml(products.get(s.product_id)?.title||s.product_id)}</td><td>${s.stock_on_hand}</td><td>${s.reserved_units}</td><td>${s.stock_on_hand-s.reserved_units}</td><td>${s.stock_version}</td></tr>`).join('');
 $('holds').innerHTML=r.holds.length?r.holds.map(h=>`<div class="hold">${escapeHtml(h.id)} · ${escapeHtml(h.status)} · ${h.quantity} unidad(es) · vence ${escapeHtml(h.expires_at)} ${h.status==='RESERVED'?`<button data-id="${escapeHtml(h.id)}">Liberar</button>`:''}</div>`).join(''):'Sin reservas';
 $('holds').querySelectorAll('button').forEach(b=>b.addEventListener('click',async()=>{b.disabled=true;try{await api('/api/inventory-v1/holds-test/release',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:b.dataset.id})});$('result').textContent='Reserva liberada';await refresh()}catch(e){$('result').textContent=e.message}finally{b.disabled=false}}));
 }catch(e){$('result').textContent=e.message}}
$('refresh').addEventListener('click',refresh);
$('reserve').addEventListener('click',async()=>{const b=$('reserve');b.disabled=true;try{const idempotencyKey=crypto.randomUUID().replaceAll('-','');const q=Number($('quantity').value);const r=await api('/api/inventory-v1/holds-test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({productId:$('product').value,quantity:q,idempotencyKey})});$('result').textContent=`Reserva creada: ${r.id}. Vence ${r.expiresAt}. Sin cobro.`;await refresh()}catch(e){$('result').textContent=e.message}finally{b.disabled=false}});
refresh();
