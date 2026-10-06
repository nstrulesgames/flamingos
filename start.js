import { resolve } from 'node:path';
import { createApp } from './server.js';
import { assert } from './lib/store.js';
import { createPostgresStore } from './lib/postgres-store.js';
import { createGoogleAuth } from './lib/google-auth.js';
import { loadDatabaseEnvironment, root } from './scripts/database-config.js';

const connectionString = loadDatabaseEnvironment();
const demo = process.argv.includes('--demo');
const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
assert(!(!demo && process.env.DATABASE_BACKEND === 'postgres' && !connectionString), 'Falta DATABASE_URL para conectar PostgreSQL.', 503);
const suppliedStore = !demo && connectionString ? await createPostgresStore(connectionString) : undefined;
const { server, store } = createApp({ demo, store: suppliedStore, database: process.env.DATABASE_PATH || resolve(root, 'data', demo ? 'demo.sqlite' : 'flamingo.sqlite'), secure: process.env.COOKIE_SECURE === 'true', googleAuth: suppliedStore ? createGoogleAuth() : undefined });
server.listen(port, host, () => console.log(`Flamingo's POS: http://${host}:${port} ${demo ? '[DEMOSTRACIÓN SQLITE]' : suppliedStore ? '[SUPABASE / POSTGRESQL]' : '[SQLITE]'}`));
for (const signal of ['SIGINT', 'SIGTERM'])
    process.on(signal, () => server.close(async () => { await store.close(); process.exit(0); }));
