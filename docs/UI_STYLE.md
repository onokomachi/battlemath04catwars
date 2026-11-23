# 画面の見た目のきまり「ムーンベース・ポップ」

2026-11-23（画面のデザイン刷新 第1段）。**新しい画面・直す画面は、ここの部品とトークンだけで作る。**
世界観：宇宙のネコ軍団の月の基地。黒一色をやめて、**深い紺の宇宙**にすりガラスのパネル。かわいいネコの絵（つや・パステル）が主役で、
UI は静かに引き立てる。ネオンの光は「数字・状態・いま押すボタン」にだけ使い、飾りには使わない。

- トークンは `index.css` の `:root`（CSS 変数 `--cw-*`）。Tailwind からも同じ名前で使える（`tailwind.config.js`）。
- 部品は `catwars/components/ui/`（`import { Button, Card, ... } from './ui'`）。アイコンは `ui/icons/`。
- 手描き SVG の絵柄は `docs/ART_STYLE.md`（シール・バッジと同じ）。

## 1. トークン

| 種類 | 名前 | 値・使いどころ |
|---|---|---|
| 地 | `--cw-bg-0` / `-1` / `-2` | `#060a1c`（いちばん奥）/ `#0b1230` / `#141c44`。画面の地は 紺→藍の縦グラデ＋CSS の星（`body::before/after`。`prefers-reduced-motion` では瞬かない） |
| 面 | `--cw-surface` | `rgba(20,30,70,.62)` ＋ blur 14px のすりガラス（`.cw-panel`・`.cw-card`） |
| 面（濃） | `--cw-surface-strong` | `rgba(24,36,84,.86)`。上の帯・下の出撃バー・押せない面 |
| 線 | `--cw-line` / `--cw-line-strong` | `rgba(148,170,255,.18)` / `.34`。上辺の光は `--cw-top-light` |
| 文字 | `--cw-fg` / `--cw-fg-2` / `--cw-fg-3` | `#eef2ff` / `#c3cbe6` / `#93a0c8`。**3段だけ**。面の上で 5.8:1 以上（計算ずみ） |
| **色の役目** | `--cw-action` | シアン `#38bdf8`：**行動**（いま押す・出撃・すすむ） |
| | `--cw-reward` | ゴールド `#facc15`：**ごほうび・星・コイン** |
| | `--cw-growth` | ミント `#6ee7b7`：**成長・学習・正解** |
| | `--cw-rare` | バイオレット `#a78bfa`：**めずらしい・スキル** |
| | `--cw-danger` | コーラル `#f87171`：**注意・危険・敵** |
| | `--cw-cat` | オレンジ `#fb923c`：**ネコの側** |
| 字の族 | `--cw-font` / `--cw-font-num` | 日本語は **M PLUS Rounded 1c**（`index.html` で 500/700/800 を読みこむ）。**Orbitron は ロゴ・数字・英字の小見出しだけ**（`font-cw-num`） |
| 字の大きさ | `text-cw-12/14/16/20/28/40` | **6段だけ**。12＝注記（最小）・14＝本文・16＝強めの本文・ボタン・20＝見出し小・28＝見出し・40＝ロゴ・大きな数字。**12px 未満は使わない**。数字は `tabular-nums`（body に設定ずみ） |
| 角 | `rounded-cw-sm/md/lg/pill` | 8（チップ・小さな札）/ 14（ボタン・カード）/ 22（大きなパネル）/ 999（ピル） |
| 影 | `shadow-cw-panel` | `0 10px 30px -12px rgba(0,0,0,.6)` ＋ 内側 1px 線 |
| 光 | `shadow-cw-lit-<役目>` | 役目の色でだけ。`0 0 0 1px` の線 ＋ `0 0 24px -8px` のにじみ の 1種類 |
| 動き | `.cw-press` / `.cw-enter` / `.cw-reward-pop` | 押す＝`scale(.97)` 0.12s／画面に入る＝下から 8px＋フェード 0.22s `cubic-bezier(.16,1,.3,1)`／ごほうび＝ゴールドの光がふくらむ 0.5s。`prefers-reduced-motion` では 止める（フェードだけ のこす） |

役目の色を 部品に渡すクラス `cw-tone-<action|reward|growth|rare|danger|cat|neutral>`（`--tone`・`--tone-bg`・`--tone-lit` が決まる）。

### 色の役目（画面ごとに変えない）

行動＝シアン／ごほうび・星・コイン＝ゴールド／成長・学習・正解＝ミント／めずらしい・スキル＝バイオレット／注意・危険・敵＝コーラル／ネコの側＝オレンジ。
**ほかの色は 系統色（ネコ 8系統の `accent`）と、シール・バッジ・施設・ネコ・ボスの絵の中だけ。** 枠の色で 画面の項目を 色分けしない
（枠は線。アイコンの色だけ 役目の色）。

