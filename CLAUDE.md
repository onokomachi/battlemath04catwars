# CAT-WARS（battlemath04catwars）

小4算数のごほうびゲーム。基地をきずき、ネコ軍団で敵の基地をせめる。**問題を解くことがゲームを動かす**（解かないと進まない）。
学級ポータルに つないだ（CW-5a・CW-5b 2026-11-16：名乗り・おためし・SANMON と共通のスタミナ・サーバのかけら・専用の鍵 `catwars`・記録の送信・セーブのサーバ保存／CW-5c：体験版の項目・デモモード（0000・0））。**SOL の入口は SANMON タブ（閉じているあいだは 🔒）と体験の入口（PRISM で「体験に出す」にしたとき）**。
**サーバの SQL（PRISM `supabase/sql/2026-11-16-catwars-*.sql`）は 2026-11-16 に流しおわった。CAT-WARS は全学級で閉じて始まる。先生が PRISM の SANMON タブで開ける**（開けるまで 名乗った子は出撃できない）。くわしくは `docs/PORTAL.md`・`docs/CW5B_SERVER_PLAN.md`。

進み具合の正本は知識集 `onokomachi-master-DB` の `techspecs/catwars-rebuild-plan-and-status.md`。

## スタック
Vite 6 + React 19 + TypeScript + Tailwind 3 + Zustand 5。Next.js ではない。Firebase は使わない（2026-11-15 に外した）。

```bash
npm run dev
npm run check   # 型・学年パックの検査・戦闘の試験・収集・ポータル・遠征・なかま・対戦の試験・ビルド（終わる前に必ず）
npm run test:balance   # 全章の勝率（数値を変えたら流す）
npm run test:progress  # 進み方の計算（XP・値段を変えたら流す。数秒）
npm run test:expedition:balance  # 週がわりの遠征の 全部の戦場×ルール×レベル（遠征・sim の数値を変えたら流す。約30分）
npm run test:versus:balance  # 同時対戦：コンピュータ4段の総あたり（対戦の数を変えたら流す。約70秒）
```

## 構成
- `catwars/components/ui/` … 共通の部品（Button・Panel・Card・TitleBar・StatPill など）・手描きアイコン（`ui/icons/`）・画面のトークン（`index.css` の `--cw-*`。Tailwind にも `cw-*` で登録）。**新しい画面は ここの部品とトークンだけを使う**（きまり・使い方・よい例わるい例は `docs/UI_STYLE.md`）
- `index.tsx` … 入口（CAT-WARS だけ）
- `catwars/` … ゲーム本体。`sim/`（決定的な戦闘の計算）・`data/`（キャラ・章・マップ）・`store/`（Zustand）・`components/`
- `catwars/learn/gradePack.ts` … **学年パック**（単元 → 出せる問題）。ゲーム本体はここだけを見る。5年・6年はパックを足す
- `catwars/learn/AppRoundHost.tsx` … 単元アプリの解答画面を「白い紙」（`.app-paper`。`index.css`）の上に出す
- `apps/` … 単元アプリの問題の作り方と解答画面の写し（SANMON の `apps/` と同じもの）
- `docs/REBUILD_SPEC.md` … **作り直しの仕様（決めたこと・数値・合格条件）。実装の前に読む**
- `catwars/components/game/ProblemCards.tsx` … 問題カード（戦闘の主役の操作）と星の決め方
- `catwars/data/facilities.ts` … 基地の施設（持ちつづける・Lv1〜10・値段・その日に動かせる数）。`store/useBaseStore.ts` が持ち物
- `catwars/learn/shards.ts` … かけら（レベルの上限＝20＋5×かけら）。入口は `unitShards` の1つ：名乗っているときは サーバ（kit の `sanmonShards`）、おためしは 端末の数え方（`store/useStudyStore.ts`）
- `catwars/components/army/FormationScreen.tsx` … 出撃の5枠（5枠の外の系統は sim の表に入らない＝出せない）
- `catwars/data/skills.ts` … スキル（8系統×3。かけら 2／4／8 で開く・いつも効く）。効き目のきまりは `sim/simulate.ts`（`applyHit` など）
- `catwars/portal/` … 学級ポータル（名乗り・おためし／デモのセーブの入れかえ・出撃の関門・スタミナ・記録の送信 `answerSync.ts`・セーブのサーバ保存 `saveSync.ts`・体験版の項目 `trialFeatures.ts`・デモ `demo.ts`）。`docs/PORTAL.md`。セーブの鍵は `portal/saveKeys.ts` だけに書く
- `catwars/collection/`・`store/useCollectionStore.ts` … 収集（図鑑・バッジ34・シール60のカプセル・称号・はた）。保存は `catwars-collection-v1` の1つ（`exportSave`/`importSave`）。画面は `components/collection/`。くわしくは 仕様 §3d、絵の表は `docs/ART_LIST.md`
- `public/assets/stickers|badges|flags/` … シール・バッジ（絵柄と メダルの台）・基地のはた の SVG（手書き）。**きまりは `docs/ART_STYLE.md`**（線・パレット・ダイカット）。**同じ名前で上書きしない**（新しい名前で足して `image` を書きかえる）
- `catwars/expedition/` … **週がわりの遠征**（CW-6a。週の番号だけから 戦場・敵・ルールが決まる。`docs/REBUILD_SPEC.md` §5a・`docs/PORTAL.md`）。自分の星は `store/useExpeditionStore.ts`、サーバは `portal/expeditionSync.ts`
- `catwars/friend/` … **なかまの 基地に いく**（CW-6b。同じ学級の なかまの 基地の 配置に CPU が守る形で 攻める。相手は番号も名前も出さず「なかまの 基地 A・B・C」。`docs/REBUILD_SPEC.md` §5b・`docs/PORTAL.md`）。自分の きょうの星は `store/useFriendStore.ts`、サーバは `portal/friendSync.ts`
- `catwars/versus/` … **同時対戦**（CW-6c。同じ学級の2人が その場で。**ラウンド制**＝とく → おく → みる〔左右を入れかえて2回〕×3。あいては「あいて」・勝ち負けは どこにも 残さない。名乗っていない子は コンピュータが あいて。`docs/REBUILD_SPEC.md` §5c・`docs/PORTAL.md`）。サーバは `portal/versusSync.ts`、合図は `net/broadcastLink.ts`
- `docs/CATWARS_DESIGN.md` … 以前の設計の経緯（古い本体と一緒だったころのもの。経済・陣地の節は作り直しの対象）

