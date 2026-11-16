# 学級ポータルとのつながり（CW-5a・CW-5b・2026-11-16〜）

CAT-WARS は 学級ポータル（Supabase `gakkyu-portal`）につないだ。
- CW-5a：端末の側（名乗り・おためし・SANMON と共通のスタミナ・サーバのかけら）。
- CW-5b 第1段（kit 0.36.0・PRISM の SQL `supabase/sql/2026-11-16-catwars-*.sql`）と 第2段（この CAT-WARS）：専用の鍵 `catwars`・記録の送信・セーブのサーバ保存。
  **サーバの SQL は 2026-11-16 に流しおわった。CAT-WARS は全学級で閉じて始まる。先生が PRISM の SANMON タブで開ける**（開けるまで 名乗った子は「先生が まだ ひらいていないよ」で出撃できない。おためしは あそべる）。
計画と戻し方は `docs/CW5B_SERVER_PLAN.md`。

## つなぎ方
- 環境変数は SANMON と同じ名前：`VITE_SUPABASE_URL`／`VITE_SUPABASE_PUBLISHABLE_KEY`（publishable キーだけ。値は Vercel の環境変数だけに置く）。
  **値が無いビルドは「つないでいない」**：名乗りの画面も スタミナも出ず、今までどおり 全部あそべる（`portal/config.ts` の `isPortalConfigured`）。
- **本番の Vercel に入れる手順**（持ち主 または 点検の担当）：1. Vercel の CAT-WARS のプロジェクト → Settings → Environment Variables に、SANMON のプロジェクトと同じ2つ（`VITE_SUPABASE_URL`・`VITE_SUPABASE_PUBLISHABLE_KEY`）を Production（と Preview）で入れる。
  2. Vite はビルドのときに値を埋めこむので、入れたあと 再デプロイ（Redeploy）する。3. 本番で 名乗りの画面が出ることを確かめる（出なければ 値が入っていない）。値は ファイル・知識集・チャットに書かない。
- 置き場所：`catwars/portal/`
  - `config.ts` … つなぎ先・モードの鍵（`CATWARS_MODE_KEY = 'catwars'`）・reason の前の部分（`CATWARS_SPEND_REASON`）
  - `saveKeys.ts` … セーブ（persist）の鍵の一覧。**ストアの鍵は ここだけに書く**。ストアでない鍵（送れていない記録 `outbox`）は `NON_STORE_KEYS` にも
  - `saveProfile.ts` … 学級／おためし の セーブの入れかえ（`index.tsx` で いちばん先に読む）
  - `stamina.ts` … 町のえらび方・出撃の前に出す スタミナのようす（純粋な関数。1回の数は kit の `sanmonBattleCost`）
  - `gate.ts` … 出撃の関門（`createSortieGate` → `startBattle`）・閉じているときの文（`lockMessage`・`closedWhilePlayingMessage`）
  - `usePortal.ts` … 名乗り・スタミナ・モード・サーバのかけら の いまのようす（zustand）・`startSortie`・記録とセーブを いつ送るか（`usePortalLifecycle`・`afterBattle`）
  - `outbox.ts`・`answerSync.ts` … 1問の記録を 端末に のこして まとめて送る（CW-5b）
  - `saveSync.ts` … セーブを サーバ（`catwars_save`）に しまう・取りこむ（CW-5b）。同じ中身は 送らない（目印 `saveHash`）
  - `PortalCard.tsx` … ホームの「がっきゅうコード」とスタミナ、陣地づくりの「出撃！」の上のスタミナ
  - `saveBundle.ts` … セーブを1つの JSON に まとめる・もどす・大きさを測る（`saveSync.ts` が送る）
  - `PortalGate.tsx` … kit の JoinGate の つつみ（名乗った子に SOLO/DUO を出さない。下の「名乗り」）
- 名乗り：kit の `JoinGate`（学級コード＋出席番号。はじめの1回）と、SOL からの `#c=&n=`（`adoptStudentFromUrl`）。氏名は扱わない。
  右下の入口（chip）は出さない（戦闘の下のバーに重なる）。あとから名乗る入口は ホームの「がっきゅうコード」（kit の `JoinSettingsRow`）。
- **SOLO/DUO（kit の PlayModeGate）は出さない**（2026-11-16。`PortalGate.tsx`）：kit の JoinGate は 名乗った子に 授業の時間だけ「MODE SELECT（SOLO／DUO）」と右下の「● SOLO」を出すが、
  CAT-WARS は ごほうびのゲームで ふたりで学ぶ記録を 想定していない・右下のボタンが 陣地づくりの「出撃！」と 戦闘の下のバーに重なる。
  JoinGate には 出さないための引数が無い（kit 2fc93b1）ので、名乗っているときは JoinGate の かわりに `AppAccessGate` だけを出す（JoinGate が 名乗った子に出すのは この2つだけ）。
  名乗っていない・体験版・ログイン必須の入力画面は 今までどおり JoinGate。記録は SOLO（DUO の区間は PlayModeGate で DUO を選んだときしか できない。前に選んでいた端末は 開いたときに kit の `forceSolo` で閉じる）。
  kit を変えるなら：`JoinGate` に `playMode?: boolean`（false で PlayModeGate を出さない）を足せば、このつつみは要らなくなる。

