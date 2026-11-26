const test=require('node:test'),assert=require('node:assert/strict');
const {fresh,apply,rollover}=require('../server/engine.cjs');
const now=Date.parse('2026-11-23T12:00:00Z');
const step=(s,action,value)=>apply(s,{revision:s.revision,action,value},now);
const hero=()=>step(fresh(now),'choose','Paladin');
function win(s){s=step(s,'dungeon',1);for(let i=0;i<20&&s.enemy;i++)s=step(s,s.turn%3===0?'skill':'attack');assert.equal(s.enemy,null);return s}
test('server ignores client-supplied stats and does not mutate source',()=>{const s=hero(),next=apply(s,{revision:s.revision,action:'dungeon',value:1,xp:999999,points:999999,enemy:{hp:1}},now);assert.equal(s.enemy,null);assert.equal(next.points,0);assert.equal(next.xp,0);assert.equal(next.enemy.hp,63)});
test('repeated or stale action rejected',()=>{const s=hero(),cmd={revision:s.revision,action:'dungeon',value:1};const next=apply(s,cmd,now);assert.throws(()=>apply(next,cmd,now),{status:409})});
test('invalid class, tier, loot, and claims rejected',()=>{assert.throws(()=>step(fresh(now),'choose','__proto__'));const s=hero();for(const [a,v] of [['dungeon',3],['dungeon','1'],['equip','vault'],['quest','skills'],['vault'],['raid']])assert.throws(()=>step(s,a,v),{status:400})});
test('server grants XP, gear and points only after victory',()=>{let s=hero();for(let i=0;i<5;i++)s=win(s);assert.equal(s.xp,200);assert.equal(s.points,100);assert.equal(s.daily.dungeons,5);assert.ok(s.loot.includes('shield'));s=step(s,'vault');assert.equal(s.gear,2);assert.ok(s.loot.includes('vault'));assert.throws(()=>step(s,'vault'))});
test('cooldowns and recovery charges enforced',()=>{let s=step(hero(),'dungeon',1);s=step(s,'skill');assert.throws(()=>step(s,'skill'));s=step(s,'heal');s=step(s,'heal');assert.throws(()=>step(s,'heal'))});
test('server reset uses supplied server time, not client dates',()=>{let s=hero();s.points=100;s.xp=400;s.claimed=true;s.raidDone=true;s.daily.skills=8;rollover(s,Date.parse('2026-11-30T00:00:00Z'));assert.equal(s.points,0);assert.equal(s.xp,400);assert.equal(s.claimed,false);assert.equal(s.raidDone,false);assert.equal(s.daily.skills,0)});
