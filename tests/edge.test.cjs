const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('supabase/functions/vault-game/index.js','utf8');
function setup(){let handler;const Deno={env:{get:()=>undefined},serve:fn=>handler=fn};vm.runInNewContext(source,{Deno,Request,Response,URL,fetch,structuredClone,TextDecoder,Uint8Array});return handler}
test('edge rejects requests without user credentials',async()=>{const run=setup();const res=await run(new Request('https://example.test/'));assert.equal(res.status,401)});
test('edge rejects unapproved browser origin',async()=>{const run=setup();const res=await run(new Request('https://example.test/',{headers:{Origin:'https://unapproved.test'}}));assert.equal(res.status,403);assert.equal(res.headers.get('Access-Control-Allow-Origin'),null)});
test('edge permits local development preflight without credentials',async()=>{const run=setup();const res=await run(new Request('https://example.test/',{method:'OPTIONS',headers:{Origin:'http://127.0.0.1:8080'}}));assert.equal(res.status,204);assert.equal(res.headers.get('Access-Control-Allow-Origin'),'http://127.0.0.1:8080')});
