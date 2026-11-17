import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const orderId='HC-LIVE-40d23809-d578-467c-b6e3-d56c19150859';
const purchaseKey='hc_checkout_live_attempt_20261117_retry1';

function element(tag='div'){
  return {
    tagName:tag,hidden:false,disabled:false,textContent:'',className:'',
    children:[],adjacent:[],style:{},parentElement:null,
    addEventListener(){},append(...children){this.children.push(...children)},
    replaceChildren(...children){this.children=[...children]},
    insertAdjacentElement(_position,item){this.adjacent.push(item)},
    scrollIntoView(){},setAttribute(){},
    closest(){return null}
  };
}
const nodes=new Map();
for(const id of ['pay-button','status','blocked','payment','checkout-form','items','total']){
  nodes.set(id,element());
}
const card=element('section'),title=element('h2');
card.querySelector=selector=>selector==='h2'?title:null;
nodes.get('items').closest=()=>card;
nodes.get('total').parentElement=element('div');
const session={
  data:new Map([
    [purchaseKey,JSON.stringify({submitted:true,orderId})],
    ['hc_checkout_live_cart','[]']
  ]),
  getItem(k){return this.data.has(k)?this.data.get(k):null},
  setItem(k,v){this.data.set(k,String(v))},
  removeItem(k){this.data.delete(k)}
};
const document={
  hidden:false,
  getElementById:id=>nodes.get(id)||null,
  createElement:tag=>element(tag),
  addEventListener(){}
};
let fetchCalls=0;
vm.runInNewContext(
  readFileSync(new URL('../public/checkout-live.js',import.meta.url),'utf8'),
  {document,sessionStorage:session,fetch:()=>{fetchCalls++;throw Error('Unexpected checkout request')}},
  {filename:'checkout-live.js',timeout:1000}
);
assert.equal(fetchCalls,0,'No debe generar ni consultar otro checkout cuando ya hay pedido');
assert.equal(nodes.get('checkout-form').hidden,true,'Oculta el formulario al reabrir una compra iniciada');
assert.match(nodes.get('status').textContent,/Verificando/);
assert.equal(nodes.get('items').children.length,1,'No exige un carrito para consultar el pedido');

const answers=[];
const fetch=async (url)=>{
 answers.push(url);
 if(url==='/api/izipay/order-status-live')return {ok:true,json:async()=>({orderId,status:'PAID'})};
 if(url==='/api/customer/cart/consume-paid')return {ok:false,status:401};
 throw Error('URL inesperada');
};
vm.runInNewContext(
  readFileSync(new URL('../public/checkout-payment-status.js',import.meta.url),'utf8'),
  {document,sessionStorage:session,fetch,setInterval:()=>1,clearInterval:()=>{},window:{addEventListener(){}}},
  {filename:'checkout-payment-status.js',timeout:1000}
);
await new Promise(setImmediate);
const result=nodes.get('payment').adjacent.find(x=>x.id==='hc-live-payment-result');
assert.ok(result,'Debe aparecer una sección para el estado del pedido');
assert.match(result.children[0].textContent,/Compra realizada con éxito/);
assert.equal(nodes.get('checkout-form').hidden,true);
assert.equal(nodes.get('total').parentElement.style.display,'none');
assert.equal(session.getItem('hc_checkout_live_cart'),null,'Vacía el resumen temporal del pago confirmado');
assert.equal(JSON.parse(session.getItem(purchaseKey)).completed,true,'Marca la compra confirmada');
assert.ok(!answers.includes('/api/izipay/checkout-live'),'Nunca crea una nueva intención de pago');
console.log('Checkout resume y recibo: pruebas superadas sin cobros.');
