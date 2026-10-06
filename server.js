import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname } from 'node:path';
import { createStore, AppError, assert } from './lib/store.js';
import { createPostgresStore } from './lib/postgres-store.js';
import { existsSync } from 'node:fs';
const root = fileURLToPath(new URL('.', import.meta.url));
export function createApp({ database = resolve(root, 'data/flamingo.sqlite'), demo = false, secure = false, catalog = 'client', store: providedStore } = {}) {
    const store = providedStore ?? createStore(database, { demo, catalog });
    const attempts = new Map();
    const server = http.createServer(async (req, res) => {
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Referrer-Policy', 'same-origin');
        res.setHeader('X-Frame-Options', 'DENY');
        res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
        const json = (value, status = 200) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(value)); };
        try {
            const url = new URL(req.url, 'http://localhost');
            if (!url.pathname.startsWith('/api/')) {
                assert(req.method === 'GET' || req.method === 'HEAD', 'Método no permitido.', 405);
                const files = { '/': 'index.html', '/app.js': 'app.js', '/catalog.js': 'catalog.js', '/reconciliation.js': 'reconciliation.js', '/style.css': 'style.css', '/reconciliation.css': 'reconciliation.css', '/glass.css': 'glass.css', '/mobile.css': 'mobile.css', '/menu-art.svg': 'menu-art.svg', '/art.svg': 'art.svg', '/logo.png': 'logo.png', '/manifest.webmanifest': 'manifest.webmanifest', '/icon.svg': 'icon.svg' };
                const file = files[url.pathname];
                assert(file, 'Archivo no encontrado.', 404);
                const content = await readFile(resolve(root, 'public', file));
                const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
                res.writeHead(200, { 'Content-Type': mime[extname(file)], 'Cache-Control': 'no-cache' });
                res.end(req.method === 'HEAD' ? undefined : content);
                return;
            }
            const unsafe = !['GET', 'HEAD'].includes(req.method);
            if (unsafe) {
                assert(req.headers['x-flamingo-request'] === '1', 'Petición inválida.', 403);
                if (req.headers.origin)
                    assert(new URL(req.headers.origin).host === req.headers.host, 'Origen no permitido.', 403);
                assert(req.headers['content-type']?.startsWith('application/json'), 'Se requiere JSON.', 415);
            }
            let body = {};
            if (unsafe) {
                let raw = '';
                for await (const chunk of req) {
                    raw += chunk;
                    assert(Buffer.byteLength(raw) <= 65536, 'Petición demasiado grande.', 413);
                }
                try {
                    body = JSON.parse(raw || '{}');
                }
                catch {
                    throw new AppError('JSON inválido.');
                }
                assert(body && typeof body === 'object' && !Array.isArray(body), 'Cuerpo inválido.');
            }
            const route = `${req.method} ${url.pathname}`;
            const token = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith('flamingo_session='))?.slice(17);
            if (route === 'GET /api/status')
                return json({ setup: await store.isSetup(), demo, database: store.backend || 'sqlite' });
            if (route === 'POST /api/setup') {
                // Bootstrap is local-only; create the owner before exposing the service.
                assert(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress), 'Configura el propietario desde el servidor local.', 403);
                await store.setup(body);
                return json({ ok: true }, 201);
            }
            if (route === 'POST /api/login') {
                const ip = req.socket.remoteAddress, now = Date.now();
                if (attempts.size > 10000)
                    for (const [key, value] of attempts)
                        if (value.until < now)
                            attempts.delete(key);
                let entry = attempts.get(ip);
                if (!entry || entry.until < now)
                    entry = { count: 0, until: now + 15 * 60 * 1000 };
                assert(entry.count < 15, 'Demasiados intentos. Espera 15 minutos.', 429);
                entry.count++;
                attempts.set(ip, entry);
                const result = await store.login(body);
                attempts.delete(ip);
                res.setHeader('Set-Cookie', `flamingo_session=${result.token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${secure ? '; Secure' : ''}`);
                return json({ user: result.user });
            }
            const user = await store.authenticate(token);
            assert(user, 'Inicia sesión para continuar.', 401);
            if (route === 'POST /api/logout') {
                await store.logout(token);
                res.setHeader('Set-Cookie', 'flamingo_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0');
                return json({ ok: true });
            }
            if (route === 'GET /api/state')
                return json(await store.snapshot(user));
            if (route === 'POST /api/shifts/open')
                return json(await store.openShift(user, body), 201);
            if (route === 'POST /api/shifts/close')
                return json(await store.closeShift(user, body));
            if (route === 'POST /api/shifts/count/start')
                return json(await store.startCount(user, body));
            if (route === 'POST /api/shifts/count/submit')
                return json(await store.submitCount(user, body), 201);
            if (route === 'POST /api/shifts/count/recount')
                return json(await store.requestRecount(user, body));
            if (route === 'POST /api/shifts/count/approve')
                return json(await store.approveCount(user, body));
            if (route === 'POST /api/sales')
                return json(await store.sale(user, body), 201);
            if (route === 'POST /api/movements')
                return json(await store.stockMovement(user, body), 201);
            if (route === 'POST /api/inventory')
                return json(await store.addInventory(user, body), 201);
            if (route === 'POST /api/products')
                return json(await store.saveProduct(user, body), 201);
            if (route === 'POST /api/users')
                return json(await store.createUser(user, body), 201);
            if (route === 'GET /api/report')
                return json(await store.report(user, url.searchParams.get('from') || '', url.searchParams.get('to') || ''));
            let match = url.pathname.match(/^\/api\/sales\/(\d+)(\/void)?$/);
            if (match && req.method === 'GET' && !match[2])
                return json(await store.receipt(user, Number(match[1])));
            if (match && req.method === 'POST' && match[2])
                return json(await store.voidSale(user, Number(match[1]), body));
            match = url.pathname.match(/^\/api\/shifts\/(\d+)$/);
            if (match && req.method === 'GET')
                return json(await store.shiftDetail(user, Number(match[1])));
            match = url.pathname.match(/^\/api\/users\/(\d+)$/);
            if (match && req.method === 'PATCH')
                return json(await store.updateUser(user, Number(match[1]), body));
            throw new AppError('Ruta no encontrada.', 404);
        }
        catch (error) {
            if (!(error instanceof AppError))
                console.error(error);
            if (!res.headersSent)
                json({ error: error instanceof AppError ? error.message : 'Ocurrió un error interno. Intenta nuevamente.' }, error.status || 500);
            else
                res.end();
        }
    });
    return { server, store };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    if (existsSync(resolve(root, '.env')))
        process.loadEnvFile(resolve(root, '.env'));
    if (existsSync(resolve(root, '.env.runtime')))
        process.loadEnvFile(resolve(root, '.env.runtime'));
    const demo = process.argv.includes('--demo');
    const port = Number(process.env.PORT || 3000), host = process.env.HOST || '127.0.0.1';
    const connectionString = process.env.FLAMINGO_DATABASE_URL || process.env.DATABASE_URL;
    assert(!(!demo && process.env.DATABASE_BACKEND === 'postgres' && !connectionString), 'Falta DATABASE_URL para conectar PostgreSQL.', 503);
    const suppliedStore = !demo && connectionString ? await createPostgresStore(connectionString) : undefined;
    const { server, store } = createApp({ demo, store: suppliedStore, database: process.env.DATABASE_PATH || resolve(root, 'data', demo ? 'demo.sqlite' : 'flamingo.sqlite'), secure: process.env.COOKIE_SECURE === 'true' });
    server.listen(port, host, () => console.log(`Flamingo's POS: http://${host}:${port} ${demo ? '[DEMOSTRACIÓN SQLITE]' : suppliedStore ? '[SUPABASE / POSTGRESQL]' : '[SQLITE]'}`));
    for (const signal of ['SIGINT', 'SIGTERM'])
        process.on(signal, () => server.close(async () => { await store.close(); process.exit(0); }));
}
