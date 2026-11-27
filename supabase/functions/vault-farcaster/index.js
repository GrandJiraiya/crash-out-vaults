import {createClient} from 'npm:@farcaster/quick-auth@0.0.8';
const client=createClient();
const origins=new Set(['https://crash-out-vaults-crashoutcrypto.vercel.app','https://crash-out-vaults-9npv1gqhq-crashoutcrypto.vercel.app']);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};
 if(origin&&origins.has(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization, apikey, content-type';headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS'}
 const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
 if(!origin||!origins.has(origin))return reply(403,{error:'Approved staging origin required'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!['GET','POST'].includes(req.method))return reply(405,{error:'Method not allowed'});
 const jwt=req.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
 if(!jwt||jwt.length>8192)return reply(401,{error:'Authentication required'});
 const url=Deno.env.get('SUPABASE_URL'),server=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
 if(!url||!server||!anon)return reply(503,{error:'Server unavailable'});
 try{
 const auth=await fetch(url+'/auth/v1/user',{headers:{apikey:anon,Authorization:'Bearer '+jwt}});
 if(!auth.ok)return reply(401,{error:'Authentication failed'});
 const user=await auth.json();if(user.is_anonymous||typeof user.id!=='string'||!uuid.test(user.id))return reply(401,{error:'Registered account required'});
 const dbHeaders={apikey:server,Authorization:'Bearer '+server,'Content-Type':'application/json'};
 const route=url+'/rest/v1/vault_farcaster_links?user_id=eq.'+encodeURIComponent(user.id)+'&select=fid,verified_at';
 const read=async()=>{const res=await fetch(route,{headers:dbHeaders});if(!res.ok)throw Error('Database unavailable');return (await res.json())[0]||null};
 if(req.method==='GET')return reply(200,{link:await read()});
 if(req.headers.get('content-type')?.split(';')[0]!=='application/json')return reply(415,{error:'JSON required'});
 const reader=req.body?.getReader();if(!reader)return reply(400,{error:'Missing proof'});
 let total=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>12288){await reader.cancel();return reply(413,{error:'Proof too large'})}chunks.push(value)}
 const bytes=new Uint8Array(total);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length}
 let body;try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{return reply(400,{error:'Invalid JSON'})}
 if(typeof body?.token!=='string'||body.token.length>8192)return reply(400,{error:'Invalid proof'});
 let fid;try{const payload=await client.verifyJwt({token:body.token,domain:new URL(origin).hostname});fid=payload.sub;if(!Number.isSafeInteger(fid)||fid<=0)throw Error('Invalid FID')}catch{return reply(401,{error:'Farcaster proof not verified'})}
 const existing=await read();if(existing)return existing.fid===fid?reply(200,{link:existing}):reply(409,{error:'Account already linked'});
 const write=await fetch(url+'/rest/v1/vault_farcaster_links',{method:'POST',headers:{...dbHeaders,Prefer:'return=minimal'},body:JSON.stringify({user_id:user.id,fid})});
 if(write.status===409)return reply(409,{error:'Farcaster identity or account already linked'});
 if(!write.ok)throw Error('Database unavailable');
 return reply(200,{link:await read()});
 }catch{return reply(503,{error:'Farcaster service unavailable'})}
});
