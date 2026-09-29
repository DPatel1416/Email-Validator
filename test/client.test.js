import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

function app(fetchImpl, protocol = 'http:') {
  const nodes = new Map();
  function node() { return {children:[],textContent:'',disabled:false,value:'test@example.com',firstElementChild:{textContent:''},append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items},setAttribute(){},addEventListener(event,fn){this[event]=fn},reportValidity(){return true}}; }
  const get = id => {if(!nodes.has(id)) nodes.set(id,node());return nodes.get(id)};
  const context=vm.createContext({document:{getElementById:get,createElement:node},window:{location:{protocol}},Date,AbortController,setTimeout,clearTimeout,fetch:fetchImpl,TypeError});
  vm.runInContext(readFileSync(new URL('../js/script.js',import.meta.url),'utf8'),context);
  return { async submit(){await get('validationForm').submit({preventDefault(){}});return get('resultCont').children[0].children[1].textContent}, get };
}

test('stopped server gives actionable guidance and releases controls', async()=>{
  const client=app(async()=>{throw new TypeError('Failed to fetch')});
  assert.match(await client.submit(),/start it with npm start/);
  assert.equal(client.get('submitBtn').disabled,false);
  assert.equal(client.get('demoButton').disabled,false);
});
test('static server response is distinguished from provider failure', async()=>{
  const client=app(async()=>new Response('<html>not found</html>',{status:404,headers:{'Content-Type':'text/html'}}));
  assert.match(await client.submit(),/backend is unavailable/);
});
test('provider error remains visible', async()=>{
  const client=app(async()=>new Response(JSON.stringify({error:'Provider quota reached.'}),{status:429,headers:{'Content-Type':'application/json'}}));
  assert.equal(await client.submit(),'Provider quota reached.');
});
test('opening HTML directly explains how to launch the server', async()=>{
  const client=app(()=>assert.fail('Must not fetch from file URL'),'file:');
  assert.match(await client.submit(),/opening index.html directly/);
});
