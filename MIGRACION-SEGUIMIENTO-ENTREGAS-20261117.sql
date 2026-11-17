-- Seguimiento de envios (separado de pagos y stock).
-- Ejecutar UNA VEZ en Cloudflare D1 / hugo-congas-db antes de desplegar el codigo.
-- No modifica izipay_live_orders, IPN, inventario ni las tablas anteriores.
CREATE TABLE IF NOT EXISTS hc_order_tracking_v2 (
  order_id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'ACCEPTED'
    CHECK (status IN ('ACCEPTED','PACKING','SHIPPED','AGENCY_ARRIVED','DELIVERED')),
  shipping_mode TEXT NOT NULL DEFAULT 'LOCAL'
    CHECK (shipping_mode IN ('LOCAL','PROVINCE')),
  carrier TEXT NOT NULL DEFAULT '',
  tracking_number TEXT NOT NULL DEFAULT '',
  tracking_url TEXT NOT NULL DEFAULT '',
  agency TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  delivered_at TEXT,
  customer_confirmed_at TEXT
);
CREATE TABLE IF NOT EXISTS hc_order_tracking_events_v2 (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL,
  actor TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS hc_order_tracking_events_order_v2
 ON hc_order_tracking_events_v2(order_id,created_at);
CREATE TABLE IF NOT EXISTS hc_delivery_evidence_v2 (
  order_id TEXT PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('DELIVERY_PHOTO','CARRIER_PROOF')),
  uploaded_at TEXT NOT NULL,
  sha256 TEXT NOT NULL
);
