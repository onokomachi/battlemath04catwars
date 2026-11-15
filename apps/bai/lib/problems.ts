// このファイルは単元アプリ syo4-bainomikata の src/lib/problems.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 「倍の見方」単元（小4）の問題ジェネレーター集。
 * 関係式: 比較量（くらべられる量）＝ 基準量（もとにする量）× 倍
 *   - 比較量 ÷ 基準量 ＝ 倍　　　　（何倍かを求める）
 *   - 基準量 × 倍 ＝ 比較量　　　（何倍かにあたる量を求める）
 *   - 比較量 ÷ 倍 ＝ 基準量　　　（もとにする量を求める）
 *   - 割合（倍）の考え方で 2つの量の変化を くらべる（差ではなく倍）
 *
 * - kihon         : 基礎（倍の見方 入門・小さい整数で テープ図のイメージ）
 * - times         : 何倍かを求める（比較量÷基準量）
 * - compare       : 何倍かにあたる量を求める（基準量×倍）
 * - base          : もとにする量を求める（比較量÷倍）
 * - ratio-compare : 割合で 2つを くらべる（ゴムA/B型）
 * - word          : 文章題（しき選択 → 計算の 2段階）
 * - error         : エラーハンター（倍の見方 頻出の誤り）
 */

function rnd(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }

/* =====================================================================
 * 式の選択肢
 *
 * 単元テストは式と答えを別々に採点する（式が正しければ計算の答えが誤っていても配点可）。
 * 「どんな計算になるか」を答えの数値とは独立に問えるようにする。
 * =================================================================== */

export type ShikiKind =
  | 'times'     // 何倍か        : くらべられる量 ÷ もとにする量
  | 'compare'   // くらべられる量: もとにする量 × 倍
  | 'base'      // もとにする量  : くらべられる量 ÷ 倍
  | 'relation'; // 関係式        : □ × 倍 ＝ くらべられる量

export interface ShikiChoices {
  choices: string[];
  correctIndex: number;
  /** まちがえたときのヒント */
  hint: string;
}

/**
 * まちがいの選択肢が「計算すると正解と同じ数になってしまう」のを避ける。
 * 例) もとにする量2・倍2 のとき くらべられる量は4 で、4−2 も 2 になり、
 *     ひき算の誤答が正解の数と一致してしまう。
 */
export function buildShikiChoices(kind: ShikiKind, base: number, times: number, compare: number): ShikiChoices {
  let correct: string;
  let distractors: string[];
  let hint: string;

  switch (kind) {
    case 'times':
      correct = `${compare} ÷ ${base}`;
      distractors = [
        `${base} ÷ ${compare}`,
        compare - base === times ? `${base} × ${times}` : `${compare} − ${base}`,
      ];
      hint = `「何倍か」を もとめるのは わり算だよ。もとにする量（${base}）で わろう。ひき算だと「ちがい」しか わからないよ。`;
      break;
    case 'compare':
      correct = `${base} × ${times}`;
      distractors = [
        `${base} ÷ ${times}`,
        // もとにする量2・倍2 のときだけ「もとにする量＋倍」が正解と同じ4になってしまう。
        // その場合は「何倍かを もとめる式」を誤答にする（値も表記も正解と重ならない）。
        base + times === compare ? `${compare} ÷ ${base}` : `${base} + ${times}`,
      ];
      hint = `「◯倍に あたる量」を もとめるのは かけ算だよ。もとにする量（${base}）に 倍（${times}）を かけよう。`;
      break;
    case 'base':
      correct = `${compare} ÷ ${times}`;
      distractors = [
        `${compare} × ${times}`,
        compare - times === base ? `${times} ÷ ${compare}` : `${compare} − ${times}`,
      ];
      hint = `もとにする量を □ とすると □ × ${times} ＝ ${compare}。□ を もとめるには わり算を するよ。`;
      break;
    case 'relation':
      correct = `□ × ${times} ＝ ${compare}`;
      distractors = [
        `□ ÷ ${times} ＝ ${compare}`,
        `${times} × ${compare} ＝ □`,
      ];
      hint = `もとにする量（□）を ${times}倍 すると くらべられる量（${compare}）に なる、という かんけいだよ。`;
      break;
  }

  const options = [correct, ...distractors].sort(() => Math.random() - 0.5);
  return { choices: options, correctIndex: options.indexOf(correct), hint };
}

/** 場面（テープ図・文章題で共通に使う「基準量／比較量」のペア設定） */
interface Scene {
  baseName: string;
  compareName: string;
  measure: string; // 体重・高さ・ねだん・身長 など
  unit: string;
  emoji: string;
}

