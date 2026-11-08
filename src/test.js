const BB=require('./logic.js');
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
