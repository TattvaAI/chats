/* eslint-disable @typescript-eslint/no-require-imports */
const { createServer } = require('node:http');

// A health check must reflect successful database work, not just an open port.
async function createWorkerHealth({ enabled = true, port = process.env.PORT, hostname = '0.0.0.0', now = Date.now } = {}) {
  const noop = { succeeded() {}, failed() {}, async close() {} };
  if (!enabled || port === undefined || port === '') return noop;
  if (!/^\d+$/.test(String(port)) || Number(port) > 65535) throw new Error('Invalid worker health port.');
  let lastSuccess = null;
  let failed = false;
  const server = createServer((request, response) => {
    if (request.url !== '/health' || !['GET', 'HEAD'].includes(request.method)) {
      response.writeHead(404).end(); return;
    }
    const healthy = !failed && lastSuccess !== null && now() - lastSuccess < 360_000;
    response.writeHead(healthy ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify({ status: healthy ? 'ok' : 'not_ready' }));
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(port), hostname, resolve);
  });
  return {
    port: server.address().port,
    succeeded() { lastSuccess = now(); failed = false; },
    failed() { failed = true; },
    async close() {
      failed = true;
      await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); });
    },
  };
}

module.exports = { createWorkerHealth };
