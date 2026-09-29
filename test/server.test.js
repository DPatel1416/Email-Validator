import { test } from 'node:test';
import assert from 'node:assert/strict';
import server, { createServer } from '../server.js';
import { Server } from 'node:http';

test('Vercel entry exports an unbound HTTP server that serves the app', async t => {
  assert.ok(server instanceof Server);
  assert.equal(server.listening, false);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const asset of ['/', '/css/style.css', '/js/script.js', '/img/favicon.svg']) {
    assert.equal((await fetch(base + asset)).status, 200);
  }
  const invalid = await fetch(base + '/api/validate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'invalid' })
  });
  assert.equal(invalid.status, 400);
});

async function fixture(t, options = {}) {
  const server = createServer(options);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    get: pathname => fetch(base + pathname),
    post: (data, headers = {}) => fetch(base + '/api/validate', { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(data) })
  };
}

test('serves only public assets, never server files or secrets', async t => {
  const app = await fixture(t);
  for (const name of ['/', '/js/script.js', '/css/style.css', '/img/favicon.svg']) assert.equal((await app.get(name)).status, 200);
  for (const name of ['/.env', '/.env.example', '/.git/config', '/server.js', '/package.json', '/test/server.test.js', '/img/../.env', '/%2eenv']) assert.equal((await app.get(name)).status, 404);
  const js = await (await app.get('/js/script.js')).text();
  assert.doesNotMatch(js, /ema_live_|apikey|api\.emailvalidation\.io/);
});

test('validates input and reports missing configuration without calling provider', async t => {
  const app = await fixture(t, { fetchImpl: () => assert.fail('Unexpected provider request') });
  for (const email of ['', 'bad', 'a@@b.com', 'a@b.com\nX', 123]) assert.equal((await app.post({ email })).status, 400);
  assert.equal((await app.post({email:'hello@example.com'})).status,503);
  assert.equal((await app.get('/api/validate')).status,405);
  assert.equal((await app.post({email:'hello@example.com'},{Origin:'https://other.example'})).status,403);
  assert.equal((await app.post({email:'hello@example.com'},{'Content-Type':'text/plain'})).status,415);
  assert.equal((await app.post({email:'a'.repeat(3000)})).status,413);
});

test('uses server-only header authentication and filters provider output', async t => {
  const secret = 'test-secret-not-a-real-key';
  const app = await fixture(t, { apiKey: secret, fetchImpl: async (url, options) => {
    assert.equal(url.origin, 'https://api.emailvalidation.io');
    assert.equal(url.searchParams.get('email'), 'hello+tag@example.com');
    assert.equal(url.searchParams.has('apikey'), false);
    assert.equal(options.headers.apikey, secret);
    assert.equal(options.redirect, 'error');
    return new Response(JSON.stringify({email:'hello+tag@example.com',state:'deliverable',score:0.9,format_valid:true,smtp_check:true,catch_all:null,apikey:secret,reason:secret}));
  }});
  const res = await app.post({email:'hello+tag@example.com'});
  assert.equal(res.status,200);
  assert.equal(res.headers.get('cache-control'),'no-store');
  const text = await res.text();
  assert.doesNotMatch(text,new RegExp(secret));
  assert.equal(JSON.parse(text).state,'deliverable');
  assert.equal(JSON.parse(text).catch_all,null);
});

test('provider errors and timeouts are sanitized', async t => {
  const cases = [
    [async()=>new Response('secret',{status:401}),502],
    [async()=>new Response('secret',{status:429}),429],
    [async()=>new Response('invalid JSON'),502],
    [async()=>new Response(JSON.stringify({error:'secret'})),502],
    [async()=>{throw new DOMException('secret','TimeoutError');},504],
    [async()=>{throw new Error('secret');},502]
  ];
  for (const [fetchImpl,status] of cases) {
    const app = await fixture(t,{apiKey:'secret',fetchImpl});
    const res = await app.post({email:'hello@example.com'});
    assert.equal(res.status,status);
    assert.doesNotMatch(await res.text(),/secret/);
  }
});

test('limits requests before spending additional provider quota', async t => {
  let calls=0;
  const app=await fixture(t,{apiKey:'test',limit:1,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({state:'unknown'}));}});
  assert.equal((await app.post({email:'hello@example.com'})).status,200);
  const limited=await app.post({email:'hello@example.com'});
  assert.equal(limited.status,429);
  assert.equal(limited.headers.get('retry-after'),'60');
  assert.equal(calls,1);
});
