# UI設計の参考と実装

公式サイトを比較し、タイトル・選手・プレイモードを先に見せ、名前や部屋コードはモード選択後に表示する構成に変更しました。ブランド画像は流用せず、ロゴは独自のSVGです。

## 参考にした公式ページ
- パワフルプロ野球2024-2025: https://www.konami.com/pawa/2024-2025/
- Nintendo Switch Sports: https://www.nintendo.com/jp/switch/as8sa/index.html
- スプラトゥーン3: https://www.nintendo.com/jp/switch/av5ja/index.html
- プロ野球スピリッツ2024-2025: https://www.konami.com/games/prospi/2024-2025/
- Rocket League: https://www.rocketleague.com/play
- Super Mega Baseball 4: https://www.ea.com/able/resources/super-mega-baseball/super-mega-baseball-4

## 実装
- 既存の球場と選択中の選手をタイトル画面に使用。追加の3Dモデル・ライト・外部フォントなし。
- 対戦作成・参加・CPU練習・選手選択を主メニューに配置。設定と操作説明は別パネルへ。
- キーボードのフォーカス復帰、Escapeで閉じる操作、共有リンクのコード入力を維持。
- 乱闘の名前・体力・呼吸バーは、各選手をカメラへ投影した左右に合わせて表示順を切り替える。
