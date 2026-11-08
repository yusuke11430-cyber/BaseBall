// 見た目だけの設定。ゲーム判定や体の当たり判定には影響しない。
const AVATAR = (() => {
  const hair = ['つるつる','坊主','五分刈り','七三・左','七三・右','センター分け','まっすぐ前髪','ギザギザ前髪','短いツンツン','長いツンツン','モヒカン','細いモヒカン','おかっぱ','マッシュ','横流し・左','横流し・右','M字','大きなM字','くるくる','ゆるいウェーブ','逆立ち','三本ヘア','一本ヘア','前だけヘア','サイドヘア','ハート前髪','V字前髪','ふわふわ','ギザギザ分け','つるつる・生え際'];
  const eyes = ['まんまる','ぱっちり','大きな丸','小さな丸','たて長','大きなたて長','小さなたて長','ほそいたて長','横長','大きな横長','小さな横長','ほそい横長','にっこり','大きなにっこり','細いにっこり','やさしい笑顔','きりっと','大きなきりっと','小さなきりっと','細いきりっと','ねむそう','大きなねむそう','小さなねむそう','ほそめ'];
  const brows = ['なし','まっすぐ','太いまっすぐ','短いまっすぐ','長いまっすぐ','つり眉','太いつり眉','短いつり眉','長いつり眉','たれ眉','太いたれ眉','短いたれ眉','長いたれ眉','アーチ','太いアーチ','短いアーチ','長いアーチ','まろ眉','太いまろ眉','小さなまろ眉'];
  const mouths = ['にっこり','大きなにっこり','小さなにっこり','ほほえみ','まっすぐ','太いまっすぐ','小さなまっすぐ','長いまっすぐ','おおぐち','大きなおおぐち','小さなおおぐち','おちょぼ','への字','大きなへの字','小さなへの字','なやみ顔','歯を見せる','大きな歯','小さな歯','にやり','びっくり','大きなびっくり','小さなびっくり','ちいさな丸'];
  const catalogs = { hair, eyes, brows, mouth: mouths,
    paint: ['なし','ほっぺ','そばかす','ひげ','ちょびひげ','あごひげ','目の下ライン','ほし','きず','しましま','ねこのひげ','はな赤'],
    pattern: ['無地','ピンストライプ','太いストライプ','横しま','肩ライン','ツートーン','チェック','センターライン'],
    hat: ['帽子なし','ふつうにかぶる','後ろ向き','サンバイザー'] };
  const defaults = { name: 'HAGE', number: '7', hair: 0, eyes: 0, brows: 1, mouth: 0, paint: 0, pattern: 0, hat: 0,
    skin: '#f3c9a1', hairColor: '#30251e', eyeColor: '#24262e', uniform: '#e4572e', hatColor: '#b8361a', accent: '#fff6df' };
  const colors = ['#f3c9a1','#ffe0bd','#d9a079','#ad7650','#754b35','#442c22','#30251e','#111827','#ffffff','#e9edf2','#e4572e','#ef8b3a','#ffce47','#72b85a','#279b89','#2e86de','#2355a4','#7354a8','#e981ac','#7d3e50','#afb7c5','#344d5c','#c9a56b','#694125'];
  function clean(value) {
    const a = value && typeof value === 'object' ? value : {}, out = { ...defaults };
    out.name = String(a.name || defaults.name).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 10) || defaults.name;
    out.number = /^\d{1,2}$/.test(String(a.number)) ? String(a.number) : defaults.number;
    for (const [key, list] of Object.entries(catalogs)) out[key] = Number.isInteger(a[key]) && a[key] >= 0 && a[key] < list.length ? a[key] : defaults[key];
    for (const key of ['skin','hairColor','eyeColor','uniform','hatColor','accent']) if (/^#[0-9a-f]{6}$/i.test(a[key])) out[key] = a[key].toLowerCase();
    return out;
  }
  function paintHead(g, w, h, value) {
    const a = clean(value); g.clearRect(0,0,w,h); g.fillStyle = a.skin; g.fillRect(0,0,w,h);
    // 球のUV全体で髪の範囲を変える。細い髪型まで共通のヘアキャップで覆わない。
    const n = a.hair;
    g.fillStyle = a.hairColor;
    if ([10,11].includes(n)) {
      const band = n === 10 ? .065 : .025;
      for (const u of [.25,.75]) g.fillRect(w*(u-band),0,w*band*2,h*.38);
    } else if (n === 24 || n === 29) {
      // 頭頂部を残し、左右から後頭部にだけ毛を生やす。
      g.fillRect(w*.48,h*.29,w*.54,h*(n===24?.27:.13));
      g.fillRect(0,h*.29,w*.06,h*(n===24?.27:.13));
      g.fillRect(w*.44,h*.29,w*.06,h*(n===24?.27:.13));
    } else if (n && ![21,22,23].includes(n)) {
      const depth = n===1 ? .22 : n===2 ? .27 : n===12 ? .56 : n===13 ? .43 : n===17 ? .23 : .32;
      g.fillRect(0,0,w,h*depth);
    }
    g.save(); g.translate(w * 0.25, h * 0.52); g.scale(w * 0.23, h * 0.42);
    const line = (points, color, width = 0.035) => { g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.beginPath(); points.forEach(([x,y],i)=>i?g.lineTo(x,y):g.moveTo(x,y)); g.stroke(); };
    const ellipse = (x,y,rx,ry,color) => { g.fillStyle=color; g.beginPath(); g.ellipse(x,y,rx,ry,0,0,Math.PI*2); g.fill(); };
    if (a.hair) {
      // 共通の後頭部の塗りを前面から消してから、専用の生え際を描く。
      g.fillStyle = a.skin; g.fillRect(-1.1,-1.3,2.2,2.5);
      g.fillStyle = a.hairColor;
      if ([21,22,23].includes(n)) {
        for(let i=0;i<(n===21?3:n===22?1:5);i++) line([[i*.19-(n===22?0:.2),-.64],[i*.2-(n===22?.1:.28),-1.04],[i*.2+(n===22?.16:-.08),-1.2]],a.hairColor,n===23?.13:.065);
      } else if (n===24) {
        g.fillRect(-1.1,-.55,.35,.95); g.fillRect(.75,-.55,.35,.95);
      } else if (n===10 || n===11) {
        const half=n===10?.29:.11;
        g.fillRect(-half,-1.3,half*2,1.04);
        line([[-half,-.65],[0,-.3],[half,-.65]],a.hairColor,.08);
      } else if (n===29) {
        g.fillRect(-1.1,-.55,.22,.3); g.fillRect(.88,-.55,.22,.3);
      } else {
        const count = [1,2].includes(n)?24:48;
        g.beginPath(); g.moveTo(-1.1,-1.3); g.lineTo(1.1,-1.3); g.lineTo(1.1,-.72);
        for(let i=0;i<=count;i++) {
          const x=1.1-i*2.2/count; let y=-.7;
          if(n===1||n===2) y=n===1?-.61:-.47;
          else if(n===3||n===4) y=-.55+(n===3?-x:x)*.34;
          else if(n===14||n===15) y=-.31+(n===14?-x:x)*.53;
          else if(n===5) y=-.92+.68*Math.min(1,Math.abs(x)*2.2);
          else if(n===16||n===17) y=-.31-(n===17?.83:.5)*Math.sin(Math.min(1,Math.abs(x))*Math.PI);
          else if(n===25) y=-.75+.52*Math.pow(Math.sin(x*Math.PI),2);
          else if(n===26) y=-.92+.67*(1-Math.min(1,Math.abs(x)));
          else if(n===6) y=-.31;
          else if(n===7) y=-.58+.32*(1-Math.abs(((x+1.1)*4)%2-1));
          else if(n===8) y=-.67+.24*Math.max(0,Math.cos(x*18));
          else if(n===9) y=-.56+.46*Math.max(0,Math.cos(x*11));
          else if(n===12) y=Math.abs(x)>.65?.4:-.3;
          else if(n===13) y=-.04-.55*Math.pow(Math.abs(x),2);
          else if(n===18) y=-.3+.15*Math.cos(x*25);
          else if(n===19) y=-.45+.2*Math.sin(x*7);
          else if(n===20) y=-.86+.24*Math.max(0,Math.cos(x*17));
          else if(n===27) y=-.21+.1*Math.cos(x*16);
          else if(n===28) y=-.7+.38*(1-Math.abs(((x+1.1)*2)%2-1));
          g.lineTo(x,y);
        }
        g.closePath(); g.globalAlpha=n===1?.55:1; g.fill(); g.globalAlpha=1;
        // 分け目と毛束も太めに描き、小さな試合キャラでも読めるようにする。
        if([3,4,5,14,15,28].includes(n)) {
          const part=n===5?0:([3,14].includes(n)?.42:-.42);
          line([[part*.5,-1.22],[part,-.95],[part,-.65]],a.skin,.07);
        }
        if(n===1||n===2) for(let i=0;i<180;i++) ellipse(Math.sin(i*7.1)*1.04,-1.21+(i%15)*.04,.017,n===1?.019:.03,a.skin);
        if([18,19,27].includes(n)) for(let i=0;i<9;i++) {
          const x=-.88+i*.22; line([[x,-.92],[x-.06,-.73],[x+.04,-.58]],a.skin,.025);
        }
      }
    }
    const eyeType=Math.floor(a.eyes/4), eyeSize=[1,1.25,.78,.62][a.eyes%4];
    for(const side of [-1,1]) {
      const x=side*.31,y=-.03, rx=.07*eyeSize,ry=.12*eyeSize;
      if(eyeType<=2) {
        ellipse(x,y,eyeType===2?ry:rx,eyeType===2?rx:eyeType===1?ry*1.3:ry,a.eyeColor);
        if(a.eyes%4===1) ellipse(x-.016,y-.04,.018,.024,'#ffffff');
      } else if(eyeType===3) line([[x-rx,y+.02],[x,y-.07],[x+rx,y+.02]],a.eyeColor,.035);
      else if(eyeType===4) line([[x-rx,y-side*.04],[x+rx,y+side*.04]],a.eyeColor,.05*eyeSize);
      else line([[x-rx,y],[x+rx,y]],a.eyeColor,.03*eyeSize);
      if(a.brows) {
        const type=Math.floor((a.brows-1)/4), v=(a.brows-1)%4, len=[.12,.14,.085,.18][v], yy=-.32;
        if(type===4) ellipse(x,yy,len*.6,.045,a.hairColor);
        else if(type===3) line([[x-len,yy+.04],[x,yy-.03],[x+len,yy+.04]],a.hairColor,v===1?.065:.035);
        else { const slope=type===1?-.35*side:type===2?.35*side:0; line([[x-len,yy-slope],[x+len,yy+slope]],a.hairColor,v===1?.07:.035); }
      }
    }
    const mt=Math.floor(a.mouth/4), ms=[1,1.3,.7,.45][a.mouth%4], y=.4;
    if(mt===0) line([[-.16*ms,y],[0,y+.07*ms],[.16*ms,y]],'#753d36',.035);
    else if(mt===1) line([[-.16*ms,y],[.16*ms,y]],'#753d36',.04);
    else if(mt===2||mt===5) ellipse(0,y,.12*ms,(mt===5?.14:.09)*ms,'#753d36');
    else if(mt===3) line([[-.16*ms,y+.05],[0,y-.035],[.16*ms,y+.05]],'#753d36',.035);
    else { ellipse(0,y,.19*ms,.095*ms,'#753d36'); g.fillStyle='#fff9ef'; g.fillRect(-.15*ms,y-.07*ms,.3*ms,.055*ms); }
    if(a.paint===1) for(const x of [-.55,.55]) ellipse(x,.22,.13,.07,'#e9958a');
    if(a.paint===2) for(const side of [-1,1]) for(let i=0;i<5;i++) ellipse(side*(.45+(i%3)*.06),.17+Math.floor(i/3)*.08,.015,.02,'#9c654f');
    if(a.paint===3||a.paint===4) { line([[-.27,.3],[0,.23],[.27,.3]],a.hairColor,a.paint===3?.11:.05); }
    if(a.paint===5) ellipse(0,.65,.22,.08,a.hairColor);
    if(a.paint===6) for(const x of [-.35,.35]) line([[x-.13,.15],[x+.13,.15]],'#252d32',.07);
    if(a.paint===7) { g.fillStyle=a.accent; g.font='.3px sans-serif'; g.fillText('★',.45,.28); }
    if(a.paint===8) line([[.45,-.15],[.57,.24]],'#b35952',.03);
    if(a.paint===9) for(let i=0;i<3;i++) for(const s of [-1,1]) line([[s*.5,.12+i*.08],[s*.7,.12+i*.08]],a.accent,.04);
    if(a.paint===10) for(const s of [-1,1]) for(let i=0;i<3;i++) line([[s*.4,.25],[s*.8,.1+i*.14]],a.hairColor,.025);
    if(a.paint===11) ellipse(0,.18,.11,.09,'#ce4f4c');
    g.restore();
  }
  function paintJersey(g,w,h,value) {
    const a=clean(value); g.fillStyle=a.uniform; g.fillRect(0,0,w,h); g.fillStyle=a.accent;
    if(a.pattern===1||a.pattern===2) for(let x=0;x<w;x+=w/16) g.fillRect(x,0,w/(a.pattern===1?160:55),h);
    if(a.pattern===3) for(let y=0;y<h;y+=h/8) g.fillRect(0,y,w,h/40);
    if(a.pattern===4) g.fillRect(0,h*.12,w,h*.08);
    if(a.pattern===5) g.fillRect(0,0,w,h*.32);
    if(a.pattern===6) { g.globalAlpha=.25; for(let x=0;x<16;x++) for(let y=0;y<8;y++) if((x+y)%2) g.fillRect(x*w/16,y*h/8,w/16,h/8); g.globalAlpha=1; }
    if(a.pattern===7) for(const x of [.25,.75]) g.fillRect(w*x-w*.015,0,w*.03,h);
    g.textAlign='center'; g.textBaseline='middle'; g.strokeStyle=a.uniform; g.lineWidth=w*.009;
    g.font=`900 ${h*.11}px sans-serif`; g.strokeText(a.name,w*.75,h*.32,w*.4); g.fillText(a.name,w*.75,h*.32,w*.4);
    g.font=`900 ${h*.36}px sans-serif`; g.strokeText(a.number,w*.75,h*.59); g.fillText(a.number,w*.75,h*.59);
    g.font=`900 ${h*.24}px sans-serif`; g.strokeText(a.number,w*.25,h*.53); g.fillText(a.number,w*.25,h*.53);
  }
  return { catalogs, defaults, colors, clean, paintHead, paintJersey };
})();
if (typeof module !== 'undefined') module.exports = AVATAR;
