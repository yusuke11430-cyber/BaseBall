// main.jsのスコープ内へビルドで挿入。野球場と同じキャラをそのまま使う。
const fightKeys = {left:false,right:false,guard:false};
function resetBrawlInput() {
  fightKeys.left=fightKeys.right=fightKeys.guard=false;
  if(C.brawl&&C.phase==='brawl')sendBrawlInput();
}
function clearBrawl() {
  if(C.brawl){
    clearInterval(C.brawl.timer);
    for(const p of [pitcher,batter]){p.rotation.set(0,0,0);p.userData.handL.position.set(-.37,.8,.06);p.userData.handR.position.set(.37,.8,.06);p.userData.legL.position.y=p.userData.legR.position.y=.3;}
    batter.userData.handL.visible=batter.userData.handR.visible=false;
  }
  C.brawl=null;fightKeys.left=fightKeys.right=fightKeys.guard=false;show('#brawlUI',false);show('#brawlControls',false);
}
function startBrawl(cause) {
  if(!C.gs||!C.pi||cause.g!==C.gs.gid||cause.n!==C.pi.n||C.phase==='over')return;
  const id=cause.g+':'+cause.n;
  if(C.brawl)return;
  const batSide=BB.batSide(C.gs),state=BRAWL.create(id,batSide==='home'?'away':'home');
  C.brawl={id,cause:clone(cause),state,authority:NET.mode==='cpu'||C.seat==='home',models:{[batSide]:batter,[batSide==='home'?'away':'home']:pitcher},
    from:{home:null,away:null},draw:{home:state.fighters.home.x,away:state.fighters.away.x},acc:0,lastAdvance:now(),lastSend:-Infinity,eventSeq:0,inputSeq:0,attackSeq:0,inputs:{home:{},away:{}},seenInput:0,finished:false,started:false};
  const F=C.brawl;
  for(const side of ['home','away']){F.from[side]=F.models[side].position.clone();F.models[side].visible=true;F.models[side].userData.handL.visible=F.models[side].userData.handR.visible=true;}
  C.token++;C.phase='brawl';C.resolved=true;C.play=null;C.pendingPi=null;C.swingAt=null;
  if(C.gs.n<cause.n)C.gs=BB.apply(C.gs,cause,C.pi);
  for(const key in keys)keys[key]=false;resetBrawlInput();clearContactFeedback();resetBallFx();pipStop();
  zone.visible=aim.visible=cursor.visible=guess.visible=ball.visible=ballShadow.visible=batPivot.visible=buntBar.visible=false;
  batRunner.visible=false;runners.forEach(p=>p.visible=false);show('#panel',false);show('#aimPad',false);show('#speed',false);show('#hud',false);
  show('#brawlUI',true);show('#brawlControls',C.seat!=='spec');
  $('#fightHomeName').textContent=C.names.home;$('#fightAwayName').textContent=C.names.away;
  duckBgm(false);setBgm(null);SFX.mitt();call2('deadball');banner('デッドボール！','out');canvas.focus({preventScroll:true});
  if(F.authority){publishFight();F.timer=setInterval(()=>{if(C.brawl===F&&C.phase==='brawl')advanceBrawl(now());},1000/BRAWL.HZ);}
}
function publishFight() {
  const F=C.brawl;if(!F||NET.mode!=='online'||C.seat!=='home')return;
  NET.sendFight({id:F.id,cause:F.cause,pi:C.pi,state:clone(F.state)});
}
function sendBrawlInput(attack) {
  const F=C.brawl;if(!F||C.phase!=='brawl'||C.seat==='spec')return;
  if(attack&&F.state.phase==='fight')F.attackSeq++;
  const old=F.inputs[C.seat]||{};
  const active=F.state.phase==='fight';
  const value={id:F.id,seq:++F.inputSeq,ready:!!F.audioReady,move:active?(fightKeys.right?1:0)-(fightKeys.left?1:0):0,guard:active&&fightKeys.guard,a:F.attackSeq,attack:attack||old.attack||'weak'};
  F.inputs[C.seat]=value;
  if(NET.mode==='online')NET.sendFightInput(value);
}
function onFightInput(side,value) {
  const F=C.brawl;if(!F||!F.authority||!value||value.id!==F.id||!Number.isSafeInteger(value.seq)||value.seq<=F.seenInput)return;
  F.seenInput=value.seq;F.inputs[side]=BRAWL.input(value);
}
function onFightState(wire) {
  if(!wire||!C.gs||typeof wire.id!=='string'||!wire.cause||wire.cause.g!==C.gs.gid||wire.cause.kind!=='hbp')return;
  const id=wire.cause.g+':'+wire.cause.n;if(wire.id!==id)return;
  const state=BRAWL.readSnapshot(wire.state,id);if(!state)return;
  if(!C.brawl){
    if(C.gs.over||wire.cause.n<C.gs.n||wire.cause.n>C.gs.n+1)return;
    if(!C.pi||C.pi.n!==wire.cause.n){
      const pi=wire.pi;if(!pi||!BB.PITCHES[pi.type]||pi.n!==wire.cause.n||![pi.ax,pi.ay,pi.kmh,pi.seed].every(Number.isFinite))return;
      C.pi=clone(pi);
    }
    startBrawl(wire.cause);
  }
  const F=C.brawl;if(!F||F.authority||F.id!==id||state.tick<F.state.tick)return;
  F.state=state;beginBrawlAnnouncement();consumeFightEvents();if(state.done)finishBrawl();
}
function beginBrawlAnnouncement() {
  const F=C.brawl;if(!F||F.announced||F.state.phase!=='ready')return;
  F.announced=true;
  call2('fight',()=>{if(C.brawl!==F||C.phase!=='brawl')return;F.audioReady=true;resetBrawlInput();});
}
function consumeFightEvents() {
  const F=C.brawl;if(!F)return;
  for(const e of F.state.events){if(e.seq<=F.eventSeq)continue;F.eventSeq=e.seq;
    if(e.kind==='swing')SFX.whoosh();
    else{
      if(e.kind==='block')SFX.mitt();else SFX.glove();
      $('#fightMessage').textContent=e.damage?`${e.damage===2?'強':'弱'}攻撃！ ${e.damage}ダメージ`:'ガード！ 0ダメージ';
      F.messageUntil=now()+.65;
      const target=F.models[e.target],at=e.at?{x:e.at.x,y:e.at.y,z:-9+e.at.lane}:{x:target.position.x,y:.95,z:target.position.z};
      contactFx={t:now(),grade:e.damage===2?'sweet':'solid',at};contactRing.position.set(at.x,at.y,at.z);contactGlow.position.copy(contactRing.position);
      contactRing.material.color.set(e.damage?0xffb627:0x7cc6f2);contactGlow.material.color.set(e.damage?0xffd25c:0x7cc6f2);
    }
  }
}
function finishBrawl() {
  const F=C.brawl;if(!F||F.finished||!F.state.done)return;
  F.finished=true;clearInterval(F.timer);C.gs=BRAWL.finishGame(C.gs,F.state);C.phase='over';
  show('#brawlControls',false);$('#fightMessage').textContent=F.state.winner?'決着！':'相打ち！';
  if(F.authority){publishFight();NET.sendGs(C.gs);}
  banner(F.state.winner?'乱闘決着！':'相打ち！',F.state.winner?'big':'');gameOver();
}
function advanceBrawl(t) {
  const F=C.brawl;if(!F)return;
  const elapsed=Math.min(1,Math.max(0,t-F.lastAdvance));F.lastAdvance=t;
  if(C.phase==='brawl'&&F.authority){
    const connected=NET.mode!=='online'||!!NET.opp;
    if(connected){
      F.acc+=elapsed;let steps=0;
      while(F.acc>=1/BRAWL.HZ&&steps++<30){
        if(NET.mode==='cpu'){const cpu=C.seat==='home'?'away':'home';F.inputs[cpu]=BRAWL.cpu(F.state,cpu,(F.inputs[cpu]||{}).a||0);}
        BRAWL.step(F.state,F.inputs);F.acc-=1/BRAWL.HZ;if(F.state.done)break;
      }
      beginBrawlAnnouncement();consumeFightEvents();if(t-F.lastSend>=.1||F.state.done){publishFight();F.lastSend=t;}
      if(F.state.done)finishBrawl();
    }else{F.acc=0;$('#fightMessage').textContent='相手の再接続を待っています';}
  }
}
function updateBrawl(t,dt) {
  const F=C.brawl;if(!F)return;
  advanceBrawl(t);
  const s=F.state,intro=BB.clamp(s.tick/BRAWL.INTRO,0,1),eased=ease(intro);
  beginBrawlAnnouncement();
  if(s.phase==='fight'&&!F.started){F.started=true;resetBrawlInput();banner('乱闘開始！','big');$('#fightMessage').textContent='弱1・強2・ガード0。体力0で試合終了';}
  if(s.phase==='intro')$('#fightMessage').textContent='マウンドと本塁の間へ移動中…';
  else if(s.phase==='ready')$('#fightMessage').textContent=F.audioReady?'相手の開始アナウンスを待っています…':'開始アナウンス中…';
  else if(!s.done&&F.messageUntil&&t>F.messageUntil&& (NET.mode!=='online'||NET.opp||C.seat==='spec')){$('#fightMessage').textContent='弱1・強2・ガード0。体力0で試合終了';F.messageUntil=0;}
  if(!s.done&&NET.mode==='online'&&!NET.opp&&C.seat!=='spec')$('#fightMessage').textContent='相手の再接続を待っています';
  for(const side of ['home','away']){
    const f=s.fighters[side],p=F.models[side],u=p.userData;
    const moving=Math.abs(f.x-F.draw[side])>.01;F.draw[side]+= (f.x-F.draw[side])*(1-Math.exp(-dt*20));
    const z=-9+F.draw[side];
    if(s.phase==='intro'){p.position.lerpVectors(F.from[side],new THREE.Vector3(0,0,z),eased);runPose(p,t,true);}
    else{p.position.set(0,0,z);runPose(p,t,f.action==='idle'&&(moving||Math.abs((F.inputs[side]||{}).move||0)>0));}
    p.rotation.y=f.face>0?0:Math.PI;p.rotation.x=0;p.rotation.z=!f.hp?f.face*.9:f.stun?Math.sin(t*70)*.06:0;
    const fist=BRAWL.fistPose(f);
    u.handL.position.set(f.action==='guard'?-.12:-.3,f.action==='guard'?1.06:.9,f.action==='guard'?.38:.2);
    u.handR.position.set(f.action==='guard'?.12:fist.x,f.action==='guard'?1.06:fist.y,f.action==='guard'?.38:fist.z);
    if(!f.hp)p.position.y=-.15;
    const cells=$('#fight'+(side==='home'?'Home':'Away')+'Hp').children;
    for(let i=0;i<5;i++)cells[i].classList.toggle('empty',i>=f.hp);
    $('#fight'+(side==='home'?'Home':'Away')+'Value').textContent=f.hp+' / 5';
    const breath=$('#fight'+(side==='home'?'Home':'Away')+'Breath'),percent=Math.round(f.breath/BRAWL.BREATH.MAX*100);
    breath.firstElementChild.style.width=percent+'%';breath.setAttribute('aria-valuenow',percent);
    breath.classList.toggle('low',f.breathLocked||percent<=25);
    $('#fight'+(side==='home'?'Home':'Away')+'BreathValue').textContent='呼吸 '+percent+'%'+(f.breathLocked?(f.breath<BRAWL.BREATH.RESUME?'・息切れ／回復待ち':'・ガードを離すと復帰'):'');
  }
}
function updateBrawlCamera(dt) {
  const F=C.brawl,a=F.models.home.position,b=F.models.away.position,mid=(a.z+b.z)/2;
  const frame=BRAWL.cameraFrame(a.z-BRAWL.ARENA.origin,b.z-BRAWL.ARENA.origin,camera.aspect);
  const target=new THREE.Vector3(frame.x,frame.y,frame.z),look=new THREE.Vector3(0,1,mid);
  const k=1-Math.exp(-dt*4);camera.position.lerp(target,k);cam.look.lerp(look,k);
  cam.fov=lerp(cam.fov||34,34,k);camera.fov=cam.fov;camera.updateProjectionMatrix();camera.lookAt(cam.look);
}
function brawlKey(ev,down) {
  const k=ev.key.toLowerCase(),map={a:'left',arrowleft:'left',d:'right',arrowright:'right',l:'guard',' ':'guard'};
  if(map[k]){ev.preventDefault();fightKeys[map[k]]=down;if(!ev.repeat)sendBrawlInput();}
  else if((k==='j'||k==='k')&&down&&!ev.repeat){ev.preventDefault();audio();sendBrawlInput(k==='j'?'weak':'strong');}
}
function brawlPointer(ev) {
  ev.preventDefault();audio();canvas.focus({preventScroll:true});
  if(ev.pointerType==='mouse'&&(ev.button===0||ev.button===2))sendBrawlInput(ev.button===2?'strong':'weak');
}
for(const [id,key] of [['fightLeft','left'],['fightRight','right'],['fightGuard','guard'],['fightWeak','weak'],['fightStrong','strong']]){
  const button=$('#'+id);
  button.addEventListener('pointerdown',e=>{e.preventDefault();audio();button.setPointerCapture(e.pointerId);
    if(key==='weak'||key==='strong')sendBrawlInput(key);else{fightKeys[key]=true;sendBrawlInput();}});
  const release=()=>{if(key!=='weak'&&key!=='strong'){fightKeys[key]=false;sendBrawlInput();}};
  button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
}
