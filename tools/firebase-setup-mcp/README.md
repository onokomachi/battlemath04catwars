# firebase-setup-mcp

個人用のRemote MCPサーバー。Claude(Claude Code / claude.ai)からの指示で、Firebaseプロジェクトの
新規作成・初期設定(Webアプリ登録・Firestore・Realtime Database・Google認証)を自動化する。

Cloudflare Workers上で動作する、単一ユーザー専用のツール。他人と共有する前提の設計ではない。

## 提供しているMCPツール

| ツール | やること | 課金 |
|---|---|---|
| `create_firebase_project` | 新規Google CloudプロジェクトをFirebase対応で作成 | 発生しない |
| `create_web_app` | 既存プロジェクトにWebアプリを登録し、`firebaseConfig`を取得 | 発生しない |
| `enable_firestore` | Firestore(Nativeモード)を有効化 | 最初の1DBはSparkプラン無料枠内 |
| `enable_realtime_database` | Realtime Databaseを作成 | ⚠️**Blazeプラン(従量課金)必須**。実行前に必ずユーザーへ確認すること |
| `enable_google_signin` | Firebase Authentication + Googleログインを有効化 | 発生しない(ただしOAuthクライアント新規作成は下記の制約あり) |

## アーキテクチャ: 2種類の認証

混同しないこと。

1. **Google OAuth (このWorker → Google)**: `/oauth/start` と `/oauth/callback` で最初に1回だけ人間が同意する。
   「あなた自身としてGoogle Cloudを操作する」ためのrefresh tokenをKV(`OAUTH_STORE`)に保存する。
   個人のGoogleアカウントでは、サービスアカウントに「新規プロジェクト作成」を委譲できない
   (Organizationを持たない個人アカウントの制約)ため、必ずこの経路を通る。

2. **MCP接続の認証 (Claude → このWorker)**: `/oauth2/*` に実装した最小限のOAuth認可サーバー
   (RFC 8414 メタデータ + RFC 7591 Dynamic Client Registration + PKCE付き認可コードフロー)。
   Claudeのカスタムコネクタ画面には固定ヘッダーを指定する欄が無く、コネクタは接続時に必ず
   OAuthディスカバリを試みるため、それに応えられる本物のOAuthエンドポイントが必要だった。
   単一ユーザー専用なので `/oauth2/authorize` は誰が来ても即時承認する
   (実質的な秘密は最終的に払い出す `access_token` = `MCP_AUTH_TOKEN` そのものが握っている)。

## デプロイ手順

```bash
cd tools/firebase-setup-mcp
npm install
export CLOUDFLARE_API_TOKEN=<Workers Scripts Edit + Workers KV Storage Edit 権限のトークン>
npx wrangler deploy
```

初回のみ、KVネームスペースを作成して `wrangler.jsonc` の `id` を差し替える:

```bash
npx wrangler kv namespace create OAUTH_STORE
```

### 必要なSecrets(値はコミットしない。`wrangler secret put <name>` で設定)

- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`: Google Cloud ConsoleでOAuthクライアント(ウェブアプリケーション)を作成して取得。
  スコープは `https://www.googleapis.com/auth/cloud-platform`(Sensitive、Restrictedではないので重い審査は不要)。
  リダイレクトURIに `https://<worker-url>/oauth/callback` を登録すること。
- `MCP_AUTH_TOKEN`: `python3 -c "import secrets; print(secrets.token_urlsafe(32))"` などで生成したランダム文字列。
  Google連携時の `/oauth/start?token=...` と、最終的にClaudeへ払い出すMCP用access_tokenの両方に使う。

### 初回セットアップの手順

1. デプロイ後、`https://<worker-url>/oauth/start?token=<MCP_AUTH_TOKEN>` をブラウザで開いてGoogleアカウントと連携する。
2. claude.ai (またはClaude Code Web) の「カスタムコネクタを追加」で、URLに `https://<worker-url>/mcp` だけを入れて接続する
   (OAuth Client ID/Secret欄は空欄でよい。Claude側が自動でDCR→認可→トークン取得まで行う)。

## 既知の制約

- **Realtime Databaseの作成はBlazeプラン(課金アカウント)が必須**。Google公式のAPI discovery docに
  明記されている。Firestoreと違い無料のSparkプランでは作成できない可能性が高い。
- **Googleログインプロバイダの有効化は完全自動化できない**。Firebase AuthenticationのGoogle IDP設定には
  OAuthクライアント(Web client)のclient_idが必須だが、これを新規作成する公開APIが存在しない
  (`iam.googleapis.com`のoauthClientsは別物でIdentity-Aware Proxy/Workforce Identity専用。
  Firebase Consoleの「有効にする」ボタンが行う内部処理に相当する公開APIは無い)。
  初回のみFirebase Consoleで手動オンにする必要がある(`enable_google_signin`のエラー応答がその手順を案内する)。

## ハマった実装上の罠(再発防止メモ)

- **Service Usage APIの`:enable`は、既に有効な場合に実体の無いダミー操作ID
  (`operations/noop.DONE_OPERATION`など)を同期的に返すことがある**。素直にポーリングすると
  存在しない操作をGETしてエラーになる。`op.done`が既にtrueなら即座にreturnする必要がある。
- **`X-Goog-User-Project`ヘッダーを付けないと、APIの有効化チェックが「呼び出しに使った
  OAuthクライアントの持ち主のプロジェクト」に誤爆する**ことがある(identitytoolkit.googleapis.comで
  実際に発生: URLパスに対象プロジェクトIDを指定していても、`SERVICE_DISABLED`エラーが
  無関係な別プロジェクト番号で返ってきた)。すべての`googleFetch`呼び出しに、操作対象の
  `projectId`を`quotaProjectId`として渡すこと。
- RTDBの利用可能リージョンはFirestoreと違い `us-central1` / `europe-west1` / `asia-southeast1` の3つのみ
  (東京リージョンは無い)。
