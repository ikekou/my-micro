import { setTimeout as delay } from 'node:timers/promises';
import { z } from 'zod';
import { DEVICE_CLIENT_ID } from '@my-micro/shared';
import { CredentialStore, serviceOrigin } from './storage.js';
import { fail, MicroError } from './errors.js';

export type Fetch = typeof fetch;
const deviceSchema = z.object({device_code:z.string().min(1).max(8192),user_code:z.string().min(1).max(32),verification_uri:z.string(),verification_uri_complete:z.string().optional(),expires_in:z.number().int().positive().max(3600),interval:z.number().int().positive().max(60).default(5)});
const tokenSchema = z.object({access_token:z.string().min(1).max(8192),expires_in:z.number().int().positive(),token_type:z.string().optional()});
const knownErrors = new Set(['authorization_pending','slow_down','access_denied','expired_token','invalid_grant','invalid_client','UNAUTHORIZED','FORBIDDEN','NOT_FOUND','CONFLICT','RATE_LIMITED','VALIDATION_ERROR','INVALID_INPUT','IDEMPOTENCY_CONFLICT','INVALID_VERSION','VERSION_CONFLICT','POST_NOT_FOUND','POST_DELETED','POST_HIDDEN','WRITES_DISABLED','AUTH_NOT_CONFIGURED','AUTH_REQUIRED','INVALID_POST','VERSION_REQUIRED','IDEMPOTENCY_KEY_REQUIRED','ORIGIN_REJECTED']);
export class ApiClient {
  readonly origin: string;
  constructor(origin: string, readonly store = new CredentialStore(), private transport: Fetch = fetch) { this.origin = serviceOrigin(origin); }
  async request(path: string, init: RequestInit = {}, authenticated = false): Promise<unknown> {
    if (!path.startsWith('/') || path.startsWith('//')) fail('INVALID_REQUEST','Invalid My Micro API path.');
    const headers = new Headers(init.headers);
    if (init.body) headers.set('Content-Type','application/json');
    if (authenticated) {
      const credentials = await this.store.load(this.origin);
      if (!credentials || credentials.expiresAt <= Date.now()) fail('AUTH_REQUIRED','Sign in to My Micro before continuing.');
      headers.set('Authorization',`Bearer ${credentials.token}`);
    }
    let response: Response;
    try { response = await this.transport(`${this.origin}${path}`,{...init,headers,redirect:'error',signal:AbortSignal.timeout(20_000)}); }
    catch { fail('NETWORK_ERROR','The My Micro request did not complete. For a write, the result is uncertain; retry the same saved draft.'); }
    let data: unknown = null;
    if (response.status !== 204) {
      try {
        const limit = 4 * 1024 * 1024; // Covers the API's maximum 48 bounded posts plus metadata.
        const length = response.headers.get('content-length');
        if (length && Number(length) > limit) fail('INVALID_RESPONSE','The My Micro response exceeded the read limit.');
        if (!response.body) fail('INVALID_RESPONSE','My Micro returned an empty response.');
        const reader = response.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        try {
          while (true) {
            const {done,value} = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > limit) { await reader.cancel(); fail('INVALID_RESPONSE','The My Micro response exceeded the read limit.'); }
            chunks.push(value);
          }
        } finally { reader.releaseLock(); }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk,offset); offset += chunk.byteLength; }
        data = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
      } catch (error) { if (error instanceof MicroError) throw error; fail('INVALID_RESPONSE','My Micro returned an unreadable response.'); }
    }
    if (!response.ok) {
      const body = data as {error?: string | {code?: string}; code?: string} | null;
      const code = typeof body?.error === 'string' ? body.error : body?.error?.code ?? body?.code;
      if (response.status === 401) fail('AUTH_REQUIRED','This My Micro connection is no longer valid. Sign in again.');
      if (response.status === 429 && code !== 'slow_down') fail('RATE_LIMITED','My Micro is temporarily limiting requests. Try again later.');
      if (code && knownErrors.has(code)) throw new MicroError(code,`My Micro rejected the request (${code}).`);
      fail('API_ERROR',`My Micro rejected the request (HTTP ${response.status}).`);
    }
    return data;
  }
  async login(onCode: (code: {userCode:string;verificationUrl:string;expiresIn:number}) => void, options: {sleep?:(ms:number)=>Promise<unknown>;now?:()=>number} = {}) {
    const now = options.now ?? Date.now;
    const sleep = options.sleep ?? delay;
    const result = deviceSchema.safeParse(await this.request('/api/auth/device/code',{method:'POST',body:JSON.stringify({client_id:DEVICE_CLIENT_ID})}));
    if (!result.success) fail('INVALID_DEVICE_RESPONSE','My Micro returned an invalid device authorization response.');
    const device = result.data;
    const verification = new URL(device.verification_uri_complete || device.verification_uri,this.origin);
    if (verification.origin !== this.origin || verification.username || verification.password) fail('INVALID_DEVICE_RESPONSE','My Micro returned a verification URL on another origin.');
    onCode({userCode:device.user_code,verificationUrl:verification.href,expiresIn:device.expires_in});
    const expiresAt = now() + device.expires_in * 1000;
    let interval = device.interval * 1000;
    while (now() < expiresAt) {
      await sleep(Math.min(interval,expiresAt-now()));
      if (now() >= expiresAt) break;
      try {
        const parsed = tokenSchema.safeParse(await this.request('/api/auth/device/token',{method:'POST',body:JSON.stringify({grant_type:'urn:ietf:params:oauth:grant-type:device_code',device_code:device.device_code,client_id:DEVICE_CLIENT_ID})}));
        if (!parsed.success) fail('INVALID_TOKEN_RESPONSE','My Micro returned an invalid sign-in response.');
        // Verify the issued token before persisting it; never print it.
        const me = await this.request('/api/v1/me',{headers:{Authorization:`Bearer ${parsed.data.access_token}`}}) as {user?:{id?:string}};
        if (!me.user?.id) fail('INVALID_SESSION','My Micro did not recognize the new connection. Sign in again.');
        await this.store.save({origin:this.origin,token:parsed.data.access_token,expiresAt:now()+parsed.data.expires_in*1000});
        return {authenticated:true,origin:this.origin};
      } catch (error) {
        if (error instanceof MicroError && error.code === 'authorization_pending') continue;
        if (error instanceof MicroError && error.code === 'slow_down') { interval += 5000; continue; }
        throw error;
      }
    }
    fail('expired_token','The connection code expired. Start sign-in again.');
  }
  async logout() {
    const credentials = await this.store.load(this.origin);
    if (!credentials) return {signedOut:true,origin:this.origin};
    try { await this.request('/api/v1/me/sign-out',{method:'POST',headers:{Authorization:`Bearer ${credentials.token}`}}); }
    catch (error) { if (!(error instanceof MicroError) || error.code !== 'AUTH_REQUIRED') throw error; }
    await this.store.remove(this.origin);
    return {signedOut:true,origin:this.origin};
  }
}
