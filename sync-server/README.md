# おもいでブック Wi-Fi同期（開発中）

## 現在の段階
**接続・ペアリングのテスト専用**。MacBookとWindowsの両方で、Node.jsだけで動作します。
写真・園児情報・アルバムの送受信、保存、自動同期は**まだありません**。6桁のテスト用確認コードで、ブラウザの一時セッションを登録できます。
既存の `index.html` と保存データは変更しません。

## 起動
1. VS Codeで、このリポジトリを開いて開発ブランチに切り替える。
2. Git Pull で最新版を取り込む。
3. ローカルの `npx serve` を使うターミナルとは**別のターミナル**を開く。
4. 次のコマンドを実行。

```sh
node sync-server/server.js
```

MacBook/Windows側で `http://localhost:4318/pair` を開いて確認。
同じWi-Fi上のiPhoneからは、コンソールに表示された
`http://(パソコンのIPアドレス):4318/pair` をSafariで開いて確認。

起動中はターミナルを開いたままにします。停止は Control+C。
`http://localhost:3000` または `http://(IPアドレス):3000` は引き続き既存アプリ用です。
4318番は同期接続・ペアリングテスト専用です。MacBook側のターミナルに表示される6桁の確認コードをiPhoneの画面に入力してください。コードは5分間有効で、接続テスト成功後は使い捨てになります。登録状態はサーバー停止時に消えます。

## セキュリティ注意
- HTTP接続は暗号化されていません。**確認コードも暗号化されずに送信されます**。必ず信頼できるWi-Fiで接続テストだけに使い、写真、園児情報、バックアップファイルや普段使っているパスワードは送らないでください。
- 現段階のサーバーは接続と一時ペアリングのテストしか受け付けません。データ送信APIはありません。
- テストは信頼できる家庭内Wi-Fiでのみ行い、インターネット向けポート公開はしないでください。
- 将来の本番用同期は、端末のペアリング、認証、HTTPS、競合防止、データ保存を別途設計・検証します。
- Windowsで接続できない場合、Windows Defender ファイアウォールやWi-Fiの端末間通信制限を確認してください。

## テスト数字の自動更新（次の段階）
- MacBookまたはWindowsで `http://localhost:4318/demo-value` を開くと、現在のテスト数字が表示されます。
- iPhoneで `/pair` を開き、ペアリング成功後に「数字を1増やす」を押します。
- iPhone画面の数字は3秒ごとに自動更新されます。MacBookでは `/demo-value` を再読み込みして一致を確認できます。
- 送受信するのは数字（0〜99）だけです。サーバー停止で消えます。
- セキュリティ未完成のため本物の園児情報・写真・アルバムデータは使えません。

## 架空の園児データ同期テスト
- iPhoneの `/pair` 画面で6桁コードを入力してペアリングします。
- 「次のテスト園児に切り替える」を押すと、架空の固定データ「テスト園児A→B→C」を順に切り替えます。
- MacBookやWindowsの `http://localhost:4318/demo-child` を更新すると、同じ架空の名前が表示されます。
- ブラウザの画面表示は3秒ごとに取得します。自由入力や実在園児データの送信・保存は実装していません。

## HTTPS起動の準備（任意・開発者向け）
標準の `node sync-server/server.js` は引き続き**HTTP（暗号化なし）テスト専用**です。
信頼できるLAN内でのみ、架空のテストデータを使ってください。

Node.jsのHTTPSモードは、認証局が署名した**対象IPアドレス用の証明書**と秘密鍵の両方がある場合だけ起動します。macOS / Windows とも環境変数で指定できます。

macOS（実際のパスに読み替え）:
```sh
OMOIDE_TLS_CERT=/path/to/your/cert.pem OMOIDE_TLS_KEY=/path/to/your/key.pem node sync-server/server.js
```

Windows PowerShell（実際のパスに読み替え）:
```powershell
$env:OMOIDE_TLS_CERT="C:\\path\\to\\cert.pem"
$env:OMOIDE_TLS_KEY="C:\\path\\to\\key.pem"
node sync-server/server.js
```

HTTPSモード時は `https://<パソコンのIP>:4318/pair` にアクセスしてください。iPhoneにも発行元の信頼設定が必要です。**ブラウザの証明書警告を無視して進む運用はしないでください。** 秘密鍵はGitHubへコミットしないでください。

> HTTPS対応はサーバーの土台だけです。端末認証の永続化、端末の取り消し、保護された写真保存、編集競合の処理、バックアップや自動同期は未実装です。園児の写真など実データを使う前に追加の安全設計とテストが必要です。

## MacBook NeoでのHTTPS接続テスト（mkcert）

今のHTTPテストはそのまま残ります。HTTPSは**テスト用の架空データのみ**使用します。証明書をMacBookに生成し、iPhoneでも信頼させる手順が必要です。

1. MacBookでHomebrewがあるか確認： `brew --version`
2. Homebrewがある場合、 `brew install mkcert` 、続いて `mkcert -install`
3. `mkdir -p sync-server/certs`
4. MacBookのローカルIPアドレスを確認： `ipconfig getifaddr en0`
5. **実際のIPアドレスに置き換えて**証明書を生成：

```sh
mkcert -cert-file sync-server/certs/cert.pem -key-file sync-server/certs/key.pem localhost 127.0.0.1 192.168.0.8
```

6. すでに起動中の4318番サーバーは Control+C で停止してから、以下でHTTPS起動：

```sh
OMOIDE_TLS_CERT=sync-server/certs/cert.pem OMOIDE_TLS_KEY=sync-server/certs/key.pem node sync-server/server.js
```

7. MacBookで `https://localhost:4318/security-status` を開き、 `"encrypted":true` を確認する。
8. iPhoneから `https://192.168.0.8:4318/security-status` にアクセスするには、 `mkcert -CAROOT` で表示したディレクトリの **rootCA.pem（公開CA証明書）だけ** をiPhoneにAirDropして、iPhoneの設定でプロファイルをインストールし、証明書の信頼設定で有効にする必要があります。作業後は端末の管理方針に従って不要なテスト用CAを取り除いてください。
9. **rootCA-key.pem、sync-server/certs/key.pem は絶対に共有・GitHub登録しないこと。** 証明書の警告を無視して進まないこと。証明書を信頼させる操作は、個人所有のテスト端末だけに限定すること。

この方法は開発中のローカル認証局による暗号化テスト用です。園の本番端末や園児の写真を扱うための運用・監査・端末権限は別途設計します。
