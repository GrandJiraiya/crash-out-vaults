const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const solc=require('solc'),ganache=require('ganache'),{BrowserProvider,ContractFactory,parseEther}=require('ethers');
const source=fs.readFileSync(path.join(__dirname,'src/VaultTreasury.sol'),'utf8');
const output=JSON.parse(solc.compile(JSON.stringify({language:'Solidity',sources:{'VaultTreasury.sol':{content:source}},settings:{evmVersion:'shanghai',optimizer:{enabled:true,runs:200},outputSelection:{'*':{'*':['abi','evm.bytecode.object']}}}}),{import:p=>{try{return {contents:fs.readFileSync(path.join(__dirname,'node_modules',p),'utf8')}}catch{return {error:'Import unavailable: '+p}}}}));
const errors=(output.errors||[]).filter(e=>e.severity==='error');assert.equal(errors.length,0,errors.map(e=>e.formattedMessage).join('\n'));
const artifacts=output.contracts['VaultTreasury.sol'];
const units=n=>parseEther(String(n));const day=86400;
async function fixture(t,chainId=1337){const raw=ganache.provider({chain:{chainId,hardfork:'shanghai',time:new Date('2026-11-26T12:00:00Z')},logging:{quiet:true},wallet:{totalAccounts:4,defaultBalance:100}});t.after(()=>raw.disconnect());const provider=new BrowserProvider(raw);provider.pollingInterval=25;const owner=await provider.getSigner(0),alice=await provider.getSigner(1),bob=await provider.getSigner(2);
const deploy=async(name,args=[])=>{const a=artifacts[name];const c=await new ContractFactory(a.abi,a.evm.bytecode.object,owner).deploy(...args);await c.waitForDeployment();return c};
const advance=async secs=>{await raw.request({method:'evm_increaseTime',params:[secs]});await raw.request({method:'evm_mine',params:[]})};
return {owner,alice,bob,deploy,advance,raw}};
const tx=async p=>(await p).wait();
const rejects=async p=>assert.rejects(async()=>{const r=await p;if(r?.wait)await r.wait()});
const week=Math.floor(Date.parse('2026-11-16T00:00:00Z')/1000);
test('deployment on Base mainnet chain ID is rejected',async t=>{const f=await fixture(t,8453);await assert.rejects(f.deploy('VaultTestToken'))});
test('principal-only lock returns exact deposit after maturity, once',async t=>{const f=await fixture(t),token=await f.deploy('VaultTestToken'),lock=await f.deploy('VaultTestLock',[await token.getAddress()]);const a=await f.alice.getAddress(),l=await lock.getAddress();await tx(token.transfer(a,units(100)));await tx(token.connect(f.alice).approve(l,units(100)));await rejects(lock.connect(f.alice).lock(0,7));await rejects(lock.connect(f.alice).lock(units(100),8));await tx(lock.connect(f.alice).lock(units(100),7));assert.equal(await lock.totalLocked(),units(100));assert.equal(await token.balanceOf(a),0n);await rejects(lock.connect(f.alice).lock(units(1),7));await rejects(lock.connect(f.alice).release());await rejects(lock.connect(f.bob).release());await f.advance(7*day+1);await tx(lock.connect(f.alice).release({gasLimit:200000}));assert.equal(await token.balanceOf(a),units(100));assert.equal(await lock.totalLocked(),0n);await rejects(lock.connect(f.alice).release())});
test('unfunded or unauthorized allocations cannot be published',async t=>{const f=await fixture(t),token=await f.deploy('VaultTestToken'),vault=await f.deploy('VaultTestRewards',[await token.getAddress(),await f.owner.getAddress()]),a=await f.alice.getAddress();await rejects(vault.connect(f.alice).publish(week,[a],[units(10)]));await rejects(vault.publish(week,[a],[units(10)]));assert.equal((await vault.epochs(week)).published,false);assert.equal(await vault.totalReserved(),0n)});
test('fully funded immutable allocations, claims and expired refunds conserve balances',async t=>{const f=await fixture(t),token=await f.deploy('VaultTestToken'),vault=await f.deploy('VaultTestRewards',[await token.getAddress(),await f.owner.getAddress()]);const a=await f.alice.getAddress(),b=await f.bob.getAddress(),v=await vault.getAddress();await tx(token.approve(v,units(100)));await rejects(vault.publish(week,[a,a],[units(10),units(10)]));await rejects(vault.publish(week+1,[a],[units(10)]));await rejects(vault.publish(week+7*day,[a],[units(10)]));await tx(vault.publish(week,[a,b],[units(40),units(60)]));assert.equal(await vault.totalReserved(),units(100));assert.equal(await token.balanceOf(v),units(100));await rejects(vault.publish(week,[a],[units(1)]));await rejects(vault.refundExpired(week));await rejects(vault.claim(week));await tx(vault.connect(f.alice).claim(week));assert.equal(await token.balanceOf(a),units(40));assert.equal(await vault.totalReserved(),units(60));await rejects(vault.connect(f.alice).claim(week));await f.advance(30*day+1);await rejects(vault.connect(f.bob).claim(week));const prior=await token.balanceOf(await f.owner.getAddress());await tx(vault.connect(f.bob).refundExpired(week,{gasLimit:200000}));assert.equal(await token.balanceOf(await f.owner.getAddress()),prior+units(60));assert.equal(await token.balanceOf(v),0n);assert.equal(await vault.totalReserved(),0n);await rejects(vault.refundExpired(week))});

