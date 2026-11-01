# FLOWER JOURNEY（独立開発入口）

旧 `index.html` は変更しません。完成済みマップ＋全8アニメーションの原本を `flower-journey/master-LOCKED.html` に無変更で置き、`flower-journey/games/photo-add.html` を別ページとして読み込みます。

**現状:** この管理案を開発ブランチに登録。大きなHTML本体は別途追加が必要です（この記録だけでは動きません）。動作確認用のファイル一式は専用ZIPで渡しています。

MacではZIPを展開して `kodomo-album-app/flower-journey/` に配置し、`python3 -m http.server 3000` 実行後、`http://localhost:3000/flower-journey/` を開きます。main・旧公開版・既存写真/IndexedDBを変更しません。
