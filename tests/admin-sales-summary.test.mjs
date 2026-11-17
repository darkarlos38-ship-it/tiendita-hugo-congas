import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

function element(tag){
 return {tag,children:[],textContent:'',className:'',href:'',hidden:false,
  appendChild(el){this.children.push(el);return el},
  replaceChildren(){this.children=[]}};
}
function setup(authed){
 const nodes=new Map([
  ['hc-dashboard-sales',element('div')],
  ['hc-dashboard-sales-status',element('p')]
 ]);
 const doc={
  readyState:'complete',
  getElementById:id=>nodes.get(id)||null,
  createElement:element,
  addEventListener(){}
 };
 let orderCalls=0;
 const fetch=async path=>{
  if(path==='/api/session')return {ok:true,json:async()=>({authenticated:authed})};
  if(path==='/api/gestion/seguimiento'){
   orderCalls++;
   return {ok:true,json:async()=>({orders:[{
    id:'HC-LIVE-40d23809-d578-467c-b6e3-d56c19150859',
    status:'ACCEPTED',amountCents:1000,
    buyer:{name:'Comprador prueba',address:'Calle principal 123',district:'Lima'},
    items:[{id:981096196,title:'Producto de prueba',qty:1,unit_cents:1000}]
   }]})};
  }
  throw Error('Unexpected call '+path);
 };
 vm.runInNewContext(readFileSync(new URL('../public/panel-pedidos-resumen.js',import.meta.url),'utf8'),{document:doc,fetch}, {timeout:1000});
 return {nodes,ordersCalled:()=>orderCalls};
}
async function finish(){await new Promise(setImmediate);await new Promise(setImmediate)}
const authorized=setup(true);
await finish();
const cards=authorized.nodes.get('hc-dashboard-sales').children;
assert.equal(cards.length,1,'One real order appears on admin dashboard');
const text=(n)=>[n.textContent,...(n.children||[]).map(text)].join(' ');
assert.match(text(cards[0]),/S\/ 10[,.]00/,'Paid amount is visibly displayed');
assert.match(text(cards[0]),/Producto de prueba/,'Historical purchased product name is shown');
assert.match(text(cards[0]),/1 unidad/,'Quantity is displayed clearly');
assert.match(text(cards[0]),/Calle principal 123/,'Delivery address shown to administrator');
const actions=[];
function walk(n){if(n.href)actions.push(n.href);for(const child of n.children||[])walk(child)}
walk(cards[0]);
assert.ok(actions.some(x=>x.includes('/seguimiento-gestion.html#pedido-HC-LIVE-')),'Admin card has order-specific link');
assert.equal(authorized.ordersCalled(),1);
const guest=setup(false);await finish();
assert.equal(guest.ordersCalled(),0,'Never load order details for unauthenticated visitor');
assert.equal(guest.nodes.get('hc-dashboard-sales').children.length,0);
console.log('Panel de gestión: producto, monto, cantidad, dirección, acceso seguro y vínculo al pedido verificados.');
