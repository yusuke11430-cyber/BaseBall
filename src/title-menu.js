// タイトル画面の表示切替だけを担当。試合開始・接続処理は既存のボタンを使う。
let titleReturnFocus=null;
function closeTitlePanels(restoreFocus=true) {
  for(const id of ['#matchSetup','#titleSettings','#titleHelp'])show(id,false);
  $('#home').classList.remove('has-sheet');
  $('#home .title-menu').inert=false;$('#home .title-footer').inert=false;
  document.querySelectorAll('[data-title-panel]').forEach(b=>b.setAttribute('aria-expanded','false'));
  const previous=titleReturnFocus;titleReturnFocus=null;
  if(restoreFocus&&previous&&previous.isConnected)previous.focus();
}
function openTitlePanel(id,opener) {
  closeTitlePanels(false);titleReturnFocus=opener||document.activeElement;
  show(id,true);$('#home').classList.add('has-sheet');
  $('#home .title-menu').inert=true;$('#home .title-footer').inert=true;
  if(opener)opener.setAttribute('aria-expanded','true');
  const focus=$(id).querySelector('input,button');if(focus)focus.focus();
}
function openMatchSetup(mode,audible=true) {
  if(audible){audio();SFX.select();}
  $('#setupTitle').textContent=mode==='create'?'対戦部屋をつくる':mode==='join'?'部屋コードで入る':'CPUと練習';
  $('#matchSetup').dataset.mode=mode;
  show('#setupStatus',false);
  show('#inningsSetup',mode!=='join');show('#codeEntry',mode==='join');
  show('#brawlSetup',mode!=='join');show('#roomRulesNote',mode==='join');
  show('#createBtn',mode==='create');show('#joinBtn',mode==='join');show('#cpuBtn',mode==='practice');
  const id=mode==='create'?'#titleCreate':mode==='join'?'#titleJoin':'#titlePractice';
  openTitlePanel('#matchSetup',$(id));
  (mode==='join'?$('#codeIn'):$('#nick')).focus();
}
function setTitlePlayer() {
  for(const k in fielders){const p=fielders[k],[x,z]=p.userData.base;p.position.set(x,k==='p'?.25:0,z);}
  applyAvatar(batter,chosenAvatar,TEAM.away);batter.visible=true;catcher.visible=false;
  batter.position.set(camera.aspect<1?.15:1.1,0,0);batter.rotation.set(0,-.18,0);
  const u=batter.userData;u.handL.visible=u.handR.visible=true;
  u.handL.position.set(-.37,.8,.06);u.handR.position.set(.37,.8,.06);u.body.position.y=.78;
  batPivot.visible=batRunner.visible=false;runners.forEach(p=>p.visible=false);
}
for(const [id,mode] of [['titleCreate','create'],['titleJoin','join'],['titlePractice','practice']])$('#'+id).addEventListener('click',()=>openMatchSetup(mode));
$('#titleSettingsBtn').addEventListener('click',()=>{audio();SFX.select();openTitlePanel('#titleSettings',$('#titleSettingsBtn'));});
$('#titleHelpBtn').addEventListener('click',()=>{audio();SFX.select();openTitlePanel('#titleHelp',$('#titleHelpBtn'));});
for(const id of ['setupClose','settingsClose','helpClose'])$('#'+id).addEventListener('click',()=>closeTitlePanels());
$('#home').addEventListener('click',e=>{if(e.target===$('#home')&&$('#home').classList.contains('has-sheet'))closeTitlePanels();});
$('#home').addEventListener('keydown',e=>{
  if(e.defaultPrevented)return;
  const sheet=$('#home .title-sheet:not([hidden])');if(!sheet)return;
  if(e.key==='Escape'){e.preventDefault();closeTitlePanels();}
  if(e.key==='Tab'){
    const items=[...sheet.querySelectorAll('button,input')].filter(el=>!el.disabled&&el.offsetParent!==null),first=items[0],last=items[items.length-1];
    if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
  }
});
addEventListener('resize',()=>{if(C.phase==='lobby')setTitlePlayer();});
