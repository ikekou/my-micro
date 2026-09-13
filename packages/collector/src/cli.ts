import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { postInputSchema, microSettingsSchema } from '@my-micro/shared';
import { collectLocal, detectApp } from './collect.js';
import { SUPPORTED_APP } from './compatibility.js';
import { bindCreateDraft, createDraft, ownedPost, previewDraft, publishDraft, readDraft, saveDraft } from './draft.js';
import { ApiClient } from './api.js';
import { readPrivate, serviceOrigin, writePrivate } from './storage.js';
import { fail, MicroError } from './errors.js';

const HELP = `My Micro — local preview and confirmed publishing

  doctor [--app path]
  collect --out settings.json [--app path] [--config path]
  draft --settings settings.json --title text [--description text] --service origin --out draft.json [--post id]
  preview --draft draft.json
  bind-account --draft draft.json --out final-draft.json
  publish --draft draft.json --confirm approvalHash
  login --service origin
  me --service origin
  posts --service origin [--cursor value] [--limit 16]
  delete-draft --post id --service origin --out draft.json
  logout --service origin

Collection and drafts are local. Publishing requires the exact preview's approval hash.
Never pass tokens on the command line. Use MY_MICRO_HOME for an isolated credential directory.
`;
function output(value: unknown) { process.stdout.write(JSON.stringify(value,null,2)+'\n'); }
async function main() {
  const parsed = parseArgs({allowPositionals:true,strict:true,options:{help:{type:'boolean',short:'h'},app:{type:'string'},config:{type:'string'},out:{type:'string'},settings:{type:'string'},title:{type:'string'},description:{type:'string'},service:{type:'string'},post:{type:'string'},draft:{type:'string'},confirm:{type:'string'},cursor:{type:'string'},limit:{type:'string'}}});
  const {values,positionals} = parsed;
  const command = positionals[0];
  if (values.help || !command) { process.stdout.write(HELP); return; }
  if (positionals.length !== 1) fail('INVALID_ARGUMENTS','Supply one My Micro command.');
  function required(name: keyof typeof values): string {
    const value = values[name];
    if (typeof value !== 'string' || !value) fail('INVALID_ARGUMENTS',`Missing --${name}.`);
    return value;
  }
  async function origin() {
    let raw = values.service || process.env.MY_MICRO_SERVICE;
    if (!raw) {
      try { raw = JSON.parse(await readFile(new URL('../service.json',import.meta.url),'utf8')).origin; } catch { /* explicit origin is still available */ }
    }
    if (!raw) fail('SERVICE_REQUIRED','Pass the origin of the My Micro site from the sharing prompt with --service.');
    return serviceOrigin(raw);
  }
  switch (command) {
    case 'doctor': {
      const app = await detectApp(values.app);
      output({platform:process.platform,node:process.versions.node,app,supported:app.version === SUPPORTED_APP.version && app.build === SUPPORTED_APP.build}); return;
    }
    case 'collect': {
      const settings = await collectLocal({appPath:values.app,configPath:values.config});
      await writePrivate(required('out'),settings);
      output({collected:true,source:settings.source,unsupported:settings.unsupported,localOnly:true}); return;
    }
    case 'draft': {
      const settings = microSettingsSchema.safeParse(await readPrivate(required('settings')));
      if (!settings.success) fail('INVALID_SETTINGS','The local settings snapshot is invalid. Collect it again.');
      const input = postInputSchema.safeParse({title:required('title'),description:values.description ?? '',settings:settings.data});
      if (!input.success) fail('INVALID_POST','Use a title of 1–100 characters and a description of at most 2,000 characters.');
      const service = await origin();
      const target = values.post ? await ownedPost(new ApiClient(service),values.post) : undefined;
      const draft = await createDraft(input.data,service,target ? {kind:'update',id:target.id,version:target.version,ownerId:target.author.id} : {kind:'create'});
      await saveDraft(required('out'),draft); output(previewDraft(draft)); return;
    }
    case 'preview': output(previewDraft(await readDraft(required('draft')))); return;
    case 'bind-account': {
      const draft = await bindCreateDraft(await readDraft(required('draft')));
      await saveDraft(required('out'),draft); output(previewDraft(draft)); return;
    }
    case 'publish': output(await publishDraft(await readDraft(required('draft')),required('confirm'))); return;
    case 'login': output(await new ApiClient(await origin()).login(output)); return;
    case 'logout': output(await new ApiClient(await origin()).logout()); return;
    case 'me': output(await new ApiClient(await origin()).request('/api/v1/me',{},true)); return;
    case 'posts': {
      const query = new URLSearchParams({limit:values.limit || '16'});
      if (values.cursor) query.set('cursor',values.cursor);
      output(await new ApiClient(await origin()).request(`/api/v1/me/posts?${query}`,{},true)); return;
    }
    case 'delete-draft': {
      const client = new ApiClient(await origin());
      const post = await ownedPost(client,required('post'));
      const draft = await createDraft({title:post.title,description:post.description,settings:post.settings},client.origin,{kind:'delete',id:post.id,version:post.version,ownerId:post.author.id});
      await saveDraft(required('out'),draft); output(previewDraft(draft)); return;
    }
    default: fail('UNKNOWN_COMMAND','Unknown command. Run with --help to see the supported commands.');
  }
}
// The bundled file is also importable for tools without triggering the CLI.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    output({error:{code:error instanceof MicroError ? error.code : 'LOCAL_ERROR',message:error instanceof MicroError ? error.message : 'My Micro could not complete this local operation. No private details were logged.'}});
    process.exitCode = 1;
  });
}
