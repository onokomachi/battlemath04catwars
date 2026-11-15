// このファイルは単元アプリ syo4-syousu-v2 の src/lib/placeValue.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 位取りラボ の純粋ロジック（CRA）。
 * 数構成（3.245 = 1を3こ, 0.1を2こ, 0.01を4こ, 0.001を5こ）、
 * 「0.001 を全部で何こ」、10倍・1/10 を扱う。整数スケールで誤差回避。
 */

export const PLACE_UNITS = [
  { place: 0, value: 1, label: '1', color: '#0ea5e9' },
  { place: -1, value: 0.1, label: '0.1', color: '#10b981' },
  { place: -2, value: 0.01, label: '0.01', color: '#f59e0b' },
  { place: -3, value: 0.001, label: '0.001', color: '#ef4444' },
];

function rnd(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** total(=value×1000) を 0.001 単位の整数で持ち、表示用に数値へ。 */
export function fromMilli(milli: number): number {
  return Math.round(milli) / 1000;
}

/** 整数 n を 10^shift 倍した数の十進文字列（shift 負＝小数）。浮動小数を使わず誤差ゼロ。 */
export function shiftPointString(n: number, shift: number): string {
  const neg = n < 0;
  let s = Math.abs(Math.round(n)).toString();
  if (shift >= 0) return (neg ? '-' : '') + s + '0'.repeat(shift);
  const k = -shift;
  if (s.length <= k) s = '0'.repeat(k - s.length + 1) + s; // 先頭に 0 を補う
  const cut = s.length - k;
  const intPart = s.slice(0, cut);
  const frac = s.slice(cut).replace(/0+$/, ''); // 末尾の 0 を落とす
  return (neg ? '-' : '') + intPart + (frac ? '.' + frac : '');
}

/* ---------- 数をつくる（ディスク構成） ---------- */
export type ComposeLevel = 'compose-2' | 'compose-3';

export const COMPOSE_LEVELS: { id: ComposeLevel; label: string; description: string }[] = [
  { id: 'compose-2', label: 'つくる ①', description: '0.01 の位まで（2.13）' },
  { id: 'compose-3', label: 'つくる ②', description: '0.001 の位まで（3.245）' },
];

export interface ComposeProblem {
  decimals: number; // 2 or 3
  digits: number[]; // [ones, tenths, hundredths, (thousandths)]
  target: number;
}

export function generateCompose(level: ComposeLevel): ComposeProblem {
  const decimals = level === 'compose-2' ? 2 : 3;
  const digits = [rnd(1, 9)];
  for (let i = 1; i <= decimals; i++) digits.push(rnd(0, 9));
  // 末尾は 0 でない方が「その位まで」が明確
  if (digits[decimals] === 0) digits[decimals] = rnd(1, 9);
  let milli = digits[0] * 1000;
  if (decimals >= 1) milli += digits[1] * 100;
  if (decimals >= 2) milli += digits[2] * 10;
  if (decimals >= 3) milli += digits[3];
  return { decimals, digits, target: fromMilli(milli) };
}

/* ---------- あつめた数（単位の個数） ---------- */
export type CollectLevel = 'collect-basic' | 'collect-regroup';

export const COLLECT_LEVELS: { id: CollectLevel; label: string; description: string }[] = [
  { id: 'collect-basic', label: 'あつめる ①', description: '0.235 は 0.001 を 何こ？' },
  { id: 'collect-regroup', label: 'あつめる ②', description: '0.1 を 14こ あつめると？' },
];

export interface CollectProblem {
  direction: 'count' | 'value'; // count: 値→個数, value: 個数→値
  unitLabel: string;
  unitValue: number;
  count: number;
  value: number;
  answer: string; // 入力させる正答（文字列）
}

/** テスト本番モード用に単位・方向を固定できる。 */
export interface CollectOpts {
  unit?: '0.1' | '0.01' | '0.001';
  direction?: 'count' | 'value';
}

export function generateCollect(level: CollectLevel, opts: CollectOpts = {}): CollectProblem {
  const units = [
    { label: '0.1', value: 0.1, milli: 100 },
    { label: '0.01', value: 0.01, milli: 10 },
    { label: '0.001', value: 0.001, milli: 1 },
  ];
  const u = opts.unit
    ? units.find((x) => x.label === opts.unit)!
    : units[rnd(0, level === 'collect-basic' ? 1 : 2)];
  let count: number;
  if (level === 'collect-basic' && !opts.unit) {
    count = rnd(2, 9);
  } else if (u.label === '0.1') {
    count = rnd(11, 39); // くり上がる量
  } else if (u.label === '0.01') {
    count = rnd(11, 250);
  } else {
    // 0.001 は大きな個数も（例: 0.001 を 3776 こ → 3.776）
    count = rnd(11, 9999);
  }
  const value = fromMilli(count * u.milli);
  const direction: 'count' | 'value' = opts.direction ?? (Math.random() < 0.5 ? 'count' : 'value');
  return {
    direction,
    unitLabel: u.label,
    unitValue: u.value,
    count,
    value,
    answer: direction === 'count' ? String(count) : String(value),
  };
}

/* ---------- 10倍・1/10・100倍・1/100 ---------- */
export type ScaleLevel = 'scale-10' | 'scale-tenth' | 'scale-100' | 'scale-mix';

export const SCALE_LEVELS: { id: ScaleLevel; label: string; description: string }[] = [
  { id: 'scale-10', label: '10倍', description: '2.45 を 10倍すると？' },
  { id: 'scale-tenth', label: '10分の1', description: '2.45 の 1/10 は？' },
  { id: 'scale-100', label: '100倍・1/100', description: '377.6 を 1/100 にすると？' },
  { id: 'scale-mix', label: 'ミックス', description: '10倍・1/10・100倍・1/100' },
];

export type ScaleOp = '×10' | '÷10' | '×100' | '÷100';

export interface ScaleProblem {
  value: number;
  op: ScaleOp;
  answer: string;
}

const SCALE_LABELS: Record<ScaleOp, string> = {
  '×10': '10倍した数',
  '÷10': '1/10にした数',
  '×100': '100倍した数',
  '÷100': '1/100にした数',
};

export function scaleOpLabel(op: ScaleOp): string {
  return SCALE_LABELS[op];
}

export function generateScale(level: ScaleLevel, forceOp?: ScaleOp): ScaleProblem {
  const decimals = rnd(1, 2);
  const milli = decimals === 1 ? rnd(11, 98) * 100 : rnd(105, 989) * 10;
  const value = fromMilli(milli);
  let op: ScaleOp;
  if (forceOp) op = forceOp;
  else if (level === 'scale-10') op = '×10';
  else if (level === 'scale-tenth') op = '÷10';
  else if (level === 'scale-100') op = Math.random() < 0.5 ? '×100' : '÷100';
  else op = (['×10', '÷10', '×100', '÷100'] as ScaleOp[])[rnd(0, 3)];
  // 答え = value × 10^k = (milli/1000) × 10^k = milli を 10^(k-3) 倍した数。
  // ÷10・÷100 は 0.001 より小さい位（0.0105 等）になり得るので、整数の桁ずらしで誤差なく文字列化する。
  const k = op === '×10' ? 1 : op === '÷10' ? -1 : op === '×100' ? 2 : -2;
  return { value, op, answer: shiftPointString(milli, k - 3) };
}

/* ---------- 単位変換（長さ・重さ） ---------- */
export type UnitLevel = 'unit-length' | 'unit-mass' | 'unit-mix';

export const UNIT_LEVELS: { id: UnitLevel; label: string; description: string }[] = [
  { id: 'unit-length', label: '長さの たんい', description: '5m28cm は 何 m？' },
  { id: 'unit-mass', label: '重さの たんい', description: '673g は 何 kg？' },
  { id: 'unit-mix', label: 'ミックス', description: '長さ・重さ がまざる' },
];

export interface UnitProblem {
  promptStr: string; // 表示する問い（例: 5m28cm を m で）
  promptSpeak: string; // 読み上げ
  answer: string; // 入力させる小数（例: 5.28）
  answerUnit: string; // m / kg
}

// 長さ：cm 単位の整数 → m の小数（1m=100cm）
function genUnitLength(): UnitProblem {
  // ときどき複合表記（5m28cm）、ときどき単一（80cm）
  const compound = Math.random() < 0.6;
  if (compound) {
    const m = rnd(1, 9);
    const cm = rnd(1, 99);
    const totalCm = m * 100 + cm;
    return {
      promptStr: `${m}m${cm}cm`,
      promptSpeak: `${m}メートル${cm}センチメートルは 何メートル`,
      answer: String(fromMilli(totalCm * 10)),
      answerUnit: 'm',
    };
  }
  const cm = rnd(5, 95);
  return {
    promptStr: `${cm}cm`,
    promptSpeak: `${cm}センチメートルは 何メートル`,
    answer: String(fromMilli(cm * 10)),
    answerUnit: 'm',
  };
}

// 重さ：g 単位の整数 → kg の小数（1kg=1000g）
function genUnitMass(): UnitProblem {
  const compound = Math.random() < 0.5;
  if (compound) {
    const kg = rnd(1, 8);
    const g = rnd(1, 999);
    const totalG = kg * 1000 + g;
    return {
      promptStr: `${kg}kg${g}g`,
      promptSpeak: `${kg}キログラム${g}グラムは 何キログラム`,
      answer: String(fromMilli(totalG)),
      answerUnit: 'kg',
    };
  }
  const g = rnd(105, 985);
  return {
    promptStr: `${g}g`,
    promptSpeak: `${g}グラムは 何キログラム`,
    answer: String(fromMilli(g)),
    answerUnit: 'kg',
  };
}

export function generateUnit(level: UnitLevel): UnitProblem {
  if (level === 'unit-length') return genUnitLength();
  if (level === 'unit-mass') return genUnitMass();
  return Math.random() < 0.5 ? genUnitLength() : genUnitMass();
}

/* ---------- ○の位の数字は？ ---------- */
export type PlaceIdLevel = 'placeid-2' | 'placeid-3';

export const PLACEID_LEVELS: { id: PlaceIdLevel; label: string; description: string }[] = [
  { id: 'placeid-2', label: '位の数字 ①', description: '小数第二位まで（2.13）' },
  { id: 'placeid-3', label: '位の数字 ②', description: '小数第三位まで（1.695）' },
];

export interface PlaceIdProblem {
  valueStr: string; // 出題する数（例: 1.695）
  place: number; // 0=一の位, -1=小数第一位 ...
  placeLabel: string; // 「1/1000の位」など表示用
  placeSpeak: string;
  answer: string; // その位の数字
}

// place（0,-1,-2,-3...）に対する両表記
function placeIdLabel(place: number): { label: string; speak: string } {
  switch (place) {
    case 0: return { label: '一の位', speak: 'いちのくらい' };
    case -1: return { label: '小数第一位（1/10の位）', speak: 'しょうすうだいいちい、じゅうぶんのいちのくらい' };
    case -2: return { label: '小数第二位（1/100の位）', speak: 'しょうすうだいにい、ひゃくぶんのいちのくらい' };
    case -3: return { label: '小数第三位（1/1000の位）', speak: 'しょうすうだいさんい、せんぶんのいちのくらい' };
    default: return { label: '', speak: '' };
  }
}

export function generatePlaceId(level: PlaceIdLevel, forcePlace?: number): PlaceIdProblem {
  const decimals = level === 'placeid-2' ? 2 : 3;
  const digits = [rnd(1, 9)];
  for (let i = 1; i <= decimals; i++) digits.push(rnd(0, 9));
  if (digits[decimals] === 0) digits[decimals] = rnd(1, 9);
  let milli = digits[0] * 1000;
  if (decimals >= 1) milli += digits[1] * 100;
  if (decimals >= 2) milli += digits[2] * 10;
  if (decimals >= 3) milli += digits[3];
  const valueStr = fromMilli(milli).toFixed(decimals);
  // 問う位を選ぶ（0 〜 -decimals）。forcePlace 指定時はその位（例: -3 = 1/1000の位）。
  const place = forcePlace !== undefined ? forcePlace : -rnd(0, decimals);
  const idx = -place; // digits 配列のインデックス（0=一の位）
  const { label, speak } = placeIdLabel(place);
  return {
    valueStr,
    place,
    placeLabel: label,
    placeSpeak: speak,
    answer: String(digits[idx]),
  };
}

/* ---------- 数の分解（1.695 = 1を1こ、0.1を6こ…） ---------- */
export interface DecomposeProblem {
  valueStr: string; // 例: 1.695
  // 各位の個数（一の位/小数第一位/第二位/第三位）
  counts: { ones: number; tenths: number; hundredths: number; thousandths: number };
}

/** 3桁小数を出し、1・0.1・0.01・0.001 がそれぞれ何個分かを答えさせる（大問1①）。 */
export function generateDecompose(): DecomposeProblem {
  const digits = [rnd(1, 9), rnd(0, 9), rnd(0, 9), rnd(1, 9)];
  const milli = digits[0] * 1000 + digits[1] * 100 + digits[2] * 10 + digits[3];
  return {
    valueStr: fromMilli(milli).toFixed(3),
    counts: { ones: digits[0], tenths: digits[1], hundredths: digits[2], thousandths: digits[3] },
  };
}
