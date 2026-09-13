import assert from 'node:assert/strict';
import { test, after } from 'node:test';
import { mkdtemp, readFile, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectFromToml } from '../src/collect.js';
import { SUPPORTED_APP } from '../src/compatibility.js';
import { bindCreateDraft, createDraft, publishDraft, readDraft, saveDraft } from '../src/draft.js';
import { ApiClient, type Fetch } from '../src/api.js';
import { CredentialStore } from '../src/storage.js';

const origin='https://micro.example.test';
const input={title:'My Micro',description:'',settings:collectFromToml('',SUPPORTED_APP,'2026-09-12T00:00:00.000Z')};
const root=await mkdtemp(join(tmpdir(),'micro-test-'));after(()=>rm(root,{recursive:true,force:true}));
async function client(transport: Fetch) {
 const store=new CredentialStore(join(root,crypto.randomUUID()));await store.save({origin,token:'PRIVATE_BEARER',expiresAt:Date.now()+100_000});return new ApiClient(origin,store,transport);
}
const post=(version=1)=>({...input,id:'post-1',version,author:{id:'user-1',username:'sample',avatarUrl:null},createdAt:'2026-09-12T00:00:00.000Z',updatedAt:'2026-09-12T00:00:00.000Z'});
test('saved snapshot is fixed and private; changed title or approval hash cannot publish',async()=>{
 const draft=await createDraft(input,origin),path=join(root,'draft.json');await saveDraft(path,draft);assert.deepEqual(await readDraft(path),draft);
 assert.equal((await stat(path)).mode&0o777,0o600);
 const altered=JSON.parse(await readFile(path,'utf8'));altered.input.title='Changed';await writeFile(path,JSON.stringify(altered));
 await assert.rejects(()=>readDraft(path),/changed/);
 let calls=0;const api=await client((async()=>{calls++;throw new Error('should not run');}) as Fetch);
 await assert.rejects(()=>publishDraft(draft,'0'.repeat(64),api),/exact saved draft/);assert.equal(calls,0);
});
test('a create retry sends the identical payload and idempotency key and verifies read-back',async()=>{
 let draft=await createDraft(input,origin);const requests:{body:unknown,key:string|null}[]=[];
 const api=await client((async(url,init)=>{
  if(String(url).endsWith('/me'))return Response.json({user:{id:'user-1',username:'sample'}});
  if(init?.method==='POST') {requests.push({body:init.body,key:new Headers(init.headers).get('Idempotency-Key')});return Response.json({post:post()});}
  return Response.json({post:post()});
 }) as Fetch);
 draft=await bindCreateDraft(draft,api);
 const first=await publishDraft(draft,draft.approvalHash,api);const retry=await publishDraft(draft,draft.approvalHash,api);
 assert.deepEqual(first,retry);assert.equal(requests.length,2);assert.deepEqual(requests[0],requests[1]);assert.deepEqual(JSON.parse(requests[0].body as string),input);
});
test('origin and target are bound to confirmation',async()=>{
 const draft=await createDraft(input,origin);const changed={...draft,operation:{kind:'update' as const,id:'another',version:1,ownerId:'user-1'}};
 const api=await client((async()=>{throw new Error('must not send');}) as Fetch);
 await assert.rejects(()=>publishDraft(changed,draft.approvalHash,api),/exact saved draft/);
 const other=new ApiClient('https://different.example.test');await assert.rejects(()=>publishDraft(draft,draft.approvalHash,other),/exact saved draft/);
});
test('post-read mismatch reports uncertainty instead of success',async()=>{
 const draft=await createDraft(input,origin,{kind:'create',owner:{id:'user-1',username:'sample'}});let calls=0;
 const api=await client((async url=>String(url).endsWith('/me')?Response.json({user:{id:'user-1'}}):Response.json({post:++calls===1?post():{...post(),title:'changed remotely'}})) as Fetch);
 await assert.rejects(()=>publishDraft(draft,draft.approvalHash,api),/differs/);
});
test('update retry after a lost write response recognizes exactly the applied version',async()=>{
 const draft=await createDraft(input,origin,{kind:'update',id:'post-1',version:1,ownerId:'user-1'});let mutations=0;
 const api=await client((async(url,init)=>{if(init?.method)mutations++;return Response.json(String(url).endsWith('/me')?{user:{id:'user-1'}}:{post:post(2)});}) as Fetch);
 const result=await publishDraft(draft,draft.approvalHash,api);assert.equal('alreadyApplied' in result&&result.alreadyApplied,true);assert.equal(mutations,0);
});
test('update conflicts do not overwrite another version',async()=>{
 const draft=await createDraft(input,origin,{kind:'update',id:'post-1',version:1,ownerId:'user-1'});let mutations=0;
 const api=await client((async(url,init)=>{if(init?.method)mutations++;return Response.json(String(url).endsWith('/me')?{user:{id:'user-1'}}:{post:{...post(2),title:'changed'}});}) as Fetch);
 await assert.rejects(()=>publishDraft(draft,draft.approvalHash,api),/has changed/);assert.equal(mutations,0);
});
test('delete sends the confirmed version and verifies absence',async()=>{
 const draft=await createDraft(input,origin,{kind:'delete',id:'post-1',version:3,ownerId:'user-1'});let version:string|null=null;
 const api=await client((async(url,init)=>{if(String(url).endsWith('/me'))return Response.json({user:{id:'user-1'}});if(init?.method==='DELETE'){version=new Headers(init.headers).get('If-Match');return new Response(null,{status:204});}return Response.json({error:{code:'POST_NOT_FOUND'}},{status:404});}) as Fetch);
 assert.deepEqual(await publishDraft(draft,draft.approvalHash,api),{deleted:true,id:'post-1'});assert.equal(version,'"3"');
});
test('delete retry verifies absence after a server POST_NOT_FOUND response',async()=>{
 const draft=await createDraft(input,origin,{kind:'delete',id:'post-1',version:3,ownerId:'user-1'});
 const api=await client((async url=>String(url).endsWith('/me')?Response.json({user:{id:'user-1'}}):Response.json({error:{code:'POST_NOT_FOUND'}},{status:404})) as Fetch);
 assert.deepEqual(await publishDraft(draft,draft.approvalHash,api),{deleted:true,id:'post-1',alreadyApplied:true});
});
test('a saved delete cannot be sent after changing the signed-in account',async()=>{
 const draft=await createDraft(input,origin,{kind:'delete',id:'post-1',version:3,ownerId:'user-1'});let deletes=0;
 const api=await client((async(_url,init)=>{if(init?.method==='DELETE')deletes++;return Response.json({user:{id:'user-2'}});}) as Fetch);
 await assert.rejects(()=>publishDraft(draft,draft.approvalHash,api),/differs from the owner/);assert.equal(deletes,0);
});

