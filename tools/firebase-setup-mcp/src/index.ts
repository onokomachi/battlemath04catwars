// firebase-setup-mcp — 個人用のRemote MCPサーバー
//
// 目的: Claude Codeからの指示で、Firebaseプロジェクトの新規作成・初期設定を自動化する。
// 認証は2種類ある。混同しないこと:
//   1. Google OAuth (このWorker → Google) : /oauth/start と /oauth/callback で1回だけ行う。
//      「あなた自身としてGoogle Cloudを操作する」ためのリフレッシュトークンをKVに保存する。
//   2. MCP接続の認証 (Claude → このWorker) : /oauth2/* に実装した最小限のOAuth認可サーバー。
//      Claudeのカスタムコネクタ画面には固定ヘッダー欄が無く、コネクタは常にOAuth
//      ディスカバリ(DCR + 認可コード)を試みるため、それに応えられる本物のOAuthエンドポイントが必要。
//      ただし単一ユーザー専用なので、/oauth2/authorize は常に即時承認する
//      (実質的な秘密は最終的に払い出す access_token = MCP_AUTH_TOKEN が握っている)。

export interface Env {
  OAUTH_STORE: KVNamespace;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  MCP_AUTH_TOKEN: string;
}

const REDIRECT_PATH = '/oauth/callback';
// projects.create (Resource Manager) と Firebase Management API を叩ければ足りる。
// 将来 Firestore/Auth の設定まで自動化するなら、その時にスコープを広げて再同意させる。
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function html(body: string, status = 200): Response {
  return new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
}

// ── Google OAuth: 一度だけ人間が同意する導線 ──────────────────────────────

function redirectUri(url: URL): string {
  return `${url.origin}${REDIRECT_PATH}`;
}

async function handleOAuthStart(url: URL, env: Env): Promise<Response> {
  const token = url.searchParams.get('token');
  if (token !== env.MCP_AUTH_TOKEN) {
    return new Response('許可されていません(tokenが一致しません)', { status: 403 });
  }

  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', env.GOOGLE_CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', redirectUri(url));
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', GOOGLE_SCOPE);
  // access_type=offline + prompt=consent がないとリフレッシュトークンが返ってこない
  // (2回目以降の同意ではrefresh_tokenが省略されることがあるため、必ずこの2つを付ける)
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  return Response.redirect(authUrl.toString(), 302);
}

async function handleOAuthCallback(url: URL, env: Env): Promise<Response> {
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error');
  if (error) return html(`<p>Googleからエラーが返されました: ${escapeHtml(error)}</p>`, 400);
  if (!code) return html('<p>codeパラメータがありません。</p>', 400);

  const body = new URLSearchParams({
    code,
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    redirect_uri: redirectUri(url),
    grant_type: 'authorization_code',
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const data = await res.json<{ refresh_token?: string; access_token?: string; error?: string; error_description?: string }>();

  if (!res.ok || !data.refresh_token) {
    return html(
      `<p>トークン交換に失敗しました。</p><pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>` +
        `<p>refresh_tokenが無い場合、既に一度同意済みで access_type=offline&prompt=consent が効いていない可能性があります。` +
        `Googleアカウントの「サードパーティ アプリの管理」からこのアプリのアクセスを一度取り消してから、やり直してください。</p>`,
      400,
    );
  }

  await env.OAUTH_STORE.put('google_refresh_token', data.refresh_token);
  return html('<p>✅ 連携できました。このタブは閉じて大丈夫です。</p>');
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

// ── Googleへのアクセストークン取得(保存済みのrefresh_tokenから) ────────────

async function getAccessToken(env: Env): Promise<string> {
  const refreshToken = await env.OAUTH_STORE.get('google_refresh_token');
  if (!refreshToken) {
    throw new Error(
      '未連携です。先に /oauth/start?token=<MCP_AUTH_TOKEN> をブラウザで開いて、Googleアカウントとの連携を完了してください。',
    );
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }).toString(),
  });
  const data = await res.json<{ access_token?: string; error?: string; error_description?: string }>();
  if (!res.ok || !data.access_token) {
    throw new Error(`アクセストークンの取得に失敗: ${data.error ?? res.status} ${data.error_description ?? ''}`);
  }
  return data.access_token;
}

// ── Google APIの薄いラッパー ──────────────────────────────────────────────

