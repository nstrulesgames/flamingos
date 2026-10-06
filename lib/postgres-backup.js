export const backupTables = [
  'settings', 'users', 'inventory', 'products', 'recipes', 'shifts', 'sales',
  'sale_lines', 'movements', 'counts', 'shift_stock', 'audit', 'reconciliations',
  'reconciliation_items', 'declarations', 'declaration_items', 'recount_requests',
];

// Stable snapshot across every table. Sessions are intentionally not restorable.
export async function exportPostgresBackup(database) {
  return database.transaction(async () => {
    const tables = {};
    for (const name of backupTables) tables[name] = await database.all(`SELECT * FROM ${name}`);
    return { format: 'flamingo-postgres-data-v1', createdAt: new Date().toISOString(), schemaVersion: '1', tables };
  }, true);
}
