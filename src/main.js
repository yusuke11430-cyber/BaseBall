(() => {
'use strict';
const $ = s => document.querySelector(s);
const now = () => performance.now() / 1000;
const lerp = (a, b, t) => a + (b - a) * t;
const ease = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
const TEAM = { away: { jersey: '#e4572e', cap: '#b8361a' }, home: { jersey: '#2e86de', cap: '#174f8f' } };
const WINDUP = 0.85, NET_LEAD = 0.18;   // 投手側は通信ぶん少し長く振りかぶる
const BASES = [[0, 0], [19.4, -19.4], [0, -38.8], [-19.4, -19.4]];
let chosenAvatar = null;
let chosenAvatarId = null;

// =============== 3D シーン ===============
const canvas = $('#c');
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true }); }
catch (e) { document.body.insertAdjacentHTML('beforeend', '<p style="position:fixed;inset:auto 0 40% 0;text-align:center;font-weight:800">このブラウザでは3D表示（WebGL）が使えません。</p>'); return; }
renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(42, 1, 0.05, 1200);

function canvasTex(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
scene.background = canvasTex(4, 256, (g, w, h) => {
  const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#659aa9'); gr.addColorStop(0.55, '#afcfd0'); gr.addColorStop(1, '#e1e9df');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
});
scene.fog = new THREE.Fog(0xd3e0dc, 220, 520);
scene.add(new THREE.HemisphereLight(0xffffff, 0x66765b, 0.64));
const sun = new THREE.DirectionalLight(0xfff1dd, 0.94);
sun.position.set(-50, 110, 70); sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0006; sun.shadow.normalBias = 0.04;
Object.assign(sun.shadow.camera, { left: -95, right: 95, top: 95, bottom: -95, near: 10, far: 400 });
sun.target.position.set(0, 0, -25); scene.add(sun, sun.target);

const M = c => new THREE.MeshLambertMaterial({ color: c });
/*STADIUM_MEDIA*/

// ---- グラウンド（キャンバスに描いた芝と土） ----
(function buildField() {
  const S = 7.3, W = 280, D = 200;
  const P = (x, z) => [(x + 140) * S, (z + 170) * S];
  const tex = canvasTex(Math.round(W * S), Math.round(D * S), (g, w, h) => {
    g.fillStyle = '#477e49'; g.fillRect(0, 0, w, h);
    const [hx, hz] = P(0, 0);
    for (const rot of [Math.PI / 4]) {
      g.save(); g.translate(hx, hz); g.rotate(rot);
      for (let i = -40; i < 40; i++) if (i % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.045)'; g.fillRect(i * 7 * S, -260 * S, 7 * S, 520 * S); }
      g.restore();
    }
    // 外野フェンス際の土
    g.beginPath();
    for (let a = -50; a <= 50; a += 1) { const d = BB.fenceDist(a) + 2, r = a * Math.PI / 180; const [x, y] = P(Math.sin(r) * d, -Math.cos(r) * d); a === -50 ? g.moveTo(x, y) : g.lineTo(x, y); }
    for (let a = 50; a >= -50; a -= 1) { const d = BB.fenceDist(a) - 4.5, r = a * Math.PI / 180; const [x, y] = P(Math.sin(r) * d, -Math.cos(r) * d); g.lineTo(x, y); }
    g.closePath(); g.fillStyle = '#b98661'; g.fill();
    const dirt = '#c99770';
    const circ = (x, z, r, c) => { const [a, b] = P(x, z); g.beginPath(); g.arc(a, b, r * S, 0, Math.PI * 2); g.fillStyle = c; g.fill(); };
    circ(0, -18.4, 29, dirt);
    g.beginPath(); [[0, -3.4], [16.2, -19.4], [0, -35.6], [-16.2, -19.4]].forEach(([x, z], i) => { const [a, b] = P(x, z); i ? g.lineTo(a, b) : g.moveTo(a, b); });
    g.closePath(); g.fillStyle = '#4e874e'; g.fill();
    g.save(); g.clip();
    for (const rot of [Math.PI / 4]) { g.translate(hx, hz); g.rotate(rot); for (let i = -10; i < 10; i++) if (i % 2 === 0) { g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(i * 3.6 * S, -60 * S, 3.6 * S, 120 * S); } }
    g.restore();
    circ(0, -18.44, 2.8, dirt); circ(0, 0, 4.2, dirt);
    [[19.4, -19.4], [0, -38.8], [-19.4, -19.4]].forEach(([x, z]) => circ(x, z, 2.6, dirt));
    // 起動時の一度だけ。芝・土の細かな粒と擦れを既存の地面画像に焼く。
    const grain=BB.rng(41821);
    for(let i=0;i<11000;i++){
      g.fillStyle=i%2?'rgba(255,249,219,.055)':'rgba(30,48,30,.055)';
      g.fillRect(grain()*w,grain()*h,1+grain()*1.5,1+grain()*1.5);
    }
    for(const [x,z] of [[0,0],[19.4,-19.4],[0,-38.8],[-19.4,-19.4]]){
      const [px,py]=P(x,z),r=S*(x===0&&z===0?3.9:2.45),wear=g.createRadialGradient(px,py,r*.12,px,py,r);
      wear.addColorStop(0,'rgba(119,74,44,.17)');wear.addColorStop(.7,'rgba(119,74,44,.06)');wear.addColorStop(1,'rgba(119,74,44,0)');
      g.fillStyle=wear;g.fillRect(px-r,py-r,r*2,r*2);
    }
    // ファウルライン
    g.strokeStyle = '#fbfbf5'; g.lineWidth = 0.14 * S; g.lineCap = 'round';
    for (const s of [1, -1]) { const d = BB.fenceDist(45 * s); const [a, b] = P(0, 0); const [c, e] = P(s * d * Math.SQRT1_2, -d * Math.SQRT1_2); g.beginPath(); g.moveTo(a, b); g.lineTo(c, e); g.stroke(); }
    // バッターボックス
    g.lineWidth = 0.08 * S;
    for (const s of [1, -1]) { const [a, b] = P(s > 0 ? 0.3 : -1.52, -0.92); g.strokeRect(a, b, 1.22 * S, 1.83 * S); }
    const [cx, cz] = P(-0.6, 0.9); g.strokeRect(cx, cz, 1.2 * S, 2.4 * S);
  });
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshLambertMaterial({ map: tex }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(0, 0, -70); ground.receiveShadow = true; scene.add(ground);
  // 外周の芝（遠景）
  const outer = new THREE.Mesh(new THREE.PlaneGeometry(900, 900), M('#527c4d'));
  outer.rotation.x = -Math.PI / 2; outer.position.set(0, -0.05, -70); scene.add(outer);

  // マウンド・ベース・ホームベース
  const mound = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 3.0, 0.25, 40), M('#c99770'));
  mound.position.set(0, 0.12, -18.44); mound.receiveShadow = true; scene.add(mound);
  const rubber = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.15), M('#ffffff')); rubber.position.set(0, 0.27, -18.44); scene.add(rubber);
  [[19.4, -19.4], [0, -38.8], [-19.4, -19.4]].forEach(([x, z]) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.09, 0.42), M('#ffffff')); b.position.set(x, 0.045, z); b.rotation.y = Math.PI / 4; b.castShadow = true; scene.add(b);
  });
  const sh = new THREE.Shape(); sh.moveTo(-0.215, 0); sh.lineTo(0.215, 0); sh.lineTo(0.215, 0.215); sh.lineTo(0, 0.43); sh.lineTo(-0.215, 0.215); sh.closePath();
  const plate = new THREE.Mesh(new THREE.ShapeGeometry(sh), M('#ffffff'));
  plate.rotation.x = -Math.PI / 2; plate.position.set(0, 0.015, 0.215); plate.rotation.z = Math.PI; scene.add(plate);

  // フェンス・ファウルゾーンの壁・スタンド
  const wall = [], outline = BB.stadiumOutline();
  const pole = s => { const d = BB.fenceDist(45 * s); return [s * d * Math.SQRT1_2, -d * Math.SQRT1_2]; };
  // 一周閉じた輪郭。長いファウル側の壁も分割して客席と通路の密度をそろえる。
  const pl = pole(-1), pr = pole(1);
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i], b = outline[(i + 1) % outline.length], count = Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 5);
    for (let j = 0; j < count; j++) wall.push([lerp(a[0], b[0], j / count), lerp(a[1], b[1], j / count)]);
  }
  const paddingTex=canvasTex(512,128,(g,w,h)=>{
    const paint=g.createLinearGradient(0,0,0,h);paint.addColorStop(0,'#3f7465');paint.addColorStop(.18,'#2c5e51');paint.addColorStop(1,'#21483e');g.fillStyle=paint;g.fillRect(0,0,w,h);
    for(let x=0;x<w;x+=64){g.fillStyle='rgba(0,0,0,.25)';g.fillRect(x,0,2,h);g.fillStyle='rgba(255,255,255,.07)';g.fillRect(x+2,0,1,h);}
    g.strokeStyle='#b8cbb5';g.globalAlpha=.7;g.lineWidth=1;g.strokeRect(38,38,w-76,h-76);
    g.fillStyle='#d9e3c9';g.font='600 27px Bahnschrift,sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('SUPER HAGE BASEBALL',w/2,h/2);g.globalAlpha=1;
  });paddingTex.wrapS=THREE.RepeatWrapping;
  const wallMat = new THREE.MeshLambertMaterial({map:paddingTex}), padTop = M('#c5af72');
  const crowd = canvasTex(1024, 512, (g, w, h) => {
    const r = BB.rng(71026), shirts = ['#fff6df', '#e66d4b', '#ffce65', '#6bafd8', '#e9edf2', '#7ab999'];
    g.fillStyle = '#295975'; g.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 14) {
      g.fillStyle = '#1c425d'; g.fillRect(x + 2, y + 2, 10, 12);
      g.fillStyle = '#518caf'; g.fillRect(x + 3, y + 3, 8, 7);
      if (r() < 0.25) continue;
      g.fillStyle = shirts[Math.floor(r() * shirts.length)]; g.fillRect(x + 3, y + 8, 8, 6);
      g.fillStyle = '#f0c69c'; g.beginPath(); g.arc(x + 7, y + 6, 2.5, 0, Math.PI * 2); g.fill();
    }
  });
  crowd.wrapS = crowd.wrapT = THREE.RepeatWrapping;
  const H = 3.2, REF = [0, -45];
  const normals = wall.map(([x1, z1], i) => {
    const [x2, z2] = wall[(i + 1) % wall.length], len = Math.hypot(x2 - x1, z2 - z1);
    let nx = (z2 - z1) / len, nz = -(x2 - x1) / len;
    if (nx * ((x1 + x2) / 2 - REF[0]) + nz * ((z1 + z2) / 2 - REF[1]) < 0) { nx = -nx; nz = -nz; }
    return [nx, nz];
  });
  // 角の頂点を隣の面と共有する。面ごとに押し出すと角に三角形の穴が開く。
  const joints = wall.map((p, i) => {
    const a = normals[(i + wall.length - 1) % wall.length], b = normals[i], d = 1 + a[0] * b[0] + a[1] * b[1];
    return [(a[0] + b[0]) / d, (a[1] + b[1]) / d];
  });
  const ringPoint = (i, depth, y) => [wall[i][0] + joints[i][0] * depth, y, wall[i][1] + joints[i][1] * depth];
  const buckets = Array.from({ length: 6 }, () => ({ pos: [], uv: [], idx: [] }));
  // 客席、蹴上げ、通路、外壁、フェンス、笠木をまとめ、描画回数を抑える。
  function band(d1, y1, d2, y2, material, row = 0, aisles = false) {
    let u = 0;
    for (let i = 0; i < wall.length; i++) {
      const j = (i + 1) % wall.length, len = Math.hypot(wall[j][0] - wall[i][0], wall[j][1] - wall[i][1]);
      const aisle = aisles && Math.floor(u / 32) !== Math.floor((u + len) / 32);
      const bucket = buckets[aisle ? 2 : material], b = bucket.pos.length / 3;
      bucket.pos.push(...ringPoint(i, d1, y1), ...ringPoint(j, d1, y1), ...ringPoint(j, d2, y2), ...ringPoint(i, d2, y2));
      if(material===4)bucket.uv.push(-u/24,y1/H,-(u+len)/24,y1/H,-(u+len)/24,y2/H,-u/24,y2/H);
      else bucket.uv.push(u / 36, row / 32, (u + len) / 36, row / 32, (u + len) / 36, (row + 1) / 32, u / 36, (row + 1) / 32);
      bucket.idx.push(b, b + 1, b + 2, b, b + 2, b + 3); u += len;
    }
  }
  band(0, 0, 0, H, 4); band(0.4, H, 0.4, 0, 4);
  band(-0.03, H + 0.09, 0.47, H + 0.09, 5);
  band(-0.03, H - 0.09, -0.03, H + 0.09, 5);
  band(0.47, H + 0.09, 0.47, H - 0.09, 5);
  let depth = 0.45, height = H;
  for (let row = 0; row < 28; row++) {
    if (row === 14) { band(depth, height, depth + 2.6, height, 2); depth += 2.6; }
    band(depth, height, depth + 1.1, height, 0, row, true); depth += 1.1;
    // 打者の低い視点から見える正面に観客を描き、通路は階段としてつなぐ。
    band(depth, height, depth, height + 0.64, 1, row, true); height += 0.64;
  }
  band(depth, height, depth + 2.2, height, 2); depth += 2.2;
  // 裏側・下面・最前列も閉じ、ロビーや打球カメラからも空洞が見えない構造にする。
  band(depth, height, depth, 0.05, 3);
  band(depth, 0.05, 0.45, 0.05, 3);
  band(0.45, 0.05, 0.45, H, 3);
  // 最上段の立ち上がりと笠木。
  band(depth, height, depth, height + 1.1, 3);
  band(depth - 0.15, height + 1.1, depth + 0.15, height + 1.1, 2);
  const standMaterials = [new THREE.MeshLambertMaterial({map:crowd}),
    new THREE.MeshLambertMaterial({ map: crowd, side: THREE.DoubleSide, emissive: 0x152633, emissiveIntensity: 0.08 }),
    M('#d9d9c9'), M('#bac8c7'), wallMat, padTop];
  buckets.forEach((b, i) => {
    const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2)); geometry.setIndex(b.idx); geometry.computeVertexNormals();
    standMaterials[i].side = THREE.DoubleSide;
    const mesh = new THREE.Mesh(geometry, standMaterials[i]); mesh.name = ['stadium-seats', 'stadium-risers', 'stadium-aisles', 'stadium-shell', 'stadium-fence', 'stadium-padding'][i];
    mesh.receiveShadow = true; scene.add(mesh);
  });
  // ポール
  for (const p of [pl, pr]) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 26, 10), M('#ffcf3f')); m.position.set(p[0], 13, p[1]); scene.add(m); }
  // バックネット
  const net = new THREE.Mesh(new THREE.CylinderGeometry(15.2, 15.2, 7, 24, 1, true, -Math.PI * 0.75 + Math.PI / 2 + Math.PI, Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x1b2a4a, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
  net.position.set(0, 3.5 + 3.2, 0); scene.add(net);
  // 照明塔とスコアボード
  const lampTex=canvasTex(128,64,(g,w,h)=>{
    g.fillStyle='#34494b';g.fillRect(0,0,w,h);
    for(let y=8;y<h;y+=16)for(let x=8;x<w;x+=16){g.fillStyle='#1b3036';g.fillRect(x-6,y-6,13,13);g.fillStyle='#ede8cf';g.beginPath();g.arc(x,y,4.5,0,Math.PI*2);g.fill();g.fillStyle='#fffbed';g.fillRect(x-2,y-2,4,4);}
  });const lampMat=new THREE.MeshBasicMaterial({map:lampTex});
  for (const [x, z] of [[-75, -120], [75, -120], [-90, 10], [90, 10]]) {
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.9, 44, 8), M('#d9dde6')); t.position.set(x, 22, z); scene.add(t);
    const l = new THREE.Mesh(new THREE.BoxGeometry(9, 5, 1), lampMat); l.position.set(x, 45, z); l.lookAt(0, 20, -40); scene.add(l);
  }
  const sb = new THREE.Mesh(new THREE.BoxGeometry(32, 20, 1.5), M('#1b2a4a')); sb.position.set(0, 34, -158); scene.add(sb);
  const sbf = new THREE.Mesh(new THREE.PlaneGeometry(30, 16.875), new THREE.MeshBasicMaterial({ map: canvasTex(512, 288, (g, w, h) => {
    g.fillStyle='#142e32';g.fillRect(0,0,w,h);g.strokeStyle='#254044';g.lineWidth=1;
    for(let x=0;x<w;x+=8){g.beginPath();g.moveTo(x,0);g.lineTo(x,h);g.stroke();}
    for(let y=0;y<h;y+=8){g.beginPath();g.moveTo(0,y);g.lineTo(w,y);g.stroke();}
    g.textAlign='center';g.textBaseline='middle';g.fillStyle='#b7c7b5';g.font='600 18px Bahnschrift,sans-serif';g.fillText('SUPER HAGE',w/2,35);
    g.fillStyle='#f0d69e';g.font='700 60px Bahnschrift,sans-serif';g.fillText('BASEBALL',w/2,100);
    g.fillStyle='#8da69c';g.fillRect(55,145,w-110,1);g.font='500 16px Bahnschrift,sans-serif';g.fillText('PLAY BALL',w/2,173);
  }) }));
  sbf.position.set(0, 34, -157.2); scene.add(sbf);
  STADIUM_MEDIA.init(sbf,paddingTex);
  // 雲
  const cloudTex = canvasTex(128, 64, (g, w, h) => { for (const [x, y, r] of [[40, 38, 22], [64, 30, 26], [90, 38, 20]]) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); } });
  for (let i = 0; i < 9; i++) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, fog: false, depthWrite: false })); s.scale.set(90, 45, 1); s.position.set((Math.random() - 0.5) * 600, 110 + Math.random() * 60, -260 - Math.random() * 160); scene.add(s); }
})();

