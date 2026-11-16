// このファイルは単元アプリ syo4-syousu-v2 の src/lib/mulDivQuestions.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 「小数の かけ算・わり算」のすべてのレベルを、1つの形（MulDivQ）で作る。
 * 練習モジュール・本番テスト・実力の階段は、ここで作った問題を同じ画面（MulDivRound）で解く。
 *
 * 筆算（mul-* / div-* の筆算レベル）は decimalMulDiv.ts。
 * ここでは そのほか（暗算・計算のしかた・小数点をうつ・文章題・小数倍）も作る。
 * 数はすべて整数スケールで作り、答えは文字列で持つ（浮動小数点の誤差を出さない）。
 */
import {
  MUL_LEVELS, DIV_LEVELS, type MulLevel, type DivLevel, type MulProblem, type DivProblem,
  type MulVariant, type DivVariant,
  generateMul, generateDiv, generateMulPoint, generateDivPoint, buildMul, buildDiv, formatScaled,
} from './decimalMulDiv';
import type { WordProblem, WpOp } from './wordProblems';

function rnd(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(a: readonly T[]): T { return a[Math.floor(Math.random() * a.length)]!; }
function shuffle<T>(a: T[]): T[] { return [...a].sort(() => Math.random() - 0.5); }

/* ---------------- レベルの一覧（記録の名前＝レベルID） ---------------- */

export type ExtraMulLevel = 'mul-mental' | 'mul-method' | 'mul-point' | 'mul-word';
export type ExtraDivLevel = 'div-mental' | 'div-point' | 'div-word' | 'div-word-remainder' | 'div-times';
export type MulDivLevel = MulLevel | DivLevel | ExtraMulLevel | ExtraDivLevel;

export interface LevelMeta<L extends string = MulDivLevel> { id: L; label: string; description: string }

export const EXTRA_LEVELS: LevelMeta<ExtraMulLevel | ExtraDivLevel>[] = [
  { id: 'mul-mental', label: 'かけ算 あんざん', description: '0.8 × 3 を 0.1の いくつ分で' },
  { id: 'div-mental', label: 'わり算 あんざん', description: '2.6 ÷ 2 を 0.1の いくつ分で' },
  { id: 'mul-method', label: 'かけ算の しくみ', description: '2.7 × 5 → 27 × 5 の 1/10' },
  { id: 'mul-point', label: '積の 小数点', description: '4.3 × 16 の 積に 小数点を うつ' },
  { id: 'div-point', label: '商の 小数点', description: '8.4 ÷ 3 の 商に 小数点を うつ' },
  { id: 'mul-word', label: 'かけ算の 文章題', description: '0.2L入りが 7本で 何L？' },
  { id: 'div-word', label: 'わり算の 文章題', description: '7.5mを 5人で 等分すると？' },
  { id: 'div-word-remainder', label: 'あまりの 文章題', description: '13.4dLを 3dLずつ → 何本・あまり' },
  { id: 'div-times', label: '小数倍', description: '56cmは 20cmの 何倍？（2.8倍）' },
];

export const ALL_MULDIV_LEVELS: LevelMeta[] = [...MUL_LEVELS, ...DIV_LEVELS, ...EXTRA_LEVELS];

export function mulDivLabel(level: string): string {
  return ALL_MULDIV_LEVELS.find((l) => l.id === level)?.label ?? level;
}

export function isMulDivLevel(id: string): id is MulDivLevel {
  return ALL_MULDIV_LEVELS.some((l) => l.id === id);
}

/* ---------------- 問題の形 ---------------- */

export interface MentalProblem { a: number; b: number; op: '×' | '÷'; answer: string }
export interface MethodProblem { a: number; b: number; ask: 'product' | 'ratio' | 'both' }
export interface RemWordProblem {
  text: string; emoji: string; unit: string; counter: string;
  total: number; each: number; count: number; rest: string;
  choices: string[]; correctIndex: number;
}
export interface TimesProblem {
  /** table: テープの表と図から（紙の大問11）。text: 文だけ（いかそう算数） */
  style: 'table' | 'text';
  text: string;
  items: { name: string; value: number; color: string }[]; // table のときの表
  target: number; // 何倍かを求める量
  base: number; // もとにする量
  targetName: string;
  baseName: string;
  unit: string;
  answer: string;
  choices: string[];
  correctIndex: number;
}

export type MulDivQ =
  | { ui: 'mul'; level: MulLevel; p: MulProblem }
  | { ui: 'div'; level: DivLevel; p: DivProblem }
  | { ui: 'mulPoint'; level: 'mul-point'; p: MulProblem }
  | { ui: 'divPoint'; level: 'div-point'; p: DivProblem }
  | { ui: 'mental'; level: 'mul-mental' | 'div-mental'; p: MentalProblem }
  | { ui: 'method'; level: 'mul-method'; p: MethodProblem }
  | { ui: 'word'; level: 'mul-word' | 'div-word'; p: WordProblem }
  | { ui: 'remWord'; level: 'div-word-remainder'; p: RemWordProblem }
  | { ui: 'times'; level: 'div-times'; p: TimesProblem };

/* ---------------- 暗算 ---------------- */

export function generateMental(op: '×' | '÷'): MentalProblem {
  if (op === '×') {
    // 0.8 × 3：0.1 が 8×3 こ
    const t = rnd(2, 9), b = rnd(2, 9);
    const a = t / 10;
    return { a, b, op, answer: formatScaled(t * b, 1) };
  }
  // 2.6 ÷ 2：0.1 が 26÷2 こ。くり下がりのない やさしい形
  for (let k = 0; k < 100; k++) {
    const b = rnd(2, 4);
    const qi = rnd(0, 4), qt = rnd(1, 9);
    if (qi * b >= 10 || qt * b >= 10) continue;
    const q = qi * 10 + qt;
    const a = (q * b) / 10;
    if ((q * b) % 10 === 0) continue;
    return { a, b, op, answer: formatScaled(q, 1) };
  }
  return { a: 2.6, b: 2, op, answer: '1.3' };
}

/* ---------------- 計算のしかた（2.7 × 5 → 27 × 5 → 1/10） ---------------- */

export function generateMethod(ask: MethodProblem['ask'] = 'both'): MethodProblem {
  for (let k = 0; k < 100; k++) {
    const n = rnd(12, 49);
    if (n % 10 === 0) continue;
    const b = rnd(3, 9);
    if ((n * b) % 10 === 0) continue;
    return { a: n / 10, b, ask };
  }
  return { a: 2.7, b: 5, ask };
}

/* ---------------- 文章題（かけ算・等分） ---------------- */

function buildChoices(a: string, b: string, op: WpOp, others: WpOp[]): { choices: string[]; correctIndex: number } {
  const ops = shuffle([op, ...others]);
  return { choices: ops.map((o) => `${a} ${o} ${b}`), correctIndex: ops.indexOf(op) };
}

/** 0.2L入りのジュースが 7本（小数 × 整数） */
export function generateMulWord(): WordProblem {
  const kind = pick(['juice', 'tape', 'sugar'] as const);
  const n = kind === 'tape' ? rnd(12, 38) : rnd(2, 9); // ×10 した 1つ分
  const a = n / 10;
  const b = rnd(3, 9);
  const answer = formatScaled(n * b, 1);
  const u = kind === 'juice' ? 'L' : kind === 'tape' ? 'm' : 'kg';
  const text = kind === 'juice'
    ? `${a}L入りの ジュースが ${b}本 あります。ジュースは ぜんぶで 何L ありますか。`
    : kind === 'tape'
      ? `1本 ${a}mの テープが ${b}本 あります。テープは ぜんぶで 何m ありますか。`
      : `1ふくろ ${a}kgの さとうが ${b}ふくろ あります。さとうは ぜんぶで 何kg ありますか。`;
  const { choices, correctIndex } = buildChoices(String(a), String(b), '×', ['÷', '+']);
  return {
    text, emoji: kind === 'juice' ? '🧃' : kind === 'tape' ? '🎀' : '🍬', unit: u,
    a, b, op: '×', choices, correctIndex, answer, speak: text,
    why: '「1つ分 × いくつ分」で ぜんぶの 量。かけ算だよ。',
  };
}

/** 7.5mのリボンを 5人で等分（小数 ÷ 整数） */
export function generateDivWord(): WordProblem {
  for (let k = 0; k < 100; k++) {
    const people = rnd(2, 9);
    const q = rnd(11, 29); // 1人分 ×10
    if (q % 10 === 0) continue;
    const totalScaled = q * people;
    if (totalScaled % 10 === 0) continue;
    const total = totalScaled / 10;
    const u = pick(['m', 'L'] as const);
    const text = u === 'm'
      ? `${total}mの リボンを ${people}人で 等分します。1人分は 何m に なりますか。`
      : `${total}Lの ジュースを ${people}人で 等分します。1人分は 何L に なりますか。`;
    const { choices, correctIndex } = buildChoices(String(total), String(people), '÷', ['×', '-']);
    return {
      text, emoji: u === 'm' ? '🎀' : '🥤', unit: u,
      a: total, b: people, op: '÷', choices, correctIndex, answer: formatScaled(q, 1), speak: text,
      why: '「同じように 分けた 1人分」は わり算だよ。',
    };
  }
  return generateDivWord();
}

/** 13.4dLの油を 3dLずつびんに入れる → 何本できて 何dL あまる */
export function generateRemWord(): RemWordProblem {
  for (let k = 0; k < 200; k++) {
    const each = rnd(2, 6);
    const count = rnd(2, 9);
    const restTenths = rnd(1, each * 10 - 1);
    if (restTenths % 10 === 0) continue;
    const totalTenths = each * count * 10 + restTenths;
    const total = totalTenths / 10;
    const kind = pick(['oil', 'juice', 'ribbon'] as const);
    const unit = kind === 'ribbon' ? 'm' : 'dL';
    const counter = kind === 'ribbon' ? '本' : '本';
    const text = kind === 'oil'
      ? `${total}dLの 油を ${each}dLずつ びんに 入れます。${each}dL入りの びんは 何本できて、何dL あまりますか。`
      : kind === 'juice'
        ? `${total}dLの ジュースを ${each}dLずつ コップに 分けます。${each}dLの ジュースは 何本分できて、何dL あまりますか。`
        : `${total}mの リボンから ${each}mの リボンを 切りとります。${each}mの リボンは 何本できて、何m あまりますか。`;
    const ops = shuffle(['÷', '×', 'r'] as const);
    const choices = ops.map((o) => (o === '÷' ? `${total} ÷ ${each}` : o === '×' ? `${total} × ${each}` : `${each} ÷ ${total}`));
    return {
      text, emoji: kind === 'oil' ? '🫙' : kind === 'juice' ? '🥤' : '🎀', unit, counter,
      total, each, count, rest: formatScaled(restTenths, 1),
      choices, correctIndex: ops.indexOf('÷'),
    };
  }
  return generateRemWord();
}

/* ---------------- 小数倍 ---------------- */

const TAPE_COLORS = [
  { name: '赤', color: '#f472b6' },
  { name: '青', color: '#38bdf8' },
  { name: '黄', color: '#facc15' },
];

function timesChoices(target: number, base: number): { choices: string[]; correctIndex: number } {
  const ops = shuffle(['t/b', 'b/t', 't-b'] as const);
  return {
    choices: ops.map((o) => (o === 't/b' ? `${target} ÷ ${base}` : o === 'b/t' ? `${base} ÷ ${target}` : `${target} − ${base}`)),
    correctIndex: ops.indexOf('t/b'),
  };
}

export interface TimesTable { base: number; big: number; small: number }

/** 赤（もとにする）・青（赤より長い）・黄（赤より短い）のテープの長さ */
export function generateTimesTable(): TimesTable {
  const base = pick([10, 20, 30, 40, 50]);
  const step = base / 10; // 0.1倍あたりの長さ
  for (let k = 0; k < 100; k++) {
    const kb = rnd(12, 39); // 1.2〜3.9倍
    const ks = rnd(2, 9); // 0.2〜0.9倍
    if (kb % 10 === 0) continue;
    const big = kb * step, small = ks * step;
    if (!Number.isInteger(big) || !Number.isInteger(small) || big > 150) continue;
    return { base, big, small };
  }
  return { base: 20, big: 56, small: 10 };
}

/** which: 'big' = 青は赤の何倍（1より大きい）、'small' = 黄は赤の何倍（1より小さい） */
export function generateTimes(which?: 'big' | 'small', table: TimesTable = generateTimesTable()): TimesProblem {
  const w = which ?? (Math.random() < 0.6 ? 'big' : 'small');
  const target = w === 'big' ? table.big : table.small;
  const targetName = w === 'big' ? '青' : '黄';
  const { choices, correctIndex } = timesChoices(target, table.base);
  return {
    style: 'table',
    text: `${targetName}の テープの 長さは、赤の テープの 長さの 何倍ですか。`,
    items: [
      { ...TAPE_COLORS[0]!, value: table.base },
      { ...TAPE_COLORS[1]!, value: table.big },
      { ...TAPE_COLORS[2]!, value: table.small },
    ],
    target, base: table.base, targetName, baseName: '赤', unit: 'cm',
    answer: formatScaled(target * 10 / table.base, 1),
    choices, correctIndex,
  };
}

/** いかそう算数（ドレッシング）：64gは 5人分（8g×5＝40g）の何倍 */
export function generateDressing(): TimesProblem {
  for (let k = 0; k < 100; k++) {
    const per = rnd(4, 9);
    const people = rnd(3, 6);
    const base = per * people;
    const kk = rnd(11, 29);
    if (kk % 10 === 0) continue;
    const t = base * kk;
    if (t % 10 !== 0) continue;
    const target = t / 10;
    const { choices, correctIndex } = timesChoices(target, base);
    return {
      style: 'text',
      text: `ドレッシング 1人分に サラダ油を ${per}g 使います。${people}人分では ${per} × ${people} ＝ ${base}g です。家には サラダ油が ${target}g あります。これは ${people}人分の サラダ油の 何倍ですか。`,
      items: [], target, base, targetName: '家の サラダ油', baseName: `${people}人分`, unit: 'g',
      answer: formatScaled(kk, 1), choices, correctIndex,
    };
  }
  return generateDressing();
}

/* ---------------- まとめて作る ---------------- */

export interface GenOpts {
  mulVariant?: MulVariant;
  divVariant?: DivVariant;
  methodAsk?: MethodProblem['ask'];
  times?: 'big' | 'small';
  timesTable?: TimesTable;
}

export function generateMulDiv(level: MulDivLevel, o: GenOpts = {}): MulDivQ {
  switch (level) {
    case 'mul-mental': return { ui: 'mental', level, p: generateMental('×') };
    case 'div-mental': return { ui: 'mental', level, p: generateMental('÷') };
    case 'mul-method': return { ui: 'method', level, p: generateMethod(o.methodAsk ?? 'both') };
    case 'mul-point': return { ui: 'mulPoint', level, p: generateMulPoint() };
    case 'div-point': return { ui: 'divPoint', level, p: generateDivPoint() };
    case 'mul-word': return { ui: 'word', level, p: generateMulWord() };
    case 'div-word': return { ui: 'word', level, p: generateDivWord() };
    case 'div-word-remainder': return { ui: 'remWord', level, p: generateRemWord() };
    case 'div-times': return { ui: 'times', level, p: generateTimes(o.times, o.timesTable) };
    case 'mul-tenths': case 'mul-hundredths': case 'mul-2digit': case 'mul-zero-end':
      return { ui: 'mul', level, p: generateMul(level, o.mulVariant) };
    default:
      return { ui: 'div', level, p: generateDiv(level, o.divVariant) };
  }
}

/** 学習のきろく・テスト結果用の「問題」と「正しい答え」 */
export function describeMulDiv(q: MulDivQ): { q: string; a: string } {
  switch (q.ui) {
    case 'mul': return { q: `${q.p.a} × ${q.p.b}（筆算）`, a: buildMul(q.p.a, q.p.b).productStr };
    case 'mulPoint': return { q: `${q.p.a} × ${q.p.b} の 積に 小数点`, a: buildMul(q.p.a, q.p.b).productStr };
    case 'div': {
      const m = buildDiv(q.p);
      if (q.p.mode === 'remainder') {
        return q.p.check
          ? { q: `${q.p.dividend} ÷ ${q.p.divisor}（あまり・けん算）`, a: `${m.quotientStr} あまり ${m.remainderStr}／${q.p.divisor}×${m.quotientStr}＋${m.remainderStr}＝${q.p.dividend}` }
          : { q: `${q.p.dividend} ÷ ${q.p.divisor}（商は一の位まで）`, a: `${m.quotientStr} あまり ${m.remainderStr}` };
      }
      if (q.p.mode === 'round') return { q: `${q.p.dividend} ÷ ${q.p.divisor}（上から2けたの がい数）`, a: m.roundedStr };
      return { q: `${q.p.dividend} ÷ ${q.p.divisor}（わりきれるまで）`, a: m.quotientStr };
    }
    case 'divPoint': return { q: `${q.p.dividend} ÷ ${q.p.divisor} の 商に 小数点`, a: buildDiv(q.p).quotientStr };
    case 'mental': return { q: `${q.p.a} ${q.p.op} ${q.p.b}（あんざん）`, a: q.p.answer };
    case 'method': {
      const prod = buildMul(q.p.a, q.p.b).productStr;
      return { q: `${q.p.a} × ${q.p.b} の 計算のしかた`, a: q.p.ask === 'ratio' ? '1/10' : q.p.ask === 'product' ? prod : `1/10・${prod}` };
    }
    case 'word': return { q: q.p.text, a: `${q.p.a} ${q.p.op} ${q.p.b} ＝ ${q.p.answer}${q.p.unit}` };
    case 'remWord': return { q: q.p.text, a: `${q.p.total} ÷ ${q.p.each} ＝ ${q.p.count} あまり ${q.p.rest}（${q.p.count}${q.p.counter}・${q.p.rest}${q.p.unit}）` };
    case 'times': return { q: q.p.text, a: `${q.p.target} ÷ ${q.p.base} ＝ ${q.p.answer}倍` };
  }
}
