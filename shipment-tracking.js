// Envíos y evidencias privadas: NO modifica Izipay, cobros ni inventario.
const ORDER_ID=/^HC-LIVE-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS=new Set(['ACCEPTED','PACKING','SHIPPED','AGENCY_ARRIVED','DELIVERED']);
const NEXT={ACCEPTED:['PACKING'],PACKING:['SHIPPED'],SHIPPED:['AGENCY_ARRIVED','DELIVERED'],AGENCY_ARRIVED:['DELIVERED'],DELIVERED:[]};
const text=(v,n=150)=>String(v||'').trim().slice(0,n);
const errors=(msg,status=400)=>({msg,status});
function normalizedUrl(value){
 const input=text(value,350);
 if(!input)return '';
 try{
  const u=new URL(input);
  if(u.protocol!=='https:'||u.username||u.password||u.hostname.length>220)return null;
  return u.href;
 }catch{return null}
}
const PAID_FILTER=`o.status='PAID' AND o.paid_at IS NOT NULL AND o.currency='PEN'
 AND json_valid(o.buyer_json)=1 AND json_valid(o.items_json)=1 AND json_array_length(o.items_json)>0
 AND EXISTS(SELECT 1 FROM izipay_live_webhook_events e WHERE e.order_id=o.id AND e.verified=1 AND e.processing_status='GATE_CLOSED_PAID')
 AND (SELECT COUNT(*) FROM hc_live_fulfillments f WHERE f.order_id=o.id)=json_array_length(o.items_json)`;
const TRACK_SELECT=`SELECT o.id,o.items_json,o.buyer_json,o.amount_cents,o.paid_at,
 t.status AS new_status,t.shipping_mode,t.carrier,t.tracking_number,t.tracking_url,t.agency,t.updated_at,t.delivered_at,t.customer_confirmed_at,
 e.kind AS evidence_kind,e.uploaded_at AS evidence_uploaded_at,
 d.status AS legacy_status,d.shipping_reference AS legacy_reference
 FROM izipay_live_orders o
 LEFT JOIN hc_order_tracking_v2 t ON t.order_id=o.id
 LEFT JOIN hc_delivery_evidence_v2 e ON e.order_id=o.id
 LEFT JOIN hc_order_dispatch_v1 d ON d.order_id=o.id`;
