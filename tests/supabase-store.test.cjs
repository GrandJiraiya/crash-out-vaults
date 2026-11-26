const test=require('node:test'),assert=require('node:assert/strict');
const {createStore}=require('../server/supabase-store.cjs');
const {fresh}=require('../server/engine.cjs');
const id='12345678-1234-1234-1234-123456789abc';
function fixture({anonymous=false,conflict=false}={}){
 let saved=fresh(),calls=[];
 const store=createStore({url:'https://example.supabase.co',serverKey:'server-test',publishableKey:'public-test',fetcher:async(url,opts)=>{
 calls.push({url,opts});
 const send=(data,status=200)=>new Response(JSON.stringify(data),{status});
 if(url.pathname==='/auth/v1/user')return opts.headers.Authorization==='Bearer user-test'?send({id,is_anonymous:anonymous}):send({},401);
 if(url.pathname==='/rest/v1/vault_player_state')return send([{state:saved,revision:saved.revision}]);
 if(url.pathname==='/rest/v1/rpc/vault_commit_action'){const body=JSON.parse(opts.body);assert.equal(body.p_user,id);if(conflict||saved.revision!==body.p_expected)return send(false);saved=body.p_next;return send(true)}
 throw Error('Unexpected request');
 }});
 return {store,calls};
}
test('Supabase derives identity from validated access token, not command',async()=>{const {store,calls}=fixture();const result=await store.act('user-test',{revision:0,action:'choose',value:'Paladin',user_id:'other',xp:9000});assert.equal(result.hero,'Paladin');assert.equal(result.xp,0);assert.equal(calls[0].opts.headers.apikey,'public-test');assert.equal(calls.at(-1).opts.headers.apikey,'server-test')});
test('Supabase rejects invalid and anonymous tokens before database access',async()=>{for(const [token,anonymous] of [['invalid',false],['user-test',true]]){const {store,calls}=fixture({anonymous});await assert.rejects(store.getState(token),{status:401});assert.equal(calls.length,1)}});
test('Supabase rejects racing commits rather than overwriting progress',async()=>{const {store}=fixture({conflict:true});await assert.rejects(store.act('user-test',{revision:0,action:'choose',value:'Warlock'}),{status:409})});
