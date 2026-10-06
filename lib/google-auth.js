import { createClient } from '@supabase/supabase-js';
import { AppError, assert, loginIdentifier } from './store.js';

const storageKey = 'flamingo_google';
const cookieName = 'flamingo_google_pkce';
const cookiePath = '/api/auth/google';

export function verifiedGoogleEmail(user) {
  assert(user?.id && user.email_confirmed_at && user.app_metadata?.providers?.includes('google'), 'Google no pudo verificar tu cuenta.', 403);
  const identity = user.identities?.find(item => item.provider === 'google' && item.identity_data?.email_verified === true
    && item.identity_data.email?.toLowerCase() === user.email?.toLowerCase());
  assert(identity, 'Google no pudo verificar tu correo.', 403);
  const email = loginIdentifier(identity.identity_data.email);
  assert(email.includes('@'), 'Google no pudo verificar tu correo.', 403);
  return email;
}

export function createGoogleAuth(environment = process.env, { clientFactory = createClient } = {}) {
  if (environment.GOOGLE_AUTH_ENABLED === 'false') return undefined;
  if (!environment.SUPABASE_URL || !environment.SUPABASE_PUBLISHABLE_KEY || !environment.PUBLIC_APP_URL) return undefined;
  const supabaseUrl = new URL(environment.SUPABASE_URL);
  const appUrl = new URL(environment.PUBLIC_APP_URL);
  assert(supabaseUrl.protocol === 'https:', 'SUPABASE_URL debe usar HTTPS.', 503);
  assert(appUrl.protocol === 'https:' || (appUrl.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(appUrl.hostname)), 'PUBLIC_APP_URL debe usar HTTPS.', 503);
  assert(appUrl.pathname === '/' && !appUrl.search && !appUrl.hash && !appUrl.username && !appUrl.password, 'PUBLIC_APP_URL debe ser el origen de la aplicación.', 503);
  const secure = appUrl.protocol === 'https:';
  const callback = `${appUrl.origin}/api/auth/google/callback`;
  const cookie = (value, maxAge) => `${cookieName}=${value}; Path=${cookiePath}; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

  function client(req) {
    let data = {};
    const encoded = req.headers.cookie?.split(';').map(s => s.trim()).find(s => s.startsWith(`${cookieName}=`))?.slice(cookieName.length + 1);
    if (encoded && encoded.length < 4000) {
      try {
        const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = Object.fromEntries(Object.entries(parsed)
          .filter(([key, value]) => key.startsWith(`${storageKey}-`) && key.endsWith('-code-verifier') && typeof value === 'string' && value.length < 2000));
      } catch { /* Missing/invalid verifier fails at the callback. */ }
    }
    const storage = {
      getItem: key => data[key] ?? null,
      setItem: (key, value) => { if (key.startsWith(`${storageKey}-`) && key.endsWith('-code-verifier')) data[key] = value; },
      removeItem: key => { delete data[key]; },
    };
    const instance = clientFactory(supabaseUrl.origin, environment.SUPABASE_PUBLISHABLE_KEY, {
      auth: { flowType: 'pkce', storageKey, storage, persistSession: true, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (url, options = {}) => fetch(url, { ...options, signal: AbortSignal.timeout(15000) }) },
    });
    return { instance, data };
  }

  return {
    origin: appUrl.origin,
    clearCookie: () => cookie('', 0),
    async start(req) {
      assert(req.headers.host === appUrl.host, 'Abre el dominio principal del negocio para entrar con Google.', 403);
      const { instance, data } = client(req);
      const result = await instance.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } } });
      assert(!result.error && result.data?.url, 'No se pudo iniciar Google. Revisa el proveedor en Supabase.', 503);
      const target = new URL(result.data.url);
      assert(target.origin === supabaseUrl.origin && target.pathname === '/auth/v1/authorize', 'Respuesta de autenticación inválida.', 503);
      const encoded = Buffer.from(JSON.stringify(data)).toString('base64url');
      assert(encoded.length < 3800 && Object.keys(data).length > 0, 'No se pudo preparar el acceso con Google.', 503);
      return { url: target.toString(), cookie: cookie(encoded, 600) };
    },
    async finish(req, url) {
      assert(req.headers.host === appUrl.host, 'Retorno de Google no permitido.', 403);
      assert(!url.searchParams.has('error'), 'El acceso con Google fue cancelado o rechazado.', 401);
      const code = url.searchParams.get('code');
      assert(code && code.length <= 2048, 'Google no devolvió un código de acceso válido.', 400);
      const { instance, data } = client(req);
      assert(Object.keys(data).some(key => key !== `${storageKey}-flows-code-verifier`), 'El acceso con Google venció. Vuelve a intentarlo.', 401);
      const flowId = url.searchParams.get('sb_flow_id');
      const result = await instance.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
      if (result.error || !result.data?.session?.access_token) throw new AppError('El acceso con Google venció. Vuelve a intentarlo.', 401);
      // getUser validates against Supabase Auth; no role comes from user_metadata.
      const verified = await instance.auth.getUser(result.data.session.access_token);
      assert(!verified.error, 'Google no pudo verificar tu cuenta.', 401);
      return verifiedGoogleEmail(verified.data.user);
    },
  };
}
