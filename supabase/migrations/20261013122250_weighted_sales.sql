-- Additive schema 4: pricing is independent of inventory control.
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '30s';
SELECT pg_advisory_xact_lock(704221, 1);
DO $guard$
BEGIN
  IF (SELECT value FROM flamingo.settings WHERE key='schema_version') IS DISTINCT FROM '3' THEN
    RAISE EXCEPTION 'Flamingo: esta migración (esquema 4) requiere el esquema 3.';
  END IF;
END $guard$;
SET search_path TO flamingo, pg_catalog;
ALTER TABLE products ADD COLUMN pricing_mode TEXT NOT NULL DEFAULT 'unit' CHECK (pricing_mode IN ('unit','weight'));
ALTER TABLE products ADD COLUMN weight_basis_grams INTEGER NOT NULL DEFAULT 100 CHECK (weight_basis_grams IN (1,100,1000));
ALTER TABLE sale_lines ADD COLUMN weight_grams INTEGER;
ALTER TABLE sale_lines ADD COLUMN weight_price INTEGER;
ALTER TABLE sale_lines ADD COLUMN weight_basis_grams INTEGER;
ALTER TABLE sale_lines ADD CONSTRAINT valid_weighted_line CHECK (
  (weight_grams IS NULL AND weight_price IS NULL AND weight_basis_grams IS NULL)
  OR (weight_grams IS NOT NULL AND weight_price IS NOT NULL AND weight_basis_grams IS NOT NULL
    AND weight_grams BETWEEN 1 AND 100000 AND weight_price > 0 AND weight_basis_grams IN (1,100,1000)
    AND price = round(weight_price::numeric * weight_grams / weight_basis_grams))
);
UPDATE settings SET value='4' WHERE key='schema_version';
RESET search_path;
COMMIT;