const SCENES: Scene[] = [
  { baseName: '子どもの イルカ', compareName: 'おやの イルカ', measure: '体重', unit: 'kg', emoji: '🐬' },
  { baseName: '学校', compareName: 'ビル', measure: '高さ', unit: 'm', emoji: '🏫' },
  { baseName: 'りんご', compareName: 'メロン', measure: 'ねだん', unit: '円', emoji: '🍎' },
  { baseName: '妹', compareName: 'お兄さん', measure: '身長', unit: 'cm', emoji: '📏' },
  { baseName: '去年の 木', compareName: '今年の 木', measure: '高さ', unit: 'cm', emoji: '🌳' },
  { baseName: '小さい水そう', compareName: '大きい水そう', measure: '入る水の 量', unit: 'L', emoji: '🪣' },
];

/* =====================================================================
 * 基礎：倍の見方 入門
 * =================================================================== */

export type KihonLevel = 'kihon-find-compare' | 'kihon-find-times' | 'kihon-find-base';

export const KIHON_LEVELS: { id: KihonLevel; label: string; desc: string }[] = [
  { id: 'kihon-find-compare', label: '比較量を もとめる', desc: 'もとにする量 × 倍 ＝ くらべられる量' },
  { id: 'kihon-find-times', label: '倍を もとめる', desc: 'くらべられる量 ÷ もとにする量 ＝ 倍' },
  { id: 'kihon-find-base', label: '基準量を もとめる', desc: 'くらべられる量 ÷ 倍 ＝ もとにする量' },
];

export interface BaiTapeProblem {
  base: number;      // 基準量（もとにする量）
  times: number;     // 倍
  compare: number;   // 比較量（くらべられる量）
  missing: 'compare' | 'times' | 'base';
  scene: Scene;
  hint: string;
  explain: string;
}

export function generateKihon(level: KihonLevel): BaiTapeProblem {
  const scene = pick(SCENES);
  const base = rnd(2, 9);
  const times = rnd(2, 6);
  const compare = base * times;
  switch (level) {
    case 'kihon-find-compare':
      return {
        base, times, compare, missing: 'compare', scene,
        hint: `${scene.baseName}の${scene.measure}（${base}${scene.unit}）を「1」と見ると、${scene.compareName}は「${times}」にあたるよ。もとにする量 × 倍 ＝ くらべられる量 で もとめよう。`,
        explain: `${base} × ${times} ＝ ${compare}。${scene.compareName}の${scene.measure}は ${compare}${scene.unit}だね。`,
      };
    case 'kihon-find-times':
      return {
        base, times, compare, missing: 'times', scene,
        hint: `${scene.baseName}の${scene.measure}（${base}${scene.unit}）を「1」と見ると、${scene.compareName}（${compare}${scene.unit}）は いくつに あたるかな？ くらべられる量 ÷ もとにする量 で もとめよう。`,
        explain: `${compare} ÷ ${base} ＝ ${times}。${scene.compareName}は ${scene.baseName}の ${times}倍だね。`,
      };
    case 'kihon-find-base':
      return {
        base, times, compare, missing: 'base', scene,
        hint: `${scene.compareName}の${scene.measure}（${compare}${scene.unit}）は、${scene.baseName}の ${times}倍。くらべられる量 ÷ 倍 ＝ もとにする量 で もとめよう。`,
        explain: `${compare} ÷ ${times} ＝ ${base}。${scene.baseName}の${scene.measure}は ${base}${scene.unit}だね。`,
      };
  }
}

/* =====================================================================
 * 何倍かを もとめる（比較量 ÷ 基準量 ＝ 倍）
 * =================================================================== */

export type TimesLevel = 'times-basic' | 'times-big';

export const TIMES_LEVELS: { id: TimesLevel; label: string; desc: string }[] = [
  { id: 'times-basic', label: 'かんたんな 数で', desc: '倍が 2〜9で ぴったり わりきれる' },
  { id: 'times-big', label: '大きな 数で', desc: 'テストの大問1のような 2〜3けたの 数で' },
];

export interface BaseTimesProblem {
  base: number;
  times: number;
  compare: number;
  scene: Scene;
  hint: string;
  explain: string;
}

