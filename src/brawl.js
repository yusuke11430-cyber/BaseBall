// 乱闘の固定30Hzロジック。オンラインではホーム側1台だけが進め、全員へ状態を配信する。
const BRAWL = (() => {
  const HZ=30, INTRO=48, HP=5, GAP=.7;
  const BREATH={MAX:120,DRAIN:1,RECOVER:.5,RESUME:30}; // 満タンで4秒ガード、解除中は8秒で全回復。
  const field=typeof BB!=='undefined'?BB:require('./logic');
  const ORIGIN=-9,wall=field.stadiumSection('z',0,.4);
  const ARENA={origin:ORIGIN,min:wall.min-ORIGIN,max:wall.max-ORIGIN};
  const MOVES={weak:{damage:1,start:2,hit:4,end:11,reach:.64},strong:{damage:2,start:5,hit:8,end:20,reach:.9}};
  const sides=['home','away'], clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function create(id,moundSide='home') {
    const fighter=x=>({x,hp:HP,breath:BREATH.MAX,breathLocked:false,face:x<0?1:-1,action:'idle',frame:0,lastA:0,stun:0,flash:0,connected:false,contactReach:null});
    return {id,moundSide,tick:0,phase:'intro',done:false,winner:null,seq:0,events:[],fighters:{home:fighter(moundSide==='home'?-1.4:1.4),away:fighter(moundSide==='away'?-1.4:1.4)}};
  }
  function input(v) {
    return {ready:!!(v&&v.ready),move:v&&Number.isFinite(v.move)?clamp(Math.sign(v.move),-1,1):0,guard:!!(v&&v.guard),
      a:v&&Number.isSafeInteger(v.a)&&v.a>=0?v.a:0,attack:v&&v.attack==='strong'?'strong':'weak'};
  }
  function emit(s,event){s.events.push({seq:++s.seq,tick:s.tick,...event});if(s.events.length>12)s.events.shift();}
  // 描画と当たり判定が共有する拳の位置。空振りの間合いを見た目だけで広げない。
  function fistPose(f,frame=f.frame){
    const m=MOVES[f.action];if(!m)return {x:.3,y:.95,z:.2,radius:.085};
    const u=frame<=m.hit?clamp((frame-m.start)/(m.hit-m.start),0,1):clamp(1-(frame-m.hit)/(m.end-m.hit),0,1);
    const q=u*u*(3-2*u);let z=.2+m.reach*q;
    if(f.connected&&Number.isFinite(f.contactReach))z=Math.min(z,f.contactReach);
    return {x:.2-.06*q,y:.95+.05*q,z,radius:.085};
  }
  function fistContact(f,o){
    const a=fistPose(f,Math.max(0,f.frame-1)),b=fistPose(f),r=b.radius;
    const ax=f.face*a.x,bx=f.face*b.x,az=f.x+f.face*a.z,bz=f.x+f.face*b.z;
    const colliders=[[0,.78,o.x,.3+r,.34+r,.27+r],[0,1.33,o.x,.25+r,.25+r,.25+r]];
    if(o.action==='guard'&&!o.stun)for(const x of [-.12,.12])colliders.push([x,1.06,o.x+o.face*.38,.085+r,.085+r,.085+r]);
    let first=Infinity;
    for(const [x,y,z,rx,ry,rz] of colliders){
      const u=[(ax-x)/rx,(a.y-y)/ry,(az-z)/rz],v=[(bx-ax)/rx,(b.y-a.y)/ry,(bz-az)/rz];
      const A=v.reduce((n,t)=>n+t*t,0),B=2*u.reduce((n,t,i)=>n+t*v[i],0),D=u.reduce((n,t)=>n+t*t,0)-1;
      if(D<=0){first=0;continue;}const d=B*B-4*A*D;if(A>0&&d>=0){const t=(-B-Math.sqrt(d))/(2*A);if(t>=0&&t<=1)first=Math.min(first,t);}
    }
    if(first===Infinity)return null;
    const reach=a.z+(b.z-a.z)*first;
    return {reach,at:{x:ax+(bx-ax)*first,y:a.y+(b.y-a.y)*first,lane:f.x+f.face*(reach+r)}};
  }
  function step(s,values={}) {
    if(s.done)return s;s.tick++;
    if(s.phase==='intro'){if(s.tick>=INTRO)s.phase='ready';return s;}
    // 両画面の開始アナウンスが終了するまで、CPUも含めて操作・攻撃を止める。
    if(s.phase==='ready'){
      if(sides.every(side=>input(values[side]).ready)){
        s.phase='fight';for(const side of sides)s.fighters[side].lastA=input(values[side]).a;
      }
      return s;
    }
    const controls={home:input(values.home),away:input(values.away)};
    for(const side of sides){
      const f=s.fighters[side],other=s.fighters[side==='home'?'away':'home'],c=controls[side];
      if(f.stun>0)f.stun--;
      if(MOVES[f.action]){f.frame++;if(f.frame>=MOVES[f.action].end){f.action='idle';f.frame=0;}}
      const pressed=c.a>f.lastA;if(pressed)f.lastA=c.a;
      if(!MOVES[f.action]&&!f.stun){
        f.face=other.x>=f.x?1:-1;
        if(c.guard&&!f.breathLocked&&f.breath>0){f.action='guard';f.frame=0;}
        else if(pressed){f.action=c.attack;f.frame=0;f.connected=false;f.contactReach=null;emit(s,{kind:'swing',by:side});}
        else{f.action='idle';f.x=clamp(f.x+c.move*3/HZ,ARENA.min,ARENA.max);}
      }
      if(f.action==='guard'){
        f.breath=Math.max(0,f.breath-BREATH.DRAIN);
        if(f.breath===0){f.action='idle';f.breathLocked=true;}
      }else{
        f.breath=Math.min(BREATH.MAX,f.breath+BREATH.RECOVER);
        // 押しっぱなしで自動再ガードを繰り返さず、解除と25%回復を両方待つ。
        if(f.breathLocked&&f.breath>=BREATH.RESUME&&!c.guard)f.breathLocked=false;
      }
    }
    // 重なりを解消。左右の入れ替わりは起こさず、距離を取って横スクロールできる。
    const a=s.fighters[s.moundSide],b=s.fighters[s.moundSide==='home'?'away':'home'];
    if(b.x-a.x<GAP){const mid=clamp((a.x+b.x)/2,ARENA.min+GAP/2,ARENA.max-GAP/2);a.x=mid-GAP/2;b.x=mid+GAP/2;}
    const hits=[];
    for(const side of sides){
      const f=s.fighters[side],target=side==='home'?'away':'home',o=s.fighters[target],m=MOVES[f.action];
      if(m&&!f.connected&&f.frame>m.start&&f.frame<=m.hit&&!f.stun&&(o.x-f.x)*f.face>0){
        const contact=fistContact(f,o);if(contact)hits.push({by:side,target,damage:o.action==='guard'&&!o.stun?0:m.damage,face:f.face,...contact});
      }
    }
    // 同一フレームの攻撃を同時適用し、ホーム側だけ有利にならないようにする。
    for(const h of hits){const o=s.fighters[h.target],f=s.fighters[h.by];f.connected=true;f.contactReach=h.reach;emit(s,{kind:h.damage?'hit':'block',...h});
      if(h.damage){o.hp=Math.max(0,o.hp-h.damage);o.stun=h.damage===2?8:5;o.flash=s.tick+6;o.action='idle';o.frame=0;o.x=clamp(o.x+h.face*(h.damage===2?.25:.15),ARENA.min,ARENA.max);}}
    const home=s.fighters.home,away=s.fighters.away;
    if(!home.hp||!away.hp){s.done=true;s.phase='finished';s.winner=home.hp===away.hp?null:home.hp>away.hp?'home':'away';}
    return s;
  }
  function readSnapshot(v,id){
    if(!v||!sides.includes(v.moundSide))return null;
    if(!v||v.id!==id||!Number.isSafeInteger(v.tick)||v.tick<0||v.tick>1e7||!['intro','ready','fight','finished'].includes(v.phase)||typeof v.done!=='boolean')return null;
    for(const side of sides){const f=v.fighters&&v.fighters[side];if(!f||!Number.isFinite(f.x)||f.x<ARENA.min-.01||f.x>ARENA.max+.01||!Number.isInteger(f.hp)||f.hp<0||f.hp>HP||![1,-1].includes(f.face)||!['idle','guard','weak','strong'].includes(f.action)||!Number.isInteger(f.frame)||f.frame<0||f.frame>20||!Number.isInteger(f.stun)||f.stun<0||f.stun>8||!Number.isFinite(f.flash)||!Number.isSafeInteger(f.lastA)||f.lastA<0||typeof f.connected!=='boolean'||(f.contactReach!==null&&(!Number.isFinite(f.contactReach)||f.contactReach<0||f.contactReach>1.2)))return null;}
    for(const side of sides){const f=v.fighters[side];if(!Number.isFinite(f.breath)||f.breath<0||f.breath>BREATH.MAX||typeof f.breathLocked!=='boolean'||(f.action==='guard'&&(f.breathLocked||f.breath===0)))return null;}
    if(![null,'home','away'].includes(v.winner)||!Number.isSafeInteger(v.seq)||!Array.isArray(v.events)||v.events.length>12)return null;
    if(v.events.some(e=>!Number.isSafeInteger(e.seq)||!['swing','hit','block'].includes(e.kind)||!sides.includes(e.by)||((e.kind==='hit'||e.kind==='block')&&(!sides.includes(e.target)||![0,1,2].includes(e.damage)||!e.at||![e.at.x,e.at.y,e.at.lane].every(Number.isFinite)))))return null;
    if(v.done&&(v.phase!=='finished'||(v.fighters.home.hp>0&&v.fighters.away.hp>0)))return null;
    if(v.done&&v.winner!==(v.fighters.home.hp===v.fighters.away.hp?null:v.fighters.home.hp>v.fighters.away.hp?'home':'away'))return null;
    return JSON.parse(JSON.stringify(v));
  }
  function finishGame(gs,s){
    if(!s.done)return gs;
    return {...gs,over:true,msg:s.winner?'乱闘決着':'乱闘引き分け',brawlResult:{winner:s.winner,hp:{home:s.fighters.home.hp,away:s.fighters.away.hp}}};
  }
  function cpu(s,side,previous){
    const f=s.fighters[side],other=s.fighters[side==='home'?'away':'home'],distance=Math.abs(f.x-other.x),phase=s.tick%90;
    return {ready:true,move:distance>1.05?Math.sign(other.x-f.x):0,guard:distance<1.8&&phase>=45&&phase<61,
      a:previous+(phase===10||phase===35||phase===70?1:0),attack:phase===70?'strong':'weak'};
  }
  function cameraFrame(a,b,aspect){
    const mid=ORIGIN+(a+b)/2,angle=2*Math.atan(Math.tan(34*Math.PI/360)*aspect);
    const distance=Math.max(7,Math.max(4,Math.abs(a-b)+3)/(2*Math.tan(angle/2)));
    // 外周近くや大きく離れた場合は上方へ引き、カメラを壁の内側に保つ。
    const section=field.stadiumSection('x',mid,.15),side=Math.min(distance,Math.max(.1,-section.min*.85));
    return {x:-side,y:3.1+Math.sqrt(Math.max(0,distance*distance-side*side)),z:mid};
  }
  return {HZ,INTRO,HP,BREATH,MOVES,ARENA,create,input,step,readSnapshot,finishGame,cpu,fistPose,cameraFrame};
})();
if(typeof module!=='undefined')module.exports=BRAWL;
