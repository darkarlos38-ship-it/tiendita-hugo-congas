import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {UBIGEO_PE,resolveUbigeo} from '../ubigeo-peru.js';
import worker from '../worker.js';

// Datos únicos con códigos UBIGEO completos, sin truncar ceros a la izquierda.
assert.equal(UBIGEO_PE.departments.length,25);
assert.equal(UBIGEO_PE.provinces.length,196);
assert.equal(UBIGEO_PE.districts.length,1892);
assert.equal(new Set(UBIGEO_PE.districts.map(row=>row[0])).size,1892);
const location=resolveUbigeo('15','1501','150103');
assert.deepEqual([location.department,location.province,location.district],['LIMA','LIMA','ATE']);
assert.equal(resolveUbigeo('01','1501','150103'),null,'No permite cambiar departamento');
assert.equal(resolveUbigeo('15','1502','150103'),null,'No permite provincia incorrecta');
assert.equal(resolveUbigeo('15','1501','000000'),null,'No permite distrito desconocido');
assert.equal(resolveUbigeo('15','1501','1501AA'),null,'No permite códigos de texto arbitrarios');

const noDb={DB:{},ASSETS:{fetch(){throw Error('Unexpected asset request')}}};
const response=await worker.fetch(new Request('https://www.tienditamusicalhugocongas.com/api/geo/peru'),noDb);
assert.equal(response.status,200);
const served=await response.json();
assert.equal(served.districts.length,1892,'El Worker sirve la misma fuente sin terceros');
assert.equal(served.districts.find(row=>row[0]==='150103')?.[1],'ATE');

function select(){
 return {
  options:[],value:'',disabled:false,listeners:{},
  replaceChildren(){this.options=[];this.value=''},
  append(x){this.options.push(x)},
  addEventListener(name,fn){this.listeners[name]=fn}
 };
}
const dep=select(),prov=select(),dist=select(),status={textContent:''};
const nodes={departmentCode:dep,provinceCode:prov,districtCode:dist,'geo-status':status};
const document={getElementById:id=>nodes[id],createElement:tag=>({tag,value:'',textContent:''})};
const window={};
let fetched=0;
vm.runInNewContext(readFileSync(new URL('../public/ubigeo-select.js',import.meta.url),'utf8'),
 {document,window,fetch:async()=>{fetched++;return {ok:true,json:async()=>served}}},
 {filename:'ubigeo-select.js',timeout:1000});
await new Promise(setImmediate);await new Promise(setImmediate);
assert.equal(fetched,1,'No conecta a servicios externos para pedir los datos');
assert.equal(dep.options.length,26,'El cliente ve todos los departamentos');
dep.value='15';dep.listeners.change();
assert.ok(prov.options.some(o=>o.value==='1501'),'Provincia Lima aparece bajo departamento Lima');
assert.equal(dist.disabled,true,'Distritos desactivados hasta escoger provincia');
prov.value='1501';prov.listeners.change();
assert.ok(dist.options.some(o=>o.value==='150103'),'Distrito Ate aparece bajo Lima');
dist.value='150103';
const chosen=window.hcGeoDelivery.getSelection();
assert.deepEqual([chosen.departmentCode,chosen.provinceCode,chosen.districtCode],['15','1501','150103']);
assert.match(chosen.district,/Ate, Lima, Lima/);
prov.value='1502';
assert.throws(()=>window.hcGeoDelivery.getSelection(),/Selecciona/,'No acepta selección de distrito de otra provincia');
const html=readFileSync(new URL('../public/checkout.html',import.meta.url),'utf8');
assert.match(html,/<input id="address"[^>]*required/,'La dirección detallada sigue siendo libre');
assert.match(html,/<input id="deliveryReference"[^>]*optional|<input id="deliveryReference"/,'La referencia queda editable');
assert.match(html,/<select id="provinceCode"[^>]*required/,'La provincia es un desplegable obligatorio');
assert.match(html,/<select id="districtCode"[^>]*required/,'El distrito es un desplegable obligatorio');
console.log('UBIGEO Perú: código real, listas dependientes, referencias y bloqueo de selecciones erróneas: OK.');
