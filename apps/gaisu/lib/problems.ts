// このファイルは単元アプリ syo4-gaisu の src/lib/problems.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * がい数単元（4年）の問題ジェネレーター集。
 * 教科書・問題集・単元テストで頻出の問題タイプを、スキル別・段階別に網羅する。
 *
 * - meaning    : がい数の いみ（約何万・約何千、がい数を つかう場面）
 * - round      : 四捨五入で がい数に（指定の位／上から1けた・2けた／条件から数を選ぶ）
 * - range      : もとの数の はんい（以上・未満、いちばん小さい・大きい整数）
 * - sumdiff    : 和や差の見積もり（百の位までの がい数にして たす・ひく）
 * - prodquot   : 積や商の見積もり（上から1けたの がい数にして かける・わる）
 * - roundjudge : 切り上げ・切り捨てで考えよう（場面に合う見積もり方・予算判定）
 * - error      : がい数エラーハンター（見る位・くり上がり・上からnけた・はんい・見積もり方の混同）
 */

function rnd(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }

/** 指定の「まとまり」(10のべき乗)で四捨五入する。例: roundToUnit(7549, 1000) = 8000 */
function roundToUnit(n: number, unit: number): number { return Math.round(n / unit) * unit; }
function ceilToUnit(n: number, unit: number): number { return Math.ceil(n / unit) * unit; }
function floorToUnit(n: number, unit: number): number { return Math.floor(n / unit) * unit; }
/** 上からk桁が有効になるように四捨五入する（＝ 上から(k+1)番目の位で四捨五入）。 */
function roundToLeadingDigits(n: number, k: number): number {
  const digits = String(n).length;
  const unit = Math.pow(10, Math.max(0, digits - k));
  return roundToUnit(n, unit);
}

const PLACE_LABEL: Record<number, string> = {
  1: '一の位', 10: '十の位', 100: '百の位', 1000: '千の位', 10000: '一万の位', 100000: '十万の位',
};

/* =====================================================================
 * がい数の いみ
 * =================================================================== */

export type MeaningLevel = 'meaning-man' | 'meaning-sen' | 'meaning-scene';

export const MEANING_LEVELS: { id: MeaningLevel; label: string; desc: string }[] = [
  { id: 'meaning-man', label: '大きな数を「約何万」で', desc: '入園者数などを 約何万人と 言おう' },
  { id: 'meaning-sen', label: '「約何千」で 表そう', desc: '千の位で だいたいの数を つかもう' },
  { id: 'meaning-scene', label: 'がい数を つかう場面は？', desc: '正確な数と どちらが よいか 考えよう' },
];

const MEANING_SCENES_MAN = [
  { noun: '動物園の 入園者数', unit: '人', emoji: '🦁' },
  { noun: 'サッカーの 来場者数', unit: '人', emoji: '⚽' },
  { noun: '花火大会の 見物客数', unit: '人', emoji: '🎆' },
  { noun: '図書館に ある 本のさっ数', unit: 'さつ', emoji: '📚' },
];
const MEANING_SCENES_SEN = [
  { noun: '駅を 利用した人数', unit: '人', emoji: '🚉' },
  { noun: '学校に ある えんぴつの数', unit: '本', emoji: '✏️' },
  { noun: '文化祭の 来場者数', unit: '人', emoji: '🎪' },
  { noun: 'お店で 売れた パンの数', unit: 'こ', emoji: '🥖' },
];

export interface MeaningNumberProblem {
  kind: 'man' | 'sen';
  n: number;
  unit: number; // 10000 or 1000
  noun: string;
  itemUnit: string;
  emoji: string;
  answerDigit: number; // 「約◯万」「約◯千」の ◯
  lower: number; // 数直線の 左はし
  upper: number; // 数直線の 右はし
  hint: string;
  explain: string;
}

export function generateMeaningNumber(level: 'meaning-man' | 'meaning-sen'): MeaningNumberProblem {
  if (level === 'meaning-man') {
    const scene = pick(MEANING_SCENES_MAN);
    const n = rnd(10000, 94999); // 95000以上は「約10万」になり1けたの答えの前提が崩れるため除外
    const answerDigit = Math.round(n / 10000);
    const lower = Math.floor(n / 10000) * 10000;
    const upper = lower + 10000;
    return {
      kind: 'man', n, unit: 10000, noun: scene.noun, itemUnit: scene.unit, emoji: scene.emoji, answerDigit, lower, upper,
      hint: `${lower}と${upper}の どちらに 近いか、数直線で たしかめよう。一万の位の 一つ下（千の位）の 数字で 四捨五入するよ。`,
      explain: `${n}は、一万の位までの がい数にすると 約${answerDigit}万${scene.unit}だね。`,
    };
  }
  const scene = pick(MEANING_SCENES_SEN);
  const n = rnd(1000, 9499); // 9500以上は「約10千」になり1けたの答えの前提が崩れるため除外
  const answerDigit = Math.round(n / 1000);
  const lower = Math.floor(n / 1000) * 1000;
  const upper = lower + 1000;
  return {
    kind: 'sen', n, unit: 1000, noun: scene.noun, itemUnit: scene.unit, emoji: scene.emoji, answerDigit, lower, upper,
    hint: `${lower}と${upper}の どちらに 近いか、数直線で たしかめよう。千の位の 一つ下（百の位）の 数字で 四捨五入するよ。`,
    explain: `${n}は、千の位までの がい数にすると 約${answerDigit}千${scene.unit}だね。`,
  };
}

