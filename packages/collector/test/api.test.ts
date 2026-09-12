import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ApiClient, type Fetch } from '../src/api.js';
import { CredentialStore, serviceOrigin } from '../src/storage.js';
const origin='https://micro.example.test';const root=await mkdtemp(join(tmpdir(),'micro-auth-test-'));after(()=>rm(root,{recursive:true,force:true}));
const device={device_code:'PRIVATE_DEVICE',user_code:'ABCD-EFGH',verification_uri:`${origin}/device`,expires_in:60,interval:1};
function response(data:unknown,status=200){return Response.json(data,{status});}
test('device flow respects pending/slow-down, stores bearer privately, and never displays it',async()=>{
 const dir=join(root,'login');const store=new CredentialStore(dir);let now=Date.now(),polls=0;const sleeps:number[]=[];const displayed:unknown[]=[];let bearer='';
 const api=new ApiClient(origin,store,(async(url,init)=>{
  if(String(url).endsWith('/device/code'))return response(device);
  if(String(url).endsWith('/device/token')){polls++;return polls===1?response({error:'authorization_pending'},400):polls===2?response({error:'slow_down'},400):response({access_token:'PRIVATE_BEARER',expires_in:3600});}
  bearer=new Headers(init?.headers).get('Authorization')??'';return response({user:{id:'u'}});
 }) as Fetch);
 const result=await api.login(code=>displayed.push(code),{now:()=>now,sleep:async ms=>{sleeps.push(ms);now+=ms;}});
 assert.equal(result.authenticated,true);assert.deepEqual(sleeps,[1000,1000,6000]);assert.equal(bearer,'Bearer PRIVATE_BEARER');
 assert.ok(!JSON.stringify(displayed).includes('PRIVATE'));assert.equal((await stat(dir)).mode&0o777,0o700);
 assert.equal((await stat(join(dir,(await readdir(dir))[0]))).mode&0o777,0o600);
 assert.equal(await store.load('https://other.example.test'),null);
});
test('denied device flow stops without credentials',async()=>{
 const store=new CredentialStore(join(root,'denied'));const api=new ApiClient(origin,store,(async url=>String(url).endsWith('/code')?response(device):response({error:'access_denied'},400)) as Fetch);
 await assert.rejects(()=>api.login(()=>{}, {sleep:async()=>{}}),/access_denied/);assert.equal(await store.load(origin),null);
});
test('expired device flow stops without polling beyond expiry',async()=>{
 let now=0,polls=0;const api=new ApiClient(origin,new CredentialStore(join(root,'expired')),(async url=>{if(String(url).endsWith('/code'))return response({...device,expires_in:1});polls++;return response({error:'authorization_pending'},400);}) as Fetch);
 await assert.rejects(()=>api.login(()=>{}, {now:()=>now,sleep:async ms=>{now+=ms;}}),/expired/);assert.equal(polls,0);
});
test('verification URLs cannot redirect the user to another origin',async()=>{
 const api=new ApiClient(origin,new CredentialStore(join(root,'url')),(async()=>response({...device,verification_uri:'https://evil.example/device'})) as Fetch);let displayed=false;
 await assert.rejects(()=>api.login(()=>{displayed=true;}),/another origin/);assert.equal(displayed,false);
});
test('revoked credentials are rejected and logout removes them after known invalid session',async()=>{
 const store=new CredentialStore(join(root,'logout'));await store.save({origin,token:'PRIVATE_TOKEN',expiresAt:Date.now()+60_000});
 const api=new ApiClient(origin,store,(async()=>response({error:{code:'UNAUTHORIZED'}},401)) as Fetch);
 await assert.rejects(()=>api.request('/api/v1/me',{},true),/no longer valid/);assert.deepEqual(await api.logout(),{signedOut:true,origin});assert.equal(await store.load(origin),null);
});
test('network failure during logout retains credentials to allow server revocation retry',async()=>{
 const store=new CredentialStore(join(root,'offline'));await store.save({origin,token:'PRIVATE_TOKEN',expiresAt:Date.now()+60_000});
 const api=new ApiClient(origin,store,(async()=>{throw new Error('PRIVATE_TOKEN');}) as Fetch);
 await assert.rejects(()=>api.logout(),error=>!(error as Error).message.includes('PRIVATE_TOKEN'));assert.ok(await store.load(origin));
});
test('untrusted server messages never enter CLI error logs',async()=>{
 const api=new ApiClient(origin,new CredentialStore(join(root,'errors')),(async()=>response({error:{code:'EVIL',message:'PRIVATE_BEARER'}},500)) as Fetch);
 await assert.rejects(()=>api.request('/api/v1/me'),error=>!(error as Error).message.includes('PRIVATE_BEARER'));
});
test('services must use a plain HTTPS origin or explicit loopback development HTTP',()=>{
 assert.equal(serviceOrigin('http://localhost:3000'),'http://localhost:3000');assert.throws(()=>serviceOrigin('http://micro.example.test'));
 assert.throws(()=>serviceOrigin('https://token@example.test'));assert.throws(()=>serviceOrigin('https://example.test/path'));
});
test('response limits cancel a stream before reading the whole body',async()=>{
 let chunks=0,cancelled=false;
 const stream=new ReadableStream<Uint8Array>({pull(controller){chunks++;controller.enqueue(new Uint8Array(1024*1024));},cancel(){cancelled=true;}});
 const api=new ApiClient(origin,new CredentialStore(join(root,'oversize')),(async()=>new Response(stream)) as Fetch);
 await assert.rejects(()=>api.request('/api/v1/posts'),/read limit/);assert.ok(cancelled);assert.ok(chunks<8);
});
test('an unrecognized issued token is not persisted as a successful connection',async()=>{
 const store=new CredentialStore(join(root,'unrecognized'));
 const api=new ApiClient(origin,store,(async url=>String(url).endsWith('/code')?response(device):String(url).endsWith('/token')?response({access_token:'PRIVATE_INVALID_TOKEN',expires_in:60}):response({user:null})) as Fetch);
 await assert.rejects(()=>api.login(()=>{},{sleep:async()=>{}}),/did not recognize/);assert.equal(await store.load(origin),null);
});
test('logout asks the server to revoke even when the locally recorded expiry elapsed',async()=>{
 const store=new CredentialStore(join(root,'clock-skew'));await store.save({origin,token:'PRIVATE_OLD_TOKEN',expiresAt:1});let bearer='';
 const api=new ApiClient(origin,store,(async(_url,init)=>{bearer=new Headers(init?.headers).get('Authorization')??'';return new Response(null,{status:204});}) as Fetch);
 await api.logout();assert.equal(bearer,'Bearer PRIVATE_OLD_TOKEN');assert.equal(await store.load(origin),null);
});
