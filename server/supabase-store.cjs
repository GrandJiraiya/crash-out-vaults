'use strict';
const {fresh,apply,rollover}=require('./engine.cjs');
// Server only. Do not include this module or its credentials in dist/.
function createStore({url,serverKey,publishableKey,fetcher=fetch}){
 if(!url||!serverKey||!publishableKey)throw Error('Missing server Supabase configuration');
 const base=new URL(url);if(base.protocol!=='https:'||base.pathname!=='/'||base.username||base.password)throw Error('Invalid Supabase URL');
 async function request(path,options={},accessToken=null){
  const res=await fetcher(new URL(path,base),{...options,headers:{apikey:accessToken?publishableKey:serverKey,Authorization:'Bearer '+(accessToken||serverKey),'Content-Type':'application/json',...options.headers}});
  if(!res.ok){if(!accessToken&&res.status===429)throw Object.assign(Error('Action rate limit; retry shortly'),{status:429});throw Object.assign(Error(accessToken?'Authentication failed':'Database request failed'),{status:accessToken?401:502});}
  if(res.status===204||options.headers?.Prefer?.split(',').includes('return=minimal'))return null;
  return res.json();
 }
 async function identity(token){
  if(typeof token!=='string'||!token||token.length>8192)throw Object.assign(Error('Authentication required'),{status:401});
  const user=await request('/auth/v1/user',{},token);
  if(!user||typeof user.id!=='string'||!(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(user.id))||user.is_anonymous)throw Object.assign(Error('Verified non-guest account required'),{status:401});
  return user.id;
 }
 const route=id=>'/rest/v1/vault_player_state?user_id=eq.'+encodeURIComponent(id)+'&select=state,revision';
 async function load(id,now){
  let rows=await request(route(id));if(!rows.length){
   await request('/rest/v1/vault_player_state?on_conflict=user_id',{method:'POST',headers:{Prefer:'resolution=ignore-duplicates,return=minimal'},body:JSON.stringify({user_id:id,revision:0,state:fresh(now)})});
   rows=await request(route(id));
  }
  if(rows.length!==1||rows[0].state.revision!==rows[0].revision)throw Object.assign(Error('Invalid player state'),{status:502});
  return rows[0].state;
 }
 async function commit(id,previous,next,action){
  const ok=await request('/rest/v1/rpc/vault_commit_action',{method:'POST',body:JSON.stringify({p_user:id,p_expected:previous.revision,p_next:next,p_action:action})});
  if(ok!==true)throw Object.assign(Error('Stale revision; reload player state'),{status:409});
 }
 return {
  async getState(token){const id=await identity(token),now=Date.now(),s=await load(id,now);const next=structuredClone(s);rollover(next,now);if(next.day!==s.day||next.week!==s.week){next.revision++;await commit(id,s,next,'rollover');return next}return s},
  async act(token,command){const id=await identity(token),now=Date.now(),s=await load(id,now);const next=apply(s,command,now);await commit(id,s,next,command.action);return next}
 };
}
module.exports={createStore};
