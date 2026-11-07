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
 if(p==='/api/izipay/ipn'&&method==='POST'){
  if(!env.IZIPAY_TEST_PASSWORD)return json({error:'Pago no configurado'},503);
  const form=await req.formData(); const answer=form.get('kr-answer'),mac=form.get('kr-hash');
  if(typeof answer!=='string'||typeof mac!=='string'||answer.length>50000||!/(^[0-9a-f]{64}$)/i.test(mac))return json({error:'Notificación inválida'},400);
  const key=await crypto.subtle.importKey('raw',enc.encode(env.IZIPAY_TEST_PASSWORD),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const expected=hex(new Uint8Array(await crypto.subtle.sign('HMAC',key,enc.encode(answer))));
  if(expected.length!==mac.length||!expected.split('').every((c,i)=>c===mac.toLowerCase()[i]))return json({error:'Firma inválida'},403);
  let a;try{a=JSON.parse(answer)}catch{return json({error:'Respuesta ilegible'},400)}
  const orderId=String(a.orderDetails?.orderId||a.orderId||'');
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

 // Panel privado de preproducción: no acepta ni inicia cobros reales.
 if(p==='/api/izipay/production-readiness'&&method==='GET'){
  if(!await auth(req,env))return json({error:'Solo administrador'},401);
  const keys=['IZIPAY_PROD_USER','IZIPAY_PROD_PASSWORD','IZIPAY_PROD_PUBLIC_KEY','IZIPAY_PROD_HMAC'];
  const present=Object.fromEntries(keys.map(k=>[k,Boolean(env[k])]));
  const tables=await env.DB.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name IN ('izipay_checkout_test_orders','izipay_live_orders')").all();
  const found=new Set((tables.results||[]).map(x=>x.name));
  return json({phase:'PREPRODUCCION',livePaymentsEnabled:false,keysConfigured:present,
   d1LiveOrdersTable:found.has('izipay_live_orders'),testCheckoutTable:found.has('izipay_checkout_test_orders'),
   r2Connected:Boolean(env.MEDIA_BUCKET),
   pending:['Definir y mostrar gastos de envío antes del pago','Reservar stock de forma atómica','Proteger contra solicitudes repetidas y pagos duplicados','Implementar y probar IPN de producción con clave de producción, separada de TEST','Conciliación de transacciones, reembolsos y pedidos rechazados','Pruebas de producción de bajo importe autorizadas por el titular'],
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