async function googleFetch(accessToken: string, url: string, init: RequestInit = {}, quotaProjectId?: string): Promise<any> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      Authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
      // 指定しないと、URLパスのproject指定に関わらずクォータ/有効化チェックが
      // 「このOAuthクライアントの持ち主のプロジェクト」に対して行われることがある
      // (identitytoolkit.googleapis.comで実際に発生した: SERVICE_DISABLEDが
      //  対象プロジェクトではなく別のプロジェクト番号で返ってきた)。
      ...(quotaProjectId ? { 'x-goog-user-project': quotaProjectId } : {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Google API エラー (${res.status}): ${JSON.stringify(data)}`);
  }
  return data;
}

/** Resource Manager / Firebase Management の長時間操作(Operation)が終わるまで軽くポーリングする */
async function waitForOperation(
  accessToken: string,
  operationName: string,
  host: string,
  maxWaitMs = 25000,
  quotaProjectId?: string,
): Promise<any> {
  const started = Date.now();
  let delay = 800;
  while (Date.now() - started < maxWaitMs) {
    const op = await googleFetch(accessToken, `https://${host}/v1/${operationName}`, {}, quotaProjectId);
    if (op.done) {
      if (op.error) throw new Error(`操作が失敗しました: ${JSON.stringify(op.error)}`);
      return op.response;
    }
    await new Promise((r) => setTimeout(r, delay));
    delay = Math.min(delay * 1.5, 3000);
  }
  throw new Error('操作の完了待ちがタイムアウトしました(Google Cloud Console側で状況を確認してください)');
}

function slugifyProjectId(displayName: string): string {
  const base = displayName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 20);
  const suffix = Math.random().toString(36).slice(2, 8);
  const id = `${base || 'app'}-${suffix}`;
  // Google Cloudのproject IDは英字始まり必須
  return /^[a-z]/.test(id) ? id : `p-${id}`;
}

// ── MCP用OAuth認可サーバー (Claude → このWorker) ───────────────────────────
// RFC 8414 (metadata) + RFC 7591 (dynamic client registration) + PKCE付き認可コードフロー。
// 単一ユーザー専用なので /oauth2/authorize は誰が来ても即承認する。
// 最終的に発行する access_token は常に env.MCP_AUTH_TOKEN そのもの
// (= handleMcpの既存のBearerチェックがそのまま使える)。

function b64url(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)).buffer);
}

async function sha256b64url(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return b64url(digest);
}

interface DcrClient {
  client_id: string;
  redirect_uris: string[];
}

interface AuthCode {
  client_id: string;
  redirect_uri: string;
  code_challenge?: string;
  code_challenge_method?: string;
}

