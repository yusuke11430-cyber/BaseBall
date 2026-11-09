const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),BB=require('./logic');
const gs=BB.newGame(3,'contact'),pi=BB.makePitch(1,'sl',0,.8,42,146,100,4);
for(const lh of [false,true])for(const sz of [-.9,0,.6])for(const x of [-.4,0,.4])for(const y of [.35,.8,1.3]){
 const pose=BB.swingPose(x,y,sz,lh),h=lh?-1:1,len=Math.hypot(1,.02);
 assert.ok(Math.abs(pose.x+h/len*.66-x)<1e-12);assert.ok(Math.abs(pose.y+.02/len*.66-y)<1e-12);assert.equal(pose.z,sz);
 const at=BB.contactPoint(pi,sz);assert.deepEqual(at,BB.pitchPos(pi,BB.contactS(sz)));
 const fl=BB.flight(0,10,120,.2,at);assert.deepEqual(fl.pts[0],[at.x,at.y,at.z]);
}
for(const lh of [false,true]){
 const at=BB.contactPoint(pi),h=lh?-1:1;
 const hit=(dx,dy,dt=0,seed=1)=>BB.judge(pi,{x:at.x+dx,y:at.y+dy},dt,gs,seed,{lh});
 assert.equal(hit(0,0).contact,'sweet');assert.equal(hit(h*.08,0).contact,'jam');
 assert.equal(hit(-h*.08,0).contact,'tip');assert.equal(hit(0,.065).contact,'glance');
 assert.equal(hit(0,0,.05).contact,'solid');assert.equal(hit(.3,0).kind,'whiff');
 assert.equal(hit(0,0,.2).contact,undefined);assert.equal(hit(0,0,null).contact,undefined);
 for(let seed=1;seed<=100;seed++){
  const o=hit(0,.07,0,seed);assert.equal(o.kind,Math.abs(o.phi)>45?'foul':'inplay');
  assert.ok(!Object.values(o).some(v=>typeof v==='number'&&!Number.isFinite(v)));
  assert.deepEqual(hit(.06,.03,.01,seed),hit(.06,.03,.01,seed));
 }
}
// 描画の実際のstartPlayで、接触位置から軌道が始まり、音・衝撃が同時に一度だけ発火する。
const main=fs.readFileSync(__dirname+'/main.js','utf8');
const startPlay=main.slice(main.indexOf('function startPlay('),main.indexOf('function finishPlay('));
for(const sz of [-.9,0,.6]){
 const C={pi,impactAt:10},events=[],o={kind:'foul',phi:60,la:10,ev:90,sz};
 const ctx={BB,C,now:()=>10,showBallFx(){},show(){},zone:{},cursor:{},buntBar:{},status(){},
  updateSwing:t=>events.push(['pose',t]),contactFeedback:o=>events.push(['contact',o]),pipStart(){},call(){},call2(){},finishPlay(){}};
 vm.runInNewContext(startPlay+'\nstartPlay(o,{});',{...ctx,o});
 const at=BB.contactPoint(pi,sz);assert.deepEqual(C.play.pts[0],[at.x,at.y,at.z]);
 assert.equal(events.length,2);assert.deepEqual(events[0],['pose',10]);assert.equal(events[1][0],'contact');
}
// スイング中にマウスや立ち位置が変わっても、クリック時の座標を使う。
assert.match(main,/BB\.swingPose\(C\.swingX/);assert.match(main,/C\.swingX = C\.cur\.x; C\.swingY = C\.cur\.y; C\.swingZ = ST\.dz/);
// 芯は金属音、詰まり・先端・こすり・バントは小さめの木製音。空振りでは接触音を呼ばない。
const sounds=[],soundCode=main.slice(main.indexOf('const SFX = {'),main.indexOf('// 1組のメッシュ'));
const audioContext=vm.createContext({play:(name,gain)=>{sounds.push({name,gain});return true},pick:list=>list[0]});
vm.runInContext(soundCode+';this.hit=SFX.hit;',audioContext);
audioContext.hit(160,'sweet');for(const grade of ['jam','tip','glance','bunt'])audioContext.hit(160,grade);
assert.match(sounds[0].name,/metal/);for(const s of sounds.slice(1)){assert.match(s.name,/wood/);assert.ok(s.gain<sounds[0].gain)}
console.log('Contact: barrel alignment, left/right stance, contact origin, feedback grades, fair direction and deterministic outcomes passed');
