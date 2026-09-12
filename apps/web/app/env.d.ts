// Secret bindings are configured outside wrangler.jsonc and are required for sign-in.
interface MyMicroSecrets {
  BETTER_AUTH_SECRET: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
}
interface Env extends MyMicroSecrets {}
declare namespace Cloudflare {
  interface Env extends MyMicroSecrets {}
}