export function generateTimes(level: TimesLevel): BaseTimesProblem {
  const scene = pick(SCENES);
  if (level === 'times-basic') {
    const base = rnd(2, 12);
    const times = rnd(2, 9);
    const compare = base * times;
    return {
      base, times, compare, scene,
      hint: `${scene.baseName}を「1」と見よう。${compare} ÷ ${base} を 計算すると、${scene.compareName}は いくつに あたるかな？`,
      explain: `くらべられる量 ÷ もとにする量 ＝ 倍。${compare} ÷ ${base} ＝ ${times}。${times}倍だね。`,
    };
  }
  const base = rnd(12, 96);
  const times = rnd(2, 9);
  const compare = base * times;
  return {
    base, times, compare, scene,
    hint: `${scene.baseName}の${scene.measure}（${base}${scene.unit}）を「1」と見ると、${scene.compareName}（${compare}${scene.unit}）は いくつに あたるかな？ ${compare} ÷ ${base} を 計算しよう。`,
    explain: `くらべられる量 ÷ もとにする量 ＝ 倍。${compare} ÷ ${base} ＝ ${times}。${scene.compareName}は ${scene.baseName}の ${times}倍だね。`,
  };
}

/* =====================================================================
 * 何倍かにあたる量を もとめる（基準量 × 倍 ＝ 比較量）
 * =================================================================== */

export type CompareLevel = 'compare-basic' | 'compare-big';

export const COMPARE_LEVELS: { id: CompareLevel; label: string; desc: string }[] = [
  { id: 'compare-basic', label: 'かんたんな 数で', desc: 'もとにする量 × 倍（2〜9）' },
  { id: 'compare-big', label: '大きな 数で', desc: 'テストの大問2のような 大きい数で' },
];

export interface BaseCompareProblem {
  base: number;
  times: number;
  compare: number;
  scene: Scene;
  hint: string;
  explain: string;
}

export function generateCompare(level: CompareLevel): BaseCompareProblem {
  const scene = pick(SCENES);
  const base = level === 'compare-basic' ? rnd(2, 12) : rnd(12, 45);
  const times = rnd(2, 9);
  const compare = base * times;
  return {
    base, times, compare, scene,
    hint: `${scene.baseName}の${scene.measure}（${base}${scene.unit}）を「1」と見ると、${scene.compareName}は「${times}」にあたるよ。もとにする量 × 倍 ＝ くらべられる量 で もとめよう。`,
    explain: `${base} × ${times} ＝ ${compare}。${scene.compareName}の${scene.measure}は ${compare}${scene.unit}だね。`,
  };
}

/* =====================================================================
 * もとにする量を もとめる（比較量 ÷ 倍 ＝ 基準量）
 * =================================================================== */

export type BaseLevel = 'base-basic' | 'base-big';

export const BASE_LEVELS: { id: BaseLevel; label: string; desc: string }[] = [
  { id: 'base-basic', label: 'かんたんな 数で', desc: 'くらべられる量 ÷ 倍（2〜9）' },
  { id: 'base-big', label: '大きな 数で', desc: 'テストの大問3のような 大きい数で' },
];

export interface BaseBaseProblem {
  base: number;
  times: number;
  compare: number;
  scene: Scene;
  hint: string;
  explain: string;
}

export function generateBase(level: BaseLevel): BaseBaseProblem {
  const scene = pick(SCENES);
  const times = rnd(2, 9);
  const base = level === 'base-basic' ? rnd(2, 12) : rnd(12, 45);
  const compare = base * times;
  return {
    base, times, compare, scene,
    hint: `もとにする量を □ とすると、□ × ${times} ＝ ${compare}。□ ＝ ${compare} ÷ ${times} で もとめよう。`,
    explain: `${scene.compareName}の${scene.measure}（${compare}${scene.unit}）は、${scene.baseName}の ${times}倍。${compare} ÷ ${times} ＝ ${base}。${scene.baseName}の${scene.measure}は ${base}${scene.unit}だね。`,
  };
}

/* =====================================================================
 * 割合（倍）で くらべる
 * =================================================================== */

export type RatioCompareLevel = 'ratio-compare-basic' | 'ratio-compare-diff';

export const RATIO_COMPARE_LEVELS: { id: RatioCompareLevel; label: string; desc: string }[] = [
  { id: 'ratio-compare-basic', label: 'どちらが 何倍か', desc: 'ゴムA・Bの のびを 倍で くらべよう' },
  { id: 'ratio-compare-diff', label: '差ではなく 倍で', desc: '差は 同じでも 倍で くらべると ちがう！' },
];