const MEANING_SCENE_ITEMS: { text: string; correct: 'gaisu' | 'exact'; why: string }[] = [
  { text: '新聞で、サッカーの試合の 来場者数を しょうかいする', correct: 'gaisu', why: '大きな数の「だいたい」を つたえたいときは、がい数が わかりやすいよ。' },
  { text: 'クラス全員に くばる 色紙の数を かぞえる', correct: 'exact', why: '1人ずつに きちんと わたすには、正確な数が ひつようだね。' },
  { text: 'マラソン大会の 参加人数を ニュースで つたえる', correct: 'gaisu', why: '「だいたい何人」が わかれば じゅうぶんだね。' },
  { text: '今日の テストで 自分が とった点数', correct: 'exact', why: '点数は 1点でも ちがうと こまるから、正確な数が ひつようだよ。' },
  { text: 'ある県の 人口を 社会科の教科書で しょうかいする', correct: 'gaisu', why: '人口は 毎日 少しずつ 変わるから、がい数で 表すよ。' },
  { text: '算数の 計算問題の 答え', correct: 'exact', why: '計算の答えは、がい数では なく 正確に 出すよ。' },
  { text: '図書館に ある本の さっ数を、しょうかいポスターに かく', correct: 'gaisu', why: '「だいたい何さつ」が つたわれば じゅうぶんだね。' },
  { text: 'サッカーの 決勝戦で どちらが勝ったかを 決める得点', correct: 'exact', why: '勝ち負けが 決まる得点は、正確な数で ないと こまるよ。' },
];

export interface MeaningSceneProblem {
  text: string;
  correct: 'gaisu' | 'exact';
  why: string;
}
export function generateMeaningScene(): MeaningSceneProblem {
  return pick(MEANING_SCENE_ITEMS);
}

/* =====================================================================
 * 四捨五入で がい数に
 * =================================================================== */

export type RoundLevel = 'round-which-place' | 'round-place' | 'round-digit2' | 'round-digit1' | 'round-choose';

export const ROUND_LEVELS: { id: RoundLevel; label: string; desc: string }[] = [
  { id: 'round-which-place', label: 'どの位を 四捨五入する？', desc: '見る位を まちがえないように たしかめよう' },
  { id: 'round-place', label: '指定の位までの がい数', desc: '千の位、一万の位など、ゆびさされた位まで' },
  { id: 'round-digit2', label: '上から2けたの がい数', desc: '大きい数を 上から2つの位で 表そう' },
  { id: 'round-digit1', label: '上から1けたの がい数', desc: '見積もりの 基本ワザ' },
  { id: 'round-choose', label: '2つの条件に 合う数は？', desc: '上から1けた・2けた 両方の 条件から えらぶ' },
];

export interface RoundWhichPlaceProblem {
  n: number;
  targetLabel: string;
  choices: string[];
  answerIndex: number;
  hint: string;
  explain: string;
}

/** 「◯◯の位までの がい数にするには、どの位を 四捨五入すればよいか」を問う（答えの数値ではなく、見る位そのものを問う）。 */
export function generateRoundWhichPlace(): RoundWhichPlaceProblem {
  const digitsCount = rnd(4, 6);
  const n = rnd(Math.pow(10, digitsCount - 1), Math.pow(10, digitsCount) - 1);
  const candidateUnits = [1000, 10000, 100000].filter((u) => u < Math.pow(10, digitsCount));
  const targetUnit = pick(candidateUnits);
  const targetLabel = PLACE_LABEL[targetUnit];
  const belowUnit = targetUnit / 10;
  const twoBelowUnit = belowUnit / 10;
  const correctLabel = PLACE_LABEL[belowUnit];
  const twoBelowLabel = PLACE_LABEL[twoBelowUnit];
  // 正解（一つ下の位）／目標の位そのもの（見る位を まちがえる典型ミス）／さらに一つ下の位、の3択
  const choices = [correctLabel, targetLabel, twoBelowLabel].sort(() => Math.random() - 0.5);
  return {
    n, targetLabel,
    choices,
    answerIndex: choices.indexOf(correctLabel),
    hint: `${targetLabel}までの がい数にするには、その すぐ 一つ下の位を 見るよ。`,
    explain: `${n}を ${targetLabel}までの がい数にするには、${correctLabel}の 数字を 四捨五入するよ（${targetLabel}自身では ないよ）。`,
  };
}

export interface RoundPlaceProblem {
  n: number;
  unit: number;
  placeLabel: string;
  answer: number;
  hint: string;
  explain: string;
}

export function generateRoundPlace(): RoundPlaceProblem {
  const digitsCount = rnd(4, 6);
  const n = rnd(Math.pow(10, digitsCount - 1), Math.pow(10, digitsCount) - 1);
  const candidateUnits = [10, 100, 1000, 10000, 100000].filter((u) => u >= 10 && u < Math.pow(10, digitsCount));
  const unit = pick(candidateUnits);
  const placeLabel = PLACE_LABEL[unit] ?? `${unit}の位`;
  const answer = roundToUnit(n, unit);
  const belowUnit = unit / 10;
  return {
    n, unit, placeLabel, answer,
    hint: `${placeLabel}の 一つ下の位（${PLACE_LABEL[belowUnit] ?? `${belowUnit}の位`}）の 数字に 目を つけよう。4以下なら 切り捨て、5以上なら 切り上げるよ。`,
    explain: `${n}を ${placeLabel}までの がい数にすると ${answer}。`,
  };
}