function oauthMetadata(origin: string) {
  return {
    issuer: origin,
    authorization_endpoint: `${origin}/oauth2/authorize`,
    token_endpoint: `${origin}/oauth2/token`,
    registration_endpoint: `${origin}/oauth2/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256', 'plain'],
    token_endpoint_auth_methods_supported: ['none'],
    scopes_supported: ['mcp'],
  };
}

async function handleDcrRegister(request: Request, env: Env, origin: string): Promise<Response> {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    // 空ボディで来るクライアントもある
  }
  const redirectUris: string[] = Array.isArray(body.redirect_uris) ? body.redirect_uris : [];
  const clientId = randomToken(16);
  const client: DcrClient = { client_id: clientId, redirect_uris: redirectUris };
  await env.OAUTH_STORE.put(`dcr_client:${clientId}`, JSON.stringify(client), {
    expirationTtl: 60 * 60 * 24 * 365,
  });
  return json(
    {
      client_id: clientId,
      redirect_uris: redirectUris,
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    },
    201,
  );
}

async function handleOAuth2Authorize(url: URL, env: Env): Promise<Response> {
  const clientId = url.searchParams.get('client_id') ?? '';
  const redirectUri = url.searchParams.get('redirect_uri') ?? '';
  const state = url.searchParams.get('state');
  const codeChallenge = url.searchParams.get('code_challenge') ?? undefined;
  const codeChallengeMethod = url.searchParams.get('code_challenge_method') ?? undefined;

  const clientRaw = await env.OAUTH_STORE.get(`dcr_client:${clientId}`);
  if (!clientRaw) return html('<p>未登録のclient_idです。</p>', 400);
  const client: DcrClient = JSON.parse(clientRaw);
  if (client.redirect_uris.length > 0 && !client.redirect_uris.includes(redirectUri)) {
    return html('<p>redirect_uriが登録内容と一致しません。</p>', 400);
  }

  // 単一ユーザー専用なので、ここで人間の同意画面は挟まず即承認する。
  const code = randomToken(24);
  const authCode: AuthCode = { client_id: clientId, redirect_uri: redirectUri, code_challenge: codeChallenge, code_challenge_method: codeChallengeMethod };
  await env.OAUTH_STORE.put(`authcode:${code}`, JSON.stringify(authCode), { expirationTtl: 600 });

  const dest = new URL(redirectUri);
  dest.searchParams.set('code', code);
  if (state !== null) dest.searchParams.set('state', state);
  return Response.redirect(dest.toString(), 302);
}

async function handleOAuth2Token(request: Request, env: Env): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';
  let params: URLSearchParams;
  if (contentType.includes('application/json')) {
    const b = await request.json<Record<string, string>>().catch(() => ({}) as Record<string, string>);
    params = new URLSearchParams(b as Record<string, string>);
  } else {
    params = new URLSearchParams(await request.text());
  }

  const grantType = params.get('grant_type');

  if (grantType === 'authorization_code') {
    const code = params.get('code') ?? '';
    const codeVerifier = params.get('code_verifier');
    const raw = await env.OAUTH_STORE.get(`authcode:${code}`);
    if (!raw) return json({ error: 'invalid_grant' }, 400);
    const authCode: AuthCode = JSON.parse(raw);
    await env.OAUTH_STORE.delete(`authcode:${code}`);

    if (authCode.code_challenge) {
      if (!codeVerifier) return json({ error: 'invalid_grant', error_description: 'code_verifier required' }, 400);
      const method = authCode.code_challenge_method ?? 'S256';
      const computed = method === 'plain' ? codeVerifier : await sha256b64url(codeVerifier);
      if (computed !== authCode.code_challenge) {
        return json({ error: 'invalid_grant', error_description: 'PKCE verification failed' }, 400);
      }
    }

    return json({
      access_token: env.MCP_AUTH_TOKEN,
      token_type: 'Bearer',
      refresh_token: env.MCP_AUTH_TOKEN,
    });
  }

  if (grantType === 'refresh_token') {
    // 単一ユーザー専用の固定トークンなので、リフレッシュも同じ値をそのまま返す。
    return json({
      access_token: env.MCP_AUTH_TOKEN,
      token_type: 'Bearer',
      refresh_token: env.MCP_AUTH_TOKEN,
    });
  }

  return json({ error: 'unsupported_grant_type' }, 400);
}

// ── MCPツールの実体 ────────────────────────────────────────────────────

/** projectで指定したGoogle CloudのAPIを有効化する(既に有効でも冪等に成功する) */
async function enableApi(accessToken: string, projectId: string, serviceName: string): Promise<void> {
  const op = await googleFetch(
    accessToken,
    `https://serviceusage.googleapis.com/v1/projects/${projectId}/services/${serviceName}:enable`,
    { method: 'POST', body: JSON.stringify({}) },
    projectId,
  );
  // 既に有効な場合など、Googleが同期的に done:true を返すことがある(operation名が
  // "operations/noop.DONE_OPERATION" のような実体の無いダミーIDになるため、ポーリングしてはいけない)。
  if (op.name && !op.done) {
    await waitForOperation(accessToken, op.name, 'serviceusage.googleapis.com', 25000, projectId);
  }
}

async function toolCreateFirebaseProject(env: Env, args: { displayName: string }): Promise<string> {
  const accessToken = await getAccessToken(env);
  const projectId = slugifyProjectId(args.displayName);

  // ① Google Cloud プロジェクトを新規作成(あなた自身のOAuthトークンとして実行される。
  //    個人アカウントではサービスアカウントにこの操作を渡せないため、必ずこの経路を通る)
  const createOp = await googleFetch(accessToken, 'https://cloudresourcemanager.googleapis.com/v1/projects', {
    method: 'POST',
    body: JSON.stringify({ projectId, name: args.displayName }),
  });
  await waitForOperation(accessToken, createOp.name, 'cloudresourcemanager.googleapis.com', 25000, projectId);

  // ② そのプロジェクトにFirebaseを有効化
  const addOp = await googleFetch(
    accessToken,
    `https://firebase.googleapis.com/v1beta1/projects/${projectId}:addFirebase`,
    { method: 'POST', body: JSON.stringify({}) },
    projectId,
  );
  await waitForOperation(accessToken, addOp.name, 'firebase.googleapis.com', 25000, projectId);

  return (
    `Firebaseプロジェクトを作成しました。\n` +
    `- projectId: ${projectId}\n` +
    `- 表示名: ${args.displayName}\n` +
    `- コンソール: https://console.firebase.google.com/project/${projectId}/overview\n\n` +
    `まだWebアプリの登録・Firestore/Authの設定は行っていません(このツールは「器を作る」ところまでです)。`
  );
}

