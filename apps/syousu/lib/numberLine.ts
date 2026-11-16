// このファイルは単元アプリ syo4-syousu-v2 の src/lib/numberLine.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 数直線・大小くらべ の純粋ロジック。
 * 資料: 数直線中心の指導で Megz/Segz/Negz（桁数や見た目に惑わされる）誤概念に対処（エビレベルI）。
 * 大小比較では小数を「文字列」で持ち、0.40 のような末尾0（等しさ）も提示できるようにする。
 */

export type CompareLevel = 'compare-tenths' | 'compare-mixed' | 'compare-int';

export const COMPARE_LEVELS: { id: CompareLevel; label: string; description: string }[] = [
  { id: 'compare-tenths', label: 'くらべる ①', description: '0.3 と 0.7（小数第一位）' },
  { id: 'compare-mixed', label: 'くらべる ②', description: '0.5 と 0.36（けたがちがう）' },
  { id: 'compare-int', label: 'くらべる ③', description: '2.05 と 2.5 など' },
];

export interface ComparePair {
  aStr: string;
  bStr: string;
}

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function relation(aStr: string, bStr: string): '>' | '<' | '=' {
  const a = Number(aStr);
  const b = Number(bStr);
  if (Math.abs(a - b) < 1e-9) return '=';
  return a > b ? '>' : '<';
}

export function generateCompare(level: CompareLevel): ComparePair {
  switch (level) {
    case 'compare-tenths': {
      let a = rnd(1, 9), b = rnd(1, 9);
      // ときどき等しさ（0.4 と 0.40）も出す
      if (Math.random() < 0.15) return { aStr: `0.${a}`, bStr: `0.${a}0` };
      while (b === a) b = rnd(1, 9);
      return { aStr: `0.${a}`, bStr: `0.${b}` };
    }
    case 'compare-mixed': {
      // 片方は小数第一位、もう片方は小数第二位（Megz の罠）
      const t = rnd(1, 9); // 0.t
      let h = rnd(11, 89); // 0.hh
      while (Math.abs(t / 10 - h / 100) < 1e-9) h = rnd(11, 89);
      const tenthsFirst = Math.random() < 0.5;
      return tenthsFirst
        ? { aStr: `0.${t}`, bStr: `0.${h}` }
        : { aStr: `0.${h}`, bStr: `0.${t}` };
    }
    case 'compare-int': {
      const mk = () => {
        const whole = rnd(1, 4);
        const dec = Math.random() < 0.5 ? `${rnd(0, 9)}` : `${rnd(0, 9)}${rnd(0, 9)}`;
        return `${whole}.${dec}`;
      };
      let a = mk(), b = mk();
      while (Math.abs(Number(a) - Number(b)) < 1e-9) b = mk();
      return { aStr: a, bStr: b };
    }
  }
}

/* ===================== 数直線 ===================== */

export type LineLevel = 'line-tenths' | 'line-0to10' | 'line-hundredths';

export const LINE_LEVELS: { id: LineLevel; label: string; description: string }[] = [
  { id: 'line-tenths', label: '数直線 ①', description: '0〜1（0.1ずつ）に小数をおく' },
  { id: 'line-0to10', label: '数直線 ②', description: '0〜10（0.5ずつ）に小数をおく' },
  { id: 'line-hundredths', label: '数直線 ③', description: '3.54 など（0.01ずつ・拡大）' },
];

export interface LineProblem {
  target: number;
  targetStr: string;
  min: number;
  max: number;
  step: number;
  majorEvery: number; // 何目盛りごとに数字ラベルを出すか
}

function fmt(v: number, decimals: number) {
  return v.toFixed(decimals).replace(/\.0$/, decimals === 1 ? '.0' : '');
}

export function generateLine(level: LineLevel): LineProblem {
  if (level === 'line-tenths') {
    const k = rnd(1, 9);
    const target = k / 10;
    return { target, targetStr: `0.${k}`, min: 0, max: 1, step: 0.1, majorEvery: 5 };
  }
  if (level === 'line-hundredths') {
    // 小数第2位（例 3.54）。答えに必要な 0.1 区間だけ 0.01 刻みで拡大表示。
    const whole = rnd(1, 6);
    const tenth = rnd(0, 9);
    let hund = rnd(1, 9); // 末尾0でない＝第2位まで意味がある
    const target = Math.round((whole + tenth / 10 + hund / 100) * 100) / 100;
    const min = Math.round((whole + tenth / 10) * 100) / 100;
    const max = Math.round((min + 0.1) * 100) / 100;
    return { target, targetStr: target.toFixed(2), min, max, step: 0.01, majorEvery: 10 };
  }
  // 0〜10、0.5 ずつ。整数や .5 を出題
  const j = rnd(1, 19);
  const target = Math.round(j * 0.5 * 10) / 10;
  return { target, targetStr: fmt(target, 1), min: 0, max: 10, step: 0.5, majorEvery: 2 };
}

/* ===================== ならべかえ ===================== */

export type OrderLevel = 'order-3' | 'order-5';

export const ORDER_LEVELS: { id: OrderLevel; label: string; description: string }[] = [
  { id: 'order-3', label: 'ならべかえ ①', description: '3つの小数を 順にならべる' },
  { id: 'order-5', label: 'ならべかえ ②', description: '5つの小数を 順にならべる（100m走）' },
];

export interface OrderProblem {
  items: string[]; // 提示順（シャッフル済み）
  dir: 'asc' | 'desc'; // asc=小さい順, desc=大きい順
  sorted: string[]; // 正解順
}

// 互いに紛らわしい（桁ちがい・近い値）小数を作る
function makeOrderItems(count: number): string[] {
  const set = new Set<string>();
  const vals = new Set<number>();
  let guard = 0;
  while (set.size < count && guard++ < 200) {
    // 1の位ありの2桁小数を中心に、ときどき末尾0や桁ちがいを混ぜる
    const whole = rnd(0, 9);
    const style = rnd(0, 2);
    let str: string;
    if (style === 0) str = `${whole}.${rnd(0, 9)}`; // 小数第一位
    else if (style === 1) str = `${whole}.${rnd(0, 9)}${rnd(0, 9)}`; // 小数第二位
    else str = `${whole}.${rnd(1, 9)}0`; // 末尾0（等しさの罠）
    const v = Number(str);
    if (vals.has(v)) continue; // 値が同じものは除外（順序を一意に）
    vals.add(v);
    set.add(str);
  }
  return [...set];
}

export function generateOrder(level: OrderLevel): OrderProblem {
  const count = level === 'order-3' ? 3 : 5;
  const items = makeOrderItems(count);
  const dir: 'asc' | 'desc' = Math.random() < 0.5 ? 'asc' : 'desc';
  const sorted = [...items].sort((a, b) => (dir === 'asc' ? Number(a) - Number(b) : Number(b) - Number(a)));
  // 提示順は正解順と変えてシャッフル
  let shuffled = [...items];
  let g = 0;
  do {
    shuffled = [...items].sort(() => Math.random() - 0.5);
  } while (shuffled.join() === sorted.join() && g++ < 10);
  return { items: shuffled, dir, sorted };
}

/** 数直線の目盛り値の配列を作る（浮動小数点誤差に強い）。 */
export function lineTicks(min: number, max: number, step: number): number[] {
  const ticks: number[] = [];
  const n = Math.round((max - min) / step);
  for (let i = 0; i <= n; i++) ticks.push(Math.round((min + i * step) * 100) / 100);
  return ticks;
}