interface PairScene { itemA: string; itemB: string; measure: string; unit: string; emojiA: string; emojiB: string; verb: string }
const PAIR_SCENES: PairScene[] = [
  { itemA: 'ゴムA', itemB: 'ゴムB', measure: '長さ', unit: 'cm', emojiA: '🟥', emojiB: '🟦', verb: 'のばす' },
  { itemA: 'バネA', itemB: 'バネB', measure: '長さ', unit: 'cm', emojiA: '🌀', emojiB: '🌀', verb: 'おもりを つるす' },
  { itemA: '植物A', itemB: '植物B', measure: '高さ', unit: 'cm', emojiA: '🌱', emojiB: '🌿', verb: '育てる' },
];

export interface RatioCompareProblem {
  pair: PairScene;
  beforeA: number; afterA: number; timesA: number;
  beforeB: number; afterB: number; timesB: number;
  diffA: number; diffB: number;
  biggerLabel: 'A' | 'B';
  /**
   * 「変化が 小さいのは どちらか」を問うか。
   * 単元テストの「いかそう算数」は "上がり方が小さいのはどちら" と小さい側を問う。
   * 大きい側だけで練習すると、反射で大きい方を選んで誤答するため、向きをランダム化する。
   */
  askSmaller: boolean;
  /** askSmaller を踏まえて実際に答えるべきラベル */
  answerLabel: 'A' | 'B';
  showDiffTrap: boolean; // 差が同じ（または差だけ見ると逆に見える）ことに気づかせる
  hint: string;
  explain: string;
}

/** 「大きい方/小さい方」の問い方をランダムに決め、対応する正解ラベルを返す */
function decideDirection(timesA: number, timesB: number): { askSmaller: boolean; biggerLabel: 'A' | 'B'; answerLabel: 'A' | 'B' } {
  const biggerLabel: 'A' | 'B' = timesA > timesB ? 'A' : 'B';
  const smallerLabel: 'A' | 'B' = biggerLabel === 'A' ? 'B' : 'A';
  const askSmaller = Math.random() < 0.5;
  return { askSmaller, biggerLabel, answerLabel: askSmaller ? smallerLabel : biggerLabel };
}

export function generateRatioCompare(level: RatioCompareLevel): RatioCompareProblem {
  const pair = pick(PAIR_SCENES);
  if (level === 'ratio-compare-basic') {
    const beforeA = rnd(10, 30);
    const timesA = rnd(2, 4);
    const afterA = beforeA * timesA;
    const beforeB = rnd(10, 30);
    let timesB = rnd(2, 4);
    while (timesB === timesA) timesB = rnd(2, 4);
    const afterB = beforeB * timesB;
    const dir = decideDirection(timesA, timesB);
    return {
      pair, beforeA, afterA, timesA, beforeB, afterB, timesB,
      diffA: afterA - beforeA, diffB: afterB - beforeB,
      ...dir, showDiffTrap: false,
      hint: `${pair.itemA}は ${beforeA}${pair.unit} → ${afterA}${pair.unit}、${pair.itemB}は ${beforeB}${pair.unit} → ${afterB}${pair.unit}。それぞれ「あと ÷ まえ」で 倍を もとめて くらべよう。`,
      explain: `${pair.itemA}は ${afterA} ÷ ${beforeA} ＝ ${timesA}倍。${pair.itemB}は ${afterB} ÷ ${beforeB} ＝ ${timesB}倍。倍が ${dir.askSmaller ? '小さい' : '大きい'} ${dir.answerLabel === 'A' ? pair.itemA : pair.itemB} の方が、変化が ${dir.askSmaller ? '小さい' : '大きい'}と いえるね。`,
    };
  }
  // ratio-compare-diff: 差は同じ（または差だけでは分かりにくい）が、倍で比べると結論がちがう。
  // timesA・timesBを先に整数で決め、そこから差(diff)が両者で一致するように beforeA を逆算する
  // （数値入力は整数しか受け付けないため、timesBが必ず整数になるよう構成する。割り算の余りに頼らない）。
  const timesA = 2;
  const timesB = pick([3, 4, 5, 6]);
  const beforeB = rnd(8, 20);
  const diff = beforeB * (timesB - 1); // afterB − beforeB
  const beforeA = diff; // timesA=2 なので diffA(=beforeA) が diff と一致する
  const afterA = beforeA * timesA;
  const afterB = beforeB + diff;
  const dir = decideDirection(timesA, timesB);
  return {
    pair, beforeA, afterA, timesA, beforeB, afterB, timesB,
    diffA: afterA - beforeA, diffB: afterB - beforeB,
    ...dir, showDiffTrap: true,
    hint: `差（ふえた量）は どちらも 同じ ${diff}${pair.unit}だったね。でも「もとの 何倍に なったか」で くらべると どうかな？ あと ÷ まえ を 計算しよう。`,
    explain: `差は どちらも ${diff}${pair.unit}で 同じ。でも 倍で くらべると、${pair.itemA}は ${timesA}倍、${pair.itemB}は ${timesB}倍。差ではなく 倍（割合）で くらべると、変化が ${dir.askSmaller ? '小さい' : '大きい'}のは ${dir.answerLabel === 'A' ? pair.itemA : pair.itemB} だと いえるね。`,
  };
}