export interface RoundDigitProblem {
  n: number;
  k: 1 | 2;
  answer: number;
  hint: string;
  explain: string;
}

export function generateRoundDigit(k: 1 | 2): RoundDigitProblem {
  const digitsCount = k === 1 ? rnd(2, 6) : rnd(3, 6);
  const n = rnd(Math.pow(10, digitsCount - 1), Math.pow(10, digitsCount) - 1);
  const answer = roundToLeadingDigits(n, k);
  return {
    n, k, answer,
    hint: `${n}は ${digitsCount}けたの数。上から${k}けたが 有効に のこるように、上から${k + 1}番目の 位の 数字で 四捨五入しよう。`,
    explain: `${n}を 上から${k}けたの がい数にすると ${answer}。`,
  };
}

export interface RoundChooseProblem {
  v1: number;
  v2: number;
  choices: string[];
  answerIndex: number;
  hint: string;
  explain: string;
}

export function generateRoundChoose(): RoundChooseProblem {
  for (let tries = 0; tries < 200; tries++) {
    const digitsCount = pick([4, 5]);
    const lo = Math.pow(10, digitsCount - 1);
    const hi = Math.pow(10, digitsCount) - 1;
    const n = rnd(lo, hi);
    const v1 = roundToLeadingDigits(n, 1);
    const v2 = roundToLeadingDigits(n, 2);
    if (v1 === 0) continue;
    const distractors: number[] = [];
    for (let i = 0; i < 200 && distractors.length < 1; i++) {
      const m = rnd(lo, hi);
      if (m !== n && roundToLeadingDigits(m, 1) !== v1) distractors.push(m);
    }
    for (let i = 0; i < 200 && distractors.length < 2; i++) {
      const m = rnd(lo, hi);
      if (m !== n && !distractors.includes(m) && roundToLeadingDigits(m, 1) === v1 && roundToLeadingDigits(m, 2) !== v2) distractors.push(m);
    }
    if (distractors.length < 2) continue;
    const options = [n, ...distractors.slice(0, 2)].sort(() => Math.random() - 0.5);
    return {
      v1, v2,
      choices: options.map(String),
      answerIndex: options.indexOf(n),
      hint: `それぞれの 数を、上から1けた・上から2けたの りょうほうで 四捨五入して、${v1}と${v2}に なるか たしかめよう。`,
      explain: `${n}は 上から1けたで ${v1}、上から2けたで ${v2}に なるね。`,
    };
  }
  return generateRoundChoose();
}

/* =====================================================================
 * もとの数の はんい
 * =================================================================== */

export type RangeLevel = 'range-tens' | 'range-hundreds' | 'range-thousands';

export const RANGE_LEVELS: { id: RangeLevel; label: string; desc: string }[] = [
  { id: 'range-tens', label: '十の位までの はんい', desc: 'いちばん小さい数・大きい数を もとめよう' },
  { id: 'range-hundreds', label: '百の位までの はんい', desc: '四捨五入前の 数の はんいを もとめよう' },
  { id: 'range-thousands', label: '千の位までの はんい', desc: '大きな数でも 考え方は 同じ' },
];

const RANGE_UNIT: Record<RangeLevel, number> = { 'range-tens': 10, 'range-hundreds': 100, 'range-thousands': 1000 };

export interface RangeProblem {
  target: number;
  unit: number;
  placeLabel: string;
  min: number;
  max: number;
  choices: string[];
  answerIndex: number;
  hint: string;
  explain: string;
  /** 選択肢を まちがえたときに 出す説明（「以上・以下・未満」の意味そのものを確認させる）。 */
  expressWrongHint: string;
}

export function generateRange(level: RangeLevel): RangeProblem {
  const unit = RANGE_UNIT[level];
  const target = unit * rnd(3, 60);
  const min = target - unit / 2;
  const max = target + unit / 2 - 1;
  const placeLabel = PLACE_LABEL[unit] ?? `${unit}の位`;

  // 正解の表し方は「未満」「以下」のどちらも使う（整数の はんいとしては 同じ）。
  // どちらの表し方でも 正解になりうることを 学習させる。
  const useLessThanForm = Math.random() < 0.5;
  const correct = useLessThanForm ? `${min}以上${max + 1}未満` : `${min}以上${max}以下`;
  const equivalentForm = useLessThanForm ? `${min}以上${max}以下` : `${min}以上${max + 1}未満`;

  // distractor は すべて 正解とは ちがう整数の集合になるものだけを使う
  // （「min以上max以下」は「min以上(max+1)未満」と 同じ集合になってしまうため、distractor には使わない）。
  const distractorPool = [
    `${min}以下${max + 1}未満`,     // 下限の ことばが 逆（以上→以下）
    `${min}以上${max + 1}以下`,     // 上限を 1つ 多く ふくめてしまう
    `${min + 1}以上${max + 1}未満`, // 下限を 1つ ずらしてしまう
    `${min}以上${max}未満`,         // 上限を 1つ 少なく ふくめてしまう（maxが 入らない）
  ];
  const d1 = pick(distractorPool);
  const d2 = pick(distractorPool.filter((d) => d !== d1));
  const options = [correct, d1, d2].sort(() => Math.random() - 0.5);
  return {
    target, unit, placeLabel, min, max,
    choices: options,
    answerIndex: options.indexOf(correct),
    hint: `${placeLabel}までの がい数にして ${target}に なる数は、${target}より ${unit / 2}小さい数から、${target}より ${unit / 2}大きい数の 一つ手前までだよ。`,
    explain: `いちばん小さい整数は ${min}、いちばん大きい整数は ${max}。はんいは「${correct}」と 表すよ。「${equivalentForm}」と表しても 同じ はんいだよ。`,
    expressWrongHint: '「以上」「以下」は その数を ふくみ、「未満」は その数を ふくまない、という意味だよ。それぞれの数が 正しく はんいに 入っているか、たしかめよう。',
  };
}