async function toolCreateWebApp(env: Env, args: { projectId: string; displayName: string }): Promise<string> {
  const accessToken = await getAccessToken(env);
  const createOp = await googleFetch(
    accessToken,
    `https://firebase.googleapis.com/v1beta1/projects/${args.projectId}/webApps`,
    { method: 'POST', body: JSON.stringify({ displayName: args.displayName }) },
    args.projectId,
  );
  const webApp = await waitForOperation(accessToken, createOp.name, 'firebase.googleapis.com', 25000, args.projectId);

  const config = await googleFetch(accessToken, `https://firebase.googleapis.com/v1beta1/${webApp.name}/config`, {}, args.projectId);

  return (
    `Webアプリを登録しました。\n` +
    `- appId: ${webApp.appId}\n` +
    `- 表示名: ${args.displayName}\n\n` +
    `SDK設定 (そのままアプリのfirebaseConfigに使えます):\n` +
    '```json\n' +
    JSON.stringify(
      {
        apiKey: config.apiKey,
        authDomain: config.authDomain,
        projectId: config.projectId,
        storageBucket: config.storageBucket,
        messagingSenderId: config.messagingSenderId,
        appId: config.appId,
      },
      null,
      2,
    ) +
    '\n```'
  );
}

async function toolEnableFirestore(env: Env, args: { projectId: string; locationId?: string }): Promise<string> {
  const accessToken = await getAccessToken(env);
  const locationId = args.locationId || 'asia-northeast1';

  await enableApi(accessToken, args.projectId, 'firestore.googleapis.com');

  try {
    const createOp = await googleFetch(
      accessToken,
      `https://firestore.googleapis.com/v1/projects/${args.projectId}/databases?databaseId=(default)`,
      { method: 'POST', body: JSON.stringify({ type: 'FIRESTORE_NATIVE', locationId }) },
      args.projectId,
    );
    await waitForOperation(accessToken, createOp.name, 'firestore.googleapis.com', 25000, args.projectId);
    return (
      `Firestore(Nativeモード)を作成しました。\n` +
      `- リージョン: ${locationId}\n` +
      `- 無料枠(Sparkプラン)の範囲内で使えます。1プロジェクトにつき最初の1つのデータベースは課金アカウント不要です。`
    );
  } catch (e: any) {
    if (String(e.message).includes('ALREADY_EXISTS')) {
      return 'このプロジェクトには既にFirestoreデータベースが存在します(何もしませんでした)。';
    }
    throw e;
  }
}

async function toolEnableRealtimeDatabase(env: Env, args: { projectId: string; locationId?: string }): Promise<string> {
  const accessToken = await getAccessToken(env);
  // RTDBのリージョンはFirestoreと違い us-central1 / europe-west1 / asia-southeast1 の3つのみ
  // (東京リージョンは無い。日本からは asia-southeast1 が一番近い)。
  const locationId = args.locationId || 'asia-southeast1';

  await enableApi(accessToken, args.projectId, 'firebasedatabase.googleapis.com');

  const databaseId = `${args.projectId}-default-rtdb`;
  const instance = await googleFetch(
    accessToken,
    `https://firebasedatabase.googleapis.com/v1beta/projects/${args.projectId}/locations/${locationId}/instances?databaseId=${databaseId}`,
    { method: 'POST', body: JSON.stringify({ type: 'DEFAULT_DATABASE' }) },
    args.projectId,
  );

  return (
    `Realtime Databaseを作成しました。\n` +
    `- databaseURL: ${instance.databaseUrl}\n` +
    `- リージョン: ${locationId}\n\n` +
    `アプリ側では VITE_FIREBASE_DATABASE_URL にこのURLを設定してください。`
  );
}

