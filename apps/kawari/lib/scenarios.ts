// このファイルは単元アプリ syo4-kawarikatasirabe の src/lib/scenarios.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 「伴って変わる二つの数量」の場面カタログ。
 *
 * 出典（一次資料）:
 *  - 東京書籍『新しい算数4下』単元11「変わり方に注目して調べよう［変わり方調べ］」
 *    第1時＝時計盤（和が一定）／第2時＝正三角形を1列（差が一定）／第3時＝正方形の階段（4倍）
 *  - 学習指導要領解説 算数編 第4学年 C(1) p.216
 *    「和が一定，差が一定，一方を定数倍すると他方になるなどの対応の特徴」
 *  - 啓林館 わくわく算数 自己評価テスト「15．変わり方」（和が一定・4倍・折れ線グラフ）
 *  - 埼玉県教育委員会 東京書籍版 単元11「変わり方調べ」プリント NO1〜NO3（解答・配点つき）
 *    → 積が一定（24÷□＝○、□×○＝36）と 減法の形（□－4＝○）が実際に出題されている
 *  - 宮城県教育センター 単元11 ステップ（H16 宮城県学習状況調査より）
 *    → 正方形を1列にならべたまわりの長さ ＝ □×2＋2、「100このときは？」
 *
 * 設計上の注意（master-DB: patterns/… 2-A）:
 *  乱数プールは各類型8件以上そろえる。1類型2〜3件しかないと、
 *  「毎回同じ場面」になって児童が場面を暗記してしまう。
 */
import { Scenario, applyRel } from '../types';

/* ---------------- 和が一定（□ ＋ △ ＝ k） ---------------- */
export const SUM_SCENARIOS: Scenario[] = [
  {
    id: 'sum-clock',
    kind: 'sum', k: 12,
    story: '2つの時計ばんがあります。㋐のはりがさす数と㋑のはりがさす数を たすと いつも 12 になるように 動かします。',
    xName: '㋐がさす数', yName: '㋑がさす数', xUnit: '', yUnit: '',
    figure: 'clocks', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'sum-ohajiki',
    kind: 'sum', k: 8,
    story: '8このおはじきを、まいさんと妹で ぜんぶ 分けます。',
    xName: 'まいさんの数', yName: '妹の数', xUnit: 'こ', yUnit: 'こ',
    figure: 'counters', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'sum-ame',
    kind: 'sum', k: 12,
    story: '12このあめを、兄と弟で ぜんぶ 分けます。',
    xName: '兄の数', yName: '弟の数', xUnit: 'こ', yUnit: 'こ',
    figure: 'counters', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'sum-irogami',
    kind: 'sum', k: 18,
    story: '18まいの色紙を、姉と弟で ぜんぶ 分けます。',
    xName: '姉のまい数', yName: '弟のまい数', xUnit: 'まい', yUnit: 'まい',
    figure: 'counters', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'sum-book',
    kind: 'sum', k: 20,
    story: '20ページの本を 読んでいきます。読んだページ数と のこりのページ数を しらべます。',
    xName: '読んだページ数', yName: 'のこりのページ数', xUnit: 'ページ', yUnit: 'ページ',
    figure: 'tape', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'sum-isu',
    kind: 'sum', k: 15,
    story: 'いすが 15きゃく あります。すわっている人の数と、あいているいすの数を しらべます。',
    xName: 'すわった人数', yName: 'あいているいす', xUnit: '人', yUnit: 'きゃく',
    figure: 'items', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'sum-rect',
    kind: 'sum', k: 10,
    story: 'まわりの長さが 20cm の長方形を つくります。たての長さと よこの長さを たすと 10cm になります。',
    xName: 'たての長さ', yName: 'よこの長さ', xUnit: 'cm', yUnit: 'cm',
    figure: 'rect', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'sum-time',
    kind: 'sum', k: 30,
    story: '30分の学習時間を、算数と国語に 分けます。',
    xName: '算数の時間', yName: '国語の時間', xUnit: '分', yUnit: '分',
    figure: 'items', xs: [5, 10, 15, 20, 25],
  },
  {
    id: 'sum-seal',
    kind: 'sum', k: 24,
    story: '24まいのシールを、あきらさんと妹で ぜんぶ 分けます。',
    xName: 'あきらさんのまい数', yName: '妹のまい数', xUnit: 'まい', yUnit: 'まい',
    figure: 'counters', xs: [2, 4, 6, 8, 10],
  },
  {
    id: 'sum-ribbon',
    kind: 'sum', k: 16,
    story: '16cm のテープを 2本に切ります。',
    xName: '1本目の長さ', yName: '2本目の長さ', xUnit: 'cm', yUnit: 'cm',
    figure: 'tape', xs: [1, 2, 3, 4, 5],
  },
];

