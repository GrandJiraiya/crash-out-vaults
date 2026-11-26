'use strict';
// Local development ONLY. Never deploy this file-backed store to Vercel.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {fresh,apply,rollover}=require('./engine.cjs');
const root=path.resolve(__dirname,'..'),dir=path.join(root,'.local-data'),port=Number(process.env.PORT||8080),origin='http://127.0.0.1:'+port;
fs.mkdirSync(dir,{recursive:true,mode:0o700});
const hash=v=>crypto.createHash('sha256').update(v).digest('hex');
function read(id){try{return JSON.parse(fs.readFileSync(path.join(dir,hash(id)+'.json'),'utf8'))}catch(e){if(e.code==='ENOENT')return null;throw e}}
function write(id,s){const target=path.join(dir,hash(id)+'.json'),tmp=target+'.tmp';fs.writeFileSync(tmp,JSON.stringify(s),{mode:0o600});fs.renameSync(tmp,target)}
function reply(res,status,value){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(value))}
async function body(req){let data='';for await(const chunk of req){data+=chunk;if(Buffer.byteLength(data)>2048)throw Object.assign(Error('Request too large'),{status:413})}try{return JSON.parse(data)}catch{throw Object.assign(Error('Invalid JSON'),{status:400})}}
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,origin);
 if(req.headers.host!=='127.0.0.1:'+port)return reply(res,403,{error:'Invalid host'});
 if(req.method==='GET'&&url.pathname==='/'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});return res.end(fs.readFileSync(path.join(root,'server','play.html')))}
 if(url.pathname!=='/api/game')return reply(res,404,{error:'Not found'});
 if(!['GET','POST'].includes(req.method))return reply(res,405,{error:'Method not allowed'});
 if(req.method==='POST'&&(req.headers.origin!==origin||req.headers['content-type']!=='application/json'))return reply(res,403,{error:'Invalid origin or content type'});
 const token=(req.headers.cookie||'').match(/(?:^|;\s*)vault_session=([a-f0-9]{64})(?:;|$)/)?.[1];
 if(req.method==='GET'){
  let id=token,s=id&&read(id);
  if(!s){id=crypto.randomBytes(32).toString('hex');s=fresh();write(id,s);res.setHeader('Set-Cookie','vault_session='+id+'; HttpOnly; SameSite=Strict; Path=/; Max-Age=2592000')}
  const before=s.day+' '+s.week;rollover(s,Date.now());if(before!==s.day+' '+s.week){s.revision++;write(id,s)}
  return reply(res,200,{state:s});
 }
 const cmd=await body(req);const s=token&&read(token);
 if(!s)return reply(res,401,{error:'Start a local session first'});
 // No await between read/apply/write; one Node process serializes state changes.
 const next=apply(s,cmd);write(token,next);return reply(res,200,{state:next});
}catch(e){if(!res.headersSent)reply(res,e.status||500,{error:e.status?e.message:'Server error'});else res.end()}});
server.listen(port,'127.0.0.1',()=>console.log('Local server demo: '+origin));
