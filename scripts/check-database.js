import { createPostgresDatabase } from '../lib/postgres-db.js';
import { loadDatabaseEnvironment } from './database-config.js';
const url = loadDatabaseEnvironment();
if (!url) { console.error('Falta DATABASE_URL en .env. Copia la conexión Session pooler desde Supabase.'); process.exit(1); }
const db = createPostgresDatabase(url);
try {
  const result = await db.transaction(() => db.one(`SELECT
    current_user AS database_role,
    (SELECT value FROM settings WHERE key='schema_version') AS schema_version,
    (SELECT count(*) FROM products) AS products,
    (SELECT count(*) FROM inventory) AS inventory_items,
    (SELECT count(*) FROM users) AS users,
    (SELECT count(*) FROM sales) AS sales`), true);
  console.log(JSON.stringify({ connected: true, ...result }, null, 2));
} catch (error) {
  console.error(`No se pudo verificar PostgreSQL (${error.code || 'conexión/configuración'}). Revisa .env, la contraseña y las migraciones.`);
  process.exitCode = 1;
} finally { await db.close(); }