/* =====================================================================
 * 和や差の見積もり
 * =================================================================== */

export type SumDiffLevel = 'sumdiff-add' | 'sumdiff-sub' | 'sumdiff-triple';

export const SUMDIFF_LEVELS: { id: SumDiffLevel; label: string; desc: string }[] = [
  { id: 'sumdiff-add', label: 'たし算の 見積もり', desc: '百の位までの がい数にして たそう' },
  { id: 'sumdiff-sub', label: 'ひき算の 見積もり', desc: '百の位までの がい数にして ひこう' },
  { id: 'sumdiff-triple', label: '3つの数の 見積もり', desc: '大きい数から 2つの数を ひく見積もり' },
];

export interface SumDiffProblem {
  kind: 'add' | 'sub' | 'triple';
  a: number; b: number; c?: number;
  roundedA: number; roundedB: number; roundedC?: number;
  answer: number;
  op: string; // 表示用の式（例: "493 + 328"）
  hint: string;
  explain: string;
}

const UNIT_100 = 100;

export function generateSumDiff(level: SumDiffLevel): SumDiffProblem {
  if (level === 'sumdiff-add') {
    const a = rnd(110, 899);
    const b = rnd(110, 899);
    const roundedA = roundToUnit(a, UNIT_100);
    const roundedB = roundToUnit(b, UNIT_100);
    return {
      kind: 'add', a, b, roundedA, roundedB, answer: roundedA + roundedB, op: `${a} + ${b}`,
      hint: `${a}と${b}を、それぞれ 百の位までの がい数に してから たそう。`,
      explain: `${a}→${roundedA}、${b}→${roundedB}。見積もりの式は ${roundedA} + ${roundedB} = ${roundedA + roundedB}。`,
    };
  }
  if (level === 'sumdiff-sub') {
    const a = rnd(400, 950);
    const b = rnd(100, a - 30);
    const roundedA = roundToUnit(a, UNIT_100);
    const roundedB = roundToUnit(b, UNIT_100);
    return {
      kind: 'sub', a, b, roundedA, roundedB, answer: roundedA - roundedB, op: `${a} − ${b}`,
      hint: `${a}と${b}を、それぞれ 百の位までの がい数に してから ひこう。`,
      explain: `${a}→${roundedA}、${b}→${roundedB}。見積もりの式は ${roundedA} − ${roundedB} = ${roundedA - roundedB}。`,
    };
  }
  // triple: 1000（などの きりのよい数）− 2つの数
  const a = pick([1000, 1000, 1000, 2000]);
  const b = rnd(110, 480);
  const c = rnd(110, 480);
  const roundedB = roundToUnit(b, UNIT_100);
  const roundedC = roundToUnit(c, UNIT_100);
  return {
    kind: 'triple', a, b, c, roundedA: a, roundedB, roundedC, answer: a - roundedB - roundedC, op: `${a} − ${b} − ${c}`,
    hint: `${a}は すでに きりのよい数。${b}と${c}だけ、百の位までの がい数に して ひこう。`,
    explain: `${b}→${roundedB}、${c}→${roundedC}。見積もりの式は ${a} − ${roundedB} − ${roundedC} = ${a - roundedB - roundedC}。`,
  };
}

/* =====================================================================
 * 積や商の見積もり
 * =================================================================== */

export type ProdQuotLevel = 'prodquot-mul' | 'prodquot-div' | 'prodquot-word';

export const PRODQUOT_LEVELS: { id: ProdQuotLevel; label: string; desc: string }[] = [
  { id: 'prodquot-mul', label: 'かけ算の 見積もり', desc: '上から1けたの がい数にして かけよう' },
  { id: 'prodquot-div', label: 'わり算の 見積もり', desc: '上から1けたの がい数にして わろう' },
  { id: 'prodquot-word', label: '文章題で 見積もり', desc: '代金の 見積もりを 考えよう' },
];

export interface ProdQuotProblem {
  kind: 'mul' | 'div' | 'word';
  a: number; b: number;
  roundedA: number; roundedB: number;
  answer: number;
  op: string;
  text?: string;
  emoji?: string;
  finalUnit?: string;
  hint: string;
  explain: string;
}