async function toolEnableGoogleSignIn(env: Env, args: { projectId: string }): Promise<string> {
  const accessToken = await getAccessToken(env);

  await enableApi(accessToken, args.projectId, 'identitytoolkit.googleapis.com');

  try {
    // clientIdを省略できれば理想だったが、実際にはGoogleのAPIがclient_id必須で弾く。
    // 「Web client (auto created by Google Service)」の自動作成はFirebase Consoleの内部処理で
    // 行われており、これに相当する公開APIが無い(iam.googleapis.comのoauthClientsは別物=
    // IAP/Workforce Identity用で、Firebase AuthのGoogleサインイン用クライアントは作れない)。
    await googleFetch(
      accessToken,
      `https://identitytoolkit.googleapis.com/admin/v2/projects/${args.projectId}/defaultSupportedIdpConfigs?idpId=google.com`,
      { method: 'POST', body: JSON.stringify({ enabled: true }) },
      args.projectId,
    );
  } catch (e: any) {
    if (String(e.message).includes('client_id cannot be empty')) {
      return (
        `Firebase Authentication自体は有効化しましたが、Googleログインのプロバイダは自動化できませんでした。\n\n` +
        `理由: GoogleサインインにはOAuthクライアント(Web client)が必要ですが、これを新規作成する公開APIが存在しません` +
        `(Firebase Consoleがボタン一つで作る処理は内部専用です)。\n\n` +
        `お手数ですが、以下だけ手動でお願いします(1回・30秒程度):\n` +
        `1. https://console.firebase.google.com/project/${args.projectId}/authentication/providers を開く\n` +
        `2. 「Google」を選択して「有効にする」をオンにして保存\n\n` +
        `これで自動的にWeb clientが作成され、以降はこのプロジェクトのGoogleログインが使えるようになります。`
      );
    }
    throw e;
  }

  return (
    `Firebase AuthenticationでGoogleログインを有効化しました。\n` +
    `- 無料枠の範囲内です(基本的な認証プロバイダに課金は発生しません)。\n` +
    `- コンソール: https://console.firebase.google.com/project/${args.projectId}/authentication/providers`
  );
}

const TOOLS = [
  {
    name: 'create_firebase_project',
    description:
      '新しいGoogle CloudプロジェクトをFirebase対応で作成する。個人のGoogleアカウントの権限で実行される' +
      '(あなたが/oauth/startで一度連携ずみであることが前提)。Webアプリ登録やFirestore設定はまだ行わない。',
    inputSchema: {
      type: 'object',
      properties: {
        displayName: { type: 'string', description: '人間が読むためのプロジェクト表示名(例: 小4算数ゲーム-角度編)' },
      },
      required: ['displayName'],
    },
  },
  {
    name: 'create_web_app',
    description:
      '既存のFirebaseプロジェクトにWebアプリを登録し、firebaseConfig(apiKey等)を取得する。' +
      '新規プロジェクトでも既存プロジェクトでも使える。課金は発生しない。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '対象のGoogle CloudプロジェクトID' },
        displayName: { type: 'string', description: 'Webアプリの表示名(例: メインアプリ)' },
      },
      required: ['projectId', 'displayName'],
    },
  },
  {
    name: 'enable_firestore',
    description:
      '既存のFirebaseプロジェクトでCloud Firestore(Nativeモード)を有効化する。' +
      'プロジェクト最初の1データベースは無料枠(Sparkプラン)の範囲内で課金アカウント不要。既に存在する場合は何もしない。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '対象のGoogle CloudプロジェクトID' },
        locationId: { type: 'string', description: 'リージョン(省略時は asia-northeast1)。作成後は変更不可なので注意。' },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'enable_realtime_database',
    description:
      '既存のFirebaseプロジェクトでRealtime Database(RTDB)を作成する。' +
      '⚠️課金に関わる操作: Google側の仕様上このAPIはBlazeプラン(従量課金プラン、課金アカウントの紐付け)が必須。' +
      'Firestoreと違い無料のSparkプランでは作成できない可能性が高いので、実行前に必ずユーザーに確認すること。',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '対象のGoogle CloudプロジェクトID' },
        locationId: {
          type: 'string',
          description: 'リージョン(us-central1 / europe-west1 / asia-southeast1 のいずれか。省略時は asia-southeast1)。作成後は変更不可。',
        },
      },
      required: ['projectId'],
    },
  },
  {
    name: 'enable_google_signin',
    description:
      '既存のFirebaseプロジェクトでFirebase Authenticationを有効化し、Googleログインのプロバイダをオンにする。' +
      '基本的な認証プロバイダの利用に課金は発生しない。' +
      '(制約: OAuthクライアントの新規作成に相当する公開APIが無いため、初回はFirebase Consoleでの' +
      'ワンクリック操作が別途必要になる場合がある。その場合はツールの返答に手順が書かれる)',
    inputSchema: {
      type: 'object',
      properties: {
        projectId: { type: 'string', description: '対象のGoogle CloudプロジェクトID' },
      },
      required: ['projectId'],
    },
  },
] as const;

