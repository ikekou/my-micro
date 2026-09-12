import { chmod, lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { randomUUID, createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { z } from 'zod';
import { fail } from './errors.js';

export function serviceOrigin(raw: string): string {
  let url: URL;
  try { url = new URL(raw); } catch { fail('INVALID_SERVICE','Supply the My Micro site origin with --service.'); }
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash || (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost','127.0.0.1','[::1]'].includes(url.hostname)))) fail('INVALID_SERVICE','Use an HTTPS site origin, or an HTTP localhost origin for local development.');
  return url.origin;
}
export async function writePrivate(path: string, data: unknown, overwrite = false): Promise<void> {
  const parent = dirname(path);
  await mkdir(parent,{recursive:true,mode:0o700});
  if (!(await lstat(parent)).isDirectory()) fail('UNSAFE_STORAGE','The local storage directory is not a regular directory.');
  const temp = join(parent,`.my-micro-${randomUUID()}.tmp`);
  const handle = await open(temp,'wx',0o600);
  try {
    await handle.writeFile(JSON.stringify(data,null,2)+'\n','utf8'); await handle.sync(); await handle.close();
    if (!overwrite) {
      // Exclusive creation avoids silently replacing an already previewed snapshot.
      const output = await open(path,'wx',0o600);
      try { await output.writeFile(JSON.stringify(data,null,2)+'\n','utf8'); await output.sync(); } finally { await output.close(); }
      await rm(temp,{force:true});
    } else await rename(temp,path);
  } catch (error) { await handle.close().catch(() => {}); await rm(temp,{force:true}); throw error; }
}
export async function readPrivate(path: string): Promise<unknown> {
  const info = await lstat(path);
  if (!info.isFile() || info.size > 100_000) fail('UNSAFE_STORAGE','The local data file is not a supported regular file.');
  try { return JSON.parse(await readFile(path,'utf8')); } catch { fail('INVALID_LOCAL_DATA','The local data file is invalid. Its contents were not logged.'); }
}
const credentialSchema = z.object({origin:z.string(),token:z.string().min(1).max(8192),expiresAt:z.number().int().positive()}).strict();
export type Credentials = z.infer<typeof credentialSchema>;
export class CredentialStore {
  constructor(private root = process.env.MY_MICRO_HOME || join(homedir(),'Library/Application Support/My Micro')) {}
  private file(origin: string) { return join(this.root,`${createHash('sha256').update(serviceOrigin(origin)).digest('hex')}.json`); }
  async save(credentials: Credentials) {
    const data = credentialSchema.parse(credentials);
    await mkdir(this.root,{recursive:true,mode:0o700});
    if (!(await lstat(this.root)).isDirectory()) fail('UNSAFE_STORAGE','The credential directory is not a regular directory.');
    await chmod(this.root,0o700);
    await writePrivate(this.file(data.origin),data,true);
  }
  async load(origin: string): Promise<Credentials | null> {
    const path = this.file(origin);
    try {
      const info = await lstat(path);
      if ((info.mode & 0o077) !== 0) fail('UNSAFE_STORAGE','Credential permissions are too broad. Restrict the credentials file to its owner.');
      const result = credentialSchema.safeParse(await readPrivate(path));
      if (!result.success || result.data.origin !== serviceOrigin(origin)) fail('INVALID_CREDENTIALS','The My Micro credentials are invalid. Sign in again.');
      return result.data;
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
  async remove(origin: string) { await rm(this.file(origin),{force:true}); }
}