## 2. 部品（`catwars/components/ui/`）

| 部品 | 使い方 |
|---|---|
| `Button` | `variant`＝primary（いま押す）・reward（ごほうび）・danger・secondary・ghost・success。`size`＝sm/md(48)/lg(56)/xl(64)/hero(96)。**最小 44px**。押せないときは `lockReason`（鍵＋わけの文）か `locked`。`disabled` は押せない（onClick を止める） |
| `Panel` | すりガラスの 1枚（角 22）。`strong` で濃く |
| `Card` | 押せるカード（角 14）。左に 絵（`icon="cats"` などのアイコン名か 絵）・題・説明（2行まで）・右に 状態（`right`）。`lockReason` で 🔒 |
| `TitleBar` | 画面の上の帯。**もどる（44px 以上の的）＋題＋右に数**。全部の画面で これを使う |
| `StatPill` | 💠⚡🪙🔥 の数。アイコン＋Orbitron の数字 |
| `Chip` | 小さな札（角 8・12px）。`tone` で 役目の色 |
| `SectionTitle` | 小見出し（14px）。左に 色のたて線 |
| `ProgressBar` | 進み具合（太さ 8）。0〜1 |
| `Segmented` | 横ならびの えらぶボタン（ラジオ。56px 以上） |
| `Disclosure` | たためる枠。見出し（52px）を押すとひらく。情報が多い画面は これで減らす |
| `ConfirmDialog` | 確認モーダル。`variant`＝primary・reward・danger |
| `ScreenBackdrop` | 画面のうしろの絵の差しこみ口（下を見よ） |
| `FacilityImg` | 施設の PNG（`public/assets/sprites/`）。施設を出す所は 絵文字でなく これ |
| `Icon` | 手描きアイコン。`<Icon name="sortie" size={32} />` |

アイコン（`ICON_NAMES`）：sortie（出撃）・cats（ネコ部隊）・collect（あつめる）・buff（バフ）・expedition（遠征）・friend（なかまの基地）・versus（対戦）・
credit（💠）・energy（⚡）・coin（🪙）・streak（🔥）・star・lock・back・heal（かいふく）・rage（げきおこ）・settings・check・warn・bulb（ヒント）・crown・
chevron・dex・medal・capsule・album・ribbon・shard（かけら）・enemy・target。足すときは 32×32・紺のりんかく太さ 2・ベタぬり・右下に影・左上にハイライト。

### 背景・エンブレム・カプセルの差しこみ口（絵は あとから 足す）

絵が無いときは 地（グラデ＋星）だけで きれいに出る。**同じ名前で上書きしない**（新しい名前で足して `ScreenBackdrop.tsx` などを書きかえる）。

| もの | 置き場所（`.webp` が先・無ければ `.png`） | 出る所 |
|---|---|---|
| 背景 | `public/assets/bg/bg-<home\|stage\|expedition\|collection\|friend\|versus>.webp` | `<ScreenBackdrop name="..." />`。opacity .55・下に向かって暗くなる重ね |
| エンブレム | `public/assets/emblem/emblem-catwars.webp` | ホームのロゴの左（無ければ 出撃のアイコン） |
| カプセルの機械 | `public/assets/capsule/capsule-machine.webp` | あつめる → カプセル（無ければ カプセルのアイコン） |

## 3. 使い方の例

よい例：

```tsx
<div className="cw-screen h-[100dvh] flex flex-col">
  <ScreenBackdrop name="stage" />
  <TitleBar title="ステージをえらぶ" onBack={onBack} right={<Chip tone="growth">3/8 章クリア</Chip>} />
  <div className="flex-1 overflow-y-auto cw-scroll px-4 cw-enter">
    <Panel><SectionTitle tone="danger">ボス</SectionTitle> ... </Panel>
    <Disclosure title="出てくる 敵" icon="enemy" defaultOpen> ... </Disclosure>
  </div>
  <Button variant="primary" size="xl" fullWidth>出撃メンバーを えらぶ →</Button>
</div>
```

わるい例（やらない）：

```tsx
<span className="text-[10px] text-white/40">…</span>          // 12px 未満・white/NN の文字色
<div style={{ background: '#1f2937', border: '2px solid #ef4444', color: '#9ca3af' }}>…  // 16進の直指定・役目のない色
<button className="px-2 py-1 text-xs rounded">…</button>         // 的が 44px 未満・角が 4段の外
<button>← もどる</button>                                      // 上の帯は TitleBar を使う
<span>⚔️ 出撃</span>                                           // 画面の絵文字は Icon か 絵に（文の中の小さな絵文字は よい）
<div className="bg-black/85">                                    // 黒一色の面。すりガラス（Panel・Card）を使う
```