// ---- 選手（丸っこいオリジナルキャラ） ----
const sphG = new THREE.SphereGeometry(1, 20, 14);
// 全選手で同じ形を共有。頂点数・形・当たり判定は変えず、重複バッファだけ削減。
const playerLegG=new THREE.CylinderGeometry(.085,.1,.42,10);
const playerCapG=new THREE.SphereGeometry(.262,20,10,0,Math.PI*2,0,Math.PI/2);
const playerBrimG=new THREE.CylinderGeometry(.17,.17,.03,16,1,false,-Math.PI/2,Math.PI);
const clothTex=canvasTex(256,128,(g,w,h)=>{g.fillStyle='#ffffff';g.fillRect(0,0,w,h);AVATAR.paintCloth(g,w,h);});
function makePlayer(team, opts = {}) {
  const g = new THREE.Group();
  const jersey = M(team.jersey), cap = M(team.cap), pants = M('#f5f2ea'), skin = M('#f3c9a1'), dark = M('#24262e'), glove = M('#ffffff');
  const add = (geo, mat, x, y, z, sx = 1, sy = sx, sz = sx) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m; };
  const body = add(sphG, jersey, 0, 0.78, 0, 0.3, 0.34, 0.27);
  const legG = playerLegG;
  const legL = add(legG, pants, -0.11, 0.3, 0), legR = add(legG, pants, 0.11, 0.3, 0);
  add(sphG, dark, -0.11, 0.07, 0.04, 0.1, 0.06, 0.15); add(sphG, dark, 0.11, 0.07, 0.04, 0.1, 0.06, 0.15);
  const head = new THREE.Group(); head.position.set(0, 1.33, 0); g.add(head);
  const hm = new THREE.Mesh(sphG, skin); hm.scale.setScalar(0.25); hm.castShadow = true; head.add(hm);
  const capM = new THREE.Mesh(playerCapG, cap); capM.position.y = 0.03; head.add(capM);
  const brim = new THREE.Mesh(playerBrimG, cap); brim.position.set(0, 0.04, 0.12); head.add(brim);
  const eyes = [];
  for (const x of [-0.085, 0.085]) { const e = new THREE.Mesh(sphG, dark); e.scale.set(0.032, 0.045, 0.02); e.position.set(x, -0.01, 0.235); head.add(e); eyes.push(e); }
  const handL = add(sphG, opts.mitt ? M('#9c5a2c') : glove, -0.37, 0.8, 0.06, opts.mitt ? 0.12 : 0.085);
  const handR = add(sphG, glove, 0.37, 0.8, 0.06, 0.085);
  g.userData = { jersey, cap, skin, body, head, handL, handR, legL, legR, eyes, capMesh: capM, brim };
  scene.add(g); return g;
}
function setTeam(p, t) { p.userData.jersey.color.set(t.jersey); p.userData.cap.color.set(t.cap); }
function applyAvatar(p, value, team) {
  const u = p.userData, a = value ? AVATAR.clean(value) : null, key = a ? JSON.stringify(a) : 'default';
  if (u.avatarKey !== key) {
    if (u.skin.map) u.skin.map.dispose(); if (u.jersey.map&&u.jersey.map!==clothTex) u.jersey.map.dispose();
    u.skin.map = a ? canvasTex(512, 256, (g,w,h) => AVATAR.paintHead(g,w,h,a)) : null;
    u.jersey.map = a ? canvasTex(512, 256, (g,w,h) => AVATAR.paintJersey(g,w,h,a)) : clothTex;
    u.skin.needsUpdate = u.jersey.needsUpdate = true;
    u.eyes.forEach(e => e.visible = !a); u.avatarKey = key;
    u.skinBase = new THREE.Color(a ? '#ffffff' : '#f3c9a1');
  }
  u.skin.color.copy(u.skinBase);
  u.jersey.color.set(a ? '#ffffff' : team.jersey); u.cap.color.set(a ? a.hatColor : team.cap);
  u.capMesh.visible = !a || a.hat === 1 || a.hat === 2;
  u.brim.visible = !a || a.hat !== 0; u.brim.rotation.y = a && a.hat === 2 ? Math.PI : 0;
  u.brim.position.z = a && a.hat === 2 ? -0.12 : 0.12;
}
function runPose(p, t, moving) {
  const u = p.userData, k = moving ? Math.sin(t * 16) : 0;
  u.legL.position.z = k * 0.12; u.legR.position.z = -k * 0.12;
  u.body.position.y = 0.78 + Math.abs(k) * 0.04 * (moving ? 1 : 0);
}

const FIELD_POS = { p: [0, -18.44], c: [0, 1.6], b1: [16.5, -24], b2: [7, -33], ss: [-8, -32], b3: [-17, -23], lf: [-30, -78], cf: [0, -90], rf: [30, -78] };
const fielders = {};
for (const k in FIELD_POS) { fielders[k] = makePlayer(TEAM.home, { mitt: true }); fielders[k].userData.base = FIELD_POS[k]; }
const pitcher = fielders.p, catcher = fielders.c;
/*PITCHER_MODEL*/
catcher.rotation.y = Math.PI; catcher.scale.set(1, 0.62, 1);
const batter = makePlayer(TEAM.away);
batter.position.set(-0.95, 0, -0.05); batter.rotation.y = Math.PI / 2;
batter.userData.handL.visible = batter.userData.handR.visible = false;
const runners = [0, 1, 2].map(() => makePlayer(TEAM.away));
const batRunner = makePlayer(TEAM.away);

// バット
const batPivot = new THREE.Group(); scene.add(batPivot);
const batMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.016, BB.BAT.length, 12), M('#d9a066'));
batMesh.position.y = BB.BAT.length / 2 + 0.04; batMesh.castShadow = true; batPivot.add(batMesh);
for (const y of [0, 0.09]) { const h = new THREE.Mesh(sphG, M('#ffffff')); h.scale.setScalar(0.07); h.position.y = y; batPivot.add(h); }
const BAT_HOME = new THREE.Vector3(-0.62, 1.02, 0.08);
batPivot.position.copy(BAT_HOME);
const Y = new THREE.Vector3(0, 1, 0);
const qDir = (x, y, z) => new THREE.Quaternion().setFromUnitVectors(Y, new THREE.Vector3(x, y, z).normalize());
const SWING_KEYS = [[0, qDir(-0.15, 0.8, 0.55)], [0.035, qDir(-0.1, 0.25, 1)], [BB.SWING_LAG, qDir(1, 0.02, 0)], [0.14, qDir(0.25, 0.1, -1)], [0.32, qDir(-0.7, 0.55, -0.45)], [0.55, qDir(-0.15, 0.8, 0.55)]];
batPivot.quaternion.copy(SWING_KEYS[0][1]);
// 左打席用：左右反転したスイング
const SWING_KEYS_L = SWING_KEYS.map(([t, q]) => { const v = new THREE.Vector3(0, 1, 0).applyQuaternion(q); return [t, qDir(-v.x, v.y, v.z)]; });
const BUNT_Q = { R: qDir(1, 0.02, 0), L: qDir(-1, 0.02, 0) };
// ST: 自分が打つときの構え（lh=左打席, x=打席内の左右位置, dz=前後 -が投手寄り, b=バント）
const ST = { lh: false, x: -0.95, dz: 0, b: false };
let VIS = { lh: false, x: -0.95, dz: 0, b: false };   // 画面に出している打者の構え
let stanceTarget = null, stanceFrameAt = null;
const handOf = st => st.lh ? -1 : 1;
const keysOf = st => st.lh ? SWING_KEYS_L : SWING_KEYS;
const batHome = st => new THREE.Vector3(st.x + handOf(st) * 0.33, 1.02, 0.08 + st.dz);
function applyStance(st, smooth = false) {
  const next = { lh: !!st.lh, x: BB.clamp(Number.isFinite(+st.x) ? +st.x : -0.95, -1.45, 1.45), dz: BB.clamp(Number.isFinite(+st.dz) ? +st.dz : 0, -0.9, 0.6), b: !!st.b };
  if (Math.abs(next.x) < 0.55) next.x = next.lh ? 0.95 : -0.95;
  if ((next.x > 0) !== next.lh) next.x = -next.x;
  const bounds=BB.batCursorBounds(next.x,next.lh);
  next.cx=BB.clamp(Number.isFinite(st.cx)?st.cx:0,bounds.min,bounds.max);next.cy=BB.clamp(Number.isFinite(st.cy)?st.cy:.85,.34,1.3);
  // 打席の切替は瞬時に。通常の相手の移動だけを補間する。
  if (smooth && next.lh === VIS.lh) { stanceTarget = next; VIS.b = next.b; VIS.cx=next.cx;VIS.cy=next.cy;return; }
  stanceTarget = null; VIS = next; placeStance();
}
function placeStance() {
  batter.position.set(VIS.x, 0, -0.05 + VIS.dz);
  if (C.swingAt === null && !VIS.b) { batter.rotation.y = VIS.lh ? -Math.PI / 2 : Math.PI / 2; batPivot.position.copy(batHome(VIS)); batPivot.quaternion.copy(keysOf(VIS)[0][1]); }
  plane.constant = -VIS.dz; cursor.position.z = VIS.dz;
}
function updateStance(t) {
  if (C.phase === 'brawl') return;
  const dt = stanceFrameAt === null ? 0 : BB.clamp(t - stanceFrameAt, 0, .05); stanceFrameAt = t;
  // 自分の移動は描画フレームに合わせ、処理落ちや高Hz画面で速度が変わらないようにする。
  if (role() === 'bat' && !['play','call','lobby','over'].includes(C.phase)) {
    const dx = (keys.d ? 1 : 0) - (keys.a ? 1 : 0), dz = (keys.s ? 1 : 0) - (keys.w ? 1 : 0);
    if (dx || dz) moveStance(dx * .75 * dt, dz * .75 * dt);
  } else if (stanceTarget && !['play','call','lobby','over'].includes(C.phase)) {
    const k = 1 - Math.exp(-dt / .055);
    VIS.x += (stanceTarget.x - VIS.x) * k; VIS.dz += (stanceTarget.dz - VIS.dz) * k;
    if (Math.abs(stanceTarget.x - VIS.x) + Math.abs(stanceTarget.dz - VIS.dz) < .0001) { VIS.x = stanceTarget.x; VIS.dz = stanceTarget.dz; }
    placeStance();
  }
}

// ボール・影・ゾーン・カーソル
const ball = new THREE.Mesh(sphG, M('#ffffff')); ball.scale.setScalar(0.075); ball.castShadow = true; scene.add(ball);
const seam = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.08, 6, 24), M('#e4402e')); ball.add(seam);
const ballShadow = new THREE.Mesh(new THREE.CircleGeometry(0.09, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }));
ballShadow.rotation.x = -Math.PI / 2; scene.add(ballShadow);
const overlay = (obj, order) => { obj.renderOrder = order; obj.traverse(o => { if (o.material) { o.material.depthTest = false; o.material.transparent = true; } }); return obj; };
let zoneLine = null;
// ---- 投球を見やすく：ボールの光・軌跡・本塁通過マーク ----
const glowTex = canvasTex(64, 64, g => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,240,170,.75)'); gr.addColorStop(1, 'rgba(255,220,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
const ballGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, depthTest: false, depthWrite: false, transparent: true, opacity: 0.85 }));
ballGlow.scale.set(0.3, 0.3, 1); ballGlow.renderOrder = 4; ballGlow.visible = false;
const trail = [];
for (let i = 0; i < 7; i++) { const t = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, depthTest: false, depthWrite: false, transparent: true, opacity: 0.45 * (1 - i / 7) })); t.scale.setScalar(0.2 * (1 - i / 9)); t.renderOrder = 3; t.visible = false; trail.push(t); }
const trailHist = [];
// 本塁を通過した位置（ストライクなら黄色、ボールなら白）
const crossMark = new THREE.Group();
{
  const ringM = new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide, transparent: true });
  crossMark.add(new THREE.Mesh(new THREE.RingGeometry(0.055, 0.075, 32), ringM));
  crossMark.add(new THREE.Mesh(new THREE.CircleGeometry(0.04, 24), new THREE.MeshBasicMaterial({ color: 0xffd23f, side: THREE.DoubleSide, transparent: true, opacity: 0.6 })));
}
function showBallFx(p, on) {
  ballGlow.visible = on; if (on) ballGlow.position.copy(p);
  if (on) { trailHist.unshift(p.clone()); if (trailHist.length > 14) trailHist.pop(); } else trailHist.length = 0;
  trail.forEach((t, i) => { const h = trailHist[i * 2 + 2]; t.visible = on && !!h; if (h) t.position.copy(h); });
}
const zone = new THREE.Group();
{
  const Z = BB.ZONE, lm = zoneLine = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.85 }), lm2 = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.3 });
  const pts = [[Z.x0, Z.y0], [Z.x1, Z.y0], [Z.x1, Z.y1], [Z.x0, Z.y1], [Z.x0, Z.y0]].map(([x, y]) => new THREE.Vector3(x, y, 0));
  zone.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), lm));
  const g = [];
  for (let i = 1; i < 3; i++) { const x = lerp(Z.x0, Z.x1, i / 3), y = lerp(Z.y0, Z.y1, i / 3); g.push(new THREE.Vector3(x, Z.y0, 0), new THREE.Vector3(x, Z.y1, 0), new THREE.Vector3(Z.x0, y, 0), new THREE.Vector3(Z.x1, y, 0)); }
  zone.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(g), lm2));
}
overlay(zone, 5); scene.add(zone);
scene.add(ballGlow); trail.forEach(t => scene.add(t));
overlay(crossMark, 6); crossMark.visible = false; scene.add(crossMark);
function resetBallFx() { showBallFx(null, false); crossMark.visible = false; if (zoneLine) zoneLine.color.set(0xffffff); }
const cursor = new THREE.Group();
{
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1, 48), new THREE.MeshBasicMaterial({ color: 0xffb627, opacity: 0.95, side: THREE.DoubleSide }));
  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.86, 48), new THREE.MeshBasicMaterial({ color: 0xffe08a, opacity: 0.28, side: THREE.DoubleSide }));
  const core = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color: 0xff7a1a, opacity: 0.9, side: THREE.DoubleSide }));
  core.scale.set(BB.MEET.ry / BB.MEET.rx, 1, 1);
  cursor.add(fill, ring, core); cursor.scale.set(BB.MEET.rx, BB.MEET.ry, 1);
}
overlay(cursor, 6); scene.add(cursor);
const aim = new THREE.Group();
{
  const mt = new THREE.MeshBasicMaterial({ color: 0xe4402e, opacity: 0.95, side: THREE.DoubleSide });
  aim.add(new THREE.Mesh(new THREE.RingGeometry(0.045, 0.06, 32), mt));
  for (const [w, h] of [[0.16, 0.012], [0.012, 0.16]]) aim.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), mt));
}
overlay(aim, 7); scene.add(aim);
const guess = new THREE.Group();
{
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.22, side: THREE.DoubleSide }));
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 40), new THREE.MeshBasicMaterial({ color: 0x5ec8ff, opacity: 0.9, side: THREE.DoubleSide }));
  guess.add(disc, ring);
}
overlay(guess, 5); guess.visible = false; scene.add(guess);
const mitt = new THREE.Mesh(sphG, M('#9c5a2c')); mitt.scale.setScalar(0.1); scene.add(mitt);
const MITT_HOME = new THREE.Vector3(0, 0.42, 1.25);

// 紙吹雪（ホームラン用）
const confetti = []; const confG = new THREE.PlaneGeometry(0.5, 0.3);
function burst(at) {
  const cs = [0xffb627, 0xe4572e, 0x2e86de, 0xffffff, 0x7ad36b];
  for (let i = 0; i < 70; i++) { const m = new THREE.Mesh(confG, new THREE.MeshBasicMaterial({ color: cs[i % 5], side: THREE.DoubleSide })); m.position.copy(at);
    m.userData.v = new THREE.Vector3((Math.random() - 0.5) * 18, 8 + Math.random() * 12, (Math.random() - 0.5) * 18); m.userData.life = 3; scene.add(m); confetti.push(m); }
}

