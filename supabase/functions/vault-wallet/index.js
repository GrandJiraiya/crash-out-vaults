import {createPublicClient,http} from 'npm:viem@2.37.9';
import {base} from 'npm:viem@2.37.9/chains';
const chain=createPublicClient({chain:base,transport:http(Deno.env.get('VAULT_BASE_RPC_URL')||'https://mainnet.base.org',{timeout:8000,retryCount:0})});
const origins=new Set(['http://localhost:8080','http://127.0.0.1:8080',...(Deno.env.get('VAULT_ALLOWED_ORIGINS')||'').split(',').map(s=>s.trim()).filter(Boolean)]);
const addressPattern=/^0x[0-9a-f]{40}$/;
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const tokenAddress='0xf7914587e79d23117ba5f4f9848d508d09fc4b99';
const message=c=>['Crash Out Vaults: link wallet to your game account','This signature proves ownership only. No transaction, approval or transfer.', 'Origin: '+c.origin,'Wallet: '+c.address,'Chain ID: 8453','Nonce: '+c.nonce,'Expires: '+c.expires_at].join('\n');
Deno.serve(async req=>{
 const origin=req.headers.get('origin'),headers={'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
 if(origin&&origins.has(origin)){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Headers']='authorization, apikey, content-type';headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS'}
 const reply=(status,data)=>new Response(JSON.stringify(data),{status,headers});
 if(origin&&!origins.has(origin))return reply(403,{error:'Origin not allowed'});
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(!['GET','POST'].includes(req.method))return reply(405,{error:'Method not allowed'});
 const jwt=req.headers.get('authorization')?.match(/^Bearer ([^\s]+)$/i)?.[1];
 if(!jwt||jwt.length>8192)return reply(401,{error:'Authentication required'});
 const url=Deno.env.get('SUPABASE_URL'),server=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),anon=Deno.env.get('SUPABASE_ANON_KEY');
 if(!url||!server||!anon)return reply(503,{error:'Server unavailable'});
 try{
 const auth=await fetch(url+'/auth/v1/user',{headers:{apikey:anon,Authorization:'Bearer '+jwt}});
 if(!auth.ok)return reply(401,{error:'Authentication failed'});
 const user=await auth.json();if(user.is_anonymous||!uuidPattern.test(user.id))return reply(401,{error:'Registered account required'});
 const db=async(path,data)=>{const res=await fetch(url+'/rest/v1/'+path,{method:data?'POST':'GET',headers:{apikey:server,Authorization:'Bearer '+server,'Content-Type':'application/json'},...(data?{body:JSON.stringify(data)}:{})});if(!res.ok)throw Error('Database unavailable');return res.json()};
 if(req.method==='GET'){const rows=await db('vault_wallet_links?user_id=eq.'+user.id+'&select=address,chain_id,verified_at');const link=rows[0]||null;let balance=null;if(link){try{const abi=[{type:'function',name:'balanceOf',stateMutability:'view',inputs:[{type:'address'}],outputs:[{type:'uint256'}]},{type:'function',name:'decimals',stateMutability:'view',inputs:[],outputs:[{type:'uint8'}]}];const [raw,decimals]=await Promise.all([chain.readContract({address:tokenAddress,abi,functionName:'balanceOf',args:[link.address]}),chain.readContract({address:tokenAddress,abi,functionName:'decimals'})]);balance={raw:raw.toString(),decimals:Number(decimals)}}catch{}}return reply(200,{link,balance})}
 if(!origin||!origins.has(origin))return reply(403,{error:'Approved browser origin required'});
 if(req.headers.get('content-type')?.split(';')[0]!=='application/json')return reply(415,{error:'JSON required'});
 const reader=req.body?.getReader();if(!reader)return reply(400,{error:'Missing request'});let count=0;const chunks=[];while(true){const {done,value}=await reader.read();if(done)break;count+=value.length;if(count>16384){await reader.cancel();return reply(413,{error:'Request too large'})}chunks.push(value)}const bytes=new Uint8Array(count);let offset=0;for(const c of chunks){bytes.set(c,offset);offset+=c.length}let body;try{body=JSON.parse(new TextDecoder().decode(bytes))}catch{return reply(400,{error:'Invalid JSON'})}
 if(body?.action==='challenge'){const address=typeof body.address==='string'?body.address.toLowerCase():'';if(!addressPattern.test(address)||address==='0x0000000000000000000000000000000000000000')return reply(400,{error:'Invalid wallet address'});const c=await db('rpc/vault_wallet_issue',{p_user:user.id,p_address:address,p_origin:origin});if(!c)return reply(409,{error:'Wallet already linked or challenge cooldown active'});return reply(200,{nonce:c.nonce,message:message(c)})}
 if(body?.action==='verify'){if(typeof body.nonce!=='string'||!uuidPattern.test(body.nonce)||typeof body.signature!=='string'||!/^0x(?:[0-9a-fA-F]{2})+$/.test(body.signature)||body.signature.length>16000)return reply(400,{error:'Invalid proof'});const c=await db('rpc/vault_wallet_take',{p_user:user.id,p_nonce:body.nonce,p_origin:origin});if(!c)return reply(409,{error:'Challenge expired, invalid or already used'});let valid=false;try{valid=await chain.verifyMessage({address:c.address,message:message(c),signature:body.signature})}catch{}if(!valid)return reply(400,{error:'Signature could not be verified. Request a new challenge.'});const linked=await db('rpc/vault_wallet_finish',{p_user:user.id,p_nonce:c.nonce});if(!linked)return reply(409,{error:'Wallet or account already linked, or challenge expired'});return reply(200,{linked:true,address:c.address})}
 return reply(400,{error:'Unknown action'});
 }catch{return reply(503,{error:'Wallet service unavailable'})}
});