## 4. 点検（直したら）

- 12px 未満の文字が 0・ボタンやリンクが 44×44px 以上・文字が面の上で 4.5:1 以上（大きい文字は 3:1。押せない表示だけ 例外）。
  Playwright で DOM を数える（1024×768 と 768×1024 の両方）。第1段の画面（ホーム・範囲えらび・ステージえらび・出撃メンバー・あつめる）・第2段の画面（陣地づくり・戦闘・解答画面の入れもの・結果）は 全部 0（解答画面の白い紙の中＝`apps/` は 数えない）。
- 背景の絵が無い状態で崩れないこと（いまは 無い）。仮の絵（単色の png）を置いて 差しこみ口が効くことも 確かめる（仮の絵は コミットしない）。
- `npm run check`。数値は 変えないので balance 系は 流さない（`npm run test:progress` だけ）。

## 5. 戦場・解答画面・結果（第2段 2026-11-23 で作りかえた）のきまり

- **`.cw-screen` は `position: relative` を持つ。** `absolute` / `fixed` の入れもの（ブリーフィング・結果・解く画面の暗転）には付けない（付けると 流れの中に 入って 戦場が つぶれる）。字の族は body が持っているので 付けなくてよい。
- **戦闘の画面**（`BattleScene`）：上の帯は `TitleBar`（章・段・脅威は `Chip`、⚡ は `StatPill`、「たいきゃく する」は `Button` sm）。
  下の操作は 2段で **的は 48px いじょう**：上＝まほう（`かいふく`／`げきおこ`＋「＋60⚡」）、下＝出撃するネコ（96×76）・強化・たてる（壁・砲台・キャンプ）。
  ⚡ が足りない・押せないときは `disabled`／`aria-disabled`（面を暗く・字を `--cw-fg-3`）。ネコへの めいれい（とつげき・まもる・たいき）は 盤面の中ではなく 画面の上に `Panel` で出す（盤面は 縮むので 的が 小さくなるため）。
- **問題カード**（`ProblemCards`）：下の操作の すぐ上に 横ならび。3まいの色の役目＝やさしい＝成長（ミント）・ふつう＝行動（シアン）・むずかしい＝めずらしい（バイオレット）。枠は 線のまま、色は 帯の ことばだけ。
  ⚡ が足りないときは `cw-card-on` ＋ `cw-nudge`（ゆっくり ふくらむ。ゆれない）。手札の高さは BattleScene が `--cw-hotbar-h` に入れる。
- **ネコ・敵の絵の大きさ**：sim の座標・当たり・箱は 変えず、絵だけ `scale(min(1.6, 58 / 体の幅))`（体が 58px 以上の子は そのまま）。HP バー・しるしは 拡大した絵の上に そろえる。
- **解答画面の紙**（`.app-paper`）：`apps/` は 変えず、`index.css` で 入れものだけ 直す。筆算（`.simulator-container`）は「ばんめん 600px ＋ テンキー 400px」の 横ならびなので、
  紙を 1000px まで ひろげてテンキーを 340px に せばめ（横 960px 以上）、せまい画面（縦）では たてに ならべる。低い画面（高さ 820px 以下）では テンキーと「チェック」を ひくくする。
  ばんめんの 入れものは 中央ぞろえだと はみだした左が 見えなくなるので 左ぞろえ＋自動の 横余白。
- **結果画面**：`Panel` strong の 1枚。上＝章の名前、主役＝星（大）と 💠（40px）、ボタンは 下に 固定（`reward`＝勝ち・`secondary`＝まけ）。勝ちは `cw-reward-pop` とゴールドの光、まけは 責めない（ネコのアイコン・赤を使わない）。
  遠征・なかまの結果の枠（`ExpeditionResultNote`・`FriendResultNote`）・`GainsSummary`・`NewSkillNotice` も `Panel`。

## 6. まだ 古い見た目の画面（第3段で作りかえる）

遠征の説明（`ExpeditionParts` の `ExpeditionScreen`）・なかまの基地（`FriendParts`）・対戦（`VersusParts`）・ネコ部隊（`ArmyRosterScreen`・`SkillList`）・バフ（`DailyBuffsPanel`）・なかまをよぶ（`ExchangePanel`）。
上の帯（`TitleBar`）・ホームのカード・背景の地は そろえてある。中身の `text-[10px]`・`text-white/NN`・16進の色・絵文字は 作りかえるときに トークンと部品へ。
戦場の盤面そのもの（格子・地形・ヒットの光・弾）は ゲームの絵として 今のまま。
