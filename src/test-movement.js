const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const BB = require('./logic'), main = fs.readFileSync(__dirname+'/main.js','utf8');
const section=(a,b)=>main.slice(main.indexOf(a),main.indexOf(b,main.indexOf(a)));
function client() {
  let ms=0,id=0;const timers=new Map(),sent=[];
  const ST={lh:false,x:-.95,dz:0,b:false},C={gs:{gid:'move'},phase:'wait',swingAt:null,cur:{x:0,y:.8}};
  const ctx=vm.createContext({BB,ST,C,keys:{},NET:{mode:'online',sendSt:st=>sent.push({time:ms,...st})},
    role:()=>'bat',handOf:st=>st.lh?-1:1,batHome:st=>({x:st.x,z:st.dz}),keysOf:()=>[[0,{}]],
    batter:{position:{set(){}},rotation:{}},batPivot:{position:{copy(){}},quaternion:{copy(){}}},
    plane:{},cursor:{position:{}},setCursor(){},performance:{now:()=>ms},
    setTimeout:(fn,delay)=>{timers.set(++id,{at:ms+delay,fn});return id;},clearTimeout:id=>timers.delete(id)});
  vm.runInContext('let VIS={...ST},stanceTarget=null,stanceFrameAt=null;'+
    section('function applyStance(st,','// ボール・影・ゾーン')+
    section('function moveStance(dx, dz) {','function switchBox() {')+
    section('let stT = 0,','setAim(0, 0.8);'),ctx);
  const advance=t=>{while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>t)break;ms=next[1].at;timers.delete(next[0]);next[1].fn();}ms=t;};
  return {ctx,ST,C,sent,advance};
}
// 押しっぱなしでも送信され、60ms間隔を守り、停止後の最終位置も届く。
const a=client();a.ctx.keys.w=true;a.ctx.updateStance(0);
for(let i=1;i<=60;i++){a.advance(i*1000/60);a.ctx.updateStance(i/60);}
a.ctx.keys.w=false;a.advance(1100);
assert.ok(a.sent.length>=16&&a.sent.length<=18);
for(let i=1;i<a.sent.length;i++)assert.ok(a.sent[i].time-a.sent[i-1].time>=59.99);
assert.ok(a.sent.some(s=>s.time>200&&s.time<700));
assert.equal(a.sent.at(-1).dz,Number(a.ST.dz.toFixed(3)));
const count=a.sent.length;a.advance(1200);a.ctx.sendStance();assert.equal(a.sent.length,count);
// 30/60/144Hzで自分の移動距離は同じ。判定用STは補間を待たず更新。
for(const hz of [30,60,144]){const c=client();c.ctx.keys.w=true;c.ctx.updateStance(0);for(let i=1;i<=hz/2;i++){c.advance(i*1000/hz);c.ctx.updateStance(i/hz);}assert.ok(Math.abs(c.ST.dz+.375)<1e-8);}
// 相手の受信位置へ飛ばず、毎フレーム単調に近づく。ローカル判定用STは変えない。
const b=client();b.ctx.role=()=>'pitch';b.ctx.applyStance({...b.ST,x:-1.35,dz:-.5},true);
assert.equal(vm.runInContext('VIS.x',b.ctx),-.95);b.ctx.updateStance(0);
let prev=-.95;
for(let i=1;i<=30;i++){b.ctx.updateStance(i/60);const x=vm.runInContext('VIS.x',b.ctx);assert.ok(x<=prev&&x>=-1.35);if(i===1)assert.ok(x>-1.35);prev=x;}
assert.ok(Math.abs(prev+1.35)<.001);assert.equal(b.ST.dz,0);
// 左右打席切替はホームベースを横断させず即時反映。打球中は走塁位置を上書きしない。
b.ctx.applyStance({lh:true,x:1,dz:.2,b:false},true);assert.equal(vm.runInContext('VIS.x',b.ctx),1);
b.C.phase='play';b.ctx.applyStance({lh:true,x:1.4,dz:.6,b:false},true);b.ctx.updateStance(1);assert.equal(vm.runInContext('VIS.x',b.ctx),1);
console.log('Movement: continuous throttled updates, final position, 30/60/144Hz speed, remote smoothing and seat changes passed');
// バントのカーソルも同じ送信制限で共有し、構えの補間で水平のバットを通常姿勢に戻さない。
const bunt=client();bunt.ST.b=true;bunt.C.cur={x:.2,y:1.1};bunt.ctx.sendStance();assert.equal(bunt.sent[0].cx,.2);assert.equal(bunt.sent[0].cy,1.1);
bunt.C.cur.y=.5;bunt.ctx.sendStance();bunt.advance(60);assert.equal(bunt.sent.at(-1).cy,.5);
let poseResets=0;bunt.ctx.batPivot.quaternion.copy=()=>poseResets++;bunt.ctx.role=()=>'pitch';
bunt.ctx.applyStance({lh:false,x:-.95,dz:.2,b:true,cx:.15,cy:1.12},true);
for(let i=0;i<60;i++)bunt.ctx.updateStance(i/60);
assert.equal(poseResets,0);assert.equal(vm.runInContext('VIS.b',bunt.ctx),true);assert.equal(vm.runInContext('VIS.cx',bunt.ctx),.15);assert.equal(vm.runInContext('VIS.cy',bunt.ctx),1.12);
bunt.ctx.applyStance({lh:true,x:.95,dz:0,b:true,cx:-.2,cy:.45},true);assert.equal(vm.runInContext('VIS.lh',bunt.ctx),true);assert.equal(vm.runInContext('VIS.cy',bunt.ctx),.45);
bunt.ctx.applyStance({lh:true,x:.95,dz:0,b:false},true);bunt.ctx.updateStance(2);assert.ok(poseResets>0);
console.log('Remote bunt: cursor updates, both batter boxes, persistent horizontal pose and release passed');
