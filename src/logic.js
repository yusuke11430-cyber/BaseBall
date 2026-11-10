// ===== ゲームロジック（描画に依存しない純粋な関数） =====
const BB = (() => {
  const G = 9.8, DRAG = 0.004;
  const PLATE_Z = 0, RELEASE = { x: -0.45, y: 1.85, z: -17.4 };
  const ZONE = { x0: -0.25, x1: 0.25, y0: 0.5, y1: 1.1 };
  const MEET = { rx: 0.12, ry: 0.075 };
  const BAT = { length: 0.78, sweet: 0.585, cursorHalf: 0.40 };
  const SWING_LAG = 0.07;      // クリックからインパクトまで（秒）
  const TIMING_WIN = 0.095;    // 当たる時間幅（±秒）

  // bx: +は一塁側（右打者の外角）へ、by: +は浮き上がり。k が大きいほど手元で急に変化
  const PITCHES = {
    st: { name: 'ストレート', kmh: 146, bx: 0.02, by: 0.06, k: 2, err: 0.05 },
    sh: { name: 'シュート', kmh: 138, bx: -0.26, by: -0.06, k: 2.4, err: 0.06 },
    ct: { name: 'カットボール', kmh: 140, bx: 0.13, by: -0.03, k: 3.2, err: 0.05 },
    sl: { name: 'スライダー', kmh: 131, bx: 0.30, by: -0.10, k: 2.4, err: 0.06 },
    cv: { name: 'カーブ', kmh: 112, bx: 0.24, by: -0.48, k: 2.0, err: 0.07 },
    sc: { name: 'スローカーブ', kmh: 92, bx: 0.20, by: -0.72, k: 1.8, err: 0.07 },
    fk: { name: 'フォーク', kmh: 134, bx: 0.0, by: -0.42, k: 3.6, err: 0.07 },
    ch: { name: 'チェンジアップ', kmh: 124, bx: -0.10, by: -0.22, k: 2.2, err: 0.05 },
    sk: { name: 'シンカー', kmh: 125, bx: -0.26, by: -0.34, k: 2.8, err: 0.06 },
    kn: { name: 'ナックル', kmh: 108, bx: 0.0, by: -0.12, k: 2.0, err: 0.06, knuckle: true },
  };
  const PITCH_KEYS = ['st', 'sh', 'ct', 'sl', 'cv', 'sc', 'fk', 'ch', 'sk', 'kn'];

  function rng(seed) {
    let a = seed >>> 0;
    return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  }
  function gauss(r) { let u = 0, v = 0; while (!u) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // スタミナ: 1球の消費量（速いほど急に増える）
  const STA_MAX = 100, SPEED_MIN = 20, SPEED_MAX = 1000;
  function speedCost(v) { return v <= 100 ? 0.8 : 0.8 + Math.pow((v - 100) / 50, 2); }
  // 変化量 1〜7（4が標準）。大きく曲げるほどスタミナを使う（曲がりの大きい球種ほど負担も大きい）
  const BREAK_MIN = 1, BREAK_MAX = 7, BREAK_STD = 4;
  const noBreak = type => type === 'st'; // ストレートは変化量なし
  // 変化球は全段階で従来の半分。直球の軌道はそのまま。
  const breakScale = (type, bl) => noBreak(type) ? 1 : clamp(bl || BREAK_STD, BREAK_MIN, BREAK_MAX) / BREAK_STD;
  function breakCost(type, bl) {
    if (noBreak(type)) return 0;
    const p = PITCHES[type] || PITCHES.st, f = clamp(Math.hypot(p.bx, p.by) / 0.3, 0.3, 1.5) * (p.knuckle ? 1.2 : 1);
    return 0.09 * Math.pow(clamp(bl || BREAK_STD, BREAK_MIN, BREAK_MAX) - 1, 2) * f;
  }
  // ナックルは球速分・変化量分を合わせた消費を2倍にする。
  function staminaCost(v, type, bl) { return +((speedCost(v) + (type ? breakCost(type, bl) : 0)) * (type === 'kn' ? 2 : 1)).toFixed(2); }
  // 残りスタミナで出せる最高球速（スタミナ切れでも90km/hは出る）
  function affordable(S) { return 90 + 50 * Math.sqrt(Math.max(0, S)); }
  // 投手側で投球データを作る。受け取った側も同じ引数で計算し直すので、数値をごまかせない
  function makePitch(n, type, tx, ty, seed, rq, S, bl) {
    const p = PITCHES[type], r = rng(seed);
    rq = clamp(Math.round(rq || p.kmh), SPEED_MIN, SPEED_MAX);
    bl = noBreak(type) ? BREAK_STD : clamp(Math.round(bl || BREAK_STD), BREAK_MIN, BREAK_MAX);
    S = S === undefined ? STA_MAX : S;
    const cost = staminaCost(rq, type, bl);
    const short = cost > S;                        // スタミナ不足
    // スタミナが足りている間は狙った所へ狙った球速で投げられる
    let kmh = rq, ax = tx, ay = ty;
    if (short) {
      kmh = clamp(Math.round(Math.min(rq, affordable(S) * (0.95 + r() * 0.05)) + gauss(r) * 4), SPEED_MIN, SPEED_MAX);
      const err = p.err * 1.5 + 0.06 + 0.12 * (1 - S / cost);
      ax = tx + gauss(r) * err; ay = ty + gauss(r) * err;
    }
    // ナックルは投げた本人にも行き先が読めない（揺れながら少しずれる）
    let kp = null;
    if (p.knuckle) { const kr = rng((seed ^ 0x5bd1e995) >>> 0), km = breakScale(type, bl); ax += gauss(kr) * 0.08 * km; ay += gauss(kr) * 0.08 * km; kp = [+(kr() * 6.28).toFixed(3), +(kr() * 6.28).toFixed(3)]; }
    return { n, type, tx, ty, rq, bl, bm: breakScale(type, bl), seed, ax: +ax.toFixed(3), ay: +ay.toFixed(3), kp, kmh, cost: Math.min(cost, Math.max(S, 0)), short };
  }
  function pitchDuration(pi) { return Math.abs(RELEASE.z - PLATE_Z) / (pi.kmh / 3.6); }
  // s: 0..1（リリース→本塁）。1を超えると捕手側へ伸びる
  function pitchPos(pi, s) {
    const p = PITCHES[pi.type];
    const m = pi.bm || 1, bx = p.bx * m, by = p.by * m;
    const sx = pi.ax - bx, sy = pi.ay - by;
    const ss = Math.min(s, 1), late = Math.pow(ss, p.k);
    let x = RELEASE.x + (sx - RELEASE.x) * ss + bx * late;
    let y = RELEASE.y + (sy - RELEASE.y) * ss + by * late;
    let z = RELEASE.z + (PLATE_Z - RELEASE.z) * s;
    if (pi.kp) { const env = Math.sin(ss * Math.PI); x += 0.06 * m * Math.sin(ss * 13 + pi.kp[0]) * env; y += 0.06 * m * Math.sin(ss * 10 + pi.kp[1]) * env; }
    // 重力の山なり：遅い球ほど高く上がる（中間点で g*T^2/8）
    const T = pitchDuration(pi);
    y += 0.5 * G * T * T * ss * (1 - ss);
    if (s > 1) { const e = s - 1; x += (pi.ax - RELEASE.x) * e * 0.05; y -= e * 0.4; }
    return { x, y, z };
  }
  function inZone(x, y) { return x >= ZONE.x0 - 0.035 && x <= ZONE.x1 + 0.035 && y >= ZONE.y0 - 0.035 && y <= ZONE.y1 + 0.035; }

  // 現時点までの変化から到達位置を予測。残りの変化は徐々に見えてきて、接触時は判定と一致する。
  function predictContact(pi, s, sz = 0) {
    const contact = contactS(sz), at = pitchPos(pi, contact);
    if (noBreak(pi.type) || s >= contact) return at;
    const targetX = at.x, targetY = at.y;
    const p = PITCHES[pi.type], m = pi.bm || 1, t = clamp(s, 0, contact), end = Math.min(contact, 1), seen = Math.min(t, 1);
    // 観測済みの曲がりと現在の変化速度で、残り区間を外挿する（重力は織り込み済み）。
    const remaining = Math.pow(end, p.k) - Math.pow(seen, p.k) - p.k * Math.pow(seen, p.k - 1) * (end - seen);
    at.x -= p.bx * m * remaining; at.y -= p.by * m * remaining;
    if (pi.kp) {
      const wave = (u, frequency, phase) => Math.sin(u * frequency + phase) * Math.sin(u * Math.PI);
      const slope = (u, frequency, phase) => frequency * Math.cos(u * frequency + phase) * Math.sin(u * Math.PI) + Math.PI * Math.sin(u * frequency + phase) * Math.cos(u * Math.PI);
      // ナックルの不規則な揺れも反映。残り時間が短くなるほど予測のずれが消える。
      const forecast = (frequency, phase) => 0.06 * m * (wave(seen, frequency, phase) + slope(seen, frequency, phase) * (end - seen) - wave(end, frequency, phase));
      at.x += forecast(13, pi.kp[0]); at.y += forecast(10, pi.kp[1]);
    }
    // 予測円だけを穏やかにする。小さい変化は1/4、大きな変化も約2球分以内に収める。
    // 滑らかに制限し、変化量1〜7の差と接触時の一致を保つ。
    const dx = at.x - targetX, dy = at.y - targetY, gain = 0.25 / (1 + 0.25 * Math.hypot(dx, dy) / 0.28);
    at.x = targetX + dx * gain; at.y = targetY + dy * gain;
    return at;
  }

  // 打球の軌道（バウンド込み）。phi: 中堅0°、右翼+、la: 打球角度、ev: km/h
  function flight(phi, la, ev, maxT = 7, origin = { x: 0, y: 0.9, z: 0 }) {
    const v = ev / 3.6, a = la * Math.PI / 180, h = phi * Math.PI / 180;
    let px = origin.x, py = origin.y, pz = origin.z;
    let vh = v * Math.cos(a), vy = v * Math.sin(a);
    let vx = vh * Math.sin(h), vz = -vh * Math.cos(h);
    const pts = []; const dt = 1 / 60; let t = 0, land = null, bounces = 0;
    while (t < maxT) {
      pts.push([px, py, pz]);
      const s = Math.hypot(vx, vy, vz);
      vx -= DRAG * s * vx * dt; vz -= DRAG * s * vz * dt; vy -= (G + DRAG * s * vy) * dt;
      px += vx * dt; py += vy * dt; pz += vz * dt; t += dt;
      if (py <= 0.04) {
        py = 0.04;
        if (!land) land = { x: px, z: pz, t };
        if (Math.abs(vy) > 1.2 && bounces < 6) { vy = -vy * 0.38; vx *= 0.7; vz *= 0.7; bounces++; }
        else { vy = 0; vx *= 0.96; vz *= 0.96; }
        if (Math.hypot(vx, vz) < 0.4) { pts.push([px, py, pz]); break; }
      }
      // フェンス（越えたら止める）
      const d = Math.hypot(px, pz);
      if (d >= fenceDist(Math.atan2(px, -pz) * 180 / Math.PI) && Math.abs(Math.atan2(px, -pz)) < Math.PI / 4 + 0.05) {
        if (py < FENCE_H) { vx *= -0.3; vz *= -0.3; px += vx * dt * 2; pz += vz * dt * 2; }
      }
    }
    return { pts, land: land || { x: px, z: pz, t } };
  }
  const FENCE_H = 3.2;
  function fenceDist(phiDeg) { return 96 + 24 * Math.cos(clamp(phiDeg, -45, 45) * 2 * Math.PI / 180); }
  // 描画と乱闘の衝突判定で同じ、一周閉じた球場外周を使う。
  function stadiumOutline() {
    const pole=s=>{const d=fenceDist(45*s);return [s*d*Math.SQRT1_2,-d*Math.SQRT1_2];};
    const points=[pole(-1)];
    for(let a=135;a>=45;a-=3){const r=a*Math.PI/180;points.push([Math.cos(r)*18,Math.sin(r)*18]);}
    points.push(pole(1));
    for(let a=42;a>=-42;a-=3){const r=a*Math.PI/180,d=fenceDist(a);points.push([Math.sin(r)*d,-Math.cos(r)*d]);}
    return points;
  }
  function stadiumSection(axis,fixed,margin=0) {
    const points=stadiumOutline(),variable=axis==='x'?0:1,constant=1-variable;
    let min=-Infinity,max=Infinity;
    for(let i=0;i<points.length;i++){
      const a=points[i],b=points[(i+1)%points.length],dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
      let n=[-dz/len,dx/len];if(n[0]*(0-a[0])+n[1]*(-45-a[1])<0)n=n.map(v=>-v);
      const rhs=margin+n[variable]*a[variable]-n[constant]*(fixed-a[constant]);
      if(Math.abs(n[variable])<1e-10){if(n[constant]*(fixed-a[constant])<margin)return null;continue;}
      const edge=rhs/n[variable];if(n[variable]>0)min=Math.max(min,edge);else max=Math.min(max,edge);
    }
    return min<=max?{min,max}:null;
  }
  // フェンス上を越えるか
  function clearsFence(phi, la, ev) {
    const v = ev / 3.6, a = la * Math.PI / 180;
    let x = 0, y = 0.9, vx = v * Math.cos(a), vy = v * Math.sin(a); const dt = 0.005, F = fenceDist(phi);
    while (y > 0) { const s = Math.hypot(vx, vy); vx -= DRAG * s * vx * dt; vy -= (G + DRAG * s * vy) * dt; x += vx * dt; y += vy * dt;
      if (x >= F) return y > FENCE_H; }
    return false;
  }
  function carry(la, ev) {
    const v = ev / 3.6, a = la * Math.PI / 180;
    let x = 0, y = 0.9, vx = v * Math.cos(a), vy = v * Math.sin(a), t = 0; const dt = 0.005;
    while (y > 0 && t < 12) { const s = Math.hypot(vx, vy); vx -= DRAG * s * vx * dt; vy -= (G + DRAG * s * vy) * dt; x += vx * dt; y += vy * dt; t += dt; }
    return { d: x, t };
  }

  // 打者側で結果を決める。cursor: {x,y} 本塁上のミート位置、dt: インパクト時刻 - 本塁到達時刻（null=見逃し）
  // 打者の立ち位置（前後）で、球をとらえる位置が変わる。前に出るほど変化前に打てる
  function contactS(sz) { return clamp(((sz || 0) - RELEASE.z) / (PLATE_Z - RELEASE.z), 0.9, 1.05); }
  // 判定・打球・衝撃表示が共有する接触位置。
  const contactPoint = (pi, sz = 0) => pitchPos(pi, contactS(sz));
  // 球と体の掃引判定。1000km/hで1フレームに体を通り抜けても見落とさない。
  function hitBatter(pi, st, fromS = 0, toS = 1.1) {
    const x = Number.isFinite(st.x) ? st.x : st.lh ? .95 : -.95, z = clamp(+st.dz || 0, -.9, .6) - .05;
    const length = PLATE_Z - RELEASE.z;
    const start = Math.max(0, fromS, (z-.5-RELEASE.z)/length), end = Math.min(toS, (z+.5-RELEASE.z)/length);
    if(end<=start)return null;
    const bodies=[[x,1.33,z,.325,.325,.325],[x,.78,z,.375,.415,.345],
      [x-.11,.3,z,.175,.295,.175],[x+.11,.3,z,.175,.295,.175]];
    const steps=Math.max(1,Math.ceil((end-start)*length/.035));let a=pitchPos(pi,start);
    for(let i=1;i<=steps;i++){
      const s0=start+(end-start)*(i-1)/steps,s1=start+(end-start)*i/steps,b=pitchPos(pi,s1);let earliest=Infinity;
      for(const [cx,cy,cz,rx,ry,rz] of bodies){
        const u=[(a.x-cx)/rx,(a.y-cy)/ry,(a.z-cz)/rz],v=[(b.x-a.x)/rx,(b.y-a.y)/ry,(b.z-a.z)/rz];
        const A=v.reduce((n,t)=>n+t*t,0),B=2*u.reduce((n,t,j)=>n+t*v[j],0),D=u.reduce((n,t)=>n+t*t,0)-1;
        if(D<=0){earliest=0;continue;}const disc=B*B-4*A*D;
        if(A>0&&disc>=0){const t=(-B-Math.sqrt(disc))/(2*A);if(t>=0&&t<=1)earliest=Math.min(earliest,t);}
      }
      if(earliest!==Infinity){const s=s0+(s1-s0)*earliest;return {s,point:pitchPos(pi,s)};}a=b;
    }
    return null;
  }
  // 立ち位置と一緒に動く、短めのスイング到達範囲。左右の打席で対称。
  function batCursorBounds(sx,lh=false) {
    const hand=lh?-1:1;
    const stance=Number.isFinite(sx)?clamp(sx,lh?.55:-1.45,lh?1.45:-.55):-hand*.95;
    const shift=stance+hand*.95;
    return {min:shift-BAT.cursorHalf,max:shift+BAT.cursorHalf};
  }
  function boundedBatCursor(cursor,opt) {
    const bounds=batCursorBounds(opt.sx,!!opt.lh);
    return {x:clamp(cursor.x,bounds.min,bounds.max),y:cursor.y};
  }
  // バットの芯がミートカーソルを通るインパクト姿勢。描画の長さと共有。
  function swingPose(x, y, sz = 0, lh = false) {
    const h = lh ? -1 : 1, len = Math.hypot(1, 0.02), dx = h / len, dy = 0.02 / len;
    return { x: x - dx * BAT.sweet, y: y - dy * BAT.sweet, z: sz };
  }
  // opt: { lh: 左打席なら true, sx: 左右位置, sz: 前後位置（-が投手寄り） }
  function judge(pi, cursor, dt, gs, seed, opt = {}) {
    cursor=boundedBatCursor(cursor,opt);
    const r = rng(seed), hand = opt.lh ? -1 : 1;
    const plate = pitchPos(pi, 1), at = contactPoint(pi, opt.sz);
    const out = { n: pi.n, seed, swung: dt !== null, cx: +cursor.x.toFixed(3), cy: +cursor.y.toFixed(3), lh: !!opt.lh, sz: +(opt.sz || 0).toFixed(2) };
    if (dt === null) { out.kind = inZone(plate.x, plate.y) ? 'strike' : 'ball'; return out; }
    const dx = (at.x - cursor.x) / MEET.rx, dy = (at.y - cursor.y) / MEET.ry;
    const e = dt / TIMING_WIN;
    if (dx * dx + dy * dy > 1 || Math.abs(e) > 1) { out.kind = 'whiff'; return out; }
    out.dt = +dt.toFixed(3);
    const precision = clamp(1 - 0.5 * e * e - 0.3 * dx * dx - 0.25 * dy * dy, 0, 1);
    out.quality = +precision.toFixed(3);
    out.contact = Math.abs(e) <= 0.3 && dx * dx + dy * dy <= 0.18 ? 'sweet'
      : dx * hand < -0.38 ? 'jam' : dx * hand > 0.38 ? 'tip' : Math.abs(dy) > 0.65 ? 'glance' : 'solid';
    // 芯からのズレで打球の質が決まる
    const q = clamp(precision + gauss(r) * 0.04, 0, 1);
    let phi = hand * (e * 52 - dx * 6) + gauss(r) * 7; // 早いと引っ張り（右打者は左方向）
    let la = 13 + dy * 30 + gauss(r) * 5;
    // こすった打球も角度と方向から決める。突然ランダムな横方向のファウルへ置き換えない。
    const ev = clamp(85 + 78 * q + clamp((pi.kmh - 130) * 0.18, -12, 14), 60, 172);
    out.phi = +phi.toFixed(1); out.la = +la.toFixed(1); out.ev = +ev.toFixed(1);
    // 下向きの打球もフェア方向ならゴロ。描画に使う方向と判定をそろえる。
    if (Math.abs(out.phi) > 45) { out.kind = 'foul'; return out; }
    out.kind = 'inplay';
    out.result = fieldResult(phi, la, ev, gs, r);
    return out;
  }

  // バント：バットの高さと幅（カーソル基準）に球が来れば当たる。タイミング不要
  const BUNT = { back: 0.35, tip: 0.39, h: 0.075 };
  function judgeBunt(pi, cursor, gs, seed, opt = {}) {
    cursor=boundedBatCursor(cursor,opt);
    const r = rng(seed), hand = opt.lh ? -1 : 1;
    const at = contactPoint(pi, opt.sz);
    const out = { n: pi.n, seed, swung: true, bunt: true, cx: +cursor.x.toFixed(3), cy: +cursor.y.toFixed(3), lh: !!opt.lh, sz: +(opt.sz || 0).toFixed(2) };
    const rel = (at.x - cursor.x) * hand, dy = (at.y - cursor.y) / BUNT.h;
    if (rel < -BUNT.back || rel > BUNT.tip || Math.abs(dy) > 1) { out.kind = 'whiff'; return out; }
    out.contact = 'bunt';
    const ev = clamp(48 + 22 * (1 - Math.abs(dy)) + gauss(r) * 6 + clamp((pi.kmh - 130) * 0.05, -4, 6), 30, 85);
    const la = -6 + dy * 30 + gauss(r) * 4;
    const phi = hand * (rel * 55) + gauss(r) * 10;
    out.phi = +phi.toFixed(1); out.la = +la.toFixed(1); out.ev = +ev.toFixed(1);
    if (Math.abs(out.phi) > 45) { out.kind = 'foul'; return out; }
    out.kind = 'inplay';
    const runners = gs.bases[0] + gs.bases[1] + gs.bases[2];
    if (la > 24) out.result = 'fout';                                    // 小フライ
    else if (r() < 0.1 + (opt.lh ? 0.06 : 0) + (ev < 55 ? 0.06 : 0)) out.result = 'single'; // バントヒット
    else if (gs.bases[0] && gs.outs < 2 && ev > 66 && r() < 0.3) out.result = 'dp';
    else out.result = runners && gs.outs < 2 ? 'bunt' : 'gout';
    return out;
  }

  function fieldResult(phi, la, ev, gs, r) {
    const onFirst = gs.bases[0], onThird = gs.bases[2];
    if (la > 15 && clearsFence(phi, la, ev)) return 'hr';
    const { d } = carry(Math.max(la, 0), ev);
    const F = fenceDist(phi);
    const gap = Math.abs(Math.abs(phi) - 22) < 8 ? 1 : 0; // 左中間・右中間
    if (la < 9) { // ゴロ
      let p = clamp((ev - 110) / 140, 0.03, 0.36) + (Math.abs(phi) > 38 ? 0.08 : 0);
      if (r() < p) return (Math.abs(phi) > 38 && ev > 150 && r() < 0.5) ? 'double' : 'single';
      if (onFirst && gs.outs < 2 && r() < 0.45) return 'dp';
      return 'gout';
    }
    if (la > 52 && d < 75) return 'fout';
    const liner = la < 22;
    if (d < 38) return r() < (liner ? 0.25 : 0.08) ? 'single' : (liner ? 'lout' : 'fout');
    if (d < 62) return r() < (liner ? 0.5 : 0.3) ? 'single' : (liner ? 'lout' : 'fout');
    if (d >= F - 3) return r() < 0.85 ? 'double' : 'triple'; // フェンス直撃
    if (d < F - 14) {
      const x = r();
      const outP = (liner ? 0.55 : 0.75) - gap * 0.15;
      if (x < outP) return (onThird && gs.outs < 2 && d > 70) ? 'sac' : 'fout';
      return x < outP + 0.6 * (1 - outP) ? 'single' : 'double';
    }
    const x = r();
    if (x < 0.45 - gap * 0.15) return (onThird && gs.outs < 2) ? 'sac' : 'fout';
    return x < 0.88 ? 'double' : 'triple';
  }

  function newGame(innings, gid) {
    return { gid, n: 0, inning: 1, top: true, outs: 0, b: 0, s: 0, bases: [0, 0, 0],
      score: { away: 0, home: 0 }, sta: { away: STA_MAX, home: STA_MAX }, lines: { away: [0], home: [] }, innings, over: false, msg: 'プレイボール!' };
  }
  const batSide = gs => gs.top ? 'away' : 'home';

  // 結果を状態に適用（両方の画面で同じ結果になる）
  function apply(gs0, o, pi) {
    const gs = JSON.parse(JSON.stringify(gs0));
    const fld = gs.top ? 'home' : 'away';
    if (!gs.sta) gs.sta = { away: STA_MAX, home: STA_MAX };
    if (pi) gs.sta[fld] = +Math.max(0, gs.sta[fld] - staminaCost(pi.rq, pi.type, pi.bl)).toFixed(2);
    const r = rng((o.seed ^ 0x9e3779b9) >>> 0);
    const side = batSide(gs);
    let runs = 0, outs = 0, msg = '';
    const b = gs.bases;
    const resetCount = () => { gs.b = 0; gs.s = 0; };
    const score = n => { runs += n; };
    const walk = () => {
      if (b[0]) { if (b[1]) { if (b[2]) score(1); b[2] = 1; } b[1] = 1; } b[0] = 1;
    };
    switch (o.kind) {
      case 'hbp': msg = 'デッドボール・乱闘開始'; break;
      case 'ball': gs.b++; msg = 'ボール'; if (gs.b >= 4) { walk(); resetCount(); msg = 'フォアボール'; } break;
      case 'strike': case 'whiff':
        gs.s++; msg = o.kind === 'whiff' ? '空振り' : 'ストライク';
        if (gs.s >= 3) { outs = 1; resetCount(); msg = o.kind === 'whiff' ? '空振り三振!' : '見逃し三振!'; } break;
      case 'foul':
        if (o.bunt && gs.s >= 2) { outs = 1; resetCount(); msg = 'スリーバント失敗'; break; } // 2ストライク後のバントファウルは三振
        if (gs.s < 2) gs.s++; msg = 'ファウル'; break;
      case 'inplay': {
        resetCount();
        const res = o.result;
        if (res === 'hr') { score(1 + b[0] + b[1] + b[2]); b[0] = b[1] = b[2] = 0; msg = runs > 3 ? '満塁ホームラン!!' : 'ホームラン!'; }
        else if (res === 'triple') { score(b[0] + b[1] + b[2]); b[0] = b[1] = 0; b[2] = 1; msg = 'スリーベース!'; }
        else if (res === 'double') {
          score(b[2] + b[1]); const f = b[0]; b[2] = 0; b[1] = 1; b[0] = 0;
          if (f) { if (r() < 0.4) score(1); else b[2] = 1; } msg = 'ツーベース!';
        } else if (res === 'single') {
          score(b[2]); let n3 = 0, n2 = 0;
          if (b[1]) { if (r() < 0.6) score(1); else n3 = 1; }
          if (b[0]) { if (!n3 && r() < 0.3) n3 = 1; else n2 = 1; }
          b[2] = n3; b[1] = n2; b[0] = 1; msg = 'ヒット!';
        } else if (res === 'dp') {
          outs = 2; b[0] = 0;
          if (gs.outs + 2 < 3) { if (b[2]) { score(1); b[2] = 0; } if (b[1]) { b[2] = 1; b[1] = 0; } }
          msg = 'ゲッツー!';
        } else if (res === 'bunt') { // 送りバント：打者はアウト、走者は1つずつ進む
          outs = 1;
          if (gs.outs + 1 < 3) { if (b[2]) score(1); b[2] = b[1]; b[1] = b[0]; b[0] = 0; }
          msg = '送りバント成功';
        } else if (res === 'sac') {
          outs = 1; if (gs.outs + 1 < 3) { score(1); b[2] = 0; } msg = '犠牲フライ';
        } else {
          outs = 1;
          if (res === 'gout' && gs.outs + 1 < 3) { // 進塁打
            if (b[2] && r() < 0.5) { score(1); b[2] = 0; }
            if (b[1] && !b[2]) { b[2] = 1; b[1] = 0; }
            if (b[0] && !b[1]) { b[1] = 1; b[0] = 0; }
          }
          msg = res === 'gout' ? 'ゴロでアウト' : res === 'lout' ? 'ライナーでアウト' : 'フライでアウト';
        }
      }
    }
    gs.n = o.n;
    gs.outs += outs;
    if (runs && gs.outs >= 3) runs = 0; // 3アウト目と同時の得点は無効（簡略化）
    if (runs) {
      gs.score[side] += runs; gs.lines[side][gs.inning - 1] = (gs.lines[side][gs.inning - 1] || 0) + runs;
      msg += ` ${runs}点!`;
    }
    // サヨナラ
    if (!gs.top && gs.inning >= gs.innings && gs.score.home > gs.score.away) { gs.over = true; msg += ' サヨナラ!'; }
    if (gs.outs >= 3 && !gs.over) {
      gs.sta[fld] = +(gs.sta[fld] + (STA_MAX - gs.sta[fld]) * 0.30).toFixed(2); // 守備を終えた投手は減った分の30%を回復
      gs.outs = 0; gs.bases = [0, 0, 0]; resetCount();
      if (gs.top) {
        if (gs.inning >= gs.innings && gs.score.home > gs.score.away) gs.over = true;
        else { gs.top = false; gs.lines.home[gs.inning - 1] = gs.lines.home[gs.inning - 1] || 0; msg += ' チェンジ'; }
      } else {
        if (gs.inning >= gs.innings && gs.score.home !== gs.score.away) gs.over = true;
        else if (gs.inning >= gs.innings + 3) gs.over = true;
        else { gs.inning++; gs.top = true; gs.lines.away[gs.inning - 1] = 0; msg += ' チェンジ'; }
      }
    }
    if (gs.over) msg += ' ゲームセット';
    gs.msg = msg.trim();
    return gs;
  }

  return { PITCHES, PITCH_KEYS, ZONE, MEET, BAT, batCursorBounds, SWING_LAG, TIMING_WIN, RELEASE, rng, gauss, clamp,
    makePitch, noBreak, breakScale, predictContact, judgeBunt, contactS, contactPoint, hitBatter, swingPose, BUNT, staminaCost, BREAK_MIN, BREAK_MAX, BREAK_STD, affordable, STA_MAX, SPEED_MIN, SPEED_MAX, pitchDuration, pitchPos, inZone, judge, flight, fenceDist, stadiumOutline, stadiumSection, FENCE_H, newGame, apply, batSide };
})();
if (typeof module !== 'undefined') module.exports = BB;
