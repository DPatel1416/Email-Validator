import http from 'node:http';
import { readFile, realpath } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const assets = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/css/style.css', ['css/style.css', 'text/css; charset=utf-8']],
  ['/js/script.js', ['js/script.js', 'text/javascript; charset=utf-8']],
  ...['favicon', 'email', 'loading'].map(name => [`/img/${name}.svg`, [`img/${name}.svg`, 'image/svg+xml']])
]);
const fields = ['email', 'state', 'score', 'format_valid', 'mx_found', 'smtp_check', 'disposable', 'role', 'catch_all', 'reason', 'did_you_mean'];

export function createServer({ apiKey = '', fetchImpl = fetch, timeoutMs = 15000, limit = 20 } = {}) {
  // A bounded per-process limit protects the provider quota without keeping email addresses.
  const clients = new Map();
  function json(res, status, data) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(data));
  }
  return http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    let pathname;
    try { pathname = new URL(req.url, 'http://localhost').pathname; }
    catch { return json(res, 400, { error: 'Invalid request.' }); }
    if (pathname !== '/api/validate') {
      const asset = assets.get(pathname);
      if (!asset) return json(res, 404, { error: 'Not found.' });
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); return json(res, 405, { error: 'Method not allowed.' }); }
      try {
        const file = await realpath(path.join(root, asset[0]));
        if (!file.startsWith(root + path.sep)) return json(res, 404, { error: 'Not found.' });
        const content = await readFile(file);
        res.writeHead(200, { 'Content-Type': asset[1], 'Cache-Control': 'no-cache' });
        return res.end(req.method === 'HEAD' ? undefined : content);
      } catch { return json(res, 404, { error: 'Not found.' }); }
    }
    if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return json(res, 405, { error: 'Use POST to validate an address.' }); }
    if (req.headers['sec-fetch-site'] === 'cross-site') return json(res, 403, { error: 'Cross-site requests are not allowed.' });
    if (req.headers.origin) {
      try { if (new URL(req.headers.origin).host !== req.headers.host) return json(res, 403, { error: 'Cross-site requests are not allowed.' }); }
      catch { return json(res, 403, { error: 'Invalid origin.' }); }
    }
    if (req.headers['content-type']?.split(';')[0].trim() !== 'application/json') return json(res, 415, { error: 'Send a JSON request.' });
    const now = Date.now();
    for (const [id, entry] of clients) if (entry.until <= now) clients.delete(id);
    const client = req.socket.remoteAddress;
    const bucket = clients.get(client) || { count: 0, until: now + 60000 };
    if (bucket.count >= limit || (!clients.has(client) && clients.size >= 10000)) {
      res.setHeader('Retry-After', '60');
      return json(res, 429, { error: 'Too many checks. Please wait a minute and try again.' });
    }
    bucket.count++; clients.set(client, bucket);
    const chunks = [];
    let size = 0;
    let email;
    try {
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 2048) { json(res, 413, { error: 'Request too large.' }); return; }
        chunks.push(chunk);
      }
      const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      email = typeof data?.email === 'string' ? data.email.trim() : '';
    } catch { return json(res, 400, { error: 'Send a valid JSON email request.' }); }
    if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\u0000-\u001f\u007f]/.test(email)) return json(res, 400, { error: 'Enter a valid email address.' });
    if (!apiKey.trim()) return json(res, 503, { error: 'Live validation is not configured yet. Add a new API key to the server environment. The sample report is available.' });
    try {
      const url = new URL('https://api.emailvalidation.io/v1/info');
      url.searchParams.set('email', email);
      const upstream = await fetchImpl(url, { headers: { apikey: apiKey }, signal: AbortSignal.timeout(timeoutMs), redirect: 'error' });
      if (!upstream.ok) {
        const status = upstream.status === 429 ? 429 : 502;
        return json(res, status, { error: upstream.status === 429 ? 'The validation service has reached its request limit. Please try later.' : 'The validation service is unavailable. Please check the server API configuration or try later.' });
      }
      const data = await upstream.json();
      if (!data || typeof data !== 'object' || Array.isArray(data) || data.error || !(typeof data.state === 'string' || typeof data.format_valid === 'boolean')) throw new Error('Invalid response');
      // Never forward provider errors, headers, or unexpected response fields.
      const safe = {};
      for (const field of fields) {
        const value = data[field];
        if (typeof value === 'string' && value.length <= 512 && !value.includes(apiKey)) safe[field] = value;
        else if (value === null || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) safe[field] = value;
      }
      if (safe.state === 'unkown') safe.state = 'unknown';
      return json(res, 200, safe);
    } catch (error) {
      return json(res, error.name === 'TimeoutError' ? 504 : 502, { error: error.name === 'TimeoutError' ? 'This check timed out. Please try again.' : 'Could not complete validation. Please try again later.' });
    }
  });
}

// Vercel imports the default server; only local CLI startup should bind a port.
const isLocalEntry = !process.env.VERCEL && process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isLocalEntry) {
  const envPath = path.join(root, '.env');
  if (existsSync(envPath)) process.loadEnvFile(envPath);
}

const server = createServer({ apiKey: process.env.EMAILVALIDATION_API_KEY || '' });
server.requestTimeout = 20000;
server.headersTimeout = 10000;
export default server;

if (isLocalEntry) {
  const port = Number(process.env.PORT || 4173);
  const host = process.env.HOST || '127.0.0.1';
  server.on('error', () => { console.error('Server could not start. Check HOST, PORT, and whether the port is already in use.'); process.exitCode = 1; });
  server.listen(port, host, () => console.log(`iValidate running at http://${host}:${port}`));
}
