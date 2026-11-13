// Supplied VRM0, rendered through its glTF skin + humanoid bone mapping.
// No second Three.js engine, spring physics or expression buffers.
const PITCHER_MODEL = (() => {
  const normal=Array.from(pitcher.children),world=new THREE.Vector3(),a=new THREE.Vector3(),b=new THREE.Vector3(),v=new THREE.Vector3();
  const q=new THREE.Quaternion(),parentQ=new THREE.Quaternion(),localQ=new THREE.Quaternion();
  let root=null,bones={},rest={},job=null,loaderJob=null,ballInHand=null,gloveMesh=null,shown=false,lastX=0,lastZ=-18.44,retryAt=0;
  const controls=['hips','spine','chest','upperChest','neck','head','leftUpperArm','leftLowerArm','rightUpperArm','rightLowerArm','leftUpperLeg','leftLowerLeg','rightUpperLeg','rightLowerLeg'];
  function loader(){
    if(THREE.GLTFLoader)return Promise.resolve();
    if(loaderJob)return loaderJob;
    loaderJob=new Promise((resolve,reject)=>{
      const script=document.createElement('script'),timer=setTimeout(()=>{script.remove();reject(Error('loader timeout'));},15000);
      script.src=new URL('vendor/GLTFLoader-r128.js',document.baseURI).href;script.crossOrigin='anonymous';
      script.onload=()=>{clearTimeout(timer);resolve();};script.onerror=()=>{clearTimeout(timer);script.remove();reject(Error('loader unavailable'));};document.head.appendChild(script);
    }).catch(error=>{loaderJob=null;throw error;});return loaderJob;
  }
  async function load(){
    if(root)return root;if(job)return job;
    job=(async()=>{
      await loader();
      const response=await fetch(new URL('models/vj-takagi.vrm',document.baseURI),{signal:AbortSignal.timeout(20000)});
      if(!response.ok)throw Error('model unavailable');
      const bytes=await response.arrayBuffer();
      const gltf=await new Promise((resolve,reject)=>new THREE.GLTFLoader().parse(bytes,'',resolve,reject));
      const source=gltf.parser.json.extensions.VRM;
      const pairs=await Promise.all(source.humanoid.humanBones.map(async item=>[item.bone,await gltf.parser.getDependency('node',item.node)]));
      bones=Object.fromEntries(pairs);
      if(!['leftUpperArm','leftLowerArm','leftHand','rightUpperArm','rightLowerArm','rightHand','hips'].every(name=>bones[name]))throw Error('humanoid bones unavailable');
      root=new THREE.Group();root.name='vjTakagiModel';root.add(gltf.scene);
      // VRM0 faces -Z; game pitchers face the plate at +Z.
      gltf.scene.rotation.y=Math.PI;gltf.scene.updateMatrixWorld(true);
      const box=new THREE.Box3().setFromObject(gltf.scene),height=box.max.y-box.min.y,scale=1.8/height;
      root.scale.setScalar(scale);gltf.scene.position.y=-box.min.y;
      for(const name of controls)if(bones[name])rest[name]=bones[name].quaternion.clone();
      gltf.scene.traverse(node=>{if(node.isMesh){node.castShadow=true;node.receiveShadow=false;node.frustumCulled=false;}});
      // A small glove and held ball are the only extra meshes.
      const glove=new THREE.Mesh(sphG,M('#945b32'));glove.scale.set(.12,.14,.08);glove.position.set(0,-.025,-.02);bones.leftHand.add(glove);gloveMesh=glove;
      ballInHand=new THREE.Mesh(sphG,M('#ffffff'));ballInHand.scale.setScalar(.075/scale);bones.rightHand.add(ballInHand);
      root.visible=false;pitcher.add(root);return root;
    })().catch(error=>{job=null;retryAt=now()+30;throw error;});return job;
  }
  function display(active){
    if(shown===active)return;shown=active;
    document.body.classList.toggle('vrm-pitcher',active);
    normal.forEach(node=>{node.visible=!active;});if(root)root.visible=active;
  }
  function rotate(name,x=0,y=0,z=0){if(bones[name])bones[name].rotation.set(x,y,z);}
  // Rotate a 2-bone arm toward a world-space target, preserving the skin rig.
  function arm(side,target){
    const end=bones[side+'Hand'],chain=[bones[side+'LowerArm'],bones[side+'UpperArm']];
    for(let pass=0;pass<4;pass++)for(const joint of chain){
      joint.getWorldPosition(v);end.getWorldPosition(a);a.sub(v);b.copy(target).sub(v);
      if(a.lengthSq()<1e-8||b.lengthSq()<1e-8)continue;
      q.setFromUnitVectors(a.normalize(),b.normalize());joint.parent.getWorldQuaternion(parentQ);
      localQ.copy(parentQ).invert().multiply(q).multiply(parentQ);joint.quaternion.premultiply(localQ);
    }
  }
  function target(side,x,y,z){world.set(x,y,z);pitcher.localToWorld(world);arm(side,world);}
  function update(t){
    const wanted=!!C.gs&&C.gs.pitcherModel==='takagi'&&!C.brawl&&C.phase!=='lobby';
    if(wanted&&!root&&!job&&t>=retryAt)load().catch(()=>{});
    display(wanted&&!!root);if(!shown)return;
    for(const name of controls)if(bones[name])bones[name].quaternion.copy(rest[name]);
    const elapsed=C.pi?t-C.t0:Infinity,u=C.W>0?elapsed/C.W:Infinity;
    const throwing=C.phase==='pitching'||C.phase==='call';
    const wind=throwing&&u<1.55, lift=wind?Math.sin(Math.min(1,u/.55)*Math.PI/2)*(u<.55?1:Math.max(0,1-(u-.55)/.45)):0;
    const lunge=wind?ease(BB.clamp((u-.55)/.45,0,1)):0;
    if(wind&&u<1){pitcher.rotation.set(.16*lunge,-.3*lift,0);pitcher.position.z=-18.44+.55*lunge;}
    else if(throwing&&C.pi){const recover=BB.clamp((elapsed-C.W)/.6,0,1);pitcher.rotation.set(.16*(1-recover),0,0);pitcher.position.z=-18.44+.55*(1-recover);}
    const moving=C.phase==='play'&&Math.hypot(pitcher.position.x-lastX,pitcher.position.z-lastZ)>.002;
    lastX=pitcher.position.x;lastZ=pitcher.position.z;
    const stride=moving?Math.sin(t*15)*.5:0;
    rotate('leftUpperLeg',-lift*1.15+stride);rotate('leftLowerLeg',lift*1.5+Math.max(0,-stride)*.6);
    rotate('rightUpperLeg',-stride);rotate('rightLowerLeg',Math.max(0,stride)*.6);
    rotate('chest',.08*lunge+.008*Math.sin(t*2),-.18*lift,0);rotate('head',-.03,0,0);
    if(wind){
      if(u<=.55)target('right',-.15-.2*lift,1.15+.4*lift,.18-.35*lift);
      else if(u<1){
        const release=BB.pitchPos(C.pi,0);pitcher.updateMatrixWorld(true);world.set(release.x,release.y,release.z);pitcher.worldToLocal(world);
        const k=ease(BB.clamp((u-.55)/.45,0,1)),x=lerp(-.35,world.x,k),y=lerp(1.55,world.y,k),z=lerp(-.17,world.z,k);target('right',x,y,z);
      }else{const k=BB.clamp((u-1)/.5,0,1),release=BB.pitchPos(C.pi,0);pitcher.updateMatrixWorld(true);world.set(release.x,release.y,release.z);pitcher.worldToLocal(world);const x=lerp(world.x,-.45,k),y=lerp(world.y,.95,k),z=lerp(world.z,.35,k);target('right',x,y,z);}
      target('left',.13,1.13,.22);
    }else{
      target('right',-.22,1.02,.18);target('left',.22,1.05,.2);
    }
    ballInHand.visible=throwing&&elapsed>=0&&elapsed<C.W;
  }
  return {load,update,isActive:()=>shown,isLoaded:()=>!!root,glovePosition:out=>gloveMesh.getWorldPosition(out)};
})();