// ---- カメラ ----
const cam = { mode: 'lobby', look: new THREE.Vector3(0, 1, -18), t: 0 };
const PITCH_CAM = { pos: new THREE.Vector3(0, 2.25, 5.3), look: new THREE.Vector3(0, 0.95, -9), fov: 34 };
const MOUND_CAM = { pos: new THREE.Vector3(0.75, 2.95, -22.6), look: new THREE.Vector3(0, 0.75, 0), fov: 26 };
const fovFor = (halfV, halfH) => Math.min(80, Math.max(2 * halfV, 2 * Math.atan(Math.tan(halfH * Math.PI / 180) / camera.aspect) * 180 / Math.PI));
let FIELD_FOV = 42;
function resize() {
  const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h;
  PITCH_CAM.fov = fovFor(15, 17); MOUND_CAM.fov = fovFor(12, 11); FIELD_FOV = fovFor(21, 24);
  if (camera.aspect < 1) { PITCH_CAM.pos.set(0, 1.85, 3.5); PITCH_CAM.look.set(0, 0.85, -9); }
  else { PITCH_CAM.pos.set(0, 2.25, 5.3); PITCH_CAM.look.set(0, 0.05, -9); }
  if (!cam.fov) cam.fov = FIELD_FOV;
  camera.fov = cam.fov; camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

// ---- 効果音 ----
let AC = null;
const SND = { raw: {}, buf: {}, vol: { bgm: 5, voice: 20, sfx: 20 }, master: null, sfx: null, voice: null, bgm: null, mode: null, cur: null, duck: 1 };
const bgmLevel = () => (BGM_VOL[SND.mode] || 0.3) * SND.duck * SND.vol.bgm / 60;
const SND_NAMES = ['v_playball', 'v_ball', 'v_strike', 'v_strikeout', 'v_walk', 'v_foul', 'v_out', 'v_safe', 'v_hit', 'v_double', 'v_triple', 'v_homerun', 'v_gameset', 'v_deadball', 'v_fight',
  's_bat_metal1', 's_bat_metal2', 's_bat_wood1', 's_bat_wood2', 's_mitt', 's_glove', 's_swing1', 's_swing2', 's_cheer', 's_cheer_big', 's_select1', 's_select2',
  's_applause_short', 's_applause_mid', 's_applause_long', 's_applause_far',
  'bgm_lobby', 'bgm_01', 'bgm_02', 'bgm_03', 'bgm_04', 'bgm_05', 'bgm_06', 'bgm_07', 'bgm_08', 'bgm_09', 'bgm_10'];
// 声と効果音を先に、BGMは後から読み込む
SND_NAMES.forEach((n, i) => setTimeout(() => {
  try {
    fetch('audio/' + n + '.mp3').then(r => r.ok ? r.arrayBuffer() : null).then(b => { if (b) { SND.raw[n] = b; decodeSnd(n); } }).catch(() => { });
  } catch (e) { }
}, n.startsWith('bgm') ? 400 + i * 60 : 0));
function decodeSnd(n) {
  if (!AC || SND.buf[n] || !SND.raw[n] || SND.raw[n].busy) return;
  const raw = SND.raw[n]; raw.busy = true;
  try { AC.decodeAudioData(raw.slice(0), b => { SND.buf[n] = b; if (n.startsWith('bgm')) bgmTick(); }, () => { }); } catch (e) { }
}
function audio() {
  if (!AC) try {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    SND.master = AC.createGain(); SND.master.connect(AC.destination);
    SND.sfx = AC.createGain(); SND.sfx.connect(SND.master); SND.sfx.gain.value = SND.vol.sfx / 80;
    SND.voice = AC.createGain(); SND.voice.connect(SND.master); SND.voice.gain.value = SND.vol.voice / 90;
    SND.bgm = AC.createGain(); SND.bgm.connect(SND.master); SND.bgm.gain.value = 0;
    Object.keys(SND.raw).forEach(decodeSnd); bgmTick();
  } catch (e) { }
  if (AC && AC.state === 'suspended') AC.resume();
}
// 鳴らせたら true（まだ読み込み中なら false を返し、合成音などで代わりに鳴らす）
function play(n, vol = 1, rate = 1, onEnded) {
  const isVoice = n.startsWith('v_');
  if (!AC || (isVoice ? SND.vol.voice : SND.vol.sfx) <= 0) return !!AC;
  const b = SND.buf[n]; if (!b) return false;
  const src = AC.createBufferSource(), g = AC.createGain(); src.buffer = b; src.playbackRate.value = rate; g.gain.value = vol;
  if(onEnded)src.onended=onEnded;
  src.connect(g).connect(isVoice ? SND.voice : SND.sfx); src.start(); return true;
}
const pick = a => a[(Math.random() * a.length) | 0];
// ---- BGM：ロビーは専用曲をループ、試合中は攻撃側チームの応援歌を順番に流す ----
const BGM_SETS = { lobby: ['bgm_lobby'], away: ['bgm_01', 'bgm_02', 'bgm_03', 'bgm_04', 'bgm_05'], home: ['bgm_06', 'bgm_07', 'bgm_08', 'bgm_09', 'bgm_10'] };
const BGM_VOL = { lobby: 0.5, away: 0.32, home: 0.32 };
function setBgm(mode) { if (SND.mode === mode) return; SND.mode = mode; bgmTick(true); }
function bgmFadeOut(entry, t = 0.8) {
  if (!entry) return; try { entry.g.gain.cancelScheduledValues(AC.currentTime); entry.g.gain.setTargetAtTime(0, AC.currentTime, t / 4); entry.src.stop(AC.currentTime + t); } catch (e) { }
}
function bgmTick(force) {
  if (!AC || !SND.bgm) return;
  SND.bgm.gain.setTargetAtTime(bgmLevel(), AC.currentTime, 0.15);
  const mode = SND.mode, cur = SND.cur;
  if (!mode) { if (cur) { bgmFadeOut(cur); SND.cur = null; } return; }
  if (cur && cur.mode === mode && !force) return;
  if (cur && cur.mode === mode && force) return;
  const list = BGM_SETS[mode].filter(n => SND.buf[n]);
  if (!list.length) { if (cur && cur.mode !== mode) { bgmFadeOut(cur); SND.cur = null; } return; }
  if (cur) bgmFadeOut(cur);
  startTrack(mode, pick(list));
}
function startTrack(mode, n, prev) {
  const src = AC.createBufferSource(), g = AC.createGain(); src.buffer = SND.buf[n];
  src.loop = mode === 'lobby';
  g.gain.setValueAtTime(0, AC.currentTime); g.gain.setTargetAtTime(1, AC.currentTime, 0.25);
  src.connect(g).connect(SND.bgm); src.start();
  const entry = { mode, n, src, g }; SND.cur = entry;
  if (!src.loop) src.onended = () => {
    if (SND.cur !== entry) return;
    const list = BGM_SETS[mode].filter(x => SND.buf[x] && x !== n);
    startTrack(mode, list.length ? pick(list) : n);
  };
}
function duckBgm(on) { SND.duck = on ? 0.4 : 1; if (AC && SND.bgm) SND.bgm.gain.setTargetAtTime(bgmLevel(), AC.currentTime, on ? 0.08 : 0.6); }
document.addEventListener('pointerdown', () => audio(), { capture: true });
function noise(dur, freq, q, gain, type = 'bandpass') {
  if (!AC) return; const n = AC.sampleRate * dur, buf = AC.createBuffer(1, n, AC.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
  const s = AC.createBufferSource(); s.buffer = buf; const f = AC.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = AC.createGain(); g.gain.value = gain; s.connect(f).connect(g).connect(AC.destination); s.start();
}
function tone(freq, dur, gain, type = 'sine') { if (!AC) return; const o = AC.createOscillator(), g = AC.createGain(); o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(gain, AC.currentTime); g.gain.exponentialRampToValueAtTime(0.0001, AC.currentTime + dur); o.connect(g).connect(AC.destination); o.start(); o.stop(AC.currentTime + dur); }
// 読み込み前や読み込み失敗時は、合成音で代わりに鳴らす
const SFX = {
  hit: (ev = 140, contact = 'solid') => {
    const sweet = contact === 'sweet', soft = ['jam','tip','glance','bunt'].includes(contact);
    const gain = sweet ? 1 : contact === 'bunt' ? 0.35 : soft ? 0.6 : 0.85;
    const names = sweet || (!soft && ev >= 150) ? ['s_bat_metal1','s_bat_metal2'] : ['s_bat_wood1','s_bat_wood2'];
    if (!play(pick(names), gain)) { noise(soft ? 0.09 : 0.16, soft ? 750 : 2600, 1.2, gain * 0.8); tone(sweet ? 1900 : soft ? 520 : 1300, 0.1, gain * 0.22, 'triangle'); }
  },
  mitt: () => { if (!play('s_mitt', 0.9)) noise(0.1, 500, 1, 0.8, 'lowpass'); },
  glove: () => { if (!play('s_glove', 0.8)) noise(0.08, 700, 1, 0.6, 'lowpass'); },
  cheer: big => { if (!play(big ? 's_cheer_big' : 's_cheer', 0.8)) noise(2.2, 1200, 0.4, 0.35); },
  clap: kind => { play('s_applause_' + kind, kind === 'long' ? 0.8 : 0.65); },
  whoosh: () => { if (!play(pick(['s_swing1', 's_swing2']), 0.8)) noise(0.25, 900, 0.8, 0.25); },
  select: () => { play('s_select1', 0.5); },
};

// 1組のメッシュを再利用し、打撃のたびにオブジェクトを増やさない。
const CONTACT_NOTES = { sweet: '芯で捉えた！', solid: 'ナイスミート', jam: '詰まった', tip: 'バットの先', glance: 'こすった', bunt: 'バント' };
const contactRing = new THREE.Mesh(new THREE.RingGeometry(0.075, 0.09, 32), new THREE.MeshBasicMaterial({ color: 0xffb627, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide }));
const contactGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffd25c, transparent: true, depthTest: false, depthWrite: false }));
contactRing.renderOrder = contactGlow.renderOrder = 12; contactRing.visible = contactGlow.visible = false; scene.add(contactRing, contactGlow);
let contactFx = null;
function clearContactFeedback() {
  contactFx = null; contactRing.visible = contactGlow.visible = false; $('#contactNote').classList.remove('show');
}
function contactFeedback(o) {
  const grade = CONTACT_NOTES[o.contact] ? o.contact : o.bunt ? 'bunt' : 'solid';
  SFX.hit(o.ev, grade);
  const at = BB.contactPoint(C.pi, o.sz), sweet = grade === 'sweet';
  contactFx = { t: now(), grade, at };
  contactRing.position.set(at.x, at.y, at.z); contactGlow.position.copy(contactRing.position);
  contactRing.material.color.set(sweet ? 0xffb627 : 0xfff4dc); contactGlow.material.color.set(sweet ? 0xffcf46 : 0xffffff);
  const note = $('#contactNote'); note.textContent = CONTACT_NOTES[grade]; note.dataset.grade = grade; note.classList.add('show');
}
function updateContactFx(t) {
  if (!contactFx) return;
  const e = Math.max(0, t - contactFx.t), sweet = contactFx.grade === 'sweet', duration = sweet ? 0.24 : 0.16;
  const u = BB.clamp(e / duration, 0, 1);
  contactRing.visible = contactGlow.visible = u < 1;
  contactRing.quaternion.copy(camera.quaternion); contactRing.scale.setScalar((sweet ? 1 : 0.7) * (1 + u * 2));
  contactRing.material.opacity = (1 - u) * (sweet ? 1 : 0.65);
  contactGlow.scale.setScalar((sweet ? 0.3 : 0.16) * (1 + u)); contactGlow.material.opacity = (1 - u) * 0.7;
  if (e > 1) { $('#contactNote').classList.remove('show'); contactFx = null; }
}

// ---- スタミナの見た目（頭上ゲージ・汗・湯気・顔色・肩で息） ----
const SKIN = new THREE.Color('#f3c9a1'), FLUSH = new THREE.Color('#ee7f6f');
const gauge = (() => {
  const c = document.createElement('canvas'); c.width = 160; c.height = 40;
  const tex = new THREE.CanvasTexture(c); tex.encoding = THREE.sRGBEncoding;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(1.5, 0.375, 1); sp.renderOrder = 8; sp.visible = false; scene.add(sp);
  return { c, tex, sp, last: -1 };
})();
function drawGauge(S) {
  const v = Math.round(S); if (v === gauge.last) return; gauge.last = v;
  const g = gauge.c.getContext('2d'), w = 160, h = 40, r = 12;
  g.clearRect(0, 0, w, h);
  const rr = (x, y, ww, hh, rad) => { g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + ww, y, x + ww, y + hh, rad); g.arcTo(x + ww, y + hh, x, y + hh, rad); g.arcTo(x, y + hh, x, y, rad); g.arcTo(x, y, x + ww, y, rad); g.closePath(); };
  rr(3, 6, w - 6, h - 12, r); g.fillStyle = '#fffdf6'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#1b2a4a'; g.stroke();
  const fw = Math.max(0, (w - 16) * S / 100);
  if (fw > 0) { rr(8, 11, Math.max(fw, 12), h - 22, 7); g.fillStyle = S > 50 ? '#3fbf5a' : S > 20 ? '#ffb627' : '#e4402e'; g.fill(); }
  gauge.tex.needsUpdate = true;
}
const dropTex = canvasTex(32, 48, (g) => { g.fillStyle = '#5ec8ff'; g.beginPath(); g.moveTo(16, 2); g.bezierCurveTo(30, 24, 30, 44, 16, 44); g.bezierCurveTo(2, 44, 2, 24, 16, 2); g.fill(); g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(12, 30, 4, 0, 7); g.fill(); });
const puffTex = canvasTex(64, 64, (g) => { const gr = g.createRadialGradient(32, 32, 0, 32, 32, 30); gr.addColorStop(0, 'rgba(255,255,255,.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); });
const fx = [];
function spawnFx(kind, at) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: kind === 'drop' ? dropTex : puffTex, transparent: true, depthWrite: false }));
  sp.position.copy(at);
  const side = Math.random() < 0.5 ? -1 : 1;
  if (kind === 'drop') { sp.scale.set(0.09, 0.13, 1); sp.position.x += side * 0.22; sp.userData = { v: new THREE.Vector3(side * (0.4 + Math.random() * 0.5), 1.2 + Math.random(), (Math.random() - 0.5) * 0.4), life: 0.7, g: 6, kind }; }
  else { sp.scale.set(0.25, 0.25, 1); sp.position.y += 0.2; sp.userData = { v: new THREE.Vector3((Math.random() - 0.5) * 0.3, 0.7, (Math.random() - 0.5) * 0.3), life: 1.2, g: -0.3, kind }; }
  sp.userData.max = sp.userData.life; scene.add(sp); fx.push(sp);
}
let fxClock = 0;
function updateStaminaLook(t, dt) {
  const show = !!C.gs && C.phase !== 'lobby' && C.phase !== 'over';
  const S = show ? staminaNow() : 100, tired = BB.clamp(1 - S / 60, 0, 1);
  const ud = pitcher.userData;
  ud.skin.color.copy(ud.skinBase || SKIN).lerp(FLUSH, tired);
  const idle = C.phase === 'aim' || C.phase === 'wait' || C.phase === 'ready';
  const heave = idle ? Math.sin(t * (3 + 6 * tired)) * 0.07 * tired : 0;
  ud.body.scale.y = 0.34 * (1 + heave); ud.head.position.y = 1.33 + heave * 0.35;
  if (idle) pitcher.rotation.x = 0.12 * tired; // 前かがみ
  gauge.sp.visible = show && cam.mode !== 'mound';
  if (show) { drawGauge(S); gauge.sp.position.set(pitcher.position.x, pitcher.position.y + 2.05, pitcher.position.z); }
  // 汗（スタミナ55未満）と湯気（20未満）
  if (show && C.phase !== 'play') {
    fxClock -= dt;
    if (S < 55 && fxClock <= 0) {
      const head = new THREE.Vector3(); ud.head.getWorldPosition(head);
      spawnFx('drop', head); if (S < 20) spawnFx('puff', head);
      fxClock = 0.12 + (S / 55) * 0.5;
    }
  }
  for (let i = fx.length - 1; i >= 0; i--) {
    const m = fx[i], u = m.userData; u.v.y -= u.g * dt; m.position.addScaledVector(u.v, dt); u.life -= dt;
    m.material.opacity = Math.max(0, u.life / u.max); if (u.kind === 'puff') m.scale.multiplyScalar(1 + dt * 0.8);
    if (u.life <= 0) { scene.remove(m); m.material.dispose(); fx.splice(i, 1); }
  }
}

// ---- 審判の声（ブラウザの音声合成） ----
const VOICE = { on: true, ja: null };
function pickVoice() {
  try {
    const vs = speechSynthesis.getVoices().filter(v => /^ja/i.test(v.lang));
    VOICE.ja = vs.find(v => /otoya|ichiro|keita|daichi|male|男/i.test(v.name)) || vs.find(v => /google/i.test(v.name)) || vs[0] || null;
  } catch (e) { }
}
if ('speechSynthesis' in window) { pickVoice(); try { speechSynthesis.addEventListener('voiceschanged', pickVoice); } catch (e) { } }
const VOICE_FILE = { play: 'v_playball', ball: 'v_ball', strike: 'v_strike', whiff: 'v_strike', k: 'v_strikeout', walk: 'v_walk', foul: 'v_foul',
  out: 'v_out', safe: 'v_safe', hit: 'v_hit', double: 'v_double', triple: 'v_triple', hr: 'v_homerun', set: 'v_gameset', deadball: 'v_deadball', fight: 'v_fight' };
function call2(key, onEnded) { // 審判・アナウンスの声
  if (SND.vol.voice <= 0) { if(onEnded)setTimeout(onEnded,2300);return; }
  const f = VOICE_FILE[key];
  if (f && AC && SND.buf[f]) return play(f, 1, 1, onEnded);
  shout(CALLS[key] || '');
  if(onEnded)setTimeout(onEnded,2300); // 未読込時も進行を止め続けない。
}
function shout(text, opt = {}) {
  if (SND.vol.voice <= 0 || !text || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'ja-JP'; if (VOICE.ja) u.voice = VOICE.ja;
    u.rate = opt.rate || 1.15; u.pitch = opt.pitch || 1.25; u.volume = SND.vol.voice / 100;
    speechSynthesis.speak(u);
  } catch (e) { }
}
const CALLS = {
  ball: 'ボォール！', strike: 'ストラーイク！', whiff: 'ストラーイク！', foul: 'ファール！',
  k: 'ストラーイク！ バッター、アウトォ！', walk: 'ボール、フォア！', out: 'アウトォ！', safe: 'セーフ！',
  hr: 'ホームラン！', play: 'プレイボォール！', set: 'ゲーム、セット！', change: 'チェンジ！', hit: 'ヒット！', double: 'ツーベース！', triple: 'スリーベース！',
};

// =============== ゲーム進行 ===============
const C = {
  looks: { home: null, away: null },
  seat: null, gs: null, phase: 'lobby', pitchType: 'st', aim: { x: 0, y: 0.8 }, cur: { x: 0, y: 0.8 },
  pi: null, t0: 0, W: WINDUP, dur: 0.5, out: null, swingAt: null, impactAt: null, resolved: false,
  pendingPi: null, play: null, names: { away: 'ビジター', home: 'ホーム' }, token: 0,
};
const role = () => {
  if (!C.gs) return 'watch';
  const bat = BB.batSide(C.gs);
  if (C.seat === bat) return 'bat';
  if (C.seat === 'home' || C.seat === 'away') return 'pitch';
  return 'watch';
};
const clone = o => JSON.parse(JSON.stringify(o));
const seed = () => (Math.random() * 4294967295) >>> 0;

function show(el, on) { (typeof el === 'string' ? $(el) : el).hidden = !on; }
function status(html) { $('#status').innerHTML = html || ''; refreshPanel(); }
function wantsBrawlAdvice(gs,seat) {
  if(!gs||gs.over||gs.brawlEnabled===false||!['home','away'].includes(seat)||BB.batSide(gs)===seat)return false;
  const opponent=seat==='home'?'away':'home';
  return gs.inning>=Math.floor(gs.innings*2/3)+1&&gs.score[seat]<gs.score[opponent];
}
function refreshPanel() {
  show('#brawlAdvice',C.phase==='aim'&&wantsBrawlAdvice(C.gs,C.seat));
  const busy = !$('#pitchUI').hidden || !$('#batUI').hidden || $('#status').textContent.trim() !== '';
  $('#panel').hidden = !busy || C.phase === 'lobby' || C.phase === 'over' || C.phase === 'brawl';
}
let bannerT = 0;
function banner(text, kind) {
  const b = $('#banner'); b.textContent = text; b.className = 'banner show' + (kind ? ' ' + kind : ''); clearTimeout(bannerT);
  bannerT = setTimeout(() => b.className = 'banner', 1700);
}
let callT = 0;
function call(text) { const c = $('#call'); c.textContent = text; c.classList.add('show'); clearTimeout(callT); callT = setTimeout(() => c.classList.remove('show'), 1100); }

function renderHUD() {
  const gs = C.gs; if (!gs) return;
  const n = Math.max(gs.innings, gs.inning);
  let h = '<thead><tr><th></th>';
  for (let i = 1; i <= n; i++) h += `<th>${i}</th>`;
  h += '<th>計</th></tr></thead><tbody>';
  for (const side of ['away', 'home']) {
    const bat = BB.batSide(gs) === side && !gs.over;
    h += `<tr class="${side}${bat ? ' bat' : ''}"><td class="tm"></td>`;
    for (let i = 1; i <= n; i++) {
      const v = gs.lines[side][i - 1];
      const cur = i === gs.inning && BB.batSide(gs) === side && !gs.over;
      h += `<td class="${cur ? 'now' : ''}">${v === undefined ? '' : v}</td>`;
    }
    h += `<td class="r">${gs.score[side]}</td></tr>`;
  }
  const t = $('#line'); t.innerHTML = h + '</tbody>';
  t.querySelector('tr.away td.tm').textContent = C.names.away; t.querySelector('tr.home td.tm').textContent = C.names.home;
  $('#inn').textContent = gs.over ? '試合終了' : `${gs.inning}回${gs.top ? '表' : '裏'}`;
  document.querySelectorAll('.dot.b').forEach((d, i) => d.classList.toggle('on', i < gs.b));
  document.querySelectorAll('.dot.s').forEach((d, i) => d.classList.toggle('on', i < gs.s));
  document.querySelectorAll('.dot.o').forEach((d, i) => d.classList.toggle('on', i < gs.outs));
  ['b1', 'b2', 'b3'].forEach((id, i) => $('#' + id).setAttribute('fill', gs.bases[i] ? '#ffb627' : '#e9e4d6'));
  const S = staminaNow(), bar = $('#staBar');
  bar.style.width = Math.max(0, S) + '%'; bar.style.backgroundColor = S > 50 ? '#3fbf5a' : S > 20 ? '#ffb627' : '#e4402e';
  $('#staNum').textContent = Math.floor(S); $('#staLbl').textContent = C.names[fieldSide()] + 'の投手';
}

function placeTeams() {
  const gs = C.gs; if (!gs) return;
  const bat = BB.batSide(gs), fld = bat === 'away' ? 'home' : 'away';
  for (const k in fielders) { setTeam(fielders[k], TEAM[fld]); const [x, z] = fielders[k].userData.base; fielders[k].position.set(x, k === 'p' ? 0.25 : 0, z); if (k !== 'c') fielders[k].rotation.set(0, Math.atan2(-x, -z), 0); runPose(fielders[k], 0, false); }
  applyAvatar(pitcher, C.looks[fld], TEAM[fld]);
  pitcher.rotation.set(0, 0, 0); pitcher.userData.handR.position.set(0.37, 0.8, 0.06); pitcher.userData.legL.position.y = 0.3;
  setTeam(batter, TEAM[bat]); setTeam(batRunner, TEAM[bat]); batRunner.visible = false;
  applyAvatar(batter, C.looks[bat], TEAM[bat]); applyAvatar(batRunner, C.looks[bat], TEAM[bat]);
  runners.forEach((r, i) => { setTeam(r, TEAM[bat]); r.visible = !!gs.bases[i]; const [x, z] = BASES[i + 1]; r.position.set(x + (i === 1 ? -1.2 : i === 0 ? -1.0 : 1.0), 0, z + 0.6); r.rotation.y = Math.atan2(-x, -z) + Math.PI; runPose(r, 0, false); });
  batter.visible = true; batPivot.visible = true; C.obsBunt = null;
  applyStance(role() === 'bat' ? ST : (NET.oppSt || { lh: false, x: -0.95, dz: 0 }));
  mitt.position.copy(MITT_HOME); ball.visible = false; ballShadow.visible = false;
}

