const assert=require('node:assert/strict'),BB=require('./logic'),fs=require('node:fs'),vm=require('node:vm');
const on=BB.newGame(3,'rules'),off=BB.newGame(3,'rules',false),pi=BB.makePitch(1,'st',-.62,.8,42,146,100,4),hbp={kind:'hbp',g:'rules',n:1,seed:42};
assert.equal(on.brawlEnabled,true);assert.equal(off.brawlEnabled,false);
assert.deepEqual(BB.apply(on,hbp,pi).bases,[0,0,0]);assert.match(BB.apply(on,hbp,pi).msg,/乱闘/);
for(const bases of [[0,0,0],[1,0,0],[1,1,0],[1,1,1],[0,1,1]]){
 const gs={...off,bases,b:3,s:2};const result=BB.apply(gs,hbp,pi);
 const walk=BB.apply(gs,{...hbp,kind:'ball'},pi);assert.deepEqual(result.bases,walk.bases);assert.deepEqual(result.score,walk.score);
 assert.equal(result.b,0);assert.equal(result.s,0);assert.equal(result.outs,0);assert.equal(result.n,1);assert.equal(result.brawlEnabled,false);assert.ok(!/乱闘/.test(result.msg));assert.deepEqual(result.sta,walk.sta);
}
const main=fs.readFileSync(__dirname+'/main.js','utf8');let fights=0,resolves=0;
const ctx=vm.createContext({C:{pi:{n:1},gs:off,out:null},startBrawl(){fights++;},resolve(){resolves++;}});
vm.runInContext(main.slice(main.indexOf('function onSw('),main.indexOf('function fieldSide(')),ctx);
ctx.onSw(hbp);assert.equal(fights,0);assert.equal(resolves,1);ctx.C.gs=on;ctx.C.out=null;ctx.onSw(hbp);assert.equal(fights,1);
const view=fs.readFileSync(__dirname+'/brawl-view.js','utf8');
vm.runInContext(view.slice(view.indexOf('function startBrawl('),view.indexOf('function publishFight(')),ctx);
ctx.C.gs=off;ctx.startBrawl(hbp);assert.equal(ctx.C.brawl,undefined);
console.log('Match rules: default ON, OFF dead-ball advance/forced runs/count reset, deterministic application and no fight entry passed');