## おためし・体験版（SANMON と同じ）
- 名乗っていない＝**おためし**：全部あそべる。スタミナは使わない。記録・セーブはサーバに送らない。
- **セーブは学級と別**（`saveProfile.ts`）：`SAVE_KEYS` の鍵 ぜんぶ を、学級コードを入れた・消したときに入れかえて 読みなおす。
  しまう先は `catwars_profile_class`／`catwars_profile_trial`、いまの側は `catwars_active_profile`。kit の鍵（`lak_*`）は入れかえない。
  おためしの進み具合は 学級に引きつがない。**CW-5a より前から あそんでいた端末の中身は「おためし」の側**になる（はじめて動いたとき 名乗っていないので）。
- **体験版**（SOL の `#trial`。kit の `isTrial()`）：おためしと同じ。**学級コードが入っている端末で体験のリンクを開くと あそばせない**（`trialOnClassDevice`。ふつうのタブと localStorage を取りあって 学級のセーブを こわさないため）。
- PRISM の「ログイン必須」を入れると、おためしは使えない（kit の JoinGate）。デモモードは入れる（`allowWithout={isDemo}`）。
- **体験版で 先生が閉じられる項目**（CW-5c。`portal/trialFeatures.ts`。キーは kit 0.37.0 の `TRIAL_FEATURE_SETS.catwars` と同じ）：
  `sortie`＝出撃（範囲・ステージ・メンバー・陣地づくり・戦闘）／`army`＝ネコ部隊・なかまを よぶ・出撃バフ／`collection`＝あつめる。はじめは全部 使える（PRISM の管理タブで「体験に出す」と項目を決める）。
  閉じた項目は ホームのボタンが「🔒 たいけんばんでは つかえないよ」、押すと kit の `TrialLock`。ボタン以外の道でも その画面には入れない（`CatWars.tsx` の `viewKey`）。
  ホームの左上に「たいけんばん」の しるし（下の kit のしるしで「おわる」）。陣地づくりの 施設の買い物は 出撃の中なので `sortie` に入る。

## デモモード（0000・0。CW-5c・2026-11-16）
- 入り方は SANMON と同じ：ホームの「がっきゅうコード」（kit の `JoinSettingsRow`）か、ログイン必須の入力画面で 学級コード「0000」・番号「0」→ 先生のパスワード（サーバの `verify_demo`）。
- 名乗らない（入るとき 名乗りを消す）→ 記録もセーブも送らない・スタミナを使わない・モードの鍵・平日モード・番号ごとの停止を見ない。
- セーブは3つ目の `demo`（`catwars_profile_demo`。学級・おためしと まざらない）。しるしは `catwars_demo_v1`（`portal/demoMode.ts`）。
- 画面の左上に「DEMO ・ きろくは おくられません」。ホームの「デモを おわる」で おためしにもどる。デモ中に学級コードを入れたら デモは おわり（学級のセーブ）。
- 紹介用の中身（`portal/demo.ts`）：全部の章と3つの段をえらべる（`useCampaignStore` の `isUnlocked`・`isTierUnlocked`）・かけらは全単元 8（`applyDemoShards`）・**はじめて入ったときだけ** 💠9999・全系統 Lv20（`seedDemoOnce`。デモのセーブにだけ。しるし `catwars_demo_seeded_v1`）。
- 体験のタブでは デモにしない。デモの端末で体験のリンクを開いたら 遊ばせない（`trialOnDemoDevice`。学級の端末と同じ理由）。

## スタミナ（SANMON と共通）
- 数えるのは サーバ（`sanmon_status`／`sanmon_spend`）。CAT-WARS は 数を決めない。
- **出撃1回 ＝ SANMON の ぼうけんのバトル1回**。サーバの `sanmon_spend` は reason に「@町」があると、その町の達成度で 数を決めなおす（100％→2・75％→3・50％→4・それより下→5。**送った数は使わない**）。
  画面の「1回 n」は kit の `sanmonBattleCost`（達成度は `sanmonTownMastery`。SANMON と同じもの。CW-5b で CAT-WARS の写しを消した）。
