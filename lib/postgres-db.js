import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { AppError } from './store.js';
import { readFileSync } from 'node:fs';

// All queries for an operation use the same connection and transaction.
// A single physical register serializes mutations across server instances.
export function postgresConnectionOptions(connectionString) {
  let verifiedUrl;
  try {
    verifiedUrl = new URL(connectionString);
    if (!['postgres:', 'postgresql:'].includes(verifiedUrl.protocol)) throw new Error();
    // pg otherwise lets URL SSL options override certificate verification.
    for (const key of ['ssl', 'sslmode', 'sslcert', 'sslkey', 'sslrootcert']) verifiedUrl.searchParams.delete(key);
  } catch { throw new AppError('DATABASE_URL debe contener una conexión PostgreSQL válida.', 503); }
  const isSupabase = /^db\.[a-z0-9]+\.supabase\.co$/.test(verifiedUrl.hostname) || verifiedUrl.hostname.endsWith('.pooler.supabase.com');
  // A literal URL also lets serverless file tracing include the public CA.
  const ca = process.env.DATABASE_SSL_CA ? readFileSync(process.env.DATABASE_SSL_CA, 'utf8')
    : isSupabase ? readFileSync(new URL('../certs/supabase-ca.crt', import.meta.url), 'utf8') : undefined;
  return {
    connectionString: verifiedUrl.toString(),
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    ssl: { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    application_name: 'flamingo-pos',
  };
}

export function createPostgresDatabase(connectionString, suppliedPool) {
  const pool = suppliedPool ?? new pg.Pool(postgresConnectionOptions(connectionString));
  const context = new AsyncLocalStorage();
  if (!suppliedPool) pool.on('error', () => console.error('Se perdió una conexión inactiva de PostgreSQL.'));

  function translate(sql) {
    // Domain SQL has positional parameters and no question marks in literals.
    let index = 0;
    return sql.replaceAll("strftime('%Y-%m-%dT%H:%M:%fZ','now')", 'CURRENT_TIMESTAMP')
      .replaceAll("strftime('%H',created_at,'-4 hours')", "to_char(created_at AT TIME ZONE 'America/La_Paz','HH24')")
      .replaceAll('?', () => `$${++index}`);
  }
  function normalize(row, fields) {
    return Object.fromEntries(Object.entries(row).map(([key, value]) => {
      if (value instanceof Date) return [key, value.toISOString()];
      // COUNT/SUM and session expiry use bigint. Never silently lose precision.
      if (fields?.find(f => f.name === key)?.dataTypeID === 20 && value !== null) {
        const numeric = Number(value);
        if (!Number.isSafeInteger(numeric)) throw new Error('PostgreSQL devolvió un entero fuera de rango.');
        return [key, numeric];
      }
      return [key, value];
    }));
  }
  async function query(sql, args = []) {
    const client = context.getStore();
    if (!client) throw new Error('Consulta fuera de una transacción.');
    const result = await client.query(translate(sql), args);
    return { ...result, rows: result.rows.map(row => normalize(row, result.fields)) };
  }
  const all = async (sql, ...args) => (await query(sql, args)).rows;
  const one = async (sql, ...args) => (await all(sql, ...args))[0];
  async function run(sql, ...args) {
    const result = await query(sql, args);
    return { changes: result.rowCount, lastInsertRowid: result.rows[0]?.id };
  }
  async function transaction(fn, readOnly = false) {
    if (context.getStore()) return fn();
    const client = await pool.connect();
    let connectionError;
    try {
      await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
      await client.query("SELECT set_config('search_path','flamingo,pg_catalog',true), set_config('statement_timeout','15000ms',true), set_config('lock_timeout','10000ms',true)");
      if (!readOnly) await client.query('SELECT pg_advisory_xact_lock(704221, 1)');
      const value = await context.run(client, fn);
      await client.query('COMMIT');
      return value;
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch (rollbackError) { connectionError = rollbackError; }
      if (error.code === '23505') throw new AppError('El registro ya existe o la operación ya fue procesada. Actualiza la pantalla.', 409);
      if (['55P03', '57014', '40001', '40P01'].includes(error.code)) throw new AppError('La caja está ocupada. Espera un momento y vuelve a intentar.', 409);
      throw error;
    } finally { client.release(connectionError); }
  }
  return { one, all, run, transaction, close: () => pool.end() };
}
