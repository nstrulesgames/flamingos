-- Schema 5: only products enabled by the owner accept an amount from the cashier.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(704221, 1);
DO $guard$
BEGIN
  IF (SELECT value FROM flamingo.settings WHERE key='schema_version') IS DISTINCT FROM '4' THEN
    RAISE EXCEPTION 'Flamingo: esta migración (esquema 5) requiere el esquema 4.';
  END IF;
END $guard$;
SET search_path TO flamingo, pg_catalog;
ALTER TABLE products ADD COLUMN allow_manual_price INTEGER NOT NULL DEFAULT 0 CHECK (allow_manual_price IN (0,1));
ALTER TABLE products ADD CONSTRAINT valid_manual_pricing CHECK (allow_manual_price=0 OR pricing_mode='unit');
ALTER TABLE sale_lines ADD COLUMN manual_price INTEGER NOT NULL DEFAULT 0 CHECK (manual_price IN (0,1));
ALTER TABLE sale_lines ADD CONSTRAINT valid_manual_price_line CHECK (manual_price=0 OR weight_grams IS NULL);
UPDATE products SET allow_manual_price=1,pricing_mode='unit' WHERE menu_key='helado-de-acai';
UPDATE settings SET value='5' WHERE key='schema_version';
RESET search_path;
COMMIT;
