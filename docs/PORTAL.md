# 学級ポータルとのつながり（CW-5a・2026-11-16〜）

CAT-WARS は **端末の側だけ** 学級ポータル（Supabase `gakkyu-portal`）につないだ。サーバ・kit・PRISM・SANMON・SOL は変えていない。
サーバ側（専用の鍵・セーブの表・記録）は CW-5b。下書きは `docs/CW5B_SERVER_PLAN.md`。

## つなぎ方
- 環境変数は SANMON と同じ名前：`VITE_SUPABASE_URL`／`VITE_SUPABASE_PUBLISHABLE_KEY`（publishable キーだけ。値は Vercel の環境変数だけに置く）。
  **値が無いビルドは「つないでいない」**：名乗りの画面も スタミナも出ず、今までどおり 全部あそべる（`portal/config.ts` の `isPortalConfigured`）。
- 置き場所：`catwars/portal/`
  - `config.ts` … つなぎ先・モードの鍵（`CATWARS_MODE_KEY`）・reason の前の部分（`CATWARS_SPEND_REASON`）
  - `saveKeys.ts` … セーブ（persist）の鍵の一覧。**ストアの鍵は ここだけに書く**
  - `saveProfile.ts` … 学級／おためし の セーブの入れかえ（`index.tsx` で いちばん先に読む）
  - `stamina.ts` … 町のえらび方・出撃1回の数（純粋な関数）
  - `gate.ts` … 出撃の関門（`createSortieGate` → `startBattle`）
  - `usePortal.ts` … 名乗り・スタミナ・モード・サーバのかけら の いまのようす（zustand）と `startSortie`
  - `PortalCard.tsx` … ホームの「がっきゅうコード」とスタミナ、陣地づくりの「出撃！」の上のスタミナ
  - `saveBundle.ts` … セーブを1つの JSON に まとめる・もどす・大きさを測る（**まだサーバに送らない**）
- 名乗り：kit の `JoinGate`（学級コード＋出席番号。はじめの1回）と、SOL からの `#c=&n=`（`adoptStudentFromUrl`）。氏名は扱わない。
  右下の入口（chip）は出さない（戦闘の下のバーに重なる）。あとから名乗る入口は ホームの「がっきゅうコード」（kit の `JoinSettingsRow`）。

## おためし・体験版（SANMON と同じ）
- 名乗っていない＝**おためし**：全部あそべる。スタミナは使わない。記録・セーブはサーバに送らない。
- **セーブは学級と別**（`saveProfile.ts`）：`SAVE_KEYS` の鍵 ぜんぶ を、学級コードを入れた・消したときに入れかえて 読みなおす。
  しまう先は `catwars_profile_class`／`catwars_profile_trial`、いまの側は `catwars_active_profile`。kit の鍵（`lak_*`）は入れかえない。
  おためしの進み具合は 学級に引きつがない。**CW-5a より前から あそんでいた端末の中身は「おためし」の側**になる（はじめて動いたとき 名乗っていないので）。
- **体験版**（SOL の `#trial`。kit の `isTrial()`）：おためしと同じ。**学級コードが入っている端末で体験のリンクを開くと あそばせない**（`trialOnClassDevice`。ふつうのタブと localStorage を取りあって 学級のセーブを こわさないため）。
- PRISM の「ログイン必須」を入れると、おためしは使えない（kit の JoinGate）。
- SANMON とちがう：**デモモード（0000・0）は まだ無い**。

## スタミナ（SANMON と共通）
- 数えるのは サーバ（`sanmon_status`／`sanmon_spend`）。CAT-WARS は 数を決めない。
- **出撃1回 ＝ SANMON の ぼうけんのバトル1回**。サーバの `sanmon_spend` は reason に「@町」があると、その町の達成度で 数を決めなおす（100％→2・75％→3・50％→4・それより下→5。**送った数は使わない**）。
  画面の「1回 n」は `stamina.ts` の `sortieCost`（SANMON の `utils/townCost.ts` と同じ数え方の写し。2つのアプリに同じものがあるので kit に移すのが よい）。