/* ---------------- 差が一定（□ ＋ k ＝ △） ---------------- */
export const DIFF_SCENARIOS: Scenario[] = [
  {
    id: 'diff-triangle',
    kind: 'diff', k: 2,
    story: '1辺が 1cm の正三角形を、1れつに ならべていきます。',
    xName: '正三角形の数', yName: 'まわりの長さ', xUnit: 'こ', yUnit: 'cm',
    figure: 'triangles', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'diff-sister',
    kind: 'diff', k: 3,
    story: 'ゆいさんは 妹より 3才 年上です。2人の年れいを しらべます。',
    xName: '妹の年れい', yName: 'ゆいさんの年れい', xUnit: '才', yUnit: '才',
    figure: 'ages', xs: [5, 6, 7, 8, 9],
  },
  {
    id: 'diff-mother',
    kind: 'diff', k: 28,
    story: 'お母さんは わたしより 28才 年上です。2人の年れいを しらべます。',
    xName: 'わたしの年れい', yName: 'お母さんの年れい', xUnit: '才', yUnit: '才',
    figure: 'ages', xs: [8, 9, 10, 11, 12],
  },
  {
    id: 'diff-card',
    kind: 'diff', k: 5,
    story: '弟は 兄より カードを 5まい 多く もっています。',
    xName: '兄のまい数', yName: '弟のまい数', xUnit: 'まい', yUnit: 'まい',
    figure: 'counters', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'diff-tank',
    kind: 'diff', k: 4,
    story: 'はじめに 4L の水が入っている水そうに、1分に 1L ずつ 水を入れていきます。',
    xName: '入れた時間', yName: '水のかさ', xUnit: '分', yUnit: 'L',
    figure: 'tank', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'diff-book',
    kind: 'diff', k: 7,
    story: 'きのうまでに 7ページ 読んだ本を、きょうから 1日 1ページずつ 読みます。',
    xName: '読んだ日数', yName: '読んだページ数', xUnit: '日', yUnit: 'ページ',
    figure: 'items', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'diff-ball',
    kind: 'diff', k: 6,
    story: '青いおはじきは、赤いおはじきより いつも 6こ 多く あります。',
    xName: '赤の数', yName: '青の数', xUnit: 'こ', yUnit: 'こ',
    figure: 'counters', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'diff-tape',
    kind: 'diff', k: 15,
    story: 'テープBは テープAより いつも 15cm 長く 切ります。',
    xName: 'テープAの長さ', yName: 'テープBの長さ', xUnit: 'cm', yUnit: 'cm',
    figure: 'tape', xs: [5, 10, 15, 20, 25],
  },
  {
    id: 'diff-clock',
    kind: 'diff', k: 3,
    story: 'いまの時こくと、その 3時間あとの 時こくを しらべます。',
    // 量の名前に 定数（3）を 入れないこと。入れると 答えが 問題文から そのまま 読めてしまう。
    xName: 'いまの時こく', yName: 'あとの時こく', xUnit: '時', yUnit: '時',
    figure: 'clocks', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'diff-stairs',
    kind: 'diff', k: 8,
    story: 'ゆうきさんは、はると さんより いつも 8だん 上に います。',
    xName: 'はるとさんのだん', yName: 'ゆうきさんのだん', xUnit: 'だん', yUnit: 'だん',
    figure: 'items', xs: [1, 2, 3, 4, 5],
  },
];