/** rounding先の unit の中で、5桁/2桁などの範囲に収まる値をランダムに1つ選ぶ */
function randomInRoundingWindow(target: number, unit: number, min: number, max: number): number {
  const lo = Math.max(min, target - Math.floor(unit / 2));
  const hi = Math.min(max, target + Math.ceil(unit / 2) - 1);
  if (lo > hi) return Math.min(max, Math.max(min, target));
  return rnd(lo, hi);
}

export function generateProdQuot(level: ProdQuotLevel): ProdQuotProblem {
  if (level === 'prodquot-mul') {
    const a = rnd(110, 899);
    const b = rnd(110, 899);
    const roundedA = roundToLeadingDigits(a, 1);
    const roundedB = roundToLeadingDigits(b, 1);
    return {
      kind: 'mul', a, b, roundedA, roundedB, answer: roundedA * roundedB, op: `${a} × ${b}`,
      hint: `${a}と${b}を、それぞれ 上から1けたの がい数に してから かけよう。`,
      explain: `${a}→${roundedA}、${b}→${roundedB}。見積もりの式は ${roundedA} × ${roundedB} = ${roundedA * roundedB}。`,
    };
  }
  if (level === 'prodquot-div') {
    let d2 = 0, d1 = 0, quotient = 0;
    for (let i = 0; i < 200; i++) {
      d2 = rnd(1, 9);
      d1 = rnd(1, 9);
      if ((d1 * 1000) % d2 === 0) { quotient = (d1 * 1000) / d2; break; }
    }
    if (quotient === 0) { d1 = 6; d2 = 3; quotient = 2000; }
    const roundedA = d1 * 10000;
    const roundedB = d2 * 10;
    const a = randomInRoundingWindow(roundedA, 10000, 10000, 99999);
    const b = randomInRoundingWindow(roundedB, 10, 10, 99);
    return {
      kind: 'div', a, b, roundedA, roundedB, answer: quotient, op: `${a} ÷ ${b}`,
      hint: `${a}と${b}を、それぞれ 上から1けたの がい数に してから わろう。`,
      explain: `${a}→${roundedA}、${b}→${roundedB}。見積もりの式は ${roundedA} ÷ ${roundedB} = ${quotient}。`,
    };
  }
  // word: 代金の見積もり（積）
  const price = rnd(210, 890);
  const people = rnd(110, 480);
  const roundedA = roundToLeadingDigits(price, 1);
  const roundedB = roundToLeadingDigits(people, 1);
  const scene = pick([
    { place: '水族館', unit: '円' },
    { place: '動物園', unit: '円' },
    { place: 'プラネタリウム', unit: '円' },
  ]);
  return {
    kind: 'word', a: price, b: people, roundedA, roundedB, answer: roundedA * roundedB, op: `${price} × ${people}`,
    text: `${scene.place}の 1人分の 入館料は ${price}円です。${people}人分の 代金は、約何円か 見積もります。四捨五入して 上から1けたの がい数にして、答えを 見積もりましょう。`,
    emoji: '🎫', finalUnit: scene.unit,
    hint: `入館料と 人数を、それぞれ 上から1けたの がい数に してから かけよう。`,
    explain: `${price}→${roundedA}、${people}→${roundedB}。見積もりの式は ${roundedA} × ${roundedB} = ${roundedA * roundedB}${scene.unit}。`,
  };
}

/* =====================================================================
 * 切り上げ・切り捨てで 考えよう
 * =================================================================== */

export type RoundJudgeLevel = 'roundjudge-value' | 'roundjudge-method' | 'roundjudge-budget' | 'roundjudge-floor';

export const ROUNDJUDGE_LEVELS: { id: RoundJudgeLevel; label: string; desc: string }[] = [
  { id: 'roundjudge-value', label: '切り上げ・切り捨ての れんしゅう', desc: '四捨五入と どうちがうか たしかめよう' },
  { id: 'roundjudge-method', label: 'どの見積もり方が いい？', desc: '場面に あわせて えらぼう' },
  { id: 'roundjudge-budget', label: '予算で 考えよう', desc: '切り上げて 見積もり、買えるか たしかめる' },
  { id: 'roundjudge-floor', label: '切り捨てで 何こ買えるか', desc: '買いすぎないように 少なめに 見積もる' },
];

export interface RoundJudgeValueProblem {
  n: number;
  unit: number;
  placeLabel: string;
  method: 'up' | 'down';
  answer: number;
  hint: string;
  explain: string;
}

export function generateRoundJudgeValue(): RoundJudgeValueProblem {
  const digitsCount = rnd(3, 5);
  const n = rnd(Math.pow(10, digitsCount - 1), Math.pow(10, digitsCount) - 1);
  const candidateUnits = [10, 100, 1000].filter((u) => u < Math.pow(10, digitsCount));
  const unit = pick(candidateUnits);
  const placeLabel = PLACE_LABEL[unit] ?? `${unit}の位`;
  const method: 'up' | 'down' = pick(['up', 'down']);
  const answer = method === 'up' ? ceilToUnit(n, unit) : floorToUnit(n, unit);
  const methodLabel = method === 'up' ? '切り上げ' : '切り捨て';
  return {
    n, unit, placeLabel, method, answer,
    hint: method === 'up'
      ? `${placeLabel}の 一つ下の位を、大きい方に 切り上げよう（0でなければ 必ず 切り上げる）。`
      : `${placeLabel}の 一つ下の位を、小さい方に 切り捨てよう（四捨五入と ちがって、必ず 切り捨てる）。`,
    explain: `${n}を、${placeLabel}までの がい数に ${methodLabel}で 表すと ${answer}。`,
  };
}

