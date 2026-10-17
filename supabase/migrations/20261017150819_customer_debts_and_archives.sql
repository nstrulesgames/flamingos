-- Schema 6: signed customer ledger, explicit fiado and append-only corrections.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='30s';
SELECT pg_advisory_xact_lock(704221,1);
DO $guard$ BEGIN
  IF (SELECT value FROM flamingo.settings WHERE key='schema_version') IS DISTINCT FROM '5' THEN
    RAISE EXCEPTION 'Flamingo: esta migración (esquema 6) requiere el esquema 5.';
  END IF;
END $guard$;
SET search_path TO flamingo,pg_catalog;
ALTER TABLE customers DROP CONSTRAINT customers_balance_check;
ALTER TABLE customers ADD COLUMN allow_fiado INTEGER NOT NULL DEFAULT 0 CHECK(allow_fiado IN (0,1));
ALTER TABLE customers ADD COLUMN credit_limit INTEGER NOT NULL DEFAULT 0 CHECK(credit_limit BETWEEN 0 AND 10000000);
ALTER TABLE customers ADD COLUMN debt_since TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN can_fiado INTEGER NOT NULL DEFAULT 0 CHECK(can_fiado IN (0,1));
ALTER TABLE sales ADD COLUMN debt INTEGER NOT NULL DEFAULT 0 CHECK(debt>=0);
ALTER TABLE sales DROP CONSTRAINT balanced_payment;
ALTER TABLE sales ADD CONSTRAINT balanced_payment CHECK(total>0 AND cash>=0 AND qr>=0 AND card>=0 AND cash+qr+card+credit+debt=total AND tendered>=cash AND change_due=tendered-cash AND change_credit<=change_due AND (credit=0 AND change_credit=0 AND debt=0 OR customer_id IS NOT NULL) AND (debt=0 OR change_credit=0));
ALTER TABLE credit_movements DROP CONSTRAINT credit_movements_kind_check;
ALTER TABLE credit_movements ADD CONSTRAINT credit_movements_kind_check CHECK(kind IN ('deposit','change','sale','void','refund','adjust','debt','payment','opening_debt','reversal'));
ALTER TABLE credit_movements ADD COLUMN reversal_of INTEGER REFERENCES credit_movements(id);
ALTER TABLE credit_movements ADD COLUMN debt_part INTEGER NOT NULL DEFAULT 0 CHECK(debt_part>=0);
CREATE UNIQUE INDEX credit_movements_reversal_idx ON credit_movements(reversal_of) WHERE reversal_of IS NOT NULL;
UPDATE settings SET value='6' WHERE key='schema_version';
RESET search_path;
COMMIT;