/* ---------------- 一方を定数倍（□ × k ＝ △） ---------------- */
export const TIMES_SCENARIOS: Scenario[] = [
  {
    id: 'times-stairs',
    kind: 'times', k: 4,
    story: '1辺が 1cm の正方形を、かいだんの形に ならべていきます。',
    xName: 'だんの数', yName: 'まわりの長さ', xUnit: 'だん', yUnit: 'cm',
    figure: 'stairs', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'times-square',
    kind: 'times', k: 4,
    story: '1辺の長さを かえて、正方形を かきます。',
    xName: '1辺の長さ', yName: 'まわりの長さ', xUnit: 'cm', yUnit: 'cm',
    figure: 'square', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'times-tri',
    kind: 'times', k: 3,
    story: '1辺の長さを かえて、正三角形を かきます。',
    xName: '1辺の長さ', yName: 'まわりの長さ', xUnit: 'cm', yUnit: 'cm',
    figure: 'polygon', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'times-hex',
    kind: 'times', k: 6,
    story: '1辺の長さを かえて、正六角形を かきます。',
    xName: '1辺の長さ', yName: 'まわりの長さ', xUnit: 'cm', yUnit: 'cm',
    figure: 'polygon', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'times-note',
    kind: 'times', k: 80,
    story: '1さつ 80円の ノートを 買います。',
    xName: 'ノートのさっ数', yName: '代金', xUnit: 'さつ', yUnit: '円',
    figure: 'items', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'times-cake',
    kind: 'times', k: 6,
    story: '1箱に 6こ入りの ケーキがあります。',
    xName: '箱の数', yName: 'ケーキの数', xUnit: '箱', yUnit: 'こ',
    figure: 'items', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'times-water',
    kind: 'times', k: 3,
    story: 'からの水そうに、1分に 3L ずつ 水を入れていきます。',
    xName: '入れた時間', yName: '水のかさ', xUnit: '分', yUnit: 'L',
    figure: 'tank', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'times-wire',
    kind: 'times', k: 4,
    story: '1m の重さが 4g の はり金があります。',
    xName: 'はり金の長さ', yName: '重さ', xUnit: 'm', yUnit: 'g',
    figure: 'items', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'times-paper',
    kind: 'times', k: 5,
    story: '1人に 5まいずつ 色紙を くばります。',
    xName: '人数', yName: '色紙のまい数', xUnit: '人', yUnit: 'まい',
    figure: 'counters', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'times-rect-area',
    kind: 'times', k: 8,
    story: 'たての長さが 8cm の長方形の、よこの長さを かえていきます。',
    xName: 'よこの長さ', yName: '面積', xUnit: 'cm', yUnit: 'cm²',
    figure: 'rect', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'times-walk',
    kind: 'times', k: 60,
    story: '1分間に 60m 歩きます。',
    xName: '歩いた時間', yName: '歩いた道のり', xUnit: '分', yUnit: 'm',
    figure: 'items', xs: [1, 2, 3, 4, 5],
  },
];

/* ---------------- 差が一定・□が大きい（□ － k ＝ ○） ----------------
   埼玉県 東京書籍版 NO2(3)「□才の兄さんと、4才年下の弟の年れい○才」の形。
   差が一定でも、大きい方を □ に置くと 式が 引き算に なる。この向きが 抜けやすい。 */
