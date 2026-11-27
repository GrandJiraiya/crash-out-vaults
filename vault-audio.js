/* Original procedural score and effects for Vault Wars. No samples, network or playback on load. */
(function(root){
'use strict';
const DEFAULT=Object.freeze({enabled:false,muted:false,music:45,effects:65});
const clamp=(n,f)=>typeof n==='number'&&Number.isFinite(n)?Math.max(0,Math.min(100,Math.round(n))):f;
function normalize(v={}){v=v&&typeof v==='object'?v:{};return {enabled:v.enabled===true,muted:v.muted===true,music:clamp(v.music,45),effects:clamp(v.effects,65)}}
const KEY='vaultwars.audio.v1';
const THEMES=Object.freeze({
 menu:{bpm:72,bass:[38,38,34,36],melody:[62,null,65,69,67,null,65,60],wave:'sine',pulse:0},
 crypt:{bpm:66,bass:[36,36,39,35],melody:[60,null,63,null,66,63,null,59],wave:'triangle',pulse:0},
 ashen:{bpm:100,bass:[40,40,43,38],melody:[64,64,67,62,64,null,70,67],wave:'sawtooth',pulse:1},
 void:{bpm:84,bass:[37,44,40,39],melody:[61,68,64,null,70,66,63,null],wave:'sine',pulse:0},
 boss:{bpm:118,bass:[38,34,36,33],melody:[62,69,70,65,67,64,65,61],wave:'triangle',pulse:1}
});
const hz=n=>440*Math.pow(2,(n-69)/12);
function themeFor(screen,enemy){if(screen!=='battle'||!enemy)return 'menu';if(enemy.boss)return 'boss';return enemy.name==='Ashen Warden'?'ashen':enemy.name==='Void Colossus'?'void':'crypt'}
function createAudio(env=root){
 let prefs={...DEFAULT},ctx=null,master,musicBus,fxBus,timer=null,scene='menu',step=0,next=0,generation=0,running=false,visible=true,starting=false;
 const voices=new Set();
 try{prefs=normalize(JSON.parse(env.localStorage.getItem(KEY)||'{}'))}catch{}
 function save(){try{env.localStorage.setItem(KEY,JSON.stringify(prefs))}catch{}}
 function volume(){if(!ctx)return;const t=ctx.currentTime;master.gain.setTargetAtTime(prefs.muted||!prefs.enabled||!visible?0:.55,t,.035);musicBus.gain.setTargetAtTime(prefs.music/100*.23,t,.035);fxBus.gain.setTargetAtTime(prefs.effects/100*.42,t,.035)}
 function stopVoices(bus){for(const v of [...voices])if(!bus||v.bus===bus){try{v.osc.stop()}catch{}voices.delete(v)}}
 function stopLoop(){if(timer!==null){env.clearInterval(timer);timer=null}stopVoices('music');running=false}
 function tone(note,at,len,amp,wave='sine',bus='music',endNote=null){
 if(!ctx||!running||!Number.isFinite(note)||voices.size>=40)return;
 const osc=ctx.createOscillator(),g=ctx.createGain(),output=bus==='music'?musicBus:fxBus;
 osc.type=wave;osc.frequency.setValueAtTime(hz(note),at);if(endNote!==null)osc.frequency.exponentialRampToValueAtTime(hz(endNote),at+len*.8);
 g.gain.setValueAtTime(.0001,at);g.gain.exponentialRampToValueAtTime(Math.max(.0002,amp),at+Math.min(.035,len*.25));g.gain.exponentialRampToValueAtTime(.0001,at+len);osc.connect(g);g.connect(output);const v={osc,bus};voices.add(v);osc.onended=()=>{voices.delete(v);osc.disconnect();g.disconnect()};osc.start(at);osc.stop(at+len+.02);
 }
 function schedule(){if(!ctx||!running||ctx.state!=='running')return;const track=THEMES[scene],beat=60/track.bpm;const now=ctx.currentTime;if(next<now-.3)next=now+.04;
 for(let i=0;i<8&&next<now+.22;i++){const pos=step%16,bar=Math.floor(step/4)%4,base=track.bass[bar],mel=track.melody[step%8];if(pos%4===0){tone(base,next,beat*3.7,.18,'sine');tone(base+7,next,beat*3.5,.07,'triangle');tone(base+12,next,beat*2.8,.035,'sine')}
 if(mel!==null)tone(mel,next,beat*.78,.09,track.wave);
 if(track.pulse&&pos%2===0)tone(29,next,.16,.13,'sine','music',22);
 step++;next+=beat*.5;}
 }
 function startLoop(){if(!ctx||!prefs.enabled||prefs.muted||!visible||ctx.state!=='running')return;volume();if(running)return;running=true;step=0;next=ctx.currentTime+.04;schedule();timer=env.setInterval(schedule,90)}
 async function unlock(){if(starting)return false;starting=true;const id=++generation;
 try{if(!ctx){const AC=env.AudioContext||env.webkitAudioContext;if(!AC)return false;ctx=new AC();master=ctx.createGain();musicBus=ctx.createGain();fxBus=ctx.createGain();master.gain.value=0;musicBus.gain.value=0;fxBus.gain.value=0;musicBus.connect(master);fxBus.connect(master);master.connect(ctx.destination)}
 await ctx.resume();if(id!==generation)return false;if(ctx.state!=='running')return false;prefs.enabled=true;prefs.muted=false;save();volume();startLoop();return true;
 }catch{return false}finally{starting=false}}
 function configure(patch){prefs=normalize({...prefs,...patch});save();volume();if(!prefs.enabled||prefs.muted){++generation;stopLoop();stopVoices()}else startLoop();return {...prefs}}
 function setScene(name){if(!Object.hasOwn(THEMES,name)||scene===name)return;scene=name;stopLoop();startLoop()}
 function setVisible(value){visible=!!value;volume();if(!visible){stopLoop();stopVoices();return}startLoop()}
 const cues={
 attack:[[54,0,.13,.19,'triangle',43],[40,.08,.18,.1,'sawtooth',30]],
 Paladin:[[62,0,.25,.16,'triangle'],[69,.045,.32,.12,'sine'],[74,.09,.38,.08,'sine']],
 Assassin:[[79,0,.11,.12,'sawtooth',43],[82,.08,.13,.12,'triangle',48]],
 Warlock:[[43,0,.48,.18,'sine',31],[67,.04,.35,.12,'triangle',55],[74,.1,.4,.06,'sine']],
 heal:[[60,0,.24,.13,'sine'],[64,.1,.28,.12,'sine'],[69,.2,.35,.11,'triangle']],
 hit:[[36,0,.18,.14,'triangle',26]],
 victory:[[60,0,.25,.12,'triangle'],[64,.12,.25,.12,'triangle'],[67,.24,.25,.12,'triangle'],[72,.36,.65,.16,'sine']],
 defeat:[[57,0,.38,.12,'triangle'],[53,.22,.38,.12,'sine'],[48,.45,.7,.13,'sine']],
 loot:[[76,0,.22,.09,'sine'],[81,.09,.4,.10,'sine']],
 vault:[[32,0,.45,.15,'triangle',24],[48,.15,.55,.1,'triangle'],[67,.43,.4,.12,'sine'],[72,.55,.5,.1,'sine'],[79,.68,.85,.09,'sine']],
 enter:[[38,0,.35,.12,'triangle'],[45,.14,.44,.08,'sine']]
 };
 function play(name,delay=0){if(!running||prefs.muted||!prefs.enabled||!visible||prefs.effects===0||!Object.hasOwn(cues,name))return;const at=ctx.currentTime+.015+Math.max(0,Math.min(2,delay));for(const [n,d,l,a,w,end] of cues[name])tone(n,at+d,l,a,w,'fx',end??null)}
 function result(before,after,action){if(!before||!after||after.revision!==before.revision+1)return;if(action==='vault'&&!before.claimed&&after.claimed){play('vault');return}if((action==='dungeon'||action==='raid')&&after.enemy){play('enter');return}if(!before.enemy||!['attack','skill','heal'].includes(action))return;play(action==='skill'?after.hero:action);const msg=String(after.message||'');if(msg.includes('Enemy dealt'))play('hit',.18);if(msg.includes('Victory!')){play('victory',.35);if(after.loot.some(id=>!before.loot.includes(id)))play('loot',1.05)}else if(msg.includes('Defeated.'))play('defeat',.3)}
 return {unlock,configure,setScene,setVisible,play,result,get preferences(){return {...prefs}},get active(){return running},get scene(){return scene}};
}
const api={createAudio,normalize,themeFor,THEMES};
if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.VaultAudio=api;
})(typeof window==='undefined'?globalThis:window);
