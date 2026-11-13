const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const BB = require('./logic');
const main = fs.readFileSync(__dirname + '/main.js', 'utf8');
const extract = (start,end) => main.slice(main.indexOf(start),main.indexOf(end,main.indexOf(start)));
const code = extract('function trySwing() {','// スイングのタイミング') +
  extract('function takePitch() {','function fieldSide() {') +
  extract('function handlePeers(peers) {','function sanitizePi(pi) {');
let clock = 10;
const sent = [], results = [];
const C = { gs: BB.newGame(3,'swing-test'), phase:'wait', seat:'away', cur:{x:0,y:.7}, swingAt:null, out:null };
const NET = { mode:'online', swingSeq:0, sendBat:m=>sent.push(m), sendSw:o=>results.push(o), seen:new Set(), lostShown:false };
const ST = { b:false, dz:0, lh:false };
let peers=[];
const ctx = vm.createContext({ C, NET, ST, BB, AVATAR:{clean:a=>a}, chosenAvatar:null,
  now:()=>clock, role:()=>C.seat===BB.batSide(C.gs)?'bat':'pitch',
  batPivot:{visible:true}, audio(){}, SFX:{whoosh(){}}, seed:()=>1, myOpt:()=>({}),
  contactTime:()=>11, plateTime:()=>11, timingNote(){}, others:()=>peers, nickname:()=>'test',
  maybeAdopt(){}, applyStance(){}, drawPad(){}, status(){}, sanitizePi:p=>p,
  onPi(){throw Error('unexpected pitch')}
});
vm.runInContext(code,ctx);
// 素振り、早すぎる振り、空振り、同じ球での振り直しをすべて即時送信。
ctx.trySwing(); assert.equal(sent.length,1); assert.equal(results.length,0);
C.phase='pitching';C.t0=10;C.W=.5;C.pi=BB.makePitch(1,'st',0,.8,1,146,100,4);C.pi.g=C.gs.gid;
clock=10.4;ctx.trySwing();assert.equal(sent.length,2);assert.equal(C.out,null);
clock=10.9;C.cur.x=5;ctx.trySwing();assert.equal(sent.length,3);assert.equal(C.swung,true);
clock=11.21;ctx.trySwing();assert.equal(sent.length,4);assert.equal(results.length,0);
// 本物のpresence受信処理で投手へ反映。別フィールドの更新で同じ動作を再生しない。
C.seat='home';C.swingAt=null;C.swingY=null;
const remote={presence:{seat:'away',nick:'batter',sa:sent[2]}};
peers=[remote];clock=12;ctx.handlePeers();assert.equal(C.swingAt,12);assert.equal(C.swingY,.7);
clock=12.2;ctx.handlePeers();assert.equal(C.swingAt,12);
remote.presence.sa=sent[3];clock=12.4;ctx.handlePeers();assert.equal(C.swingAt,12.4);
// 通過後の空振り結果は同じバットをもう一度振らせず、判定だけ採用。
remote.presence.sw={g:C.gs.gid,n:1,kind:'whiff',swung:true,anim:sent[3].q,cy:.7};
clock=13;ctx.handlePeers();assert.equal(C.swingAt,12.4);assert.equal(C.out.kind,'whiff');
// 前の球・別試合・不正値・打撃結果確定後のモーションは無視。
for(const m of [{...sent[3],n:0},{...sent[3],g:'old'},{...sent[3],q:NaN},{...sent[3],y:Infinity}, {...sent[3],q:99}]) ctx.onBatMotion(m);
assert.equal(C.swingAt,12.4);
C.out=null;C.phase='call';ctx.onBatMotion({...sent[3],q:100});assert.equal(C.swingAt,12.4);
// 打者以外（守備側）のpresenceから偽のスイングを採用しない。
C.phase='wait';C.seat='spec';NET.seen.clear();C.swingAt=null;
peers=[{presence:{seat:'home',sa:{...sent[3],q:101}}}];ctx.handlePeers();assert.equal(C.swingAt,null);
peers=[remote];clock=14;ctx.handlePeers();assert.equal(C.swingAt,14);
// 旧版クライアントの結果のみの同期にも対応。
C.out=null;ctx.onSw({g:C.gs.gid,n:1,kind:'whiff',swung:true,cy:.9});assert.equal(C.swingY,.9);
console.log('Online swing: practice, repeated whiffs, pitcher/spectator presence, deduplication and legacy outcomes passed');
// 部屋作成者のOFF設定を最初の共有ゲーム状態へ固定。相手の構え・カーソルもpresenceから受け取る。
C.gs=null;C.seat='home';C.phase='aim';NET.innings=3;NET.brawlEnabled=false;let initialGame,remoteStance;
ctx.enterGame=()=>{};NET.sendGs=g=>initialGame=JSON.parse(JSON.stringify(g));
peers=[{presence:{seat:'away',nick:'guest'}}];ctx.handlePeers();assert.equal(C.gs.brawlEnabled,false);assert.equal(initialGame.brawlEnabled,false);
NET.brawlEnabled=true;assert.equal(C.gs.brawlEnabled,false);
ctx.applyStance=(st,smooth)=>remoteStance={...st,smooth};
for(const phase of ['aim','pitching']){C.phase=phase;peers[0].presence.st={g:C.gs.gid,lh:true,x:1.1,dz:-.4,b:true,cx:-.2,cy:1.1};ctx.handlePeers();assert.equal(remoteStance.b,true);assert.equal(remoteStance.cx,-.2);assert.equal(remoteStance.cy,1.1);assert.equal(remoteStance.smooth,true);}
peers[0].presence.st.b=false;ctx.handlePeers();assert.equal(remoteStance.b,false);
console.log('Room rules and remote bunt: host setting in shared state and live bunt cursor/release presence passed');
