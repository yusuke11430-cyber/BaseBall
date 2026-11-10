const BB=require('./logic.js');
const assert=require('node:assert/strict');
require('./test-regressions.js');
require('./test-online-swing.js');
require('./test-movement.js');
require('./test-connection.js');
require('./test-contact.js');
require('./test-brawl.js');
require('./test-render-resources.js').catch(err=>{console.error(err);process.exitCode=1;});
// 予測の再現性・接触時の一致と、全球種/変化量/球速/打席前後の有限性。
let predictionCases=0;
for(const type of BB.PITCH_KEYS) for(let bl=1;bl<=7;bl++) for(const speed of [20,146,1000]) for(const sz of [-0.9,0,0.6]) {
  const args=[1,type,0.12,0.8,42,speed,100,bl], pi=BB.makePitch(...args);
  assert.deepEqual(pi,BB.makePitch(...args));
  const contact=BB.contactS(sz), at=BB.pitchPos(pi,contact);
  assert.deepEqual(BB.predictContact(pi,contact,sz),at);
  assert.deepEqual(BB.predictContact(pi,contact+0.1,sz),at);
  // 同じ投球・時刻では予測も決定的。ストレートは固定、変化球は接触時に正確に収束。
  for(const fraction of [-2,-0.1,0,0.02,0.25,0.5,0.7,0.9,1]) {
    assert.deepEqual(BB.predictContact(pi,contact*fraction,sz),BB.predictContact({...pi},contact*fraction,sz));
    if(type==='st') assert.deepEqual(BB.predictContact(pi,contact*fraction,sz),at);
  }
  for(const fraction of [0,0.02,0.25,0.5,0.9,0.999]) {
    const predicted=BB.predictContact(pi,contact*fraction,sz);
    assert.ok(Object.values(predicted).every(Number.isFinite));
    assert.ok(Math.abs(predicted.z-at.z)<1e-12);
    assert.ok(Math.hypot(predicted.x-at.x,predicted.y-at.y)<0.28+1e-12);
  }
  predictionCases++;
}
// 変化球の予測は曲がる方向へ動き、変化量が大きいほど移動幅が増える。
for(const type of BB.PITCH_KEYS.filter(t=>!['st','kn'].includes(t))) for(const sz of [-.9,0,.6]) {
  let previous=0;
  for(let bl=1;bl<=7;bl++) {
    const pi=BB.makePitch(1,type,0,.8,42,146,100,bl), contact=BB.contactS(sz), end=BB.pitchPos(pi,contact);
    const initial=BB.predictContact(pi,contact*.1,sz), mid=BB.predictContact(pi,contact*.5,sz), late=BB.predictContact(pi,contact*.9,sz);
    const error=p=>Math.hypot(p.x-end.x,p.y-end.y), distance=error(initial);
    assert.ok(distance>previous);previous=distance;
    const p=BB.PITCHES[type],t=Math.min(contact*.1,1),endS=Math.min(contact,1);
    const raw=pi.bm*Math.hypot(p.bx,p.by)*(Math.pow(endS,p.k)-Math.pow(t,p.k)-p.k*Math.pow(t,p.k-1)*(endS-t));
    assert.ok(distance<=raw*.25+1e-12);
    assert.ok(error(mid)<distance&&error(late)<error(mid));
    assert.ok((end.x-initial.x)*BB.PITCHES[type].bx>=0);
    assert.ok((end.y-initial.y)*BB.PITCHES[type].by>=0);
    assert.deepEqual(BB.predictContact(pi,contact,sz),end);
  }
}
// ナックルは途中の予測も揺れ、seedごとに異なる。最後は正確な打撃位置。
for(let seed=1;seed<=30;seed++){
  const pi=BB.makePitch(1,'kn',0,.8,seed,108,100,7),contact=BB.contactS(0);
  assert.notDeepEqual(BB.predictContact(pi,.2),BB.predictContact(pi,.6));
  assert.deepEqual(BB.predictContact(pi,contact),BB.pitchPos(pi,contact));
}
// 全球種・全段階で、変化由来のずれを直前の倍率から半分にする。
for(const type of BB.PITCH_KEYS.filter(t=>t!=='st')) for(let bl=1;bl<=7;bl++) {
  const pi=BB.makePitch(1,type,0,0.8,42,146,100,bl);
  const old=BB.pitchPos({...pi,bm:2*bl/BB.BREAK_STD},0.5);
  const straight=BB.pitchPos({...pi,bm:1e-12},0.5), changed=BB.pitchPos(pi,0.5);
  assert.ok(Math.abs((changed.x-straight.x)-0.5*(old.x-straight.x))<1e-10);
  assert.ok(Math.abs((changed.y-straight.y)-0.5*(old.y-straight.y))<1e-10);
}
assert.equal(BB.breakScale('st',7),1);
// 大きく落ちるフォークは高めの予測から下へ動き、最後に実際の到達位置へ合う。
const fork=BB.makePitch(1,'fk',0,0.8,42,134,100,7), target=BB.pitchPos(fork,1);
assert.ok(BB.predictContact(fork,0.2).y>BB.predictContact(fork,0.6).y);
assert.ok(BB.predictContact(fork,0.6).y>target.y);
assert.deepEqual(BB.predictContact(fork,1),target);
assert.ok(Math.abs(BB.predictContact(fork,0.999).y-target.y)<0.001);
// 直球では20km/hの大きな山なりを未来の変化と誤認しない。
const slow=BB.makePitch(1,'st',0,0.8,42,20,100,4);
assert.ok(Math.abs(BB.predictContact(slow,0.2).y-BB.pitchPos(slow,1).y)<0.05);
console.log('prediction checks passed:',predictionCases,'pitch configurations');
// 打撃結果の分布をシミュレーション（上手な打者: タイミング誤差σ=0.04, カーソル誤差小）
let gs=BB.newGame(3,'t');const cnt={};let games=0,runs=0;
const r=Math.random;
for(let g=0;g<300;g++){gs=BB.newGame(9,'g'+g);let n=0;
 while(!gs.over&&n<2000){n++;const t=BB.PITCH_KEYS[Math.floor(r()*5)];
  const pi=BB.makePitch(n,t,(r()-0.5)*0.6,0.5+r()*0.65,(r()*1e9)|0);
  const at=BB.pitchPos(pi,1);const swing=BB.inZone(at.x,at.y)?r()<0.8:r()<0.3;
  const cur={x:at.x+BB.gauss(r)*0.06,y:at.y+BB.gauss(r)*0.04};
  const o=BB.judge(pi,cur,swing?BB.gauss(r)*0.05:null,gs,(r()*1e9)|0);
  const k=o.kind==='inplay'?o.result:o.kind;cnt[k]=(cnt[k]||0)+1;gs=BB.apply(gs,o);}
 runs+=gs.score.away+gs.score.home;games++;}
console.log(cnt,'runs/game',(runs/games).toFixed(1));
// 軌道の端点チェック
const pi=BB.makePitch(1,'cv',0,0.8,5);console.log(pi,BB.pitchPos(pi,0),BB.pitchPos(pi,1),BB.pitchDuration(pi).toFixed(3));
const f=BB.flight(0,28,165);console.log('flight pts',f.pts.length,f.land);
