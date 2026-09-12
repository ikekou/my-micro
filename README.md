# My Micro

Codex Microの設定を眺め、自分の使い方も共有するギャラリー。日本語・英語、スマートフォンでの閲覧に対応します。

Browse how people use Codex Micro, then share your own setup from Codex. The site offers Japanese and English interfaces; post text stays in its original language.

## できること

- 実物を模した2D表示で、キーキャップ、キー・ノブ・スティックの機能とオプションを閲覧。
- 投稿名・説明・機能名を検索し、作者の他の設定を閲覧。
- MacのCodexに共有プロンプトを貼り、ローカルで作成した投稿案を確認してから公開。
- GitHubでログインし、複数の投稿の更新・削除と接続の解除。

初期版は共有までです。実機への設定取り込み、MCP・WebMCP、画像のアップロードは含みません。対応アプリ版は[プラグインの導入説明](plugins/my-micro/INSTALL.md)を参照してください。OpenAIの公式サービスではありません。

## ローカル開発

Node.js 24とnpmを使用します。

```sh
npm ci
cp apps/web/.dev.vars.example apps/web/.dev.vars
npm run db:migrate
npm run dev
```

`http://localhost:5173`を開きます。データベースは空で始まります。公開用の架空投稿は用意していません。GitHub認証を設定しなくても閲覧画面は確認できます。認証と本番設定は[サーバー設定](docs/server-setup.md)を参照してください。

```sh
npm run typecheck
npm test
npm run build
```

ビルドはWebアプリと依存を同梱したプラグイン用JavaScriptを生成します。プラグインを使う人にnpmでの依存追加は必要ありません。

## 構成

| ディレクトリ | 役割 |
| --- | --- |
| `apps/web` | React Router / Cloudflare Workers / D1、GitHub認証と投稿API |
| `packages/shared` | 公開データのスキーマとスナップショットのハッシュ |
| `packages/collector` | macOSの読み取り専用収集、端末認証、確認済み投稿の送信 |
| `plugins/my-micro` | Codex用スキル・配布プログラム・導入手順 |

設定ファイルからは許可した項目だけを取り出します。ローカルパス、スキル本文、定型文の本文、会話名・ID、Codexの認証情報は送信しません。投稿者が入力する名前・説明・スキル名は公開されるため、投稿前のプレビューで確認します。

## 公開とライセンス

[公開手順](docs/release.md)に従い、設定・認証・配布経路を実環境で確認してから公開します。開発リポジトリの調査メモやGit履歴は、公開用出力に含めません。

コードはMIT。投稿者の設定・文章に、このコードのライセンスを自動的に適用するものではありません。同梱ライブラリは[ライセンス一覧](plugins/my-micro/THIRD-PARTY-NOTICES.txt)を参照してください。