test('binding preserves the local snapshot and retry key but requires new approval',async()=>{
 const local=await createDraft(input,origin);let calls=0;
 const api=await client((async()=>{calls++;return Response.json({user:{id:'user-1',username:'sample'}});}) as Fetch);
 await assert.rejects(()=>publishDraft(local,local.approvalHash,api),/bind-account/);assert.equal(calls,0);
 const bound=await bindCreateDraft(local,api);
 assert.deepEqual(bound.input,local.input);assert.equal(bound.idempotencyKey,local.idempotencyKey);
 assert.notEqual(bound.approvalHash,local.approvalHash);
 assert.deepEqual(bound.operation,{kind:'create',owner:{id:'user-1',username:'sample'}});
 await assert.rejects(()=>publishDraft(bound,local.approvalHash,api),/exact saved draft/);
 const path=join(root,'bound.json');await saveDraft(path,bound);assert.deepEqual(await readDraft(path),bound);
});
test('a create approved for one account cannot publish or rebind under another',async()=>{
 const draft=await createDraft(input,origin,{kind:'create',owner:{id:'user-1',username:'sample'}});let writes=0;
 const api=await client((async(_url,init)=>{if(init?.method)writes++;return Response.json({user:{id:'user-2',username:'second'}});}) as Fetch);
 await assert.rejects(()=>publishDraft(draft,draft.approvalHash,api),/differs from the owner/);
 await assert.rejects(()=>bindCreateDraft(draft,api),/already bound/);assert.equal(writes,0);
});
test('switching stored credentials between identity check and write cannot change the publisher',async()=>{
 const draft=await createDraft(input,origin,{kind:'create',owner:{id:'user-1',username:'sample'}});
 const tokens:string[]=[];
 const api=await client((async(url,init)=>{
  if(String(url).endsWith('/me')) {
   await api.store.save({origin,token:'OTHER_ACCOUNT',expiresAt:Date.now()+100_000});
   return Response.json({user:{id:'user-1'}});
  }
  if(init?.method==='POST')tokens.push(new Headers(init.headers).get('Authorization')!);
  return Response.json({post:post()});
 }) as Fetch);
 await publishDraft(draft,draft.approvalHash,api);assert.deepEqual(tokens,['Bearer PRIVATE_BEARER']);
});
test('read-back with a different author never reports a successful publication',async()=>{
 const draft=await createDraft(input,origin,{kind:'create',owner:{id:'user-1',username:'sample'}});
 const api=await client((async url=>Response.json(String(url).endsWith('/me')?{user:{id:'user-1'}}:{post:{...post(),author:{id:'user-2',username:'second',avatarUrl:null}}})) as Fetch);
 await assert.rejects(()=>publishDraft(draft,draft.approvalHash,api),/differs from the confirmed draft/);
});
