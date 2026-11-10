'use strict';
const { randomBytes, scrypt: derive, createHmac, timingSafeEqual } = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(derive);
const TTL = 12 * 60 * 60 * 1000;
function createAccess(env = process.env) {
  const hash = env.GAME_PASSWORD_HASH || '';
  const configured = /^[a-f0-9]{32}:[a-f0-9]{128}$/.test(hash);
  const key = randomBytes(32), attempts = new Map();
  let active = 0, globalStart = 0, globalCount = 0;
  const sign = value => createHmac('sha256', key).update(value).digest('hex');
  function authorized(req) {
    if (!configured) return false;
    const cookie = /(?:^|;\s*)shb_access=([^;]*)/.exec(req.headers.cookie || '');
    if (!cookie) return false;
    const [expiry, nonce, mac, extra] = cookie[1].split('.');
    if (extra || !/^\d{13}$/.test(expiry || '') || !/^[a-f0-9]{32}$/.test(nonce || '') || !/^[a-f0-9]{64}$/.test(mac || '')) return false;
    const time = Number(expiry), now = Date.now();
    return time > now && time <= now + TTL && timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(sign(expiry + '.' + nonce), 'hex'));
  }
  function locked(res, status = 401) {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ error: 'ゲームの入口でパスワードを入力してください' }));
  }
  async function login(req, res) {
    const finish = (code, text) => { res.writeHead(code, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'Retry-After': '600' }); res.end(text); };
    if (req.method !== 'POST') return finish(405, 'POSTのみ対応しています');
    if (!configured) return finish(503, '入場の設定を準備しています');
    // 通常の同一オリジンのフォームだけを受け付ける。転送先を入力から作らない。
    if (req.headers.origin && req.headers.origin !== 'https://super-baseball.onrender.com' && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(req.headers.origin)) return finish(403, 'ゲームの入口から入力してください');
    if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers['content-type'] || '')) return finish(415, 'フォームから入力してください');
    const now = Date.now();
    for (const [ip, item] of attempts) if (now - item.start > 600000) attempts.delete(ip);
    // Renderの信頼された転送ヘッダーの右端を使用。クライアント任意の左端は信用しない。
    const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress).split(',').pop().trim();
    const item = attempts.get(ip) || { start: now, count: 0 };
    if (now - globalStart > 60000) { globalStart = now; globalCount = 0; }
    if (item.count >= 10 || globalCount >= 100 || active >= 2 || attempts.size >= 10000 && !attempts.has(ip)) return finish(429, '入力回数が多いため、しばらく待ってから入口を開き直してください');
    item.count++; attempts.set(ip, item); globalCount++;
    const chunks = []; let size = 0;
    try {
      for await (const chunk of req) { size += chunk.length; if (size > 512) return finish(413, '入力が長すぎます'); chunks.push(chunk); }
      const form = new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
      const password = form.get('password') || '';
      if (password.length > 128) return finish(403, 'パスワードが違います。戻って入力し直してください');
      active++;
      let actual;
      try { actual = await scrypt(password, hash.split(':')[0], 64); } finally { active--; }
      if (!timingSafeEqual(actual, Buffer.from(hash.split(':')[1], 'hex'))) return finish(403, 'パスワードが違います。戻って入力し直してください');
      attempts.delete(ip);
      const payload = String(Date.now() + TTL) + '.' + randomBytes(16).toString('hex');
      const room = form.get('room') || '';
      res.writeHead(303, { Location: '/play' + (/^[A-Z0-9]{4}$/.test(room) ? '#' + room : ''), 'Cache-Control': 'no-store',
        'Set-Cookie': `shb_access=${payload}.${sign(payload)}; Path=/; Max-Age=${TTL / 1000}; HttpOnly; Secure; SameSite=Lax` });
      res.end();
    } catch { if (!res.headersSent) finish(400, '入力を確認してください'); }
  }
  return { authorized, locked, login };
}
module.exports = { createAccess };