function nextPitch() {
  clearContactFeedback();
  guess.visible = false;
  C.phase = 'ready'; C.pi = null; C.out = null; C.play = null; C.swingAt = null; C.impactAt = null; C.resolved = false;
  renderHUD(); placeTeams(); if (!C.gs.over) setBgm(BB.batSide(C.gs));
  show('#aimPad', false);
  cam.mode = role() === 'pitch' ? 'mound' : 'pitch'; zone.visible = true; aim.visible = false; cursor.visible = false; resetBallFx(); C.crossShown = false;
  show('#speed', false);
  if (C.gs.over) return gameOver();
  const r = role();
  show('#pitchUI', r === 'pitch'); show('#batUI', r === 'bat');
  if (r === 'pitch') {
    C.phase = 'aim'; aim.visible = true; status(''); syncPitchButtons(); syncBreakLock(); updateCost();
    show('#aimPad', true); requestAnimationFrame(placePad);
  } else if (r === 'bat') {
    if (C.boxNext) { C.boxNext = false; ST.lh = !ST.lh; ST.x = -ST.x; C.cur.x = -C.cur.x; applyStance(ST); }
    C.phase = 'wait'; ST.b = false; VIS.b = false; buntBar.visible = false; $('#buntBtn').setAttribute('aria-pressed', 'false'); sendStance();
    cursor.visible = true; setCursor(C.cur.x, C.cur.y); status('<span class="spin"></span>相手が球種とコースを選んでいます');
    if (NET.mode === 'cpu') cpuPitchSoon();
  } else { C.phase = 'wait'; status('観戦中'); }
  refreshPanel();
  if (C.pendingPi && C.pendingPi.n === C.gs.n + 1 && C.pendingPi.g === C.gs.gid && r !== 'pitch') { const p = C.pendingPi; C.pendingPi = null; startPitch(p, WINDUP); }
}

function selectPitch(k) { if (C.pitchType !== k) SFX.select(); C.pitchType = k; $('#speedIn').value = BB.PITCHES[k].kmh; syncPitchButtons(); syncBreakLock(); updateCost(); drawPad(); }
function syncBreakLock() { const lock = BB.noBreak(C.pitchType); document.querySelectorAll('#brkRow button').forEach(b => { b.disabled = lock; }); $('#brkWrap').classList.toggle('locked', lock); $('#brkWrap').title = lock ? 'ストレートは変化量を選べません' : ''; }
function readSpeed() {
  const v = Math.round(+$('#speedIn').value);
  return BB.clamp(Number.isFinite(v) && v > 0 ? v : BB.PITCHES[C.pitchType].kmh, BB.SPEED_MIN, BB.SPEED_MAX);
}
function updateCost() {
  const v = readSpeed(), c = BB.staminaCost(v, C.pitchType, C.brk), S = staminaNow(), el = $('#costTxt');
  if (c > S) { el.className = 'cost warn'; el.innerHTML = `消費 <b>${c.toFixed(1)}</b>　スタミナ不足：球が遅くなり、コースもずれます`; }
  else { el.className = 'cost'; el.innerHTML = `消費 <b>${c.toFixed(1)}</b>　残り <b>${Math.floor(S)}</b>（あと約${Math.floor(S / c)}球）`; }
}
C.brk = BB.BREAK_STD;
(function buildBreak() {
  const row = $('#brkRow');
  for (let i = BB.BREAK_MIN; i <= BB.BREAK_MAX; i++) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = i; b.dataset.v = i;
    b.addEventListener('click', () => setBreak(i)); row.appendChild(b);
  }
})();
function setBreak(v) { if (BB.noBreak(C.pitchType)) return; v = BB.clamp(v, BB.BREAK_MIN, BB.BREAK_MAX); if (v !== C.brk) SFX.select(); C.brk = v;
  document.querySelectorAll('#brkRow button').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === v))); updateCost(); drawPad(); }
