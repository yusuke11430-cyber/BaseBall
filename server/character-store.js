'use strict';
const AVATAR = require('./avatar-schema');
const REPO = /^[\w.-]+\/[\w.-]+$/;
const ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
// 永続データはGitHubへ。Renderのメモリやローカルファイルを保存先にしない。
function createCharacterStore({ env = process.env, fetchImpl = fetch } = {}) {
  const repo = env.CHARACTER_GITHUB_REPO || 'yusuke11430-cyber/BaseBall', token = env.CHARACTER_GITHUB_TOKEN || '';
  const branch = env.CHARACTER_GITHUB_BRANCH || (env.CHARACTER_GITHUB_REPO ? 'main' : 'character-data');
  const readable = REPO.test(repo) && !(repo.toLowerCase() === 'yusuke11430-cyber/baseball' && branch === 'main');
  const configured = readable && !!token;
  let cached = null, cachedAt = 0, queue = Promise.resolve(), pending = 0;
  async function request(method, body) {
    const response = await fetchImpl(`https://api.github.com/repos/${repo}/contents/characters.json${method === 'GET' ? '?ref=' + encodeURIComponent(branch) : ''}`, {
      method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), Accept: 'application/vnd.github+json', 'Content-Type': 'application/json', 'User-Agent': 'Super-Hage-BaseBall' },
      body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000)
    });
    return response;
  }
  async function read(fresh = false) {
    if (!readable) throw Object.assign(new Error('共有保存の接続先を確認してください'), { status: 503 });
    if (!fresh && cached && Date.now() - cachedAt < (configured ? 15000 : 300000)) return cached;
    const response = await request('GET');
    if (response.status === 404) { cached = { characters: [], sha: null }; cachedAt = Date.now(); return cached; }
    if (!response.ok) throw new Error('GitHubへの接続に失敗しました');
    const file = await response.json();
    if (file.encoding !== 'base64' || typeof file.content !== 'string') throw new Error('保存形式を確認してください');
    const data = JSON.parse(Buffer.from(file.content, 'base64').toString('utf8'));
    if (!Array.isArray(data.characters)) throw new Error('共有データの形式を確認してください');
    cached = { sha: file.sha, characters: data.characters.filter(c => ID.test(c.id)).map(c => ({ id: c.id, appearance: AVATAR.clean(c.appearance), createdAt: String(c.createdAt || '').slice(0,30) })) };
    cachedAt = Date.now(); return cached;
  }
  async function append(value) {
    if (!configured) throw Object.assign(new Error('共有保存はまだ設定されていません'), { status: 503 });
    if (!value || !ID.test(value.id) || !value.appearance || typeof value.appearance !== 'object') throw Object.assign(new Error('キャラの形式を確認してください'), { status: 400 });
    const character = { id: value.id, appearance: AVATAR.clean(value.appearance), createdAt: new Date().toISOString() };
    for (let attempt = 0; attempt < 3; attempt++) {
      const data = await read(true), existing = data.characters.find(c => c.id === character.id);
      if (existing) {
        if (JSON.stringify(existing.appearance) !== JSON.stringify(character.appearance)) throw Object.assign(new Error('保存済みのキャラは上書きできません。新しいキャラとして保存してください'), { status: 409 });
        return existing; // 通信の再試行で同じキャラを重複作成しない。
      }
      if (data.characters.length >= 1000) throw Object.assign(new Error('共有キャラの保存上限です'), { status: 409 });
      const characters = [...data.characters, character];
      const response = await request('PUT', { message: 'Save shared baseball character', branch, sha: data.sha || undefined,
        content: Buffer.from(JSON.stringify({ version: 1, characters }, null, 2) + '\n').toString('base64') });
      if ([409,422].includes(response.status)) continue;
      if (!response.ok) throw new Error('GitHubへの保存に失敗しました');
      const saved = await response.json(); cached = { characters, sha: saved.content.sha }; cachedAt = Date.now(); return character;
    }
    throw Object.assign(new Error('ほかの保存と重なりました。もう一度お試しください'), { status: 409 });
  }
  function save(value) {
    if (pending >= 8) return Promise.reject(Object.assign(new Error('保存が混み合っています'), { status: 429 }));
    pending++;
    const result = queue.catch(() => {}).then(() => append(value));
    queue = result; return result.finally(() => { pending--; });
  }
  return { configured, readable, read, save };
}
function characterHandler(store, allowed = []) {
  let windowStart = 0, writes = 0;
  const defaultOrigins = ['https://yusuke11430-cyber.github.io', 'https://super-baseball.onrender.com', 'http://127.0.0.1:8765', 'http://localhost:8765'];
  return async (req, res) => {
    const origin = req.headers.origin, origins = allowed.length ? allowed : defaultOrigins;
    const send = (code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin',
      ...(origin && origins.includes(origin) ? { 'Access-Control-Allow-Origin': origin } : {}) }); res.end(JSON.stringify(data)); };
    if (origin && !origins.includes(origin)) return send(403, { error: 'このページからは保存できません' });
    if (req.method === 'OPTIONS') { res.writeHead(204, { 'Access-Control-Allow-Origin': origin || origins[0], 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }); res.end(); return; }
    if (!['GET','POST'].includes(req.method)) return send(405, { error: '対応していない操作です' });
    if (req.method === 'POST' && !store.configured) return send(503, { error: '共有保存は準備中です。この端末には保存できます', shared: false });
    try {
      if (req.method === 'GET') return send(200, { shared: true, writable: store.configured, characters: (await store.read()).characters });
      if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return send(415, { error: 'JSON形式で送ってください' });
      if (Date.now() - windowStart > 60000) { windowStart = Date.now(); writes = 0; }
      if (++writes > 30) return send(429, { error: '少し待ってから保存してください' });
      const chunks = []; let size = 0;
      for await (const chunk of req) { size += chunk.length; if (size > 8192) return send(413, { error: 'キャラのデータが大きすぎます' }); chunks.push(chunk); }
      let parsed; try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return send(400, { error: 'キャラの形式を確認してください' }); }
      return send(201, { shared: true, character: await store.save(parsed) });
    } catch (error) { return send(error.status || 503, { error: error.status ? error.message : '共有保存に接続できません。端末のデータは残っています' }); }
  };
}
module.exports = { createCharacterStore, characterHandler };
