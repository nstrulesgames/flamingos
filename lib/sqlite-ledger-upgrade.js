// SQLite cannot drop a CHECK constraint. Rebuild only this table, atomically,
// keeping IDs, related ledgers and every foreign key pointing to customers.
export function upgradeCustomerLedger(db) {
  const definition=db.prepare("SELECT sql FROM sqlite_master WHERE name='customers'").get()?.sql||'';
  if(!/CHECK\s*\(\s*balance\s*>=\s*0\s*\)/i.test(definition))return;
  db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE');
  try {
    db.exec(`CREATE TABLE customers_upgrade(id INTEGER PRIMARY KEY,name TEXT NOT NULL,phone TEXT NOT NULL DEFAULT '',balance INTEGER NOT NULL DEFAULT 0,active INTEGER NOT NULL DEFAULT 1,created_by INTEGER NOT NULL REFERENCES users(id),created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
      INSERT INTO customers_upgrade SELECT id,name,phone,balance,active,created_by,created_at FROM customers;
      DROP TABLE customers; ALTER TABLE customers_upgrade RENAME TO customers;
      CREATE UNIQUE INDEX customers_name_idx ON customers(lower(name));`);
    if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('No se pudo verificar la migración de clientes.');
    db.exec('COMMIT');
  } catch(error) {db.exec('ROLLBACK');throw error;}
  finally {db.exec('PRAGMA foreign_keys=ON');}
}