setBreak(BB.BREAK_STD);
$('#speedIn').addEventListener('input', updateCost);
$('#speedIn').addEventListener('change', () => { $('#speedIn').value = readSpeed(); updateCost(); });
$('#speedIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); e.target.blur(); canvas.focus({ preventScroll: true }); } });
function syncPitchButtons() {
  document.querySelectorAll('.pt-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === C.pitchType)));
}
(function buildPitchButtons() {
  const row = $('#ptRow');
  BB.PITCH_KEYS.forEach((k, i) => {
    const p = BB.PITCHES[k], b = document.createElement('button');
    b.className = 'pt-btn'; b.dataset.k = k; b.title = p.name; b.innerHTML = `<kbd>${(i + 1) % 10}</kbd>${p.name}<small>${p.kmh}km/h</small>`;
    b.addEventListener('click', () => { selectPitch(k); });
    row.appendChild(b);
  });
  syncPitchButtons();
})();

function throwPitch() {
  if (C.phase !== 'aim') return; audio();
  const rq = readSpeed();
  const msg = { n: C.gs.n + 1, g: C.gs.gid, type: C.pitchType, tx: +C.aim.x.toFixed(3), ty: +C.aim.y.toFixed(3), rq, bl: BB.noBreak(C.pitchType) ? BB.BREAK_STD : C.brk, seed: seed() };
  NET.sendPi(msg);
  const pi = buildPitch(msg);
  aim.visible = false; show('#pitchUI', false); show('#aimPad', false); status('');
  startPitch(pi, WINDUP + (NET.mode === 'online' ? NET_LEAD : 0.05));
}

function startPitch(pi, windup) {
  C.bodyS = 0;
  C.pi = pi; C.t0 = now(); C.W = windup; C.dur = BB.pitchDuration(pi); C.phase = 'pitching';
  C.out = null; C.swingAt = null; C.impactAt = null; C.resolved = false; C.waitNote = false; C.swung = false; C.buntTry = false; C.obsBunt = null;
  $('#speed').dataset.n = ''; duckBgm(true);
  if (role() === 'bat') status(''); else if (role() === 'watch') status('観戦中');
  const sp = $('#speed'); sp.innerHTML = '<span class="pt">投球中</span><span class="velocity">…</span>'; show(sp, true);
}
const plateTime = () => C.t0 + C.W + C.dur;
const contactTime = () => C.t0 + C.W + C.dur * BB.contactS(ST.dz); // 立ち位置で、球をとらえる瞬間が変わる
const myOpt = () => ({ lh: ST.lh, sx: ST.x, sz: ST.dz });

function trySwing() {
  if (role() !== 'bat' || !batPivot.visible || C.phase === 'play' || C.phase === 'call' || C.phase === 'brawl' || ST.b) return;
  const t = now();
  if (C.swingAt !== null && t - C.swingAt < 0.3) return;   // 振っている最中は次を受け付けない
  audio(); SFX.whoosh();
  C.swingAt = t; C.impactAt = t + BB.SWING_LAG;
  C.swingX = C.cur.x; C.swingY = C.cur.y; C.swingZ = ST.dz; C.swingLh = ST.lh;
  // 打撃結果とは別に送る。素振り・空振り・同じ球での振り直しも相手に見せる。
  if (NET.mode === 'online') NET.sendBat({ g: C.gs.gid, n: C.gs.n + 1, q: ++NET.swingSeq, x: C.swingX, y: C.swingY, z: C.swingZ, lh: C.swingLh });
  if (C.phase !== 'pitching' || C.out) return;               // 素振り
  const dt = C.impactAt - contactTime();
  // 投げる前・球が来るずっと前・通り過ぎた後のスイングは素振り扱い（ストライクにしない）
  if (t < C.t0 + C.W || dt < -0.3 || dt > 0.15) { timingNote(dt, null); return; }
  const o = BB.judge(C.pi, C.cur, dt, C.gs, seed(), myOpt()); o.g = C.gs.gid; o.anim = NET.swingSeq;
  timingNote(dt, o);
  if (o.kind === 'whiff') { C.swung = true; return; }        // 空振りしても、球が通過するまで何度でも振れる
  C.out = o; NET.sendSw(o);
}
// スイングのタイミングと、ずれた方向を打者に見せる
function timingNote(dt, o) {
  const el = $('#timing'); clearTimeout(el._t);
  let main, cls, sub = '';
  if (!o) { main = dt < 0 ? '早すぎ（素振り）' : '遅すぎ（素振り）'; cls = 'far'; }
  else {
    const ms = Math.round(Math.abs(dt) * 1000);
    if (Math.abs(dt) <= 0.02) { main = 'ジャスト！'; cls = 'just'; }
    else if (dt < 0) { main = `早い ${ms}ms`; cls = 'early'; }
    else { main = `遅い ${ms}ms`; cls = 'late'; }
    if (o.kind === 'whiff' && Math.abs(dt) <= BB.TIMING_WIN) {
      const at = BB.pitchPos(C.pi, BB.contactS(ST.dz)), dy = at.y - C.cur.y, dx = at.x - C.cur.x;
      if (Math.abs(dy) / BB.MEET.ry >= Math.abs(dx) / BB.MEET.rx) sub = dy > 0 ? 'ボールの下を振った' : 'ボールの上を振った';
      else sub = (dx > 0) === (handOf(ST) > 0) ? 'ボールの手前（内側）を振った' : 'ボールの奥（外側）を振った';
    } else if (o.kind === 'whiff') sub = dt < 0 ? 'タイミングが早すぎ' : 'タイミングが遅すぎ';
  }
  el.innerHTML = `<b>${main}</b>${sub ? `<span>${sub}</span>` : ''}`; el.className = 'sticker timing show ' + cls;
  el._t = setTimeout(() => el.classList.remove('show'), 1600);
}
function takePitch() { // 球が通過：振っていれば空振り、振っていなければ見逃し
  const o = BB.judge(C.pi, C.cur, null, C.gs, seed(), myOpt()); o.g = C.gs.gid;
  o.anim = NET.swingSeq;
  if (C.swung) { o.kind = 'whiff'; o.swung = true; if (C.buntTry) o.bunt = true; }
  C.out = o; NET.sendSw(o);
}
function onBatMotion(m) {
  if (!C.gs || role() === 'bat' || m.g !== C.gs.gid || m.n !== C.gs.n + 1 ||
      !Number.isSafeInteger(m.q) || m.q <= 0 || !Number.isFinite(m.y) ||
      !['aim','wait','ready','pitching'].includes(C.phase) || C.out) return;
  const key = 'bat:' + m.g + ':' + m.n + ':' + m.q;
  if (NET.seen.has(key)) return;
  NET.seen.add(key); C.remoteSwing = m.g + ':' + m.n + ':' + m.q;
  C.swingAt = now(); C.swingY = BB.clamp(m.y, 0.1, 1.8);
  C.swingX = Number.isFinite(m.x) ? BB.clamp(m.x, -1, 1) : 0;
  C.swingZ = Number.isFinite(m.z) ? BB.clamp(m.z, -0.9, 0.6) : (NET.oppSt ? NET.oppSt.dz : 0);
  C.swingLh = typeof m.lh === 'boolean' ? m.lh : !!(NET.oppSt && NET.oppSt.lh);
}
function onSw(o) {
  if (!C.pi || o.n !== C.pi.n || o.g !== C.gs.gid || C.out) return;
  C.out = o;
  if (o.kind === 'hbp') { if(C.gs.brawlEnabled!==false)startBrawl(o);else resolve();return; }
  if (o.bunt) { C.impactAt = Math.max(now() + 0.02, C.t0 + C.W + C.dur * BB.contactS(o.sz)); C.obsBunt = { x: o.cx, y: o.cy, lh: o.lh, sz: o.sz }; }
  else if (o.swung) {
    C.impactAt = Math.max(now() + 0.02, C.t0 + C.W + C.dur * BB.contactS(o.sz));
    // すでに表示した空振りを、結果受信時にもう一度再生しない。旧版との対戦は従来通り。
    if (o.kind === 'inplay' || o.kind === 'foul' || C.remoteSwing !== o.g + ':' + o.n + ':' + o.anim) {
      C.swingAt = C.impactAt - BB.SWING_LAG; C.swingX = o.cx; C.swingY = o.cy; C.swingZ = o.sz || 0; C.swingLh = !!o.lh;
    }
  }
}
function fieldSide() { return C.gs.top ? 'home' : 'away'; }
function staminaNow() { return C.gs && C.gs.sta ? C.gs.sta[fieldSide()] : BB.STA_MAX; }
// 受け取った投球指示から、同じ計算で実際の球を作る（スタミナも自分の画面の値で計算）
function buildPitch(m) { const p = BB.makePitch(m.n, m.type, m.tx, m.ty, m.seed, m.rq, staminaNow(), m.bl); p.g = m.g; return p; }
function onPi(msg) {
  if (!C.gs || msg.g !== C.gs.gid || msg.n !== C.gs.n + 1 || role() === 'pitch') return;
  const pi = buildPitch(msg);
  if (C.phase === 'wait') startPitch(pi, WINDUP); else C.pendingPi = pi;
}

function resolve() {
  if (C.resolved) return; C.resolved = true;
  const o = C.out, newGs = BB.apply(C.gs, o, C.pi);
  const sp = $('#speed'); sp.innerHTML = `<span class="pt">${BB.PITCHES[C.pi.type].name}${C.pi.short ? '（失速）' : ''}</span><span class="velocity">${C.pi.kmh}<small>km/h</small></span>`;
  if (o.kind === 'foul' && o.bunt && C.gs.s >= 2) {
    // スリーバントは通常のファウル演出へ送らず、アウトを明示して次の打席へ進める。
    C.phase = 'call'; guess.visible = false; contactFeedback(o);
    banner('スリーバント失敗', 'out'); call('スリーバント失敗'); call2('k');
    finishPitch(newGs, 1.9);
  } else if (o.kind === 'inplay' || o.kind === 'foul') startPlay(o, newGs);
  else {
    C.phase = 'call'; SFX.mitt();
    const strikeOut = /三振/.test(newGs.msg), walk = /フォア/.test(newGs.msg);
    if (strikeOut || walk || /チェンジ|ゲームセット|点/.test(newGs.msg)) banner(newGs.msg.replace(/ .*/, ''), strikeOut ? 'out' : '');
    call(newGs.msg.split(' ')[0]);
    call2(strikeOut ? 'k' : walk ? 'walk' : o.kind==='hbp'?'deadball':o.kind); if (strikeOut) setTimeout(() => SFX.clap('short'), 700);
    finishPitch(newGs, strikeOut || walk ? 1.9 : 1.1);
  }
}
function finishPitch(newGs, wait) {
  setTimeout(pipStop, Math.max(0, wait * 1000 - 300));
  const tok = C.token;
  setTimeout(() => {
    if (tok !== C.token) return;
    C.gs = newGs; NET.sendGs(newGs);
    if (/チェンジ/.test(newGs.msg)) { banner('チェンジ'); SFX.clap('far'); }
    duckBgm(false);
    nextPitch();
  }, wait * 1000);
}

// 打球アニメーション
function startPlay(o, newGs) {
  showBallFx(null, false);
  C.phase = 'play'; zone.visible = false; cursor.visible = false; buntBar.visible = false; show('#batUI', false); status('');
  const at = BB.contactPoint(C.pi, o.sz);
  const fl = BB.flight(o.phi, o.la, o.ev, o.kind === 'foul' ? 1.6 : 7, at);
  const pts = fl.pts;
  const P = { o, newGs, pts, t0: now(), end: pts.length / 60, chase: null, throwTo: null, held: null, br: 0, shown: false };
  if (o.bunt) C.obsBunt = { x: o.cx, y: o.cy, lh: o.lh, sz: o.sz };
  // 接触フレームを一度表示し、その位置から音・衝撃・打球を同時に始める。
  updateSwing(C.impactAt); contactFeedback(o);
  if (o.kind === 'foul') { P.end = Math.min(P.end, 1.3); C.play = P; pipStart(); call('ファウル'); call2('foul'); finishPlay(P, 1.4); return; }
  const res = o.result;
  const nearest = (x, z, keys) => keys.reduce((b, k) => { const [fx, fz] = fielders[k].userData.base; const d = Math.hypot(fx - x, fz - z); return d < b.d ? { k, d } : b; }, { k: null, d: 1e9 }).k;
  const all = ['p', 'b1', 'b2', 'ss', 'b3', 'lf', 'cf', 'rf'];
  if (['fout', 'lout', 'sac'].includes(res)) {
    // 落下点の手前、高さ1.3mあたりで捕球
    let ci = pts.length - 1;
    for (let i = 20; i < pts.length; i++) if (pts[i][1] < 1.3 && pts[i][1] < pts[i - 1][1]) { ci = i; break; }
    const inside = q => Math.hypot(q[0], q[2]) < BB.fenceDist(Math.atan2(q[0], -q[2]) * 180 / Math.PI) - 2;
    while (ci > 20 && !inside(pts[ci])) ci--;   // 壁の向こうでは捕らない
    P.end = ci / 60; P.held = ci;
    const [x, , z] = pts[ci]; P.chase = { k: nearest(x, z, all), x, z, t: Math.max(0.15, P.end - 0.2) };
  } else if (res === 'gout' || res === 'dp' || res === 'bunt' || (o.bunt && res === 'single')) {
    let ci = pts.length - 1;
    const lim = o.bunt ? 1.05 : 1.6;
    for (let i = 0; i < pts.length; i++) if (Math.hypot(pts[i][0], pts[i][2]) > 27 || i / 60 > lim) { ci = i; break; }
    const [x, , z] = pts[ci]; P.end = ci / 60; P.held = ci;
    P.chase = { k: nearest(x, z, o.bunt ? ['p', 'b1', 'b3', 'c'] : ['b1', 'b2', 'ss', 'b3', 'p']), x, z, t: Math.max(0.15, P.end - 0.12) };
    if (res === 'single') P.br = 1; // バントヒット：送球は間に合わない
    else { // 一塁は一塁手（一塁手が捕ったら投手がベースカバー）、二塁は二塁手（二塁手が捕ったら遊撃手）
      const c1 = P.chase.k === 'b1' ? 'p' : 'b1', c2 = P.chase.k === 'b2' ? 'ss' : 'b2';
      P.throwTo = res === 'dp' ? [{ k: c2, to: [0, -38.8] }, { k: c1, to: [19.4, -19.4] }] : [{ k: c1, to: [19.4, -19.4] }];
    }
  } else {
    // ヒット：外野手がボールを追う
    const landI = Math.round(fl.land.t * 60);
    const stop = res === 'hr' ? Math.min(pts.length - 1, Math.round(4.6 * 60)) : Math.min(pts.length - 1, Math.max(landI + 50, 150));
    P.end = stop / 60; P.held = res === 'hr' ? null : stop;
    if (res !== 'hr') { const [x, , z] = pts[stop]; P.chase = { k: nearest(x, z, ['lf', 'cf', 'rf', 'ss', 'b2']), x, z, t: P.end + 0.35, pickup: true }; }
    P.br = { single: 1, double: 2, triple: 3, hr: 4 }[res];
  }
  if (!P.br) P.br = 0.6; // アウトでも一塁へ走る
  batRunner.visible = false; batRunner.position.set(VIS.x, 0, o.sz || 0); P.batterUntil = 0.12;
  C.play = P; cam.mode = 'field'; pipStart();
  const extra = P.throwTo ? 0.55 * P.throwTo.length : 0;
  finishPlay(P, P.end + extra + (res === 'hr' ? 2.4 : 1.3));
}
function finishPlay(P, wait) {
  const tok = C.token;
  setTimeout(() => {
    if (tok !== C.token || C.play !== P) return;
    const msg = P.newGs.msg, big = /ホームラン|サヨナラ/.test(msg), outy = /アウト|ゲッツー|犠牲|送りバント/.test(msg);
    if (P.o.kind === 'inplay') {
      banner(msg.split(' ')[0], big ? 'big' : outy ? 'out' : '');
      const r = P.o.result;
      const key = r === 'hr' ? 'hr' : outy ? 'out' : r === 'single' ? (P.o.la < 9 ? 'safe' : 'hit') : r;
      call2(key);
      if (r === 'hr') { SFX.cheer(true); SFX.clap('mid'); }
      else if (r === 'double' || r === 'triple') SFX.cheer(true);
      else if (!outy) { SFX.cheer(false); SFX.clap('short'); }
    }
    finishPitch(P.newGs, 1.3);
  }, wait * 1000);
}

function runnerPath(d) { // ホームからd塁分進んだ位置
  const seg = Math.min(Math.floor(d), 3), f = d - seg, a = BASES[seg], b = BASES[(seg + 1) % 4];
  if (d >= 4) return [0, 0];
  return [lerp(a[0], b[0], f), lerp(a[1], b[1], f)];
}

// =============== 毎フレーム更新 ===============
let last = now();
function frame() {
  requestAnimationFrame(frame);
  try { step(); renderAvatarPreview(); } catch (err) { console.error(err); }
}
function step() {
  const t = now(), dt = Math.min(0.05, t - last); last = t;
  updateStance(t);
  updateBrawl(t, dt);
  if (C.phase === 'pitching' || C.phase === 'call' || (C.phase === 'play' && C.play && C.play.o.kind === 'foul')) updatePitch(t);
  PITCHER_MODEL.update(t);
  if (C.phase === 'play') updatePlay(t);
  updateSwing(t);
  updateCamera(t, dt);
  STADIUM_MEDIA.update(t);
  updateContactFx(t);
  if (!C.brawl) updateStaminaLook(t, dt);
  updatePip(dt);
  for (let i = confetti.length - 1; i >= 0; i--) {
    const m = confetti[i], u = m.userData; u.v.y -= 9 * dt; m.position.addScaledVector(u.v, dt); m.rotation.x += dt * 6; m.rotation.y += dt * 4; u.life -= dt;
    if (u.life <= 0) { scene.remove(m); m.material.dispose(); confetti.splice(i, 1); }
  }
  renderer.render(scene, camera);
  renderPip();
}

function updatePitch(t) {
  if (!C.pi) return;
  const e = t - C.t0, u = Math.min(1, e / C.W);
  // 投手のフォーム
  const p = pitcher, ud = p.userData;
  if (e < C.W + 0.5) {
    const lift = Math.sin(Math.min(1, u / 0.55) * Math.PI / 2) * (u < 0.55 ? 1 : 1 - (u - 0.55) / 0.45);
    const lunge = u < 0.55 ? 0 : ease((u - 0.55) / 0.45);
    p.rotation.y = -0.9 * lift; p.rotation.x = 0.38 * lunge - 0.12 * lift; p.position.z = -18.44 + 0.55 * lunge;
    ud.legL.position.y = 0.3 + 0.28 * lift;
    const arm = u < 0.55 ? -0.3 * lift : lerp(-0.3, 1, lunge);
    ud.handR.position.set(0.37 - 0.15 * Math.max(0, arm), 0.8 + 0.55 * Math.sin(Math.max(0, Math.min(1, (arm + 0.3) / 1.3)) * Math.PI), 0.06 + arm * 0.5);
  }
  const s = (e - C.W) / C.dur;
  const r = role();
  // 10%から予測を表示。変化球に合わせて動き、打撃位置で実際の到達点へ収束する。
  if (r === 'bat' && C.phase === 'pitching' && !C.out && s >= BB.contactS(ST.dz) * 0.1 && s < BB.contactS(ST.dz) + 0.02) {
    const contact = BB.contactS(ST.dz), at = BB.predictContact(C.pi, s, ST.dz), k = 1 - BB.clamp(s / contact, 0, 1);
    guess.visible = true; guess.position.set(at.x, at.y, at.z);
    const rad = 0.075 + 0.07 * k; guess.scale.set(rad, rad, 1);
  } else guess.visible = false;
  if (e < C.W) { ball.visible = false; ballShadow.visible = false; return; }
  // 打つ側で体への接触を判定。高速球も前フレームからの区間全体で調べる。
  if (r === 'bat' && !C.out && C.phase === 'pitching') {
    const hbp = BB.hitBatter(C.pi, ST, C.bodyS || 0, s); C.bodyS = Math.max(C.bodyS || 0, s);
    if (hbp) {
      const o = { kind: 'hbp', n: C.pi.n, g: C.gs.gid, seed: C.pi.seed, sz: ST.dz, x: ST.x, lh: ST.lh, bodyS: hbp.s };
      C.out = o; NET.sendSw(o); if(C.gs.brawlEnabled!==false)startBrawl(o);else resolve();return;
    }
  }
  // 打者：バントは、球がバットの位置に来た瞬間に判定
  if (r === 'bat' && !C.out && ST.b && !C.buntTry && s >= BB.contactS(ST.dz)) {
    C.buntTry = true;
    const o = BB.judgeBunt(C.pi, C.cur, C.gs, seed(), myOpt()); o.g = C.gs.gid;
    if (o.kind === 'whiff') C.swung = true; else { C.out = o; C.impactAt = t; NET.sendSw(o); }
  }
  // 打者：通過したら見逃し確定
  if (r === 'bat' && !C.out && s > 1 + 0.16 / C.dur) takePitch();
  // ヒット・ファウル：インパクトで打球へ
  if (C.out && (C.out.kind === 'inplay' || C.out.kind === 'foul') && t >= C.impactAt && C.phase === 'pitching') { resolve(); return; }
  let sMax = 1 + 1.05 / 18.44;
  // 投手側：結果待ちならミットで止める
  if (r !== 'bat' && !C.out && s > 1) sMax = 1 + 1.05 / 18.44;
  if (C.out && (C.out.kind === 'inplay' || C.out.kind === 'foul') && !C.resolved) sMax = Math.min(sMax, 1);
  const ss = Math.min(s, sMax);
  const bp = BB.pitchPos(C.pi, ss);
  if (C.phase === 'pitching' || C.phase === 'call') {
    ball.visible = true; ball.position.set(bp.x, bp.y, bp.z); ball.rotation.x += 0.6;
    showBallFx(ball.position, s < 1.02 || C.phase === 'pitching');
    // 本塁を通過した瞬間、その位置に印を残す（ストライクゾーン内なら黄色・枠も光る）
    if (!C.crossShown && s >= 1) {
      C.crossShown = true; const pc = BB.pitchPos(C.pi, 1), inz = BB.inZone(pc.x, pc.y);
      crossMark.position.set(pc.x, pc.y, 0.01); crossMark.visible = true;
      crossMark.children.forEach(m => m.material.color.set(inz ? 0xffd23f : 0xffffff));
      if (zoneLine) zoneLine.color.set(inz ? 0xffd23f : 0xffffff);
    }
    ballShadow.visible = true; ballShadow.position.set(bp.x, 0.02, bp.z);
  }
  // 捕手のミット
  if (s > 0.86) { const k = Math.min(1, (s - 0.86) / 0.14); const at = BB.pitchPos(C.pi, 1); mitt.position.set(lerp(0, at.x, k), lerp(0.42, at.y, k), lerp(1.25, 1.05, k)); }
  if (s >= sMax && C.phase === 'pitching') {
    if (!C.mittSfx) { C.mittSfx = true; }
    if (C.out && C.out.kind !== 'inplay' && C.out.kind !== 'foul') { C.mittSfx = false; resolve(); }
    else if (!C.out && r !== 'bat' && e > C.W + C.dur + 2.5 && !C.waitNote) { C.waitNote = true; status('<span class="spin"></span>相手の応答を待っています'); }
  }
  // 球速表示（リリース後）
  const sp = $('#speed'); if (sp.dataset.n !== String(C.pi.n) && s > 0.15) { sp.dataset.n = C.pi.n; sp.innerHTML = `<span class="pt">${r !== 'bat' ? BB.PITCHES[C.pi.type].name : '球速'}</span><span class="velocity">${C.pi.kmh}<small>km/h</small></span>`; }
}

function updateSwing(t) {
  if (C.brawl) return;
  if (!batPivot.visible) return;
  const h = handOf(VIS), home = batHome(VIS);
  // バントの構え：バットを寝かせてカーソルの高さ・位置に合わせる
  const mine = role() === 'bat' && ST.b && C.phase !== 'play' && C.phase !== 'call';
  const ob = !mine && (C.obsBunt || (role() !== 'bat' && VIS.b && C.phase !== 'play') ? (C.obsBunt || { x: VIS.cx??0, y: VIS.cy??.85, sz: VIS.dz }) : null);
  if (mine || ob) {
    const cx = mine ? C.cur.x : ob.x, cy = mine ? C.cur.y : ob.y;
    batPivot.position.lerp(new THREE.Vector3(cx - h * BB.BUNT.back, cy, (ob && ob.sz != null ? ob.sz : VIS.dz) + 0.04), 0.35);
    batPivot.quaternion.slerp(h > 0 ? BUNT_Q.R : BUNT_Q.L, 0.35);
    batter.rotation.y = (VIS.lh ? -Math.PI / 2 : Math.PI / 2) - h * 0.55; // 投手の方へ体を向ける
    return;
  }
  if (C.swingAt === null) { // 構えに戻る
    batPivot.position.lerp(home, 0.25); batPivot.quaternion.slerp(keysOf(VIS)[0][1], 0.25);
    batter.rotation.y = VIS.lh ? -Math.PI / 2 : Math.PI / 2; return;
  }
  const e = t - C.swingAt;
  if (e < 0) return;
  const KEYS = keysOf({ lh: C.swingLh ?? VIS.lh });
  let q = KEYS[KEYS.length - 1][1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    const [ta, qa] = KEYS[i], [tb, qb] = KEYS[i + 1];
    if (e <= tb) { q = qa.clone().slerp(qb, (e - ta) / (tb - ta)); break; }
  }
  batPivot.quaternion.copy(q);
  const k = Math.min(1, e / BB.SWING_LAG) * (e < 0.2 ? 1 : Math.max(0, 1 - (e - 0.2) * 4));
  const impact = BB.swingPose(C.swingX ?? 0, C.swingY ?? 0.8, C.swingZ ?? VIS.dz, C.swingLh ?? VIS.lh);
  batPivot.position.set(lerp(home.x, impact.x, k), lerp(home.y, impact.y, k), lerp(home.z, impact.z, k));
  const tw = (e < 0.32 ? Math.min(1, e / 0.15) : Math.max(0, 1 - (e - 0.32) / 0.23)) * 0.7;
  batter.rotation.y = (VIS.lh ? -Math.PI / 2 : Math.PI / 2) - h * tw;
}

function updatePlay(t) {
  const P = C.play; if (!P) return;
  const e = Math.max(0, t - P.t0);
  if (P.batterUntil !== undefined && e >= P.batterUntil) {
    batter.visible = false; batPivot.visible = false; batRunner.visible = true; delete P.batterUntil;
  }
  let i = Math.min(P.pts.length - 1, Math.floor(e * 60));
  if (P.held !== null && i >= P.held) i = P.held;
  let bp = P.pts[i];
  // 守備：捕る野手は打球より少し先に着く
  if (P.chase) {
    const f = fielders[P.chase.k], [bx, bz] = f.userData.base;
    const k = Math.min(1, e / Math.max(0.15, P.chase.t)); const x = lerp(bx, P.chase.x, ease(k)), z = lerp(bz, P.chase.z, ease(k));
    if (k < 1) f.rotation.y = Math.atan2(P.chase.x - bx, P.chase.z - bz);
    else f.rotation.y = Math.atan2(-f.position.x, -f.position.z); // 捕ったら内野の方を向く
    f.position.x = x; f.position.z = z; runPose(f, e, k < 1);
  }
  // ベースカバー
  if (P.throwTo) for (const leg of P.throwTo) {
    if (P.chase && leg.k === P.chase.k) continue;
    const f = fielders[leg.k], [bx, bz] = f.userData.base, kk = Math.min(1, e / 1.0);
    f.position.x = lerp(bx, leg.to[0] - 0.5, kk); f.position.z = lerp(bz, leg.to[1] + 0.5, kk); runPose(f, e, kk < 1);
    if (kk >= 1) f.rotation.y = Math.atan2(P.chase ? P.chase.x - f.position.x : 0, P.chase ? P.chase.z - f.position.z : 0);
  }
  // 捕球後のボールは必ずグラブの中（こぼして見えないように）
  const glove = k => { const f = fielders[k]; f.updateMatrixWorld(true); return k==='p'&&PITCHER_MODEL.isActive()?PITCHER_MODEL.glovePosition(new THREE.Vector3()):f.userData.handL.getWorldPosition(new THREE.Vector3()); };
  const caught = P.chase && e >= (P.chase.pickup ? P.chase.t : P.end);
  if (caught && !P.gloved) { P.gloved = true; if (!P.chase.pickup) SFX.glove(); }
  if (caught) {
    if (!P.throwTo || P.chase.pickup) { const g = glove(P.chase.k); bp = [g.x, g.y, g.z]; }
    else {
      const legs = P.throwTo, te = e - P.end, seg = Math.min(legs.length - 1, Math.floor(te / 0.55)), f = Math.min(1, te / 0.55 - seg);
      if (te < 0.55 * legs.length) {
        if (!P.from) P.from = []; if (!P.from[seg]) P.from[seg] = glove(seg === 0 ? P.chase.k : legs[seg - 1].k); // 投げた瞬間のグラブ位置
        const a = P.from[seg], b = glove(legs[seg].k);
        bp = [lerp(a.x, b.x, f), lerp(a.y, b.y, f) + Math.sin(f * Math.PI) * 1.4, lerp(a.z, b.z, f)];
      } else { const g = glove(legs[legs.length - 1].k); bp = [g.x, g.y, g.z]; if (!P.thrown) { P.thrown = true; SFX.glove(); } }
    }
  }
  ball.visible = true; ball.position.set(bp[0], bp[1], bp[2]);
  ballShadow.visible = true; ballShadow.position.set(bp[0], 0.02, bp[2]);
  // 打者走者
  const d = Math.min(P.br, e * 8.5 / 27.43);
  const [rx, rz] = runnerPath(d); batRunner.position.set(rx, 0, rz);
  const [nx, nz] = runnerPath(Math.min(P.br, d + 0.05)); if (d < P.br) batRunner.rotation.y = Math.atan2(nx - rx, nz - rz);
  runPose(batRunner, e, d < P.br);
  // ホームランの紙吹雪
  if (P.o.result === 'hr' && !P.shown && Math.hypot(bp[0], bp[2]) > BB.fenceDist(P.o.phi) + 3) { P.shown = true; burst(new THREE.Vector3(bp[0], bp[1] + 4, bp[2])); }
}

// ---- 打球カメラ（打ったときだけ右上の別枠で、ボールを後ろから追う） ----
const pipCam = new THREE.PerspectiveCamera(40, 16 / 9, 0.1, 1200);
const PIP = { on: false, dir: new THREE.Vector3(0, 0, -1), look: new THREE.Vector3() };
function pipStart() {
  PIP.on = true; show('#pip', true);
  PIP.dir.set(0, 0, -1); pipCam.position.set(0, 2.2, 3.5); PIP.look.set(0, 1, -10);
}
function pipStop() { PIP.on = false; show('#pip', false); }
function updatePip(dt) {
  if (!PIP.on || !C.play) return;
  const P = C.play, b = ball.position, e = now() - P.t0;
  let i = Math.min(P.pts.length - 1, Math.max(0, Math.floor(e * 60)));
  if (P.held !== null) i = Math.min(i, P.held);
  const a = P.pts[i], c = P.pts[Math.min(P.pts.length - 1, i + 8)];
  const d = new THREE.Vector3(c[0] - a[0], 0, c[2] - a[2]);
  if (d.lengthSq() > 0.04) PIP.dir.lerp(d.normalize(), Math.min(1, dt * 4)).normalize();
  const want = new THREE.Vector3(b.x - PIP.dir.x * 9, Math.max(2.2, b.y + 2.6), b.z - PIP.dir.z * 9);
  pipCam.position.lerp(want, Math.min(1, dt * 5));
  PIP.look.lerp(b, Math.min(1, dt * 10)); pipCam.lookAt(PIP.look);
}
function renderPip() {
  if (!PIP.on) return;
  const r = $('#pip').getBoundingClientRect(); if (!r.width) return;
  const x = r.left + 3, y = innerHeight - r.bottom + 3, w = r.width - 6, h = r.height - 6;
  pipCam.aspect = w / h; pipCam.updateProjectionMatrix();
  const gv = gauge.sp.visible; gauge.sp.visible = false;
  renderer.setScissorTest(true); renderer.setScissor(x, y, w, h); renderer.setViewport(x, y, w, h);
  renderer.render(scene, pipCam);
  renderer.setScissorTest(false); renderer.setViewport(0, 0, innerWidth, innerHeight);
  gauge.sp.visible = gv;
}
const tmpV = new THREE.Vector3();
function updateCamera(t, dt) {
  if (C.brawl) { updateBrawlCamera(dt); return; }
  const k = 1 - Math.pow(0.002, dt);
  if (cam.mode === 'lobby') {
    const mobile=camera.aspect<1;
    const titleFov=mobile?50:42;if(camera.fov!==titleFov){camera.fov=titleFov;cam.fov=titleFov;camera.updateProjectionMatrix();}
    camera.position.set(mobile?1.5:2.6,1.7,mobile?4.8:4.2);cam.look.set(mobile?-.35:-.4,.9,0);camera.lookAt(cam.look);return;
  }
  const wantFov = cam.mode === 'pitch' ? PITCH_CAM.fov : cam.mode === 'mound' ? MOUND_CAM.fov : FIELD_FOV;
  if (Math.abs(cam.fov - wantFov) > 0.01) { cam.fov = lerp(cam.fov, wantFov, Math.min(1, k * 2.2)); camera.fov = cam.fov; camera.updateProjectionMatrix(); }
  if (cam.mode === 'pitch' || cam.mode === 'mound') {
    const V = cam.mode === 'pitch' ? PITCH_CAM : MOUND_CAM;
    camera.position.lerp(V.pos, Math.min(1, k * 2.2)); cam.look.lerp(V.look, Math.min(1, k * 2.2)); camera.lookAt(cam.look); return;
  }
  if (cam.mode === 'field') {
    const b = ball.position, far = Math.min(1, Math.hypot(b.x, b.z) / 90);
    tmpV.set(b.x * 0.35, lerp(9, 30, far), lerp(14, b.z * 0.2 + 32, far));
    camera.position.lerp(tmpV, k * 1.4);
    tmpV.set(b.x, Math.min(b.y, 12) * 0.6, b.z); cam.look.lerp(tmpV, k * 3); camera.lookAt(cam.look);
  }
}

// =============== 操作 ===============
const ray = new THREE.Raycaster(), ndc = new THREE.Vector2(), plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), hit = new THREE.Vector3();
function planePoint(ev) {
  const r = canvas.getBoundingClientRect(); ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera); return ray.ray.intersectPlane(plane, hit) ? hit : null;
}
const AIM = { x0: -0.62, x1: 0.62, y0: 0.18, y1: 1.5 };
const nearZone = p => p.x >= AIM.x0 - 0.12 && p.x <= AIM.x1 + 0.12 && p.y >= AIM.y0 - 0.12 && p.y <= AIM.y1 + 0.12;
function setAim(x, y) { C.aim.x = BB.clamp(x, AIM.x0, AIM.x1); C.aim.y = BB.clamp(y, AIM.y0, AIM.y1); aim.position.set(C.aim.x, C.aim.y, 0); drawPad(); }
// ---- コース枠（投手用）：マウンドから見た向き（左右反転）で描く ----
const padC = $('#padCanvas'), pctx = padC.getContext('2d');
function padXY(x, y, w, h) { return [(AIM.x1 - x) / (AIM.x1 - AIM.x0) * w, (AIM.y1 - y) / (AIM.y1 - AIM.y0) * h]; }
function padWorld(ev) { const r = padC.getBoundingClientRect(); const u = (ev.clientX - r.left) / r.width, v = (ev.clientY - r.top) / r.height;
  return { x: AIM.x1 - u * (AIM.x1 - AIM.x0), y: AIM.y1 - v * (AIM.y1 - AIM.y0) }; }
