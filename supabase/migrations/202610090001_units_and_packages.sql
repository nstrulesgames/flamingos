-- Flamingo schema 2: whole-unit stock restocked by full package.
-- The application applies the simplified client menu (bolos by type, escarchas by cup,
-- no pending recipes) on its next start between shifts, or right after the open shift's
-- arqueo is approved. Flavor stock of bolos is transferred with traceable movements.
-- Ejecutar completo en Supabase → SQL Editor. Es atómico: si algo falla, no cambia nada.
-- Se niega a correr si el esquema no está en la versión 1 (fuera de orden o ya aplicada).
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(704221, 1);
DO $guard$
BEGIN
  IF (SELECT value FROM flamingo.settings WHERE key='schema_version') IS DISTINCT FROM '1' THEN
    RAISE EXCEPTION 'Flamingo: esta migración (esquema 2) requiere el esquema 1. Revisa: SELECT value FROM flamingo.settings WHERE key=''schema_version'';';
  END IF;
END $guard$;
SET search_path TO flamingo, pg_catalog;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS pack_size INTEGER NOT NULL DEFAULT 1;
ALTER TABLE inventory DROP CONSTRAINT IF EXISTS valid_pack_size;
ALTER TABLE inventory ADD CONSTRAINT valid_pack_size CHECK (pack_size >= 1);
ALTER TABLE movements DROP CONSTRAINT IF EXISTS movement_kind;
ALTER TABLE movements ADD CONSTRAINT movement_kind CHECK (kind IN ('sale','void','restock','waste','count','transfer'));
UPDATE settings SET value='2' WHERE key='schema_version';
RESET search_path;
COMMIT;
