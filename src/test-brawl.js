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
function ready(){const s=B.create('g:1');for(let i=0;i<B.INTRO;i++)B.step(s);assert.equal(s.phase,'ready');B.step(s,{home:{ready:true},away:{ready:true}});assert.equal(s.phase,'fight');s.fighters.home.x=-.45;s.fighters.away.x=.45;return s;}
// 双方の音声終了まで停止。待機中の移動・攻撃は持ち越さない。
const waiting=B.create('wait');for(let i=0;i<B.INTRO;i++)B.step(waiting);
const before=JSON.stringify(waiting.fighters);
for(let i=0;i<300;i++)B.step(waiting,{home:{ready:true,move:1,a:9,attack:'strong'},away:{ready:false,move:-1,a:7}});
assert.equal(waiting.phase,'ready');assert.equal(JSON.stringify(waiting.fighters),before);
assert.ok(B.readSnapshot(waiting,'wait'));
B.step(waiting,{home:{ready:true,a:9},away:{ready:true,a:7}});assert.equal(waiting.phase,'fight');
B.step(waiting,{home:{ready:true,a:9},away:{ready:true,a:7}});assert.equal(waiting.events.length,0);
function attack(s,side,kind,a,defense={}){const v={[side]:{a,attack:kind},[side==='home'?'away':'home']:defense};for(let i=0;i<=B.MOVES[kind].end;i++)B.step(s,v);}
// 表裏が替わっても投手は常にマウンド（小さいworld-z）側。
for(const top of [true,false]){
 const batting=BB.batSide({top}),pitching=batting==='home'?'away':'home';
 const fight=B.create('sides:'+top,pitching);
 assert.equal(fight.moundSide,pitching);assert.equal(fight.fighters[pitching].x,-1.4);assert.equal(fight.fighters[batting].x,1.4);
 assert.equal(fight.fighters[pitching].face,1);assert.equal(fight.fighters[batting].face,-1);
 for(let i=0;i<B.INTRO;i++)B.step(fight);
 B.step(fight,{home:{ready:true},away:{ready:true}});
 // 接近・押し合いでも、ホーム／アウェイの固定配置に戻らない。
 for(let i=0;i<50;i++)B.step(fight,{[pitching]:{move:1},[batting]:{move:-1}});
 assert.ok(fight.fighters[batting].x-fight.fighters[pitching].x>=.7-1e-9);
 assert.ok(B.readSnapshot(fight,fight.id));
 fight.fighters[batting].hp=2;attack(fight,pitching,'strong',1);
 assert.equal(fight.winner,pitching);assert.equal(B.finishGame(BB.newGame(1,'sides'),fight).brawlResult.winner,pitching);
 // 打者側の攻撃も、左右を逆にしたときと同じ判定になる。
 const reverse=B.create('reverse:'+top,pitching);
 for(let i=0;i<B.INTRO;i++)B.step(reverse);B.step(reverse,{home:{ready:true},away:{ready:true}});
 reverse.fighters[pitching].x=-.45;reverse.fighters[batting].x=.45;
 attack(reverse,batting,'weak',1);assert.equal(reverse.fighters[pitching].hp,4);
}
let s=ready();attack(s,'home','weak',1);assert.equal(s.fighters.away.hp,4);
const idle=ready();for(let i=0;i<900;i++)B.step(idle,{});assert.equal(idle.fighters.home.hp,5);assert.equal(idle.fighters.away.hp,5);assert.equal(idle.events.length,0);
// 呼吸は実ガード中だけ消費。0で防御解除、解除中に回復する。
for(const side of ['home','away']){
 const breathing=ready(),f=breathing.fighters[side];
 for(let i=0;i<B.HZ*4-1;i++)B.step(breathing,{[side]:{guard:true}});
 assert.equal(f.action,'guard');assert.equal(f.breath,1);
 B.step(breathing,{[side]:{guard:true}});assert.equal(f.breath,0);assert.equal(f.breathLocked,true);assert.equal(f.action,'idle');
 // 押しっぱなしでは、回復してもガードが勝手に復帰しない。
 for(let i=0;i<300;i++)B.step(breathing,{[side]:{guard:true}});
 assert.equal(f.breath,B.BREATH.MAX);assert.equal(f.breathLocked,true);assert.equal(f.action,'idle');
 B.step(breathing,{});assert.equal(f.breathLocked,false);
 B.step(breathing,{[side]:{guard:true}});assert.equal(f.action,'guard');assert.equal(f.breath,B.BREATH.MAX-1);
 f.breath=0;f.breathLocked=true;f.action='idle';
 for(let i=0;i<59;i++)B.step(breathing,{});assert.equal(f.breath,29.5);assert.equal(f.breathLocked,true);
 B.step(breathing,{});assert.equal(f.breath,30);assert.equal(f.breathLocked,false);
 B.step(breathing,{[side]:{guard:true}});assert.equal(f.action,'guard');assert.equal(f.breath,29);
 assert.ok(B.readSnapshot(breathing,breathing.id));
 for(const bad of [NaN,-1,B.BREATH.MAX+1]){
  const invalid=JSON.parse(JSON.stringify(breathing));invalid.fighters[side].breath=bad;assert.equal(B.readSnapshot(invalid,invalid.id),null);
 }
}
const exhausted=ready();exhausted.fighters.away.breath=0;exhausted.fighters.away.breathLocked=true;
attack(exhausted,'home','strong',1,{guard:true});assert.equal(exhausted.fighters.away.hp,3);
const recovering=ready();B.step(recovering,{home:{guard:true}});const used=recovering.fighters.home.breath;
B.step(recovering,{});assert.equal(recovering.fighters.home.breath,used+B.BREATH.RECOVER);
for(let i=0;i<300;i++)B.step(recovering,{});assert.equal(recovering.fighters.home.breath,B.BREATH.MAX);
// 旧来の±5mを越えて外野・バックネット前の実際の壁まで進める。
const arena=B.ARENA;
assert.ok(arena.min<-100&&arena.max>25);
for(const move of [-1,1]){
 const walk=ready();
 for(let i=0;i<6000;i++){
  B.step(walk,{home:{move},away:{move}});
  for(const side of ['home','away'])assert.ok(walk.fighters[side].x>=arena.min-1e-9&&walk.fighters[side].x<=arena.max+1e-9);
  assert.ok(walk.fighters.away.x-walk.fighters.home.x>=.7-1e-9);
 }
 const edge=move<0?walk.fighters.home.x:walk.fighters.away.x;
 assert.ok(Math.abs(edge-(move<0?arena.min:arena.max))<1e-9);
 assert.ok(B.readSnapshot(walk,walk.id));
 const outside=JSON.parse(JSON.stringify(walk));outside.fighters.home.x=arena.min-1;assert.equal(B.readSnapshot(outside,outside.id),null);
}
// 壁際のノックバックも外へ抜けない。
for(const side of ['home','away']){
 const corner=ready(),homeAttack=side==='home',target=homeAttack?'away':'home';
 corner.fighters.home.x=homeAttack?arena.max-.9:arena.min;
 corner.fighters.away.x=corner.fighters.home.x+.9;
 attack(corner,side,'strong',1);assert.equal(corner.fighters[target].hp,3);
 assert.ok(Math.abs(corner.fighters[target].x-(homeAttack?arena.max:arena.min))<1e-9);
}
// 両者が離れた場合・両端に寄った場合も、カメラは球場の壁内側に収まる。
for(const aspect of [.5,1,2])for(const [a,b] of [[arena.min,arena.max],[arena.min,arena.min+.7],[arena.max-.7,arena.max],[-1.4,1.4]]){
 const frame=B.cameraFrame(a,b,aspect),section=BB.stadiumSection('x',frame.z,.15);
 assert.ok(Object.values(frame).every(Number.isFinite));assert.ok(frame.x>=section.min&&frame.x<=section.max);assert.ok(frame.y>=3.1);
}
const outline=BB.stadiumOutline();assert.equal(outline.length,62);assert.ok(outline.some(([x,z])=>Math.abs(x)<1e-9&&z===-120));
const center=BB.stadiumSection('z',0,.4);assert.equal(arena.min+arena.origin,center.min);assert.equal(arena.max+arena.origin,center.max);
s=ready();attack(s,'home','strong',1);assert.equal(s.fighters.away.hp,3);
const impact=s.events.find(e=>e.kind==='hit');assert.ok(impact&&Number.isFinite(impact.at.lane));
// 以前の距離判定なら当たっていた間合いでも、拳が体に届かなければ空振り。
for(const [kind,distance] of [['weak',1.25],['strong',1.5]]){s=ready();s.fighters.home.x=-distance/2;s.fighters.away.x=distance/2;attack(s,'home',kind,1);assert.equal(s.fighters.away.hp,5);}
// 拳の描画と同じ軌道で接触し、その位置で止まる。1発で2回以上ダメージを与えない。
s=ready();let hitEvent=null;
for(let i=0;i<12;i++){B.step(s,{home:{a:1,attack:'strong'}});hitEvent=s.events.find(e=>e.kind==='hit');if(hitEvent){const f=s.fighters.home,p=B.fistPose(f);assert.ok(Math.abs(p.z-f.contactReach)<1e-12);assert.ok(Math.abs(hitEvent.at.lane-(f.x+f.face*(p.z+p.radius)))<1e-12);break;}}
assert.ok(hitEvent);assert.equal(s.events.filter(e=>e.kind==='hit').length,1);
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
assert.match(view,/const fist=BRAWL\.fistPose\(f\)/);
const shell=fs.readFileSync(__dirname+'/shell.html','utf8');
assert.match(shell,/id="brawlUI"[^>]* hidden/);assert.match(shell,/id="brawlControls" hidden/);
const howto=shell.slice(shell.indexOf('id="titleHelp"'),shell.indexOf('<div class="studio"'));
assert.ok(!/乱闘|fightWeak|fightStrong/.test(howto));
// ダメージ後の両陣営の体力を、数値と5セルの両方へ反映。KOの0も表示する。
const healthNodes={};const node=id=>healthNodes[id]||(healthNodes[id]={attrs:{},setAttribute(k,v){this.attrs[k]=v;},classList:{toggle(){}},firstElementChild:{style:{}},children:Array.from({length:5},()=>({classList:{toggle(k,on){this.empty=on;}}}))});
const healthState=B.create('health'),healthCtx=vm.createContext({C:{brawl:{state:healthState},names:{home:'H',away:'A'}},BRAWL:B,$:node});
vm.runInContext(view.slice(view.indexOf('function renderBrawlVitals('),view.indexOf('function updateBrawlCamera(')),healthCtx);
for(let hp=5;hp>=0;hp--){healthState.fighters.home.hp=hp;healthState.fighters.away.hp=5-hp;healthCtx.renderBrawlVitals();for(const side of ['Home','Away']){const expected=side==='Home'?hp:5-hp;assert.equal(node('#fight'+side+'Hp').attrs['aria-valuenow'],String(expected));assert.equal(node('#fight'+side+'Value').textContent,expected+' / 5');assert.equal(node('#fight'+side+'Hp').children.filter(c=>c.classList.empty).length,5-expected);}}
// 体力・名前・呼吸の列は、ホーム固定ではなく実際の画面上の左右へ並ぶ。
for(const moundSide of ['home','away'])for(const sign of [1,-1])for(const seat of ['home','away','spec']){
 const state=B.create('bars',moundSide),models={};for(const side of ['home','away'])models[side]={position:{z:B.ARENA.origin+state.fighters[side].x}};
 const F={models},nodes={'#fightHomePlayer':{style:{},classList:{toggle(){}}},'#fightAwayPlayer':{style:{},classList:{toggle(){}}}};
 const projection={copy(v){this.value=v;return this;},project(camera){this.x=this.value.z*camera.sign;return this;}};
 const ctx=vm.createContext({C:{brawl:F,seat},camera:{sign,updateMatrixWorld(){}},fightProjection:projection,$:id=>nodes[id]});
 vm.runInContext(view.slice(view.indexOf('function alignBrawlBars('),view.indexOf('function brawlKey(')),ctx);ctx.alignBrawlBars();
 const homeLeft=models.home.position.z*sign<models.away.position.z*sign;
 assert.equal(nodes['#fightHomePlayer'].style.order,homeLeft?'0':'1');assert.equal(nodes['#fightAwayPlayer'].style.order,homeLeft?'1':'0');
 ctx.camera.sign=-sign;ctx.alignBrawlBars();assert.equal(nodes['#fightHomePlayer'].style.order,homeLeft?'1':'0');
}
const advance=view.slice(view.indexOf('function advanceBrawl('),view.indexOf('function updateBrawl('));
const F={state:ready(),authority:true,inputs:{},lastAdvance:0,lastSend:0,acc:0},C={brawl:F,phase:'brawl'},NET={mode:'online',opp:{}};
const ctx=vm.createContext({C,NET,BRAWL:B,beginBrawlAnnouncement(){},consumeFightEvents(){},publishFight(){},finishBrawl(){},$:()=>({})});
vm.runInContext(advance,ctx);ctx.advanceBrawl(1);assert.ok(F.state.tick>=B.INTRO+29);
const tick=F.state.tick;ctx.advanceBrawl(1);assert.equal(F.state.tick,tick);
NET.opp=null;ctx.advanceBrawl(10);assert.equal(F.state.tick,tick);
NET.opp={};ctx.advanceBrawl(10.1);assert.ok(F.state.tick<=tick+4);
// アナウンスは1回だけ。実際の再生終了通知を受けるまで準備完了を送らない。
const calls=[],cueF={state:{phase:'intro',tick:0},started:false,inputs:{},inputSeq:0,attackSeq:0,id:'cue'};
let ended,resets=0;
const cueCtx=vm.createContext({C:{brawl:cueF,seat:'home',phase:'brawl'},NET:{mode:'cpu'},BRAWL:B,BB,
 advanceBrawl(){},ease:x=>x,call2:(key,cb)=>{calls.push(key);ended=cb;},resetBrawlInput(){resets++;},banner(){},$:()=>({})});