function drawPad() {
  if ($('#aimPad').hidden) return;
  const dpr = Math.min(devicePixelRatio || 1, 2), r = padC.getBoundingClientRect(); if (!r.width) return;
  const w = Math.round(r.width * dpr), h = Math.round(r.height * dpr); if (padC.width !== w || padC.height !== h) { padC.width = w; padC.height = h; }
  const g = pctx; g.clearRect(0, 0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(0, 0, w, h);
  // 右打者のシルエット（投手から見て右側）
  g.fillStyle = 'rgba(255,255,255,0.13)'; const [bx] = padXY(VIS.lh ? 0.75 : -0.75, 0, w, h);
  g.beginPath(); g.arc(bx + w * 0.02, h * 0.2, w * 0.07, 0, 7); g.fill(); g.fillRect(bx - w * 0.05, h * 0.28, w * 0.14, h * 0.62);
  // ストライクゾーン（3x3）
  const Z = BB.ZONE, [zx0, zy0] = padXY(Z.x1, Z.y1, w, h), [zx1, zy1] = padXY(Z.x0, Z.y0, w, h);
  g.fillStyle = 'rgba(255,255,255,0.1)'; g.fillRect(zx0, zy0, zx1 - zx0, zy1 - zy0);
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = dpr;
  for (let i = 1; i < 3; i++) { const x = zx0 + (zx1 - zx0) * i / 3, y = zy0 + (zy1 - zy0) * i / 3; g.beginPath(); g.moveTo(x, zy0); g.lineTo(x, zy1); g.moveTo(zx0, y); g.lineTo(zx1, y); g.stroke(); }
  g.strokeStyle = '#fffdf6'; g.lineWidth = 2.5 * dpr; g.strokeRect(zx0, zy0, zx1 - zx0, zy1 - zy0);
  // ホームベース
  const [hx] = padXY(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,.75)'; g.beginPath(); g.moveTo(hx - w * 0.12, h - 3 * dpr); g.lineTo(hx + w * 0.12, h - 3 * dpr); g.lineTo(hx, h - 10 * dpr); g.fill();
  // 変化の向き（狙った所へ、この向きから曲がってくる）
  const P = BB.PITCHES[C.pitchType], [ax, ay] = padXY(C.aim.x, C.aim.y, w, h);
  const bm = BB.breakScale(C.pitchType, C.brk);
  if (P && !P.knuckle && Math.hypot(P.bx, P.by) * bm > 0.04) {
    const [sx, sy] = padXY(C.aim.x - P.bx * bm, C.aim.y - P.by * bm, w, h);
    g.setLineDash([5 * dpr, 4 * dpr]); g.strokeStyle = 'rgba(255,182,39,.9)'; g.lineWidth = 2 * dpr;
    g.beginPath(); g.moveTo(sx, sy); g.quadraticCurveTo(sx, (sy + ay) / 2, ax, ay); g.stroke(); g.setLineDash([]);
  }
  // 狙い
  g.strokeStyle = '#ff5a3c'; g.lineWidth = 3 * dpr; g.beginPath(); g.arc(ax, ay, 9 * dpr, 0, 7); g.stroke();
  g.beginPath(); g.moveTo(ax - 15 * dpr, ay); g.lineTo(ax + 15 * dpr, ay); g.moveTo(ax, ay - 15 * dpr); g.lineTo(ax, ay + 15 * dpr); g.stroke();
  if (P && P.knuckle) { g.fillStyle = '#ffb627'; g.font = `${14 * dpr}px "Bahnschrift",sans-serif`; g.fillText('?', ax + 12 * dpr, ay - 10 * dpr); }
}
let padTouch = null;
padC.addEventListener('pointerdown', ev => {
  audio(); if (C.phase !== 'aim') return; ev.preventDefault();
  const p = padWorld(ev); setAim(p.x, p.y);
  if (ev.pointerType === 'mouse') { if (ev.button === 0) throwPitch(); }
  else { padTouch = { id: ev.pointerId, x: ev.clientX, y: ev.clientY }; padC.setPointerCapture(ev.pointerId); }
});
padC.addEventListener('pointermove', ev => { if (C.phase !== 'aim') return; if (ev.pointerType === 'mouse' || (padTouch && padTouch.id === ev.pointerId)) { const p = padWorld(ev); setAim(p.x, p.y); } });
padC.addEventListener('pointerup', ev => {
  if (!padTouch || padTouch.id !== ev.pointerId) return; padTouch = null;
  if (C.phase === 'aim') { const p = padWorld(ev); setAim(p.x, p.y); throwPitch(); } // 指を離した所へ投げる
});
padC.addEventListener('pointercancel', () => { padTouch = null; });
function placePad() {
  const pad = $('#aimPad'); if (pad.hidden) return;
  if (innerWidth <= 720) { const top = $('#panel').hidden ? innerHeight : $('#panel').getBoundingClientRect().top; pad.style.bottom = Math.max(8, innerHeight - top + 8) + 'px'; }
  else pad.style.bottom = '';
  drawPad();
}
addEventListener('resize', placePad);
function setCursor(x, y) {
  const bounds = BB.batCursorBounds(ST.x, ST.lh);
  C.cur.x = BB.clamp(x, bounds.min, bounds.max); C.cur.y = BB.clamp(y, 0.34, 1.3);
  cursor.position.set(C.cur.x, C.cur.y, ST.dz); buntBar.position.set(C.cur.x + handOf(ST) * 0.02, C.cur.y, ST.dz);
  if(ST.b)sendStance();
}
// バント中のバットの当たる範囲
const buntBar = overlay(new THREE.Mesh(new THREE.PlaneGeometry(BB.BUNT.back + BB.BUNT.tip, BB.BUNT.h * 2), new THREE.MeshBasicMaterial({ color: 0xffb627, opacity: 0.35, side: THREE.DoubleSide })), 6);
buntBar.visible = false; scene.add(buntBar);
function setBunt(on) {
  if (role() !== 'bat' || C.phase === 'play' || C.phase === 'call') on = false;
  if (C.buntTry && !on) return; // 当たり判定後は変えない
  ST.b = !!on; VIS.b = ST.b; buntBar.visible = ST.b; cursor.visible = role() === 'bat' && !ST.b && C.phase !== 'play';
  $('#buntBtn').setAttribute('aria-pressed', String(ST.b)); sendStance(); if (on) SFX.select();
}
function moveStance(dx, dz) {
  const h = handOf(ST);
  ST.x = h > 0 ? BB.clamp(ST.x + dx, -1.45, -0.55) : BB.clamp(ST.x + dx, 0.55, 1.45);
  ST.dz = BB.clamp(ST.dz + dz, -0.9, 0.6);
  if (role() === 'bat') applyStance(ST); setCursor(C.cur.x, C.cur.y); sendStance();
}
function switchBox() {
  if (C.phase === 'lobby' || C.phase === 'over') return;
  if (role() !== 'bat' || C.phase === 'play' || C.phase === 'call' || C.phase === 'pitching') { // 投球中などは次の球から
    C.boxNext = !C.boxNext; call(C.boxNext ? `次の球から${ST.lh ? '右' : '左'}打席` : '打席はそのまま'); SFX.select(); return;
  }
  ST.lh = !ST.lh; ST.x = -ST.x; applyStance(ST); setCursor(-C.cur.x, C.cur.y); sendStance(); SFX.select();
  call(ST.lh ? '左打席' : '右打席');
}
let stT = 0, stSentAt = -Infinity, stLast = '';
function sendStance() {
  if (NET.mode !== 'online' || role() !== 'bat' || stT) return;
  const flush = () => {
    stT = 0;
    if (NET.mode !== 'online' || role() !== 'bat' || !C.gs) return;
    const st = { g: C.gs.gid, lh: ST.lh, x: +ST.x.toFixed(3), dz: +ST.dz.toFixed(3), b: ST.b };
    if(ST.b){st.cx=+C.cur.x.toFixed(3);st.cy=+C.cur.y.toFixed(3);}
    const key = JSON.stringify(st);
    if (key === stLast) return;
    stLast = key; stSentAt = performance.now(); NET.sendSt(st);
  };
  const wait = 60 - (performance.now() - stSentAt);
  if (wait <= 0) flush(); else stT = setTimeout(flush, wait);
}
setAim(0, 0.8); setCursor(0, 0.8);
let drag = null;
canvas.addEventListener('contextmenu', ev => ev.preventDefault());
canvas.addEventListener('pointerdown', ev => {
  if (C.phase === 'brawl') { brawlPointer(ev); return; }
  audio(); canvas.focus({ preventScroll: true });
  if (ev.pointerType === 'mouse' && ev.button === 2) { ev.preventDefault(); setBunt(!ST.b); return; } // 右クリックでバントの構え

  if (ev.pointerType !== 'mouse') { drag = { id: ev.pointerId, x: ev.clientX, y: ev.clientY, ax: C.aim.x, ay: C.aim.y, cx: C.cur.x, cy: C.cur.y }; canvas.setPointerCapture(ev.pointerId); return; }
  if (ev.button !== 0) return;
  if (C.phase === 'aim') { const p = planePoint(ev); if (p && nearZone(p)) { setAim(p.x, p.y); throwPitch(); } }
  else if (role() === 'bat') trySwing();
});
canvas.addEventListener('pointermove', ev => {
  if (C.phase === 'brawl') return;
  if (ev.pointerType === 'mouse') {
    const p = planePoint(ev); if (!p) return;
    if (C.phase === 'aim') { if (nearZone(p)) setAim(p.x, p.y); } else if (role() === 'bat') setCursor(p.x, p.y);
  } else if (drag && drag.id === ev.pointerId) {
    const s = 1.6 / canvas.clientHeight * (C.phase === 'aim' ? 1.2 : 1);
    const dx = (ev.clientX - drag.x) * s, dy = -(ev.clientY - drag.y) * s;
    if (C.phase !== 'aim' && role() === 'bat') setCursor(drag.cx + dx, drag.cy + dy);
  }
});
const endDrag = ev => {
  if (!drag || drag.id !== ev.pointerId) return;
  // タッチ：ちょんと触れた所へ投げる（なぞった場合は狙いだけ動かす）
  if (ev.type === 'pointerup' && C.phase === 'aim' && Math.hypot(ev.clientX - drag.x, ev.clientY - drag.y) < 12) { const p = planePoint(ev); if (p && nearZone(p)) { setAim(p.x, p.y); throwPitch(); } }
  drag = null;
};
canvas.addEventListener('pointerup', endDrag); canvas.addEventListener('pointercancel', endDrag);
$('#swingBtn').addEventListener('pointerdown', e => { e.preventDefault(); audio(); trySwing(); });
$('#buntBtn').addEventListener('click', () => { audio(); setBunt(!ST.b); });
$('#boxBtn').addEventListener('click', () => { audio(); switchBox(); });
const keys = {};
addEventListener('keydown', ev => {
  if (ev.target.tagName === 'INPUT') return;
  if (C.phase === 'brawl') { brawlKey(ev, true); return; }
  if (C.phase === 'lobby') return;
  if (ev.code === 'Space') { ev.preventDefault(); audio(); if (C.phase === 'aim') throwPitch(); else trySwing(); }
  const n = parseInt(ev.key, 10); if (n >= 0 && n <= 9 && C.phase === 'aim') { const k = BB.PITCH_KEYS[n === 0 ? 9 : n - 1]; if (k) selectPitch(k); }
  if (ev.key.startsWith('Arrow')) { ev.preventDefault(); keys[ev.key] = true; }
  const kk = ev.key.toLowerCase();
  if ('wasd'.includes(kk) && kk.length === 1) keys[kk] = true;
  if (kk === 'x' && !ev.repeat) switchBox();
  if (kk === 'b' && !ev.repeat && role() === 'bat') setBunt(!ST.b);
  if (C.phase === 'aim' && (ev.key === 'q' || ev.key === 'Q')) setBreak(C.brk - 1);
  if (C.phase === 'aim' && (ev.key === 'e' || ev.key === 'E')) setBreak(C.brk + 1);
});
addEventListener('keyup', ev => { keys[ev.key] = false; keys[ev.key.toLowerCase()] = false; if (C.phase === 'brawl') brawlKey(ev, false); });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; resetBrawlInput(); });
setInterval(() => {
  if (C.phase === 'brawl') return;
  const dx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0), dy = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 1 : 0);
  if (!dx && !dy) return; const s = 0.022;
  if (C.phase === 'aim') setAim(C.aim.x + dx * s, C.aim.y + dy * s); else if (role() === 'bat') setCursor(C.cur.x + dx * s, C.cur.y + dy * s);
}, 16);

// =============== 対戦相手（CPU / オンライン） ===============
const NET = { mode: null, room: null, seen: new Set(), unsub: null, joinTimer: 0, opp: null, create: false, code: '', innings: 3, brawlEnabled:true, pitcherModel:'normal',
  sendPi() { }, sendSw() { }, sendGs() { }, sendSt() { }, sendBat() { }, sendFight() { }, sendFightInput() { }, swingSeq: 0, oppSt: null };

function cpuPitchSoon() {
  const tok = C.token, n = C.gs.n + 1;
  setTimeout(() => {
    if (tok !== C.token || !C.gs || C.gs.n + 1 !== n || C.phase !== 'wait') return;
    const r = Math.random, w = [0.3, 0.08, 0.08, 0.09, 0.08, 0.06, 0.08, 0.08, 0.08, 0.07]; let x = r(), k = 0; while (k < 9 && x > w[k]) x -= w[k++];
    const type = BB.PITCH_KEYS[k];
    const tx = (r() - 0.5) * 0.62, ty = 0.45 + r() * 0.75 + (['cv', 'sc', 'fk', 'sk'].includes(type) ? 0.25 : 0);
    const S = staminaNow(), base = BB.PITCHES[type].kmh;
    let rq = base + Math.round(BB.gauss(r) * 3);
    if (type === 'st' && S > 45 && r() < 0.12) rq = 170 + Math.round(r() * 90); // たまに剛速球
    onPi({ n, g: C.gs.gid, type, tx: +tx.toFixed(3), ty: +ty.toFixed(3), rq, bl: 2 + ((r() * 5) | 0), seed: seed() });
  }, 900 + Math.random() * 1000);
}
function cpuBat(pi) {
  const tok = C.token, gs = C.gs, at = BB.pitchPos(pi, 1), r = Math.random;
  const hbp = BB.hitBatter(pi, { x: -.95, dz: 0 });
  if (hbp) { setTimeout(() => { if (tok === C.token) onSw({ kind: 'hbp', n: pi.n, g: gs.gid, seed: pi.seed, sz: 0, x: -.95, lh: false, bodyS: hbp.s }); }, (C.W + BB.pitchDuration(pi) * hbp.s) * 1000); return; }
  const inz = BB.inZone(at.x, at.y), far = Math.abs(at.x) > 0.45 || at.y < 0.25 || at.y > 1.35;
  const swing = inz ? r() < 0.72 : far ? r() < 0.08 : r() < 0.32;
  const hard = ['cv', 'sc', 'fk', 'sk', 'kn'].includes(pi.type) ? 1.4 : 1;
  const dur = BB.pitchDuration(pi), fast = Math.pow(Math.max(1, 0.45 / dur), 0.75) * Math.sqrt(Math.max(1, dur / 0.7)); // 速すぎ・遅すぎはCPUも合わせにくい
  const dtv = swing ? BB.gauss(r) * 0.05 * hard * fast : null;
  // CPUは球種を知らないので、変化球はストレートの軌道に引っ張られる
  const guess = BB.pitchPos({ ...pi, type: 'st' }, 1);
  const cx = lerp(at.x, guess.x, 0.25 * hard) + BB.gauss(r) * 0.06, cy = lerp(at.y, guess.y, 0.3 * hard) + BB.gauss(r) * 0.04;
  const o = BB.judge(pi, { x: cx, y: cy }, dtv, gs, seed()); o.g = gs.gid;
  const delay = (C.W + C.dur + (swing ? 0 : 0.18)) * 1000 - 30;
  setTimeout(() => { if (tok === C.token) onSw(o); }, delay);
}

