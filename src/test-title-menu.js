const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const nodes={},get=id=>nodes[id]||(nodes[id]={hidden:true,dataset:{},attrs:{},isConnected:true,setAttribute(k,v){this.attrs[k]=v;},focus(){document.activeElement=this;},querySelector(){return get('#nick');},classList:{values:new Set(),add(k){this.values.add(k);},remove(k){this.values.delete(k);}}});
const openers=['#titleCreate','#titleJoin','#titlePractice','#titleSettingsBtn','#titleHelpBtn'].map(get);
const document={activeElement:get('#titlePractice'),querySelectorAll(){return openers;}};
let sounds=0;
const ctx=vm.createContext({document,$:get,show:(id,on)=>{get(id).hidden=!on;},audio(){sounds++;},SFX:{select(){}}});
const source=fs.readFileSync(__dirname+'/title-menu.js','utf8');
vm.runInContext(source.slice(0,source.indexOf('for(const [id,mode]')),ctx);
for(const mode of ['create','join','practice']){
 ctx.openMatchSetup(mode);assert.equal(get('#matchSetup').hidden,false);assert.equal(get('#home').classList.values.has('has-sheet'),true);
 assert.equal(get('#createBtn').hidden,mode!=='create');assert.equal(get('#joinBtn').hidden,mode!=='join');assert.equal(get('#cpuBtn').hidden,mode!=='practice');
 assert.equal(get('#inningsSetup').hidden,mode==='join');assert.equal(get('#codeEntry').hidden,mode!=='join');
 assert.equal(get('#brawlSetup').hidden,mode==='join');assert.equal(get('#roomRulesNote').hidden,mode!=='join');
 assert.equal(get('#pitcherModelSetup').hidden,mode==='join');
 ctx.closeTitlePanels();assert.equal(get('#matchSetup').hidden,true);assert.equal(get('#home').classList.values.has('has-sheet'),false);
}
assert.equal(sounds,3);ctx.openMatchSetup('join',false);assert.equal(sounds,3);
ctx.openTitlePanel('#titleSettings',get('#titleSettingsBtn'));assert.equal(get('#matchSetup').hidden,true);assert.equal(get('#titleSettings').hidden,false);
ctx.closeTitlePanels();assert.equal(document.activeElement,get('#titleSettingsBtn'));
console.log('Title menu: separate modes, shared-link entry, settings, closing and focus restoration passed');
