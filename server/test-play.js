'use strict';
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const WebSocket = require('ws');
const { scryptSync } = require('node:crypto');
const salt='ab'.repeat(16), password='test-entry-fixture';
const passwordHash=salt+':'+scryptSync(password,salt,64).toString('hex');
(async () => {
  const child = spawn(process.execPath, ['server.js'], { cwd: __dirname,
    env: { ...process.env, PORT: '0', GAME_PASSWORD_HASH: passwordHash, ALLOWED_ORIGINS: 'https://yusuke11430-cyber.github.io' }, stdio: ['ignore','pipe','pipe'] });
  try {
    const port = await new Promise((resolve,reject) => {
      const timer = setTimeout(() => reject(Error('Server did not start')), 8000);
      child.once('error',e=>{clearTimeout(timer);reject(e)});
      child.stdout.on('data',data=>{const match=String(data).match(/port (\d+)/);if(match){clearTimeout(timer);resolve(Number(match[1]))}});
    });
    const url = `http://127.0.0.1:${port}`;
    let r = await fetch(url+'/'); assert.equal(r.status,200); assert.equal(await r.text(),'ok');
    r=await fetch(url+'/play');assert.equal(r.headers.get('referrer-policy'),'same-origin');let locked=await r.text();assert.match(locked,/入場パスワード/);assert.ok(!locked.includes('function makeWsLobby'));
    for(const method of ['GET','POST']) {r=await fetch(url+'/api/characters',{method});assert.equal(r.status,401);}
    r=await fetch(url+'/auth',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'password=wrong',redirect:'manual'});assert.equal(r.status,403);assert.equal(r.headers.get('set-cookie'),null);
    r=await fetch(url+'/auth',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password,room:'ABCD'}),redirect:'manual'});
    assert.equal(r.status,303);assert.equal(r.headers.get('location'),'/play#ABCD');
    const setCookie=r.headers.get('set-cookie');assert.match(setCookie,/HttpOnly/);assert.match(setCookie,/Secure/);assert.match(setCookie,/SameSite=Lax/);
    const cookie=setCookie.split(';')[0], headers={Cookie:cookie};
    r=await fetch(url+'/play',{headers:{Cookie:cookie.slice(0,-1)+(cookie.endsWith('a')?'b':'a')}});assert.match(await r.text(),/入場パスワード/);
    await new Promise((resolve,reject)=>{const ws=new WebSocket(`ws://127.0.0.1:${port}`,{origin:'https://super-baseball.onrender.com'});ws.on('open',()=>{ws.close();reject(Error('Unauthenticated WebSocket accepted'))});ws.on('error',e=>{try{assert.match(e.message,/401/);resolve()}catch(e){reject(e)}})});
    for (const route of ['/play','/play/?source=test']) {
      r = await fetch(url+route,{headers}); assert.equal(r.status,200); assert.match(r.headers.get('content-type'),/^text\/html/);
      const html=await r.text();assert.match(html,/<base href="https:\/\/yusuke11430-cyber.github.io\/BaseBall\/">/);
      assert.match(html,/<title>Super Hage BaseBall<\/title>/);assert.match(html,/function makeWsLobby/);
      assert.equal((html.match(/<base /g)||[]).length,1);
    }
    r=await fetch(url+'/play',{method:'HEAD',headers});assert.equal(r.status,200);assert.equal(await r.text(),'');
    r=await fetch(url+'/play',{method:'POST'});assert.equal(r.status,405);
    // 明示的なPages限定設定があっても、新しい同一サーバーの入口から対戦・共有保存を使える。
    const origin='https://super-baseball.onrender.com';
    r=await fetch(url+'/api/characters',{method:'OPTIONS',headers:{Origin:origin,Cookie:cookie}});
    assert.equal(r.status,204);assert.equal(r.headers.get('access-control-allow-origin'),origin);
    await new Promise((resolve,reject)=>{
      const ws=new WebSocket(`ws://127.0.0.1:${port}`,{origin,headers,handshakeTimeout:3000});
      ws.on('error',reject);ws.on('message',data=>{
        const m=JSON.parse(data);if(m.t==='hello')ws.send(JSON.stringify({t:'join',room:'direct-play-test',p:{seat:'home'}}));
        if(m.t==='joined'){ws.close();resolve()}
      });
    });
    await new Promise((resolve,reject)=>{
      const ws=new WebSocket(`ws://127.0.0.1:${port}`,{origin:'https://unrelated.example',headers,handshakeTimeout:3000});
      ws.on('open',()=>{ws.close();reject(Error('Unrelated origin accepted'))});
      ws.on('error',error=>{try{assert.match(error.message,/401/);resolve()}catch(e){reject(e)}});
    });
    for(let i=0;i<10;i++) {r=await fetch(url+'/auth',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'password=wrong',redirect:'manual'});assert.equal(r.status,403);}
    r=await fetch(url+'/auth',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({password}),redirect:'manual'});assert.equal(r.status,429);
    const {createAccess}=require('./access');assert.equal(createAccess({}).authorized({headers:{cookie}}),false);assert.equal(createAccess({GAME_PASSWORD_HASH:passwordHash}).authorized({headers:{cookie}}),false);
    console.log('Password entry: correct/incorrect password, tampering, restart invalidation, protected API/WebSocket, room-link preservation and brute-force limits passed');
    console.log('Direct game entry: HTML, asset base, health, HEAD, methods, same-origin API and WebSocket passed');
  } finally { child.kill(); }
})().catch(error=>{console.error(error);process.exitCode=1});
