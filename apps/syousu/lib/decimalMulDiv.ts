// このファイルは単元アプリ syo4-syousu-v2 の src/lib/decimalMulDiv.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 小数の かけ算・わり算（筆算）の純粋ロジック。
 * すべて整数スケールで計算し浮動小数点誤差を避ける。
 * 「小数わり算の各桁の手続きは、数字列を整数とみなしたわり算と同一。違うのは小数点の位置だけ」
 * という核心に基づき、表示用の数字列・小数点位置・各ステップを組み立てる。
 *
 * 紙のテスト「13. 小数のかけ算とわり算」に合わせて、
 * かける数・わる数が2けたの筆算、積の終わりの0を消す、整数÷整数のわり進み、
 * 商を四捨五入して上から2けたのがい数、あまりと検算 を扱う。
 */
import { decimalsOf } from './decimal';

/* ===================== 共通（整数スケールの数の表し方） ===================== */

/** 整数 n を 10^dec で割った小数を、終わりの0を落とした文字列にする（例: 7040, 1 → "704"） */
export function formatScaled(n: number, dec: number): string {
  const neg = n < 0;
  let s = Math.abs(Math.round(n)).toString();
  if (dec > 0) {
    s = s.padStart(dec + 1, '0');
    const ip = s.slice(0, s.length - dec);
    const fp = s.slice(s.length - dec).replace(/0+$/, '');
    s = fp ? `${ip}.${fp}` : ip;
  }
  return (neg ? '-' : '') + s;
}

/** 終わりの0を残したまま小数にする（228, 2 → "2.28"・270, 2 → "2.70"） */
export function keepZeros(n: number, dec: number): string {
  const s = Math.round(n).toString().padStart(dec + 1, '0');
  return dec > 0 ? `${s.slice(0, s.length - dec)}.${s.slice(s.length - dec)}` : s;
}

/** 小数を「整数と、小数点以下のけた数」にする（2.43 → { int: 243, dec: 2 }） */
export function toScaled(x: number): { int: number; dec: number } {
  const dec = decimalsOf(x);
  return { int: Math.round(x * 10 ** dec), dec };
}

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)]!;
}

/* ===================== かけ算 ===================== */

export type MulLevel = 'mul-tenths' | 'mul-hundredths' | 'mul-2digit' | 'mul-zero-end';

export const MUL_LEVELS: { id: MulLevel; label: string; description: string }[] = [
  { id: 'mul-tenths', label: 'かけ算 ①', description: '小数第一位 × 1けた（2.4 × 3）' },
  { id: 'mul-hundredths', label: 'かけ算 ②', description: '小数第二位 × 1けた（1.36 × 7）' },
  { id: 'mul-2digit', label: 'かけ算 ③', description: '小数 × 2けた（4.9 × 72）' },
  { id: 'mul-zero-end', label: 'かけ算 ④', description: '積の 終わりの0を 消す（17.6 × 40・3.85 × 2）' },
];

export interface MulProblem {
  a: number; // 被乗数（小数）
  b: number; // 乗数（整数・1〜2けた）
}

export interface MulPartial {
  digits: string; // 部分積の数字列
  shift: number; // 右から何けたずらして書くか（十の位をかけた行は 1）
}

export interface MulModel {
  a: number;
  b: number;
  aDigits: string; // 被乗数を整数とみなした数字列
  partials: MulPartial[]; // かける数が2けた（一の位が0でない）のときだけ2行。ほかは空
  productIntDigits: string; // 整数とみなした積の数字列（小数点なし）
  decimals: number; // 積の小数点以下の桁数（= 被乗数の小数桁数）
  trailingZeros: number; // 小数点を打ったあと、終わりから消す0の数
  product: number; // 最終的な積（小数）
  productStr: string; // 最終的な積（終わりの0を消した文字列）
}

export function buildMul(a: number, b: number): MulModel {
  const { int: scaledA, dec: decA } = toScaled(a);
  const intProduct = scaledA * b;
  const productIntDigits = intProduct.toString();
  const partials: MulPartial[] = [];
  if (b >= 10 && b % 10 !== 0) {
    partials.push({ digits: (scaledA * (b % 10)).toString(), shift: 0 });
    partials.push({ digits: (scaledA * Math.floor(b / 10)).toString(), shift: 1 });
  }
  let trailingZeros = 0;
  for (let i = productIntDigits.length - 1; i >= 0 && trailingZeros < decA && productIntDigits[i] === '0'; i--) trailingZeros++;
  const productStr = formatScaled(intProduct, decA);
  return {
    a,
    b,
    aDigits: scaledA.toString(),
    partials,
    productIntDigits,
    decimals: decA,
    trailingZeros,
    product: Number(productStr),
    productStr,
  };
}

