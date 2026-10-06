import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createGoogleAuth, verifiedGoogleEmail } from '../lib/google-auth.js';
import { createApp } from '../server.js';
import { AppError } from '../lib/store.js';

const environment={SUPABASE_URL:'https://project.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_publishable_test',PUBLIC_APP_URL:'https://pos.example.com'};
const user={id:'auth-user',email:'cashier@example.com',email_confirmed_at:'2026-10-06T00:00:00Z',app_metadata:{providers:['google']},user_metadata:{role:'admin'},identities:[{provider:'google',identity_data:{email:'cashier@example.com',email_verified:true}}]};
const req=cookie=>({headers:{host:'pos.example.com',cookie}});

test('Google: access can stay disabled while callback URLs are configured',()=>{
  assert.equal(createGoogleAuth({...environment,GOOGLE_AUTH_ENABLED:'false'}),undefined);
});

test('Google: server trusts verified Google identity, never editable user metadata',()=>{
  assert.equal(verifiedGoogleEmail(user),'cashier@example.com');
  for(const bad of [{...user,app_metadata:{providers:['email']}},{...user,email_confirmed_at:null},{...user,identities:[{provider:'google',identity_data:{email:'other@example.com',email_verified:true}}]},{...user,identities:[{provider:'google',identity_data:{email:'cashier@example.com',email_verified:false}}]}])assert.throws(()=>verifiedGoogleEmail(bad),/verificar/);
});

test('Google: SDK PKCE cookie binds the browser and session tokens never enter storage',async()=>{
  let verifier,used=false,validated=false;
  const auth=createGoogleAuth(environment,{clientFactory:(url,key,options)=>createClient(url,key,{...options,global:{fetch:async(url,options)=>{
    if(String(url).includes('/token?')){
      const body=JSON.parse(options.body);assert.equal(body.code_verifier,verifier);assert.equal(body.auth_code,'one-time-code');
      if(used)return new Response(JSON.stringify({message:'already used',code:'invalid_grant'}),{status:400});
      used=true;return new Response(JSON.stringify({access_token:'test-access-token',refresh_token:'test-refresh-token',expires_in:3600,token_type:'bearer',user}),{status:200});
    }
    assert(String(url).endsWith('/user'));assert.equal(new Headers(options.headers).get('Authorization'),'Bearer test-access-token');validated=true;
    return new Response(JSON.stringify(user),{status:200});
  }}})});
  const start=await auth.start(req());const target=new URL(start.url);
  assert.equal(target.searchParams.get('provider'),'google');assert.equal(target.searchParams.get('code_challenge_method'),'s256');
  assert.match(start.cookie,/HttpOnly/);assert.match(start.cookie,/SameSite=Lax/);assert.match(start.cookie,/; Secure$/);
  const cookie=start.cookie.split(';')[0];const storage=JSON.parse(Buffer.from(cookie.slice(cookie.indexOf('=')+1),'base64url').toString());
  verifier=JSON.parse(storage['flamingo_google-code-verifier']);
  assert.equal(target.searchParams.get('code_challenge'),createHash('sha256').update(verifier).digest('base64url'));
  const redirect=new URL(target.searchParams.get('redirect_to'));assert.equal(redirect.origin,'https://pos.example.com');assert.equal(redirect.pathname,'/api/auth/google/callback');
  const callback=new URL(redirect);callback.searchParams.set('code','one-time-code');
  assert.equal(await auth.finish(req(cookie),callback),'cashier@example.com');assert.equal(validated,true);
  assert.equal(Object.keys(storage).some(k=>!k.endsWith('-code-verifier')),false);
  await assert.rejects(auth.finish(req(),callback),/venció/);
  await assert.rejects(auth.finish(req(cookie),callback),/venció/);
  await assert.rejects(auth.start({headers:{host:'attacker.example.com'}}),/dominio principal/);
});

test('Google: callback keeps POS role and clears PKCE on success or rejection',async()=>{
  let reject=false;
  const googleAuth={origin:'https://pos.example.com',clearCookie:()=> 'flamingo_google_pkce=; Max-Age=0',finish:async()=> 'cashier@example.com'};
  const store={loginGoogle:async({email})=>{assert.equal(email,'cashier@example.com');if(reject)throw new AppError('no access',403);return {token:'opaque-pos-session',user:{role:'cashier'}};}};
  const {handler}=createApp({store,secure:true,googleAuth});
  function response(){return {headers:{},setHeader(key,value){this.headers[key]=value;},writeHead(status,headers={}){this.status=status;Object.assign(this.headers,headers);},end(){}};}
  const response1=response();await handler({method:'GET',url:'/api/auth/google/callback?code=abc',headers:{}},response1);
  assert.equal(response1.status,303);assert.equal(response1.headers.Location,'https://pos.example.com/');
  assert.equal(response1.headers['Set-Cookie'].length,2);assert.match(response1.headers['Set-Cookie'][1],/flamingo_session=opaque-pos-session.*Secure/);
  reject=true;const response2=response();await handler({method:'GET',url:'/api/auth/google/callback?code=abc',headers:{}},response2);
  assert.equal(response2.status,303);assert.match(response2.headers.Location,/google_error=unauthorized/);assert.equal(response2.headers['Set-Cookie'],googleAuth.clearCookie());
});
