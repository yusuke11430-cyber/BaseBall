# Super Hage BaseBall

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
- オセロと同じくRenderへ直接アクセスして起動する入口: https://super-baseball.onrender.com/play
- 従来のGitHub Pagesも利用できます。直接入口の画面は `server/play.html` にビルドし、音源などはPagesから読み込みます。
- 「部屋を作る」→ 出てきた4文字のコードか「リンクをコピー」で相手に送る
- 相手はリンクを開いて「部屋に入る」
- 無料枠のサーバーは15分使わないと休止し、次に開いたとき通常は約1分の起動待ちがあります（起動時間の保証ではありません）

## 素材
- BGM・応援歌：ニコニ・コモンズ
- 3D表示：three.js

## キャラメイクと共有JSON保存

試合開始前に、全員共通のキャラ一覧から1人選ぶか、新規作成します。
髪30・目24・眉20・口24・顔の模様12・服の柄8・帽子4の計122種類と、6部位の自由な色設定があります。
髪・顔・背番号・名前はテクスチャとして描画し、選択したパーツごとに3Dオブジェクトを増やしません。
保存済みキャラの編集は新規保存になり、ほかの人のキャラを上書きしません。

既定の保存先はこのリポジトリの `character-data` ブランチにある `characters.json` です。
mainブランチとは分かれているため、キャラ保存でゲーム本体を再デプロイしません。
この共有JSONは公開情報です。非公開リポジトリへ保存したい場合は以下の保存先設定を変更できます。
公開一覧は `docs/config.js` の `SHARED_CHARACTER_CATALOG` から先行読み込みし、Renderの起動待ちでも選べます。非公開保存先へ切り替える場合はこの値を空文字にしてください。
共有一覧は認証情報なしでも読み出せますが、ゲームから新規保存するには、RenderのEnvironmentに認証トークンを設定します。

| 環境変数 | 設定内容 |
|---|---|
| `CHARACTER_GITHUB_TOKEN` | **設定が必要**。保存先リポジトリだけにContentsのRead and write権限を持つGitHub認証トークン |
| `CHARACTER_GITHUB_REPO` | 省略時 `yusuke11430-cyber/BaseBall`。変更する場合は `owner/repository` |
| `CHARACTER_GITHUB_BRANCH` | 既定の保存先では `character-data`。保存先リポジトリを変更して省略した場合は `main` |

認証トークンはRenderの環境変数だけに保存し、`docs/`・ソース・キャラJSON・ブラウザには入れないでください。
設定後にRenderを再デプロイすると共有への新規保存が有効になります。ゲーム本体のmainブランチへのキャラ保存は禁止しています。
同じリポジトリを使う場合は、公開されることを確認のうえ、デプロイ対象ではない専用ブランチを指定してください。
共有保存が未設定・休止中でも、端末にキャラを残してCPU練習や対戦を続けられます。端末のみのキャラは一覧に明記されます。
共有一覧は誰でも読める仕様なので、キャラ名には公開してよいニックネームを使用してください。

開発時は `python src/build.py` → `node src/test.js` → `node server/test-characters.js` で検証します。
`src/avatar.js` が見た目設定と描画の元ファイルです。ビルド時に `server/avatar-schema.js` へ同じスキーマを生成します。
