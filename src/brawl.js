// 乱闘の固定30Hzロジック。オンラインではホーム側1台だけが進め、全員へ状態を配信する。
const BRAWL = (() => {
  const HZ=30, INTRO=45, HP=5, LIMIT=5, GAP=.7;
  const MOVES={weak:{damage:1,hit:4,end:11,range:1.25},strong:{damage:2,hit:8,end:20,range:1.65}};
  const sides=['home','away'], clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
  function create(id) {
    const fighter=x=>({x,hp:HP,face:x<0?1:-1,action:'idle',frame:0,lastA:0,stun:0,flash:0});
    return {id,tick:0,phase:'intro',done:false,winner:null,seq:0,events:[],fighters:{home:fighter(-1.4),away:fighter(1.4)}};
  }
  function input(v) {
    return {move:v&&Number.isFinite(v.move)?clamp(Math.sign(v.move),-1,1):0,guard:!!(v&&v.guard),
      a:v&&Number.isSafeInteger(v.a)&&v.a>=0?v.a:0,attack:v&&v.attack==='strong'?'strong':'weak'};
  }
  function emit(s,event){s.events.push({seq:++s.seq,tick:s.tick,...event});if(s.events.length>12)s.events.shift();}
  function step(s,values={}) {
    if(s.done)return s;s.tick++;
    if(s.phase==='intro'){if(s.tick>=INTRO)s.phase='fight';return s;}
    const controls={home:input(values.home),away:input(values.away)};
    for(const side of sides){
      const f=s.fighters[side],other=s.fighters[side==='home'?'away':'home'],c=controls[side];
      if(f.stun>0)f.stun--;
      if(MOVES[f.action]){f.frame++;if(f.frame>=MOVES[f.action].end){f.action='idle';f.frame=0;}}
      const pressed=c.a>f.lastA;if(pressed)f.lastA=c.a;
      if(!MOVES[f.action]&&!f.stun){
        f.face=other.x>=f.x?1:-1;
        if(c.guard){f.action='guard';f.frame=0;}
        else if(pressed){f.action=c.attack;f.frame=0;emit(s,{kind:'swing',by:side});}
        else{f.action='idle';f.x=clamp(f.x+c.move*3/HZ,-LIMIT,LIMIT);}
      }
    }
    // 重なりを解消。左右の入れ替わりは起こさず、距離を取って横スクロールできる。
    const a=s.fighters.home,b=s.fighters.away;
    if(b.x-a.x<GAP){const mid=clamp((a.x+b.x)/2,-LIMIT+GAP/2,LIMIT-GAP/2);a.x=mid-GAP/2;b.x=mid+GAP/2;}
    const hits=[];
    for(const side of sides){
      const f=s.fighters[side],target=side==='home'?'away':'home',o=s.fighters[target],m=MOVES[f.action];
      if(m&&f.frame===m.hit&&!f.stun&&(o.x-f.x)*f.face>0&&Math.abs(o.x-f.x)<=m.range){
        hits.push({by:side,target,damage:o.action==='guard'&&!o.stun?0:m.damage,face:f.face});
      }
    }
    // 同一フレームの攻撃を同時適用し、ホーム側だけ有利にならないようにする。
    for(const h of hits){const o=s.fighters[h.target];emit(s,{kind:h.damage?'hit':'block',...h});
      if(h.damage){o.hp=Math.max(0,o.hp-h.damage);o.stun=h.damage===2?8:5;o.flash=s.tick+6;o.action='idle';o.frame=0;o.x=clamp(o.x+h.face*(h.damage===2?.25:.15),-LIMIT,LIMIT);}}
    if(!a.hp||!b.hp){s.done=true;s.phase='finished';s.winner=a.hp===b.hp?null:a.hp>b.hp?'home':'away';}
    return s;
  }
  function readSnapshot(v,id){
    if(!v||v.id!==id||!Number.isSafeInteger(v.tick)||v.tick<0||v.tick>1e7||!['intro','fight','finished'].includes(v.phase)||typeof v.done!=='boolean')return null;
    for(const side of sides){const f=v.fighters&&v.fighters[side];if(!f||!Number.isFinite(f.x)||Math.abs(f.x)>LIMIT+.01||!Number.isInteger(f.hp)||f.hp<0||f.hp>HP||![1,-1].includes(f.face)||!['idle','guard','weak','strong'].includes(f.action)||!Number.isInteger(f.frame)||f.frame<0||f.frame>20||!Number.isInteger(f.stun)||f.stun<0||f.stun>8||!Number.isFinite(f.flash)||!Number.isSafeInteger(f.lastA)||f.lastA<0)return null;}
    if(![null,'home','away'].includes(v.winner)||!Number.isSafeInteger(v.seq)||!Array.isArray(v.events)||v.events.length>12)return null;
    if(v.events.some(e=>!Number.isSafeInteger(e.seq)||!['swing','hit','block'].includes(e.kind)||!sides.includes(e.by)||((e.kind==='hit'||e.kind==='block')&&(!sides.includes(e.target)||![0,1,2].includes(e.damage)))))return null;
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
    return {move:distance>1.05?Math.sign(other.x-f.x):0,guard:distance<1.8&&phase>=45&&phase<61,
      a:previous+(phase===10||phase===35||phase===70?1:0),attack:phase===70?'strong':'weak'};
  }
  return {HZ,INTRO,HP,MOVES,create,input,step,readSnapshot,finishGame,cpu};
})();
if(typeof module!=='undefined')module.exports=BRAWL;
