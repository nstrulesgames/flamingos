export const backupTables = [
  'settings', 'users', 'inventory', 'products', 'recipes', 'shifts', 'sales',
  'sale_lines', 'movements', 'counts', 'shift_stock', 'audit', 'reconciliations',
  'reconciliation_items', 'declarations', 'declaration_items', 'recount_requests',
  'customers', 'credit_movements',
];

// Stable snapshot across every table. Sessions are intentionally not restorable.
export async function exportPostgresBackup(database) {
  return database.transaction(async () => {
    const tables = {};
    const version = await database.one("SELECT value FROM settings WHERE key='schema_version'");
    for (const name of backupTables) {
      // Back up before upgrading too: customer tables do not exist under schema 1/2.
      if (await database.one('SELECT to_regclass(?) AS relation', `flamingo.${name}`).then(row=>row.relation)) tables[name] = await database.all(`SELECT * FROM ${name}`);
    }
    return { format: 'flamingo-postgres-data-v1', createdAt: new Date().toISOString(), schemaVersion: version.value, tables };
  }, true);
}