interface MethodScene { text: string; correct: number; why: string }
const METHOD_LABELS = ['四捨五入', '切り上げ', '切り捨て'];
const METHOD_SCENES: MethodScene[] = [
  { text: '1000円で 買いものを します。代金が たりるか こわいので、見積もりは 実さいより 多めに 計算して たしかめたいです。', correct: 1, why: '足りるか 安心して たしかめたいときは、多めに見積もる「切り上げ」を つかうよ。' },
  { text: '長いすに みんなが すわります。あまった 人も すわれるように、いすの きゃく数を 多めに 見積もりたいです。', correct: 1, why: '「あまっても だいじょうぶなように 多めに」は「切り上げ」だよ。' },
  { text: '持っている お金で、1本120円くらいの ジュースが 何本 買えるか、買いすぎないように 少なめに 見積もりたいです。', correct: 2, why: '買いすぎないように 少なめに 見積もるときは「切り捨て」を つかうよ。' },
  { text: '材料が むだに ならないように、たしかに 作れる 個数だけを 少なめに 見積もりたいです。', correct: 2, why: '「確実に できる分だけ」を 知りたいときは「切り捨て」だよ。' },
  { text: '新聞の記事で、コンサートの 来場者の だいたいの人数を つたえたいです。', correct: 0, why: '「だいたい」を 知りたいだけなら、ふつうの「四捨五入」で じゅうぶんだよ。' },
  { text: '荷物の おもさを、だいたい どれくらいか 家族に つたえたいです。', correct: 0, why: 'だいたいの 大きさを つかみたいときは「四捨五入」を つかうよ。' },
];

export interface RoundJudgeMethodProblem {
  text: string;
  choices: string[];
  answerIndex: number;
  why: string;
}
export function generateRoundJudgeMethod(): RoundJudgeMethodProblem {
  const scene = pick(METHOD_SCENES);
  const order = [0, 1, 2].sort(() => Math.random() - 0.5);
  const choices = order.map((i) => METHOD_LABELS[i]);
  const answerIndex = order.indexOf(scene.correct);
  return { text: scene.text, choices, answerIndex, why: scene.why };
}

interface BudgetFruit { name: string; emoji: string }
const BUDGET_FRUITS: BudgetFruit[] = [
  { name: 'いちご', emoji: '🍓' }, { name: 'なし', emoji: '🍐' }, { name: 'キウイフルーツ', emoji: '🥝' },
  { name: 'ぶどう', emoji: '🍇' }, { name: 'もも', emoji: '🍑' }, { name: 'メロン', emoji: '🍈' },
  { name: 'バナナ', emoji: '🍌' }, { name: 'みかん', emoji: '🍊' },
];

export interface RoundJudgeBudgetProblem {
  items: { name: string; emoji: string; price: number; ceilPrice: number }[];
  budget: number;
  ceilSum: number;
  realSum: number;
  canBuy: boolean;
  methodChoices: string[];
  methodAnswerIndex: number;
  explain1: string;
  hint2: string;
  explain2: string;
}

export function generateRoundJudgeBudget(): RoundJudgeBudgetProblem {
  const pool = [...BUDGET_FRUITS].sort(() => Math.random() - 0.5).slice(0, 3);
  const items = pool.map((f) => {
    const price = rnd(120, 480);
    return { name: f.name, emoji: f.emoji, price, ceilPrice: ceilToUnit(price, 100) };
  });
  const ceilSum = items.reduce((a, x) => a + x.ceilPrice, 0);
  const realSum = items.reduce((a, x) => a + x.price, 0);
  const budgetOffset = pick([-200, -100, 0, 100, 200, 300]);
  const budget = Math.max(500, ceilSum + budgetOffset);
  const canBuy = realSum <= budget;

  const order = [0, 1, 2].sort(() => Math.random() - 0.5);
  const methodChoices = order.map((i) => METHOD_LABELS[i]);
  const methodAnswerIndex = order.indexOf(1); // 切り上げ

  const expr = items.map((x) => x.ceilPrice).join(' ＋ ');
  const explain1 = `${items.map((x) => `${x.price}円`).join(' ＋ ')} ＝ ${expr} と、それぞれの代金を 大きい方に 切り上げて 計算しているね。`;
  const hint2 = `切り上げた代金の合計（${ceilSum}円）と、じっさいの合計（${realSum}円）を くらべながら、${budget}円で 足りるか 考えよう。`;
  const explain2 = canBuy
    ? `切り上げた代金の合計は ${ceilSum}円。じっさいの合計は ${realSum}円で、${budget}円 以内だから 買えるね！`
    : `じっさいの代金を たすと ${realSum}円。${budget}円を こえて しまうから、買えないね。`;

  return { items, budget, ceilSum, realSum, canBuy, methodChoices, methodAnswerIndex, explain1, hint2, explain2 };
}