/** variant: テストで紙と同じ形を出すときの指定 */
export type MulVariant = 'big' | 'tens' | 'hundredths';

export function generateMul(level: MulLevel, variant?: MulVariant): MulProblem {
  switch (level) {
    case 'mul-tenths':
      // big: 13.4 × 4 のように 整数部が2けた
      if (variant === 'big') return { a: rnd(101, 199) / 10, b: rnd(2, 9) };
      return { a: rnd(12, 49) / 10, b: rnd(2, 9) };
    case 'mul-hundredths':
      return { a: rnd(105, 489) / 100, b: rnd(2, 9) };
    case 'mul-2digit': {
      // 4.9 × 72：小数第一位 × 2けた（一の位は0でない）
      for (let t = 0; t < 100; t++) {
        const a = rnd(12, 89) / 10;
        if (Math.round(a * 10) % 10 === 0) continue;
        const b = rnd(12, 89);
        if (b % 10 === 0) continue;
        return { a, b };
      }
      return { a: 4.9, b: 72 };
    }
    case 'mul-zero-end': {
      const kind = variant ?? pick(['tens', 'hundredths', 'tenths'] as const);
      for (let t = 0; t < 300; t++) {
        if (kind === 'tens') {
          // 17.6 × 40：小数第一位 × 何十（積の小数第一位が0）
          const a = rnd(101, 299) / 10;
          if (Math.round(a * 10) % 10 === 0) continue;
          return { a, b: rnd(2, 9) * 10 };
        }
        if (kind === 'hundredths') {
          // 3.85 × 2 = 7.70：小数第二位 × 1けた で 積の終わりが0
          const n = rnd(105, 495);
          if (n % 10 === 0) continue;
          const b = rnd(2, 8);
          if ((n * b) % 10 !== 0) continue;
          return { a: n / 100, b };
        }
        // 2.5 × 4 = 10.0：小数第一位 × 1けた で 積が整数
        const n = rnd(12, 95);
        if (n % 10 === 0) continue;
        const b = rnd(2, 8);
        if ((n * b) % 10 !== 0) continue;
        return { a: n / 10, b };
      }
      return { a: 3.85, b: 2 };
    }
  }
}

/** 積の小数点だけを考える問題（4.3 × 16 → 688 に小数点）。終わりに0が出ない形にする */
export function generateMulPoint(): MulProblem {
  for (let t = 0; t < 200; t++) {
    const dec = Math.random() < 0.7 ? 1 : 2;
    const a = dec === 1 ? rnd(12, 89) / 10 : rnd(105, 489) / 100;
    const b = Math.random() < 0.6 ? rnd(12, 39) : rnd(3, 9);
    if (b % 10 === 0) continue;
    const m = buildMul(a, b);
    if (m.trailingZeros > 0) continue;
    if (Math.round(a * 10 ** dec) % 10 === 0) continue;
    return { a, b };
  }
  return { a: 4.3, b: 16 };
}

/* ===================== わり算 ===================== */

export type DivLevel =
  | 'div-basic' | 'div-carry' | 'div-remainder'
  | 'div-2digit' | 'div-int' | 'div-round' | 'div-check';

export const DIV_LEVELS: { id: DivLevel; label: string; description: string }[] = [
  { id: 'div-basic', label: 'わり算 ①', description: 'わり切れる（空位の0も）4.08 ÷ 4' },
  { id: 'div-carry', label: 'わり算 ②', description: '0をおろして わり進む 4.5 ÷ 6' },
  { id: 'div-remainder', label: 'わり算 ③', description: '商は一の位まで・あまり 13.5 ÷ 4' },
  { id: 'div-2digit', label: 'わり算 ④', description: '小数 ÷ 2けた（18.2 ÷ 28）' },
  { id: 'div-int', label: 'わり算 ⑤', description: '整数 ÷ 整数の わり進み（54 ÷ 24）' },
  { id: 'div-round', label: 'わり算 ⑥', description: '商を 四捨五入して 上から2けた（16 ÷ 7）' },
  { id: 'div-check', label: 'わり算 ⑦', description: 'あまりと けん算（68.1 ÷ 5）' },
];

