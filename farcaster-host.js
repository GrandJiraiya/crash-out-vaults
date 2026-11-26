'use strict';
// The SDK is served from our own deployment, never loaded from an external CDN.
(async()=>{const timeout=(p,ms=1800)=>Promise.race([Promise.resolve(p),new Promise((_,reject)=>setTimeout(()=>reject(Error('Host timed out')),ms))]);
try{await timeout(new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='vendor/miniapp-sdk.js';script.onload=resolve;script.onerror=reject;document.head.append(script)}));const sdk=window.miniapp?.sdk;if(!sdk||!await timeout(sdk.isInMiniApp()))return;
let provider=null;try{provider=await timeout(sdk.wallet.getEthereumProvider())}catch{}
window.dispatchEvent(new CustomEvent('vaultwars:host',{detail:{provider}}));await timeout(sdk.actions.ready());
}catch{/* Plain browser and Base wallet mode remain available. */}})();