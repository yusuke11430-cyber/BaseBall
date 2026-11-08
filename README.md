# まるっと野球

球種とコースで勝負する、3Dのオンライン対戦野球ゲーム。アカウント不要で、URLを開くだけで遊べます。

## 構成

| フォルダ | 中身 | 公開先 |
|---|---|---|
| `docs/` | ゲーム画面（`index.html`）、音声（`audio/`）、接続先の設定（`config.js`） | GitHub Pages |
| `server/` | オンライン対戦の中継サーバー（Node.js + ws） | Render（Web Service・Free） |

`main` ブランチに変更が入ると、GitHub Pages と Render の両方が自動で更新されます。

## 初回の設定

### GitHub Pages
Settings → Pages → Build and deployment
- Source: **Deploy from a branch**
- Branch: **main** / フォルダ **/docs**

### Render（Web Service）
- Language: Node / Branch: main / Region: Singapore
- Root Directory: `server`
- Build Command: `npm install`
- Start Command: `node server.js`
- Instance Type: Free / Health Check Path: `/`
- （任意）環境変数 `ALLOWED_ORIGINS` に GitHub Pages のURL（例 `https://yusuke11430-cyber.github.io`）を入れると、そのページからの接続だけを受け付けます

接続先は `docs/config.js` の `window.MARUTTO_SERVER` で設定します（Render のURLの `https` を `wss` にしたもの）。

## 遊び方
- 「部屋を作る」→ 出てきた4文字のコードか「リンクをコピー」で相手に送る
- 相手はリンクを開いて「部屋に入る」
- 無料枠のサーバーは15分使わないと休止し、次に開いたとき起動まで最大1分ほどかかります

## 素材
- BGM・応援歌：ニコニ・コモンズ
- 3D表示：three.js
