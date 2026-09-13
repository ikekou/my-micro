import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { canonicalJson, postInputSchema, snapshotHash, type PostInput, type PublicPost } from '@my-micro/shared';
import { ApiClient } from './api.js';
import { serviceOrigin, readPrivate, writePrivate } from './storage.js';
import { fail, MicroError } from './errors.js';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const operationSchema = z.discriminatedUnion('kind',[
  z.object({kind:z.literal('create'),owner:z.object({id,username:z.string().min(1).max(100)}).strict().optional()}).strict(),
  z.object({kind:z.literal('update'),id,version:z.number().int().positive(),ownerId:id}).strict(),
  z.object({kind:z.literal('delete'),id,version:z.number().int().positive(),ownerId:id}).strict(),
]);
const draftContentSchema = z.object({draftVersion:z.literal(1),serviceOrigin:z.string(),operation:operationSchema,input:postInputSchema,contentHash:hash,idempotencyKey:z.uuid()}).strict();
const draftSchema = draftContentSchema.extend({approvalHash:hash});
export type Draft = z.infer<typeof draftSchema>;
export type Operation = z.infer<typeof operationSchema>;
function approvalHash(content: z.infer<typeof draftContentSchema>) { return createHash('sha256').update(canonicalJson(content)).digest('hex'); }
export async function createDraft(input: PostInput, origin: string, operation: Operation = {kind:'create'}): Promise<Draft> {
  const validated = postInputSchema.parse(input);
  const content = draftContentSchema.parse({draftVersion:1,serviceOrigin:serviceOrigin(origin),operation,input:validated,contentHash:await snapshotHash(validated),idempotencyKey:randomUUID()});
  return {...content,approvalHash:approvalHash(content)};
}
export async function readDraft(path: string): Promise<Draft> {
  const result = draftSchema.safeParse(await readPrivate(path));
  if (!result.success) fail('INVALID_DRAFT','This saved draft is invalid. Create and preview a new draft.');
  const {approvalHash:stored,...content} = result.data;
  if (serviceOrigin(content.serviceOrigin) !== content.serviceOrigin || await snapshotHash(content.input) !== content.contentHash || approvalHash(content) !== stored) fail('DRAFT_CHANGED','This draft changed after it was created. Create and preview a new draft before approval.');
  return result.data;
}
export async function saveDraft(path: string, draft: Draft) { await writePrivate(path,draft); }
export async function bindCreateDraft(draft: Draft, client = new ApiClient(draft.serviceOrigin)): Promise<Draft> {
  const {approvalHash:stored,...content} = draft;
  if (approvalHash(content) !== stored || await snapshotHash(draft.input) !== draft.contentHash || client.origin !== draft.serviceOrigin) fail('DRAFT_CHANGED','Create and preview a valid draft before binding an account.');
  if (draft.operation.kind !== 'create') fail('INVALID_OPERATION','Only new-post drafts need account binding.');
  const me = z.object({user:z.object({id,username:z.string().min(1).max(100)})}).safeParse(await client.request('/api/v1/me',{},true));
  if (!me.success) fail('AUTH_REQUIRED','This My Micro connection is no longer valid. Sign in again.');
  if (draft.operation.owner && draft.operation.owner.id !== me.data.user.id) fail('ACCOUNT_CHANGED','This draft is already bound to another account. Switch back or create a new draft.');
  const bound = draftContentSchema.parse({...content,operation:{kind:'create',owner:me.data.user}});
  return {...bound,approvalHash:approvalHash(bound)};
}
export function previewDraft(draft: Draft) {
  return {operation:draft.operation,accountBindingRequired:draft.operation.kind === 'create' && !draft.operation.owner,serviceOrigin:draft.serviceOrigin,approvalHash:draft.approvalHash,contentHash:draft.contentHash,publicContent:draft.input};
}
const postSchema = postInputSchema.extend({id,author:z.object({id:z.string(),username:z.string(),avatarUrl:z.string().nullable()}),version:z.number().int().positive(),createdAt:z.string(),updatedAt:z.string()});
export function parsePost(value: unknown): PublicPost {
  const response = z.object({post:postSchema}).safeParse(value);
  if (!response.success) fail('INVALID_RESPONSE','My Micro returned an invalid post.');
  return response.data.post;
}
function inputOf(post: PublicPost): PostInput { return {title:post.title,description:post.description,settings:post.settings}; }
export async function ownedPost(client: ApiClient, target: string, options: {includeHidden?:boolean} = {}): Promise<PublicPost> {
  if (!id.safeParse(target).success) fail('INVALID_POST_ID','The post ID is invalid.');
  const post = parsePost(await client.request(options.includeHidden ? `/api/v1/me/posts/${target}` : `/api/v1/posts/${target}`,{},!!options.includeHidden));
  const me = await client.request('/api/v1/me',{},true) as {user?:{id?:string}};
  if (!me.user?.id) fail('AUTH_REQUIRED','This My Micro connection is no longer valid. Sign in again.');
  if (me.user.id !== post.author.id) fail('NOT_OWNER','This post is not owned by the signed-in account.');
  return post;
}
export async function publishDraft(draft: Draft, confirmation: string, client = new ApiClient(draft.serviceOrigin)) {
  const {approvalHash:stored,...content} = draft;
  if (confirmation !== stored || approvalHash(content) !== stored || await snapshotHash(draft.input) !== draft.contentHash || client.origin !== draft.serviceOrigin) fail('CONFIRMATION_REQUIRED','Show this exact saved draft, then pass its approval hash only after the user explicitly confirms.');
  const target = draft.operation;
  const ownerId = target.kind === 'create' ? target.owner?.id : target.ownerId;
  if (!ownerId) fail('ACCOUNT_BINDING_REQUIRED','Run bind-account on this draft, show the account and complete preview, and obtain approval of the new hash before publishing.');
  client = await client.withCurrentCredentials();
  const me = await client.request('/api/v1/me',{},true) as {user?:{id?:string}};
  if (!me.user?.id) fail('AUTH_REQUIRED','This My Micro connection is no longer valid. Sign in again.');
  if (me.user.id !== ownerId) fail('ACCOUNT_CHANGED','The signed-in account differs from the owner in this preview. Switch accounts or create a new preview.');
  if (target.kind === 'delete') {
    let alreadyApplied = false;
    try { await client.request(`/api/v1/posts/${target.id}`,{method:'DELETE',headers:{'If-Match':`"${target.version}"`}},true); }
    catch (error) {
      if (error instanceof MicroError && error.code === 'POST_NOT_FOUND') alreadyApplied = true;
      else throw error;
    }
    try { await client.request(`/api/v1/me/posts/${target.id}`,{},true); }
    catch (error) {
      if (error instanceof MicroError && ['POST_NOT_FOUND','NOT_FOUND'].includes(error.code)) return {deleted:true,id:target.id,...(alreadyApplied ? {alreadyApplied:true} : {})};
      throw error;
    }
    fail('DELETE_NOT_VERIFIED','My Micro accepted deletion, but the post could still be read. Check your posts before retrying.');
  }
  if (target.kind === 'update') {
    const current = await ownedPost(client,target.id);
    if (current.version === target.version + 1 && await snapshotHash(inputOf(current)) === draft.contentHash) {
      return {published:true,id:current.id,url:`${client.origin}/posts/${current.id}`,version:current.version,alreadyApplied:true};
    }
    if (current.version !== target.version) fail('VERSION_CONFLICT','This post has changed. Read it again and create a new preview before updating.');
  }
  const saved = parsePost(await client.request(target.kind === 'create' ? '/api/v1/posts' : `/api/v1/posts/${target.id}`,{
    method:target.kind === 'create' ? 'POST' : 'PATCH',headers:{'Idempotency-Key':draft.idempotencyKey},
    body:JSON.stringify(target.kind === 'create' ? draft.input : {...draft.input,version:target.version}),
  },true));
  const readBack = parsePost(await client.request(`/api/v1/posts/${saved.id}`));
  if (saved.author.id !== ownerId || readBack.author.id !== ownerId || saved.id !== readBack.id || (target.kind === 'update' && readBack.id !== target.id) || await snapshotHash(inputOf(readBack)) !== draft.contentHash) fail('READBACK_MISMATCH','The write may have succeeded, but the saved post differs from the confirmed draft. Check the public post before continuing.');
  return {published:true,id:readBack.id,url:`${client.origin}/posts/${readBack.id}`,version:readBack.version};
}