- reason は `catwars@<町の key>`。町は **出撃メンバーの系統に結びついた単元のうち、町のスタミナが いちばん多い町**（同じなら 1回の数が少ない町、それも同じなら 学習の順で先）。サーバが 町 → 共通 の順に使う。
- eventId は 1出撃に1つ（`catwars-<時刻>-<乱数>`）。通らなかったら 同じ eventId で やりなおす（二重に引かれない）。通ったら次は新しい id。2回おしても 1回ぶん。
- 出す場所：ホーム（共通・町のスタミナの多い順）と、陣地づくりの「出撃！」の上（その出撃の町・町・共通・1回の数・あと何回）。
- **関門**（`gate.ts`）：戦闘は かならず `startSortie` を通る。`CatWars.tsx` の `battleTicket` は 関門が通ったときにしか できず、戦闘の画面は きっぷが無いと出ない。
  - たりない → 出撃できない・「『単元名』の 単元アプリで れんしゅうすると たまるよ」（責めない）
  - 通信できない → 出撃させない（SANMON と同じ：`sanmon_spend` に とどかないと バトルは始まらない）
  - おためし・体験版・つないでいないビルド → スタミナを使わずに通す

## モードの鍵（`catwars`・CW-5b）
- **CAT-WARS 専用の鍵 `catwars`**（`config.ts` の `CATWARS_MODE_KEY`）。先生が PRISM の SANMON タブで 学級ごとに開ける。**はじめは閉じている**
  （kit の `SANMON_MODES_DEFAULT_CLOSED`。サーバも 書いていなければ false）。平日モードの対象・番号ごとの停止も効く。サーバの `sanmon_spend` も reason の `catwars` を この鍵で確かめる。
  SANMON の「ぼうけん」の開け閉めとは べつ（ぼうけんが閉じていても CAT-WARS は開けられる・その逆も）。
- 閉じているとき：ホームの「出撃！」は押せる形のまま（灰色）。押すと わけ（`gate.ts` の `lockMessage`＝kit の `modeLockMessage`。先生が まだ → 「先生が まだ ひらいていないよ」・授業の時間 → 「いまは じゅぎょうの じかん。15:30から…」・番号ごとの停止 → 「せんせいと おはなししてね」）。
  **平日モードで閉じているときに押したら `reportLockHit(…, 'catwars')`**（PRISM の「押した回数」。サーバが3分に1回だけ残す。SANMON と同じ）。
  出撃の とちゅうで サーバに ことわられたら、モードを読みなおして わけを出す。
- モードは 名乗ったとき・アプリにもどってきたとき・2分ごと に読む（SANMON と同じ）。
- **遊んでいる とちゅうで閉じたら、すぐ ホームにもどす**（CW-5b。SANMON の App.tsx と同じ。2分ごと・タブにもどったときの読みなおしで気づく＝新しい通信は ふえない）。
  とちゅう＝出撃の準備（範囲・ステージ・メンバー・陣地づくり）と戦闘。ネコ部隊・あつめる・出撃バフ の画面は そのまま。
  ホームに「じゅぎょうの じかんに なったよ。つづきは 15:30から あそべるよ」／「先生が CAT-WARS を とじたよ。つづきは また こんどね」／「せんせいと おはなししてね」（`closedWhilePlayingMessage`）。
  その戦闘の 勝ちの ごほうび（💠・章の記録・星・図鑑・バッジ）は 無し・出撃で使った スタミナは もどらない（SANMON の ぼうけんも同じ）。
  （勝ち負けが もう決まって 結果画面が出ていたら、その結果は 決まった瞬間に 入っている。`utils/settleBattle.ts`）
  それまでに解いた問題の ごほうび（💠・⚡・XP・シールコイン）と 記録は のこる（1問ごとに 入るため）。

## 記録の送信（CW-5b）
- 戦闘の中で解いた問題を 1問1行で `learning_event` に送る（kit の `flushEvents({ appId: 'catwars', ...PORTAL }, logs)`。SANMON と同じ呼び方）。**名乗っているときだけ**（おためし・体験版・つないでいないビルドは のこしも しない）。
- 形（`bridge.ts` の `buildPortalLog`）：app_id `catwars`・skill_id は 単元アプリのまま・**module_id は カタログ `catwars`（kit）で その項目が入っている町**・label「たたかい：[単元アプリ] 項目名」・detail なし。
  **カタログ `catwars` に無い skill_id は送らない**。カタログは 1つの項目を 1つの町にだけ入れる（わり算の筆算の 検算などは ÷1けた）ので、戦闘の単元と module_id が ずれる項目がある（いまは 29項目。`npm run test:portal` の [10]）。
- スタミナに数えない しくみは サーバ（`apps.subject='ゲーム'`＋`_sanmon_pools` で `app_id <> 'catwars'`）。CAT-WARS の側は 単元アプリの app_id で送らないこと。
- **送れなかった分は 端末に のこす**（`outbox.ts`・鍵 `SAVE_KEYS.outbox`＝`catwars-portal-outbox`・直近500件・学級／おためし の入れかえの対象・サーバのセーブには入れない）。
  1件ごとに 名乗っていた子の id を付け、送るのは いま名乗っている子の分だけ（同じ端末で番号を変えても まざらない）。
  どこまで送れたかは kit の高水位（`lak_sent_ts_catwars`）、二重は サーバが event_id で はじく。