## 必ず守ること
- **画面の見た目は トークンと部品だけで作る。** 色は役目の色（行動＝シアン・ごほうび＝ゴールド・成長＝ミント・めずらしい＝バイオレット・危険＝コーラル・ネコ＝オレンジ）、字は 6段（12・14・16・20・28・40px）で **12px 未満を使わない**、押せるものは **44×44px 以上**、文字は面の上で 4.5:1 以上（`text-white/40` や gray の直指定・16進の色・`text-[10px]` を足さない）。`docs/UI_STYLE.md`
- **問題は SOL の単元アプリと同じ問題・同じ答え方にする。** `apps/` は手で直さない。直すときは 単元アプリ → SANMON（`npm run sync-apps`）→ ここ（`node scripts/sync-apps-from-sanmon.mjs`）。
- **判定は1回目のまちがいで×**（SANMON と同じ）。まちがえても罰はなく、ヒントで最後まで解ける。
- **記録の名前は単元アプリの skill_id**（`PackRound.skillId`）。前に何かを足さない。
- **解かずに勝てる作りに戻さない。** 戦闘のエナジーは自動ではたまらない（`energyPerSec: 0`）。問題カードを解いて手に入れる。
  数値を変えたら `npm run test:balance`（解かない想定プレイヤーが全章で0%・ふつうが勝つまでに解く問題が平均18問以下、でないと exit 1。全章で約10分かかるので `RUNS=12` や `CH=3` でしぼれる）。
  戦闘・敵・難易度の段・脅威レベル・育ち方・施設のレベル・スキル・カードのまいすうの数値を変えたら **3段とも測る**：`npm run test:balance:all`（3段＋脅威＋正確さ。RUNS=24）。
  XP・💠の値段・報酬を変えたら `npm run test:progress`。