/* =====================================================================
 * 文章題
 * =================================================================== */

export type WordLevel = 'wp-times' | 'wp-compare' | 'wp-base' | 'wp-ratio';

export const WORD_LEVELS: { id: WordLevel; label: string; desc: string }[] = [
  { id: 'wp-times', label: '何倍かを もとめる', desc: 'くらべられる量 ÷ もとにする量' },
  { id: 'wp-compare', label: '比較量を もとめる', desc: 'もとにする量 × 倍' },
  { id: 'wp-base', label: '基準量を もとめる', desc: 'くらべられる量 ÷ 倍' },
  { id: 'wp-ratio', label: '割合で くらべる', desc: '2つの ものを 倍で くらべよう' },
];

interface WordScene { base: string; compare: string; measure: string; unit: string; emoji: string }
const WORD_SCENES: WordScene[] = [
  { base: '生まれたときの 子犬', compare: '1年後の 子犬', measure: '体重', unit: 'kg', emoji: '🐶' },
  { base: '芽が出たときの ヒマワリ', compare: '夏の ヒマワリ', measure: '高さ', unit: 'cm', emoji: '🌻' },
  { base: 'ノート', compare: '図鑑', measure: 'ねだん', unit: '円', emoji: '📗' },
  { base: '先月の 図書室の かし出し', compare: '今月の かし出し', measure: 'さっすう', unit: 'さつ', emoji: '📚' },
  { base: '弟の 貯金', compare: '兄の 貯金', measure: '貯金額', unit: '円', emoji: '🐷' },
];

export interface BaiWordProblem {
  kind: 'single' | 'ratio';
  text: string;
  emoji: string;
  // single（times / compare / base）
  base?: number;
  times?: number;
  compare?: number;
  choices?: string[];       // しきの選択肢
  correctIndex?: number;
  missing?: 'times' | 'compare' | 'base';
  finalAnswer?: number;
  finalUnit?: string;
  finalPrompt?: string;
  // ratio
  pair?: PairScene;
  beforeA?: number; afterA?: number; timesA?: number;
  beforeB?: number; afterB?: number; timesB?: number;
  biggerLabel?: 'A' | 'B';
  askSmaller?: boolean;
  answerLabel?: 'A' | 'B';
  why: string;
  finalWhy: string;
}

function buildWordChoices(base: number, times: number, compare: number, missing: 'times' | 'compare' | 'base') {
  if (missing === 'times') {
    const options = [`${compare} ÷ ${base}`, `${base} ÷ ${compare}`, `${compare} − ${base}`].sort(() => Math.random() - 0.5);
    return { choices: options, correctIndex: options.indexOf(`${compare} ÷ ${base}`) };
  }
  if (missing === 'compare') {
    const options = [`${base} × ${times}`, `${base} ÷ ${times}`, `${base} + ${times}`].sort(() => Math.random() - 0.5);
    return { choices: options, correctIndex: options.indexOf(`${base} × ${times}`) };
  }
  const options = [`${compare} ÷ ${times}`, `${compare} × ${times}`, `${compare} − ${times}`].sort(() => Math.random() - 0.5);
  return { choices: options, correctIndex: options.indexOf(`${compare} ÷ ${times}`) };
}