test('unsigned Sepolia plan predicts deployment addresses and verifier rejects modified code',async t=>{
 const {compile,plan,runtimeMatches,verify}=require('./gateway.cjs');
 const f=await fixture(t,84532),from=await f.owner.getAddress(),a=compile(),p=await plan({deployer:from,nonce:0,artifacts:a});
 assert.equal(p.chainId,84532);assert.equal(p.deployments.length,3);assert.equal(p.deployments[2].nonce,2);
 await assert.rejects(plan({deployer:from,nonce:0,chainId:8453,artifacts:a}));
 const token=await f.deploy('VaultTestToken'),lock=await f.deploy('VaultTestLock',[await token.getAddress()]),reward=await f.deploy('VaultTestRewards',[await token.getAddress(),from]);
 const contracts=[token,lock,reward];for(let i=0;i<3;i++){assert.equal(await contracts[i].getAddress(),p.deployments[i].address);assert.equal(contracts[i].deploymentTransaction().data,p.deployments[i].data)}
 for(let i=0;i<13;i++)await f.raw.request({method:'evm_mine',params:[]});
 const provider=new BrowserProvider(f.raw);const hashes=contracts.map(c=>c.deploymentTransaction().hash);
 const manifest=await verify(provider,{deployer:from,nonce:0,hashes},a);
 assert.equal(manifest.contracts.length,3);assert.equal(manifest.contracts[0].address,await token.getAddress());
 const code=await provider.getCode(await lock.getAddress());assert.equal(runtimeMatches(code,a.VaultTestLock),true);assert.equal(runtimeMatches('0x00'+code.slice(4),a.VaultTestLock),false);
 await assert.rejects(verify(provider,{deployer:from,nonce:0,hashes:[hashes[1],hashes[0],hashes[2]]},a));
});
test('static-call simulations do not transfer tokens or create lock positions',async t=>{
 const f=await fixture(t,84532),token=await f.deploy('VaultTestToken'),lock=await f.deploy('VaultTestLock',[await token.getAddress()]);const a=await f.alice.getAddress(),l=await lock.getAddress();
 await tx(token.transfer(a,units(50)));
 await assert.rejects(lock.connect(f.alice).lock.staticCall(units(10),7));
 await tx(token.connect(f.alice).approve(l,units(10)));
 await lock.connect(f.alice).lock.staticCall(units(10),7);
 assert.equal((await lock.positions(a)).amount,0n);assert.equal(await token.balanceOf(a),units(50));assert.equal(await token.allowance(a,l),units(10));
 await tx(lock.connect(f.alice).lock(units(10),7));await assert.rejects(lock.connect(f.alice).release.staticCall());
 await f.advance(7*day+1);await lock.connect(f.alice).release.staticCall();assert.equal((await lock.positions(a)).amount,units(10));
});

test('overlapping epochs preserve other reserved balances when one expires',async t=>{const f=await fixture(t),token=await f.deploy('VaultTestToken'),vault=await f.deploy('VaultTestRewards',[await token.getAddress(),await f.owner.getAddress()]);const a=await f.alice.getAddress(),b=await f.bob.getAddress(),v=await vault.getAddress();await tx(token.approve(v,units(100)));await tx(vault.publish(week,[a],[units(40)]));await f.advance(8*day);await tx(vault.publish(week+7*day,[b],[units(60)]));await f.advance(23*day);await tx(vault.refundExpired(week));assert.equal(await vault.totalReserved(),units(60));assert.equal(await token.balanceOf(v),units(60));await tx(vault.connect(f.bob).claim(week+7*day));assert.equal(await vault.totalReserved(),0n);assert.equal(await token.balanceOf(b),units(60))});
test('independent lock positions remain collateralized when one matures',async t=>{const f=await fixture(t),token=await f.deploy('VaultTestToken'),lock=await f.deploy('VaultTestLock',[await token.getAddress()]);const a=await f.alice.getAddress(),b=await f.bob.getAddress(),l=await lock.getAddress();for(const [signer,addr,n,days] of [[f.alice,a,10,7],[f.bob,b,20,30]]){await tx(token.transfer(addr,units(n)));await tx(token.connect(signer).approve(l,units(n)));await tx(lock.connect(signer).lock(units(n),days))}await f.advance(8*day);await tx(lock.connect(f.alice).release());await rejects(lock.connect(f.bob).release());assert.equal(await token.balanceOf(l),units(20));assert.equal(await lock.totalLocked(),units(20));await f.advance(23*day);await tx(lock.connect(f.bob).release({gasLimit:200000}));assert.equal(await lock.totalLocked(),0n);assert.equal(await token.balanceOf(b),units(20))});
