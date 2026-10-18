#!/bin/sh
# Read-only Mac LAN stable-name diagnostic. Never edits certificates, site data, photos or albums.
set -u
cd "$(dirname "$0")/.." || exit 1
if ! command -v scutil >/dev/null 2>&1; then echo "Mac専用の確認スクリプトです。"; exit 1; fi
name=$(scutil --get LocalHostName 2>/dev/null || true)
if [ -z "$name" ]; then echo "MacのLocalHostNameが未設定です。"; exit 1; fi
host="$name.local"
echo "MacBookの固定名候補: $host"
echo "架空アルバムの固定URL候補: https://$host:4318/fictional-album"
cert="sync-server/certs/cert.pem"
if [ ! -f "$cert" ]; then
 echo "証明書が見つかりません。HTTPSで使う前に証明書の設定が必要です。"
 exit 0
fi
if openssl x509 -in "$cert" -noout -text 2>/dev/null | grep -F -q "DNS:$host"; then
 echo "証明書: この.local名が含まれています。"
else
 echo "証明書: この.local名はまだ含まれていない可能性があります。"
 echo "今は固定URLへ切り替えないでください。次に安全に新しい証明書を用意します。"
fi
echo "注意: .localの名前解決は端末とネットワーク環境によります。"
echo "注意: IPアドレスと.localはSafariの保存領域が別です。古い未送信編集は消さないでください。"