export function generateWord(level: WordLevel): BaiWordProblem {
  if (level === 'wp-ratio') {
    const p = generateRatioCompare(pick(['ratio-compare-basic', 'ratio-compare-diff'] as const));
    return {
      kind: 'ratio',
      text: `${p.pair.itemA}を ${p.beforeA}${p.pair.unit}から ${p.pair.verb}と ${p.afterA}${p.pair.unit}に、${p.pair.itemB}を ${p.beforeB}${p.pair.unit}から ${p.afterB}${p.pair.unit}に しました。変化の しかたが ${p.askSmaller ? '小さい' : '大きい'}のは どちらですか？`,
      emoji: p.pair.emojiA,
      pair: p.pair,
      askSmaller: p.askSmaller, answerLabel: p.answerLabel,
      beforeA: p.beforeA, afterA: p.afterA, timesA: p.timesA,
      beforeB: p.beforeB, afterB: p.afterB, timesB: p.timesB,
      biggerLabel: p.biggerLabel,
      why: `それぞれ「のばした後 ÷ のばす前」で 倍を もとめて くらべよう。差ではなく 倍で くらべるのが ポイントだよ。`,
      finalWhy: p.explain,
    };
  }

  const scene = pick(WORD_SCENES);
  const missing: 'times' | 'compare' | 'base' = level === 'wp-times' ? 'times' : level === 'wp-compare' ? 'compare' : 'base';
  const times = rnd(2, 9);
  const base = rnd(14, 96);
  const compare = base * times;
  const { choices, correctIndex } = buildWordChoices(base, times, compare, missing);

  if (missing === 'times') {
    return {
      kind: 'single',
      text: `${scene.base}の${scene.measure}は ${base}${scene.unit}でしたが、${scene.compare}は ${compare}${scene.unit}に なりました。${scene.compare}の${scene.measure}は、${scene.base}の 何倍ですか？`,
      emoji: scene.emoji, base, times, compare, choices, correctIndex, missing,
      finalAnswer: times, finalUnit: '倍', finalPrompt: '何倍？',
      why: `「何倍か」を もとめるときは、くらべられる量 ÷ もとにする量 の わり算だよ。`,
      finalWhy: `${compare} ÷ ${base} ＝ ${times}。${times}倍だね。もとにする量（${base}）で わるのが ポイント！`,
    };
  }
  if (missing === 'compare') {
    return {
      kind: 'single',
      text: `${scene.base}の${scene.measure}は ${base}${scene.unit}です。${scene.compare}の${scene.measure}は、${scene.base}の ${times}倍に なります。${scene.compare}の${scene.measure}は 何${scene.unit}ですか？`,
      emoji: scene.emoji, base, times, compare, choices, correctIndex, missing,
      finalAnswer: compare, finalUnit: scene.unit, finalPrompt: `${scene.compare}の${scene.measure}は？`,
      why: `「◯倍に あたる量」を もとめるときは、もとにする量 × 倍 の かけ算だよ。`,
      finalWhy: `${base} × ${times} ＝ ${compare}。${scene.compare}の${scene.measure}は ${compare}${scene.unit}だね。`,
    };
  }
  return {
    kind: 'single',
    text: `${scene.compare}の${scene.measure}は ${compare}${scene.unit}で、これは ${scene.base}の${scene.measure}の ${times}倍に あたります。${scene.base}の${scene.measure}は 何${scene.unit}ですか？`,
    emoji: scene.emoji, base, times, compare, choices, correctIndex, missing,
    finalAnswer: base, finalUnit: scene.unit, finalPrompt: `${scene.base}の${scene.measure}は？`,
    why: `「もとにする量」を もとめるときは、くらべられる量 ÷ 倍 の わり算だよ。`,
    finalWhy: `${compare} ÷ ${times} ＝ ${base}。${scene.base}の${scene.measure}は ${base}${scene.unit}だね。`,
  };
}

/* =====================================================================
 * エラーハンター（倍の見方 頻出の誤り）
 * =================================================================== */

export const EH_REASONS = {
  SWAP: 'くらべられる量と もとにする量を 逆にして わってしまった',
  DIFF: '「何倍か」を もとめるのに、わり算ではなく ひき算をしてしまった',
  MULDIV: 'もとにする量を もとめる式で、×とわり算を 取りちがえた',
  ORDER: '倍を かける相手（もとにする量）を まちがえた',
};

export type EhPreset = 'eh-swap' | 'eh-diff' | 'eh-muldiv' | 'eh-order';

export interface BaiErrorExample {
  character: string;
  text: string;          // 場面の説明
  wrongExpr: string;      // まちがった式と答え
  isCorrect: boolean;
  correctExpr: string;    // 正しい式
  correctAnswer: number;  // なおす入力の正解
  unit: string;
  reasonOptions: string[];
  correctReasonIndex: number;
  fixHint: string;
  explain: string;
}

const EH_CHARS = ['りく', 'はな', 'そら', 'みお', 'けん', 'あい'];

function buildEhReasons(correct: string): { options: string[]; index: number } {
  const all = Object.values(EH_REASONS);
  const distractors = all.filter((r) => r !== correct).sort(() => Math.random() - 0.5).slice(0, 2);
  const options = [correct, ...distractors].sort(() => Math.random() - 0.5);
  return { options, index: options.indexOf(correct) };
}

