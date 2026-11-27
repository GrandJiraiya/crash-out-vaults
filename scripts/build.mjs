import {mkdir,copyFile} from 'node:fs/promises';
await mkdir('dist/vendor',{recursive:true});
for(const file of ['index.html','farcaster-host.js','cloud.html','obsidian.css','realm-art.svg','vault-audio.js'])await copyFile(file,'dist/'+file);
await copyFile('node_modules/@farcaster/miniapp-sdk/dist/index.min.js','dist/vendor/miniapp-sdk.js');
console.log('Built static app in dist/');