const cueUpdate=view.slice(view.indexOf('function updateBrawl('),view.indexOf("  for(const side of ['home','away']){",view.indexOf('function updateBrawl(')))+'}';
vm.runInContext(view.slice(view.indexOf('function beginBrawlAnnouncement('),view.indexOf('function consumeFightEvents(')),cueCtx);
vm.runInContext(cueUpdate,cueCtx);cueCtx.updateBrawl(0,.016);assert.deepEqual(calls,[]);
cueF.state.phase='ready';cueF.state.tick=B.INTRO;cueCtx.updateBrawl(1.6,.016);cueCtx.updateBrawl(1.616,.016);
assert.deepEqual(calls,['fight']);assert.equal(cueF.audioReady,undefined);ended();assert.equal(cueF.audioReady,true);assert.equal(resets,1);
// 終了済みの古い試合から届いた再生終了通知は無視。
cueCtx.C.brawl={};ended();assert.equal(resets,1);cueCtx.C.brawl=cueF;
// マウスの左右を攻撃へ変換。待機中のクリックは攻撃番号を増やさない。
const attacks=[];Object.assign(cueCtx,{audio(){},canvas:{focus(){}},sendBrawlInput:k=>attacks.push(k)});
vm.runInContext(view.slice(view.indexOf('function brawlPointer('),view.indexOf("for(const [id,key]")),cueCtx);
for(const button of [0,2,1])cueCtx.brawlPointer({pointerType:'mouse',button,preventDefault(){}});
assert.deepEqual(attacks,['weak','strong']);
vm.runInContext('const fightKeys={left:true,right:false,guard:true};'+view.slice(view.indexOf('function sendBrawlInput('),view.indexOf('function onFightInput(')),cueCtx);
cueCtx.sendBrawlInput('strong');assert.equal(cueF.attackSeq,0);assert.equal(cueF.inputs.home.move,0);assert.equal(cueF.inputs.home.guard,false);
cueF.state.phase='fight';cueCtx.sendBrawlInput('weak');assert.equal(cueF.attackSeq,1);assert.equal(cueF.inputs.home.attack,'weak');
// 追加クリップも既存の「声」チャンネルに流れる。
const main=fs.readFileSync(__dirname+'/main.js','utf8'),played=[];
// 終盤の劣勢時に、投手本人の投球準備画面だけへ助言する。
const adviceNodes={'#brawlAdvice':{hidden:true},'#pitchUI':{hidden:false},'#batUI':{hidden:true},'#status':{textContent:''},'#panel':{hidden:false}};
const adviceC={phase:'aim',seat:'home',gs:{...BB.newGame(9,'advice'),inning:7,score:{home:1,away:2}}};
const adviceCtx=vm.createContext({BB,C:adviceC,$:s=>adviceNodes[s],show:(s,on)=>{adviceNodes[s].hidden=!on;}});
vm.runInContext(main.slice(main.indexOf('function wantsBrawlAdvice('),main.indexOf('let bannerT =')),adviceCtx);
for(const innings of [1,3,5,9]){
 const firstLate=Math.floor(innings*2/3)+1;
 for(const top of [true,false]){
  const seat=top?'home':'away',opponent=top?'away':'home';
  const gs={...BB.newGame(innings,'advice'),top,inning:firstLate,score:{[seat]:0,[opponent]:1}};
  assert.equal(adviceCtx.wantsBrawlAdvice(gs,seat),true);assert.equal(adviceCtx.wantsBrawlAdvice(gs,opponent),false);assert.equal(adviceCtx.wantsBrawlAdvice(gs,'spec'),false);
  assert.equal(adviceCtx.wantsBrawlAdvice({...gs,inning:firstLate-1},seat),false);
  assert.equal(adviceCtx.wantsBrawlAdvice({...gs,inning:innings+1},seat),true);
  assert.equal(adviceCtx.wantsBrawlAdvice({...gs,over:true},seat),false);
  for(const runs of [1,2])assert.equal(adviceCtx.wantsBrawlAdvice({...gs,score:{[seat]:runs,[opponent]:1}},seat),false);
 }
}
for(const phase of ['aim','wait','pitching','brawl','over','lobby']){adviceC.phase=phase;adviceCtx.refreshPanel();assert.equal(adviceNodes['#brawlAdvice'].hidden,phase!=='aim');}
adviceC.phase='aim';adviceC.seat='away';adviceCtx.refreshPanel();assert.equal(adviceNodes['#brawlAdvice'].hidden,true);
const voiceCtx=vm.createContext({SND:{vol:{voice:20},buf:{v_deadball:{},v_fight:{}}},AC:{},play:n=>played.push(n),shout(){throw Error('Unexpected fallback');}});
vm.runInContext(main.slice(main.indexOf('const VOICE_FILE ='),main.indexOf('function shout(')),voiceCtx);
voiceCtx.call2('deadball');voiceCtx.call2('fight');assert.deepEqual(played,['v_deadball','v_fight']);
voiceCtx.SND.vol.voice=0;voiceCtx.call2('fight');assert.equal(played.length,2);
let playbackEnded=false;
const source={playbackRate:{},connect(){return {connect(){}};},start(){}},gain={gain:{}};
const audioCtx=vm.createContext({AC:{createBufferSource:()=>source,createGain:()=>gain},SND:{vol:{voice:20,sfx:20},buf:{v_fight:{}},voice:{}}});
vm.runInContext(main.slice(main.indexOf('function play(n,'),main.indexOf('const pick =')),audioCtx);
assert.equal(audioCtx.play('v_fight',1,1,()=>{playbackEnded=true;}),true);
assert.equal(playbackEnded,false);source.onended();assert.equal(playbackEnded,true);
console.log('Brawl: HBP, damage, guard, punch contact, synchronization, match termination and voice timing passed');