type EhBuilder = () => BaiErrorExample;

// 逆にわってしまう（比較量÷基準量 のところを 基準量÷比較量 にしてしまう）
const ehSwap: EhBuilder = () => {
  const scene = pick(SCENES);
  const base = rnd(12, 45);
  const times = rnd(2, 9);
  const compare = base * times;
  const wrongVal = Math.round((base / compare) * 100) / 100;
  const r = buildEhReasons(EH_REASONS.SWAP);
  return {
    character: pick(EH_CHARS),
    text: `${scene.baseName}の${scene.measure}は ${base}${scene.unit}、${scene.compareName}の${scene.measure}は ${compare}${scene.unit}です。${scene.compareName}は ${scene.baseName}の 何倍ですか？`,
    wrongExpr: `${base} ÷ ${compare} ＝ ${wrongVal}倍`,
    isCorrect: false,
    correctExpr: `${compare} ÷ ${base} ＝ ${times}`,
    correctAnswer: times,
    unit: '倍',
    reasonOptions: r.options, correctReasonIndex: r.index,
    fixHint: `「何倍か」は くらべられる量 ÷ もとにする量。もとにする量は ${scene.baseName}の ${base}${scene.unit}だよ。${compare} ÷ ${base} を 計算しよう。`,
    explain: `くらべられる量 ÷ もとにする量 ＝ 倍。${compare} ÷ ${base} ＝ ${times}。正しくは ${times}倍だね。`,
  };
};

// 「何倍か」を差で計算してしまう
const ehDiff: EhBuilder = () => {
  const scene = pick(SCENES);
  const base = rnd(12, 45);
  const times = rnd(2, 9);
  const compare = base * times;
  const wrongVal = compare - base;
  const r = buildEhReasons(EH_REASONS.DIFF);
  return {
    character: pick(EH_CHARS),
    text: `${scene.baseName}の${scene.measure}は ${base}${scene.unit}、${scene.compareName}の${scene.measure}は ${compare}${scene.unit}です。${scene.compareName}は ${scene.baseName}の 何倍ですか？`,
    wrongExpr: `${compare} − ${base} ＝ ${wrongVal}倍`,
    isCorrect: false,
    correctExpr: `${compare} ÷ ${base} ＝ ${times}`,
    correctAnswer: times,
    unit: '倍',
    reasonOptions: r.options, correctReasonIndex: r.index,
    fixHint: `「何倍か」を もとめるのは わり算だよ。ひき算では「ちがい（差）」しか わからないよ。${compare} ÷ ${base} を 計算しよう。`,
    explain: `「何倍か」は くらべられる量 ÷ もとにする量。${compare} ÷ ${base} ＝ ${times}。正しくは ${times}倍だね。`,
  };
};

// 基準量を求める式で ×と÷を取りちがえる
const ehMulDiv: EhBuilder = () => {
  const scene = pick(SCENES);
  const times = rnd(2, 9);
  const base = rnd(12, 45);
  const compare = base * times;
  const wrongVal = compare * times;
  const r = buildEhReasons(EH_REASONS.MULDIV);
  return {
    character: pick(EH_CHARS),
    text: `${scene.compareName}の${scene.measure}は ${compare}${scene.unit}で、これは ${scene.baseName}の${scene.measure}の ${times}倍に あたります。${scene.baseName}の${scene.measure}は 何${scene.unit}ですか？`,
    wrongExpr: `${compare} × ${times} ＝ ${wrongVal}${scene.unit}`,
    isCorrect: false,
    correctExpr: `${compare} ÷ ${times} ＝ ${base}`,
    correctAnswer: base,
    unit: scene.unit,
    reasonOptions: r.options, correctReasonIndex: r.index,
    fixHint: `もとにする量を □ とすると、□ × ${times} ＝ ${compare}。□ を もとめるには わり算を するよ。${compare} ÷ ${times} を 計算しよう。`,
    explain: `くらべられる量 ÷ 倍 ＝ もとにする量。${compare} ÷ ${times} ＝ ${base}。正しくは ${base}${scene.unit}だね。`,
  };
};

