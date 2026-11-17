// Selector de direcciones de entrega del Perú. Solo departamento/provincia/distrito
// usan listas oficiales de UBIGEO. Calle, número y referencia quedan de texto libre.
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const dep=$('departmentCode'),prov=$('provinceCode'),dist=$('districtCode'),status=$('geo-status');
 if(!dep||!prov||!dist||!status)return;
 let geo=null;
 const format=s=>String(s||'').toLocaleLowerCase('es-PE').replace(/(^|[\s-])\p{L}/gu,m=>m.toLocaleUpperCase('es-PE'));
 function reset(select,prompt,list=[]){
  select.replaceChildren();
  const placeholder=document.createElement('option');
  placeholder.value='';placeholder.textContent=prompt;select.append(placeholder);
  for(const [id,name] of list){
   const option=document.createElement('option');
   option.value=id;option.textContent=format(name);select.append(option);
  }
  select.value='';select.disabled=list.length===0;
 }
 function find(arr,id){return arr.find(row=>row[0]===id);}
 function refreshProvinces(){
  reset(dist,'Primero selecciona una provincia');
  if(!geo)return;
  reset(prov,'Selecciona tu provincia',geo.provinces.filter(row=>row[0].slice(0,2)===dep.value));
 }
 function refreshDistricts(){
  if(!geo)return;
  reset(dist,'Selecciona tu distrito',geo.districts.filter(row=>row[0].slice(0,4)===prov.value));
 }
 dep.addEventListener('change',refreshProvinces);
 prov.addEventListener('change',refreshDistricts);
 window.hcGeoDelivery={
  getSelection(){
   if(!geo)throw Error('No se pudo cargar la lista de localidades. Actualiza la página antes de pagar.');
   const d=dep.value,p=prov.value,t=dist.value;
   const department=find(geo.departments,d),province=find(geo.provinces,p),district=find(geo.districts,t);
   if(!department||!province||!district||p.slice(0,2)!==d||t.slice(0,4)!==p)
    throw Error('Selecciona departamento, provincia y distrito de las listas antes de pagar.');
   return {departmentCode:d,provinceCode:p,districtCode:t,
    district:[format(district[1]),format(province[1]),format(department[1])].join(', ')};
  }
 };
 reset(dep,'Cargando departamentos…');
 reset(prov,'Primero selecciona un departamento');
 reset(dist,'Primero selecciona una provincia');
 fetch('/api/geo/peru',{cache:'no-store',credentials:'same-origin'})
  .then(async r=>{if(!r.ok)throw Error('El listado de ubicaciones no está disponible.');
   const x=await r.json();
   if(!Array.isArray(x.departments)||!Array.isArray(x.provinces)||!Array.isArray(x.districts)
    ||x.departments.length<20||x.provinces.length<190||x.districts.length<1800)
    throw Error('La lista de localidades está incompleta.');
   return x;
  })
  .then(x=>{geo=x;reset(dep,'Selecciona tu departamento',geo.departments);
   status.textContent='Elige tu departamento, provincia y distrito. No necesitas escribir sus nombres.';})
  .catch(err=>{status.textContent=err.message+' No se habilitará el pago hasta corregirlo.';reset(dep,'Ubicaciones no disponibles');});
})();
