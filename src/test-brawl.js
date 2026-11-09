const assert=require('node:assert/strict'),BB=require('./logic'),B=require('./brawl');
const fs=require('node:fs'),vm=require('node:vm');
for(const x of [-.95,.95])for(const speed of [20,146,1000]){
 const pi=BB.makePitch(1,'st',Math.sign(x)*.62,.8,42,speed,1000,4),st={x,dz:0};
 const full=BB.hitBatter(pi,st,0,1.1);assert.ok(full,`body missed: ${x}, ${speed}`);
 let swept=null;for(let s=0;s<1.1;s+=.17){const h=BB.hitBatter(pi,st,s,s+.17);if(h){swept=h;break;}}
 assert.ok(swept);assert.ok(Math.abs(swept.s-full.s)<.002);
 assert.equal(BB.hitBatter(BB.makePitch(1,'st',0,.8,42,speed,1000,4),st,0,1.1),null);
 assert.equal(BB.hitBatter(pi,st,full.s+.1,full.s+.1),null);
}
function ready(){const s=B.create('g:1');for(let i=0;i<B.INTRO;i++)B.step(s);assert.equal(s.phase,'fight');s.fighters.home.x=-.45;s.fighters.away.x=.45;return s;}
function attack(s,side,kind,a,defense={}){const v={[side]:{a,attack:kind},[side==='home'?'away':'home']:defense};for(let i=0;i<=B.MOVES[kind].end;i++)B.step(s,v);}
let s=ready();attack(s,'home','weak',1);assert.equal(s.fighters.away.hp,4);
const idle=ready();for(let i=0;i<900;i++)B.step(idle,{});assert.equal(idle.fighters.home.hp,5);assert.equal(idle.fighters.away.hp,5);assert.equal(idle.events.length,0);
s=ready();attack(s,'home','strong',1);assert.equal(s.fighters.away.hp,3);
for(const kind of ['weak','strong']){s=ready();attack(s,'home',kind,1,{guard:true});assert.equal(s.fighters.away.hp,5);assert.ok(s.events.some(e=>e.kind==='block'&&e.damage===0));}
// 同じ攻撃番号の再送や押しっぱなしで、何度も攻撃しない。
s=ready();attack(s,'home','weak',1);attack(s,'home','weak',1);assert.equal(s.fighters.away.hp,4);
// 間合い外では当たらず、ガード中に移動・攻撃はできない。
s=ready();s.fighters.away.x=4;attack(s,'home','strong',1);assert.equal(s.fighters.away.hp,5);
s=ready();const pos=s.fighters.home.x;for(let i=0;i<30;i++)B.step(s,{home:{move:1,guard:true,a:1,attack:'strong'}});assert.equal(s.fighters.home.x,pos);assert.equal(s.fighters.away.hp,5);
// 双方が同時に最後の一撃を当てた場合は相打ちで試合終了。
s=ready();s.fighters.home.hp=s.fighters.away.hp=1;
for(let i=0;i<10&&!s.done;i++)B.step(s,{home:{a:1,attack:'weak'},away:{a:1,attack:'weak'}});
assert.equal(s.done,true);assert.equal(s.winner,null);assert.equal(s.fighters.home.hp,0);assert.equal(s.fighters.away.hp,0);
// 勝敗は野球の点数に関係なく乱闘で決まる。状態が終わればそれ以上進まない。
s=ready();s.fighters.away.hp=2;attack(s,'home','strong',1);assert.equal(s.winner,'home');
const gs={...BB.newGame(3,'g'),score:{away:20,home:0}},finished=B.finishGame(gs,s);
assert.equal(finished.over,true);assert.equal(finished.brawlResult.winner,'home');assert.equal(gs.over,false);
const json=JSON.stringify(s);B.step(s,{away:{a:99,attack:'strong'}});assert.equal(JSON.stringify(s),json);
// 同じ入力列から同じ結果。スナップショットは再接続・観戦に利用できる。
const a=ready(),b=JSON.parse(JSON.stringify(a));
for(let t=0;t<400&&!a.done;t++){const inputs={home:{move:1,a:Math.floor(t/30)+1,attack:t%60<30?'weak':'strong'},away:{move:-1,guard:t%40<12,a:Math.floor(t/40)+1,attack:'weak'}};B.step(a,inputs);B.step(b,inputs);assert.deepEqual(a,b);assert.deepEqual(B.readSnapshot(a,a.id),a);}
assert.ok(Buffer.byteLength(JSON.stringify({bf:{state:a}}))<4000);
assert.equal(B.readSnapshot(a,'different-game'),null);
assert.equal(B.readSnapshot({...a,fighters:{...a.fighters,home:{...a.fighters.home,x:Infinity}}},a.id),null);
assert.equal(B.readSnapshot({...a,fighters:{...a.fighters,home:{...a.fighters.home,hp:99}}},a.id),null);
// デッドボールでは野球を進めず乱闘へ。スタミナは投球1回分だけ消費。
const pi=BB.makePitch(1,'st',-.62,.8,42,146,100,4),after=BB.apply(gs,{kind:'hbp',n:1,seed:42},pi);
assert.equal(after.n,1);assert.equal(after.over,false);assert.deepEqual(after.bases,gs.bases);assert.match(after.msg,/乱闘/);
// 描画と定期タイマーの両方から呼んでも二重進行せず、描画が間引かれても実時間で進む。
const view=fs.readFileSync(__dirname+'/brawl-view.js','utf8');
const advance=view.slice(view.indexOf('function advanceBrawl('),view.indexOf('function updateBrawl('));
const F={state:ready(),authority:true,inputs:{},lastAdvance:0,lastSend:0,acc:0},C={brawl:F,phase:'brawl'},NET={mode:'online',opp:{}};
const ctx=vm.createContext({C,NET,BRAWL:B,consumeFightEvents(){},publishFight(){},finishBrawl(){},$:()=>({})});
vm.runInContext(advance,ctx);ctx.advanceBrawl(1);assert.ok(F.state.tick>=B.INTRO+29);
const tick=F.state.tick;ctx.advanceBrawl(1);assert.equal(F.state.tick,tick);
NET.opp=null;ctx.advanceBrawl(10);assert.equal(F.state.tick,tick);
NET.opp={};ctx.advanceBrawl(10.1);assert.ok(F.state.tick<=tick+4);
console.log('Brawl: swept HBP at all speeds, weak1/strong2/guard0, spacing, dedup, simultaneous KO, snapshots and match termination passed');
