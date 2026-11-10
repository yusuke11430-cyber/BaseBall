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
- 変化球の曲がり幅は、変化量1〜7のすべてで従来の半分です（ナックルの揺れも対象）。
- スイング時のカーソルと立ち位置にバットの芯を合わせ、実際の接触位置から打球を開始します。
- 芯・詰まり・先端・こすり・バントで接触音と表示が変わります。芯で捉えると金色の衝撃が出ます。
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

UIの共通スタイルは `src/ui.css`、タイトル画面は `src/title.css`、メニューの表示切替は `src/title-menu.js` にまとめています。ビルド時にHTMLへ埋め込みます。フォントは端末標準のものを使用し、UIの背景ぼかしや追加の3D描画は使いません。

球場広告の画像・動画は `docs/media/` にあります。提供されたRAgTimeのロゴと料理写真をWebPへ縮小し、2本の動画は縦横比を保った512×288・15fps・音声なしのMP4へ変換しています。元ファイルを置いたフォルダを指定して `python src/process-sponsor.py <folder>` で再生成できます。

`src/stadium-media.js` はビルド時に `main.js` へ埋め込みます。既存のフェンス画像とモニターを利用し、動画要素・動画テクスチャはそれぞれ1つを使い回します。モニターがカメラの画面外に出たときやタブを隠したときは動画を停止します。読み込めないときは静止広告へ戻ります。照明と影用テクスチャの数・解像度、選手の寸法や当たり判定は変更していません。脚・帽子・つばの形状データは全選手で共有しています。

バットの長さと芯の位置は `BB.BAT` で描画・判定が共有します。長さは78cm、ミートカーソルの左右可動幅は80cm。`BB.batCursorBounds` が打席と立ち位置に応じた到達範囲を返し、カーソル操作・通常打撃・バントの全経路で同じ範囲に制限します。ベースに近づくと外角、離れると内角に対応しやすくなります。

## 入場パスワード

GitHub Pagesの入口はRenderの `/play` に移動します。未認証ではログイン画面だけを返し、対戦WebSocketと共有キャラAPIも認証が必要です。認証はHttpOnly・Secure・SameSite=LaxのCookieで12時間有効。サーバー再起動で失効します。共有リンクの部屋コードは維持します。

Renderの `GAME_PASSWORD_HASH` にランダムな16バイトsaltのhexと、Node.js scrypt(password, saltHex, 64)のhexをコロンで連結した値を設定します。パスワードやハッシュはリポジトリへ保存しません。未設定時は入場を許可しません。ログイン試行は接続元ごと10回/10分、全体100回/分、ハッシュ計算は同時2件に制限しています。環境変数は既存の共有保存設定を残して追加してください。

この制限は公開ゲームのオンライン入口を保護します。公開リポジトリのソース・過去の公開物・広告素材・共有キャラJSONそのものを非公開にする仕組みではありません。
