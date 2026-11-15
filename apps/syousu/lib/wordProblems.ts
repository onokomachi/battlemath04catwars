// このファイルは単元アプリ syo4-syousu-v2 の src/lib/wordProblems.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 文章題（立式→計算）。資料の最大の弱点「『倍』『ぜんぶで』等の表面語で機械的に演算選択」に対処。
 * 場面（合併/求残/等量のまとまり/等分）から正しい演算を選ぶスキーマ型指導（エビレベルI）。
 * 立式を選ぶ → 計算する の2段階。整数スケールで答えはきれいな小数にする。
 */
export type WpOp = '+' | '-' | '×' | '÷';

export interface WordProblem {
  text: string;
  emoji: string;
  unit: string;
  a: number;
  b: number;
  op: WpOp;
  choices: string[]; // しきの選択肢（表示）
  correctIndex: number;
  answer: string; // 数値の答え
  speak: string;
  why: string; // 立式を選んだ後の解説（スキーマ）
}

function rnd(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function d1(n: number) { return Math.round(n * 10) / 10; }
function pick<T>(a: T[]): T { return a[Math.floor(Math.random() * a.length)]; }

function calc(a: number, b: number, op: WpOp): number {
  if (op === '+') return d1(a + b);
  if (op === '-') return d1(a - b);
  if (op === '×') return d1(a * b);
  return d1(a / b);
}

function buildChoices(a: number, b: number, op: WpOp): { choices: string[]; correctIndex: number } {
  const others: WpOp[] = (['+', '-', '×', '÷'] as WpOp[]).filter((o) => o !== op);
  const distractors = others.sort(() => Math.random() - 0.5).slice(0, 2);
  const ops = [op, ...distractors].sort(() => Math.random() - 0.5);
  const choices = ops.map((o) => `${a} ${o} ${b}`);
  return { choices, correctIndex: ops.indexOf(op) };
}

type Builder = () => Omit<WordProblem, 'choices' | 'correctIndex' | 'answer' | 'speak'>;

// 合併（+）：ちがう量を あわせる
const combine: Builder = () => {
  const a = d1(rnd(11, 49) / 10), b = d1(rnd(11, 49) / 10);
  const u = pick(['m', 'L', 'kg']);
  const thing = u === 'm' ? 'テープ' : u === 'L' ? '水' : 'すな';
  return { text: `赤い ${thing}が ${a}${u}、青い ${thing}が ${b}${u} あります。あわせて 何${u}ですか？`, emoji: u === 'm' ? '🎀' : u === 'L' ? '💧' : '🏖️', unit: u, a, b, op: '+', why: '「あわせて」は 2つを たすよ。' };
};
// 求残（−）：のこりを もとめる
const remain: Builder = () => {
  let a = d1(rnd(25, 59) / 10), b = d1(rnd(11, 23) / 10);
  if (b >= a) [a, b] = [a + b, b];
  const u = pick(['m', 'L']);
  return { text: `${u === 'm' ? 'リボン' : 'ジュース'}が ${a}${u} あります。${b}${u} つかいました。のこりは 何${u}ですか？`, emoji: u === 'm' ? '🎀' : '🥤', unit: u, a, b, op: '-', why: '「のこり」は ひき算だよ。' };
};
// 等量のまとまり（×）：1つ分 × いくつ分
const groups: Builder = () => {
  const a = d1(rnd(11, 39) / 10), b = rnd(2, 6);
  const u = pick(['L', 'm', 'kg']);
  const item = u === 'L' ? 'ジュース' : u === 'm' ? 'ひも' : 'さとう';
  const counter = u === 'L' ? '本' : u === 'm' ? '本' : 'ふくろ';
  return { text: `1${counter} ${a}${u}の ${item}が ${b}${counter} あります。ぜんぶで 何${u}ですか？`, emoji: u === 'L' ? '🧃' : u === 'm' ? '🧶' : '🍬', unit: u, a, b, op: '×', why: '「1つ分 × いくつ分」で かけ算だよ。ことばに つられないでね。' };
};
// 等分（÷）：ぜんぶ ÷ 人数 = 1つ分
const share: Builder = () => {
  const per = d1(rnd(11, 39) / 10), people = rnd(2, 6);
  const total = d1(per * people);
  const u = pick(['m', 'L']);
  return { text: `${u === 'm' ? 'リボン' : 'ジュース'}が ${total}${u} あります。${people}人で 同じように 分けます。1人分は 何${u}ですか？`, emoji: u === 'm' ? '🎀' : '🥤', unit: u, a: total, b: people, op: '÷', why: '「同じように 分ける・1つ分」は わり算だよ。' };
};

const BUILDERS = [combine, remain, groups, share];
const BY_OP: Record<WpOp, Builder> = { '+': combine, '-': remain, '×': groups, '÷': share };

export function generateWordProblem(forceOp?: WpOp): WordProblem {
  const base = (forceOp ? BY_OP[forceOp] : pick(BUILDERS))();
  const { choices, correctIndex } = buildChoices(base.a, base.b, base.op);
  const answer = String(calc(base.a, base.b, base.op));
  return {
    ...base,
    choices,
    correctIndex,
    answer,
    speak: base.text,
  };
}
