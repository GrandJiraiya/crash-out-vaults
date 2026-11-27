'use strict';
// Offline deployment plan; never signs, broadcasts, or requests a private key.
const fs=require('node:fs'),path=require('node:path'),solc=require('solc');
const {ContractFactory,Contract,JsonRpcProvider,getAddress,getCreateAddress,keccak256}=require('ethers');
const CHAIN=84532n;
const names=['VaultTestToken','VaultTestLock','VaultTestRewards'];
function compile(){
 const source=fs.readFileSync(path.join(__dirname,'src/VaultTreasury.sol'),'utf8');
 const out=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'VaultTreasury.sol':{content:source}},settings:{evmVersion:'shanghai',optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object','evm.deployedBytecode.object','evm.deployedBytecode.immutableReferences']}}}}),{import:p=>{try{return {contents:fs.readFileSync(path.join(__dirname,'node_modules',p),'utf8')}}catch{return {error:'Import unavailable: '+p}}}}));
 const errors=(out.errors||[]).filter(x=>x.severity==='error');if(errors.length)throw Error(errors.map(x=>x.formattedMessage).join('\n'));return out.contracts['VaultTreasury.sol'];
}
async function plan({deployer,nonce,chainId=84532,artifacts=compile()}){
 if(BigInt(chainId)!==CHAIN)throw Error('Only Base Sepolia is supported');
 const from=getAddress(deployer);if(from==='0x0000000000000000000000000000000000000000'||!Number.isSafeInteger(nonce)||nonce<0||nonce>Number.MAX_SAFE_INTEGER-2)throw Error('Invalid deployer or nonce');
 const addresses=names.map((_,i)=>getCreateAddress({from,nonce:nonce+i}));
 const args=[[],[addresses[0]],[addresses[0],from]];
 const deployments=await Promise.all(names.map(async(name,i)=>{const a=artifacts[name],f=new ContractFactory(a.abi,a.evm.bytecode.object);const tx=await f.getDeployTransaction(...args[i]);return {name,address:addresses[i],from,nonce:nonce+i,chainId:Number(CHAIN),value:'0x0',data:tx.data,initCodeHash:keccak256(tx.data)}}));
 return {schema:1,chainId:Number(CHAIN),compiler:solc.version(),deployer:from,deployments};
}
// Compare every non-immutable runtime byte, then verify all immutable getters independently.
function runtimeMatches(code,artifact){
 if(typeof code!=='string'||!/^0x[0-9a-f]+$/i.test(code))return false;
 const expected=artifact.evm.deployedBytecode.object.toLowerCase(),actual=code.slice(2).toLowerCase();
 if(actual.length!==expected.length)return false;
 const mask=new Set();for(const refs of Object.values(artifact.evm.deployedBytecode.immutableReferences||{}))for(const r of refs)for(let i=r.start*2;i<(r.start+r.length)*2;i++)mask.add(i);
 for(let i=0;i<expected.length;i++)if(!mask.has(i)&&actual[i]!==expected[i])return false;return true;
}
async function verify(provider,{deployer,nonce,hashes},artifacts=compile()){
 if((await provider.getNetwork()).chainId!==CHAIN)throw Error('Wrong network');
 if(!Array.isArray(hashes)||hashes.length!==3||hashes.some(h=>typeof h!=='string'||!/^0x[0-9a-f]{64}$/i.test(h)))throw Error('Three deployment transaction hashes required');
 const p=await plan({deployer,nonce,artifacts});
 const confirmed=[];
 for(let i=0;i<3;i++){
  const d=p.deployments[i],hash=hashes[i],tx=await provider.getTransaction(hash),receipt=await provider.getTransactionReceipt(hash);
  if(!tx||!receipt||receipt.status!==1||await receipt.confirmations()<12||tx.chainId!==CHAIN||tx.to!==null||getAddress(tx.from)!==d.from||tx.nonce!==d.nonce||tx.value!==0n||tx.data.toLowerCase()!==d.data.toLowerCase()||!receipt.contractAddress||getAddress(receipt.contractAddress)!==d.address)throw Error('Deployment transaction not verified: '+d.name);
  const code=await provider.getCode(d.address);if(!runtimeMatches(code,artifacts[d.name]))throw Error('Unexpected runtime: '+d.name);
  confirmed.push({name:d.name,address:d.address,transactionHash:hash,runtimeHash:keccak256(code),block:receipt.blockNumber});
 }
 const [asset,lock,rewards]=confirmed.map(x=>x.address);
 const t=new Contract(asset,artifacts.VaultTestToken.abi,provider),l=new Contract(lock,artifacts.VaultTestLock.abi,provider),r=new Contract(rewards,artifacts.VaultTestRewards.abi,provider);
 if(await t.name()!=='Vault Wars TEST ONLY'||await t.symbol()!=='VAULTTEST'||await t.decimals()!==18n||await t.totalSupply()!==1_000_000n*10n**18n||getAddress(await l.token())!==asset||getAddress(await r.token())!==asset||getAddress(await r.publisher())!==p.deployer)throw Error('Contract identity mismatch');
 return {schema:1,chainId:Number(CHAIN),verifiedAt:new Date().toISOString(),compiler:p.compiler,contracts:confirmed,warning:'Testnet only. Verification is not an audit.'};
}
async function main(){const [mode,...args]=process.argv.slice(2);if(mode==='plan'){const [deployer,nonce]=args;if(!/^(0|[1-9]\d*)$/.test(nonce||''))throw Error('Supply explicit pending nonce');console.log(JSON.stringify(await plan({deployer,nonce:Number(nonce)}),null,2));return}if(mode==='verify'){const [file]=args;const rpc=process.env.BASE_SEPOLIA_RPC_URL||'https://sepolia.base.org';if(new URL(rpc).protocol!=='https:')throw Error('HTTPS RPC required');const provider=new JsonRpcProvider(rpc);try{console.log(JSON.stringify(await verify(provider,JSON.parse(fs.readFileSync(file,'utf8'))),null,2))}finally{provider.destroy()}return}throw Error('Usage: node gateway.cjs plan DEPLOYER PENDING_NONCE | verify receipt-input.json')}
if(require.main===module)main().catch(e=>{console.error(e.message);process.exitCode=1});
module.exports={compile,plan,runtimeMatches,verify};
