'use strict';
// Authoritative demo rules. Never accept a state object from an HTTP client.
const CLASSES={Paladin:{hp:130,atk:12,def:7},Assassin:{hp:95,atk:19,def:2},Warlock:{hp:110,atk:15,def:4}};
const DUNGEONS={1:{name:'Vault Sentinel',hp:55,atk:11,points:20,xp:40,unlock:1},2:{name:'Ashen Warden',hp:110,atk:19,points:35,xp:65,unlock:3},3:{name:'Void Colossus',hp:185,atk:28,points:50,xp:90,unlock:5}};
const ITEMS={blade:{slot:'weapon',atk:5},shield:{slot:'armor',def:3,hp:15},crown:{slot:'relic',atk:6,def:2,hp:10},vault:{slot:'weapon',atk:10}};
const QUESTS={dungeons:{target:3,bonus:15},skills:{target:5,bonus:10}};
const own=(o,k)=>Object.prototype.hasOwnProperty.call(o,k);
const day=n=>new Date(n).toISOString().slice(0,10);
function week(n){const d=new Date(n);d.setUTCHours(0,0,0,0);d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);return day(d)}
function fresh(now=Date.now()){return {revision:0,hero:null,xp:0,gear:1,points:0,day:day(now),week:week(now),daily:{dungeons:0,skills:0},dailyClaimed:{},loot:[],equipped:{},claimed:false,raidDone:false,hp:0,enemy:null,turn:0,recoveries:2,message:'Choose a class.'}}
function level(s){return 1+Math.floor(s.xp/100)}
function bonus(s,stat){return Object.values(s.equipped).reduce((n,id)=>n+(ITEMS[id]?.[stat]||0),0)}
function maxHP(s){return CLASSES[s.hero].hp+(level(s)-1)*5+bonus(s,'hp')}
function rollover(s,now){if(s.day!==day(now)){s.day=day(now);s.daily={dungeons:0,skills:0};s.dailyClaimed={}}if(s.week!==week(now)){s.week=week(now);s.points=0;s.claimed=false;s.raidDone=false;if(s.enemy?.boss)s.enemy=null}}
function fail(message){throw Object.assign(new Error(message),{status:400})}
function loot(s,id){if(!s.loot.includes(id))s.loot.push(id)}
function apply(original,command,now=Date.now()){
 if(!command||typeof command!=='object'||Array.isArray(command))fail('Invalid command');
 const {action,value,revision}=command;
 if(!Number.isSafeInteger(revision)||revision!==original.revision)throw Object.assign(new Error('Stale revision; refresh before retrying.'),{status:409});
 const s=structuredClone(original);rollover(s,now);
 if(action==='choose'){
  if(s.hero||typeof value!=='string'||!own(CLASSES,value))fail('Invalid class choice');
  s.hero=value;s.hp=maxHP(s);s.message='Your journey begins.';
 }else{
  if(!s.hero)fail('Choose a class first');
  if(action==='dungeon'||action==='raid'){
   const boss=action==='raid',d=DUNGEONS[value];
   if(s.enemy||(!boss&&(!Number.isInteger(value)||!own(DUNGEONS,value)||level(s)<d.unlock))||(boss&&(s.raidDone||level(s)<2)))fail('Encounter unavailable');
   const hp=boss?150+level(s)*10:d.hp+level(s)*8;
   s.enemy={name:boss?'The Hollow King':d.name,hp,max:hp,atk:boss?20+level(s):d.atk+level(s),boss,points:boss?60:d.points,xp:boss?100:d.xp};
   s.hp=maxHP(s);s.turn=0;s.recoveries=2;s.message='An enemy approaches.';
  }else if(['attack','skill','heal'].includes(action)){
   const e=s.enemy,c=CLASSES[s.hero];
   if(!e||s.hp<=0||(action==='heal'&&s.recoveries<=0)||(action==='skill'&&s.turn%3!==0))fail('Combat action unavailable');
   if(action==='skill')s.daily.skills++;
   if(action==='heal'){s.recoveries--;s.hp=Math.min(maxHP(s),s.hp+Math.ceil(maxHP(s)*.3));s.message='Recovered health.'}
   else{const damage=c.atk+level(s)*2+s.gear*2+bonus(s,'atk')+(action==='skill'?(s.hero==='Assassin'?18:12):0);e.hp=Math.max(0,e.hp-damage);s.message='Dealt '+damage+' damage.';if(action==='skill'&&s.hero==='Warlock')s.hp=Math.min(maxHP(s),s.hp+12)}
   if(e.hp===0){s.points+=e.points;s.xp+=e.xp;if(e.boss){s.raidDone=true;loot(s,'crown')}else{s.daily.dungeons++;loot(s,'blade');if(s.xp>=120)loot(s,'shield')}s.enemy=null;s.hp=maxHP(s);s.message+=' Victory! +'+e.points+' points.'}
   else{const hit=Math.max(1,e.atk-c.def-bonus(s,'def')-(action==='skill'&&s.hero==='Paladin'?5:0));s.hp=Math.max(0,s.hp-hit);s.turn++;s.message+=' Enemy dealt '+hit+' damage.';if(!s.hp){s.enemy=null;s.message+=' Defeated.'}}
  }else if(action==='equip'){
   if(s.enemy||typeof value!=='string'||!own(ITEMS,value)||!s.loot.includes(value))fail('Equipment unavailable');
   s.equipped[ITEMS[value].slot]=value;s.hp=maxHP(s);s.message='Equipment updated.';
  }else if(action==='quest'){
   if(typeof value!=='string'||!own(QUESTS,value)||s.dailyClaimed[value]||s.daily[value]<QUESTS[value].target)fail('Quest unavailable');
   s.dailyClaimed[value]=true;s.points+=QUESTS[value].bonus;s.message='Daily reward claimed.';
  }else if(action==='vault'){
   if(s.claimed||s.points<100)fail('Vault unavailable');
   s.claimed=true;s.gear++;loot(s,'vault');s.message='Demo vault claimed.';
  }else fail('Unknown action');
 }
 s.revision++;return s;
}