function startCPU() {
  leaveRoom(); C.token++;
  NET.mode = 'cpu'; C.seat = 'away'; C.names = { away: nickname(), home: 'CPU' };
  C.looks = { away: chosenAvatar, home: null };
  NET.sendPi = msg => cpuBat(buildPitch(msg)); NET.sendSw = () => { }; NET.sendGs = () => { }; NET.sendSt = () => { }; NET.oppSt = null;
  C.gs = BB.newGame(NET.innings, 'cpu' + seed(), NET.brawlEnabled, NET.pitcherModel); enterGame();
}
function enterGame() {
  clearBrawl();
  C.token++;
  show('#lobby', false); show('#hud', true); show('#menuBtn', true); document.body.appendChild($('#soundBar'));
  batter.userData.handL.visible=batter.userData.handR.visible=false;
  catcher.visible=true;
  banner('プレイボール!', 'big'); call2('play'); nextPitch(); canvas.focus({ preventScroll: true });
}
function toLobby(card = '#home') {
  clearBrawl();
  clearContactFeedback();
  resetBallFx();
  pipStop();
  setBgm('lobby'); $('#lobbySound').appendChild($('#soundBar'));closeTitlePanels(false);
  clearTimeout(bannerT);$('#banner').className='banner';clearTimeout(callT);$('#call').classList.remove('show');$('#timing').classList.remove('show');gauge.sp.visible=false;
  C.token++; C.phase = 'lobby'; C.gs = null; C.pi = null; C.play = null; cam.mode = 'lobby';
  ['#hud', '#panel', '#speed', '#menuBtn', '#aimPad'].forEach(s => show(s, false));
  zone.visible = cursor.visible = aim.visible = guess.visible = ball.visible = ballShadow.visible = false;
  setTitlePlayer();
  show('#lobby', true); ['#home', '#wait', '#final'].forEach(s => show(s, s === card));
}
function gameOver() {
  C.phase = 'over'; show('#panel', false); setBgm(null); setTimeout(() => { call2('set'); SFX.clap('long'); }, 900);
  const gs = C.gs, a = gs.score.away, h = gs.score.home;
  const fight = gs.brawlResult;
  const w = fight ? (fight.winner ? `${C.names[fight.winner]} の勝ち！（乱闘決着）` : '乱闘は引き分け') : a === h ? '引き分け' : `${a > h ? C.names.away : C.names.home} の勝ち!`;
  const tok = C.token;
  setTimeout(() => {
    if (tok !== C.token) return;
    show('#lobby', true); ['#home', '#wait'].forEach(s => show(s, false)); show('#final', true);
    $('#finWho').textContent = w; $('#finScore').textContent = fight ? `体力 ${fight.hp.away} - ${fight.hp.home}` : `${a} - ${h}`;
    $('#againBtn').hidden = C.seat === 'spec';
    $('#againBtn').textContent = NET.mode === 'cpu' ? 'キャラを選んでもう一試合' : 'キャラを選んでロビーへ';
    $('#finNote').textContent = fight ? `乱闘で試合終了。野球スコア ${a} - ${h}` : NET.mode === 'cpu' ? '' : '次の試合は、キャラを選び直して新しい部屋で遊べます';
  }, 2200);
}
$('#againBtn').addEventListener('click', () => {
  if (NET.mode === 'cpu') return openCharacterStudio(() => startCPU());
  leaveRoom(); toLobby(); openCharacterStudio();
});
$('#backBtn').addEventListener('click', () => { leaveRoom(); toLobby(); });
$('#menuBtn').addEventListener('click', () => { leaveRoom(); toLobby(); });
// ---- 音量スライダー（BGM・声・効果音 それぞれ 0〜100） ----
try { const v = JSON.parse(localStorage.getItem('shb-vol-v2') || 'null'); if (v) ['bgm', 'voice', 'sfx'].forEach(k => { if (Number.isFinite(v[k])) SND.vol[k] = BB.clamp(v[k], 0, 100); }); } catch (e) { }
const VOL_IDS = { bgm: 'volBgm', voice: 'volVoice', sfx: 'volSfx' };
let volT = 0;
for (const k in VOL_IDS) {
  const inp = $('#' + VOL_IDS[k]), out = $('#' + VOL_IDS[k] + 'O');
  inp.value = SND.vol[k]; out.textContent = SND.vol[k];
  inp.addEventListener('input', () => {
    audio(); SND.vol[k] = +inp.value; out.textContent = inp.value;
    if (k === 'bgm') bgmTick();
    if (k === 'sfx' && SND.sfx) SND.sfx.gain.value = SND.vol.sfx / 80;
    if (k === 'voice' && SND.voice) SND.voice.gain.value = SND.vol.voice / 90;
    try { localStorage.setItem('shb-vol-v2', JSON.stringify(SND.vol)); } catch (e) { }
    clearTimeout(volT); volT = setTimeout(() => { if (k === 'voice') call2('strike'); if (k === 'sfx') SFX.hit(160); }, 250); // 試し聞き
  });
}
$('#soundToggle').addEventListener('click', () => { const bar = $('#soundBar'), open = !bar.classList.contains('open'); bar.classList.toggle('open', open); $('#soundToggle').setAttribute('aria-expanded', String(open)); });

// ---- オンライン（room capability の presence で同期） ----
// ---- 自前の中継サーバー（Render）につなぐ口。claude.ai の room と同じ使い方にそろえてある ----
function makeWsLobby(url) {
  const L = { ws: null, id: null, room: null, mine: {}, map: new Map(), peers: [], subs: new Set(), status: 'idle', wait: null, statusFns: new Set(), hb: 0, retry: 0, connectTimer: 0, ackTimer: 0, joinTimer: 0 };
  const setStatus = st => { L.status = st; L.statusFns.forEach(f => { try { f(st); } catch (e) { } }); };
  const send = o => { if (L.ws && L.ws.readyState === 1) L.ws.send(JSON.stringify(o)); };
  const rebuild = () => {
    L.peers = Object.freeze([...L.map.entries()].map(([id, v]) => v.peer && v.peer.presence === v.p ? v.peer
      : (v.peer = Object.freeze({ peer: id, by: null, isMe: id === L.id, sameTab: id === L.id, kind: 'viewer', guest: false, presence: v.p, updatedAt: Date.now() }))));
    const ch = { peers: L.peers, joined: [], left: [], updated: [] };
    L.subs.forEach(f => { try { f(ch); } catch (e) { console.error(e); } });
  };
  const settle = error => {
    clearTimeout(L.joinTimer); L.joinTimer = 0;
    const w = L.wait; L.wait = null;
    if (w) { if (error) w.ng(error); else w.ok(); }
  };
  function reconnect(ws) {
    if (L.ws !== ws) return;
    L.ws = null; clearTimeout(L.connectTimer); clearTimeout(L.ackTimer);
    try { ws.close(); } catch (e) { }
    setStatus('closed');
    clearTimeout(L.retry); if (L.room) L.retry = setTimeout(open, 1500);
  }
  function sendJoin() {
    send({ t: 'join', room: L.room, p: L.mine });
    clearTimeout(L.ackTimer);
    const ws = L.ws; L.ackTimer = setTimeout(() => reconnect(ws), 12000);
  }
  function open() {
    if (L.ws && L.ws.readyState <= 1) return;
    setStatus('connecting');
    let ws; try { ws = new WebSocket(url); } catch (e) { setStatus('error'); if (L.room) L.retry = setTimeout(open, 1500); return; }
    L.ws = ws;
    // Render起動中などにCONNECTINGで固まったソケットを作り直す。
    L.connectTimer = setTimeout(() => reconnect(ws), 20000);
    ws.onopen = () => { if (L.ws !== ws) return; clearTimeout(L.connectTimer); setStatus('open'); if (L.room) sendJoin(); };
    ws.onmessage = ev => {
      if (L.ws !== ws) return;
      let m; try { m = JSON.parse(ev.data); } catch (e) { return; }
      if (m.t === 'hello') L.id = m.id;
      else if (m.t === 'joined') { L.id = m.id; clearTimeout(L.ackTimer); settle(); }
      else if (m.t === 'peers') { const next = new Map(); for (const x of m.list || []) { const old = L.map.get(x.id); next.set(x.id, { p: Object.freeze(x.p || {}), peer: old && old.peer }); } L.map = next; rebuild(); }
      else if (m.t === 'up') { const v = L.map.get(m.id); if (!v) return; const p = { ...v.p }; for (const k in m.patch) { if (m.patch[k] === null) delete p[k]; else p[k] = m.patch[k]; } v.p = Object.freeze(p); rebuild(); }
      else if (m.t === 'error' && L.wait) { clearTimeout(L.ackTimer); L.room = null; clearInterval(L.hb); settle(new Error(m.code)); }
    };
    ws.onclose = () => reconnect(ws); // 試合中に切れたら同じ状態で入り直す
    ws.onerror = () => { };
  }
  const room = {
    presence(patch) { for (const k in patch) { if (patch[k] === null) delete L.mine[k]; else L.mine[k] = patch[k]; } send({ t: 'p', patch }); return Promise.resolve(); },
    onPeers(fn) { L.subs.add(fn); setTimeout(() => fn({ peers: L.peers, joined: [], left: [], updated: [] }), 0); return () => L.subs.delete(fn); },
    peers() { return L.peers; },
    connected() { return L.status === 'open'; },
    leave() { L.room = null; L.mine = {}; L.map = new Map(); L.peers = []; clearInterval(L.hb); clearTimeout(L.retry); clearTimeout(L.ackTimer); settle(new Error('cancelled')); send({ t: 'leave' }); return Promise.resolve(); },
  };
  return {
    remote: true,
    cancelJoin() { room.leave(); },
    warm() { // ロビーを開いた時点で、休止中のサーバーを起こしておく
      try { fetch(url.replace(/^ws/, 'http'), { cache: 'no-store' }).catch(() => { }); } catch (e) { }
      open();
    },
    onStatus(fn) { L.statusFns.add(fn); fn(L.status); },
    join(name) {
      settle(new Error('cancelled')); clearTimeout(L.retry);
      L.room = name; L.mine = {}; L.map = new Map(); L.peers = [];
      clearInterval(L.hb); L.hb = setInterval(() => send({ t: 'hb' }), 30000);
      return new Promise((ok, ng) => {
        L.wait = { ok: () => ok(room), ng };
        if (L.ws && L.ws.readyState === 1) sendJoin(); else open();
        L.joinTimer = setTimeout(() => {
          if (L.wait && L.wait.ng === ng) { L.room = null; clearInterval(L.hb); clearTimeout(L.retry); clearTimeout(L.ackTimer); settle(new Error('timeout')); }
        }, 90000);
      });
    },
  };
}
const SERVER_URL = (() => { try { return new URLSearchParams(location.search).get('server') || window.MARUTTO_SERVER || ''; } catch (e) { return window.MARUTTO_SERVER || ''; } })();
let ROOM = null;
const roomReady = (async () => {
  try { if (window.claude && typeof window.claude.use === 'function') { const r = await window.claude.use('room'); if (r) return r; } } catch (e) { }
  return SERVER_URL ? makeWsLobby(SERVER_URL) : null;
})();
roomReady.then(r => {
  ROOM = r;
  const note = $('#onlineNote');
  if (r && r.remote) {
    $('#waitHow').textContent = '「リンクをコピー」で相手に送ってください。相手はリンクを開くと、このコードが入った状態で「部屋に入る」を押すだけで対戦できます（アカウント不要）。';
    show('#linkBtn', true);
    r.onStatus(st => {
      if (st === 'open') { note.textContent = 'オンライン対戦OK。部屋を作るか、相手から聞いたコードで入ってください'; note.className = 'note'; }
      else if (st === 'connecting') { note.innerHTML = '<span class="spin"></span>対戦サーバーを起こしています（休止中だと最大1分ほど）'; note.className = 'note'; }
      else if (st === 'closed' || st === 'error') { note.textContent = '対戦サーバーにつながりません。少し待ってから開き直してください。CPU練習はいつでもできます'; note.className = 'note warn'; }
      if (NET.mode === 'online' && !NET.room) {
        if (st === 'closed' || st === 'error') $('#waitStatus').innerHTML = '<span class="spin"></span>接続を再試行しています。最大90秒で結果を表示します';
        else if (st === 'connecting') $('#waitStatus').innerHTML = '<span class="spin"></span>対戦サーバーに接続しています（最大90秒）。同じ部屋コードで再試行します';
        else if (st === 'open') $('#waitStatus').innerHTML = '<span class="spin"></span>サーバーに接続しました。部屋への入室を確認しています';
      }
    });
    r.warm();
  } else if (r) { note.textContent = 'オンライン対戦OK。部屋を作るか、相手から聞いたコードで入ってください'; note.className = 'note'; }
  else { note.textContent = 'オンライン対戦は、claude.aiにサインインしてこのページを開いたときに使えます。CPU練習はいつでもできます'; note.className = 'note warn'; $('#createBtn').disabled = true; $('#joinBtn').disabled = true; }
});
// 共有リンク（…#ABCD）から開いたら、コードを入れておく
try { const h = (location.hash || '').slice(1).toUpperCase(); if (/^[A-Z0-9]{4}$/.test(h)) $('#codeIn').value = h; } catch (e) { }

function nickname() { return ($('#nick').value || '').trim().slice(0, 10) || 'プレイヤー'; }
const CODE_CH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode = () => Array.from({ length: 4 }, () => CODE_CH[(Math.random() * CODE_CH.length) | 0]).join('');

async function goOnline(code, create) {
  if (!ROOM) return;
  leaveRoom(); const token = ++C.token;
  NET.mode = 'online'; NET.create = create; NET.code = code; NET.seen = new Set(); NET.swingSeq = 0; NET.joinFinal = false; C.seat = null; C.gs = null; C.pendingPi = null;
  show('#home', false); show('#wait', true); $('#waitCode').textContent = code; $('#copyNote').textContent = '';
  show('#retryJoinBtn', false);
  $('#waitStatus').innerHTML = ROOM.remote ? '<span class="spin"></span>対戦サーバーに接続しています（最大90秒）。同じ部屋コードで再試行します' : '<span class="spin"></span>接続しています';
  let joined;
  try { joined = await ROOM.join('marutto-' + code.toLowerCase()); }
  catch (e) {
    if (token !== C.token || NET.mode !== 'online') return;
    $('#waitStatus').textContent = e && e.message === 'full' ? 'この部屋は満員です' : 'サーバーに接続できませんでした。「同じコードで再接続」から試し直せます';
    show('#retryJoinBtn', true); NET.mode = null; return;
  }
  if (token !== C.token || NET.mode !== 'online') return;
  NET.room = joined;
  const me = { v: 1, nick: nickname(), avatar: chosenAvatar ? AVATAR.clean(chosenAvatar) : null, seat: null, pi: null, sw: null, gs: null, sa: null, bf: null, fi: null };
  if (create) { me.seat = 'home'; me.inn = NET.innings; me.br=NET.brawlEnabled;me.pm=NET.pitcherModel;C.seat = 'home'; }
  NET.room.presence(me).catch(() => { });
  NET.sendPi = pi => NET.room && NET.room.presence({ pi }).catch(() => { });
  NET.sendSw = sw => NET.room && NET.room.presence({ sw }).catch(() => { });
  NET.sendGs = gs => NET.room && NET.room.presence({ gs }).catch(() => { });
  NET.sendSt = st => NET.room && NET.room.presence({ st }).catch(() => { });
  NET.sendBat = sa => NET.room && NET.room.presence({ sa }).catch(() => { });
  NET.sendFight = bf => NET.room && NET.room.presence({ bf }).catch(() => { });
  NET.sendFightInput = fi => NET.room && NET.room.presence({ fi }).catch(() => { });
  NET.unsub = NET.room.onPeers(ch => handlePeers(ch.peers));
  $('#waitStatus').innerHTML = create ? '<span class="spin"></span>相手を待っています' : '<span class="spin"></span>部屋を探しています';
  if (!create) NET.joinTimer = setTimeout(() => { assignSeat(true); }, 1600);
}
function leaveRoom() {
  clearTimeout(stT); stT = 0; stSentAt = -Infinity; stLast = ''; stanceTarget = null; stanceFrameAt = null;
  clearTimeout(NET.joinTimer);
  if (NET.unsub) { try { NET.unsub(); } catch (e) { } NET.unsub = null; }
  if (NET.room) { NET.room.leave().catch(() => { }); NET.room = null; }
  else if (NET.mode === 'online' && ROOM && ROOM.cancelJoin) ROOM.cancelJoin();
  NET.mode = null; NET.opp = null;
}
function others() { return NET.room ? NET.room.peers().filter(p => !p.sameTab && p.kind === 'viewer') : []; }
function assignSeat(final) {
  if (C.seat || !NET.room) return;
  if (final) NET.joinFinal = true;
  const ps = others(), hasH = ps.some(p => p.presence && p.presence.seat === 'home'), hasA = ps.some(p => p.presence && p.presence.seat === 'away');
  let seat = null;
  if (hasH && !hasA) seat = 'away'; else if (!hasH && hasA) seat = 'home'; else if (hasH && hasA) seat = 'spec';
  else if (NET.joinFinal) {
    // まだ誰もホストでない：両方が「部屋に入る」を押した場合も、先に入った方（IDの小さい方）がホストになる
    const me = NET.room.peers().find(p => p.sameTab), waiting = ps.filter(p => !(p.presence && p.presence.seat));
    if (!waiting.length || (me && waiting.every(p => String(me.peer) < String(p.peer)))) seat = 'home';
  }
  if (!seat) { if (final) $('#waitStatus').innerHTML = '<span class="spin"></span>相手を待っています（同じコードで「部屋に入る」を押してもらえばOK）'; return; }
  C.seat = seat;
  const patch = { seat }; if (seat === 'home') { patch.inn = NET.innings;patch.br=NET.brawlEnabled;patch.pm=NET.pitcherModel; $('#waitStatus').innerHTML = '<span class="spin"></span>相手を待っています'; }
  NET.room.presence(patch).catch(() => { });
  if (seat === 'spec') $('#waitStatus').innerHTML = '<span class="spin"></span>観戦モードで入りました';
  if (seat === 'home') handlePeers(); // 相手がもう来ていれば、すぐ試合を始める
}
function maybeAdopt(g, fromSeat) {
  if (!g || C.phase === 'pitching' || C.phase === 'play' || C.phase === 'call' || C.phase === 'brawl') return;
  const fresh = !C.gs || (g.gid !== C.gs.gid && fromSeat === 'home' && C.seat !== 'home') || (g.gid === C.gs.gid && g.n > C.gs.n);
  if (!fresh) return;
  const first = !C.gs || C.phase === 'lobby' || C.phase === 'over';
  C.gs = clone(g); NET.innings = g.innings;
  if(C.gs.pitcherModel==='takagi')C.gs.brawlEnabled=false;
  if (first) enterGame(); else nextPitch();
}
function handlePeers(peers) {
  if (NET.mode !== 'online') return;
  if (!C.seat) assignSeat(false);
  const ps = others();
  const home = ps.find(p => p.presence && p.presence.seat === 'home'), away = ps.find(p => p.presence && p.presence.seat === 'away');
  const opp = C.seat === 'home' ? away : C.seat === 'away' ? home : null;
  NET.opp = opp;
  const hn = C.seat === 'home' ? nickname() : home && home.presence.nick, an = C.seat === 'away' ? nickname() : away && away.presence.nick;
  C.names = { away: String(an || 'ビジター').slice(0, 10), home: String(hn || 'ホーム').slice(0, 10) };
  C.looks = { home: C.seat === 'home' ? chosenAvatar : home && home.presence.avatar ? AVATAR.clean(home.presence.avatar) : null,
    away: C.seat === 'away' ? chosenAvatar : away && away.presence.avatar ? AVATAR.clean(away.presence.avatar) : null };
  if (home && home.presence.inn && C.seat !== 'home') NET.innings = home.presence.inn | 0 || 3;
  // 試合開始：ホームが状態を作る
  if (C.seat === 'home' && opp && !C.gs && !(opp.presence && opp.presence.gs)) {
    C.gs = BB.newGame(NET.innings, 'g' + seed(), NET.brawlEnabled, NET.pitcherModel); NET.sendGs(C.gs); enterGame();
  }
  if (opp && opp.presence) maybeAdopt(opp.presence.gs, opp.presence.seat);
  // 相手（打者）の構え・打席・バントを表示に反映
  const batP = C.gs ? (BB.batSide(C.gs) === 'home' ? home : away) : null;
  if (batP && batP.presence && batP.presence.st && typeof batP.presence.st === 'object' &&
      (!batP.presence.st.g || batP.presence.st.g === C.gs.gid) && role() !== 'bat') {
    const st = batP.presence.st; NET.oppSt = { lh: !!st.lh, x: +st.x || -0.95, dz: +st.dz || 0, b: !!st.b, cx:st.cx,cy:st.cy };
    if (C.phase !== 'play' && C.phase !== 'call' && C.phase !== 'brawl' && !C.brawl) { applyStance(NET.oppSt, true); drawPad(); }
  }
  if (C.seat === 'spec' && home && home.presence) maybeAdopt(home.presence.gs, 'home');
  // 現在の打者からのモーションだけ採用し、結果より先に反映する。
  if (batP && batP.presence && batP.presence.sa && typeof batP.presence.sa === 'object') onBatMotion(batP.presence.sa);
  // 投球・打撃結果
  for (const p of [home, away]) {
    if (!p || !p.presence || p.presence.seat === C.seat) continue;
    const pi = p.presence.pi, sw = p.presence.sw;
    if (pi && typeof pi === 'object' && BB.PITCHES[pi.type]) { const key = 'p' + pi.g + ':' + pi.n; if (!NET.seen.has(key)) { NET.seen.add(key); onPi(sanitizePi(pi)); } }
    if (sw && typeof sw === 'object') { const key = 's' + sw.g + ':' + sw.n; if (!NET.seen.has(key)) { NET.seen.add(key); onSw(sw); } }
  }
  if (home && home.presence && home.presence.bf && C.seat !== 'home') onFightState(home.presence.bf);
  if (away && away.presence && away.presence.fi && C.seat === 'home') onFightInput('away', away.presence.fi);
  if (C.gs && C.phase !== 'lobby' && C.seat !== 'spec') {
    if (!opp && !NET.lostShown) { NET.lostShown = true; status('<span class="spin"></span>相手の接続が切れました。戻ってくるのを待っています'); }
    if (opp && NET.lostShown) { NET.lostShown = false; if (C.phase === 'aim') status(''); }
  }
}
function sanitizePi(pi) {
  const n = v => Number.isFinite(+v) ? +v : 0;
  return { n: n(pi.n), g: String(pi.g), type: pi.type, tx: BB.clamp(n(pi.tx), -0.62, 0.62), ty: BB.clamp(n(pi.ty), 0.18, 1.5),
    rq: BB.clamp(n(pi.rq), BB.SPEED_MIN, BB.SPEED_MAX), bl: BB.clamp(Math.round(n(pi.bl) || 4), 1, 7), seed: n(pi.seed) >>> 0 };
}

