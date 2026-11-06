// Tiendita Musical Hugo Congas — Cloudflare Worker + D1 (sin R2)
const enc = new TextEncoder();
const security = {'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'strict-origin-when-cross-origin','Content-Security-Policy':"frame-ancestors 'none'"};
const json=(v,status=200,extra={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...security,...extra}});
const clean=(v,n=5000)=>String(v??'').replace(/[<>]/g,'').slice(0,n);
const isImage=v=>typeof v==='string'&&(v.startsWith('/images/')&&/^\/images\/[a-zA-Z0-9._/-]+$/.test(v)||/^https:\/\/[^\s<>"']+$/i.test(v));
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
 if(!p.startsWith('/api/'))return env.ASSETS.fetch(req);
 if(!env.DB)return json({error:'Falta conectar la base de datos D1'},503);
 if(!['GET','HEAD'].includes(method)&&!sameOrigin(req))return json({error:'Origen no autorizado'},403);
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