export const LESS_SCENARIOS: Scenario[] = [
  {
    id: 'less-brother',
    kind: 'less', k: 4,
    story: '兄は 弟より 4才 年上です。2人の年れいを しらべます。',
    xName: '兄の年れい', yName: '弟の年れい', xUnit: '才', yUnit: '才',
    figure: 'ages', xs: [8, 9, 10, 11, 12],
  },
  {
    id: 'less-height',
    kind: 'less', k: 6,
    story: '姉は 妹より 6cm 背が高いです。2人の身長を しらべます。',
    xName: '姉の身長', yName: '妹の身長', xUnit: 'cm', yUnit: 'cm',
    figure: 'ages', xs: [140, 141, 142, 143, 144],
  },
  {
    id: 'less-candy',
    kind: 'less', k: 3,
    story: 'もっている あめのうち、3こ 食べます。',
    xName: 'はじめの数', yName: 'のこりの数', xUnit: 'こ', yUnit: 'こ',
    figure: 'counters', xs: [5, 6, 7, 8, 9],
  },
  {
    id: 'less-money',
    kind: 'less', k: 150,
    story: 'もっているお金で 150円の ジュースを 買います。',
    xName: 'はじめのお金', yName: 'のこりのお金', xUnit: '円', yUnit: '円',
    figure: 'items', xs: [200, 250, 300, 350, 400],
  },
  {
    id: 'less-give',
    kind: 'less', k: 5,
    story: 'もっている おはじきのうち、5こを 弟に あげます。',
    xName: 'はじめの数', yName: 'のこりの数', xUnit: 'こ', yUnit: 'こ',
    figure: 'counters', xs: [7, 8, 9, 10, 11],
  },
  {
    id: 'less-book',
    kind: 'less', k: 8,
    story: '本を きのう 8ページ 読みました。',
    xName: '本のページ数', yName: 'のこりのページ数', xUnit: 'ページ', yUnit: 'ページ',
    figure: 'tape', xs: [20, 25, 30, 35, 40],
  },
  {
    id: 'less-rope',
    kind: 'less', k: 12,
    story: 'ロープから 12m を 切り取ります。',
    xName: 'はじめの長さ', yName: 'のこりの長さ', xUnit: 'm', yUnit: 'm',
    figure: 'tape', xs: [15, 20, 25, 30, 35],
  },
  {
    id: 'less-seat',
    kind: 'less', k: 2,
    story: 'バスの せきが いつも 2せき あいています。',
    xName: 'せきの数', yName: 'すわっている人数', xUnit: 'せき', yUnit: '人',
    figure: 'items', xs: [10, 12, 14, 16, 18],
  },
];

/* ---------------- 積が一定（□ × ○ ＝ k） ----------------
   埼玉県 東京書籍版 NO1(3)「24このビー玉を□人で分けた1人分○こ」＝ 24÷□＝○、
   NO2(4)「面積36c㎡の長方形のたて□とよこ○」＝ □×○＝36。
   □ は k の約数だけを使う（1人分が 小数に ならないようにする）。 */
export const PROD_SCENARIOS: Scenario[] = [
  {
    id: 'prod-beads',
    kind: 'prod', k: 24,
    story: '24このビー玉を、何人かで 同じ数ずつ 分けます。',
    xName: '分ける人数', yName: '1人分の数', xUnit: '人', yUnit: 'こ',
    figure: 'counters', xs: [1, 2, 3, 4, 6],
  },
  {
    id: 'prod-rect36',
    kind: 'prod', k: 36,
    story: '面積が 36cm² の 長方形を つくります。',
    xName: 'たての長さ', yName: 'よこの長さ', xUnit: 'cm', yUnit: 'cm',
    figure: 'rect', xs: [1, 2, 3, 4, 6],
  },
  {
    id: 'prod-choco',
    kind: 'prod', k: 24,
    story: '24このチョコレートを、みんなで 同じ数ずつ 分けます。',
    xName: '人数', yName: '1人分の数', xUnit: '人', yUnit: 'こ',
    figure: 'items', xs: [2, 3, 4, 6, 8],
  },
  {
    id: 'prod-bag',
    kind: 'prod', k: 36,
    story: '36このあめを、ふくろに 同じ数ずつ 入れます。',
    xName: 'ふくろの数', yName: '1ふくろ分の数', xUnit: 'ふくろ', yUnit: 'こ',
    figure: 'counters', xs: [1, 2, 3, 4, 6],
  },
  {
    id: 'prod-rect48',
    kind: 'prod', k: 48,
    story: '面積が 48cm² の 長方形を つくります。',
    xName: 'たての長さ', yName: 'よこの長さ', xUnit: 'cm', yUnit: 'cm',
    figure: 'rect', xs: [1, 2, 3, 4, 6],
  },
  {
    id: 'prod-paper',
    kind: 'prod', k: 60,
    story: '60まいの色紙を、みんなで 同じ数ずつ 分けます。',
    xName: '人数', yName: '1人分のまい数', xUnit: '人', yUnit: 'まい',
    figure: 'counters', xs: [2, 3, 4, 5, 6],
  },
  {
    id: 'prod-cookie',
    kind: 'prod', k: 18,
    story: '18このクッキーを、お皿に 同じ数ずつ のせます。',
    xName: 'お皿の数', yName: '1皿分の数', xUnit: '皿', yUnit: 'こ',
    figure: 'items', xs: [1, 2, 3, 6, 9],
  },
  {
    id: 'prod-rect24',
    kind: 'prod', k: 24,
    story: '面積が 24cm² の 長方形を つくります。',
    xName: 'たての長さ', yName: 'よこの長さ', xUnit: 'cm', yUnit: 'cm',
    figure: 'rect', xs: [1, 2, 3, 4, 6],
  },
];