/*BRAWL_VIEW*/

// ---- ロビーのボタン ----
document.querySelectorAll('#innSeg button').forEach(b => b.addEventListener('click', () => {
  document.querySelectorAll('#innSeg button').forEach(x => x.setAttribute('aria-pressed', String(x === b))); NET.innings = +b.dataset.v;
}));
document.querySelectorAll('#brawlSeg button').forEach(b=>b.addEventListener('click',()=>{
  if(NET.pitcherModel==='takagi')return;
  NET.brawlEnabled=b.dataset.v==='on';document.querySelectorAll('#brawlSeg button').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
}));
$('#createBtn').addEventListener('click', () => { audio(); SFX.select(); openCharacterStudio(() => goOnline(newCode(), true)); });
$('#joinBtn').addEventListener('click', () => {
  audio(); const c = $('#codeIn').value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (c.length !== 4) { $('#codeIn').focus(); $('#setupStatus').textContent = '4文字の部屋コードを入力してください';show('#setupStatus',true);return; }
  show('#setupStatus',false);
  openCharacterStudio(() => goOnline(c, false));
});
$('#codeIn').addEventListener('keydown', e => { if (e.key === 'Enter') $('#joinBtn').click(); });
$('#cpuBtn').addEventListener('click', () => { audio(); SFX.select(); openCharacterStudio(() => startCPU()); });
$('#cancelBtn').addEventListener('click', () => { leaveRoom(); toLobby(); });
$('#retryJoinBtn').addEventListener('click', () => goOnline(NET.code, NET.create));
$('#copyBtn').addEventListener('click', () => {
  const code = $('#waitCode').textContent;
  const done = () => $('#copyNote').textContent = 'コピーしました';
  try { navigator.clipboard.writeText(code).then(done, () => { selectCode(); $('#copyNote').textContent = '選択したのでコピーしてください'; }); }
  catch (e) { selectCode(); }
});
$('#linkBtn').addEventListener('click', () => {
  const link = location.origin + location.pathname + '#' + $('#waitCode').textContent;
  const done = () => $('#copyNote').textContent = 'リンクをコピーしました';
  try { navigator.clipboard.writeText(link).then(done, () => { $('#copyNote').textContent = link; }); } catch (e) { $('#copyNote').textContent = link; }
});
function selectCode() { const r = document.createRange(); r.selectNodeContents($('#waitCode')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
try { const n = localStorage.getItem('marutto-nick'); if (n) $('#nick').value = n; } catch (e) { }
$('#nick').addEventListener('change', () => { try { localStorage.setItem('marutto-nick', nickname()); } catch (e) { } });

// ---- 全員共通のキャラ一覧・キャラメイク ----
const studio = { open: false, draft: AVATAR.clean(null), id: crypto.randomUUID(), selectedId: null, records: [], category: 'hair', color: 'skin',
  canShare: null, pending: null, preview: null, turn: 0, saving: false, load: 0, lastRender: 0, previousFocus: null };
const CHARACTER_CACHE = 'shb-shared-characters-v1';
try {
  const data = JSON.parse(localStorage.getItem(CHARACTER_CACHE) || '{}');
  if (Array.isArray(data.characters)) studio.records = data.characters.filter(c => c && typeof c.id === 'string').slice(0,1000).map(c => ({ id: c.id, appearance: AVATAR.clean(c.appearance), shared: c.shared === true }));
  const picked = studio.records.find(c => c.id === data.selectedId);
  if (picked) { chosenAvatar = AVATAR.clean(picked.appearance); chosenAvatarId = picked.id; studio.selectedId = picked.id; }
} catch (e) { }
function cacheCharacters() {
  try { localStorage.setItem(CHARACTER_CACHE, JSON.stringify({ selectedId: chosenAvatarId, characters: studio.records })); }
  catch (e) { $('#avatarStatus').textContent = '端末に保存できません。共有保存が完了するまでこの画面を閉じないでください'; }
}
function characterEndpoint() {
  try { const u = new URL(SERVER_URL); if (!['ws:','wss:'].includes(u.protocol)) return null; u.protocol = u.protocol === 'wss:' ? 'https:' : 'http:'; u.pathname = '/api/characters'; u.search = ''; u.hash = ''; return u.href; }
  catch (e) { return null; }
}
async function characterRequest(method = 'GET', body) {
  const url = characterEndpoint(); if (!url) throw new Error('共有保存の接続先がありません');
  const response = await fetch(url, { method, cache: 'no-store', headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
  let data; try { data = await response.json(); } catch (e) { throw new Error('サーバーを更新しています。少し待って一覧を更新してください'); }
  if (!response.ok) { if (data.shared === false) studio.canShare = false; throw new Error(data.error || '共有保存に接続できません'); }
  return data;
}
function studioButtons() {
  const saved = studio.records.some(c => c.id === studio.selectedId && c.shared);
  $('#avatarSave').disabled = studio.saving || saved;
  $('#avatarSave').textContent = saved ? '共有に保存済み' : studio.canShare === false ? 'この端末に保存' : '共有に保存';
  $('#avatarUse').disabled = studio.saving;
  $('#avatarUse').textContent = studio.pending ? 'このキャラで開始' : 'このキャラを選ぶ';
}
function renderCharacterList() {
  const list = $('#characterList'); list.replaceChildren();
  for (const record of [...studio.records].reverse()) {
    const button = document.createElement('button'); button.type = 'button'; button.className = 'character-card';
    button.setAttribute('aria-pressed', String(record.id === studio.selectedId));
    const dot = document.createElement('i'); dot.style.backgroundColor = record.appearance.uniform;
    const text = document.createElement('div'), name = document.createElement('b'), note = document.createElement('span');
    name.textContent = `${record.appearance.name} #${record.appearance.number}`; note.textContent = record.shared ? '共有キャラ' : 'この端末のみ';
    text.append(name, document.createElement('br'), note); button.append(dot, text);
    button.addEventListener('click', () => { if (studio.saving) return; studio.draft = AVATAR.clean(record.appearance); studio.id = record.id; studio.selectedId = record.id; refreshStudioFields(); renderCharacterList(); $('#avatarStatus').textContent = record.shared ? 'このキャラを選ぶか、パーツを変えて新しいキャラを作れます' : '端末に保存されたキャラです。共有保存後はみんなが選べます'; });
    list.append(button);
  }
  if (!studio.records.length) { const p = document.createElement('p'); p.className = 'note'; p.textContent = 'まだキャラがいません。最初の選手を作ろう！'; list.append(p); }
  studioButtons();
}
async function refreshSharedCharacters() {
  const request = ++studio.load; $('#characterListStatus').textContent = '共有キャラを読み込んでいます…';
  let serverReady = false, publicReady = false;
  const adopt = data => {
    if (!Array.isArray(data.characters)) throw new Error('共有一覧の形式を確認できません');
    const shared = data.characters.filter(c => c && typeof c.id === 'string').map(c => ({ id: c.id, appearance: AVATAR.clean(c.appearance), shared: true }));
    const ids = new Set(shared.map(c => c.id)); studio.records = [...studio.records.filter(c => !c.shared && !ids.has(c.id)), ...shared];
    cacheCharacters(); renderCharacterList(); return shared.length;
  };
  // 読み込みは公開JSONから先行。無料サーバーの起動待ちでも選べるようにする。
  const publicRead = (async () => {
    if (!window.SHARED_CHARACTER_CATALOG) return;
    try {
      const response = await fetch(window.SHARED_CHARACTER_CATALOG, { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) return; const data = await response.json();
      if (request !== studio.load || serverReady) return;
      studio.canShare = false; const count = adopt(data); publicReady = true;
      $('#characterListStatus').textContent = `みんなで使える共有キャラ：${count}人\n保存サーバーへの接続を確認しています…`;
    } catch (e) { }
  })();
  try {
    const data = await characterRequest(); if (request !== studio.load) return;
    studio.canShare = data.writable !== false;
    const count = adopt(data); serverReady = true;
    $('#characterListStatus').textContent = `みんなで使える共有キャラ：${count}人` + (studio.canShare ? '' : '\n共有への新規保存は準備中です。端末には保存できます');
  } catch (e) {
    await publicRead;
    if (request === studio.load) { studio.canShare = false; $('#characterListStatus').textContent = publicReady ? `みんなで使える共有キャラ：${studio.records.filter(c=>c.shared).length}人\n共有キャラを選べます。新規保存はサーバーへの接続待ちです` : `${e.message}\n保存済みの端末データでも遊べます`; studioButtons(); }
  }
}
function markAvatarEdited() {
  if (studio.records.some(c => c.id === studio.id)) { studio.id = crypto.randomUUID(); studio.selectedId = null; }
  studio.draft = AVATAR.clean(studio.draft);
  $('#avatarStatus').textContent = '新しいキャラとして保存できます。元の共有キャラはそのまま残ります';
  renderCharacterList(); updateStudioPreview();
}
function updateStudioPreview() {
  $('#avatarPreviewName').textContent = `${studio.draft.name} #${studio.draft.number}`;
  if (studio.preview) applyAvatar(studio.preview.player, studio.draft, TEAM.away);
  studioButtons();
}
function renderPartOptions() {
  const container = $('#partOptions'); container.replaceChildren();
  for (const [index, label] of AVATAR.catalogs[studio.category].entries()) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.setAttribute('aria-pressed', String(studio.draft[studio.category] === index));
    button.addEventListener('click', () => { if (studio.saving) return; studio.draft[studio.category] = index; markAvatarEdited(); renderPartOptions(); });
    container.append(button);
  }
}
function refreshStudioFields() {
  $('#avatarName').value = studio.draft.name; $('#avatarNumber').value = studio.draft.number;
  $('#avatarColors').querySelectorAll('input').forEach(input => input.value = studio.draft[input.dataset.key]);
  renderPartOptions(); updateStudioPreview();
}
function initStudioPreview() {
  if (studio.preview) return;
  try {
    const view = new THREE.WebGLRenderer({ canvas: $('#avatarCanvas'), antialias: true, alpha: true });
    view.setPixelRatio(Math.min(devicePixelRatio || 1, 1.5)); view.outputEncoding = THREE.sRGBEncoding;
    const stage = new THREE.Scene(); stage.add(new THREE.HemisphereLight(0xffffff, 0x71837d, 1));
    const light = new THREE.DirectionalLight(0xfff2da, .8); light.position.set(-2,4,5); stage.add(light);
    const player = makePlayer(TEAM.away); scene.remove(player); stage.add(player);
    const cam = new THREE.PerspectiveCamera(38,1,.05,20); cam.position.set(0,1.05,3.3); cam.lookAt(0,.82,0);
    studio.preview = { view, stage, player, cam }; updateStudioPreview();
  } catch (e) { $('#avatarStatus').textContent = '3Dプレビューを表示できません。パーツの選択と保存はできます'; }
}
function renderAvatarPreview() {
  if (!studio.open || !studio.preview) return;
  const t = performance.now(); if (t - studio.lastRender < 33) return; studio.lastRender = t;
  const p = studio.preview, canvas = $('#avatarCanvas'), w = Math.max(1,canvas.clientWidth), h = Math.max(1,canvas.clientHeight);
  if (p.width !== w || p.height !== h) { p.view.setSize(w,h,false); p.cam.aspect = w/h; p.cam.updateProjectionMatrix(); p.width=w; p.height=h; }
  p.player.rotation.y += (studio.turn - p.player.rotation.y) * .18; p.view.render(p.stage,p.cam);
}
function openCharacterStudio(pending = null) {
  if (studio.open) return; studio.open = true; studio.pending = pending; studio.previousFocus = document.activeElement;
  $('#home').inert=true;
  studio.draft = AVATAR.clean(chosenAvatar); studio.selectedId = chosenAvatarId;
  studio.id = chosenAvatarId || crypto.randomUUID();
  $('#characterStudio').hidden = false; $('#avatarStatus').textContent = '共有に保存した選手は、みんなで使用できます。';
  initStudioPreview(); refreshStudioFields(); renderCharacterList(); refreshSharedCharacters(); $('#avatarName').focus();
}
function closeCharacterStudio() {
  studio.open = false; $('#characterStudio').hidden = true; studio.pending = null;
  $('#home').inert=false;
  if (studio.previousFocus && studio.previousFocus.isConnected) studio.previousFocus.focus();
}
function rememberDraft() {
  const record = { id: studio.id, appearance: AVATAR.clean(studio.draft), shared: false };
  if (!studio.records.some(c => c.id === record.id)) studio.records.push(record);
  studio.selectedId = record.id; cacheCharacters(); return record;
}
async function saveSharedCharacter() {
  if (studio.saving) return;
  const record = rememberDraft(); renderCharacterList();
  if (studio.canShare === false) { $('#avatarStatus').textContent = 'この端末に保存しました。全員共通の保存はサーバー設定後に利用できます'; return; }
  studio.saving = true; $('#characterStudio').querySelectorAll('input').forEach(input=>input.disabled=true); studioButtons(); $('#avatarStatus').textContent = '共有に保存しています…';
  try {
    const data = await characterRequest('POST', record);
    const i = studio.records.findIndex(c => c.id === record.id); if (i >= 0) studio.records[i] = { id: data.character.id, appearance: AVATAR.clean(data.character.appearance), shared: true };
    studio.canShare = true; cacheCharacters(); $('#avatarStatus').textContent = '共有に保存しました！次からは全員がこのキャラを選べます';
    $('#characterListStatus').textContent = `みんなで使える共有キャラ：${studio.records.filter(c=>c.shared).length}人`;
  } catch (e) { $('#avatarStatus').textContent = `この端末には保存済みです。${e.message}`; }
  finally { studio.saving = false; $('#characterStudio').querySelectorAll('input').forEach(input=>input.disabled=false); renderCharacterList(); }
}
const partLabels = { hair:'髪 30', eyes:'目 24', brows:'眉 20', mouth:'口 24', paint:'顔の模様 12', pattern:'服の柄 8', hat:'帽子 4' };
for (const [key,label] of Object.entries(partLabels)) {
  const button=document.createElement('button'); button.type='button'; button.textContent=label; button.setAttribute('aria-pressed',String(key===studio.category));
  button.addEventListener('click',()=>{studio.category=key;$('#partTabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderPartOptions();}); $('#partTabs').append(button);
}
const colorLabels={skin:'肌',hairColor:'髪・眉',eyeColor:'目',uniform:'ユニフォーム',hatColor:'帽子',accent:'模様・背番号'};
for(const [key,label] of Object.entries(colorLabels)) {
  const row=document.createElement('label'), input=document.createElement('input'); input.type='color'; input.dataset.key=key; input.value=studio.draft[key]; input.setAttribute('aria-label',label+'の色');
  input.addEventListener('focus',()=>{studio.color=key;$('#colorPresets').setAttribute('aria-label',label+'の色プリセット');});
  input.addEventListener('input',()=>{if(studio.saving)return;studio.draft[key]=input.value;studio.color=key;markAvatarEdited();});row.append(input,document.createTextNode(label));$('#avatarColors').append(row);
}
for(const color of AVATAR.colors) {
  const button=document.createElement('button');button.type='button';button.style.backgroundColor=color;button.setAttribute('aria-label',color+'を選択');
  button.addEventListener('click',()=>{if(studio.saving)return;studio.draft[studio.color]=color;markAvatarEdited();refreshStudioFields();});$('#colorPresets').append(button);
}
$('#avatarName').addEventListener('input',()=>{if(studio.saving)return;studio.draft.name=$('#avatarName').value;markAvatarEdited();});
$('#avatarNumber').addEventListener('input',()=>{if(studio.saving)return;studio.draft.number=$('#avatarNumber').value.replace(/\D/g,'').slice(0,2);markAvatarEdited();});
$('#avatarTurn').addEventListener('click',()=>studio.turn+=Math.PI);
$('#avatarNew').addEventListener('click',()=>{if(studio.saving)return;studio.draft=AVATAR.clean(null);studio.id=crypto.randomUUID();studio.selectedId=null;refreshStudioFields();renderCharacterList();$('#avatarStatus').textContent='新しい選手を作ろう。122種類のパーツと自由な配色から選べます';});
$('#avatarRandom').addEventListener('click',()=>{if(studio.saving)return;for(const [key,options] of Object.entries(AVATAR.catalogs))studio.draft[key]=Math.floor(Math.random()*options.length);for(const key of ['hairColor','eyeColor','uniform','hatColor','accent'])studio.draft[key]=AVATAR.colors[Math.floor(Math.random()*AVATAR.colors.length)];markAvatarEdited();refreshStudioFields();});
$('#avatarRefresh').addEventListener('click',()=>{if(!studio.saving)refreshSharedCharacters();});
$('#avatarSave').addEventListener('click',saveSharedCharacter);
$('#avatarUse').addEventListener('click',()=>{if(studio.saving)return;rememberDraft();chosenAvatar=AVATAR.clean(studio.draft);chosenAvatarId=studio.id;cacheCharacters();$('#characterSummary').textContent=`選択中：${chosenAvatar.name} #${chosenAvatar.number}`;const action=studio.pending;closeCharacterStudio();if(action)action();else if(C.phase==='lobby')setTitlePlayer();});
$('#characterBtn').addEventListener('click',()=>openCharacterStudio());$('#studioClose').addEventListener('click',closeCharacterStudio);
$('#characterStudio').addEventListener('keydown',e=>{
  if(e.key==='Escape'){e.preventDefault();closeCharacterStudio();}
  if(e.key==='Tab'){const items=[...$('#characterStudio').querySelectorAll('button,input')].filter(el=>!el.disabled&&el.offsetParent!==null);const first=items[0],last=items[items.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}
});
if(chosenAvatar)$('#characterSummary').textContent=`選択中：${chosenAvatar.name} #${chosenAvatar.number}`;

/*TITLE_MENU*/
toLobby();
if(/^[A-Z0-9]{4}$/.test($('#codeIn').value))openMatchSetup('join',false);
requestAnimationFrame(frame);
})();
