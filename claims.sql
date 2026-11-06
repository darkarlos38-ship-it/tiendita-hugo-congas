-- Ejecutar una sola vez en D1 → hugo-congas-db → Console
CREATE TABLE IF NOT EXISTS claims (
 id TEXT PRIMARY KEY,
 number TEXT NOT NULL UNIQUE,
 created_at TEXT NOT NULL,
 details TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'Pendiente'
);
CREATE INDEX IF NOT EXISTS idx_claims_created ON claims(created_at DESC);
