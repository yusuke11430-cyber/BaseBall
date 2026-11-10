// main.js内へビルド時に埋め込む。既存の壁とモニターを使い、動画は1本だけ。
const STADIUM_MEDIA = (() => {
  const clips=['media/ragtime-01.mp4','media/ragtime-02.mp4'];
  const frustum=new THREE.Frustum(),matrix=new THREE.Matrix4();
  let screen=null,poster=null,video=null,texture=null,index=0,wanted=false,starting=false,retryAt=0,lastCheck=-Infinity;
  function imageFile(path){
    return new Promise((resolve,reject)=>{const im=new Image();im.crossOrigin='anonymous';im.onload=()=>resolve(im);im.onerror=reject;im.src=new URL(path,document.baseURI).href;});
  }
  function contain(g,im,x,y,w,h){const scale=Math.min(w/im.width,h/im.height),iw=im.width*scale,ih=im.height*scale;g.drawImage(im,x+(w-iw)/2,y+(h-ih)/2,iw,ih);}
  function setMap(map){if(screen.material.map!==map){screen.material.map=map;screen.material.needsUpdate=true;}}
  function play(){
    if(!wanted||starting||now()<retryAt)return;
    if(!video.getAttribute('src')){video.src=new URL(clips[index],document.baseURI).href;video.load();}
    if(video.ended||!video.paused)return; // endedイベントが次のクリップへ切り替えるまで再始動しない。
    starting=true;
    try{
      Promise.resolve(video.play()).then(()=>{if(!wanted)video.pause();}).catch(()=>{retryAt=now()+3;}).finally(()=>{starting=false;});
    }catch(e){starting=false;retryAt=now()+3;}
  }
  function init(mesh,padding){
    screen=mesh;poster=mesh.material.map;
    video=document.createElement('video');video.id='stadiumVideo';video.hidden=true;video.setAttribute('aria-hidden','true');
    video.crossOrigin='anonymous';video.preload='none';video.muted=video.defaultMuted=true;video.volume=0;video.playsInline=true;
    video.setAttribute('playsinline','');video.setAttribute('muted','');document.body.appendChild(video);
    video.addEventListener('loadeddata',()=>{
      if(!texture){
        texture=new THREE.VideoTexture(video);texture.encoding=THREE.sRGBEncoding;texture.minFilter=texture.magFilter=THREE.LinearFilter;texture.generateMipmaps=false;
        // r128の古いブラウザ向け経路も毎描画の再転送を避け、最大15回/秒に制限。
        if(!('requestVideoFrameCallback' in video)){
          let lastTime=-1,lastUpload=-Infinity;
          texture.update=()=>{const t=now();if(wanted&&!video.paused&&video.readyState>=2&&t-lastUpload>=1/15&&video.currentTime!==lastTime){texture.needsUpdate=true;lastTime=video.currentTime;lastUpload=t;}};
        }
      }
      setMap(texture);
    });
    video.addEventListener('ended',()=>{index=(index+1)%clips.length;video.removeAttribute('src');video.load();setMap(poster);starting=false;play();});
    video.addEventListener('error',()=>{video.pause();setMap(poster);retryAt=now()+10;index=(index+1)%clips.length;video.removeAttribute('src');video.load();starting=false;});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){wanted=false;video.pause();}lastCheck=-Infinity;});
    document.addEventListener('pointerdown',()=>{if(wanted){retryAt=0;play();}},{capture:true});
    // 一度だけ読み込み、既存のキャンバステクスチャへ広告を描く。
    Promise.all([imageFile('media/ragtime-logo.webp'),imageFile('media/ragtime-curry.webp')]).then(([logo,food])=>{
      const g=padding.image.getContext('2d');
      g.fillStyle='#fffdf7';g.fillRect(24,14,248,100);g.fillRect(288,14,200,100);
      contain(g,logo,29,18,238,92);contain(g,food,292,18,192,92);padding.needsUpdate=true;
      const p=poster.image.getContext('2d'),w=poster.image.width,h=poster.image.height;
      p.fillStyle='#f6f3e8';p.fillRect(0,0,w,h);contain(p,logo,12,24,w*.57,h-55);contain(p,food,w*.6,12,w*.37,h-24);
      p.fillStyle='#35564d';p.font='600 15px sans-serif';p.textAlign='left';p.fillText('協賛 RAgTime（ラグタイム）',18,h-15);poster.needsUpdate=true;
    }).catch(()=>{}); // 読み込めないときも従来の球場表示を保つ。
  }
  function update(t){
    if(!screen||t-lastCheck<.25)return;lastCheck=t;
    camera.updateMatrixWorld();screen.updateMatrixWorld(true);
    matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(matrix);
    wanted=!document.hidden&&screen.visible&&frustum.intersectsObject(screen);
    if(wanted)play();else video.pause();
  }
  return {init,update};
})();