// ── MCP (JSON-RPC over HTTP, Streamable HTTPのstateless版) ────────────────

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: any;
}

function rpcResult(id: JsonRpcRequest['id'], result: unknown) {
  return { jsonrpc: '2.0', id, result };
}
function rpcError(id: JsonRpcRequest['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleMcp(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const auth = request.headers.get('authorization') ?? '';
  const keyParam = url.searchParams.get('key') ?? '';
  // Claudeのカスタムコネクタ画面にはヘッダーを指定する欄が無かったため、
  // URLに ?key=... を埋め込む方式も認める(Authorizationヘッダーも引き続き使える)。
  const authorized = auth === `Bearer ${env.MCP_AUTH_TOKEN}` || keyParam === env.MCP_AUTH_TOKEN;
  if (!authorized) {
    return json({ error: 'unauthorized' }, 401);
  }
  if (request.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return json(rpcError(null, -32700, 'Parse error'), 400);
  }

  const { id, method, params } = body;

  if (method === 'initialize') {
    return json(
      rpcResult(id, {
        protocolVersion: params?.protocolVersion ?? '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'firebase-setup-mcp', version: '0.1.0' },
      }),
    );
  }

  if (method === 'notifications/initialized') {
    // 通知には応答本体を返さない
    return new Response(null, { status: 202 });
  }

  if (method === 'tools/list') {
    return json(rpcResult(id, { tools: TOOLS }));
  }

  if (method === 'tools/call') {
    const toolName = params?.name;
    const args = params?.arguments ?? {};
    try {
      if (toolName === 'create_firebase_project') {
        const text = await toolCreateFirebaseProject(env, args);
        return json(rpcResult(id, { content: [{ type: 'text', text }] }));
      }
      if (toolName === 'create_web_app') {
        const text = await toolCreateWebApp(env, args);
        return json(rpcResult(id, { content: [{ type: 'text', text }] }));
      }
      if (toolName === 'enable_firestore') {
        const text = await toolEnableFirestore(env, args);
        return json(rpcResult(id, { content: [{ type: 'text', text }] }));
      }
      if (toolName === 'enable_realtime_database') {
        const text = await toolEnableRealtimeDatabase(env, args);
        return json(rpcResult(id, { content: [{ type: 'text', text }] }));
      }
      if (toolName === 'enable_google_signin') {
        const text = await toolEnableGoogleSignIn(env, args);
        return json(rpcResult(id, { content: [{ type: 'text', text }] }));
      }
      return json(rpcResult(id, { content: [{ type: 'text', text: `未知のツール: ${toolName}` }], isError: true }));
    } catch (e: any) {
      return json(rpcResult(id, { content: [{ type: 'text', text: `エラー: ${e.message ?? String(e)}` }], isError: true }));
    }
  }

  return json(rpcError(id, -32601, `Method not found: ${method}`), 404);
}

// ── ルーティング ────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      return new Response('firebase-setup-mcp: alive', { status: 200 });
    }
    if (url.pathname === '/oauth/start') {
      return handleOAuthStart(url, env);
    }
    if (url.pathname === REDIRECT_PATH) {
      return handleOAuthCallback(url, env);
    }
    if (url.pathname === '/.well-known/oauth-authorization-server') {
      return json(oauthMetadata(url.origin));
    }
    if (url.pathname === '/.well-known/oauth-protected-resource') {
      return json({ resource: `${url.origin}/mcp`, authorization_servers: [url.origin] });
    }
    if (url.pathname === '/oauth2/register' && request.method === 'POST') {
      return handleDcrRegister(request, env, url.origin);
    }
    if (url.pathname === '/oauth2/authorize') {
      return handleOAuth2Authorize(url, env);
    }
    if (url.pathname === '/oauth2/token' && request.method === 'POST') {
      return handleOAuth2Token(request, env);
    }
    if (url.pathname === '/mcp') {
      return handleMcp(request, env);
    }
    return new Response('Not found', { status: 404 });
  },
};
