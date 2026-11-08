'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const { randomUUID } = require('node:crypto');
const AVATAR = require('./avatar-schema');
const { createCharacterStore, characterHandler } = require('./character-store');
function fakeGitHub() {
  let data = null, sha = 0;
  const fake = { conflict: false, fail: false, calls: 0 };
  fake.fetch = async (url, options) => {
    fake.calls++; assert.ok(url.startsWith('https://api.github.com/repos/friends/characters/contents/characters.json'));
    if (fake.fail) return new Response('{}', { status: 503 });
    if (options.method === 'GET') return data ? Response.json({ encoding: 'base64', sha: String(sha), content: Buffer.from(JSON.stringify(data)).toString('base64') }) : new Response('{}', { status: 404 });
    const body = JSON.parse(options.body);
    if (fake.conflict) { fake.conflict = false; return new Response('{}', { status: 409 }); }
    if (data && body.sha !== String(sha)) return new Response('{}', { status: 409 });
    data = JSON.parse(Buffer.from(body.content, 'base64').toString()); sha++;
    return Response.json({ content: { sha: String(sha) } });
  };
  return fake;
}
const env = { CHARACTER_GITHUB_REPO: 'friends/characters', CHARACTER_GITHUB_TOKEN: 'test-fixture-only' };
async function run() {
  assert.equal(createCharacterStore({ env: {} }).configured, false);
  assert.equal(createCharacterStore({ env: { ...env, CHARACTER_GITHUB_REPO: 'yusuke11430-cyber/BaseBall' } }).configured, false);
  const github = fakeGitHub(), store = createCharacterStore({ env, fetchImpl: github.fetch });
  assert.equal((await store.read()).characters.length, 0);
  const a = { id: randomUUID(), appearance: { ...AVATAR.defaults, name: '共有太郎', hair: 29, eyes: 23 } };
  const b = { id: randomUUID(), appearance: { ...AVATAR.defaults, name: '共有花子', mouth: 23 } };
  github.conflict = true;
  await Promise.all([store.save(a), store.save(b)]);
  assert.equal((await store.read()).characters.length, 2);
  await store.save(a); assert.equal((await store.read()).characters.length, 2);
  await assert.rejects(store.save({ ...a, appearance: { ...a.appearance, name: '上書き' } }), /上書き/);
  await assert.rejects(store.save({ id: '../../file', appearance: {} }), /形式/);
  // Renderプロセスを作り直しても、共有データはGitHubから読み出せる。
  const restarted = createCharacterStore({ env, fetchImpl: github.fetch });
  const recovered = await restarted.read(); assert.equal(recovered.characters.length, 2);
  assert.equal(recovered.characters[0].appearance.name, '共有太郎');
  github.fail = true; await assert.rejects(store.read(true)); github.fail = false;
  const readOnly = createCharacterStore({ env: { CHARACTER_GITHUB_REPO: 'friends/characters' }, fetchImpl: github.fetch });
  assert.equal(readOnly.configured, false); assert.equal((await readOnly.read()).characters.length, 2);
  await assert.rejects(readOnly.save({ id: randomUUID(), appearance: AVATAR.defaults }), /設定/);
  const handler = characterHandler(restarted);
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/characters`;
    let response = await fetch(url, { headers: { Origin: 'https://yusuke11430-cyber.github.io' } });
    const list = await response.json(); assert.equal(list.shared, true); assert.equal(list.characters.length, 2);
    assert.ok(!JSON.stringify(list).includes(env.CHARACTER_GITHUB_TOKEN));
    response = await fetch(url, { headers: { Origin: 'https://unrelated.example' } }); assert.equal(response.status, 403);
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: '{}' }); assert.equal(response.status, 415);
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' }); assert.equal(response.status, 400);
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'x'.repeat(9000) }); assert.equal(response.status, 413);
    response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: randomUUID(), appearance: { ...AVATAR.defaults, name: '全員共通' } }) });
    assert.equal(response.status, 201); assert.equal((await response.json()).character.appearance.name, '全員共通');
    assert.equal((await restarted.read()).characters.length, 3);
  } finally { await new Promise(resolve => server.close(resolve)); }
  // パーツ数、境界、未知のフィールド、色を正規化。画像やゲーム能力は送らない。
  assert.equal(Object.values(AVATAR.catalogs).reduce((n,items)=>n+items.length,0), 122);
  const clean = AVATAR.clean({ hair: 999, eyes: -1, uniform: 'url(bad)', skin: '#AABBCC', speed: 9999, name: 'A\u0000B', number: '123' });
  assert.equal(clean.hair, 0); assert.equal(clean.eyes, 0); assert.equal(clean.skin, '#aabbcc'); assert.equal(clean.name, 'AB');
  assert.equal(clean.number, '7'); assert.ok(!('speed' in clean));
  console.log('Character storage: shared reads, concurrent saves, retries, restart persistence, API validation and 122 parts passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
