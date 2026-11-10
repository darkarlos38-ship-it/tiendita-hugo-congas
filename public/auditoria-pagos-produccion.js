(() => {
const btn=document.getElementById('refresh'),msg=document.getElementById('message'),tbody=document.getElementById('orders');
const cell=(tr,value)=>{const td=document.createElement('td');td.textContent=String(value??'—');tr.appendChild(td)};
btn.addEventListener('click',async()=>{
  btn.disabled=true;msg.textContent='Consultando D1…';tbody.replaceChildren();
  try{
    const r=await fetch('/api/izipay/production-audit',{credentials:'same-origin',cache:'no-store'});
    const data=await r.json();if(!r.ok)throw Error(data.error||'Error HTTP '+r.status);
    msg.textContent=(data.gateEnabled?'ATENCIÓN: gate habilitado — revisar inmediatamente':'Gate de producción: desactivado')+' · '+data.warning;
    if(data.missingTables?.length)msg.textContent+='\nFaltan tablas: '+data.missingTables.join(', ');
    if(!data.orders?.length){const tr=document.createElement('tr');cell(tr,'Todavía no hay pedidos reales registrados. Eso es lo esperado mientras la producción siga desactivada.');tbody.appendChild(tr);return}
    for(const o of data.orders){const tr=document.createElement('tr');
      [o.id,o.status,'S/ '+(Number(o.amountCents)/100).toFixed(2),o.verifiedPaidNotifications,o.reservations,o.settlements,o.warnings?.length?o.warnings.join(' · '):'Sin alertas detectadas'].forEach(x=>cell(tr,x));tbody.appendChild(tr)}
  }catch(e){msg.textContent='Error: '+e.message}finally{btn.disabled=false}
});
})();
