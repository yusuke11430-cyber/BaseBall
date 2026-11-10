const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const BB = require('./logic.js');

const pi = BB.makePitch(1, 'st', 0, 0.8, 1, 146, 100, 4);
const at = BB.pitchPos(pi, 1), initial = BB.newGame(3, 'regression');
// 再現例：正面への強いゴロを、下向き角度だけでファウルにしない。
const grounder = BB.judge(pi, { x: at.x, y: at.y + 0.071 }, 0, initial, 1);
assert.equal(grounder.kind, 'inplay');
assert.ok(grounder.la < -12 && Math.abs(grounder.phi) < 45);
const buntGrounder = BB.judgeBunt(pi, { x: at.x, y: at.y + 0.071 }, initial, 1);
assert.equal(buntGrounder.kind, 'inplay');
assert.ok(buntGrounder.la < -20);
for (let seed = 1; seed <= 100; seed++) for (const lh of [false, true]) {
  for (const dy of [-0.071, 0, 0.071]) for (const dt of [-0.09, 0, 0.09]) {
    const outcome = BB.judge(pi, { x: at.x, y: at.y + dy }, dt, initial, seed, { lh });
    assert.equal(outcome.kind, Math.abs(outcome.phi) > 45 ? 'foul' : 'inplay');
  }
  for (const dx of [-0.34, 0, 0.34]) for (const dy of [-0.071, 0, 0.071]) {
    const outcome = BB.judgeBunt(pi, { x: at.x + dx, y: at.y + dy }, initial, seed, { lh });
    assert.equal(outcome.kind, Math.abs(outcome.phi) > 45 ? 'foul' : 'inplay');
  }
}
// 同じ打席の3回目のバントファウルは、アウトにしてカウントを戻す。
let gs = initial;
const foul = { kind: 'foul', bunt: true, seed: 1, phi: 60, la: 20, ev: 60 };
for (let n = 1; n <= 3; n++) gs = BB.apply(gs, { ...foul, n });
assert.equal(gs.outs, 1); assert.equal(gs.s, 0); assert.equal(gs.b, 0);
assert.equal(gs.msg, 'スリーバント失敗');
const twoStrikes = { ...initial, s: 2 };
assert.equal(BB.apply(twoStrikes, { ...foul, bunt: false, n: 1 }).outs, 0);
assert.equal(BB.apply(twoStrikes, { kind: 'whiff', bunt: true, seed: 1, n: 1 }).outs, 1);
const lastOut = BB.apply({ ...twoStrikes, outs: 2 }, { ...foul, n: 1 });
assert.equal(lastOut.top, false); assert.equal(lastOut.outs, 0);
assert.ok(lastOut.msg.includes('スリーバント失敗'));
// 両クライアントで同じ状態になる。
assert.deepEqual(BB.apply(JSON.parse(JSON.stringify(twoStrikes)), { ...foul, n: 1 }, pi),
  BB.apply(twoStrikes, { ...foul, n: 1 }, pi));

// UIの実際のresolveを実行し、通常のファウル演出でなくアウトとして進むことを確認。
const main = fs.readFileSync(__dirname + '/main.js', 'utf8');
// 予測円はリリース後10%未満では非表示、10%から表示。打者の前後移動も反映する。
const pitchStart = main.indexOf('function updatePitch(t) {');
const markerStart = main.indexOf('  const s = (e - C.W) / C.dur;', pitchStart);
const markerEnd = main.indexOf('  if (e < C.W)', markerStart);
const markerCode = main.slice(markerStart, markerEnd);
for (const dz of [-0.9, 0, 0.6]) for (const progress of [-1, 0, 0.09, 0.1, 0.11, 0.5, 0.9, 1]) {
  const contact = BB.contactS(dz), marker = { visible: false, position: { set() {} }, scale: { set() {} } };
  vm.runInNewContext(markerCode, { BB, C: { W: 0, dur: 1, phase: 'pitching', out: null, pi }, ST: { dz },
    e: contact * progress, role: () => 'bat', guess: marker });
  assert.equal(marker.visible, progress >= 0.1);
}
const resolve = main.slice(main.indexOf('function resolve() {'), main.indexOf('\nfunction finishPitch('));
for (const outs of [0, 2]) {
  const messages = [], calls = [], C = { resolved: false, gs: { ...twoStrikes, outs }, pi,
    out: { ...foul, n: 1 }, phase: 'pitching' };
  let advanced;
  const context = { BB, C, guess: { visible: true }, SFX: { hit() {} }, $: () => ({}),
    banner: text => messages.push(text), call: text => messages.push(text), call2: key => calls.push(key),
    contactFeedback() {}, finishPitch: state => { advanced = state; }, startPlay: () => { throw Error('Bunt strikeout shown as ordinary foul'); } };
  vm.runInNewContext(resolve + '\nresolve();', context);
  assert.ok(messages.includes('スリーバント失敗')); assert.deepEqual(calls, ['k']);
  assert.equal(C.phase, 'call'); assert.equal(advanced.top, outs === 2 ? false : true);
  assert.equal(advanced.outs, outs === 2 ? 0 : 1);
}
// ナックルだけ消費を倍増し、HUD表示・球生成・実際の減算で同じ値を使う。
const knuckle = BB.makePitch(1, 'kn', 0, 0.8, 42, 108, 100, 4);
assert.equal(BB.staminaCost(108, 'kn', 4), 2.43);
assert.equal(BB.staminaCost(100, 'kn', 1), 1.6);
assert.equal(BB.staminaCost(146, 'st', 4), 1.65);
assert.equal(knuckle.cost, 2.43);
assert.equal(BB.apply(initial, { kind: 'ball', n: 1, seed: 1 }, knuckle).sta.home, 97.57);
assert.ok(BB.makePitch(1, 'kn', 0, 0.8, 42, 108, 2, 4).short);
// 上下両方の守備終了で、消費分の30%だけ回復。0/100の端も確認する。
for (const top of [true, false]) for (const stamina of [0, 40, 100]) {
  const side = top ? 'home' : 'away', other = top ? 'away' : 'home';
  const state = { ...initial, top, outs: 2, s: 2, sta: { home: 77, away: 77 } };
  state.sta[side] = stamina;
  const next = BB.apply(state, { kind: 'strike', n: 1, seed: 1 });
  assert.equal(next.sta[side], +(stamina + (100 - stamina) * 0.3).toFixed(2));
  assert.equal(next.sta[other], 77);
}
console.log('Foul/bunt UI and rule checks, knuckle cost and 30% recovery: passed');