/* ---------------- □ × k ＋ b ＝ ○（同じ数ずつふえるが、はじめにいくつかある） ----------------
   宮城県教育センター ステップ（H16 宮城県学習状況調査より）
   「1辺1cmの正方形を1列にならべる → まわりの長さ ＝ □×2＋2、100このときは？」
   和・差・倍のどれでもないが、県の学習状況調査で実際に出ている重要な型。 */
export const LINEAR_SCENARIOS: Scenario[] = [
  {
    id: 'lin-strip',
    kind: 'linear', k: 2, b: 2,
    story: '1辺が 1cm の正方形を、1れつに ならべていきます。',
    xName: '正方形の数', yName: 'まわりの長さ', xUnit: 'こ', yUnit: 'cm',
    figure: 'strip', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'lin-match4',
    kind: 'linear', k: 3, b: 1,
    story: 'マッチぼうで、正方形を 1れつに つなげて つくります。',
    xName: '正方形の数', yName: 'マッチぼうの数', xUnit: 'こ', yUnit: '本',
    figure: 'matches', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'lin-match3',
    kind: 'linear', k: 2, b: 1,
    story: 'マッチぼうで、正三角形を 1れつに つなげて つくります。',
    xName: '正三角形の数', yName: 'マッチぼうの数', xUnit: 'こ', yUnit: '本',
    figure: 'matches', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'lin-bench',
    kind: 'linear', k: 3, b: 2,
    story: '長いす 1きゃくに 3人ずつ すわり、そのほかに 先生が 2人 います。',
    xName: '長いすの数', yName: 'ぜんぶの人数', xUnit: 'きゃく', yUnit: '人',
    figure: 'items', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'lin-pencil',
    kind: 'linear', k: 80, b: 50,
    story: '1本 80円の えんぴつを 買って、50円の 箱に 入れて もらいます。',
    xName: 'えんぴつの数', yName: '代金', xUnit: '本', yUnit: '円',
    figure: 'items', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'lin-tank',
    kind: 'linear', k: 3, b: 5,
    story: 'はじめに 5L の水が入っている水そうに、1分に 3L ずつ 水を入れます。',
    xName: '入れた時間', yName: '水のかさ', xUnit: '分', yUnit: 'L',
    figure: 'tank', xs: [1, 2, 3, 4, 5],
  },
  {
    id: 'lin-park',
    kind: 'linear', k: 200, b: 400,
    story: '1人 200円の 入園りょうと、車 1台 400円の ちゅう車りょうが かかります。',
    xName: '入る人数', yName: 'かかるお金', xUnit: '人', yUnit: '円',
    figure: 'items', xs: [1, 2, 3, 4, 5],
  },
];

export const ALL_SCENARIOS: Scenario[] = [
  ...SUM_SCENARIOS, ...DIFF_SCENARIOS, ...LESS_SCENARIOS,
  ...TIMES_SCENARIOS, ...PROD_SCENARIOS, ...LINEAR_SCENARIOS,
];

/**
 * グラフに かける場面だけ（軸の最大値が大きすぎないもの）。折れ線グラフモジュール用。
 * 積が一定（prod）は 点を つなぐと 直線に ならず、4年の 折れ線グラフの 読み取りに
 * 適さないので のぞく。この除外で 落ちる問題の形は「反比例のグラフ」だけで、
 * それは 6年の内容なので この単元では 出題されない。
 */
export const GRAPHABLE: Scenario[] = ALL_SCENARIOS.filter((s) => {
  if (s.kind === 'prod') return false;
  const xs = s.xs ?? [1, 2, 3, 4, 5];
  const maxX = Math.max(...xs);
  const ys = xs.map((x) => applyRel(s, x));
  return maxX <= 10 && Math.max(...ys) <= 24 && Math.min(...ys) >= 0;
});

