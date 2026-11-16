// このファイルは単元アプリ syo4-syousu-v2 の src/lib/decimal.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 小数の加減筆算のための純粋ロジック。
 * 浮動小数点の誤差を避けるため、すべて「最大小数桁数でスケールした整数」で計算する。
 * 資料の足場かけ（小数点をそろえる・空位0の補助・桁ちがい）を表現するための列モデルを作る。
 */

export type AddSubOp = '+' | '-';

export interface AddSubProblem {
  a: number;
  b: number;
  op: AddSubOp;
}

export type CellKind = 'blank' | 'digit' | 'helperZero';

export interface Cell {
  place: number; // 位の指数（0=一の位, -1=小数第一位, 1=十の位 ...）
  kind: CellKind;
  digit?: string;
}

export interface AnswerCell {
  place: number;
  active: boolean; // 入力対象の位か（答えに存在する位）
  expected: string; // 正答の数字
}

export interface ColumnModel {
  places: number[]; // 高い位 → 低い位
  decimalPointAfter: number; // この place の右に小数点がある（= 0 の右）
  rowA: Cell[];
  rowB: Cell[];
  answer: AnswerCell[];
  result: number;
}

export function decimalsOf(n: number): number {
  const s = Math.abs(n).toString();
  const i = s.indexOf('.');
  return i < 0 ? 0 : s.length - i - 1;
}

function digitAt(scaled: number, place: number, maxDec: number): string {
  const idxFromRight = place + maxDec;
  if (idxFromRight < 0) return '0';
  return (Math.floor(scaled / 10 ** idxFromRight) % 10).toString();
}

/** 値の最上位の位（指数）。0 のときは 0 を返す。 */
function msdExp(scaled: number, maxDec: number): number {
  if (scaled === 0) return -maxDec;
  return scaled.toString().length - 1 - maxDec;
}

export function buildColumns(problem: AddSubProblem): ColumnModel {
  const { a, b, op } = problem;
  const maxDec = Math.max(decimalsOf(a), decimalsOf(b));
  const scale = 10 ** maxDec;
  const A = Math.round(a * scale);
  const B = Math.round(b * scale);
  const R = op === '+' ? A + B : A - B;

  const maxScaled = Math.max(A, B, R);
  const totalDigits = Math.max(1, maxScaled.toString().length);
  const highExp = totalDigits - 1 - maxDec;

  const places: number[] = [];
  for (let e = highExp; e >= -maxDec; e--) places.push(e);

  const decA = decimalsOf(a);
  const decB = decimalsOf(b);
  const msdA = msdExp(A, maxDec);
  const msdB = msdExp(B, maxDec);
  const msdR = msdExp(R, maxDec);

  // 一の位（place 0）は必ず表示する（0.2 を「.2」と書かせない=Negz/Pegz 対策）
  const operandCell = (scaled: number, decimals: number, msd: number, place: number): Cell => {
    const top = Math.max(msd, 0);
    if (place > top) return { place, kind: 'blank' };
    // 元の小数桁数より下の小数位は「空位0」の補助（うすく表示）
    if (place < -decimals) return { place, kind: 'helperZero', digit: '0' };
    return { place, kind: 'digit', digit: digitAt(scaled, place, maxDec) };
  };

  const rowA = places.map((p) => operandCell(A, decA, msdA, p));
  const rowB = places.map((p) => operandCell(B, decB, msdB, p));
  const answerTop = Math.max(msdR, 0);
  const answer: AnswerCell[] = places.map((p) => ({
    place: p,
    active: p <= answerTop,
    expected: p <= answerTop ? digitAt(R, p, maxDec) : '',
  }));

  return { places, decimalPointAfter: 0, rowA, rowB, answer, result: R / scale };
}

export type AddSubLevel = 'add-basic' | 'add-diff' | 'sub-basic' | 'sub-diff' | 'sub-whole';

export const ADDSUB_LEVELS: { id: AddSubLevel; label: string; description: string }[] = [
  { id: 'add-basic', label: 'たし算 ①', description: '小数第一位どうしのたし算' },
  { id: 'add-diff', label: 'たし算 ②（桁ちがい）', description: '3.5 + 4.18 のような問題' },
  { id: 'sub-basic', label: 'ひき算 ①', description: '小数第一位どうしのひき算' },
  { id: 'sub-diff', label: 'ひき算 ②（桁ちがい）', description: '6.17 − 3.8 のような問題' },
  { id: 'sub-whole', label: 'ひき算 ③（空位）', description: '6 − 2.45・9 − 0.058 など' },
];

function rndInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** レベルに応じた小数の加減問題を生成する。 */
export function generateAddSub(level: AddSubLevel): AddSubProblem {
  switch (level) {
    case 'add-basic': {
      const a = rndInt(11, 89) / 10; // 1.1〜8.9
      const b = rndInt(11, 89) / 10;
      return { a, b, op: '+' };
    }
    case 'add-diff': {
      const a = rndInt(11, 79) / 10; // 小数第一位
      const b = rndInt(105, 489) / 100; // 小数第二位
      return { a, b, op: '+' };
    }
    case 'sub-basic': {
      let a = rndInt(21, 98) / 10;
      let b = rndInt(11, 89) / 10;
      if (b > a) [a, b] = [b, a];
      return { a, b, op: '-' };
    }
    case 'sub-diff': {
      // 桁ちがいのひき算（6.17 − 3.8 / 3.02 − 2.37）。少なくとも片方は小数第二位。
      const decA = Math.random() < 0.5 ? 2 : 1;
      const decB = decA === 1 ? 2 : (Math.random() < 0.5 ? 1 : 2);
      let a = rndInt(2 * 10 ** decA, 9 * 10 ** decA) / 10 ** decA;
      let b = rndInt(1 * 10 ** decB, 8 * 10 ** decB) / 10 ** decB;
      if (b >= a) [a, b] = [b, a];
      if (b >= a) b = Math.round((a - 0.1) * 100) / 100;
      return { a, b, op: '-' };
    }
    case 'sub-whole': {
      // 6 − 2.45 や 9 − 0.058（小数第三位・空位0）
      const a = rndInt(3, 9); // 整数
      const dec = Math.random() < 0.5 ? 2 : 3; // 小数第二位 or 第三位
      const maxB = a * 10 ** dec - 1;
      const minB = 10 ** (dec - 1) + 5; // 末尾0を避けつつ範囲確保
      const b = rndInt(Math.min(minB, maxB), maxB) / 10 ** dec;
      return { a, b, op: '-' };
    }
  }
}

/** 位の名前（算数語彙）。読み上げにも使う。 */
export function placeName(place: number): string {
  switch (place) {
    case 3:
      return '千の位';
    case 2:
      return '百の位';
    case 1:
      return '十の位';
    case 0:
      return '一の位';
    case -1:
      return '小数第一位';
    case -2:
      return '小数第二位';
    case -3:
      return '小数第三位';
    default:
      return '';
  }
}