// Server only. Do not include this module or its credentials in dist/.
function createStore({url,serverKey,publishableKey,fetcher=fetch}){
 if(!url||!serverKey||!publishableKey)throw Error('Missing server Supabase configuration');
 const base=new URL(url);if(base.protocol!=='https:'||base.pathname!=='/'||base.username||base.password)throw Error('Invalid Supabase URL');
 async function request(path,options={},accessToken=null){
  const res=await fetcher(new URL(path,base),{...options,headers:{apikey:accessToken?publishableKey:serverKey,Authorization:'Bearer '+(accessToken||serverKey),'Content-Type':'application/json',...options.headers}});
  if(!res.ok)throw Object.assign(Error(accessToken?'Authentication failed':'Database request failed'),{status:accessToken?401:502});
  return res.status===204?null:res.json();
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



const allowed=new Set(['http://127.0.0.1:8080','http://localhost:8080',...(Deno.env.get('VAULT_ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean)]);
Deno.serve(async req=>{
 const origin=req.headers.get('origin');
 const headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
 if(origin&&allowed.has(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization, apikey, content-type';headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS'}
 const reply=(status,body)=>new Response(JSON.stringify(body),{status,headers});
 if(origin&&!allowed.has(origin))return reply(403,{error:'Origin not allowed'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!['GET','POST'].includes(req.method))return reply(405,{error:'Method not allowed'});
 const token=req.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
 if(!token)return reply(401,{error:'Authentication required'});
 try{
 const store=createStore({url:Deno.env.get('SUPABASE_URL'),serverKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),publishableKey:Deno.env.get('SUPABASE_ANON_KEY')});
 if(req.method==='GET')return reply(200,{state:await store.getState(token)});
 if(req.headers.get('content-type')?.split(';')[0]!=='application/json')return reply(415,{error:'JSON required'});
 const reader=req.body?.getReader();if(!reader)return reply(400,{error:'Missing command'});
 const chunks=[];let count=0;
 while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>2048){await reader.cancel();return reply(413,{error:'Command too large'})}chunks.push(value)}
 const bytes=new Uint8Array(count);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}
 let command;try{command=JSON.parse(new TextDecoder().decode(bytes))}catch{return reply(400,{error:'Invalid JSON'})}
 return reply(200,{state:await store.act(token,command)});
 }catch(e){return reply([400,401,409,502].includes(e.status)?e.status:500,{error:[400,401,409].includes(e.status)?e.message:'Service unavailable'})}
});