- **速さを報酬にしない。** 星と報酬は「まちがえずに解けたか」で決める。げきむず は カードの まいすう（`TIER_CARD_LIMIT`）で 正確さが効く（まちがいを責める文は出さない）。
- **スキルは `data/skills.ts`（数値）と `sim/simulate.ts`（きまり）の2か所。** sim には試合開始時に開いているスキルを焼きこむ（sim の中でストアを読まない）。変えたら `npm run test:sim` と `test:balance:all`。
- **放置で増える収入を作らない。** 施設は持ちつづけるが、その日に動かすには その日の学習が要る（`activeFacilityLimit`）。
- 戦闘の計算（`catwars/sim/`）は決定的に保つ（乱数は `sim/rng.ts`。`Math.random` を使わない）。対戦を作り直すときに要る。
- 他社ゲームの固有名（タウンホール・エリクサー・バーバリアンなど）を新しく足さない。残っているものは独自の名前に置きかえる。
- **収集（バッジ・シールコイン）は学習の量と質だけで手に入る。** 速さ・勝ち負けの数・ログイン時間・放置・💠・お金 を条件や通貨にしない。カプセルは 確率を出す・10回で天井・そろえても ごほうびなし。数を変えたら `npm run test:collection` と `npm run test:progress`（エンジョイ勢が毎日1つ・28日で シール4〜6割、トップ層が28日で8割未満）。
- **戦闘は かならず 出撃の関門（`portal/usePortal.ts` の `startSortie`＝`portal/gate.ts`）を通して始める。** 関門を通らずに 戦闘の画面を出す道を作らない（`CatWars.tsx` の `battleTicket`）。
- **スタミナの数・かけら・モードの開け閉めは サーバと kit が決める。** CAT-WARS で 数を決めない（送った数は サーバが決めなおす。1回の数は kit の `sanmonBattleCost`）。おためし・体験版・デモは 記録もセーブも 送らない（名乗らない）。デモの中身（全章・かけら8・💠・Lv）は デモのセーブにだけ入れる。
- **モードの鍵は `catwars`（はじめ閉じている）。遊んでいる とちゅうで閉じたら すぐホームにもどす**（`CatWars.tsx` の `playingLock`。SANMON と同じ）。
- **記録は app_id `catwars`・skill_id は 単元アプリのまま・カタログ `catwars`（kit）に無い項目は送らない・detail を付けない**（単元アプリの app_id で送ると スタミナが たまって「戦闘→スタミナ→戦闘」の輪になる。detail は 本番テストに まちがわれる）。1問ごとに 通信しない（`answerSync.ts`）。
- **サーバに送るセーブ（`saveBundle.ts`）は めやす 6.5KB**（CW-6a で 遠征ぶん +0.5KB）。使わない記録をストアに ためない（`progress.mastery` を消した。`npm run test:portal` の [8] で大きさを見る）。
- **週がわりの遠征のルールは 試合の前に 入力（難易度・敵の基地・ネコの性能表）を変えるだけ**（`expedition/rules.ts`）。sim の中で ルールを見ない。ルール・遠征の数を変えたら `npm run test:expedition:balance`（「とかない」0%・「ふつう」85%いじょう）。
  遠征の星は 名乗っている子の「まちがえずに 1問いじょう といた戦い」だけ サーバへ。**ほかの子の星・順位は 画面に出さない**（サーバも返さない）。週は サーバの時計（日本時間の月曜 0:00）。
- **なかまの 基地では 子どもの 番号・名前を 出さない・送らない・読まない。攻めた記録・勝ち負けの数を サーバに 残さない・相手に 見せない**（`friend/`・`portal/friendSync.ts`。名乗っていない子は 送らず みほんの基地）。相手の 強さは 手持ちに 合わせ 上限・下限を つける（`friend/friendAttack.ts`）。数を変えたら `npm run test:friend:balance`。
- **同時対戦では 勝ち負けで 💠・XP・コイン・星を 動かさない・勝ち負けの数／順位／あいての番号・名前を サーバにも 端末にも 残さない・出さない**（ごほうびは まちがえずに とけた 問題の `grantStudyReward` だけ。`versus/`・`portal/versusSync.ts`）。2人の計算は 同じ入力（おきかた）から 同じ結果にし（`sim/` は さわらない）、数を変えたら `npm run test:versus` と `test:versus:balance`。
- `window.confirm()` / `alert()` を使わない（iPad で出ないことがある）。
- 子どもの氏名は扱わない。APIキー・トークン・パスワードはファイルにも知識集にも書かない。

## 動作確認（Playwright）
`npm run build && npx vite preview --port 4173 --host 127.0.0.1` → `http://127.0.0.1:4173/`（localhost ではなく 127.0.0.1）。
ボタンに動きつづける演出があるので、クリックは `{ force: true }`。