export type DivMode = 'exact' | 'remainder' | 'round';

export interface DivProblem {
  dividend: number;
  divisor: number;
  mode: DivMode;
  /** remainder のとき、あまりのあとに けん算の式（わる数×商＋あまり＝わられる数）もうめる */
  check?: boolean;
}

export interface DivStep {
  index: number; // 被除数の数字列における桁インデックス
  quotient: number;
  multiply: number;
  remainder: number;
  dividendPart: number;
  appended: boolean; // 割り進みで補った 0 か
}

export interface DivModel {
  dividend: number;
  divisor: number;
  mode: DivMode;
  digits: string; // 処理する数字列（割り進みの 0 を含む。小数点なし）
  fracStr: string; // remainder モードで表示だけする小数部（処理はしない）
  baseLen: number; // 補う前の元の桁数（これ以降は appended）
  intLen: number; // 被除数の整数部の桁数（小数点はこの後ろ）
  steps: DivStep[];
  quotientStartIndex: number; // 商を書き始める桁（先頭0の抑制）
  quotientPointIndex: number; // 商の小数点を打つ位置（この index の前）。整数商なら -1
  quotientValue: number;
  quotientStr: string; // 筆算で求めた商（round では上から3けたまで）
  remainderValue: number; // mode='remainder' のときの小数あまり
  remainderStr: string;
  roundedStr: string; // mode='round' のときの答え（上から2けたのがい数）
}

const MAX_EXTRA_DECIMALS = 3;
const ROUND_SIG = 3; // 上から3けためまで求めて四捨五入

function splitNumber(x: number): { intStr: string; fracStr: string } {
  const s = x.toString();
  const [i, f] = s.split('.');
  return { intStr: i!, fracStr: f ?? '' };
}

export function buildDiv(problem: DivProblem): DivModel {
  const { dividend, divisor, mode } = problem;
  const { intStr: intPartStr, fracStr } = splitNumber(dividend);
  const decD = fracStr.length;
  const intLen = intPartStr.length;
  const steps: DivStep[] = [];

  const runSteps = (digits: string, upto: number) => {
    let rem = 0;
    for (let i = 0; i < upto; i++) {
      const cur = rem * 10 + Number(digits[i]);
      const q = Math.floor(cur / divisor);
      const m = q * divisor;
      rem = cur - m;
      steps.push({ index: i, quotient: q, multiply: m, remainder: rem, dividendPart: cur, appended: i >= intLen + decD });
    }
    return rem;
  };

  const startOf = () => {
    const firstNonZero = steps.findIndex((s) => s.quotient > 0);
    return Math.min(intLen - 1, firstNonZero === -1 ? intLen - 1 : firstNonZero);
  };

  if (mode === 'remainder') {
    // 整数部の桁だけ処理し、商は一の位まで。あまりは小数。
    const digits = intPartStr;
    runSteps(digits, digits.length);
    const scaled = Math.round(dividend * 10 ** decD);
    const q = Math.floor(scaled / (divisor * 10 ** decD));
    const remScaled = scaled - divisor * q * 10 ** decD;
    const remainderStr = formatScaled(remScaled, decD);
    return {
      dividend, divisor, mode,
      digits, fracStr, baseLen: digits.length, intLen,
      steps, quotientStartIndex: startOf(), quotientPointIndex: -1,
      quotientValue: q, quotientStr: String(q),
      remainderValue: Number(remainderStr), remainderStr,
      roundedStr: '',
    };
  }

  // exact / round: 整数部＋小数部、必要なら割り進みで 0 を補う
  let digits = intPartStr + fracStr;
  const baseLen = digits.length;
  let rem = 0;
  let i = 0;
  let sig = 0; // round: 商の上から何けた求めたか
  const maxExtra = mode === 'round' ? MAX_EXTRA_DECIMALS + 1 : MAX_EXTRA_DECIMALS;
  while (true) {
    if (i >= digits.length) {
      if (mode === 'exact' && rem === 0) break;
      if (digits.length - intLen >= maxExtra) break;
      digits += '0';
    }
    const cur = rem * 10 + Number(digits[i]);
    const q = Math.floor(cur / divisor);
    const m = q * divisor;
    rem = cur - m;
    steps.push({ index: i, quotient: q, multiply: m, remainder: rem, dividendPart: cur, appended: i >= baseLen });
    if (sig > 0 || q > 0) sig++;
    i++;
    if (mode === 'round' && sig >= ROUND_SIG && i >= intLen) break;
    if (mode === 'exact' && i >= digits.length && rem === 0) break;
  }

  const quotientStartIndex = startOf();
  const lastIndex = steps.length - 1;
  const qDec = Math.max(0, lastIndex + 1 - intLen);
  const qInt = Number(steps.filter((s) => s.index >= quotientStartIndex).map((s) => s.quotient).join(''));
  // round では「上から3けた」を見せたいので、終わりの0も残す（2.70）
  const quotientStr = mode === 'round' ? keepZeros(qInt, qDec) : formatScaled(qInt, qDec);
  // 商の小数点は被除数の小数点の真上 → index intLen の前
  const quotientPointIndex = digits.length > intLen ? intLen : -1;

  let roundedStr = '';
  if (mode === 'round') {
    const r = Math.round(qInt / 10);
    roundedStr = qDec >= 1 ? formatScaled(r, qDec - 1) : String(r * 10);
  }

  return {
    dividend, divisor, mode,
    digits, fracStr: '', baseLen, intLen,
    steps, quotientStartIndex, quotientPointIndex,
    quotientValue: Number(quotientStr), quotientStr,
    remainderValue: 0, remainderStr: '',
    roundedStr,
  };
}

