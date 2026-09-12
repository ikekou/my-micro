/** Messages are deliberately fixed: parser/network errors can contain private source text. */
export class MicroError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'MicroError'; }
}
export function fail(code: string, message: string): never { throw new MicroError(code, message); }
