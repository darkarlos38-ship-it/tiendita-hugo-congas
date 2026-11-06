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
function item(p,old){const image=clean(p.image||'');return {id:old?.id??crypto.getRandomValues(new Uint32Array(1))[0],title:clean(p.title,180),category:clean(p.category,45),catLabel:clean(p.catLabel||p.category,100),brand:clean(p.brand,90),price:Number(p.price),oldPrice:Number(p.oldPrice||p.price),stock:Math.max(0,Math.floor(Number(p.stock||0))),image:isImage(image)?image:(image===''?'':(old?.image||'')),svg:clean(p.svg||old?.svg||'guitar',32),section:['bestseller','new','audio'].includes(p.section)?p.section:'new',desc:clean(p.desc),keySpecs:old?.keySpecs||[]}}
function valid(p){return p.title&&p.category&&p.brand&&Number.isFinite(p.price)&&p.price>=0&&Number.isFinite(p.oldPrice)&&p.oldPrice>=0&&Number.isFinite(p.stock)&&p.stock>=0}
async function requestJson(req){const len=Number(req.headers.get('content-length')||0);if(len>5_000_000)throw Error('Datos demasiado grandes');const t=await req.text();if(t.length>5_000_000)throw Error('Datos demasiado grandes');return JSON.parse(t||'{}')}
function sameOrigin(req){const o=req.headers.get('origin');return !o||o===new URL(req.url).origin}
export default {async fetch(req,env){
 const url=new URL(req.url),p=url.pathname,method=req.method;
 try{
 if(p.startsWith('/media/') && method==='GET' && env.MEDIA_BUCKET){
   const key=p.slice('/media/'.length);
   if(!/^[a-zA-Z0-9._/-]+$/.test(key))return new Response('No encontrado',{status:404});
   const object=await env.MEDIA_BUCKET.get(key);
   if(!object)return new Response('No encontrado',{status:404});
   return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'image/jpeg','Cache-Control':'public,max-age=3600','X-Content-Type-Options':'nosniff'}});
 }
 if(!p.startsWith('/api/'))return env.ASSETS.fetch(req);
 if(!env.DB)return json({error:'Falta conectar la base de datos D1'},503);
 if(!['GET','HEAD'].includes(method)&&!sameOrigin(req))return json({error:'Origen no autorizado'},403);

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
   db.settings.demoOverrides[id]={...(db.settings.demoOverrides[id]||{}),...patch,hidden:false};
  }else return json({error:'Acción desconocida'},400);
  await save(env,db);return json({ok:true});
 }
 if(p==='/api/image-upload'&&method==='POST'){
  if(!env.MEDIA_BUCKET)return json({error:'La carga de fotos desde el dispositivo estará disponible cuando actives R2 y conectemos MEDIA_BUCKET. Por ahora utiliza el enlace HTTPS de una imagen.'},503);
  const form=await req.formData();const photo=form.get('image');
  if(!photo||typeof photo==='string'||photo.size>3_000_000||photo.size===0)return json({error:'Selecciona una imagen de hasta 3 MB'},400);
  const types={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
  if(!types[photo.type])return json({error:'Usa JPG, PNG o WebP'},400);
  const key='products/'+crypto.randomUUID()+'.'+types[photo.type];
  await env.MEDIA_BUCKET.put(key,await photo.arrayBuffer(),{httpMetadata:{contentType:photo.type}});
  return json({ok:true,url:'/media/'+key});
 }
 if(p==='/api/logout'&&method==='POST'){
   await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await digest(cookie(req))).run();
   return json({ok:true},200,{'Set-Cookie':'hc_admin=; HttpOnly; SameSite=Strict; Secure; Path=/; Max-Age=0'});
 }
 if(p==='/api/products'&&method==='POST'){
   const db=await data(env),it=item(await requestJson(req));if(!valid(it))return json({error:'Datos del instrumento inválidos'},400);
   db.products.unshift(it);await save(env,db);return json({product:it},201)
 }
 const match=p.match(/^\/api\/products\/(\d+)$/);
 if(match&&['PUT','DELETE'].includes(method)){
   const db=await data(env),index=db.products.findIndex(x=>String(x.id)===match[1]);if(index<0)return json({error:'No encontrado'},404);
   if(method==='DELETE')db.products.splice(index,1);else{const it=item(await requestJson(req),db.products[index]);if(!valid(it))return json({error:'Datos inválidos'},400);db.products[index]=it}
   await save(env,db);return json({ok:true});
 }
 if(p==='/api/settings'&&method==='PUT'){
   const patch=await requestJson(req),db=await data(env);for(const k of ['heroTitle','heroText'])if(typeof patch[k]==='string')db.settings[k]=clean(patch[k],400);
   await save(env,db);return json({settings:db.settings});
 }
 return json({error:'Ruta desconocida'},404);
 }catch(err){console.error(err);return json({error:err instanceof SyntaxError?'JSON no válido':'No se pudo procesar la solicitud'},500)}
 }};