/** 割り切れる（場合により空位0）の被除数・除数を作る。small: 5.34 ÷ 6 のように商が1より小さい */
function genExact(variant?: DivVariant): DivProblem {
  for (let t = 0; t < 300; t++) {
    const divisor = rnd(2, 9);
    const decD = variant === 'tenths' ? 1 : variant === 'small' ? 2 : Math.random() < 0.5 ? 1 : 2;
    const n = rnd(10 ** decD, 10 ** (decD + 1) - 1); // 桁数を確保した整数（=被除数×10^decD）
    if (n % divisor !== 0) continue;
    if (n % 10 === 0) continue; // 終わりが0の小数は出さない
    const dividend = n / 10 ** decD;
    if (variant === 'small') {
      if (dividend >= divisor || dividend < 1) continue;
      const qn = n / divisor;
      if (qn % 10 === 0) continue;
      return { dividend, divisor, mode: 'exact' };
    }
    if (dividend < divisor) continue; // 商が1以上になるやさしい範囲
    return { dividend, divisor, mode: 'exact' };
  }
  return variant === 'small' ? { dividend: 5.34, divisor: 6, mode: 'exact' } : { dividend: 4.08, divisor: 4, mode: 'exact' };
}

/** 割り進みが必要（被除数より商の小数桁が多い）終わる小数を作る。 */
function genCarry(): DivProblem {
  for (let t = 0; t < 300; t++) {
    const divisor = rnd(2, 9);
    const qScaled = rnd(11, 95); // 商 = qScaled/100（小数第二位）
    const prod = qScaled * divisor; // = 被除数 × 100
    if (prod % 10 !== 0) continue; // 被除数は小数第一位（割り進みが必要）
    if (prod % 100 === 0) continue; // 被除数が整数になるのは除外
    const dividend = prod / 100;
    if (dividend <= 0) continue;
    return { dividend, divisor, mode: 'exact' };
  }
  return { dividend: 4.5, divisor: 6, mode: 'exact' };
}

/** 商を一の位まで求め、あまりが小数になる問題を作る。big: 68.1 ÷ 5 のように商が2けた */
function genRemainder(big = false, check = false): DivProblem {
  for (let t = 0; t < 200; t++) {
    const divisor = rnd(3, 9);
    const q = big ? rnd(11, 29) : rnd(1, 9);
    const remTenth = rnd(1, divisor * 10 - 1); // あまり = remTenth/10 < divisor
    if (remTenth % 10 === 0) continue; // あまりを小数にする
    if (big && remTenth < 10) continue; // あまりの一の位が0だと「31」の形にならない
    const dividendTenths = divisor * q * 10 + remTenth;
    return { dividend: dividendTenths / 10, divisor, mode: 'remainder', check };
  }
  return big ? { dividend: 68.1, divisor: 5, mode: 'remainder', check } : { dividend: 13.5, divisor: 4, mode: 'remainder', check };
}

