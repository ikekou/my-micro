# 公開手順

公開先はCloudflare Workers + D1、配布元は`ikekou/my-micro`を想定しています。本番アカウント・URL・OAuth Appの接続確認は、ローカルの自動テストとは別に必要です。

## 準備する設定

1. Cloudflareにログインし、公開対象のアカウントとD1を確認する。`apps/web/wrangler.jsonc`の`env.production`に本番IDを設定し、トップレベルのローカル設定とは分ける。
2. 本番の`workers.dev` URLを`env.production.vars.BETTER_AUTH_URL`に設定する。プラグインの`service.json`も同じoriginに設定する。共有ページのプロンプトは、そのページのoriginを明示する。
3. GitHub OAuth Appを作成し、コールバックを`https://<本番ホスト>/api/auth/callback/github`にする。認証情報はWranglerのsecretとして保存する。チャット・Git・ログには残さない。
4. 運営者が公開を選んだ問い合わせ先を`SUPPORT_URL`に設定する。管理操作には運営者の既存のWrangler認証を使う。
5. [サーバー設定](server-setup.md)に従い、migration、バックアップ、復元・ロールバック、非表示・投稿停止の手順を確認する。

本番のビルドは`npm run build:production --workspace=@my-micro/web`、デプロイは`npm run deploy --workspace=@my-micro/web`を使う。Cloudflare Vite pluginはビルド時に環境を選択するため、デプロイ時だけの環境指定では切り替わらない。ローカル確認は通常の`build`・`dev`・`preview`を使い、本番ビルドをローカル用として使い回さない。

GitHub認証用の情報が未設定の場合はログインを停止し、設定共有を完了したように扱いません。未知のCodexアプリ版では収集を停止します。

## 公開コードを準備する

```sh
npm ci
npm run typecheck
npm test
npm run build
node scripts/export-release.mjs
```

最後のコマンドは`.local/public-release`に許可したソースだけを書き出します。既存の出力は上書きしません。再実行時は別の空の出力先を引数で指定します。

開発用リポジトリには調査メモ・会話から得た情報があるため、**そのGit履歴を公開リポジトリにpushしない**でください。書き出したファイルと`release-manifest.json`を確認し、公開配布元には新しいGit履歴として登録します。スキャナーだけで公開可否を判断せず、変更内容をレビューします。

プラグイン用の`.agents/plugins/marketplace.json`と依存同梱済みJavaScriptを含めます。バージョンを変更するときはマニフェストと導入手順を更新し、リリース単位で配布します。

## 実環境での受け入れ確認

- 未導入のCodexに共有ページのプロンプトを貼り、GitHubの配布元から導入できる。
- 通常のPATHにNodeがなくても、対応するCodexアプリのNodeでローカル収集を実行できる。
- ブラウザでGitHubにログインし、Codex側と同じ端末コードを確認して許可できる。拒否・期限切れから再開できる。
- 投稿名・説明・設定をCodexで確認する。利用者の明示確認後に、そのスナップショットを公開し、URLから読み戻した内容が一致する。
- 導入済みの場合も同じプロンプトで共有できる。更新は同じURLを保つ。
- ログアウト状態の一覧・詳細、EN/JA、スマートフォン、タップ・キーボード操作を確認する。
- ブラウザで自分の投稿を削除し、接続を解除するとそのトークンで書き込めなくなる。

初回の本番投稿には、運営者本人が確認した実設定を使います。テスト用データは公開DBへ投入しません。

## 配布物の扱い

Micro図・記号はこの実装で作成したCSSとSVGです。Codexアプリから抽出した画像を配布物に含めません。My Microは非公式の共有サイトであること、公開データと認証データの範囲、削除・問い合わせ方法をサイト内に表示します。

コードのMITライセンスは利用者の投稿文章・設定に自動適用しません。公開後の仕様変更や認証データの削除依頼は、運営者が選んだ問い合わせ先で受け付けます。
