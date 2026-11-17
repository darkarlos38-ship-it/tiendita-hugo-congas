import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import worker from '../worker.js';

// Pruebas locales sin tarjetas, sin llamadas a Izipay y sin escribir en D1.
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const realNow = Date.now;
let simulatedNow = Date.parse('2026-11-17T20:00:00Z');
Date.now = () => simulatedNow;
const token = 'd'.repeat(64);
const tokenHash = createHash('sha256').update(token).digest('hex');
let gate = 1, previousPilot = null, verifiedPriorIPN = false;
const paymentOrderId='HC-LIVE-40d23809-d578-467c-b6e3-d56c19150859';
let paymentOrderState='PAID';
let prior = { id:'HC-LIVE-OLD',status:'AWAITING_PAYMENT',paid_at:null,created_at:'2026-11-17T19:30:00.000Z' };
const db = {
  prepare(sql) {
    let params = [];
    const statement = {
      bind(...v) { params = v; return statement; },
      async run() { return { meta: { changes: 0 } }; },
      async first() {
        if (sql.includes('SELECT enabled FROM hc_live_payment_gate')) return { enabled: gate };
        if (sql.includes('SELECT id,status FROM izipay_live_orders WHERE id=?')) return params[0] === paymentOrderId ? {id:paymentOrderId,status:paymentOrderState} : null;
        if (sql.includes('SELECT expires FROM sessions')) return params[0] === tokenHash ? { expires: simulatedNow + 3600000 } : null;
        if (sql.includes('SELECT id,status,paid_at,created_at FROM izipay_live_orders')) return prior;
        if (sql.includes('SELECT 1 FROM izipay_live_webhook_events')) return verifiedPriorIPN ? { found:1 } : null;
        if (sql.includes("json_extract(buyer_json,'$.idempotencyKey')")) return previousPilot;
        if (sql.includes("name='hc_live_checkout_idempotency_v1'")) return { name: 'hc_live_checkout_idempotency_v1' };
        if (sql.includes("SELECT value FROM appdata")) return { value: JSON.stringify({ products: [{ id: 1234, title: 'Instrumento de ensayo', price: 11, stock: 1 }] }) };
        if (sql.includes('SELECT stock_on_hand,reserved_units FROM hc_inventory_stock_v1')) return { stock_on_hand: 1, reserved_units: 0 };
        throw new Error('Consulta D1 no simulada: ' + sql.slice(0, 80));
      }
    };
    return statement;
  }
};
const environment = {
  DB: db,
  IZIPAY_PROD_USER: 'fake',
  IZIPAY_PROD_PASSWORD: 'fake',
  IZIPAY_PROD_PUBLIC_KEY: 'fake',
  IZIPAY_ADMIN_LIVE_TEST_APPROVED: 'ALLOW_SINGLE_ADMIN_LIVE_PAYMENT_20261111',
  ASSETS: { fetch() { throw new Error('No debe servir activos'); } }
};
const adminHeaders = { Cookie: 'hc_admin=' + token };
async function call(path, { method = 'GET', headers = {}, body, env = environment } = {}) {
  const request = new Request('https://www.tienditamusicalhugocongas.com' + path, { method, headers, body });
  const response = await worker.fetch(request, env);
  const raw = await response.text();
  let data; try { data = JSON.parse(raw); } catch { data = raw; }
  return { status: response.status, data };
}
let count = 0;
function verify(condition, description) { assert.ok(condition, description); count++; console.log('OK', description); }
try {
  let r = await call('/api/izipay/config', { headers: adminHeaders });
  verify(r.data.production === true, 'El piloto autorizado permite solo al admin');
  r = await call('/api/izipay/config');
  verify(r.data.production === false, 'El cliente anónimo no ve producción');
  r = await call('/api/izipay/config', { headers: adminHeaders, env: { ...environment, IZIPAY_ADMIN_LIVE_TEST_APPROVED: '' } });
  verify(r.data.production === false, 'Sin autorización Cloudflare el checkout queda bloqueado');
  gate = 0; r = await call('/api/izipay/config', { headers: adminHeaders });
  verify(r.data.production === false, 'Sin gate D1 queda bloqueado'); gate = 1;
  previousPilot = { id: 'HC-LIVE-EXISTING' };
  r = await call('/api/izipay/config', { headers: adminHeaders });
  verify(r.data.production === false, 'Un piloto previo impide otro'); previousPilot = null;
  prior.status='PAID';
  r = await call('/api/izipay/config',{headers:adminHeaders});
  verify(r.data.production===false,'No habilitar segundo intento si el anterior figura pagado');
  prior.status='AWAITING_PAYMENT';
  verifiedPriorIPN=true;
  r=await call('/api/izipay/config',{headers:adminHeaders});
  verify(r.data.production===false,'No habilitar segundo intento si llegó una IPN verificada');
  verifiedPriorIPN=false;
  prior.created_at='2026-11-17T19:59:00.000Z';
  r=await call('/api/izipay/config',{headers:adminHeaders});
  verify(r.data.production===false,'No habilitar segundo intento antes del vencimiento de 20 minutos');
  prior.created_at='2026-11-17T19:30:00.000Z';
  simulatedNow = Date.parse('2026-11-18T05:01:00Z');
  r = await call('/api/izipay/config', { headers: adminHeaders });
  verify(r.data.production === false, 'El permiso vence al finalizar el 17 de noviembre en Lima');
  simulatedNow = Date.parse('2026-11-17T20:00:00Z');
  r = await call('/api/izipay/checkout-live', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  verify(r.status === 503, 'No se inicia un cobro sin la autorización administrativa');
  const payload = { items: [{ id: '1234', qty: 1 }], name: 'Comprador de prueba', email: 'example@example.com', phone: '999999999', address: 'Dirección de ensayo 123', district: 'Lima', dni: '12345678', idempotencyKey: 'abcdef1234567890' };
  r = await call('/api/izipay/checkout-live', { method: 'POST', headers: { ...adminHeaders, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  verify(r.status === 409 && r.data.mode === 'test_only', 'Se rechaza un pago mayor a S/ 10 antes de llamar a Izipay');
  r = await call('/api/izipay/production/ipn', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ 'kr-answer': JSON.stringify({ orderStatus: 'PAID' }), 'kr-hash': 'a'.repeat(64) }).toString() });
  verify(r.status === 403, 'No se acepta una IPN con firma inválida');

  // Estado de pago de solo lectura: no reintenta pagos ni divulga datos del cliente.
  const statusRequest = id => call('/api/izipay/order-status-live',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:id})
  });
  r=await statusRequest(paymentOrderId);
  verify(r.status===200&&r.data.status==='PAID'&&r.data.orderId===paymentOrderId,'El checkout detecta el pedido pagado');
  verify(Object.keys(r.data).sort().join(',')==='orderId,status','La respuesta no contiene datos personales ni de tarjeta');
  paymentOrderState='AWAITING_PAYMENT';
  r=await statusRequest(paymentOrderId);
  verify(r.status===200&&r.data.status==='PENDING','Una orden sin IPN no aparece pagada');
  paymentOrderState='REVIEW_REQUIRED';
  r=await statusRequest(paymentOrderId);
  verify(r.status===200&&r.data.status==='REVIEW_REQUIRED','Los pagos anómalos requieren revisión');
  r=await statusRequest('HC-LIVE-INVALID');
  verify(r.status===400,'Identificador inválido bloqueado');
  r=await statusRequest('HC-LIVE-12345678-1234-1234-1234-123456789012');
  verify(r.status===404,'Un pedido inexistente no se confirma');
  r=await call('/api/izipay/order-status-live',{
    method:'POST',headers:{Origin:'https://sitio-externo.test','Content-Type':'application/json'},
    body:JSON.stringify({orderId:paymentOrderId})
  });
  verify(r.status===403,'El endpoint rechaza una solicitud desde otro origen');
    console.log('Superadas', count, 'pruebas. No hubo cobros ni escrituras en D1.');
} finally {
  Date.now = realNow;
}
