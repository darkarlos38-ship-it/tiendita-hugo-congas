// Tiendita Musical Hugo Congas — Cloudflare Worker + D1 (sin R2)
const enc = new TextEncoder();
const security = {'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"frame-ancestors 'none'"};
const json=(v,status=200,extra={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...security,...extra}});
const clean=(v,n=5000)=>String(v??'').replace(/[<>]/g,'').slice(0,n);
const isImage=v=>typeof v==='string'&&((v.startsWith('/images/')&&/^\/images\/[a-zA-Z0-9._/-]+$/.test(v))||(v.startsWith('/media/')&&/^\/media\/[a-zA-Z0-9._/-]+$/.test(v))||/^https:\/\/[^\s<>"']+$/i.test(v));
const cookie=r=>(r.headers.get('cookie')||'').match(/(?:^|;\s*)hc_admin=([^;]+)/)?.[1]||'';
const hex=u=>Array.from(u).map(b=>b.toString(16).padStart(2,'0')).join('');
const digest=async s=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))));
async function pwHash(password,salt){return digest(salt+':'+password)}
async function data(env){const row=await env.DB.prepare("SELECT value FROM appdata WHERE key='catalog'").first();return row?JSON.parse(row.value):{products:[],settings:{announcement:'Envíos a todo el Perú · Tienda virtual · Atención personalizada online',phone:'916200641',heroTitle:'Instrumentos musicales originales para crear sin límites',heroText:''}}}
async function save(env,db){await env.DB.prepare("INSERT INTO appdata(key,value) VALUES('catalog',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(db)).run()}
async function auth(req,env){const token=cookie(req);if(!/^[0-9a-f]{64}$/.test(token))return false;const row=await env.DB.prepare('SELECT expires FROM sessions WHERE token_hash=?').bind(await digest(token)).first();return !!row&&row.expires>Date.now()}
function validGallery(v){return Array.isArray(v)&&v.length<=8&&v.every(isImage)&&new Set(v).size===v.length}
function galleryOf(v,old=[]){return v===undefined?old:(validGallery(v)?v:old)}
function item(p,old){const image=clean(p.image||'');return {id:old?.id??crypto.getRandomValues(new Uint32Array(1))[0],title:clean(p.title,180),category:clean(p.category,45),catLabel:clean(p.catLabel||p.category,100),brand:clean(p.brand,90),price:Number(p.price),oldPrice:Number(p.oldPrice||p.price),stock:Math.max(0,Math.floor(Number(p.stock||0))),image:isImage(image)?image:(image===''?'':(old?.image||'')),gallery:galleryOf(p.gallery,old?.gallery||[]),svg:clean(p.svg||old?.svg||'guitar',32),section:['bestseller','new','audio'].includes(p.section)?p.section:'new',desc:clean(p.desc),keySpecs:old?.keySpecs||[]}}
function valid(p){return p.title&&p.category&&p.brand&&Number.isFinite(p.price)&&p.price>=0&&Number.isFinite(p.oldPrice)&&p.oldPrice>=0&&Number.isFinite(p.stock)&&p.stock>=0}
async function requestJson(req){const len=Number(req.headers.get('content-length')||0);if(len>5_000_000)throw Error('Datos demasiado grandes');const t=await req.text();if(t.length>5_000_000)throw Error('Datos demasiado grandes');return JSON.parse(t||'{}')}
function sameOrigin(req){const o=req.headers.get('origin');return !o||o===new URL(req.url).origin}
export default {async fetch(req,env){
 const url=new URL(req.url),p=url.pathname,method=req.method;
 try{
 if(p.startsWith('/media/') && method==='GET'){
   if(!env.MEDIA_BUCKET)return new Response('Almacenamiento de imágenes no conectado',{status:503});
   const key=p.slice('/media/'.length);
   if(!/^[a-zA-Z0-9._/-]+$/.test(key))return new Response('No encontrado',{status:404});
   const object=await env.MEDIA_BUCKET.get(key);
   if(!object)return new Response('No encontrado',{status:404});
   return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'public,max-age=31536000,immutable','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'same-origin'}});
 }
 if(!p.startsWith('/api/'))return env.ASSETS.fetch(req);
 if(!env.DB)return json({error:'Falta conectar la base de datos D1'},503);
 if(!['GET','HEAD'].includes(method)&&p!=='/api/izipay/ipn'&&!sameOrigin(req))return json({error:'Origen no autorizado'},403);


 // IZIPAY ONLINE: TEST ONLY. No real-money charges in this integration.
 if(p==='/api/izipay/config'&&method==='GET')return json({mode:'test',ready:!!(env.IZIPAY_TEST_USER&&env.IZIPAY_TEST_PASSWORD&&env.IZIPAY_TEST_PUBLIC_KEY&&env.IZIPAY_TEST_HMAC),production:false});
 if(p==='/api/izipay/create'&&method==='POST'){
  if(!env.IZIPAY_TEST_USER||!env.IZIPAY_TEST_PASSWORD||!env.IZIPAY_TEST_PUBLIC_KEY||!env.IZIPAY_TEST_HMAC)
    return json({error:'Falta configurar credenciales de prueba Izipay en Cloudflare'},503);
  const x=await requestJson(req);
  const productId=String(x.productId||''),quantity=Number(x.quantity),email=String(x.email||'').trim();
  if(!/^\d{1,12}$/.test(productId)||!Number.isSafeInteger(quantity)||quantity<1||quantity>5||!/^\S+@\S+\.\S+$/.test(email)||email.length>160)
    return json({error:'Revisa el producto, cantidad y correo'},400);
  const db=await data(env),prod=db.products.find(q=>String(q.id)===productId);
  if(!prod)return json({error:'Solo se pueden probar productos reales registrados en el administrador; no los de demostración'},400);
  const unit=Math.round(Number(prod.price)*100);
  if(!Number.isSafeInteger(unit)||unit<=0||!Number.isFinite(prod.stock)||prod.stock<quantity)return json({error:'Producto sin stock o sin precio válido'},400);
  const amount=unit*quantity;
  if(!Number.isSafeInteger(amount)||amount>20000000)return json({error:'Monto fuera del rango de prueba'},400);
  const orderId='HC-T-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomUUID().slice(0,8).toUpperCase();
  const now=new Date().toISOString();
  await env.DB.prepare('INSERT INTO izipay_test_orders (id,product_id,quantity,amount_cents,email,status,created_at) VALUES(?,?,?,?,?,?,?)')
    .bind(orderId,productId,quantity,amount,email,'PENDING',now).run();
  const basic=btoa(env.IZIPAY_TEST_USER+':'+env.IZIPAY_TEST_PASSWORD);
  const payload={amount,currency:'PEN',orderId,customer:{email}};
  const ctl=new AbortController();const timer=setTimeout(()=>ctl.abort(),12000);
  let reply;
  try{reply=await fetch('https://api.micuentaweb.pe/api-payment/V4/Charge/CreatePayment',{
   method:'POST',headers:{'Authorization':'Basic '+basic,'Content-Type':'application/json','Accept':'application/json'},body:JSON.stringify(payload),signal:ctl.signal});}
  catch(e){console.error('Izipay test API network error',String(e));return json({error:'No se pudo conectar al entorno de prueba Izipay'},502)}
  finally{clearTimeout(timer)}
  let result;try{result=await reply.json()}catch{return json({error:'Respuesta inesperada de Izipay'},502)}
  if(!reply.ok||result.status!=='SUCCESS'||!result.answer?.formToken){
   console.error('Izipay test CreatePayment rejected',reply.status,result.errorCode||'',result.errorMessage||'');
   return json({error:'Izipay no generó el formulario de pruebas. Revisa las credenciales de test.'},502);
  }
  await env.DB.prepare("UPDATE izipay_test_orders SET status='TOKEN_CREATED' WHERE id=?").bind(orderId).run();
  return json({mode:'test',orderId,amount,currency:'PEN',formToken:result.answer.formToken,publicKey:env.IZIPAY_TEST_PUBLIC_KEY});
 }
 if(p==='/api/izipay/checkout-test'&&method==='POST'){
  if(!env.IZIPAY_TEST_USER||!env.IZIPAY_TEST_PASSWORD||!env.IZIPAY_TEST_PUBLIC_KEY||!env.IZIPAY_TEST_HMAC)
    return json({error:'Izipay de pruebas no está configurado'},503);
  const x=await requestJson(req);
  if(!Array.isArray(x.items)||x.items.length===0||x.items.length>20)return json({error:'Selecciona de 1 a 20 instrumentos'},400);
  const name=clean(x.name,120).trim(),email=clean(x.email,160).trim(),phone=clean(x.phone,30).trim(),address=clean(x.address,300).trim(),district=clean(x.district,100).trim();
  if(name.length<3||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[+\d\s()-]{7,25}$/.test(phone)||address.length<5||district.length<2)return json({error:'Completa nombres, correo, teléfono, dirección y distrito'},400);
  const db=await data(env),selected=[],seen=new Set();let amount=0;
  for(const p of x.items){
    const id=String(p.id||''),qty=Number(p.qty);
    if(!/^\d{1,12}$/.test(id)||seen.has(id)||!Number.isSafeInteger(qty)||qty<1||qty>10)return json({error:'Instrumentos o cantidades inválidas'},400);
    seen.add(id);const product=db.products.find(q=>String(q.id)===id);
    if(!product)return json({error:'El carrito contiene artículos demostrativos o ya no disponibles. Solo se pueden pagar instrumentos reales registrados.'},400);
    const unit=Math.round(Number(product.price)*100);
    if(!Number.isSafeInteger(unit)||unit<=0||!Number.isSafeInteger(Number(product.stock))||Number(product.stock)<qty)return json({error:'Precio o stock no disponible para '+clean(product.title,80)},400);
    const subtotal=unit*qty;amount+=subtotal;
    if(!Number.isSafeInteger(amount)||amount>20000000)return json({error:'Importe de prueba fuera del límite'},400);
    selected.push({id,title:clean(product.title,120),qty,unit_cents:unit,subtotal_cents:subtotal});
  }
  // TEST ONLY: no shipping fee, reservation or real charge. Delivery cost must be quoted before production.
  const orderId='HC-CHECK-T-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomUUID().slice(0,8).toUpperCase();
  await env.DB.prepare('INSERT INTO izipay_checkout_test_orders(id,items_json,amount_cents,name,email,phone,address,district,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
    .bind(orderId,JSON.stringify(selected),amount,name,email,phone,address,district,'PENDING',new Date().toISOString()).run();
  const basic=btoa(env.IZIPAY_TEST_USER+':'+env.IZIPAY_TEST_PASSWORD);
  let reply;
  try{reply=await fetch('https://api.micuentaweb.pe/api-payment/V4/Charge/CreatePayment',{method:'POST',headers:{Authorization:'Basic '+basic,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({amount,currency:'PEN',orderId,customer:{email}}),signal:AbortSignal.timeout(12000)});}
  catch(e){console.error('Izipay test checkout request failed',String(e));return json({error:'No se pudo conectar a Izipay de pruebas'},502)}
  let payload;try{payload=await reply.json()}catch{return json({error:'Respuesta no válida de Izipay'},502)}
  if(!reply.ok||payload.status!=='SUCCESS'||!payload.answer?.formToken){console.error('Izipay test checkout rejected',reply.status,payload.errorCode||'');return json({error:'Izipay no generó el formulario de prueba'},502)}
  await env.DB.prepare("UPDATE izipay_checkout_test_orders SET status='TOKEN_CREATED' WHERE id=?").bind(orderId).run();
  return json({mode:'test',orderId,amount,currency:'PEN',items:selected,formToken:payload.answer.formToken,publicKey:env.IZIPAY_TEST_PUBLIC_KEY});
 }
 // Integración de ensayo completa: reserva atómica -> token Izipay TEST -> IPN firmado.
 // Acceso exclusivamente de administrador; NO habilita cobros reales ni descuenta catálogo público.
 if(p==='/api/izipay/staging-checkout'&&method==='POST'){
  if(!await auth(req,env))return json({error:'Solo administrador'},401);
  if(!env.IZIPAY_TEST_USER||!env.IZIPAY_TEST_PASSWORD||!env.IZIPAY_TEST_PUBLIC_KEY||!env.IZIPAY_TEST_HMAC)return json({error:'Izipay TEST no configurado'},503);
  const x=await requestJson(req),idempotencyKey=String(x.idempotencyKey||'');
  if(!/^[a-zA-Z0-9_-]{16,80}$/.test(idempotencyKey))return json({error:'Identificador de pedido inválido'},400);
  if(!Array.isArray(x.items)||x.items.length<1||x.items.length>20)return json({error:'Carrito inválido'},400);
  const name=clean(x.name,120).trim(),email=clean(x.email,160).trim(),phone=clean(x.phone,30).trim(),address=clean(x.address,300).trim(),district=clean(x.district,100).trim();
  if(name.length<3||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[+\d\s()-]{7,25}$/.test(phone)||address.length<5||district.length<2)return json({error:'Datos del comprador incompletos'},400);
  const products=(await data(env)).products,selected=[],seen=new Set();let amount=0;
  for(const entry of x.items){
   const id=String(entry?.id||''),qty=Number(entry?.qty);
   if(!/^\d{1,12}$/.test(id)||seen.has(id)||!Number.isSafeInteger(qty)||qty<1||qty>10)return json({error:'Productos o cantidades inválidas'},400);
   seen.add(id);const product=products.find(e=>String(e.id)===id);
   if(!product)return json({error:'Instrumento no encontrado'},409);
   const unit=Math.round(Number(product.price)*100);
   if(!Number.isSafeInteger(unit)||unit<=0||!Number.isSafeInteger(Number(product.stock))||product.stock<qty)return json({error:'Precio o existencias insuficientes'},409);
   amount+=unit*qty;if(!Number.isSafeInteger(amount)||amount>20000000)return json({error:'Importe fuera de rango'},400);
   selected.push({id,qty,unit_cents:unit,title:clean(product.title,100)});
  }
  selected.sort((a,b)=>a.id.localeCompare(b.id,'en',{numeric:true}));
  const itemsJson=JSON.stringify(selected),hash=await digest(itemsJson+'|'+name+'|'+email+'|'+phone+'|'+district+'|'+address);
  const prev=await env.DB.prepare('SELECT id,request_hash,status FROM izipay_staging_checkout_orders WHERE idempotency_key=?').bind(idempotencyKey).first();
  if(prev)return json({error:prev.request_hash===hash?'Pedido ya creado: '+prev.id+'. No se vuelve a cobrar.':'La clave ya se usó para otra compra',orderId:prev.id,status:prev.status},409);
  const now=new Date(),nowISO=now.toISOString(),until=new Date(now.getTime()+10*60*1000).toISOString();
  const orderId='HC-STAGE-T-'+crypto.randomUUID(),holdId='HC-HOLD-'+crypto.randomUUID();
  const reserveSQL=`INSERT INTO izipay_stock_reservations_stage
    (id,idempotency_key,request_hash,items_json,status,created_at,expires_at)
    SELECT ?,?,?,?,'RESERVED',?,?
    WHERE NOT EXISTS (
      SELECT 1 FROM json_each(?) requested
      LEFT JOIN json_each((SELECT value FROM appdata WHERE key='catalog'),'$.products') product
        ON CAST(json_extract(product.value,'$.id') AS TEXT)=CAST(json_extract(requested.value,'$.id') AS TEXT)
      WHERE product.value IS NULL
      OR CAST(json_extract(product.value,'$.stock') AS INTEGER) <
        CAST(json_extract(requested.value,'$.qty') AS INTEGER) +
        COALESCE((SELECT SUM(CAST(json_extract(held.value,'$.qty') AS INTEGER))
          FROM izipay_stock_reservations_stage res,json_each(res.items_json) held
          WHERE res.status='RESERVED' AND res.expires_at>?
          AND CAST(json_extract(held.value,'$.id') AS TEXT)=CAST(json_extract(requested.value,'$.id') AS TEXT)),0)
      OR CAST(ROUND(CAST(json_extract(product.value,'$.price') AS REAL)*100) AS INTEGER) !=
        CAST(json_extract(requested.value,'$.unit_cents') AS INTEGER)
    )`;
  const reserved=await env.DB.prepare(reserveSQL).bind(holdId,'checkout_'+idempotencyKey,hash,itemsJson,nowISO,until,itemsJson,nowISO).run();
  if(reserved.meta?.changes!==1)return json({error:'Stock reservado por otro cliente o precio modificado'},409);
  try{
   await env.DB.prepare('INSERT INTO izipay_staging_checkout_orders (id,idempotency_key,request_hash,hold_id,items_json,amount_cents,buyer_json,status,created_at) VALUES(?,?,?,?,?,?,?,?,?)')
     .bind(orderId,idempotencyKey,hash,holdId,itemsJson,amount,JSON.stringify({name,email,phone,address,district}),'PENDING',nowISO).run();
  }catch(e){await env.DB.prepare("UPDATE izipay_stock_reservations_stage SET status='RELEASED' WHERE id=?").bind(holdId).run();
   const existing=await env.DB.prepare('SELECT id FROM izipay_staging_checkout_orders WHERE idempotency_key=?').bind(idempotencyKey).first();
   return json({error:existing?'Pedido ya creado. No repitas el pago.':'Error al guardar pedido',orderId:existing?.id||null},409)}
  const basic=btoa(env.IZIPAY_TEST_USER+':'+env.IZIPAY_TEST_PASSWORD);let reply,payload;
  try{reply=await fetch('https://api.micuentaweb.pe/api-payment/V4/Charge/CreatePayment',{method:'POST',headers:{Authorization:'Basic '+basic,'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({amount,currency:'PEN',orderId,customer:{email}}),signal:AbortSignal.timeout(12000)});payload=await reply.json();}
  catch(e){console.error('Izipay staging checkout request failed',String(e));await env.DB.prepare("UPDATE izipay_staging_checkout_orders SET status='TOKEN_ERROR' WHERE id=?").bind(orderId).run();await env.DB.prepare("UPDATE izipay_stock_reservations_stage SET status='RELEASED' WHERE id=?").bind(holdId).run();return json({error:'Izipay TEST no respondió. No repitas con otra clave sin revisar el pedido.'},502)}
  if(!reply.ok||payload.status!=='SUCCESS'||!payload.answer?.formToken){await env.DB.prepare("UPDATE izipay_staging_checkout_orders SET status='TOKEN_ERROR' WHERE id=?").bind(orderId).run();await env.DB.prepare("UPDATE izipay_stock_reservations_stage SET status='RELEASED' WHERE id=?").bind(holdId).run();return json({error:'Izipay TEST rechazó la creación del formulario'},502)}
  await env.DB.prepare("UPDATE izipay_staging_checkout_orders SET status='TOKEN_CREATED' WHERE id=? AND status='PENDING'").bind(orderId).run();
  return json({mode:'test',orderId,amount,shippingCents:0,currency:'PEN',reservationExpiresAt:until,formToken:payload.answer.formToken,publicKey:env.IZIPAY_TEST_PUBLIC_KEY});
 }
 if(p==='/api/izipay/staging-checkout-status'&&method==='GET'){
  if(!await auth(req,env))return json({error:'Solo administrador'},401);
  const id=url.searchParams.get('id')||'';
  if(!/^HC-STAGE-T-[0-9a-f-]{36}$/.test(id))return json({error:'Pedido inválido'},400);
  const r=await env.DB.prepare('SELECT id,status,amount_cents,paid_at,hold_id FROM izipay_staging_checkout_orders WHERE id=?').bind(id).first();
  return r?json({id:r.id,status:r.status,amountCents:r.amount_cents,paidAt:r.paid_at,livePaymentsEnabled:false}):json({error:'Pedido no encontrado'},404);
 }
 if(p==='/api/izipay/ipn'&&method==='POST'){
  if(!env.IZIPAY_TEST_PASSWORD)return json({error:'Pago no configurado'},503);
  const form=await req.formData(); const answer=form.get('kr-answer'),mac=form.get('kr-hash');
  if(typeof answer!=='string'||typeof mac!=='string'||answer.length>50000||!/(^[0-9a-f]{64}$)/i.test(mac))return json({error:'Notificación inválida'},400);
  const key=await crypto.subtle.importKey('raw',enc.encode(env.IZIPAY_TEST_PASSWORD),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const expected=hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(answer))));
  if(expected.length!==mac.length||!expected.split('').every((c,i)=>c===mac.toLowerCase()[i]))return json({error:'Firma inválida'},403);
  let a;try{a=JSON.parse(answer)}catch{return json({error:'Respuesta ilegible'},400)}
  const orderId=String(a.orderDetails?.orderId||a.orderId||'');
  if(orderId.startsWith('HC-STAGE-T-')){
   const row=await env.DB.prepare('SELECT amount_cents,status,hold_id FROM izipay_staging_checkout_orders WHERE id=?').bind(orderId).first();
   if(!row)return json({error:'Pedido staging no encontrado'},404);
   const paid=String(a.orderStatus||'')==='PAID';
   const sum=Number(a.orderDetails?.orderTotalAmount),currency=String(a.orderDetails?.orderCurrency||a.currency||'');
   if(paid&&(sum!==row.amount_cents||currency!=='PEN'))return json({error:'Importe o moneda no coinciden'},409);
   if(paid){
    // Comprobación defensiva: si la reserva caducó, no dar por surtido el pedido.
    const hold=await env.DB.prepare('SELECT status,expires_at FROM izipay_stock_reservations_stage WHERE id=?').bind(row.hold_id).first();
    const next=hold?.status==='RESERVED'&&hold.expires_at>new Date().toISOString()?'PAID_TEST':'REVIEW_REQUIRED';
    await env.DB.prepare("UPDATE izipay_staging_checkout_orders SET status=?,paid_at=? WHERE id=? AND status IN ('PENDING','TOKEN_CREATED')").bind(next,new Date().toISOString(),orderId).run();
    // La reserva no se consume en el stock público. Se libera en este laboratorio.
    await env.DB.prepare("UPDATE izipay_stock_reservations_stage SET status='RELEASED' WHERE id=? AND status='RESERVED'").bind(row.hold_id).run();
   }else if(['UNPAID','ABANDONED','CANCELLED'].includes(String(a.orderStatus||''))){
    await env.DB.prepare("UPDATE izipay_staging_checkout_orders SET status='NOT_PAID' WHERE id=? AND status IN ('PENDING','TOKEN_CREATED')").bind(orderId).run();
    await env.DB.prepare("UPDATE izipay_stock_reservations_stage SET status='RELEASED' WHERE id=? AND status='RESERVED'").bind(row.hold_id).run();
   }
   return new Response('OK',{status:200,headers:{'Content-Type':'text/plain; charset=utf-8'}});
  }
  const checkout=orderId.startsWith('HC-CHECK-T-');
  const table=checkout?'izipay_checkout_test_orders':'izipay_test_orders';
  const row=checkout?await env.DB.prepare('SELECT amount_cents,status FROM izipay_checkout_test_orders WHERE id=?').bind(orderId).first():await env.DB.prepare('SELECT amount_cents,status FROM izipay_test_orders WHERE id=?').bind(orderId).first();
  if(!row)return json({error:'Pedido no encontrado'},404);
  const paid=String(a.orderStatus||'')==='PAID';
  // A signed IPN is not sufficient unless its amount and currency match our authoritative D1 order.
  const sum=Number(a.orderDetails?.orderTotalAmount);
  const currency=String(a.orderDetails?.orderCurrency||a.currency||'');
  if(paid&&sum===row.amount_cents&&currency==='PEN'){
    const paidAt=new Date().toISOString();
    if(checkout)await env.DB.prepare("UPDATE izipay_checkout_test_orders SET status='PAID_TEST',paid_at=? WHERE id=? AND status!='PAID_TEST'").bind(paidAt,orderId).run();
    else await env.DB.prepare("UPDATE izipay_test_orders SET status='PAID_TEST',paid_at=? WHERE id=? AND status!='PAID_TEST'").bind(paidAt,orderId).run();
  }else if(paid){console.error('Izipay signed IPN mismatch',orderId);return json({error:'Monto o moneda no coincide'},409)}
  return new Response('OK',{status:200,headers:{'Content-Type':'text/plain; charset=utf-8'}});
 }

 // Datos legales del proveedor: los configura el dueño, nunca se inventan.
 if(p==='/api/provider'&&method==='GET'){
  const row=await env.DB.prepare("SELECT value FROM appdata WHERE key='provider'").first();
  const pv=row?JSON.parse(row.value):{};return json({legalName:pv.legalName||'',ruc:pv.ruc||'',address:pv.address||''});
 }
 if(p==='/api/claims'&&method==='POST'){
  const row=await env.DB.prepare("SELECT value FROM appdata WHERE key='provider'").first(),pv=row?JSON.parse(row.value):{};
  if(!pv.legalName||!/^\d{11}$/.test(pv.ruc||'')||!pv.address)return json({error:'El proveedor debe configurar su razón social, RUC y domicilio en el administrador antes de recibir reclamaciones.'},503);
  const o=await requestJson(req);
  const fields=['nombres','apellidos','documento_tipo','documento','correo','telefono','domicilio','departamento','distrito','bien_tipo','monto','bien_descripcion','tipo','detalle','pedido'];
  if(fields.some(k=>typeof o[k]!=='string' || !o[k].trim()))return json({error:'Completa todos los campos obligatorios'},400);
  if(o.menor&&(!o.representante||typeof o.representante!=='string'))return json({error:'Faltan los datos del representante'},400);
  if(!o.acepta||!['Reclamo','Queja'].includes(o.tipo)||!['Producto','Servicio'].includes(o.bien_tipo)||!['DNI','CE','Pasaporte','Otro'].includes(o.documento_tipo))return json({error:'Datos de reclamación inválidos'},400);
  if(!/^\S+@\S+\.\S+$/.test(o.correo)||String(o.correo).length>160||String(o.detalle).length<12||String(o.pedido).length<5||!Number.isFinite(Number(o.monto))||Number(o.monto)<0)return json({error:'Revisa correo, monto y descripción de tu reclamación'},400);
  if(fields.some(k=>String(o[k]).length>4500))return json({error:'Texto demasiado largo'},400);
  const timestamp=new Date().toISOString();const payload={};for(const k of [...fields,'representante'])payload[k]=clean(o[k],4500);payload.menor=!!o.menor;
  const id=crypto.randomUUID(),number='HC-'+timestamp.slice(0,10).replace(/-/g,'')+'-'+id.slice(0,8).toUpperCase();
  await env.DB.prepare('INSERT INTO claims(id,number,created_at,details,status) VALUES(?,?,?,?,?)').bind(id,number,timestamp,JSON.stringify(payload),'Pendiente').run();
  return json({ok:true,number,date:timestamp,provider:{legalName:pv.legalName,ruc:pv.ruc,address:pv.address}},201);
 }
 if(p==='/api/catalog'&&method==='GET')return json(await data(env));

 // PREPRODUCCION — ensayo admin de reservas de stock. NO solicita pagos reales ni modifica stock público.
 if(p==='/api/izipay/staging-stock'&&method==='GET'){
  if(!await auth(req,env))return json({error:'Solo administrador'},401);
  const now=new Date().toISOString();
  const rows=await env.DB.prepare("SELECT id,items_json,status,expires_at,created_at FROM izipay_stock_reservations_stage ORDER BY created_at DESC LIMIT 15").all();
  return json({mode:'staging',shippingCents:0,livePaymentsEnabled:false,reservations:(rows.results||[]).map(r=>({id:r.id,items:JSON.parse(r.items_json),status:r.status==='RESERVED'&&r.expires_at<=now?'EXPIRED':r.status,expiresAt:r.expires_at,createdAt:r.created_at}))});
 }
 if(p==='/api/izipay/staging-stock'&&method==='POST'){
  if(!await auth(req,env))return json({error:'Solo administrador'},401);
  const x=await requestJson(req),idempotencyKey=String(x.idempotencyKey||'');
  if(!/^[a-zA-Z0-9_-]{16,80}$/.test(idempotencyKey))return json({error:'Identificador único inválido (16 a 80 caracteres)'},400);
  if(!Array.isArray(x.items)||x.items.length<1||x.items.length>20)return json({error:'Selecciona entre 1 y 20 instrumentos'},400);
  const products=(await data(env)).products,seen=new Set(),selected=[];let amount=0;
  for(const entry of x.items){
   const id=String(entry?.id||''),qty=Number(entry?.qty);
   if(!/^\d{1,12}$/.test(id)||seen.has(id)||!Number.isSafeInteger(qty)||qty<1||qty>10)return json({error:'Productos o cantidades inválidas'},400);
   seen.add(id);const product=products.find(e=>String(e.id)===id);
   if(!product)return json({error:'Producto inexistente; no se aceptan artículos de demostración'},409);
   const unit=Math.round(Number(product.price)*100);
   if(!Number.isSafeInteger(unit)||unit<1||!Number.isSafeInteger(Number(product.stock))||product.stock<0)return json({error:'Precio o stock inválido'},409);
   amount+=unit*qty;if(!Number.isSafeInteger(amount)||amount>20000000)return json({error:'Importe fuera de rango'},400);
   selected.push({id,qty,unit_cents:unit,title:clean(product.title,100)});
  }
  selected.sort((a,b)=>a.id.localeCompare(b.id,'en',{numeric:true}));
  const itemsJson=JSON.stringify(selected),hash=await digest(itemsJson);
  const current=await env.DB.prepare('SELECT id,request_hash,items_json,status,expires_at FROM izipay_stock_reservations_stage WHERE idempotency_key=?').bind(idempotencyKey).first();
  if(current){if(current.request_hash!==hash)return json({error:'Esta clave ya se utilizó para otro carrito'},409);
   return json({id:current.id,shippingCents:0,totalCents:amount,mode:'staging',reused:true,status:current.status,expiresAt:current.expires_at,livePaymentsEnabled:false});}
  const now=new Date(),nowISO=now.toISOString(),until=new Date(now.getTime()+10*60*1000).toISOString();
  const id='HC-HOLD-'+crypto.randomUUID();
  // Una sola sentencia condicional D1: valida simultáneamente el inventario del catálogo
  // y las reservas activas. Evita sobre-reservar al procesar solicitudes concurrentes.
  // Reservas expiran a los 10 minutos; NO se descuentan del catálogo principal.
  const reserveSQL=`INSERT INTO izipay_stock_reservations_stage
    (id,idempotency_key,request_hash,items_json,status,created_at,expires_at)
    SELECT ?,?,?,?,'RESERVED',?,?
    WHERE NOT EXISTS (
      SELECT 1 FROM json_each(?) requested
      LEFT JOIN json_each((SELECT value FROM appdata WHERE key='catalog'),'$.products') product
        ON CAST(json_extract(product.value,'$.id') AS TEXT)=CAST(json_extract(requested.value,'$.id') AS TEXT)
      WHERE product.value IS NULL
      OR CAST(json_extract(product.value,'$.stock') AS INTEGER) <
        CAST(json_extract(requested.value,'$.qty') AS INTEGER) +
        COALESCE((SELECT SUM(CAST(json_extract(held.value,'$.qty') AS INTEGER))
          FROM izipay_stock_reservations_stage res,json_each(res.items_json) held
          WHERE res.status='RESERVED' AND res.expires_at>?
          AND CAST(json_extract(held.value,'$.id') AS TEXT)=CAST(json_extract(requested.value,'$.id') AS TEXT)),0)
      OR CAST(ROUND(CAST(json_extract(product.value,'$.price') AS REAL)*100) AS INTEGER) !=
        CAST(json_extract(requested.value,'$.unit_cents') AS INTEGER)
    )`;
  try{
   const result=await env.DB.prepare(reserveSQL).bind(id,idempotencyKey,hash,itemsJson,nowISO,until,itemsJson,nowISO).run();
   if(result.meta?.changes!==1)return json({error:'Stock no disponible o precio modificado. Actualiza el carrito e inténtalo otra vez.'},409);
  }catch(e){
   const saved=await env.DB.prepare('SELECT id,request_hash,status,expires_at FROM izipay_stock_reservations_stage WHERE idempotency_key=?').bind(idempotencyKey).first();
   if(saved){if(saved.request_hash!==hash)return json({error:'Esta clave ya se utilizó con otro carrito'},409);
    return json({id:saved.id,shippingCents:0,totalCents:amount,mode:'staging',reused:true,status:saved.status,expiresAt:saved.expires_at,livePaymentsEnabled:false});}
   throw e;
  }
  return json({id,shippingCents:0,totalCents:amount,mode:'staging',reused:false,status:'RESERVED',expiresAt:until,livePaymentsEnabled:false},201);
 }
 if(p==='/api/izipay/staging-stock/release'&&method==='POST'){
  if(!await auth(req,env))return json({error:'Solo administrador'},401);
  const x=await requestJson(req),id=String(x.id||'');
  if(!/^HC-HOLD-[0-9a-f-]{36}$/.test(id))return json({error:'Reserva inválida'},400);
  // No permitir liberar manualmente reservas de operaciones en pago, pagadas o en revisión.
  // Una reserva liberada prematuramente podría causar una confirmación tardía insegura.
  const r=await env.DB.prepare(`
    UPDATE izipay_stock_reservations_stage SET status='RELEASED'
    WHERE id=? AND status='RESERVED'
      AND NOT EXISTS (
        SELECT 1 FROM izipay_staging_checkout_orders o
        WHERE o.hold_id=izipay_stock_reservations_stage.id
          AND o.status IN ('PENDING','TOKEN_CREATED','PAID_TEST','REVIEW_REQUIRED')
      )`).bind(id).run();
  return json({ok:true,changed:r.meta?.changes||0,
    notice:r.meta?.changes?'Reserva de ensayo liberada.':'No se liberó: no existe, ya estaba liberada o está vinculada a un pedido en proceso, pagado o en revisión.'});
 }

 // MONITOR DE PREPRODUCCIÓN. Acceso administrador, lecturas mínimas y limpieza segura.
 // No modifica el catálogo público, pedidos reales ni crea pagos.
 if(p==='/api/izipay/staging-monitor'&&method==='GET'){
  if(!await auth(req,env))return json({error:'Solo administrador'},401);
  const now=new Date().toISOString();
  const result=await env.DB.prepare(`
    SELECT o.id,o.status,o.amount_cents,o.created_at,o.paid_at,
           h.id AS hold_id,h.status AS hold_status,h.expires_at,
           CASE WHEN h.status='RESERVED' AND h.expires_at<=? THEN 1 ELSE 0 END AS hold_expired
    FROM izipay_staging_checkout_orders o
    LEFT JOIN izipay_stock_reservations_stage h ON h.id=o.hold_id
    ORDER BY o.created_at DESC LIMIT 30`).bind(now).all();
  const orders=(result.results||[]).map(r=>({id:r.id,status:r.status,amountCents:r.amount_cents,createdAt:r.created_at,paidAt:r.paid_at,holdId:r.hold_id,holdStatus:r.hold_status,holdDisplay:r.status==='PAID_TEST'&&r.hold_status==='RELEASED'?'LIBERADA_TEST_PAGO_CONFIRMADO':r.hold_status,expiresAt:r.expires_at,expired:Boolean(r.hold_expired),needsAttention:r.status==='REVIEW_REQUIRED'||(r.hold_expired&&['TOKEN_CREATED','PENDING'].includes(r.status))}));
  const counts={paidTest:orders.filter(o=>o.status==='PAID_TEST').length,review:orders.filter(o=>o.needsAttention).length,open:orders.filter(o=>['TOKEN_CREATED','PENDING'].includes(o.status)).length,declined:orders.filter(o=>['NOT_PAID','TOKEN_ERROR'].includes(o.status)).length};
  return json({mode:'staging',livePaymentsEnabled:false,shippingCents:0,counts,orders,notice:'Solo últimos 30 pedidos. En TEST, una reserva RELEASED de un pedido PAID_TEST es esperada: el stock público no se descuenta. No indica reembolso ni anulación del pago.'});
 }
 if(p==='/api/izipay/staging-monitor/expire'&&method==='POST'){
  if(!await auth(req,env))return json({error:'Solo administrador'},401);
  const now=new Date().toISOString();
  // Libera únicamente reservas vencidas. Los pedidos vinculados quedan intactos:
  // un pago confirmado después se clasificará REVIEW_REQUIRED por la IPN firmada.
  const result=await env.DB.prepare(`
    UPDATE izipay_stock_reservations_stage
    SET status='RELEASED'
    WHERE status='RESERVED' AND expires_at<=?
      AND NOT EXISTS (
        SELECT 1 FROM izipay_staging_checkout_orders o
        WHERE o.hold_id=izipay_stock_reservations_stage.id
          AND o.status IN ('PAID_TEST','REVIEW_REQUIRED')
      )`).bind(now).run();
  return json({mode:'staging',livePaymentsEnabled:false,released:Number(result.meta?.changes||0),notice:'Solo se liberaron reservas vencidas. No hubo cobro ni descuento de stock público.'});
 }

 // ENSAYO DE CONSUMO DE STOCK: solo pedidos TEST firmados. NO cambia el catálogo público.
 // El INSERT condicional es una única sentencia D1, evitando doble asiento incluso con concurrencia.
 if(p==='/api/izipay/staging-settlement'&&method==='GET'){
  if(!await auth(req,env))return json({error:'Solo administrador'},401);
  const paid=await env.DB.prepare(`SELECT o.id,o.amount_cents,o.paid_at,o.items_json,h.expires_at
    FROM izipay_staging_checkout_orders o LEFT JOIN izipay_stock_reservations_stage h ON h.id=o.hold_id
    WHERE o.status='PAID_TEST' ORDER BY o.paid_at DESC LIMIT 30`).all();
  const settled=await env.DB.prepare(`SELECT order_id,created_at FROM izipay_inventory_settlements_test ORDER BY created_at DESC LIMIT 100`).all();
  const done=new Set((settled.results||[]).map(r=>r.order_id));
  return json({mode:'staging',livePaymentsEnabled:false,shippingCents:0,
   orders:(paid.results||[]).map(o=>({id:o.id,amountCents:o.amount_cents,
    paidAt:o.paid_at,reservationExpiresAt:o.expires_at,
    eligible:Boolean(o.paid_at&&o.expires_at&&o.paid_at<=o.expires_at),
    simulatedDebitRecorded:done.has(o.id)})),
   notice:'Un asiento de ensayo no cambia el stock visible ni autoriza el envío de mercadería.'});
 }
 if(p==='/api/izipay/staging-settlement'&&method==='POST'){
  if(!await auth(req,env))return json({error:'Solo administrador'},401);
  const x=await requestJson(req),orderId=String(x.orderId||'');
  if(!/^HC-STAGE-T-[0-9a-f-]{36}$/.test(orderId))return json({error:'Identificador de pedido TEST inválido'},400);
  const order=await env.DB.prepare(`SELECT o.id,o.status,o.amount_cents,o.paid_at,o.items_json,h.expires_at
    FROM izipay_staging_checkout_orders o JOIN izipay_stock_reservations_stage h ON h.id=o.hold_id
    WHERE o.id=?`).bind(orderId).first();
  if(!order)return json({error:'Pedido de ensayo no encontrado'},404);
  if(order.status!=='PAID_TEST'||!order.paid_at||!order.expires_at||order.paid_at>order.expires_at)
   return json({error:'No hay pago TEST confirmado dentro de una reserva válida. Revisar manualmente.'},409);
  let items;try{items=JSON.parse(order.items_json)}catch{return json({error:'Artículos no válidos'},409)}
  if(!Array.isArray(items)||items.length<1||items.length>20)return json({error:'Artículos no válidos'},409);
  const ids=new Set();let amount=0;
  for(const it of items){
   const id=String(it.id||''),qty=Number(it.qty),unit=Number(it.unit_cents);
   if(!/^\d{1,12}$/.test(id)||ids.has(id)||!Number.isSafeInteger(qty)||qty<1||qty>10||!Number.isSafeInteger(unit)||unit<1)
    return json({error:'Pedido contiene artículos inválidos'},409);
   ids.add(id);amount+=qty*unit;
  }
  if(amount!==order.amount_cents)return json({error:'El importe TEST del pedido no coincide'},409);
  const canonical=JSON.stringify(items),existing=await env.DB.prepare('SELECT order_id FROM izipay_inventory_settlements_test WHERE order_id=?').bind(orderId).first();
  if(existing)return json({mode:'staging',status:'SIMULATED_DEBIT',alreadyRecorded:true,livePaymentsEnabled:false});
  const now=new Date().toISOString();
  // Atomicidad: no consume stock público. Calcula disponibilidad contra asientos de ensayo anteriores.
  const sql=`INSERT INTO izipay_inventory_settlements_test(order_id,items_json,created_at)
    SELECT ?,?,? WHERE NOT EXISTS (
     SELECT 1 FROM json_each(?) requested
     LEFT JOIN json_each((SELECT value FROM appdata WHERE key='catalog'),'$.products') product
       ON CAST(json_extract(product.value,'$.id') AS TEXT)=CAST(json_extract(requested.value,'$.id') AS TEXT)
     WHERE product.value IS NULL
       OR CAST(json_extract(product.value,'$.stock') AS INTEGER) <
         CAST(json_extract(requested.value,'$.qty') AS INTEGER) +
         COALESCE((SELECT SUM(CAST(json_extract(used.value,'$.qty') AS INTEGER))
           FROM izipay_inventory_settlements_test s, json_each(s.items_json) used
           WHERE CAST(json_extract(used.value,'$.id') AS TEXT)=CAST(json_extract(requested.value,'$.id') AS TEXT)),0)
    )`;
  try{
   const result=await env.DB.prepare(sql).bind(orderId,canonical,now,canonical).run();
   if(result.meta?.changes===1)return json({mode:'staging',status:'SIMULATED_DEBIT',alreadyRecorded:false,livePaymentsEnabled:false,notice:'Asiento de ensayo registrado; stock público intacto.'},201);
  }catch(e){
   const dup=await env.DB.prepare('SELECT order_id FROM izipay_inventory_settlements_test WHERE order_id=?').bind(orderId).first();
   if(dup)return json({mode:'staging',status:'SIMULATED_DEBIT',alreadyRecorded:true,livePaymentsEnabled:false});
   throw e;
  }
  return json({error:'No hay stock suficiente para simular el descuento. Requiere revisión, no despachar.'},409);
 }

 // Panel privado de preproducción: no acepta ni inicia cobros reales.
 if(p==='/api/izipay/production-readiness'&&method==='GET'){
  if(!await auth(req,env))return json({error:'Solo administrador'},401);
  const keys=['IZIPAY_PROD_USER','IZIPAY_PROD_PASSWORD','IZIPAY_PROD_PUBLIC_KEY','IZIPAY_PROD_HMAC'];
  const present=Object.fromEntries(keys.map(k=>[k,Boolean(env[k])]));
  const tables=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('izipay_checkout_test_orders','izipay_live_orders','izipay_stock_reservations_stage')").all();
  const found=new Set((tables.results||[]).map(x=>x.name));
  return json({phase:'PREPRODUCCION',livePaymentsEnabled:false,keysConfigured:present,
   d1LiveOrdersTable:found.has('izipay_live_orders'),testCheckoutTable:found.has('izipay_checkout_test_orders'),
   r2Connected:Boolean(env.MEDIA_BUCKET),shipping:{mode:'free_included',shippingCents:0},stagingStockReservationsTable:found.has('izipay_stock_reservations_stage'),
   pending:['Mostrar envío gratis en carrito definitivo y documentos de compra','Integrar las reservas atómicas ensayadas con pago real y actualizaciones de stock del administrador','Implementar idempotencia en las operaciones reales con Izipay y evitar doble cobro','Implementar y probar IPN de producción con clave de producción, separada de TEST','Conciliación de transacciones, reembolsos y pedidos rechazados','Pruebas de producción de bajo importe autorizadas por el titular'],
   warning:'Todavía no se pueden cobrar tarjetas reales. Las credenciales de producción no significan que el flujo esté habilitado.'});
 }
 if(p==='/api/izipay/checkout-live'&&method==='POST'){
  return json({error:'Los pagos reales están desactivados. No se ha iniciado ningún cobro.',mode:'disabled'},503);
 }
 if(p==='/api/session'&&method==='GET')return json({authenticated:await auth(req,env)});
 if(p==='/api/login'&&method==='POST'){
   if(!env.ADMIN_USER||!env.ADMIN_PASSWORD||env.ADMIN_PASSWORD.length<12)return json({error:'Configura los secretos ADMIN_USER y ADMIN_PASSWORD en Cloudflare'},503);
   const {user,password}=await requestJson(req);
   const ok=user===env.ADMIN_USER&&(await pwHash(String(password||''),'hugo-congas-admin-v1'))===(await pwHash(env.ADMIN_PASSWORD,'hugo-congas-admin-v1'));
   if(!ok)return json({error:'Usuario o contraseña incorrectos'},401);
   const token=hex(crypto.getRandomValues(new Uint8Array(32)));const expires=Date.now()+8*3600*1000;
   await env.DB.prepare('INSERT INTO sessions(token_hash,expires) VALUES(?,?)').bind(await digest(token),expires).run();
   return json({ok:true},200,{'Set-Cookie':`hc_admin=${token}; HttpOnly; SameSite=Strict; Secure; Path=/; Max-Age=28800`});
 }
 if(!await auth(req,env))return json({error:'Inicia sesión como administrador'},401);

 if(p==='/api/provider'&&method==='PUT'){
   const x=await requestJson(req),legalName=clean(x.legalName,200).trim(),ruc=clean(x.ruc,11).trim(),address=clean(x.address,300).trim();
   if(!legalName||!/^\d{11}$/.test(ruc)||!address)return json({error:'Completa razón social, RUC de 11 dígitos y domicilio legal'},400);
   await env.DB.prepare("INSERT INTO appdata(key,value) VALUES('provider',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify({legalName,ruc,address})).run();return json({ok:true});
 }
 if(p==='/api/claims'&&method==='GET'){
   const rows=await env.DB.prepare('SELECT id,number,created_at,details,status FROM claims ORDER BY created_at DESC LIMIT 200').all();
   return json({claims:rows.results.map(r=>({...r,details:JSON.parse(r.details)}))});
 }
 // Edición visual: fotografías de banners y modificaciones a instrumentos de demostración.
 if(p==='/api/inline-media'&&method==='PUT'){
  const v=await requestJson(req),key=String(v.key||'');
  if(!['hero','promoLarge','promoTop','promoBottom','faq'].includes(key))return json({error:'Sección desconocida'},400);
  if(v.image!==''&&!isImage(v.image))return json({error:'Usa una URL HTTPS válida o una imagen alojada en la tienda'},400);
  const db=await data(env);db.settings.inlineMedia??={};db.settings.inlineMedia[key]=v.image;await save(env,db);return json({ok:true});
 }
 if(p==='/api/demo'&&method==='PUT'){
  const o=await requestJson(req),id=String(o.id||'');
  if(!/^-\d{1,10}$/.test(id))return json({error:'Producto de ejemplo inválido'},400);
  const db=await data(env);db.settings.demoOverrides??={};
  if(o.action==='hide'){db.settings.demoOverrides[id]={hidden:true}}
  else if(o.action==='save'){
   const input=o.changes||{},patch={};
   for(const k of ['title','brand','category','catLabel','desc','section'])if(typeof input[k]==='string')patch[k]=clean(input[k],k==='desc'?2000:180);
   for(const k of ['price','oldPrice','stock'])if(input[k]!==undefined){const n=Number(input[k]);if(!Number.isFinite(n)||n<0)return json({error:'Precio o stock inválido'},400);patch[k]=n}
   if(input.image!==undefined){if(input.image!==''&&!isImage(input.image))return json({error:'URL de fotografía inválida'},400);patch.image=input.image}
   if(input.gallery!==undefined){if(!validGallery(input.gallery))return json({error:'Máximo 8 fotos adicionales, imágenes válidas y sin duplicados'},400);patch.gallery=input.gallery}
   db.settings.demoOverrides[id]={...(db.settings.demoOverrides[id]||{}),...patch,hidden:false};
  }else return json({error:'Acción desconocida'},400);
  await save(env,db);return json({ok:true});
 }
 if(p==='/api/image-upload'&&method==='POST'){
  if(!env.MEDIA_BUCKET)return json({error:'R2 aún no está enlazado. Crea hugo-congas-media y configura el binding MEDIA_BUCKET.'},503);
  const max=3_000_000;
  const declared=Number(req.headers.get('content-length')||0);
  if(declared>max+100_000)return json({error:'La fotografía supera el máximo de 3 MB'},413);
  const ct=req.headers.get('content-type')||'';
  if(!ct.toLowerCase().startsWith('multipart/form-data;'))return json({error:'Envía una fotografía con el formulario'},415);
  const form=await req.formData();const photo=form.get('image');
  if(!(photo instanceof File)||photo.size===0||photo.size>max)return json({error:'Selecciona una imagen JPG, PNG o WebP de hasta 3 MB'},400);
  const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  const ext=types[photo.type];if(!ext)return json({error:'Solo se aceptan fotografías JPG, PNG o WebP'},415);
  const bytes=new Uint8Array(await photo.arrayBuffer());
  const jpeg=bytes.length>3&&bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
  const png=bytes.length>7&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n);
  const webp=bytes.length>11&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!(ext==='jpg'&&jpeg||ext==='png'&&png||ext==='webp'&&webp))return json({error:'El contenido del archivo no coincide con su formato'},400);
  const key='products/'+crypto.randomUUID()+'.'+ext;
  await env.MEDIA_BUCKET.put(key,bytes,{httpMetadata:{contentType:photo.type}});
  return json({ok:true,url:'/media/'+key},201);
 }
 if(p==='/api/logout'&&method==='POST'){
   await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(cookie(req))).run();
   return json({ok:true},200,{'Set-Cookie':'hc_admin=; HttpOnly; SameSite=Strict; Secure; Path=/; Max-Age=0'});
 }
 if(p==='/api/products'&&method==='POST'){
   const input=await requestJson(req);if(input.gallery!==undefined&&!validGallery(input.gallery))return json({error:'Galería inválida (máximo 8 fotos adicionales)'},400);const db=await data(env),it=item(input);if(!valid(it))return json({error:'Datos del instrumento inválidos'},400);
   db.products.unshift(it);await save(env,db);return json({product:it},201)
 }
 const match=p.match(/^\/api\/products\/(\d+)$/);
 if(match&&['PUT','DELETE'].includes(method)){
   const db=await data(env),index=db.products.findIndex(x=>String(x.id)===match[1]);if(index<0)return json({error:'No encontrado'},404);
   if(method==='DELETE')db.products.splice(index,1);else{const input=await requestJson(req);if(input.gallery!==undefined&&!validGallery(input.gallery))return json({error:'Galería inválida (máximo 8 fotos adicionales)'},400);const it=item(input,db.products[index]);if(!valid(it))return json({error:'Datos inválidos'},400);db.products[index]=it}
   await save(env,db);return json({ok:true});
 }
 if(p==='/api/settings'&&method==='PUT'){
   const patch=await requestJson(req),db=await data(env);for(const k of ['heroTitle','heroText'])if(typeof patch[k]==='string')db.settings[k]=clean(patch[k],400);
   await save(env,db);return json({settings:db.settings});
 }
 return json({error:'Ruta desconocida'},404);
 }catch(err){console.error(err);return json({error:err instanceof SyntaxError?'JSON no válido':'No se pudo procesar la solicitud'},500)}
 }};
