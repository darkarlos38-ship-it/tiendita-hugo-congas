import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import {handleShipmentRoute} from '../shipment-tracking.js';
import worker from '../worker.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const id='HC-LIVE-40d23809-d578-467c-b6e3-d56c19150859';
let state='ACCEPTED',mode='LOCAL',carrier='',number='',evidence=null,confirmed=null,r2Reads=0,updates=0;
const row=()=>({id,items_json:'[{"id":123,"title":"Instrumento","qty":1}]',
 buyer_json:JSON.stringify({email:'cliente@example.com',name:'Cliente privado',phone:'999999999'}),
 amount_cents:1000,paid_at:'2026-11-17T21:28:02Z',
 new_status:state,shipping_mode:mode,carrier,tracking_number:number,
 tracking_url:'',agency:'',updated_at:'2026-11-17T21:28:02Z',delivered_at:state==='DELIVERED'?'2026-11-17T22:01:00Z':null,
 customer_confirmed_at:confirmed,evidence_kind:evidence?'DELIVERY_PHOTO':null,
 evidence_uploaded_at:evidence?'2026-11-17T22:00:00Z':null,legacy_status:null,legacy_reference:''});
const DB={
 prepare(sql){
  const command={args:[],
   bind(...args){this.args=args;return this},
   async first(){
    if(sql.includes('FROM izipay_live_orders o'))return this.args[0]===id?row():null;
    if(sql.includes('FROM hc_delivery_evidence_v2'))return evidence;
    throw Error('Unexpected first query: '+sql.slice(0,80));
   },
   async all(){
    if(sql.includes('FROM izipay_live_orders o')){
      const match=sql.includes("lower(json_extract(o.buyer_json,'$.email'))");
      return {results:!match||this.args[0]==='cliente@example.com'?[row()]:[]};
    }
    if(sql.includes('FROM hc_order_tracking_events_v2'))return {results:[]};
    throw Error('Unexpected all query: '+sql.slice(0,80));
   },
   async run(){
    if(sql.includes('INSERT INTO hc_order_tracking_events_v2'))return {meta:{changes:1}};
    if(sql.includes('UPDATE hc_order_tracking_v2 SET customer_confirmed_at')){
      if(state!=='DELIVERED'||confirmed)return {meta:{changes:0}};
      confirmed=this.args[0];return {meta:{changes:1}};
    }
    if(sql.includes('INSERT INTO hc_order_tracking_v2')){
      const a=this.args;state=a[1];mode=a[2];carrier=a[3];number=a[4];updates++;return {meta:{changes:1}};
    }
    throw Error('Unexpected write: '+sql.slice(0,100));
   }
  };
  return command;
 },
 async batch(commands){
  const out=[];
  for(const c of commands)out.push(await c.run());
  return out;
 }
};
const env={DB,MEDIA_BUCKET:{get:async()=>{r2Reads++;return {body:'fake-image-bytes'}}}};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const defaults={auth:async()=>true,hcSession:async()=>({email:'cliente@example.com'}),json};
const request=(path,method='GET',body)=>new Request('https://tienditamusicalhugocongas.com'+path,{
 method,headers:body?{'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
const call=(path,method='GET',body,helpers=defaults)=>handleShipmentRoute(request(path,method,body),env,helpers);

let r=await call('/api/customer/orders','GET',null,{...defaults,hcSession:async()=>null});
assert.equal(r.status,401,'No logged-in customer = no orders');
r=await call('/api/gestion/seguimiento','GET',null,{...defaults,auth:async()=>false});
assert.equal(r.status,401,'Only administrators can access shipment operations');
r=await call('/api/customer/orders');assert.equal(r.status,200);
let data=await r.json();assert.equal(data.orders.length,1);
assert.equal(data.orders[0].buyer,undefined,'No personal buyer info in customer API');
assert.equal(data.orders[0].history[0].status,'ACCEPTED');

r=await call('/api/gestion/seguimiento/'+id,'PATCH',{status:'DELIVERED',shippingMode:'LOCAL'});
assert.equal(r.status,409,'Cannot skip stages');
r=await call('/api/gestion/seguimiento/'+id,'PATCH',{status:'PACKING',shippingMode:'LOCAL'});
assert.equal(r.status,200,'Admin can start packing');
r=await call('/api/gestion/seguimiento/'+id,'PATCH',{status:'SHIPPED',shippingMode:'PROVINCE'});
assert.equal(r.status,400,'Province shipment requires carrier and guide');
r=await call('/api/gestion/seguimiento/'+id,'PATCH',{
 status:'SHIPPED',shippingMode:'PROVINCE',carrier:'Transportes de prueba',trackingNumber:'GUIA-123'});
assert.equal(r.status,200,'Province shipment with a guide is accepted');
assert.equal(mode,'PROVINCE');
r=await call('/api/gestion/seguimiento/'+id,'PATCH',{status:'DELIVERED'});
assert.equal(r.status,409,'Cannot mark delivered without proof');
r=await call('/api/customer/orders/'+id+'/confirm','POST');
assert.equal(r.status,409,'Cannot confirm before verified delivery');
evidence={object_key:'delivery-evidence/private-test.jpg',mime_type:'image/jpeg'};
r=await call('/api/customer/orders/'+id+'/proof','GET',null,{...defaults,hcSession:async()=>({email:'intruso@example.com'})});
assert.equal(r.status,403,'Other logged-in accounts cannot access proof');
assert.equal(r2Reads,0,'Private proof is not read before ownership check');
r=await call('/api/customer/orders/'+id+'/proof');
assert.equal(r.status,200,'Owner can see proof');
assert.equal(r.headers.get('Cache-Control'),'private,no-store');
r=await call('/api/gestion/seguimiento/'+id,'PATCH',{status:'DELIVERED'});
assert.equal(r.status,200,'Can mark delivered after proof is stored');
r=await call('/api/customer/orders/'+id+'/confirm','POST');
assert.equal(r.status,200,'Owner can confirm delivery');
assert.ok(confirmed,'Confirmed time recorded');
r=await call('/api/customer/orders/'+id+'/confirm','POST');
assert.equal(r.status,200);data=await r.json();
assert.equal(data.alreadyConfirmed,true,'Repeated confirmation is idempotent');
r=await worker.fetch(request('/media/delivery-evidence/private-test.jpg'),env);
assert.equal(r.status,404,'No public product media URL can expose delivery proofs');
assert.equal(r2Reads,1,'Private evidence only accessed after authorization');
assert.equal(updates,3,'Only three shipping state transitions were written');
console.log('Seguimiento: 16 controles de seguridad y estados verificados, sin compras ni R2 real.');
