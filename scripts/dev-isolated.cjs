/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const net = require('node:net');
const http = require('node:http');
const https = require('node:https');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const production = process.argv.includes('--production');
const live = process.argv.includes('--live');
let child, proxy, certificateDirectory;

function target(value) {
  const url = new URL(value);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Invalid database URL.');
  return `${url.hostname.toLowerCase().replace('-pooler.', '.')}:${url.port || '5432'}${decodeURIComponent(url.pathname)}`;
}
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}
function cleanup() {
  proxy?.closeAllConnections();
  proxy?.close();
  if (certificateDirectory) fs.rmSync(certificateDirectory, { recursive: true, force: true });
  certificateDirectory = undefined;
}
function createLocalCertificate() {
  certificateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'frank-browser-qa-'));
  const config = path.join(certificateDirectory, 'openssl.cnf');
  const key = path.join(certificateDirectory, 'key.pem');
  const cert = path.join(certificateDirectory, 'cert.pem');
  fs.writeFileSync(config, '[req]\ndistinguished_name=dn\nx509_extensions=v3\nprompt=no\n[dn]\nCN=localhost\n[v3]\nsubjectAltName=@alts\n[alts]\nDNS.1=localhost\nIP.1=127.0.0.1\nIP.2=::1\n', { mode: 0o600 });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-nodes', '-days', '1', '-keyout', key, '-out', cert, '-config', config], { stdio: 'ignore', timeout: 15000 });
  fs.chmodSync(key, 0o600);
  return { key: fs.readFileSync(key), cert: fs.readFileSync(cert) };
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Production build: TEST_DATABASE_URL_FILE=/absolute/isolated-url-file BASE_URL=https://localhost:3100 node scripts/dev-isolated.cjs --production');
    console.log('Development: use BASE_URL=http://localhost:3100 without --production. The isolated database must already be migrated.');
    console.log('HTTPS uses a one-day temporary self-signed certificate and a loopback proxy; nothing is installed in the trust store. Requires openssl. Provider keys are disabled unless --live is explicit.');
    return;
  }
  require('@next/env').loadEnvConfig(root, !production, { info() {}, error() {} });
  if (!process.env.TEST_DATABASE_URL_FILE) throw new Error('Set TEST_DATABASE_URL_FILE to an isolated database URL file.');
  const isolated = fs.readFileSync(path.resolve(process.env.TEST_DATABASE_URL_FILE), 'utf8').trim();
  const isolatedTarget = target(isolated);
  for (const primary of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED].filter(Boolean)) if (target(primary) === isolatedTarget) throw new Error('Refusing to serve the main DATABASE_URL database. Use a separate test database or branch.');
  const base = new URL(process.env.BASE_URL || (production ? 'https://localhost:3100' : 'http://localhost:3100'));
  if (!['localhost', '127.0.0.1', '[::1]'].includes(base.hostname) || !['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.pathname !== '/' || base.search || base.hash) throw new Error('BASE_URL must be a plain localhost origin for this local server.');
  if (production && base.protocol !== 'https:') throw new Error('Production QA requires BASE_URL=https://localhost:3100 because production authentication requires HTTPS.');
  const env = { ...process.env, NODE_ENV: production ? 'production' : 'development', DATABASE_URL: isolated, DATABASE_URL_UNPOOLED: isolated, APP_URL: base.origin, REQUIRE_AUTH: process.env.REQUIRE_AUTH || 'true' };
  // Empty values prevent Next's .env loader from restoring real provider keys in a default QA run.
  if (!live) for (const key of ['VERTEX_API_KEY', 'GEMINI_API_KEY', 'GOOGLE_GENERATIVE_AI_API_KEY', 'RESEND_API_KEY', 'EMAIL_FROM', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'STRIPE_SECRET_KEY']) env[key] = '';
  let port = base.port || (base.protocol === 'https:' ? '443' : '80');
  let hostname = base.hostname === '[::1]' ? '::1' : base.hostname;
  if (base.protocol === 'https:') {
    port = String(await freePort()); hostname = '127.0.0.1';
    proxy = https.createServer(createLocalCertificate(), (request, response) => {
      if (request.headers.host !== base.host || !request.url?.startsWith('/') || request.url.startsWith('//')) { response.writeHead(400); response.end('Invalid local QA request.'); return; }
      const upstream = http.request({ hostname: '127.0.0.1', port, path: request.url, method: request.method, headers: { ...request.headers, host: base.host, 'x-forwarded-host': base.host, 'x-forwarded-proto': 'https', 'x-forwarded-for': '127.0.0.1' } }, incoming => {
        response.writeHead(incoming.statusCode || 502, incoming.headers);
        incoming.pipe(response);
      });
      upstream.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end('The local QA server is starting or unavailable.'); });
      request.on('aborted', () => upstream.destroy());
      request.pipe(upstream);
    });
    await new Promise((resolve, reject) => {
      proxy.once('error', reject);
      proxy.listen(Number(base.port || 443), base.hostname === '[::1]' ? '::1' : base.hostname, resolve);
    });
    console.log(`Local HTTPS QA proxy: ${base.origin} (temporary certificate; no trust-store changes).`);
  }
  const entry = production
    ? [path.join(root, '.next/standalone/server.js')]
    : [path.join(root, 'node_modules/next/dist/bin/next'), 'dev', '--hostname', hostname, '--port', String(port)];
  child = spawn(process.execPath, entry, { cwd: root, stdio: 'inherit', env: { ...env, HOSTNAME: hostname, PORT: String(port) } });
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { child.kill(signal); cleanup(); });
  child.on('error', () => { console.error('Could not start the isolated Next.js server.'); cleanup(); process.exitCode = 1; });
  child.on('exit', (code, signal) => { cleanup(); process.exitCode = code ?? (signal ? 1 : 0); });
}
main().catch(error => {
  cleanup();
  const allowed = /^(Set TEST_DATABASE|Refusing to serve|BASE_URL must|Production QA requires)/;
  console.error(allowed.test(error.message) ? error.message : 'Could not start the isolated server. Check the test URL file, local build and openssl installation.');
  process.exitCode = 1;
});