- reason は `catwars@<町の key>`。町は **出撃メンバーの系統に結びついた単元のうち、町のスタミナが いちばん多い町**（同じなら 1回の数が少ない町、それも同じなら 学習の順で先）。サーバが 町 → 共通 の順に使う。
- eventId は 1出撃に1つ（`catwars-<時刻>-<乱数>`）。通らなかったら 同じ eventId で やりなおす（二重に引かれない）。通ったら次は新しい id。2回おしても 1回ぶん。
- 出す場所：ホーム（共通・町のスタミナの多い順）と、陣地づくりの「出撃！」の上（その出撃の町・町・共通・1回の数・あと何回）。
- **関門**（`gate.ts`）：戦闘は かならず `startSortie` を通る。`CatWars.tsx` の `battleTicket` は 関門が通ったときにしか できず、戦闘の画面は きっぷが無いと出ない。
  - たりない → 出撃できない・「『単元名』の 単元アプリで れんしゅうすると たまるよ」（責めない）
  - 通信できない → 出撃させない（SANMON と同じ：`sanmon_spend` に とどかないと バトルは始まらない）
  - おためし・体験版・つないでいないビルド → スタミナを使わずに通す

## モードの鍵（いまは ぼうけん）
- CAT-WARS 専用の鍵は まだ無いので、**SANMON の「ぼうけん」（`adventure`）の鍵にしたがう**（`config.ts` の `CATWARS_MODE_KEY`。CW-5b で `catwars` にする）。
  先生の開け閉め・平日モード・番号ごとの停止が そのまま効く。サーバの `sanmon_spend` も reason の `catwars` を ぼうけんとして確かめる。
- 閉じているとき：ホームの「出撃！」は押せる形のまま（灰色）。押すと わけ（kit の `modeLockMessage`。番号ごとの停止は「せんせいと おはなししてね」）。
  出撃の とちゅうで サーバに ことわられたら、モードを読みなおして わけを出す。
- モードは 名乗ったとき・アプリにもどってきたとき・2分ごと に読む（SANMON と同じ）。
- SANMON とちがう：**戦闘の とちゅうで閉じても メニューにもどさない**（その1戦は最後まで）。平日モードの「押した回数」（`reportLockHit`）は送らない（PRISM で SANMON の ぼうけんとして数えられてしまうため。CW-5b で専用の鍵にしてから）。

## かけら
- 入口は `learn/shards.ts` の `unitShards` の1つ。スキル・レベルの上限・バッジ・図鑑は どれも ここを通る。
- 名乗っているとき：サーバの記録（kit の `sanmonShards`＝本番テスト8割の日・実力の階段の段。SANMON と同じ かけら）。`usePortal.ts` が `setServerShards` で わたす。
- おためし・つないでいないビルド・まだ読めていない：端末の数え方（まちがえずに3回 解けた項目の割合）。

## まだ していないこと（CW-5b）
- **記録の送信**：持ち主の決定（2026-11-16）で「送る」。中身は `bridge.ts` の `buildPortalLog` で組み立ててあり、`PORTAL_SEND_ENABLED` を true にすれば送る（いまは false）。
  app_id は `catwars`・skill_id は 単元アプリのまま・module_id は 町・label は「たたかい：」・detail は付けない。サーバの準備（apps への登録・スタミナに数えない しるし）が先。
- **セーブのサーバ保存**：`saveBundle.ts` まで。いまの大きさは めやす（5KB）を こえる（`progress.mastery` が 大部分。下）。
- CAT-WARS 専用の開け閉めのスイッチ（PRISM）・平日モードの対象。
- 1問の最初のまちがいの型：いまの `apps/` の `onMiss` は 何も わたさないので 入れていない。

## saveBundle の大きさ（`npm run test:portal` の [8]）
4週間ぶん（まちがえずに 約1500問・59項目・全章3段）で **15.3KB**：progress 9.6KB（そのうち `mastery` 9.2KB）・study 1.6KB・player 1.4KB（`troops` 1KB）・campaign 1.2KB・collection 0.7KB・army 0.5KB。
`useProgressStore` の `mastery`（項目ごとの くりかえしの記録）は CAT-WARS の どこからも読まれていない（古い本体の名残）。ぬくと 約6KB。`interval`・`nextReviewAt` が 1e39 などに ふくらむ（同じ日に れんぞくで正解すると かけ算が つづく）。