/** 小数 ÷ 2けた（わり切れる）。small: 18.2 ÷ 28 のように商が1より小さい（わり進みあり） */
function gen2digit(variant?: DivVariant): DivProblem {
  const small = variant === 'small' || (variant === undefined && Math.random() < 0.5);
  for (let t = 0; t < 500; t++) {
    const divisor = rnd(12, 39);
    if (divisor % 10 === 0) continue;
    if (small) {
      // 商 0.□□（小数第二位）、被除数は小数第一位 → わり進みが1回いる
      const qs = rnd(11, 95);
      if (qs % 10 === 0) continue;
      const prod = qs * divisor; // = 被除数 × 100
      if (prod % 10 !== 0 || prod % 100 === 0) continue;
      const dividend = prod / 100;
      if (dividend < 1) continue;
      return { dividend, divisor, mode: 'exact' };
    }
    // 商 □.□（小数第一位）、被除数は小数第一位
    const qs = rnd(12, 49);
    if (qs % 10 === 0) continue;
    const prod = qs * divisor; // = 被除数 × 10
    if (prod % 10 === 0) continue;
    return { dividend: prod / 10, divisor, mode: 'exact' };
  }
  return small ? { dividend: 18.2, divisor: 28, mode: 'exact' } : { dividend: 95.2, divisor: 28, mode: 'exact' };
}

/** 整数 ÷ 整数で、0をおろして小数まで わり進む。two: 54 ÷ 24 のように わる数が2けた */
function genInt(variant?: DivVariant): DivProblem {
  const two = variant === 'two' || (variant === undefined && Math.random() < 0.5);
  for (let t = 0; t < 500; t++) {
    const divisor = two ? rnd(12, 48) : rnd(2, 9);
    if (two && divisor % 10 === 0) continue;
    const dividend = two ? rnd(13, 99) : rnd(1, 9);
    if (dividend % divisor === 0) continue;
    const m = buildDiv({ dividend, divisor, mode: 'exact' });
    const last = m.steps[m.steps.length - 1]!;
    if (last.remainder !== 0) continue; // 小数第三位までで わり切れるものだけ
    if (two && m.quotientValue < 1) continue;
    return { dividend, divisor, mode: 'exact' };
  }
  return two ? { dividend: 54, divisor: 24, mode: 'exact' } : { dividend: 3, divisor: 4, mode: 'exact' };
}

/** 商を四捨五入して上から2けたのがい数。two: 95.3 ÷ 23 */
function genRound(variant?: DivVariant): DivProblem {
  const two = variant === 'two' || (variant === undefined && Math.random() < 0.5);
  for (let t = 0; t < 500; t++) {
    const divisor = two ? rnd(12, 39) : rnd(3, 9);
    if (two && divisor % 10 === 0) continue;
    const dividend = two ? rnd(400, 999) / 10 : rnd(10, 49);
    if (two && Math.round(dividend * 10) % 10 === 0) continue;
    const m = buildDiv({ dividend, divisor, mode: 'round' });
    if (m.quotientValue < 1 || m.quotientValue >= 10) continue; // 商は 1.□□ 〜 9.□□
    const last = m.steps[m.steps.length - 1]!;
    if (last.remainder === 0) continue; // わり切れてしまうものは出さない
    if (m.roundedStr === '10') continue;
    return { dividend, divisor, mode: 'round' };
  }
  return two ? { dividend: 95.3, divisor: 23, mode: 'round' } : { dividend: 16, divisor: 7, mode: 'round' };
}

export type DivVariant = 'tenths' | 'small' | 'two' | 'big';

export function generateDiv(level: DivLevel, variant?: DivVariant): DivProblem {
  switch (level) {
    case 'div-basic': return genExact(variant ?? (Math.random() < 0.25 ? 'small' : undefined));
    case 'div-carry': return genCarry();
    case 'div-remainder': return genRemainder(variant === 'big');
    case 'div-2digit': return gen2digit(variant);
    case 'div-int': return genInt(variant);
    case 'div-round': return genRound(variant);
    case 'div-check': return genRemainder(true, true);
  }
}

/** 商の小数点だけを考える問題（8.4 ÷ 3 → 28 に小数点）。商は1以上・小数第一位 */
export function generateDivPoint(): DivProblem {
  for (let t = 0; t < 300; t++) {
    const divisor = Math.random() < 0.3 ? rnd(12, 29) : rnd(2, 9);
    if (divisor % 10 === 0) continue;
    const qs = rnd(12, 99);
    if (qs % 10 === 0) continue;
    const prod = qs * divisor;
    if (prod % 10 === 0) continue;
    return { dividend: prod / 10, divisor, mode: 'exact' };
  }
  return { dividend: 8.4, divisor: 3, mode: 'exact' };
}