/**
 * 「一方を決めれば もう一方が ただ1つに決まるか」の判定問題に使う組。
 * 解説 p.215「下の辺の長さを決めても周りの長さは1つには決まらない」の
 * 反例づくり。決まる例だけを出すと、単元の中心の見方（関数の考え）が育たない。
 */
export interface PairCandidate {
  a: string;
  b: string;
  decided: boolean;
  why: string;
}

export const PAIR_CANDIDATES: PairCandidate[] = [
  { a: '正方形の1辺の長さ', b: 'まわりの長さ', decided: true, why: '1辺が決まれば まわりの長さは 1辺×4 で ただ1つに決まるね。' },
  { a: '買うノートのさっ数', b: '代金', decided: true, why: '1さつのねだんが 同じなら、さっ数が決まると 代金も 1つに決まるね。' },
  { a: '水を入れた時間', b: '水のかさ', decided: true, why: '1分に入る水の量が 同じなら、時間が決まると かさも 1つに決まるね。' },
  { a: '正三角形の数', b: 'まわりの長さ', decided: true, why: 'ならべた正三角形の数が決まれば、まわりの長さも 1つに決まるね。' },
  { a: '兄が食べたあめの数', b: '弟が食べたあめの数', decided: true, why: '全部の数が 決まっているなら、かた方が決まると もう一方も決まるね。' },
  { a: '読んだ日数', b: '読んだページ数', decided: true, why: '1日に読むページ数が 同じなら、日数が決まると ページ数も決まるね。' },
  { a: 'かいだんのだんの数', b: 'まわりの長さ', decided: true, why: 'だんの数が決まれば 形が決まるので、まわりの長さも 1つに決まるね。' },
  { a: 'たての長さ', b: '長方形の面積', decided: false, why: 'よこの長さが わからないと、たてが決まっても 面積は 1つに決まらないよ。' },
  { a: '人の年れい', b: 'その人の身長', decided: false, why: '同じ年れいでも 身長は 人によって ちがうから、1つに決まらないね。' },
  { a: '買った品物の数', b: 'おつり', decided: false, why: '出したお金が わからないと、おつりは 1つに決まらないよ。' },
  { a: '日づけ', b: 'その日の気温', decided: false, why: '同じ日づけでも 気温は 年によって ちがうから、1つに決まらないね。' },
  { a: '名前の字数', b: 'その人の体重', decided: false, why: '字数と体重には きまった関係が ないから、1つに決まらないよ。' },
  { a: 'テストの点数', b: '勉強した時間', decided: false, why: '同じ点数でも 勉強した時間は 人によって ちがうね。' },
  { a: 'クラスの人数', b: '教室の広さ', decided: false, why: '人数が同じでも 教室の広さは ちがうことが あるね。' },
];


/**
 * 「かた方が ふえると もう一方は ふえる？ へる？」の一覧判定に使う組。
 * 宮城県教育センター 単元11 ホップ 大問2 の形（5項目に ○／△ を つける）。
 */
export interface DirectionCandidate {
  label: string;
  /** true = ふえる / false = へる */
  up: boolean;
}

export const DIRECTION_CANDIDATES: DirectionCandidate[] = [
  { label: '入れ物に ジュースを 入れた時間 と たまった ジュースの量', up: true },
  { label: 'はしごの だんの数 と 下からの 高さ', up: true },
  { label: '歩いた時間 と 歩いた 道のり', up: true },
  { label: '買った えんぴつの数 と 代金', up: true },
  { label: '正方形の 1辺の長さ と まわりの長さ', up: true },
  { label: 'ならべた 正三角形の数 と まわりの長さ', up: true },
  { label: '飲んだ 牛にゅうの量 と のこった 牛にゅうの量', up: false },
  { label: 'ろうそくを もやした時間 と のこった ろうそくの長さ', up: false },
  { label: '使ったお金 と のこりのお金', up: false },
  { label: '読んだ ページ数 と のこりの ページ数', up: false },
  { label: '24このあめを 分ける人数 と 1人分の数', up: false },
  { label: '水そうから 水を 出した時間 と のこりの 水の量', up: false },
];
