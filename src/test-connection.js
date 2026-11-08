const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const main=fs.readFileSync(__dirname+'/main.js','utf8');
const code=main.slice(main.indexOf('function makeWsLobby(url) {'),main.indexOf('const SERVER_URL ='));
function fixture(){
 let clock=0,id=0;const timers=new Map(),sockets=[];
 class Socket{
  constructor(){this.readyState=0;this.sent=[];sockets.push(this)}
  send(s){this.sent.push(JSON.parse(s))}
  close(){this.readyState=3;if(this.onclose)this.onclose()}
  open(){this.readyState=1;this.onopen()}
  message(m){this.onmessage({data:JSON.stringify(m)})}
 }
 const ctx=vm.createContext({WebSocket:Socket,Map,Set,Object,JSON,Date,console,Error,
  fetch:()=>Promise.resolve(),setTimeout:(fn,delay)=>{timers.set(++id,{at:clock+delay,fn});return id},
  clearTimeout:n=>timers.delete(n),setInterval:()=>0,clearInterval(){}});
 vm.runInContext(code+';this.lobby=makeWsLobby("wss://test");',ctx);
 const advance=ms=>{const end=clock+ms;while(true){const e=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!e||e[1].at>end)break;clock=e[1].at;timers.delete(e[0]);e[1].fn()}clock=end};
 return {lobby:ctx.lobby,sockets,advance};
}
(async()=>{
 // CONNECTINGのままのソケットは20秒で破棄し、同じ部屋コードで再接続する。
 const a=fixture();a.lobby.warm();const joined=a.lobby.join('marutto-advh');
 a.advance(20000);assert.equal(a.sockets[0].readyState,3);a.advance(1500);assert.equal(a.sockets.length,2);
 a.sockets[1].open();assert.equal(a.sockets[1].sent[0].room,'marutto-advh');
 a.sockets[1].message({t:'joined',id:'me'});const room=await joined;
 await room.presence({seat:'home',gs:{n:3}});
 // 通信切断後は最新の自分のpresenceを添えて部屋へ戻る。
 a.sockets[1].close();a.advance(1500);a.sockets[2].open();
 assert.equal(a.sockets[2].sent[0].p.seat,'home');assert.equal(a.sockets[2].sent[0].p.gs.n,3);
 a.sockets[2].message({t:'joined',id:'new'});
 // 古いソケットのイベントは新しい接続を壊さない。
 a.sockets[0].onclose();assert.equal(room.connected(),true);
 // サーバーの入室応答が来ない場合も再試行し、90秒で必ず失敗を通知。
 const b=fixture();let result;const pending=b.lobby.join('marutto-fail').catch(e=>{result=e.message});
 b.sockets[0].open();b.advance(12000);assert.equal(b.sockets[0].readyState,3);
 b.advance(78000);await pending;assert.equal(result,'timeout');
 const count=b.sockets.length;b.advance(100000);assert.equal(b.sockets.length,count);
 // キャンセル後に遅れて接続しても部屋へ入らず、タイムアウトを残さない。
 const c=fixture();const cancelled=c.lobby.join('marutto-cancel').catch(e=>e.message);
 c.lobby.cancelJoin();assert.equal(await cancelled,'cancelled');c.sockets[0].open();
 assert.equal(c.sockets[0].sent.filter(m=>m.t==='join').length,0);
 c.advance(100000);assert.equal(c.sockets.length,1);
 // 満員エラーは再試行ループに入れない。
 const d=fixture();const full=d.lobby.join('marutto-full').catch(e=>e.message);
 d.sockets[0].open();d.sockets[0].message({t:'error',code:'full'});assert.equal(await full,'full');
 d.sockets[0].close();d.advance(100000);assert.equal(d.sockets.length,1);
 console.log('Connection: stalled handshake, missing join ack, reconnect presence, timeout, cancellation and full room passed');
})().catch(e=>{console.error(e);process.exitCode=1});