interface FloorItem { name: string; emoji: string }
const FLOOR_ITEMS: FloorItem[] = [
  { name: 'ジュース', emoji: '🧃' }, { name: 'あめ', emoji: '🍬' }, { name: 'クッキー', emoji: '🍪' },
  { name: 'えんぴつ', emoji: '✏️' }, { name: 'シール', emoji: '⭐' }, { name: '消しゴム', emoji: '🧽' },
];

export interface RoundJudgeFloorProblem {
  itemName: string;
  emoji: string;
  price: number;
  budget: number;
  floorCount: number;
  hint: string;
  explain: string;
}

/** 切り捨てで「何こ買えるか」を求める、少なめ見積もりの完結した文章題。 */
export function generateRoundJudgeFloor(): RoundJudgeFloorProblem {
  const item = pick(FLOOR_ITEMS);
  return retry<RoundJudgeFloorProblem>(
    () => {
      const price = rnd(11, 48) * 10;
      const budget = pick([500, 800, 1000, 1500, 2000]);
      const floorCount = Math.floor(budget / price);
      return {
        itemName: item.name, emoji: item.emoji, price, budget, floorCount,
        hint: `${budget} ÷ ${price} を 計算して、あまりが 出たら 切り捨てよう（買いすぎないように 少なめに 見積もる）。`,
        explain: `${budget} ÷ ${price} = ${Math.floor(budget / price)}あまり${budget % price}。あまった お金では もう1こ 買えないから、切り捨てて ${floorCount}こ 買えるよ。`,
      };
    },
    (p) => p.floorCount >= 1 && p.budget % p.price !== 0
  );
}

function retry<T>(gen: () => T, pred: (x: T) => boolean, max = 200): T {
  for (let i = 0; i < max; i++) {
    const x = gen();
    if (pred(x)) return x;
  }
  return gen();
}

/* =====================================================================
 * がい数エラーハンター（誤り例）
 * =================================================================== */

export const EH_REASONS_G = {
  PLACE: '四捨五入で 見る位を まちがえた',
  CARRY: '9が くり上がるのを わすれた',
  TOPDIGITS: '「上から◯けた」の いみを まちがえた',
  RANGE: 'はんいの「未満」を まちがえた',
  METHOD: '四捨五入と 切り上げ・切り捨てを ごっちゃにした',
};

export type GaisuEhPreset = 'eh-place' | 'eh-carry' | 'eh-topdigits' | 'eh-range' | 'eh-method';

export interface GaisuErrorExample {
  character: string;
  question: string;
  shownAnswer: string;
  isCorrect: boolean;
  correctAnswerNumeric: number;
  fixPrompt: string;
  reasonOptions: string[];
  correctReasonIndex: number;
  fixHint: string;
  explain: string;
}

const EH_CHARS_G = ['りく', 'はな', 'そら', 'みお', 'けん', 'あい'];

function buildEhReasonsG(correct: string): { options: string[]; index: number } {
  const all = Object.values(EH_REASONS_G);
  const distractors = all.filter((r) => r !== correct).sort(() => Math.random() - 0.5).slice(0, 2);
  const options = [correct, ...distractors].sort(() => Math.random() - 0.5);
  return { options, index: options.indexOf(correct) };
}

type EhBuilderG = () => GaisuErrorExample;

// 見る位のまちがい（四捨五入する位より一つ下の、さらに下の位までしか丸めていない）
const ehPlaceG: EhBuilderG = () => {
  const digitsCount = rnd(4, 5);
  const n = rnd(Math.pow(10, digitsCount - 1), Math.pow(10, digitsCount) - 1);
  const unit = Math.pow(10, digitsCount - 1);
  const placeLabel = PLACE_LABEL[unit] ?? `${unit}の位`;
  const correct = roundToUnit(n, unit);
  const wrong = roundToUnit(n, unit / 10);
  if (wrong === correct) return ehPlaceG();
  const r = buildEhReasonsG(EH_REASONS_G.PLACE);
  return {
    character: pick(EH_CHARS_G),
    question: `${n}を、四捨五入して ${placeLabel}までの がい数に しましょう。`,
    shownAnswer: String(wrong),
    isCorrect: false,
    correctAnswerNumeric: correct,
    fixPrompt: '正しい がい数は？',
    reasonOptions: r.options, correctReasonIndex: r.index,
    fixHint: `${placeLabel}の 一つ下の位の 数字に 目を つけよう。その数字で 四捨五入するよ。`,
    explain: `${placeLabel}までの がい数にするには、その 一つ下の位を 四捨五入するよ。正しくは ${correct}。`,
  };
};

// くり上がりの わすれ（995→百の位までのがい数は1000。900としてしまう誤り）
const ehCarryG: EhBuilderG = () => {
  const base = rnd(1, 8);
  const n = base * 1000 + rnd(950, 999);
  const correct = roundToUnit(n, 100);
  const wrong = base * 1000 + 900;
  if (wrong === correct) return ehCarryG();
  const r = buildEhReasonsG(EH_REASONS_G.CARRY);
  return {
    character: pick(EH_CHARS_G),
    question: `${n}を、四捨五入して 百の位までの がい数に しましょう。`,
    shownAnswer: String(wrong),
    isCorrect: false,
    correctAnswerNumeric: correct,
    fixPrompt: '正しい がい数は？',
    reasonOptions: r.options, correctReasonIndex: r.index,
    fixHint: `十の位の 数字が 大きいね。切り上げると 位が くり上がって、千の位も 変わるよ。`,
    explain: `十の位が 大きいので 切り上げると 位が くり上がるよ。正しくは ${correct}。`,
  };
};

