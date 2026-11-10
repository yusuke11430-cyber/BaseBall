const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),AVATAR=require('./avatar');
// デフォルト服の共有テクスチャは、キャラ変更時にも破棄しない。
const shared={disposed:0,dispose(){this.disposed++;}},owned=[];
const color=()=>({set(){},copy(){}}),player={userData:{skin:{color:color()},jersey:{color:color()},cap:{color:color()},capMesh:{},brim:{rotation:{},position:{}},eyes:[]}};
const avatarCtx=vm.createContext({AVATAR,clothTex:shared,THREE:{Color:class{}},canvasTex(){const tex={disposed:0,dispose(){this.disposed++;}};owned.push(tex);return tex;}});
const main=fs.readFileSync(__dirname+'/main.js','utf8');
vm.runInContext(main.slice(main.indexOf('function applyAvatar('),main.indexOf('function runPose(')),avatarCtx);
const team={jersey:'#123456',cap:'#654321'};
avatarCtx.applyAvatar(player,null,team);assert.equal(player.userData.jersey.map,shared);
avatarCtx.applyAvatar(player,{name:'TEST'},team);assert.equal(shared.disposed,0);
avatarCtx.applyAvatar(player,null,team);assert.equal(shared.disposed,0);assert.equal(player.userData.jersey.map,shared);assert.ok(owned.every(t=>t.disposed===1));

// 実際のモニター制御を実行し、画面外・非表示時には取得／再生しないことを検証。
module.exports=(async()=>{
 const state={t:0,visible:false,videos:0,textures:0},events={},draws=[];
 const context2d={fillRect(){},fillText(){},drawImage(...v){draws.push(v);}};
 const poster={image:{width:512,height:288,getContext:()=>context2d}},padding={image:{getContext:()=>context2d}};
 const video={paused:true,ended:false,readyState:2,currentTime:0,attrs:{},events:{},plays:0,loads:0,
  set src(v){this.attrs.src=v;},get src(){return this.attrs.src;},getAttribute(k){return this.attrs[k]||null;},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},
  addEventListener(k,fn){this.events[k]=fn;},load(){this.loads++;this.paused=true;this.ended=false;},play(){this.plays++;this.paused=false;return Promise.resolve();},pause(){this.paused=true;}};
 const document={baseURI:'https://example.test/BaseBall/',hidden:false,body:{appendChild(){}},createElement(tag){assert.equal(tag,'video');state.videos++;return video;},addEventListener(k,fn){events[k]=fn;}};
 const THREE={Frustum:class{setFromProjectionMatrix(){}intersectsObject(){return state.visible;}},Matrix4:class{multiplyMatrices(){}},VideoTexture:class{constructor(){state.textures++;}},sRGBEncoding:3001,LinearFilter:1006};
 const ctx=vm.createContext({THREE,document,URL,Promise,now:()=>state.t,camera:{updateMatrixWorld(){}},Image:class{constructor(){this.width=512;this.height=294;}set src(v){this.url=v;this.onload();}}});
 vm.runInContext(fs.readFileSync(__dirname+'/stadium-media.js','utf8')+'\nthis.media=STADIUM_MEDIA;',ctx);
 const mesh={visible:true,material:{map:poster},updateMatrixWorld(){}};ctx.media.init(mesh,padding);
 await Promise.resolve();await Promise.resolve();assert.equal(state.videos,1);assert.equal(video.preload,'none');assert.ok(draws.length>=4);
 const tick=t=>{state.t=t;ctx.media.update(t);};
 tick(0);assert.equal(video.loads,0);assert.equal(video.plays,0);
 state.visible=true;tick(.3);await Promise.resolve();await Promise.resolve();await Promise.resolve();
 assert.match(video.src,/ragtime-01\.mp4$/);assert.equal(video.muted,true);assert.equal(video.volume,0);assert.equal(video.plays,1);
 video.events.loadeddata();assert.equal(state.textures,1);assert.equal(mesh.material.map.generateMipmaps,false);
 const tex=mesh.material.map;tex.update();assert.equal(tex.needsUpdate,true);tex.needsUpdate=false;
 tex.update();assert.equal(tex.needsUpdate,false);state.t=.32;video.currentTime=.02;tex.update();assert.equal(tex.needsUpdate,false);
 state.t=.4;video.currentTime=.1;tex.update();assert.equal(tex.needsUpdate,true);tex.needsUpdate=false;
 document.hidden=true;events.visibilitychange();assert.equal(video.paused,true);tick(1);assert.equal(video.plays,1);
 video.currentTime=.2;tex.update();assert.equal(tex.needsUpdate,false);
 document.hidden=false;state.visible=false;events.visibilitychange();tick(2);assert.equal(video.plays,1);
 state.visible=true;tick(3);await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.equal(video.plays,2);
 video.ended=true;video.paused=true;tick(3.5);assert.equal(video.plays,2);
 video.events.ended();await Promise.resolve();await Promise.resolve();await Promise.resolve();assert.match(video.src,/ragtime-02\.mp4$/);
 video.events.loadeddata();assert.equal(state.textures,1);assert.equal(state.videos,1);
 video.events.error();assert.equal(mesh.material.map,poster);const attempts=video.plays;tick(4);assert.equal(video.plays,attempts);
 tick(14);assert.match(video.src,/ragtime-01\.mp4$/);assert.ok(video.plays>attempts);
 console.log('Render resources: shared texture lifetime, offscreen/hidden pause, silent playlist, one decoder and poster fallback passed');
})();