- **ことわられても 遊びは止めない**（SQL を流す前は `apps` に `catwars` が無いので `sync_events` が ことわった。2026-11-16 に流したので いまは 届く）。次の機会に 送りなおす。
- 間のあけ方（`answerSync.ts`）：1問ごとには 通信しない。解いたら **15秒あと**に まとめて（待っているあいだの問題も いっしょに。待ちは のばさない）・戦闘の おわり 0.5秒・タブを かくしたら すぐ・名乗ったとき。1度に送るのは1つだけ。
  SANMON は 2秒（れんしゅうの1問が長い）。CAT-WARS は 戦闘の中で 数秒ごとに解くので 長くした。

## セーブのサーバ保存（CW-5b）
- 表 `catwars_save`（kit の `saveCatwarsSave`／`loadCatwarsSave`）。中身は `saveBundle.ts` の `{ v, savedAt, stores }`。`saveSync.ts`。SANMON の `pushSave`／`pullSaveIfNewer` と同じ考え方：
  - **名乗っているときだけ**。送るのは 中身が変わったときだけ。いつ：問題を解いて10秒あと・1分ごと・タブを かくしたとき・戦闘の勝ち負けが決まったとき・戦闘の おわり・名乗ったとき（サーバの方が新しくなければ）。
  - 「中身が変わった」は、最後に送った（または取りこんだ）中身の目印（`saveHash`。stores だけから作る短いハッシュ。`savedAt` は入れない）を 端末に のこして くらべる（`SAVE_KEYS.sentHash`＝`catwars_portal_sent_hash`。学級／おためし の入れかえの対象・サーバのセーブには入れない）。
    2026-11-16 まで 目印が メモリの中だけで、アプリを開くたびに1回・別の端末で取りこんだ直後にも 同じ中身を 送りかえしていた（試験 [14]）。
  - 取りこむのは サーバの `savedAt` が この端末の `catwars_portal_saved_at`（最後に送った／取りこんだ時刻）より新しいとき。取りこんだら 画面を読みなおす。いつ：名乗ったとき・タブにもどったとき。
  - サーバを見ているあいだは 送らない（古いセーブで 新しいセーブを上書きしない）。
- **端末を変えて名乗ったとき**：サーバの方が新しいので 前の端末の つづきから 遊べる（試験 [14]）。
- **2台で同時に遊んだとき**：**最後にサーバへ送った方が勝つ**（`savedAt` は送った端末の時計）。もう1台は タブに もどったときに それを取りこみ、その端末で まだ送っていなかった分は なくなる。
  どちらも開いたまま遊びつづけると、1分ごとに送りあって 上書きしあう（SANMON と同じ。1人1台の運用で起きにくい）。
- 送る前に 使っていない `progress.mastery` を外した（CW-5b で ストアからも消した。古いセーブに のこっていても `merge` で すてる）。

## かけら
- 入口は `learn/shards.ts` の `unitShards` の1つ。スキル・レベルの上限・バッジ・図鑑は どれも ここを通る。
- 名乗っているとき：サーバの記録（kit の `sanmonShards`＝本番テスト8割の日・実力の階段の段。SANMON と同じ かけら）。`usePortal.ts` が `setServerShards` で わたす。
- おためし・つないでいないビルド・まだ読めていない：端末の数え方（まちがえずに3回 解けた項目の割合）。

## まだ していないこと
- （2026-11-16 に済んだ）サーバの SQL（`docs/CW5B_SERVER_PLAN.md` §5）。先生が SANMON タブで CAT-WARS を開ける → 名乗った子が出撃できる・たまっていた記録が送られる。
- Vercel の本番の環境変数（上の「本番の Vercel に入れる手順」）。
- 1問の最初のまちがいの型：いまの `apps/` の `onMiss` は 何も わたさないので 入れていない。

## saveBundle の大きさ（`npm run test:portal` の [8]）
4週間ぶん（まちがえずに 約1500問・59項目・全章3段）で **6,061 バイト**（めやす 6KB 以下。サーバは 64KB まで）：study 1.6KB・player 1.4KB（`troops` 1KB）・campaign 1.2KB・collection 0.7KB・army 0.5KB・progress 0.35KB。
CW-5a のときは 15.3KB（`progress.mastery` が 9.2KB。どこからも読まれていなかったので CW-5b で消した）。
`study`（項目ごとの まちがえずに解いた回数）は 項目の数だけ ふえる（全314項目で 約8KB の見こみ）。ぜんぶ あそびきっても 15KB くらい。