// 倍をかける相手（もとにする量）をまちがえる（もとにする量と倍を逆にかけてしまう等）
const ehOrder: EhBuilder = () => {
  const scene = pick(SCENES);
  const base = rnd(12, 45);
  const times = rnd(2, 9);
  const compare = base * times;
  const wrongVal = times * times; // 「倍どうし」をかけてしまう誤り
  const r = buildEhReasons(EH_REASONS.ORDER);
  return {
    character: pick(EH_CHARS),
    text: `${scene.baseName}の${scene.measure}は ${base}${scene.unit}です。${scene.compareName}の${scene.measure}は、${scene.baseName}の ${times}倍に なります。${scene.compareName}の${scene.measure}は 何${scene.unit}ですか？`,
    wrongExpr: `${times} × ${times} ＝ ${wrongVal}${scene.unit}`,
    isCorrect: false,
    correctExpr: `${base} × ${times} ＝ ${compare}`,
    correctAnswer: compare,
    unit: scene.unit,
    reasonOptions: r.options, correctReasonIndex: r.index,
    fixHint: `倍を かける相手は「もとにする量（${base}${scene.unit}）」だよ。${base} × ${times} を 計算しよう。`,
    explain: `もとにする量 × 倍 ＝ くらべられる量。${base} × ${times} ＝ ${compare}。正しくは ${compare}${scene.unit}だね。`,
  };
};

// 正しい例（まぜる）
const ehCorrect: EhBuilder = () => {
  const scene = pick(SCENES);
  const base = rnd(12, 45);
  const times = rnd(2, 9);
  const compare = base * times;
  const kind = pick(['times', 'compare', 'base'] as const);
  if (kind === 'times') {
    return {
      character: pick(EH_CHARS),
      text: `${scene.baseName}の${scene.measure}は ${base}${scene.unit}、${scene.compareName}の${scene.measure}は ${compare}${scene.unit}です。${scene.compareName}は ${scene.baseName}の 何倍ですか？`,
      wrongExpr: `${compare} ÷ ${base} ＝ ${times}倍`,
      isCorrect: true,
      correctExpr: `${compare} ÷ ${base} ＝ ${times}`,
      correctAnswer: times, unit: '倍',
      reasonOptions: [], correctReasonIndex: -1, fixHint: '',
      explain: `くらべられる量 ÷ もとにする量 ＝ 倍。${compare} ÷ ${base} ＝ ${times}。この計算は 正しかったね！`,
    };
  }
  if (kind === 'compare') {
    return {
      character: pick(EH_CHARS),
      text: `${scene.baseName}の${scene.measure}は ${base}${scene.unit}です。${scene.compareName}の${scene.measure}は、${scene.baseName}の ${times}倍に なります。${scene.compareName}の${scene.measure}は 何${scene.unit}ですか？`,
      wrongExpr: `${base} × ${times} ＝ ${compare}${scene.unit}`,
      isCorrect: true,
      correctExpr: `${base} × ${times} ＝ ${compare}`,
      correctAnswer: compare, unit: scene.unit,
      reasonOptions: [], correctReasonIndex: -1, fixHint: '',
      explain: `もとにする量 × 倍 ＝ くらべられる量。${base} × ${times} ＝ ${compare}。この計算は 正しかったね！`,
    };
  }
  return {
    character: pick(EH_CHARS),
    text: `${scene.compareName}の${scene.measure}は ${compare}${scene.unit}で、これは ${scene.baseName}の${scene.measure}の ${times}倍に あたります。${scene.baseName}の${scene.measure}は 何${scene.unit}ですか？`,
    wrongExpr: `${compare} ÷ ${times} ＝ ${base}${scene.unit}`,
    isCorrect: true,
    correctExpr: `${compare} ÷ ${times} ＝ ${base}`,
    correctAnswer: base, unit: scene.unit,
    reasonOptions: [], correctReasonIndex: -1, fixHint: '',
    explain: `くらべられる量 ÷ 倍 ＝ もとにする量。${compare} ÷ ${times} ＝ ${base}。この計算は 正しかったね！`,
  };
};

const EH_BUILDERS: EhBuilder[] = [ehSwap, ehDiff, ehMulDiv, ehOrder];
const EH_PRESETS: Record<EhPreset, EhBuilder> = {
  'eh-swap': ehSwap,
  'eh-diff': ehDiff,
  'eh-muldiv': ehMulDiv,
  'eh-order': ehOrder,
};

/** ランダムに誤り例（ときどき正しい例）を生成。 */
export function generateBaiError(): BaiErrorExample {
  if (Math.random() < 0.25) return ehCorrect();
  return pick(EH_BUILDERS)();
}

/** 本番テスト用：誤りの種類を指定して生成。 */
export function makeBaiError(preset: EhPreset): BaiErrorExample {
  return EH_PRESETS[preset]();
}
