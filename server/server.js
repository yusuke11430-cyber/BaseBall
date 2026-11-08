// まるっと野球：オンライン対戦の中継サーバー
// 仕組み：部屋（4文字コード）ごとに、各プレイヤーの「状態」（投球データ・打撃結果・試合状況など）を
// 同じ部屋の相手にそのまま中継するだけ。判定はすべて各プレイヤーの画面側で行う。
'use strict';
const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 8080;
// 接続を許すページの場所（カンマ区切り）。空ならどこからでも可
const ALLOWED = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const ROOM_MAX = 8;            // 1部屋の最大人数（2人＋観戦）
const STATE_MAX = 8 * 1024;    // 1人の状態データの上限（バイト）
const MSG_PER_SEC = 60;        // 1人あたり1秒間に受け付けるメッセージ数

const rooms = new Map();       // 部屋名 -> Set(ws)
let seq = 1;

const server = http.createServer((req, res) => {
  // 起動確認用（ゲームのロビーがここを呼んで、休止中のサーバーを起こす）
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8', 'access-control-allow-origin': '*', 'cache-control': 'no-store' });
  res.end('ok');
});

const wss = new WebSocketServer({
  server, maxPayload: 16 * 1024,
  verifyClient: ({ origin }) => !ALLOWED.length || ALLOWED.includes(origin),
});

const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const list = room => [...room].map(w => ({ id: w.id, p: w.p }));
function broadcastList(room) { const l = list(room); for (const w of room) send(w, { t: 'peers', list: l }); }

function leave(ws) {
  const room = ws.room && rooms.get(ws.room);
  ws.room = null;
  if (!room) return;
  room.delete(ws);
  if (room.size === 0) rooms.delete(ws.roomName);
  else broadcastList(room);
}

wss.on('connection', ws => {
  ws.id = (seq++).toString(36) + Math.random().toString(36).slice(2, 7);
  ws.room = null; ws.p = {}; ws.alive = true; ws.count = 0; ws.since = Date.now();
  send(ws, { t: 'hello', id: ws.id });
  ws.on('pong', () => { ws.alive = true; });

  ws.on('message', raw => {
    // 送りすぎを防ぐ
    const now = Date.now();
    if (now - ws.since > 1000) { ws.since = now; ws.count = 0; }
    if (++ws.count > MSG_PER_SEC) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!m || typeof m !== 'object') return;

    if (m.t === 'join') {
      const name = String(m.room || '');
      if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) return send(ws, { t: 'error', code: 'bad_room' });
      leave(ws);
      let room = rooms.get(name);
      if (!room) { room = new Set(); rooms.set(name, room); }
      if (room.size >= ROOM_MAX) return send(ws, { t: 'error', code: 'full' });
      ws.p = (m.p && typeof m.p === 'object' && JSON.stringify(m.p).length <= STATE_MAX) ? m.p : {};
      ws.room = name; ws.roomName = name; room.add(ws);
      send(ws, { t: 'joined', id: ws.id });
      broadcastList(room);
    } else if (m.t === 'p') {
      const room = ws.room && rooms.get(ws.room);
      if (!room || !m.patch || typeof m.patch !== 'object') return;
      const next = { ...ws.p };
      for (const k of Object.keys(m.patch)) { if (m.patch[k] === null) delete next[k]; else next[k] = m.patch[k]; }
      if (JSON.stringify(next).length > STATE_MAX) return send(ws, { t: 'error', code: 'too_big' });
      ws.p = next;
      for (const w of room) send(w, { t: 'up', id: ws.id, patch: m.patch });
    } else if (m.t === 'leave') {
      leave(ws);
    }
    // 'hb'（生存確認）は受け取るだけ
  });

  ws.on('close', () => leave(ws));
  ws.on('error', () => { });
});

// 切れた接続の掃除
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.alive) { ws.terminate(); continue; }
    ws.alive = false; try { ws.ping(); } catch (e) { }
  }
}, 25000);

server.listen(PORT, () => console.log(`まるっと野球サーバー起動: port ${PORT}`));