// 「上から◯けた」の いみの まちがい（いつも百の位で四捨五入してしまう）
const ehTopDigitsG: EhBuilderG = () => {
  const digitsCount = rnd(5, 6);
  const n = rnd(Math.pow(10, digitsCount - 1), Math.pow(10, digitsCount) - 1);
  const correct = roundToLeadingDigits(n, 2);
  const wrong = roundToUnit(n, 100);
  if (wrong === correct) return ehTopDigitsG();
  const r = buildEhReasonsG(EH_REASONS_G.TOPDIGITS);
  return {
    character: pick(EH_CHARS_G),
    question: `${n}を、四捨五入して 上から2けたの がい数に しましょう。`,
    shownAnswer: String(wrong),
    isCorrect: false,
    correctAnswerNumeric: correct,
    fixPrompt: '正しい がい数は？',
    reasonOptions: r.options, correctReasonIndex: r.index,
    fixHint: `${n}は ${digitsCount}けたの数。上から2けたが 有効に のこるように、上から3番目の位で 四捨五入しよう。`,
    explain: `上から2けたの がい数は、上から3番目の位を 四捨五入するよ。正しくは ${correct}。`,
  };
};

// はんいの「未満」のまちがい（境界の数を最大値としてしまう）
const ehRangeG: EhBuilderG = () => {
  const V = 100 * rnd(2, 60);
  const min = V - 50, max = V + 49;
  const wrong = V + 50;
  const r = buildEhReasonsG(EH_REASONS_G.RANGE);
  return {
    character: pick(EH_CHARS_G),
    question: `百の位までの がい数にすると ${V}になる整数のうち、いちばん大きい整数を 答えましょう。`,
    shownAnswer: String(wrong),
    isCorrect: false,
    correctAnswerNumeric: max,
    fixPrompt: 'いちばん大きい整数は？',
    reasonOptions: r.options, correctReasonIndex: r.index,
    fixHint: `${wrong}を 百の位までの がい数に すると どうなるかな？ ためしに 四捨五入してみよう。`,
    explain: `${wrong}を 四捨五入すると ${roundToUnit(wrong, 100)}に なってしまい、${V}には ならないね。正しい いちばん大きい整数は ${max}。`,
  };
};

// 見積もり方法の混同（多めに見積もりたいのに四捨五入してしまう）
const ehMethodG: EhBuilderG = () => {
  const n = rnd(1000, 9999);
  const trueCeil = ceilToUnit(n, 100);
  const wrongRound = roundToUnit(n, 100);
  if (wrongRound === trueCeil) return ehMethodG();
  const r = buildEhReasonsG(EH_REASONS_G.METHOD);
  return {
    character: pick(EH_CHARS_G),
    question: `${n}円の 買いものを します。足りるか こわいので、代金を 百の位までの がい数に して、多めに 見積もりましょう。`,
    shownAnswer: String(wrongRound),
    isCorrect: false,
    correctAnswerNumeric: trueCeil,
    fixPrompt: '多めに 見積もった 正しい がい数は？',
    reasonOptions: r.options, correctReasonIndex: r.index,
    fixHint: `「多めに 見積もる」ときは 四捨五入では なく「切り上げ」を つかうよ。`,
    explain: `多めに 見積もりたいときは、切り上げを つかうよ。正しくは ${trueCeil}。`,
  };
};

// 正しい例（まぜる）
const ehCorrectG: EhBuilderG = () => {
  const digitsCount = rnd(4, 5);
  const n = rnd(Math.pow(10, digitsCount - 1), Math.pow(10, digitsCount) - 1);
  const correct = roundToLeadingDigits(n, 2);
  return {
    character: pick(EH_CHARS_G),
    question: `${n}を、四捨五入して 上から2けたの がい数に しましょう。`,
    shownAnswer: String(correct),
    isCorrect: true,
    correctAnswerNumeric: correct,
    fixPrompt: '',
    reasonOptions: [], correctReasonIndex: -1,
    fixHint: '',
    explain: `${n}を 上から2けたの がい数にすると ${correct}。この 答えは 正しかったね！`,
  };
};

const EH_BUILDERS_G: EhBuilderG[] = [ehPlaceG, ehCarryG, ehTopDigitsG, ehRangeG, ehMethodG];
const EH_PRESETS_G: Record<GaisuEhPreset, EhBuilderG> = {
  'eh-place': ehPlaceG,
  'eh-carry': ehCarryG,
  'eh-topdigits': ehTopDigitsG,
  'eh-range': ehRangeG,
  'eh-method': ehMethodG,
};

/** ランダムに誤り例（ときどき正しい例）を生成。 */
export function generateGaisuError(): GaisuErrorExample {
  if (Math.random() < 0.25) return ehCorrectG();
  return pick(EH_BUILDERS_G)();
}

/** 本番テスト用：誤りの種類を指定して生成。 */
export function makeGaisuError(preset: GaisuEhPreset): GaisuErrorExample {
  return EH_PRESETS_G[preset]();
}
