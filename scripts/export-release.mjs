import { cp, lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Export an explicit source set, never the development Git history or local research.
const root = fileURLToPath(new URL('../', import.meta.url));
const destination = path.resolve(process.argv[2] || path.join(root, '.local/public-release'));
const sources = [
  'README.md', 'LICENSE', '.gitignore', 'package.json', 'package-lock.json',
  '.agents/plugins/marketplace.json', '.github/workflows/ci.yml',
  'apps/web/app', 'apps/web/workers', 'apps/web/public', 'apps/web/migrations', 'apps/web/tests',
  'apps/web/package.json', 'apps/web/.dev.vars.example', 'apps/web/vite.config.ts',
  'apps/web/react-router.config.ts', 'apps/web/wrangler.jsonc',
  'apps/web/tsconfig.json', 'apps/web/tsconfig.cloudflare.json', 'apps/web/tsconfig.node.json',
  'packages/shared/src', 'packages/shared/test', 'packages/shared/package.json', 'packages/shared/tsconfig.json',
  'packages/collector/src', 'packages/collector/test', 'packages/collector/package.json', 'packages/collector/tsconfig.json',
  'plugins/my-micro', 'docs/server-setup.md', 'docs/release.md', 'scripts/export-release.mjs',
];
try {
  await lstat(destination);
  throw new Error('The export destination already exists. Choose a new empty path.');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const files = [];
async function inspect(relative) {
  const absolute = path.join(root, relative);
  const stat = await lstat(absolute);
  if (stat.isSymbolicLink()) throw new Error(`Symlink is not allowed in release: ${relative}`);
  if (stat.isDirectory()) {
    for (const name of (await readdir(absolute)).sort()) await inspect(path.join(relative, name));
    return;
  }
  if (/(^|\/)(?:\.git|\.dev\.vars|\.env(?:\..*)?|node_modules|\.local|\.wrangler|research)(\/|$)/.test(relative)) {
    throw new Error(`Private or generated path is not allowed: ${relative}`);
  }
  const contents = await readFile(absolute);
  if (/(?:gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/.test(contents.toString('utf8'))) {
    throw new Error(`Possible credential in release: ${relative}`);
  }
  files.push({ path: relative, sha256: createHash('sha256').update(contents).digest('hex') });
}
for (const source of sources) await inspect(source);
await mkdir(destination, { recursive: true });
for (const file of files) {
  await mkdir(path.dirname(path.join(destination, file.path)), { recursive: true });
  await cp(path.join(root, file.path), path.join(destination, file.path), { errorOnExist: true, force: false });
}
await writeFile(path.join(destination, 'release-manifest.json'), JSON.stringify({ files }, null, 2) + '\n');
console.log(`Exported ${files.length} files without Git history to ${destination}`);
