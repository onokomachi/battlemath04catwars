# CAT-WARS（battlemath04catwars）

小4算数のごほうびゲーム。基地をきずき、ネコ軍団で敵の基地をせめる。**問題を解くことがゲームを動かす**（解かないと進まない）。
学級ポータルにつなぐ予定（SANMON と同じ共通スタミナ）。**まだつないでいない・SOL にも出していない**（2026-11-15）。

進み具合の正本は知識集 `onokomachi-master-DB` の `techspecs/catwars-rebuild-plan-and-status.md`。

## スタック
Vite 6 + React 19 + TypeScript + Tailwind 3 + Zustand 5。Next.js ではない。Firebase は使わない（2026-11-15 に外した）。

```bash
npm run dev
npm run check   # 型・学年パックの検査・戦闘の試験・ビルド（終わる前に必ず）
npm run test:balance   # 全章の勝率（数値を変えたら流す）
```

## 構成
- `index.tsx` … 入口（CAT-WARS だけ）
- `catwars/` … ゲーム本体。`sim/`（決定的な戦闘の計算）・`data/`（キャラ・章・マップ）・`store/`（Zustand）・`components/`
- `catwars/learn/gradePack.ts` … **学年パック**（単元 → 出せる問題）。ゲーム本体はここだけを見る。5年・6年はパックを足す
- `catwars/learn/AppRoundHost.tsx` … 単元アプリの解答画面を「白い紙」（`.app-paper`。`index.css`）の上に出す
- `apps/` … 単元アプリの問題の作り方と解答画面の写し（SANMON の `apps/` と同じもの）
- `docs/REBUILD_SPEC.md` … **作り直しの仕様（決めたこと・数値・合格条件）。実装の前に読む**
- `catwars/components/game/ProblemCards.tsx` … 問題カード（戦闘の主役の操作）と星の決め方
- `docs/CATWARS_DESIGN.md` … 以前の設計の経緯（古い本体と一緒だったころのもの。経済・陣地の節は作り直しの対象）

## 必ず守ること
- **問題は SOL の単元アプリと同じ問題・同じ答え方にする。** `apps/` は手で直さない。直すときは 単元アプリ → SANMON（`npm run sync-apps`）→ ここ（`node scripts/sync-apps-from-sanmon.mjs`）。
- **判定は1回目のまちがいで×**（SANMON と同じ）。まちがえても罰はなく、ヒントで最後まで解ける。
- **記録の名前は単元アプリの skill_id**（`PackRound.skillId`）。前に何かを足さない。
- **解かずに勝てる作りに戻さない。** 戦闘のエナジーは自動ではたまらない（`energyPerSec: 0`）。問題カードを解いて手に入れる。
  数値を変えたら `npm run test:balance`（解かない想定プレイヤーが全章で0%・ふつうが勝つまでに解く問題が平均18問以下、でないと exit 1。全章で約10分かかるので `RUNS=12` や `CH=3` でしぼれる）。
  戦闘・敵・難易度の段・脅威レベルの数値を変えたら **3段とも測る**：`npm run test:balance:all`（3段＋脅威・にがての帯も見る。約4分）。
- **速さを報酬にしない。** 星と報酬は「まちがえずに解けたか」で決める。
- 戦闘の計算（`catwars/sim/`）は決定的に保つ（乱数は `sim/rng.ts`。`Math.random` を使わない）。対戦を作り直すときに要る。
- 他社ゲームの固有名（タウンホール・エリクサー・バーバリアンなど）を新しく足さない。残っているものは独自の名前に置きかえる。
- `window.confirm()` / `alert()` を使わない（iPad で出ないことがある）。
- 子どもの氏名は扱わない。APIキー・トークン・パスワードはファイルにも知識集にも書かない。

## 動作確認（Playwright）
`npm run build && npx vite preview --port 4173 --host 127.0.0.1` → `http://127.0.0.1:4173/`（localhost ではなく 127.0.0.1）。
ボタンに動きつづける演出があるので、クリックは `{ force: true }`。
