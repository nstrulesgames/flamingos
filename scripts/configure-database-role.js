import pg from 'pg';
import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { postgresConnectionOptions } from '../lib/postgres-db.js';
import { root, loadDatabaseEnvironment } from './database-config.js';

loadDatabaseEnvironment();
const target = resolve(root, '.env.runtime');
if (existsSync(target)) {
  console.log('Ya existe .env.runtime. Usa npm run db:check para verificar la conexión.');
  process.exit(0);
}
if (!process.env.DATABASE_URL) { console.error('Primero guarda DATABASE_URL en .env con la conexión de Supabase.'); process.exit(1); }
const pool = new pg.Pool(postgresConnectionOptions(process.env.DATABASE_URL));
const role = `flamingo_runtime_${randomBytes(6).toString('hex')}`;
const password = randomBytes(32).toString('base64url');
let client;
try {
  client = await pool.connect();
  await client.query('BEGIN');
  await client.query(`CREATE ROLE "${role}" LOGIN PASSWORD '${password}' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`);
  await client.query(`GRANT flamingo_app TO "${role}"`);
  const url = new URL(process.env.DATABASE_URL);
  const username = decodeURIComponent(url.username);
  const projectSuffix = username.includes('.') ? username.slice(username.indexOf('.')) : '';
  url.username = role + projectSuffix;
  url.password = password;
  await writeFile(target, `# Generated server credential. Do not share or commit.\nFLAMINGO_DATABASE_URL="${url}"\n`, { flag: 'wx', mode: 0o600 });
  await client.query('COMMIT');
  console.log('Credencial limitada creada y guardada en .env.runtime. Ejecuta npm run db:check.');
} catch (error) {
  if (client) await client.query('ROLLBACK').catch(() => {});
  console.error(`No se pudo completar la configuración (${error.code || 'conexión/configuración'}). Si se creó .env.runtime pero falló COMMIT, conserva el archivo y revisa el rol antes de reintentar.`);
  process.exitCode = 1;
} finally { client?.release(); await pool.end(); }
