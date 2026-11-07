const result=document.getElementById('result');
const refresh=document.getElementById('refresh');
const line=(label,ok)=>{const p=document.createElement('p');p.textContent=(ok?'✓ ':'✗ ')+label;return p};
async function check(){refresh.disabled=true;result.replaceChildren();try{const r=await fetch('/api/izipay/production-readiness',{cache:'no-store',credentials:'same-origin'});const d=await r.json();if(!r.ok)throw Error(d.error||'Error del servidor');
const h=document.createElement('h2');h.textContent='Estado: '+d.phase;result.append(h);
result.append(line('Cobros reales desactivados (seguro)',!d.livePaymentsEnabled));
for(const [key,ok] of Object.entries(d.keysConfigured||{}))result.append(line(key+' presente',ok));
result.append(line('Tabla D1 de pedidos reales creada',d.d1LiveOrdersTable));
result.append(line('Tabla D1 de pruebas disponible',d.testCheckoutTable));
result.append(line('Bucket R2 conectado',d.r2Connected));
result.append(line('Envío gratis incluido: S/ 0.00',d.shipping?.mode==='free_included'&&d.shipping?.shippingCents===0));
result.append(line('Tabla de ensayo de reservas atómicas',d.stagingStockReservationsTable));
const link=document.createElement('p');const a=document.createElement('a');a.href='/ensayo-stock.html';a.textContent='Abrir ensayo privado de stock →';link.append(a);result.append(link);
const h3=document.createElement('h3');h3.textContent='Pendiente antes de abrir producción';result.append(h3);const ul=document.createElement('ul');for(const s of d.pending||[]){const li=document.createElement('li');li.textContent=s;ul.append(li)}result.append(ul);
const warn=document.createElement('p');warn.textContent=d.warning;result.append(warn);
}catch(e){result.textContent='No se pudo comprobar: '+e.message;}finally{refresh.disabled=false}}
refresh.addEventListener('click',check);check();