function formatOrder(o,admin=false){
 let buyer={},items=[];
 try{buyer=JSON.parse(o.buyer_json||'{}')}catch{}
 try{items=JSON.parse(o.items_json||'[]')}catch{}
 const legacy={PENDIENTE:'ACCEPTED',GESTIONADO:'PACKING',ENVIADO:'SHIPPED'};
 const status=o.new_status||legacy[o.legacy_status]||'ACCEPTED';
 const v={id:o.id,status,shippingMode:o.shipping_mode||'LOCAL',carrier:o.carrier||'',
  trackingNumber:o.tracking_number||o.legacy_reference||'',trackingUrl:o.tracking_url||'',agency:o.agency||'',
  updatedAt:o.updated_at||o.paid_at,paidAt:o.paid_at,amountCents:o.amount_cents,items,
  deliveredAt:o.delivered_at||null,customerConfirmedAt:o.customer_confirmed_at||null,
  evidenceKind:o.evidence_kind||null,evidenceUploadedAt:o.evidence_uploaded_at||null};
 if(admin)v.buyer={name:buyer.name||'',email:buyer.email||'',phone:buyer.phone||'',address:buyer.address||'',district:buyer.district||'',deliveryReference:buyer.deliveryReference||''};
 return v;
}
async function history(env,orders){
 if(!orders.length)return;
 const ids=orders.map(o=>o.id);
 const rows=await env.DB.prepare(`SELECT order_id,status,actor,detail,created_at
 FROM hc_order_tracking_events_v2 WHERE order_id IN (${ids.map(()=>'?').join(',')})
 ORDER BY created_at ASC LIMIT 700`).bind(...ids).all();
 const map=new Map();
 for(const e of rows.results||[]){if(!map.has(e.order_id))map.set(e.order_id,[]);
  map.get(e.order_id).push({status:e.status,detail:e.detail,at:e.created_at});}
 for(const o of orders){o.history=[{status:'ACCEPTED',detail:'Pago validado y pedido aceptado',at:o.paidAt},...(map.get(o.id)||[])];}
}
async function getPaid(env,orderId){
 return env.DB.prepare(`${TRACK_SELECT} WHERE o.id=? AND ${PAID_FILTER} LIMIT 1`).bind(orderId).first();
}
async function imageResponse(env,req,orderId,admin,session){
 const o=await getPaid(env,orderId);
 if(!o)return new Response('Pedido no encontrado',{status:404});
 if(!admin){
  let buyer={};try{buyer=JSON.parse(o.buyer_json)}catch{}
  if(!session||String(buyer.email||'').toLowerCase()!==String(session.email).toLowerCase())
   return new Response('Acceso no permitido',{status:403});
 }
 if(!env.MEDIA_BUCKET)return new Response('Almacenamiento no disponible',{status:503});
 const e=await env.DB.prepare('SELECT object_key,mime_type FROM hc_delivery_evidence_v2 WHERE order_id=?').bind(orderId).first();
 if(!e)return new Response('Evidencia pendiente',{status:404});
 const photo=await env.MEDIA_BUCKET.get(e.object_key);
 if(!photo)return new Response('Archivo no disponible',{status:404});
 return new Response(photo.body,{headers:{'Content-Type':e.mime_type,
  'Content-Disposition':'inline; filename="constancia-entrega"',
  'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff',
  'Cross-Origin-Resource-Policy':'same-origin','X-Frame-Options':'DENY'}});
}
export async function handleShipmentRoute(req,env,{auth,hcSession,json}){
 const p=new URL(req.url).pathname,method=req.method;
 const isCustomer=p==='/api/customer/orders'||/^\/api\/customer\/orders\/[^/]+\/(proof|confirm)$/.test(p);
 const isAdmin=p==='/api/gestion/seguimiento'||/^\/api\/gestion\/seguimiento\/[^/]+(\/proof)?$/.test(p);
 if(!isCustomer&&!isAdmin)return null;
 const admin=isAdmin?await auth(req,env):false;
 const user=isCustomer?await hcSession(req,env):null;
 if(isAdmin&&!admin)return json({error:'Solo administrador'},401);
 if(isCustomer&&!user)return json({error:'Inicia sesión para ver tus pedidos'},401);
 const parts=p.split('/');
 const orderId=parts.length>=5?parts[4]:'';
 if(orderId&&!ORDER_ID.test(orderId))return json({error:'Identificador de pedido inválido'},400);
 if(method==='GET'&&(p==='/api/customer/orders'||p==='/api/gestion/seguimiento')){
  const sql=`${TRACK_SELECT} WHERE ${PAID_FILTER}`+
   (isCustomer?' AND lower(json_extract(o.buyer_json,\'$.email\'))=lower(?)':'')+
   ' ORDER BY o.paid_at DESC LIMIT '+(isCustomer?'50':'100');
  const query=env.DB.prepare(sql),rs=await (isCustomer?query.bind(user.email):query).all();
  const orders=(rs.results||[]).map(x=>formatOrder(x,admin));
  await history(env,orders);
  return json({orders});
 }
 if(p.endsWith('/proof')&&method==='GET')return imageResponse(env,req,orderId,admin,user);
 if(isCustomer&&p.endsWith('/confirm')&&method==='POST'){
  const order=await getPaid(env,orderId);if(!order)return json({error:'Pedido no disponible'},404);
  let buyer={};try{buyer=JSON.parse(order.buyer_json)}catch{}
  if(String(buyer.email||'').toLowerCase()!==String(user.email).toLowerCase())
   return json({error:'Pedido no asociado a tu cuenta'},403);
  if(order.new_status!=='DELIVERED'||!order.evidence_kind)
   return json({error:'Aún no consta una entrega respaldada por evidencia'},409);
  if(order.customer_confirmed_at)return json({ok:true,alreadyConfirmed:true,confirmedAt:order.customer_confirmed_at});
  const now=new Date().toISOString();
  const results=await env.DB.batch([
   env.DB.prepare(`UPDATE hc_order_tracking_v2 SET customer_confirmed_at=?
    WHERE order_id=? AND status='DELIVERED' AND customer_confirmed_at IS NULL
    AND EXISTS(SELECT 1 FROM hc_delivery_evidence_v2 WHERE order_id=?)`).bind(now,orderId,orderId),
   env.DB.prepare(`INSERT INTO hc_order_tracking_events_v2(id,order_id,status,actor,detail,created_at)
    SELECT ?,?,?,?,?,? WHERE EXISTS (
      SELECT 1 FROM hc_order_tracking_v2 WHERE order_id=? AND customer_confirmed_at=?
    )`).bind(crypto.randomUUID(),orderId,'CUSTOMER_CONFIRMED','CUSTOMER','El cliente confirmó haber recibido su pedido',now,orderId,now)
  ]);
  if(Number(results[0]?.meta?.changes)!==1)return json({error:'La confirmación ya se procesó o cambió el pedido. Actualiza la página.'},409);
  return json({ok:true,confirmedAt:now});
 }
 if(isAdmin&&p.endsWith('/proof')&&method==='POST'){
  if(!env.MEDIA_BUCKET)return json({error:'Almacenamiento R2 no vinculado'},503);
  const order=await getPaid(env,orderId);if(!order)return json({error:'Solo pedidos pagados y conciliados'},409);
  if(order.new_status==='DELIVERED')return json({error:'La entrega ya fue cerrada'},409);
  const existing=await env.DB.prepare('SELECT object_key FROM hc_delivery_evidence_v2 WHERE order_id=?').bind(orderId).first();
  if(existing)return json({error:'Ya existe una constancia. No se reemplaza para preservar la evidencia.'},409);
  const size=Number(req.headers.get('content-length')||0);
  if(size>3_200_000)return json({error:'El archivo no debe superar 3 MB'},413);
  if(!(req.headers.get('content-type')||'').toLowerCase().startsWith('multipart/form-data;'))return json({error:'Sube una imagen'},415);
  const form=await req.formData(),photo=form.get('image'),kind=String(form.get('kind')||'');
  if(!['DELIVERY_PHOTO','CARRIER_PROOF'].includes(kind))return json({error:'Tipo de evidencia inválido'},400);
  if(!(photo instanceof File)||!photo.size||photo.size>3_000_000)return json({error:'Imagen inválida (máximo 3 MB)'},400);
  const ext={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'}[photo.type];
  if(!ext)return json({error:'Solo JPG, PNG o WebP'},415);
  const bytes=new Uint8Array(await photo.arrayBuffer());
  const jpg=bytes.length>3&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255;
  const png=bytes.length>7&&[137,80,78,71,13,10,26,10].every((v,i)=>bytes[i]===v);
  const webp=bytes.length>11&&String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP';
  if(!((ext==='jpg'&&jpg)||(ext==='png'&&png)||(ext==='webp'&&webp)))return json({error:'El archivo no corresponde a su extensión'},400);
  const key='delivery-evidence/'+crypto.randomUUID()+'.'+ext,now=new Date().toISOString();
  const sha=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
  await env.MEDIA_BUCKET.put(key,bytes,{httpMetadata:{contentType:photo.type}});
  try{
   const inserted=await env.DB.prepare(`INSERT OR IGNORE INTO hc_delivery_evidence_v2(order_id,object_key,mime_type,size_bytes,kind,uploaded_at,sha256)
   SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM izipay_live_orders o WHERE o.id=? AND ${PAID_FILTER})`)
   .bind(orderId,key,photo.type,photo.size,kind,now,sha,orderId).run();
   if(Number(inserted.meta?.changes)!==1){await env.MEDIA_BUCKET.delete(key);return json({error:'Otra evidencia ya fue registrada'},409)}
  }catch(e){await env.MEDIA_BUCKET.delete(key);throw e}
  await env.DB.prepare('INSERT INTO hc_order_tracking_events_v2(id,order_id,status,actor,detail,created_at) VALUES(?,?,?,?,?,?)')
   .bind(crypto.randomUUID(),orderId,'PROOF_UPLOADED','ADMIN',kind==='CARRIER_PROOF'?'Constancia del operador logístico registrada':'Foto de entrega registrada',now).run();
  return json({ok:true,kind,uploadedAt:now});
 }
 if(isAdmin&&method==='PATCH'&&!p.endsWith('/proof')){
  const order=await getPaid(env,orderId);if(!order)return json({error:'Solo pedidos pagados y conciliados'},409);
  let input;try{input=await req.json()}catch{return json({error:'JSON inválido'},400)}
  const current=formatOrder(order,true);
  const status=String(input.status||'');
  const shippingMode=String(input.shippingMode||current.shippingMode);
  const carrier=text(input.carrier??current.carrier,100);
  const trackingNumber=text(input.trackingNumber??current.trackingNumber,120);
  const agency=text(input.agency??current.agency,160);
  const trackingUrl=normalizedUrl(input.trackingUrl??current.trackingUrl);
  if(!STATUS.has(status)||!['LOCAL','PROVINCE'].includes(shippingMode)||trackingUrl===null)
   return json({error:'Datos de seguimiento inválidos'},400);
  if(current.status==='DELIVERED'&&(status!==current.status||shippingMode!==current.shippingMode))
   return json({error:'Una entrega cerrada no se puede retroceder ni modificar'},409);
  if(['SHIPPED','AGENCY_ARRIVED','DELIVERED'].includes(current.status)&&current.shippingMode!==shippingMode)
   return json({error:'No se puede cambiar la modalidad después del despacho'},409);
  if(status!==current.status&&!NEXT[current.status].includes(status))
   return json({error:'Avanza al siguiente estado; no se permite saltar etapas'},409);
  if(status==='AGENCY_ARRIVED'&&shippingMode!=='PROVINCE')
   return json({error:'La llegada a agencia solo corresponde a envíos a provincias'},400);
  if(['SHIPPED','AGENCY_ARRIVED','DELIVERED'].includes(status)&&shippingMode==='PROVINCE'&&(!carrier||!trackingNumber))
   return json({error:'Envío a provincias: registra empresa y número de guía antes de despachar'},400);
  if(status==='DELIVERED'&&!order.evidence_kind)
   return json({error:'Sube primero la fotografía o constancia de entrega a R2'},409);
  if(current.status==='DELIVERED'&&order.customer_confirmed_at)
   return json({error:'El comprador ya confirmó la entrega; no se puede modificar'},409);
  const now=new Date().toISOString(),delivered=status==='DELIVERED'?(order.delivered_at||now):null;
  const result=await env.DB.batch([
   env.DB.prepare(`INSERT INTO hc_order_tracking_v2
     (order_id,status,shipping_mode,carrier,tracking_number,tracking_url,agency,updated_at,delivered_at)
     VALUES(?,?,?,?,?,?,?,?,?)
     ON CONFLICT(order_id) DO UPDATE SET
     status=excluded.status,shipping_mode=excluded.shipping_mode,
     carrier=excluded.carrier,tracking_number=excluded.tracking_number,
     tracking_url=excluded.tracking_url,agency=excluded.agency,
     updated_at=excluded.updated_at,delivered_at=excluded.delivered_at
     WHERE hc_order_tracking_v2.status=?`)
    .bind(orderId,status,shippingMode,carrier,trackingNumber,trackingUrl,agency,now,delivered,order.new_status||current.status),
   ...(status!==current.status?[env.DB.prepare(`INSERT INTO hc_order_tracking_events_v2(id,order_id,status,actor,detail,created_at)
     SELECT ?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM hc_order_tracking_v2 WHERE order_id=? AND status=?)`)
     .bind(crypto.randomUUID(),orderId,status,'ADMIN',
       status==='AGENCY_ARRIVED'?'Llegó a la agencia de destino':'Estado actualizado por la tienda',now,orderId,status)]:[])
  ]);
  if(Number(result[0]?.meta?.changes)!==1)return json({error:'El estado cambió. Actualiza la página antes de guardar.'},409);
  return json({ok:true,orderId,status,shippingMode,carrier,trackingNumber,trackingUrl,agency,updatedAt:now});
 }
 return json({error:'Operación no permitida'},405);
}
