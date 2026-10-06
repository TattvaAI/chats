/* eslint-disable @typescript-eslint/no-require-imports */
const { build } = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');

build({
  entryPoints: ['scripts/worker.cjs', 'scripts/migrate.cjs', 'scripts/release-check.cjs'],
  outdir: 'dist',
  outExtension: { '.js': '.cjs' },
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  packages: 'external',
  define: { 'process.env.FRANK_WORKER_BUNDLED': '"true"' },
  logLevel: 'info',
}).then(() => {
  const standalone = '.next/standalone';
  if (!fs.existsSync(standalone)) return;
  fs.cpSync('public', path.join(standalone, 'public'), { recursive: true });
  fs.cpSync('.next/static', path.join(standalone, '.next/static'), { recursive: true });
  // Next's local output tracing can copy dotenv files. Deployment secrets must
  // be injected at runtime, never carried in a distributable build directory.
  for (const file of fs.readdirSync(standalone)) {
    if (file === '.env' || file.startsWith('.env.')) fs.rmSync(path.join(standalone, file));
  }
}).catch(() => { process.exitCode = 1; });
