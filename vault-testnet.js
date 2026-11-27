(function(root){
'use strict';
const CHAIN=84532n;
const address=v=>typeof v==='string'&&/^0x[0-9a-fA-F]{40}$/.test(v);
const quantity=v=>typeof v==='string'&&/^0x(?:0|[1-9a-f][0-9a-f]*)$/i.test(v)&&v.length<=66;
const realToken='0xf7914587e79d23117ba5f4f9848d508d09fc4b99';
function formatWei(n){const scale=10n**18n;const f=(n%scale).toString().padStart(18,'0').replace(/0+$/,'');return (n/scale).toString()+(f?'.'+f:'')}
async function inspect(provider){
 if(!provider||typeof provider.request!=='function')return {status:'unavailable',message:'Open in a compatible wallet browser.'};
 const chain=await provider.request({method:'eth_chainId'});
 if(!quantity(chain)||BigInt(chain)!==CHAIN)return {status:'wrong-chain',message:'Select Base Sepolia (84532) manually in your wallet. No network switch was requested.'};
 const accounts=await provider.request({method:'eth_accounts'});
 if(!Array.isArray(accounts)||!address(accounts[0]))return {status:'no-account',message:'Connect your wallet to this site using your wallet controls, then check again.'};
 const account=accounts[0];
 const raw=await provider.request({method:'eth_getBalance',params:[account,'latest']});
 const finalChain=await provider.request({method:'eth_chainId'});
 const finalAccounts=await provider.request({method:'eth_accounts'});
 if(!quantity(finalChain)||BigInt(finalChain)!==CHAIN||!Array.isArray(finalAccounts)||!address(finalAccounts[0])||finalAccounts[0].toLowerCase()!==account.toLowerCase())return {status:'changed',message:'Wallet or network changed during check. Refresh again.'};
 if(!quantity(raw))throw Error('Invalid RPC balance');
 return {status:'ready',account,balance:formatWei(BigInt(raw)),message:'Base Sepolia wallet detected. Test ETH is for gas only. Contracts are not deployed.'};
}
// Configuration is intentionally empty. Do not accept arbitrary addresses from the browser.
const config=Object.freeze({chainId:84532,token:null,lock:null,rewards:null,verified:false});
const api={inspect,formatWei,config};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VaultTestnet=api;
})(typeof window==='undefined'?globalThis:window);
