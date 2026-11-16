// このファイルは単元アプリ syo4-bunnsu の src/lib/problems.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 小4「分数」（東京書籍『新しい算数4下』10. 分数）の問題ジェネレーター集。
 * 画面には依存しない純粋関数だけ。scripts/verify-problems.ts が全項目を1万回ずつ作って検査する。
 *
 * モジュール（記号の前半 = skillId の接頭辞）:
 *   hyo … 1より大きい分数の表し方（真分数・仮分数・帯分数／単位分数の何こ分／テープ・水のかさ／数直線）
 *   hen … 仮分数と帯分数・整数（仮分数→帯分数・整数／わり算で直す／帯分数→仮分数）
 *   eq  … 大きさの等しい分数（数直線をならべて）
 *   cmp … 分数の大小（分母が同じ／分子が同じ／大きい順にならべる）
 *   add … 分母が同じ分数のたし算（仮分数・帯分数・整数＋帯分数・くり上がり・答えが整数）
 *   sub … 分母が同じ分数のひき算（帯分数・帯分数－整数・くり下がり・整数－分数）
 *   wp  … ことばの もんだい（あわせて・ちがい・のこり・進み具合をくらべる）
 *   eh  … エラーハンター（errorHunter.ts）
 *
 * 1問は Prob。問題文・ヒントの分数は {3|4}・{1;3|4}・{□|6} の記法で書く（frac.ts）。
 * 1つの Prob は「手順（steps）」を持ち、順番に答えさせる。答え方は10種類:
 *   num（数）／frac（分数・書いた形のとおり）／mixed（帯分数）／any（帯分数・仮分数・整数のどれでもよい）／
 *   choice（えらぶ）／tick（数直線をタップ）／shade（図に色をぬる）／order（カードを順にならべる）／
 *   build（文章題の式を、数と ＋－ のカードで自分で組み立てる。2回まちがえたら choice を足場として出す）
 */
import type { ScratchOp, FractionTool } from 'learning-app-kit/react';
import { F, M, rnd, pick, shuffle, retry, plain, cmpFrac } from './frac';

/* =====================================================================
 * 型
 * =================================================================== */

export interface TapeRef {
  parts: number;
  shaded: number;
  label: string;
}

export type Figure =
  /** 1本の棒（全体＝1）を parts 等分。shaded こに色。shaded2 こ（つづけて）に2色め */
  | { kind: 'tape'; parts: number; shaded: number; shaded2?: number; whole: string; refs?: TapeRef[]; guides?: boolean }
  /** 0〜max の数直線を 1/den きざみで。marks＝矢印と名前 */
  | { kind: 'numline'; max: number; den: number; decimals?: boolean; marks?: { at: number; label: string }[] }
  /** 0〜wholes（m など）のテープ。1あたり den 等分。下にものさし。shaded こに色、shaded2 こ（つづけて）に2色め */
  | { kind: 'mtape'; wholes: number; den: number; shaded: number; shaded2?: number; unit: string }
  /** 1L（など）ますが count こ。1こを den 等分。filled こ分（左のますから、下から）に水 */
  | { kind: 'cups'; count: number; den: number; filled: number; unit: string }
  /** 0〜1 の数直線を、分母ごとに上から順にならべる。marks＝その段の目盛りに矢印。tapRow＝タップできる段 */
  | { kind: 'numlines'; dens: number[]; marks?: { row: number; at: number; label: string }[]; tapRow?: number };

export type Ans =
  | { kind: 'num'; v: number }
  /** 書いた形のとおり（分母も分子も） */
  | { kind: 'frac'; n: number; d: number }
  | { kind: 'mixed'; w: number; n: number; d: number }
  /**
   * 大きさが n/d の答え。帯分数・仮分数・整数のどの形でも正解（分母は d のまま）。
   * only='mixed' … 帯分数か整数に直す問題（仮分数のままは「まだ直せるよ」）。
   * start … 入力欄を開いたときの形
   */
  | { kind: 'any'; n: number; d: number; only?: 'mixed'; start: 'frac' | 'mixed' }
  | { kind: 'choice'; choices: string[]; correct: number }
  /** 数直線の目盛りをタップ。correct＝0から数えて何本目の目盛りか（1/den の個数） */
  | { kind: 'tick'; correct: number }
  /** 図の何こに色をぬるか */
  | { kind: 'shade'; correct: number }
  /** items を順にタップ。correct＝正しい順の items の番号 */
  | { kind: 'order'; items: string[]; correct: number[] }
  /**
   * 文章題の式を、カードで組み立てる（紙のテストは式を書く。選ぶ練習は書く点に届きにくい）。
   * cards＝数のカード（問題文の数＋ダミー。記法つき）。＋－×÷ の記号カードは画面がいつも出す。
   * accept＝正解の式（カードを左から並べたもの。たし算の入れかえは両方）。
   * scaffold＝2回まちがえたときに足場として出す「えらぶ」形（練習だけ。本番テスト・実力の階段では出さない。ボス戦は最初からこの形）。
   */
  | { kind: 'build'; cards: string[]; accept: string[][]; scaffold: { choices: string[]; correct: number; traps: (string | null)[] } };

/** 子どもの入力 */
export interface Inp { v?: number; n?: number; d?: number; w?: number; i?: number; seq?: number[]; expr?: string[] }

export type Verdict = 'ok' | 'equiv' | 'wrong';

export interface Step {
  prompt: string;
  ans: Ans;
  fig?: Figure;
  /** まちがえたときの「どこがちがうか」。正解を入れたときは必ず null（guard が保証し、verify が確かめる） */
  diagnose?: (x: Inp) => string | null;
}

export interface Scratch {
  ops: ScratchOp[];
  decimal: boolean;
  initial?: { op: ScratchOp; a: string; b: string };
}

/** 分数のけいさんらん（kit の FractionPad）。数は問題文にそのまま書いてあるものだけ initial で渡す */
export interface FracScratch {
  kind: 'frac';
  tools: FractionTool[];
  initial?: {
    multiples?: [number, number];
    fractions?: [number, number][];
    mixed?: { w: number; n: number; d: number };
  };
}

export interface Prob {
  skillId: string;
  /** 同じ項目の中の問題の形。本番テストで「この形を出す」と指定するのに使う */
  tag?: string;
  text: string;
  fig?: Figure;
  /** true＝2回まちがえるまで図を出さない（図が答えを見せてしまう問題） */
  figOnHint?: boolean;
  steps: Step[];
  /** 3段。1回目から答えの値を見せない */
  hints: string[];
  explain: string;
  scratch?: Scratch | FracScratch;
  label: string;
  /** 答案に残す問題文と正しい答え（ふつうの文字。分数は 3/4、帯分数は 1と3/4） */
  q: string;
  a: string;
}

export interface LevelDef {
  id: string;
  label: string;
  desc: string;
  gen: () => Prob;
}

/* =====================================================================
 * 判定
 * =================================================================== */

/** 入力を [分子, 分母]（仮分数の形の大きさ）にする。形がそろっていなければ null */
export function valOf(x: Inp): [number, number] | null {
  if (x.v != null) return [x.v, 1];
  if (x.n == null || x.d == null || x.d <= 0) return null;
  return [(x.w ?? 0) * x.d + x.n, x.d];
}
const sameVal = (a: [number, number], n: number, d: number) => a[0] * d === n * a[1];

export function judge(ans: Ans, x: Inp): Verdict {
  switch (ans.kind) {
    case 'num':
      return x.v != null && Math.abs(x.v - ans.v) < 1e-9 ? 'ok' : 'wrong';
    case 'frac': {
      if (x.w == null && x.n === ans.n && x.d === ans.d) return 'ok';
      const v = valOf(x);
      return v && sameVal(v, ans.n, ans.d) ? 'equiv' : 'wrong';
    }
    case 'mixed': {
      if (x.w === ans.w && x.n === ans.n && x.d === ans.d) return 'ok';
      const v = valOf(x);
      return v && sameVal(v, ans.w * ans.d + ans.n, ans.d) ? 'equiv' : 'wrong';
    }
    case 'any': {
      const v = valOf(x);
      if (!v || !sameVal(v, ans.n, ans.d)) return 'wrong';
      if (x.v != null) return 'ok'; // 整数で答えた（大きさが合っていれば整数の答え）
      if (x.d !== ans.d) return 'equiv';
      if (x.w == null) return ans.only === 'mixed' && ans.n > ans.d ? 'equiv' : 'ok'; // 仮分数（真分数）
      // 帯分数: 整数は1以上、分数の部分は真分数（1以上・分母より小さい）
      return x.w >= 1 && x.n! >= 1 && x.n! < x.d ? 'ok' : 'equiv';
    }
    case 'choice':
    case 'tick':
    case 'shade':
      return x.i === ans.correct ? 'ok' : 'wrong';
    case 'order':
      return x.seq != null && x.seq.length === ans.correct.length && x.seq.every((v, k) => v === ans.correct[k]) ? 'ok' : 'wrong';
    case 'build': {
      if (x.i != null) return x.i === ans.scaffold.correct ? 'ok' : 'wrong';
      const j = x.expr?.join('');
      return j != null && ans.accept.some((a) => a.join('') === j) ? 'ok' : 'wrong';
    }
  }
}

/** ボス戦など、すばやく答える場面では、組み立てる手順を「えらぶ」形にして出す */
export function asChoiceStep(step: Step): Step {
  const a = step.ans;
  if (a.kind !== 'build') return step;
  const { choices, correct, traps } = a.scaffold;
  return {
    prompt: step.prompt.replace(/（.*?）/g, '').replace('を カードで つくろう', 'は どれ？'),
    ans: { kind: 'choice', choices, correct },
    fig: step.fig,
    diagnose: (x) => (x.i != null && x.i !== correct ? traps[x.i] ?? null : null),
  };
}

/** 大きさは合っているが、形がちがうときのことば（まちがいに数えない） */
export function equivMessage(ans: Ans, x: Inp): string {
  const d = ans.kind === 'frac' || ans.kind === 'mixed' || ans.kind === 'any' ? ans.d : 0;
  if (x.d != null && d && x.d !== d) return `大きさは 同じだね！ でも 分母は 問題と 同じ ${d} の ままで 答えよう。`;
  if (ans.kind === 'any' && ans.only === 'mixed' && x.w == null) return '大きさは 合っているよ。でも この 問題は、帯分数か 整数に 直して 答えよう（分子 ÷ 分母）。';
  if (x.w != null && x.w === 0) return '整数の ところが 0 なら、分数だけで 答えよう（「仮分数」の ボタン）。';
  if (x.w != null && x.n != null && x.d != null && x.n >= x.d) return '大きさは 同じだね！ でも 分数の ところが 1 より 大きいよ。1を 整数に くり上げて、整数と 真分数の 形に しよう。';
  if (x.w != null && x.n === 0) return '分数の ところが 0 なら、整数だけで 答えよう（「整数」の ボタン）。';
  if (ans.kind === 'frac') return '大きさは 同じだね！ でも この 問題は 仮分数（分子が 分母と 同じか 大きい 分数）で 答えよう。';
  if (ans.kind === 'mixed') return '大きさは 同じだね！ でも この 問題は 帯分数で 答えよう。';
  return '大きさは 同じだね！ 問題の 分母の ままで 答えよう。';
}

/* =====================================================================
 * 数と文字の部品
 * =================================================================== */

export const NAMES = ['あおい', 'そうた', 'ひなた', 'ゆい', 'はると', 'みく', 'りく', 'さくら', 'れん', 'こはる'];

/** 正解のときは診断を出さない（正解を入れて誤答メッセージが出る不具合を、作りで防ぐ） */
export const guard = (ans: Ans, f: (x: Inp) => string | null) => (x: Inp): string | null => (judge(ans, x) === 'ok' ? null : f(x));

function mk(prompt: string, ans: Ans, diag?: (x: Inp) => string | null, fig?: Figure): Step {
  return { prompt, ans, fig, diagnose: diag ? guard(ans, diag) : undefined };
}

/** 選択肢の step。traps＝その選択肢を選んだときに出す「どこがちがうか」 */
function choiceStep(prompt: string, correct: string, wrongs: string[], traps: Record<string, string> = {}): Step {
  const all = shuffle([correct, ...wrongs]);
  const idx = all.indexOf(correct);
  return {
    prompt,
    ans: { kind: 'choice', choices: all, correct: idx },
    diagnose: (x) => (x.i != null && x.i !== idx ? traps[all[x.i]!] ?? null : null),
  };
}

/** 項（分母は問題で共通）。w＝整数の部分、n＝分子。w>0 かつ n=0 は整数 */
export interface Term { w: number; n: number }
const tv = (t: Term, d: number) => t.w * d + t.n;
/** 項を記法で */
export const tr = (t: Term, d: number) => (t.w > 0 && t.n > 0 ? M(t.w, t.n, d) : t.n === 0 ? String(t.w) : F(t.n, d));
/** 項をふつうの文字で */
export const tp = (t: Term, d: number) => (t.w > 0 && t.n > 0 ? `${t.w}と${t.n}/${d}` : t.n === 0 ? String(t.w) : `${t.n}/${d}`);

/** 大きさ N/D を、いちばんふつうの形（整数／真分数／帯分数）の記法で */
export function showVal(N: number, D: number): string {
  if (N % D === 0) return String(N / D);
  if (N < D) return F(N, D);
  return M(Math.floor(N / D), N % D, D);
}
/** 大きさ N/D を、ふつうの文字で */
export function plainVal(N: number, D: number): string {
  if (N % D === 0) return String(N / D);
  if (N < D) return `${N}/${D}`;
  return `${Math.floor(N / D)}と${N % D}/${D}`;
}
/** 答案の答え（帯分数でも仮分数でもよいときは両方を書く） */
export function bothVal(N: number, D: number): string {
  if (N <= D && N % D !== 0) return `${N}/${D}`;
  return `${plainVal(N, D)}（${N}/${D}）`;
}
/** 記法で、両方の形 */
export function bothRich(N: number, D: number): string {
  if (N < D) return F(N, D);
  return `${showVal(N, D)}（${F(N, D)}）`;
}

const anyAns = (N: number, D: number, start: 'frac' | 'mixed', only?: 'mixed'): Ans => ({ kind: 'any', n: N, d: D, start, only });
const ANY_NOTE = '（帯分数でも 仮分数でも いいよ）';

/** 「分母どうしも たした／ひいた」の診断（分母が同じ たし算・ひき算） */
function diagDen(D: number, op: '+' | '-') {
  return (x: Inp): string | null => {
    if (op === '+' && x.d === D * 2) return `分母は たさないよ。分母は「1つ分の 大きさ」（${F(1, D)}）を あらわして いるから、そのまま。たすのは 分子（何こ分か）だけ。`;
    if (op === '-' && x.d === 0) return `分母は ひかないよ。分母は 1つ分の 大きさ（${F(1, D)}）だから、そのまま。ひくのは 分子だけ。`;
    return null;
  };
}


/* =====================================================================
 * 文章題の式を組み立てる（build）
 * =================================================================== */

const OP_CARDS = ['＋', '－', '×', '÷'];
const isOpText = (t: string) => OP_CARDS.includes(t);

interface ExprSpec {
  /** 式に使う数のカード（記法つき。どれも1回ずつ） */
  need: string[];
  /** ダミーの数のカード */
  dummies: string[];
  op: '＋' | '－';
  /** その場面で正しい演算を取りちがえたときのことば／順番を取りちがえたときのことば */
  opWhy: string;
  orderWhy: string;
}

/** 式の組み立てに対する誤答診断（典型: ＋－のとりちがえ・大小（順番）のとりちがえ・数のぬけ・ダミーの使用） */
function exprDiag(spec: ExprSpec, scaffoldTraps: (string | null)[]) {
  return (x: Inp): string | null => {
    if (x.i != null) return scaffoldTraps[x.i] ?? null;
    const toks = x.expr;
    if (!toks || toks.length === 0) return null;
    const nums = toks.filter((t) => !isOpText(t));
    const ops = toks.filter(isOpText);
    const alternating = toks.every((t, k) => (k % 2 === 0 ? !isOpText(t) : isOpText(t))) && toks.length % 2 === 1;
    if (!alternating) return 'しきに なっていないよ。「数 ＋ 数」や「数 － 数」の ように、数と 記号を かわりばんこに ならべよう。';
    if (nums.some((n) => spec.dummies.includes(n))) return '問題文に 出てこない 数が まざっているよ。問題文の 数だけで しきを つくろう。';
    if (ops.some((o) => o === '×' || o === '÷')) return 'この 問題は ×や ÷ では ないよ。ふえる（あわせる）なら ＋、へる（ちがい・のこり）なら － で 考えよう。';
    if (nums.length < spec.need.length || !spec.need.every((n) => nums.includes(n))) return '使っていない 数が あるよ。問題文に 出てくる 数を ぜんぶ 使って しきを つくろう。';
    if (nums.length > spec.need.length) return '数が おおすぎるよ。問題文の 数を 1回ずつ 使おう。';
    if (ops[0] !== spec.op) return spec.opWhy;
    return spec.orderWhy;
  };
}

/**
 * 式を組み立てる手順。たし算は順番の入れかえも正解、ひき算は正しい順だけ。
 * correct＝正解の式（記法つき。足場の「えらぶ」の正解）、wrongs＝足場のまちがいの式。
 */
function exprStep(prompt: string, spec: ExprSpec, correct: string, wrongs: string[], traps: Record<string, string> = {}): Step {
  const all = shuffle([correct, ...wrongs]);
  const idx = all.indexOf(correct);
  const trapList = all.map((c, i) => (i === idx ? null : traps[c] ?? null));
  const [a, b] = spec.need;
  const accept: string[][] = spec.op === '＋' ? [[a!, '＋', b!], [b!, '＋', a!]] : [[a!, '－', b!]];
  const ans: Ans = {
    kind: 'build',
    cards: shuffle([...spec.need, ...spec.dummies]),
    accept,
    scaffold: { choices: all, correct: idx, traps: trapList },
  };
  return { prompt, ans, diagnose: guard(ans, exprDiag(spec, trapList)) };
}

/** 数のカードの ダミー（問題文に出てこない数）。必要な数と見た目がかぶらないものを count 個 */
function dummyTerms(D: number, avoid: string[], count: number): string[] {
  const out: string[] = [];
  for (let k = 0; k < 400 && out.length < count; k++) {
    const t: Term = Math.random() < 0.5 ? { w: 0, n: rnd(1, D - 1) } : { w: rnd(1, 4), n: rnd(1, D - 1) };
    const c = tr(t, D);
    if (!avoid.includes(c) && !out.includes(c)) out.push(c);
  }
  return out;
}

/* =====================================================================
 * hyo ─ 1より大きい分数の表し方
 * =================================================================== */

type FracKind = '真分数' | '仮分数' | '帯分数';
const KIND_ORDER: FracKind[] = ['真分数', '仮分数', '帯分数'];

function randomOfKind(k: FracKind): { rich: string; text: string; key: string } {
  const d = rnd(2, 9);
  if (k === '真分数') { const n = rnd(1, d - 1); return { rich: F(n, d), text: `${n}/${d}`, key: `p${n}/${d}` }; }
  if (k === '仮分数') { const n = rnd(d, d * 3 - 1); return { rich: F(n, d), text: `${n}/${d}`, key: `i${n}/${d}` }; }
  const w = rnd(1, 5); const n = rnd(1, d - 1);
  return { rich: M(w, n, d), text: `${w}と${n}/${d}`, key: `m${w}${n}/${d}` };
}

function genHyoKind(): Prob {
  if (Math.random() < 0.5) {
    const k = pick(KIND_ORDER);
    const f = randomOfKind(k);
    const correct = KIND_ORDER.indexOf(k);
    return {
      skillId: 'hyo-kind', tag: 'name',
      text: `${f.rich} は、真分数・仮分数・帯分数の どれですか。`,
      steps: [{
        prompt: `${f.rich} は どれ？`,
        ans: { kind: 'choice', choices: [...KIND_ORDER], correct },
        diagnose: guard({ kind: 'choice', choices: [...KIND_ORDER], correct }, (x) => {
          if (k === '仮分数' && x.i === 0) return '分子が 分母と 同じか、分母より 大きいよ。1と 同じか 1より 大きい 分数だね。';
          if (k === '帯分数' && x.i === 1) return '整数と 分数が いっしょに 書いてあるね。整数と 真分数を あわせた 形だよ。';
          if (k === '真分数' && x.i !== 0) return '分子が 分母より 小さいね。1より 小さい 分数だよ。';
          return null;
        }),
      }],
      hints: [
        '真分数は 分子が 分母より 小さい（1より 小さい）、仮分数は 分子が 分母と 同じか 大きい、帯分数は 整数と 真分数を あわせた 形だよ。',
        k === '帯分数' ? '整数が 左に 書いてあるかな？' : '分子と 分母、どちらが 大きいかな？ くらべて みよう。',
        k === '仮分数' ? '分子 ≧ 分母 だから、1と 同じか 1より 大きい 分数だね。' : k === '真分数' ? '分子 ＜ 分母 だから、1より 小さいね。' : '整数 ＋ 真分数 の 形だね。',
      ],
      explain: `${f.rich} は ${k}。真分数＝分子＜分母、仮分数＝分子≧分母、帯分数＝整数＋真分数。`,
      label: `${f.text} は何分数`,
      q: `${f.text} は真分数・仮分数・帯分数のどれ`,
      a: k,
    };
  }
  const k = pick(KIND_ORDER);
  const others = KIND_ORDER.filter((x) => x !== k);
  const right = randomOfKind(k);
  const wrongs: { rich: string; key: string; val: number }[] = [];
  const valOfRich = (r: string) => { const [, w, n, d] = /\{(?:(\d+);)?(\d+)\|(\d+)\}/.exec(r)!; return (Number(w ?? 0) * Number(d) + Number(n)) / Number(d); };
  const rv = valOfRich(right.rich);
  while (wrongs.length < 3) {
    const w = randomOfKind(pick(others));
    const v = valOfRich(w.rich);
    // 大きさが同じ分数（4/8 と 1/2 など）を2つ並べない
    if (Math.abs(v - rv) > 1e-9 && !wrongs.some((o) => Math.abs(o.val - v) < 1e-9)) wrongs.push({ ...w, val: v });
  }
  return {
    skillId: 'hyo-kind', tag: 'pick',
    text: `つぎの 中から ${k}を 1つ えらびましょう。`,
    steps: [choiceStep(`${k}は どれ？`, right.rich, wrongs.map((w) => w.rich))],
    hints: [
      '真分数は 分子が 分母より 小さい、仮分数は 分子が 分母と 同じか 大きい、帯分数は 整数と 真分数を あわせた 形。',
      k === '帯分数' ? '整数が 左に ついて いるのは どれかな？' : '1つずつ、分子と 分母の 大きさを くらべて みよう。',
      k === '仮分数' ? '分子が 分母と 同じか、分母より 大きい ものを さがそう。' : k === '真分数' ? '分子が 分母より 小さい ものを さがそう。' : '整数 ＋ 真分数 の 形を さがそう。',
    ],
    explain: `${right.rich} が ${k}。真分数＝分子＜分母、仮分数＝分子≧分母、帯分数＝整数＋真分数。`,
    label: `${k}をえらぶ`,
    q: `${k}をえらぶ`,
    a: plain(right.rich),
  };
}

/** 単位分数の何こ分 */
function genHyoUnit(): Prob {
  const d = rnd(2, 9);
  if (Math.random() < 0.5) {
    const mixed = Math.random() < 0.4;
    const N = retry(() => rnd(d + 1, d * 4), (v) => v % d !== 0);
    const show = mixed ? M(Math.floor(N / d), N % d, d) : F(N, d);
    return {
      skillId: 'hyo-unit', tag: 'count',
      text: `${show} は、${F(1, d)} の 何こ分ですか。`,
      steps: [mk(`${show} は ${F(1, d)} の □こ分`, { kind: 'num', v: N }, (x) => {
        if (mixed && x.v === (N % d)) return `${N % d}こ は 分数の ところだけ。整数の ${Math.floor(N / d)} の 中にも ${F(1, d)} が あるよ。1 ＝ ${F(d, d)} は ${F(1, d)} の ${d}こ分。`;
        if (mixed && x.v === Math.floor(N / d) + (N % d)) return `整数の ${Math.floor(N / d)} は ${F(1, d)} の ${Math.floor(N / d)}こ分 では ないよ。1 は ${F(1, d)} の ${d}こ分。`;
        return null;
      })],
      hints: [
        `${F(1, d)} が いくつ 集まった 数かを 考えよう。`,
        mixed ? `1 は ${F(1, d)} の ${d}こ分。整数の ところには 何こ 入って いるかな？` : `仮分数の 分子は、${F(1, d)} が 何こ 集まったかを あらわして いるよ。`,
        mixed ? `${Math.floor(N / d)} は ${F(1, d)} の ${d} × ${Math.floor(N / d)} こ分。それに 分子の ${N % d}こを たそう。` : '分子を 見よう。',
      ],
      explain: `${show} ＝ ${F(N, d)}。${F(1, d)} の ${N}こ分 だよ。`,
      label: `${plain(show)} は 1/${d} の何こ分`,
      q: `${plain(show)} は 1/${d} の何こ分`,
      a: `${N}こ分`,
    };
  }
  const N = rnd(d + 1, d * 3);
  return {
    skillId: 'hyo-unit', tag: 'make',
    text: `${F(1, d)} の ${N}こ分の 分数を、仮分数で かきましょう。`,
    steps: [mk(`${F(1, d)} の ${N}こ分 ＝ □（仮分数で）`, { kind: 'frac', n: N, d }, (x) => {
      if (x.n === 1 && x.d === N) return `分母は 1つ分の 大きさ（${F(1, d)} の ${d}）の まま。何こ分かは 分子に かくよ。`;
      if (x.n === d && x.d === N) return '分子と 分母が 逆に なって いるよ。何こ分かが 分子だよ。';
      return null;
    })],
    hints: [
      `分母は「1を いくつに 分けたか」、分子は「${F(1, d)} が 何こ 集まったか」だよ。`,
      `分母は ${d} の まま。分子が 何こ分かを あらわすよ。`,
      `${F(1, d)} が ${N}こ だから、分子は ${N}。`,
    ],
    explain: `${F(1, d)} の ${N}こ分は ${F(N, d)}${N % d === 0 ? `（＝ ${N / d}）` : `（＝ ${showVal(N, d)}）`}。`,
    label: `1/${d} の${N}こ分`,
    q: `1/${d} の${N}こ分（仮分数で）`,
    a: `${N}/${d}`,
  };
}

/** テープ・水のかさを 仮分数（帯分数）で */
function genHyoTape(): Prob {
  const tag = pick(['tape', 'cup', 'mix'] as const);
  const cupLike = tag === 'cup' || (tag === 'mix' && Math.random() < 0.5);
  const D = rnd(2, 6);
  const W = cupLike ? rnd(2, 3) : rnd(2, 3);
  const S = retry(() => rnd(D + 1, W * D - 1), (v) => v % D !== 0 && (!cupLike || Math.ceil(v / D) === W));
  const unit = cupLike ? 'L' : 'm';
  const fig: Figure = cupLike
    ? { kind: 'cups', count: W, den: D, filled: S, unit }
    : { kind: 'mtape', wholes: W, den: D, shaded: S, unit };
  const what = cupLike ? '水の かさ' : '色を ぬった テープの 長さ';
  const wantMixed = tag === 'mix';
  const w = Math.floor(S / D);
  const r = S % D;
  const ans: Ans = wantMixed ? { kind: 'mixed', w, n: r, d: D } : { kind: 'frac', n: S, d: D };
  return {
    skillId: 'hyo-tape', tag,
    text: `${what}を、${wantMixed ? '帯分数' : '仮分数'}で 表しましょう。`,
    fig,
    steps: [mk(`${what}は 何${unit}？（${wantMixed ? '帯分数' : '仮分数'}で）`, ans, (x) => {
      if (x.d === W * D) return `分母は「1${unit}を いくつに 分けたか」だよ。ぜんぶの 目もりの 数では ないよ。1${unit}は ${D}等分。`;
      if (!wantMixed && x.n === r && x.d === D) return `1${unit}を こえた ところだけ 数えて いないかな？ ${F(1, D)}${unit} が ぜんぶで 何こ あるか 数えよう。`;
      if (wantMixed && x.w === w && x.n === S) return `分数の ところは 1${unit}を こえた ぶん だけだよ。`;
      return null;
    })],
    hints: [
      `1${unit}を いくつに 分けて いるかな？ 1目もりは 何${unit}？`,
      `1目もりは ${F(1, D)}${unit}。${cupLike ? '水が 入って いる' : '色が ぬって ある'} 目もりは ぜんぶで 何こ？`,
      wantMixed ? `1${unit}が ${w}こ と、${F(1, D)}${unit} が ${r}こ。` : `${F(1, D)}${unit} が ${S}こ分。分子が ${S} に なるよ。`,
    ],
    explain: `1目もりは ${F(1, D)}${unit}。${F(1, D)}${unit} の ${S}こ分で ${F(S, D)}${unit}（＝ ${M(w, r, D)}${unit}）。`,
    label: `${cupLike ? '水のかさ' : 'テープの長さ'}（${S}/${D}${unit}）`,
    q: `${cupLike ? '水のかさ' : 'テープの長さ'}を${wantMixed ? '帯分数' : '仮分数'}で（1${unit}を${D}等分、${S}目もり）`,
    a: wantMixed ? `${w}と${r}/${D}${unit}` : `${S}/${D}${unit}`,
  };
}

/** 作図: 7/4m になるように テープに色をぬる／水を入れる */
function genHyoDraw(): Prob {
  const cup = Math.random() < 0.5;
  const D = rnd(2, 6);
  const W = rnd(2, 3);
  const S = retry(() => rnd(D + 1, W * D - 1), (v) => v % D !== 0);
  const unit = cup ? 'L' : 'm';
  const showMixed = Math.random() < 0.4;
  const target = showMixed ? M(Math.floor(S / D), S % D, D) : F(S, D);
  const fig: Figure = cup ? { kind: 'cups', count: W, den: D, filled: 0, unit } : { kind: 'mtape', wholes: W, den: D, shaded: 0, unit };
  return {
    skillId: 'hyo-draw', tag: cup ? 'cup' : 'tape',
    text: cup
      ? `1Lますが ${W}こ あります（1こを ${D}等分）。水が ${target}L に なるように、目もりを タップして 水を 入れましょう。`
      : `テープの 長さが ${target}m に なるように、目もりを タップして 色を ぬりましょう。（1m を ${D}等分）`,
    fig,
    steps: [mk(cup ? '水を 入れる ところを タップして、できたら「これで いい」' : '色を ぬる ところを タップして、できたら「これで いい」', { kind: 'shade', correct: S }, (x) => {
      if (showMixed && x.i === Math.floor(S / D) + (S % D)) return `整数の ${Math.floor(S / D)} は、1${unit}が ${Math.floor(S / D)}こ分。1${unit} は ${D}目もり だよ。`;
      if (x.i === S % D) return `1${unit}を こえた ぶん だけに なって いるよ。`;
      return null;
    })],
    hints: [
      `1目もりは ${F(1, D)}${unit}。${target}${unit} は ${F(1, D)}${unit} の 何こ分かな？`,
      showMixed ? `${Math.floor(S / D)}${unit} は ${D} × ${Math.floor(S / D)} 目もり。それに ${S % D} 目もりを たそう。` : `仮分数の 分子が、${F(1, D)}${unit} の こ数だよ。`,
      `ぜんぶで ${S}目もり ${cup ? '入れよう' : 'ぬろう'}。`,
    ],
    explain: `${target}${unit} ＝ ${F(S, D)}${unit} は、${F(1, D)}${unit} の ${S}こ分。${S}目もり ${cup ? '入れる' : 'ぬる'}よ。`,
    label: `${plain(target)}${unit} を${cup ? 'ますに' : 'テープに'}`,
    q: `${plain(target)}${unit} になるように${cup ? '水を入れる' : '色をぬる'}（1${unit}を${D}等分）`,
    a: `${S}目もり`,
  };
}

/** 数直線（0〜2,3）。目盛りをタップ／Aを読む */
function genHyoLine(): Prob {
  const D = rnd(2, 6);
  const W = retry(() => rnd(2, 3), (v) => v * D <= 18);
  const S = retry(() => rnd(D + 1, W * D - 1), (v) => v % D !== 0);
  const w = Math.floor(S / D);
  const r = S % D;
  if (Math.random() < 0.5) {
    const asMixed = Math.random() < 0.5;
    const target = asMixed ? M(w, r, D) : F(S, D);
    return {
      skillId: 'hyo-line', tag: 'tap',
      text: `数直線の 1目もりは ${F(1, D)} です。${target} の 目もりを タップしましょう。`,
      fig: { kind: 'numline', max: W, den: D },
      steps: [mk(`${target} の 目もりを タップ`, { kind: 'tick', correct: S }, (x) => {
        if (x.i === r) return `${F(r, D)} は 1より 小さいよ。${target} は 1より 大きいね。`;
        if (asMixed && x.i === w * D - r) return '整数の 目もりから 右へ 数えよう。';
        return null;
      })],
      hints: [
        `0から 1までが ${D}等分。1目もりは ${F(1, D)} だね。`,
        asMixed ? `${w} の 目もりを 見つけてから、右へ ${r}目もり。` : `${F(1, D)} の ${S}こ分。0から ${S}目もり 数えよう。`,
        `0から 数えて ${S}こ目の 目もりだよ。`,
      ],
      explain: `${target} ＝ ${F(S, D)} は ${F(1, D)} の ${S}こ分。0から ${S}こ目の 目もり。`,
      label: `${plain(target)} の目もり`,
      q: `${plain(target)} の目もり（1目もり1/${D}）`,
      a: `0から${S}こ目`,
    };
  }
  const asMixed = Math.random() < 0.5;
  const ans: Ans = asMixed ? { kind: 'mixed', w, n: r, d: D } : { kind: 'frac', n: S, d: D };
  return {
    skillId: 'hyo-line', tag: 'read',
    text: `数直線の ▼A が あらわす 数を、${asMixed ? '帯分数' : '仮分数'}で かきましょう。`,
    fig: { kind: 'numline', max: W, den: D, marks: [{ at: S, label: 'A' }] },
    steps: [mk(`A は？（${asMixed ? '帯分数' : '仮分数'}で）`, ans, (x) => {
      if (x.d === W * D) return `分母は 0から 1までを いくつに 分けたか だよ。0から ${W}まで では ないよ。`;
      if (!asMixed && x.n === r && x.d === D) return `1を こえた ところから 数えて いないかな？ 0から 数えよう。`;
      return null;
    })],
    hints: [
      '0から 1までを いくつに 分けて いるかな？ 1目もりは いくつ？',
      `1目もりは ${F(1, D)}。A は 0から 何目もり かな？`,
      asMixed ? `A は ${w} と、あと ${r}目もり。` : `0から ${S}目もり。${F(1, D)} の ${S}こ分。`,
    ],
    explain: `A は ${F(1, D)} の ${S}こ分で ${F(S, D)}（＝ ${M(w, r, D)}）。`,
    label: `数直線のAを${asMixed ? '帯分数' : '仮分数'}で`,
    q: `数直線のA（1目もり1/${D}、0から${S}目もり）を${asMixed ? '帯分数' : '仮分数'}で`,
    a: asMixed ? `${w}と${r}/${D}` : `${S}/${D}`,
  };
}

/* =====================================================================
 * hen ─ 仮分数と帯分数・整数
 * =================================================================== */

/** 仮分数 → 帯分数か整数 */
function genHenMixed(): Prob {
  const tag = Math.random() < 0.65 ? 'mixed' : 'whole';
  const D = rnd(2, 9);
  const w = tag === 'whole' ? rnd(2, 6) : rnd(1, 5);
  const r = tag === 'whole' ? 0 : rnd(1, D - 1);
  const N = w * D + r;
  const ans = anyAns(N, D, 'mixed', 'mixed');
  return {
    skillId: 'hen-mixed', tag,
    text: `${F(N, D)} を、帯分数か 整数に なおしましょう。`,
    steps: [mk(`${F(N, D)} ＝ □`, ans, (x) => {
      if (r > 0 && x.w === r && x.n === w && x.d === D) return `商と あまりが 入れかわって いるよ。${N} ÷ ${D} の 商（${w}）が 整数、あまり（${r}）が 分子だよ。`;
      if (x.w === w && x.d === N) return '分母は かわらないよ。もとの 分母の まま。';
      if (r > 0 && x.v === w) return `あまりの ${r} を わすれて いないかな？ あまりは 分子に なるよ。`;
      if (r === 0 && x.w != null && x.n === 0) return `わりきれたね。整数で 答えよう（「整数」の ボタン）。`;
      return null;
    })],
    hints: [
      `${F(1, D)} が ${D}こ で 1。${F(N, D)} の 中に 1が いくつ とれるかな？ 分子 ÷ 分母 を しよう。`,
      `${N} ÷ ${D} の 商が 整数の ところ、あまりが 分子に なるよ。分母は そのまま。`,
      r > 0 ? `${N} ÷ ${D} ＝ ${w} あまり ${r}。` : `${N} ÷ ${D} ＝ ${w}（わりきれる）。`,
    ],
    explain: r > 0
      ? `${N} ÷ ${D} ＝ ${w} あまり ${r} だから、${F(N, D)} ＝ ${M(w, r, D)}。`
      : `${N} ÷ ${D} ＝ ${w} だから、${F(N, D)} ＝ ${w}。`,
    label: `${N}/${D} を帯分数・整数に`,
    q: `${N}/${D} を帯分数か整数に`,
    a: plainVal(N, D),
  };
}

/** わり算で直す（商 → あまり → 帯分数） */
function genHenDiv(): Prob {
  const D = rnd(2, 9);
  const w = rnd(1, 6);
  const r = rnd(1, D - 1);
  const N = w * D + r;
  return {
    skillId: 'hen-div',
    text: `${F(N, D)} を、わり算を つかって 帯分数に なおしましょう。`,
    steps: [
      mk(`${N} ÷ ${D} の 商は？`, { kind: 'num', v: w }, (x) => (x.v === r ? 'それは あまり だよ。商は 何回 わけられるか。' : null)),
      mk(`${N} ÷ ${D} ＝ ${w} あまり □`, { kind: 'num', v: r }, (x) => (x.v != null && x.v >= D ? `あまりは わる数（${D}）より 小さく なるよ。` : null)),
      mk(`${F(N, D)} を 帯分数に（商が 整数、あまりが 分子）`, { kind: 'mixed', w, n: r, d: D }, (x) => {
        if (x.w === r && x.n === w) return '商と あまりが 入れかわって いるよ。商が 整数の ところだよ。';
        if (x.d === N || x.d === w) return '分母は もとの まま だよ。';
        return null;
      }),
    ],
    hints: [
      `仮分数を 帯分数に するには、分子 ÷ 分母。${F(1, D)} が ${D}こ で 1 だからね。`,
      `${D} の だんの 九九で、${N} を こえない いちばん 大きい 数を さがそう。`,
      `${D} × ${w} ＝ ${w * D}。${N} － ${w * D} ＝ ${r}。`,
    ],
    explain: `${N} ÷ ${D} ＝ ${w} あまり ${r}。商の ${w} が 整数、あまりの ${r} が 分子で、${F(N, D)} ＝ ${M(w, r, D)}。`,
    label: `${N}/${D} をわり算で帯分数に`,
    q: `${N}/${D} をわり算で帯分数に`,
    a: `${w}と${r}/${D}`,
  };
}

/** 帯分数 → 仮分数／整数 → 仮分数 */
function genHenImp(): Prob {
  const D = rnd(2, 9);
  if (Math.random() < 0.7) {
    const w = rnd(1, 6);
    const n = rnd(1, D - 1);
    const N = w * D + n;
    return {
      skillId: 'hen-imp', tag: 'mixed',
      text: `${M(w, n, D)} を、仮分数に なおしましょう。`,
      steps: [mk(`${M(w, n, D)} ＝ □（仮分数で）`, { kind: 'frac', n: N, d: D }, (x) => {
        if (x.n === w + n && x.d === D && w + n !== N) return `整数の ${w} と 分子の ${n} を たした だけに なって いるよ。1 ＝ ${F(D, D)} だから、${w} は ${F(1, D)} の ${D} × ${w} こ分。`;
        if (x.n === w * D && x.d === D) return `分子の ${n} を たし わすれて いないかな？`;
        if (x.n === w * n + D && x.d === D) return `整数 × 分母 ＋ 分子 の じゅんだよ。${w} × ${D} ＋ ${n}。`;
        if (x.d === w * D) return '分母は そのまま だよ。';
        return null;
      })],
      hints: [
        `1 は ${F(D, D)}。整数の ${w} の 中に ${F(1, D)} が 何こ あるかな？`,
        `${w} は ${F(1, D)} の ${D} × ${w} こ分。それに 分子の ${n}こを たすよ。`,
        `${D} × ${w} ＋ ${n} ＝ ？ が 分子。分母は ${D} の まま。`,
      ],
      explain: `${D} × ${w} ＋ ${n} ＝ ${N} だから、${M(w, n, D)} ＝ ${F(N, D)}。`,
      label: `${w}と${n}/${D} を仮分数に`,
      q: `${w}と${n}/${D} を仮分数に`,
      a: `${N}/${D}`,
    };
  }
  const k = rnd(2, 6);
  return {
    skillId: 'hen-imp', tag: 'whole',
    text: `${k} を、分母が ${D} の 分数で あらわしましょう。　${k} ＝ ${F('□', D)}`,
    steps: [mk(`${k} ＝ ${F('□', D)} の □`, { kind: 'num', v: k * D }, (x) => {
      if (x.v === k) return `${F(k, D)} は 1より 小さいよ。1 ＝ ${F(D, D)} だね。`;
      if (x.v === k + D) return `たし算では ないよ。1 は ${F(1, D)} の ${D}こ分。${k} は その ${k}つ分。`;
      return null;
    })],
    hints: [
      `1 は ${F(D, D)}（${F(1, D)} の ${D}こ分）。`,
      `${k} は 1 の ${k}こ分。${F(1, D)} は いくつ 集まるかな？`,
      `${D} × ${k} ＝ ？`,
    ],
    explain: `1 ＝ ${F(D, D)} だから、${k} ＝ ${F(k * D, D)}。`,
    label: `${k} を分母${D}の分数に`,
    q: `${k} ＝ □/${D}`,
    a: String(k * D),
  };
}

/* =====================================================================
 * eq ─ 大きさの等しい分数（数直線をならべて）
 * =================================================================== */

const ROW_SETS: number[][] = [
  [3, 4, 6, 8], [2, 4, 6, 8], [2, 3, 4, 6], [2, 4, 5, 10], [3, 6, 9, 12], [2, 3, 6, 9], [4, 5, 8, 10], [2, 5, 6, 10], [3, 4, 8, 12],
];

interface EqSet { rows: number[]; a: number; b: number; n1: number; n2: number }
function eqSet(dir?: 'up' | 'down'): EqSet {
  return retry(() => {
    const rows = pick(ROW_SETS);
    const a = pick(rows);
    const b = pick(rows);
    const n1 = rnd(1, a - 1);
    return { rows, a, b, n1, n2: (n1 * b) / a };
  }, (s) => s.a !== s.b && Number.isInteger(s.n2) && s.n2 >= 1 && (dir == null || (dir === 'up' ? s.b > s.a : s.b < s.a)), 4000);
}

function genEqLine(): Prob {
  const dir = Math.random() < 0.5 ? 'up' : 'down';
  const { rows, a, b, n1, n2 } = eqSet(dir);
  return {
    skillId: 'eq-line', tag: dir,
    text: `数直線を 見て、□に あてはまる 数を かきましょう。　${F(n1, a)} ＝ ${F('□', b)}`,
    fig: { kind: 'numlines', dens: rows },
    steps: [mk(`${F(n1, a)} ＝ ${F('□', b)} の □`, { kind: 'num', v: n2 }, (x) => {
      if (x.v === n1 + (b - a)) return `分母が ${Math.abs(b - a)} ${b > a ? 'ふえた' : 'へった'}から、分子も 同じだけ ${b > a ? 'ふやした' : 'へらした'}のかな？ 数直線で ${F(n1, a)} と 同じ ところを たどって みよう。`;
      if (x.v === n1) return `分子が 同じでも、分母が ちがうと 大きさが ちがうよ。数直線で たしかめよう。`;
      return null;
    })],
    hints: [
      `${F(1, a)} の 数直線で ${F(n1, a)} の 目もりを 見つけよう。`,
      `その 目もりから まっすぐ ${b > a ? '下' : '上'}へ たどって、${F(1, b)} の 数直線の 目もりと ぴったり かさなる ところを さがそう。`,
      `${F(1, b)} の 数直線で、0から 何目もり めかな？`,
    ],
    explain: `数直線で ${F(n1, a)} と ${F(n2, b)} は 同じ ところ。${F(n1, a)} ＝ ${F(n2, b)}（大きさの 等しい 分数）。`,
    label: `${n1}/${a} ＝ □/${b}`,
    q: `${n1}/${a} ＝ □/${b}`,
    a: String(n2),
  };
}

function genEqTap(): Prob {
  const { rows, a, b, n1, n2 } = eqSet();
  const rowA = rows.indexOf(a);
  const rowB = rows.indexOf(b);
  return {
    skillId: 'eq-tap',
    text: `${F(1, a)} の 数直線の ▼A は ${F(n1, a)} です。${F(1, b)} の 数直線で、A と 同じ 大きさの 目もりを タップしましょう。`,
    fig: { kind: 'numlines', dens: rows, marks: [{ row: rowA, at: n1, label: 'A' }], tapRow: rowB },
    steps: [mk(`${F(1, b)} の 数直線の 目もりを タップ`, { kind: 'tick', correct: n2 }, (x) => {
      if (x.i === n1) return `${F(n1, b)} を えらんだね。分子が 同じでも 分母が ちがうと 大きさは ちがうよ。A から まっすぐ たどろう。`;
      return null;
    })],
    hints: [
      'A の 目もりから、まっすぐ たてに 線を ひく つもりで たどろう。',
      `${F(1, b)} の 数直線で、A と ぴったり そろう 目もりが あるよ。`,
      `${F(n1, a)} ＝ ${F('□', b)}。0から 数えて 何目もり めかな？`,
    ],
    explain: `${F(n1, a)} ＝ ${F(n2, b)}。${F(1, b)} の 数直線の ${n2}目もり めが A と 同じ 大きさ。`,
    label: `${n1}/${a} と同じ目もり（1/${b}）`,
    q: `${n1}/${a} と同じ大きさの目もり（1/${b}の数直線）`,
    a: `${n2}/${b}`,
  };
}

/** 候補のうち、正解と大きさが同じものと、おたがいに大きさが同じものを除いて count 個 */
function distinctFracs(right: [number, number], cands: [number, number][], count: number): [number, number][] {
  const out: [number, number][] = [];
  for (const c of cands) {
    if (c[0] < 1 || c[1] < 2) continue;
    if (cmpFrac(c[0], c[1], right[0], right[1]) === 0) continue;
    if (out.some((o) => cmpFrac(c[0], c[1], o[0], o[1]) === 0)) continue;
    out.push(c);
    if (out.length === count) break;
  }
  return out;
}

function genEqPick(): Prob {
  const s = retry(() => eqSet(), (t) => {
    const w = distinctFracs([t.n2, t.b], [[t.n1 + (t.b - t.a), t.b], [t.n1, t.b], [t.n2, t.a], [t.n1 + 1, t.b], [Math.max(1, t.n2 - 1), t.b], [t.n2 + 1, t.b]], 3);
    return w.length === 3;
  });
  const { rows, a, b, n1, n2 } = s;
  const add = n1 + (b - a);
  const wrongs = distinctFracs([n2, b], shuffle([[add, b], [n1, b], [n2, a], [n1 + 1, b], [Math.max(1, n2 - 1), b], [n2 + 1, b]] as [number, number][]), 3);
  const traps: Record<string, string> = {};
  traps[F(add, b)] = `分母と 分子に 同じ数を たしても、大きさは 同じに ならないよ。数直線で たしかめよう。`;
  traps[F(n1, b)] = '分子が 同じでも、分母が ちがうと 大きさが ちがうよ。';
  return {
    skillId: 'eq-pick',
    text: `数直線を 見て、${F(n1, a)} と 大きさの 等しい 分数を えらびましょう。`,
    fig: { kind: 'numlines', dens: rows },
    steps: [choiceStep(`${F(n1, a)} と 等しいのは どれ？`, F(n2, b), wrongs.map((f) => F(f[0], f[1])), traps)],
    hints: [
      `${F(1, a)} の 数直線で ${F(n1, a)} の 目もりを 見つけよう。`,
      '同じ 大きさの 分数は、ほかの 数直線で ぴったり たてに そろう 目もりだよ。',
      `${F(1, b)} の 数直線を 見て みよう。`,
    ],
    explain: `数直線で ${F(n1, a)} と ${F(n2, b)} は 同じ ところ。だから ${F(n1, a)} ＝ ${F(n2, b)}。`,
    label: `${n1}/${a} と等しい分数`,
    q: `${n1}/${a} と大きさの等しい分数をえらぶ`,
    a: `${n2}/${b}`,
  };
}

/* =====================================================================
 * cmp ─ 分数の大小
 * =================================================================== */

const SIGNS = ['＞', '＜', '＝'] as const;
const signIdx = (c: number) => (c > 0 ? 0 : c < 0 ? 1 : 2);

/** 分母が同じ（仮分数と帯分数・整数／仮分数どうし） */
function genCmpSame(): Prob {
  const tag = pick(['mix', 'mix', 'whole', 'same'] as const);
  const D = rnd(3, 9);
  let L: Term;
  let R: Term;
  if (tag === 'mix') {
    const w = rnd(1, 5);
    const r = rnd(1, D - 1);
    const N = w * D + r;
    const M2 = Math.random() < 0.12 ? N : retry(() => N + rnd(-3, 3), (v) => v !== N && v > D && v % D !== 0);
    L = { w, n: r }; R = { w: 0, n: M2 };
  } else if (tag === 'whole') {
    const k = rnd(1, 5);
    const M2 = Math.random() < 0.15 ? k * D : retry(() => k * D + rnd(-3, 3), (v) => v !== k * D && v > 0);
    L = { w: k, n: 0 }; R = { w: 0, n: M2 };
  } else {
    const a = rnd(D + 1, D * 3);
    const b = retry(() => rnd(Math.max(2, D - 2), D * 3), (v) => v !== a);
    L = { w: 0, n: a }; R = { w: 0, n: b };
  }
  if (Math.random() < 0.5) [L, R] = [R, L];
  const c = Math.sign(tv(L, D) - tv(R, D));
  const correct = signIdx(c);
  const ans: Ans = { kind: 'choice', choices: [...SIGNS], correct };
  const both = L.w > 0 || R.w > 0;
  const mixed = L.w > 0 ? L : R;
  return {
    skillId: 'cmp-same', tag,
    text: `□に あてはまる 不等号（＞ ＜）か ＝ を えらびましょう。　${tr(L, D)} □ ${tr(R, D)}`,
    steps: [{
      prompt: `${tr(L, D)} □ ${tr(R, D)}`,
      ans,
      diagnose: guard(ans, (x) => {
        if (tag === 'mix' && x.i != null && x.i < 2) {
          // 見えている分子どうしだけでくらべた
          const naive = signIdx(Math.sign(L.n - R.n));
          if (x.i === naive) return '見えている 数字の 大きさだけで くらべて いないかな？ 帯分数を 仮分数に（または 仮分数を 帯分数に）なおして、形を そろえてから くらべよう。';
        }
        if (tag === 'whole') return `整数を 分母が ${D} の 分数に なおすと くらべやすいよ。1 ＝ ${F(D, D)}。`;
        return null;
      }),
    }],
    hints: [
      both ? '帯分数（整数）と 仮分数は、そのままでは くらべにくいね。どちらかの 形に そろえよう。' : `分母が 同じ ときは、${F(1, D)} の こ数（分子）で くらべられるよ。`,
      both ? (mixed.n === 0 ? `${mixed.w} ＝ ${F(mixed.w * D, D)}。` : `${M(mixed.w, mixed.n, D)} を 仮分数に すると、${D} × ${mixed.w} ＋ ${mixed.n} ＝ ？`) : '分子が 大きい ほうが 大きいよ。',
      `${tr(L, D)} ＝ ${F(tv(L, D), D)}、${tr(R, D)} ＝ ${F(tv(R, D), D)}。分子を くらべよう。`,
    ],
    explain: `${F(tv(L, D), D)} と ${F(tv(R, D), D)} を くらべて、${tr(L, D)} ${SIGNS[correct]} ${tr(R, D)}。分母が 同じなら 分子で くらべられるよ。`,
    label: `${tp(L, D)} と ${tp(R, D)} の大小`,
    q: `${tp(L, D)} □ ${tp(R, D)}`,
    a: SIGNS[correct]!,
  };
}

/** 分子が同じ（分母が小さいほど大きい） */
function genCmpNum(): Prob {
  const n = rnd(1, 5);
  const [d1, d2] = retry(() => [rnd(n + 1, 10), rnd(n + 1, 10)] as [number, number], ([p, q]) => p !== q);
  const c = Math.sign(d2 - d1); // 分母が小さいほうが大きい
  const correct = signIdx(c);
  const ans: Ans = { kind: 'choice', choices: [...SIGNS], correct };
  const rows = [d1, d2].sort((p, q) => p - q);
  return {
    skillId: 'cmp-num',
    text: `□に あてはまる 不等号（＞ ＜）か ＝ を えらびましょう。　${F(n, d1)} □ ${F(n, d2)}`,
    fig: { kind: 'numlines', dens: rows, marks: [{ row: rows.indexOf(d1), at: n, label: '' }, { row: rows.indexOf(d2), at: n, label: '' }] },
    figOnHint: true,
    steps: [{
      prompt: `${F(n, d1)} □ ${F(n, d2)}`,
      ans,
      diagnose: guard(ans, (x) => {
        const saysBigDen = (d1 > d2 && x.i === 0) || (d2 > d1 && x.i === 1);
        if (saysBigDen) return '分母が 大きい ほうが 大きい とは かぎらないよ。分母が 大きいほど、1つ分（単位分数）は 小さく なるんだ。';
        if (x.i === 2) return '分子が 同じでも、分母が ちがえば 大きさは ちがうよ。';
        return null;
      }),
    }],
    hints: [
      `分子が どちらも ${n}。1つ分の 大きさ（${F(1, d1)} と ${F(1, d2)}）に 注目しよう。`,
      `${F(1, d1)} と ${F(1, d2)} では、1を たくさんに 分けた ほうが 1つ分は 小さく なるね。`,
      `分子が 同じ ときは、分母が 小さい ほうが 大きい。`,
    ],
    explain: `分子が 同じ ときは、分母が 小さい ほうが 大きい（1つ分が 大きいから）。${F(n, d1)} ${SIGNS[correct]} ${F(n, d2)}。`,
    label: `${n}/${d1} と ${n}/${d2} の大小`,
    q: `${n}/${d1} □ ${n}/${d2}`,
    a: SIGNS[correct]!,
  };
}

/** 仮分数を大きい順にならべる */
function genCmpOrder(): Prob {
  const paper = Math.random() < 0.6;
  const items: [number, number][] = retry(() => {
    if (paper) {
      // 紙のテストの形: 整数になる仮分数 1つ ＋ 整数の部分と分子が同じで分母がちがう仮分数 2つ（7/5・12/10・18/9）
      const w = rnd(1, 3);
      const d1 = rnd(3, 10);
      const d2 = rnd(3, 10);
      const d3 = rnd(2, 10);
      const r = rnd(1, Math.min(d1, d2) - 1);
      const k = Math.random() < 0.5 ? w + 1 : w;
      return shuffle([[w * d1 + r, d1], [w * d2 + r, d2], [k * d3, d3]] as [number, number][]);
    }
    // 整数の部分がみな ちがう3つ
    const ws = shuffle([1, 2, 3, 4]).slice(0, 3);
    return ws.map((w) => { const d = rnd(2, 9); const r = rnd(0, d - 1); return [w * d + r, d] as [number, number]; });
  }, (xs) => new Set(xs.map((f) => f[1])).size === 3 && xs.every((f, i) => xs.every((g, j) => i === j || cmpFrac(f[0], f[1], g[0], g[1]) !== 0)), 4000);
  const order = items.map((_, i) => i).sort((i, j) => cmpFrac(items[j]![0], items[j]![1], items[i]![0], items[i]![1]));
  const asc = [...order].reverse();
  const byNum = items.map((_, i) => i).sort((i, j) => items[j]![0] - items[i]![0]);
  const ans: Ans = { kind: 'order', items: items.map((f) => F(f[0], f[1])), correct: order };
  const sameSeq = (a: number[], b: number[]) => a.length === b.length && a.every((v, k) => v === b[k]);
  return {
    skillId: 'cmp-order', tag: paper ? 'paper' : 'mix',
    text: `つぎの 分数を、大きい じゅんに ならべましょう。　${items.map((f) => F(f[0], f[1])).join('　')}`,
    steps: [{
      prompt: '大きい じゅんに タップしよう',
      ans,
      diagnose: guard(ans, (x) => {
        if (!x.seq) return null;
        if (sameSeq(x.seq, asc)) return '小さい じゅんに なって いるよ。大きい ほうから ならべよう。';
        if (sameSeq(x.seq, byNum) && !sameSeq(byNum, order)) return '分子の 大きさだけで くらべて いないかな？ 分母が ちがうよ。帯分数か 整数に なおして くらべよう。';
        return null;
      }),
    }],
    hints: [
      '分母が ちがう 仮分数は、そのままでは くらべにくいね。帯分数か 整数に なおそう（分子 ÷ 分母）。',
      `なおすと ${items.map((f) => `${F(f[0], f[1])} ＝ ${showVal(f[0], f[1])}`).join('、')}。まず 整数の ところで くらべよう。`,
      paper ? '整数の ところが 同じで 分子も 同じ ときは、分母が 小さい ほうが 大きいよ。' : '整数の ところが 大きい ほうが 大きいよ。',
    ],
    explain: `${items.map((f) => `${F(f[0], f[1])} ＝ ${showVal(f[0], f[1])}`).join('、')}。大きい じゅんに ${order.map((i) => F(items[i]![0], items[i]![1])).join(' → ')}。`,
    label: '仮分数を大きい順に',
    q: `${items.map((f) => `${f[0]}/${f[1]}`).join('、')} を大きい順に`,
    a: order.map((i) => `${items[i]![0]}/${items[i]![1]}`).join(' → '),
  };
}

/* =====================================================================
 * add ─ 分母が同じ分数のたし算
 * =================================================================== */

interface Bin { a: Term; b: Term; D: number }

function addProb(skillId: string, tag: string | undefined, { a, b, D }: Bin, extra: {
  start: 'frac' | 'mixed';
  diag?: (x: Inp) => string | null;
  hints: string[];
  explain: string;
}): Prob {
  const N = tv(a, D) + tv(b, D);
  const expr = `${tr(a, D)} ＋ ${tr(b, D)}`;
  const q = `${tp(a, D)}＋${tp(b, D)}`;
  const den = diagDen(D, '+');
  return {
    skillId, tag,
    text: `${expr} を 計算しましょう。${ANY_NOTE}`,
    steps: [mk(`${expr} ＝ □`, anyAns(N, D, extra.start), (x) => den(x) ?? extra.diag?.(x) ?? null)],
    hints: extra.hints,
    explain: extra.explain,
    label: q,
    q,
    a: bothVal(N, D),
  };
}

function genAddBasic(): Prob {
  const D = rnd(3, 9);
  const kari = Math.random() < 0.4;
  const [n1, n2] = kari
    ? retry(() => [rnd(D + 1, D * 2 - 1), rnd(1, D - 1)] as [number, number], ([p, q]) => (p + q) % D !== 0)
    : retry(() => [rnd(1, D - 1), rnd(1, D - 1)] as [number, number], ([p, q]) => p + q > D);
  const a: Term = { w: 0, n: n1 };
  const b: Term = { w: 0, n: n2 };
  const N = n1 + n2;
  return addProb('add-basic', kari ? 'kari' : 'imp', { a, b, D }, {
    start: 'frac',
    hints: [
      `${F(1, D)} の 何こ分かで 考えよう。${F(n1, D)} は ${F(1, D)} の ${n1}こ分。`,
      `${F(1, D)} が ${n1}こ と ${n2}こ。あわせて 何こ分かな？ 分母は そのまま。`,
      `${n1} ＋ ${n2} ＝ ${N}。答えが 仮分数に なったら、帯分数に なおしても いいよ。`,
    ],
    explain: `${F(1, D)} が ${n1} ＋ ${n2} ＝ ${N}こ分で ${F(N, D)}${N % D === 0 ? ` ＝ ${N / D}` : ` ＝ ${showVal(N, D)}`}。分母は そのまま、分子だけ たすよ。`,
  });
}

function genAddMixed(): Prob {
  const D = rnd(3, 9);
  const [n1, n2] = retry(() => [rnd(1, D - 2), rnd(1, D - 2)] as [number, number], ([p, q]) => p + q < D);
  const a: Term = { w: rnd(1, 5), n: n1 };
  const b: Term = { w: rnd(1, 4), n: n2 };
  const N = tv(a, D) + tv(b, D);
  return addProb('add-mixed', undefined, { a, b, D }, {
    start: 'mixed',
    diag: (x) => (x.w === a.w + b.w && x.n === n1 * n2 ? '分子は かけないで たすよ。' : null),
    hints: [
      '帯分数の たし算は、整数どうし、分数どうしに 分けて 計算できるよ。',
      `整数は ${a.w} ＋ ${b.w}、分数は ${F(n1, D)} ＋ ${F(n2, D)}。`,
      `整数 ${a.w + b.w}、分数 ${F(n1 + n2, D)}。あわせると？`,
    ],
    explain: `整数 ${a.w} ＋ ${b.w} ＝ ${a.w + b.w}、分数 ${F(n1, D)} ＋ ${F(n2, D)} ＝ ${F(n1 + n2, D)}。答えは ${showVal(N, D)}（${F(N, D)}）。`,
  });
}

function genAddWhole(): Prob {
  const D = rnd(3, 9);
  const k = rnd(1, 6);
  const m: Term = { w: rnd(1, 5), n: rnd(1, D - 1) };
  const first = Math.random() < 0.6;
  const a = first ? { w: k, n: 0 } : m;
  const b = first ? m : { w: k, n: 0 };
  const N = k * D + tv(m, D);
  return addProb('add-whole', first ? 'wf' : 'fw', { a, b, D }, {
    start: 'mixed',
    diag: (x) => {
      if (x.w === m.w && x.n === m.n + k) return `整数の ${k} を 分子に たして いるよ。整数は 整数どうしで たそう。`;
      if (x.v === k + m.w) return '分数の ところを わすれて いないかな？';
      return null;
    },
    hints: [
      '整数と 帯分数の たし算は、整数どうしを たして、分数の ところは そのまま。',
      `整数どうし: ${k} ＋ ${m.w} ＝ ？`,
      `${k} ＋ ${m.w} ＝ ${k + m.w}。分数の ${F(m.n, D)} を つけよう。`,
    ],
    explain: `整数どうし ${k} ＋ ${m.w} ＝ ${k + m.w}。分数の ${F(m.n, D)} は そのままで、${M(k + m.w, m.n, D)}（${F(N, D)}）。`,
  });
}

function genAddCarry(): Prob {
  const D = rnd(3, 9);
  const [n1, n2] = retry(() => [rnd(1, D - 1), rnd(1, D - 1)] as [number, number], ([p, q]) => p + q > D);
  const both = Math.random() < 0.5;
  const a: Term = { w: rnd(1, 5), n: n1 };
  const b: Term = both ? { w: rnd(1, 4), n: n2 } : { w: 0, n: n2 };
  const N = tv(a, D) + tv(b, D);
  const W = a.w + b.w;
  return addProb('add-carry', both ? 'mm' : 'mf', { a, b, D }, {
    start: 'mixed',
    diag: (x) => (x.w === W && x.n === n1 + n2 - D ? `分数の ところが ${F(n1 + n2, D)} で 1より 大きく なったね。その 1を 整数に くり上げるのを わすれて いるよ。` : null),
    hints: [
      '整数どうし、分数どうしに 分けて 計算しよう。',
      `分数の ところ: ${F(n1, D)} ＋ ${F(n2, D)} ＝ ${F(n1 + n2, D)}。1より 大きく なったら どうする？`,
      `${F(n1 + n2, D)} ＝ ${M(1, n1 + n2 - D, D)}。1を 整数に くり上げて ${W} ＋ 1。`,
    ],
    explain: `分数の ところ ${F(n1, D)} ＋ ${F(n2, D)} ＝ ${F(n1 + n2, D)} ＝ ${M(1, n1 + n2 - D, D)}。1 くり上げて 整数は ${W} ＋ 1 ＝ ${W + 1}。答えは ${showVal(N, D)}（${F(N, D)}）。`,
  });
}

function genAddOne(): Prob {
  const D = rnd(3, 9);
  const n1 = rnd(1, D - 1);
  const n2 = D - n1;
  const both = Math.random() < 0.5;
  const a: Term = { w: rnd(1, 5), n: n1 };
  const b: Term = both ? { w: rnd(1, 4), n: n2 } : { w: 0, n: n2 };
  const N = tv(a, D) + tv(b, D);
  const W = a.w + b.w;
  return addProb('add-one', both ? 'mm' : 'mf', { a, b, D }, {
    start: 'mixed',
    diag: (x) => {
      if (x.v === W) return `分数の ところが ${F(D, D)} ＝ 1 に なったね。その 1を 整数に たそう。`;
      if (x.w === W && x.n === D) return `${F(D, D)} は 1 だよ。整数に くり上げよう。`;
      return null;
    },
    hints: [
      '整数どうし、分数どうしに 分けて 計算しよう。',
      `分数の ところ: ${F(n1, D)} ＋ ${F(n2, D)} ＝ ${F(D, D)}。これは いくつ？`,
      `${F(D, D)} ＝ 1。整数は ${W} ＋ 1。`,
    ],
    explain: `分数の ところ ${F(n1, D)} ＋ ${F(n2, D)} ＝ ${F(D, D)} ＝ 1。整数は ${W} ＋ 1 ＝ ${W + 1}。答えは ${N / D}（${F(N, D)}）。`,
  });
}

/** 図: 1/D の何こ分で たす */
function genAddFig(): Prob {
  const D = rnd(3, 6);
  const [n1, n2] = retry(() => [rnd(1, D * 2 - 1), rnd(1, D - 1)] as [number, number], ([p, q]) => p + q > D && p + q < D * 2 && p + q !== D);
  const N = n1 + n2;
  const fig: Figure = { kind: 'mtape', wholes: 2, den: D, shaded: n1, shaded2: n2, unit: 'm' };
  return {
    skillId: 'add-fig',
    text: `${F(n1, D)}m と ${F(n2, D)}m の テープを つなぎます。図を 見て 考えましょう。`,
    fig,
    steps: [
      mk(`あわせて ${F(1, D)}m の 何こ分？`, { kind: 'num', v: N }, (x) => (x.v === n1 || x.v === n2 ? 'どちらか 一方だけに なって いるよ。2本を あわせた こ数だよ。' : null)),
      mk(`${F(n1, D)} ＋ ${F(n2, D)} ＝ □${ANY_NOTE}`, anyAns(N, D, 'frac'), diagDen(D, '+')),
    ],
    hints: [
      `1目もりは ${F(1, D)}m。オレンジと 青の 目もりを 数えよう。`,
      `${F(n1, D)} は ${n1}こ分、${F(n2, D)} は ${n2}こ分。`,
      `${n1} ＋ ${n2} ＝ ${N}。${F(1, D)} の ${N}こ分は？`,
    ],
    explain: `${F(1, D)} が ${n1} ＋ ${n2} ＝ ${N}こ分で ${F(N, D)}m（＝ ${showVal(N, D)}m）。`,
    label: `${n1}/${D}＋${n2}/${D}（図）`,
    q: `${n1}/${D}＋${n2}/${D}（図）`,
    a: bothVal(N, D),
  };
}

/* =====================================================================
 * sub ─ 分母が同じ分数のひき算
 * =================================================================== */

function subProb(skillId: string, tag: string | undefined, { a, b, D }: Bin, extra: {
  start: 'frac' | 'mixed';
  diag?: (x: Inp) => string | null;
  hints: string[];
  explain: string;
  pad?: FracScratch;
}): Prob {
  const N = tv(a, D) - tv(b, D);
  const expr = `${tr(a, D)} － ${tr(b, D)}`;
  const q = `${tp(a, D)}－${tp(b, D)}`;
  const den = diagDen(D, '-');
  return {
    skillId, tag,
    text: `${expr} を 計算しましょう。${N > D ? ANY_NOTE : ''}`,
    steps: [mk(`${expr} ＝ □`, anyAns(N, D, extra.start), (x) => den(x) ?? extra.diag?.(x) ?? null)],
    hints: extra.hints,
    explain: extra.explain,
    label: q,
    q,
    a: bothVal(N, D),
  };
}

function genSubBasic(): Prob {
  const D = rnd(3, 9);
  const [n1, n2] = retry(() => [rnd(D + 1, D * 2 + 2), rnd(1, D * 2)] as [number, number], ([p, q]) => q < p && p - q !== D && (p - q) % D !== 0);
  const N = n1 - n2;
  return subProb('sub-basic', undefined, { a: { w: 0, n: n1 }, b: { w: 0, n: n2 }, D }, {
    start: 'frac',
    hints: [
      `${F(1, D)} の 何こ分かで 考えよう。`,
      `${F(1, D)} が ${n1}こ から ${n2}こ ひくと？ 分母は そのまま。`,
      `${n1} － ${n2} ＝ ${N}。`,
    ],
    explain: `${F(1, D)} が ${n1} － ${n2} ＝ ${N}こ分で ${F(N, D)}${N > D ? `（＝ ${showVal(N, D)}）` : ''}。分母は そのまま、分子だけ ひくよ。`,
  });
}

function genSubMixed(): Prob {
  const D = rnd(3, 9);
  const [n1, n2] = retry(() => [rnd(2, D - 1), rnd(1, D - 2)] as [number, number], ([p, q]) => q < p);
  const w1 = rnd(2, 7);
  const w2 = rnd(1, w1 - 1);
  const a: Term = { w: w1, n: n1 };
  const b: Term = { w: w2, n: n2 };
  const N = tv(a, D) - tv(b, D);
  return subProb('sub-mixed', undefined, { a, b, D }, {
    start: 'mixed',
    hints: [
      '帯分数の ひき算は、整数どうし、分数どうしに 分けて 計算できるよ。',
      `整数は ${w1} － ${w2}、分数は ${F(n1, D)} － ${F(n2, D)}。`,
      `整数 ${w1 - w2}、分数 ${F(n1 - n2, D)}。`,
    ],
    explain: `整数 ${w1} － ${w2} ＝ ${w1 - w2}、分数 ${F(n1, D)} － ${F(n2, D)} ＝ ${F(n1 - n2, D)}。答えは ${showVal(N, D)}（${F(N, D)}）。`,
  });
}

function genSubWhole(): Prob {
  const D = rnd(3, 9);
  const w = rnd(2, 8);
  const k = rnd(1, w - 1);
  const n = rnd(1, D - 1);
  const a: Term = { w, n };
  const N = tv(a, D) - k * D;
  return subProb('sub-whole', undefined, { a, b: { w: k, n: 0 }, D }, {
    start: 'mixed',
    diag: (x) => {
      if (x.v === w - k) return `分数の ${F(n, D)} を わすれて いないかな？ ひくのは 整数の ところだけ。`;
      if (x.w === w && x.n === n - k) return '整数は 整数どうしで ひこう。分子から ひいては いけないよ。';
      return null;
    },
    hints: [
      '帯分数 － 整数は、整数どうしを ひいて、分数の ところは そのまま。',
      `整数どうし: ${w} － ${k} ＝ ？`,
      `${w} － ${k} ＝ ${w - k}。分数の ${F(n, D)} を つけよう。`,
    ],
    explain: `整数どうし ${w} － ${k} ＝ ${w - k}。分数の ${F(n, D)} は そのままで、${M(w - k, n, D)}（${F(N, D)}）。`,
  });
}

function genSubBorrow(): Prob {
  const D = rnd(3, 9);
  const [n1, n2] = retry(() => [rnd(1, D - 2), rnd(2, D - 1)] as [number, number], ([p, q]) => p < q);
  const both = Math.random() < 0.5;
  const w1 = rnd(2, 7);
  const a: Term = { w: w1, n: n1 };
  const b: Term = both ? { w: rnd(1, w1 - 1), n: n2 } : { w: 0, n: n2 };
  const N = tv(a, D) - tv(b, D);
  const W = w1 - b.w;
  const p = subProb('sub-borrow', both ? 'mm' : 'mf', { a, b, D }, {
    start: 'mixed',
    diag: (x) => {
      if (x.w === W && x.n === n2 - n1) return `${F(n1, D)} から ${F(n2, D)} は ひけないね。大きい ほうから 小さい ほうを ひくのでは なく、整数から 1 くり下げよう。`;
      if (x.w === W && x.n === D + n1 - n2) return 'くり下げた 1 の ぶん、整数は 1 へるよ。';
      return null;
    },
    hints: [
      `分数の ところ ${F(n1, D)} から ${F(n2, D)} は ひけないね。整数から 1 くり下げよう。`,
      `${M(w1, n1, D)} ＝ ${M(w1 - 1, D + n1, D)}。1 ＝ ${F(D, D)} だからね。`,
      `${F(D + n1, D)} － ${F(n2, D)} ＝ ${F(D + n1 - n2, D)}。整数は ${w1 - 1} － ${b.w}。`,
    ],
    explain: `${M(w1, n1, D)} ＝ ${M(w1 - 1, D + n1, D)} と なおして、${F(D + n1, D)} － ${F(n2, D)} ＝ ${F(D + n1 - n2, D)}、整数は ${w1 - 1} － ${b.w} ＝ ${W - 1}。答えは ${showVal(N, D)}（${F(N, D)}）。`,
  });
  return p;
}

function genSubFrom(): Prob {
  const D = rnd(3, 9);
  const one = Math.random() < 0.6;
  const k = rnd(2, 6);
  const b: Term = one ? { w: 0, n: rnd(1, D - 1) } : { w: rnd(1, k - 1), n: rnd(1, D - 1) };
  const N = k * D - tv(b, D);
  return subProb('sub-from', one ? 'one' : 'mixed', { a: { w: k, n: 0 }, b, D }, {
    start: 'mixed',
    diag: (x) => {
      if (x.w === k - 1 - b.w && x.n === b.n && x.d === D && b.n * 2 !== D) return `${F(b.n, D)} は ひく数 だよ。1 を くり下げて ${F(D, D)} に して、${F(D, D)} － ${F(b.n, D)} を 計算しよう。`;
      if (x.w === k - b.w && x.d === D) return `整数の ところが ${k - b.w} の ままだと 大きすぎるよ。1 くり下げた ぶん へるよ。`;
      return null;
    },
    hints: [
      '整数から 分数を ひく ときは、整数から 1 くり下げて 分数に なおそう。',
      `${k} ＝ ${M(k - 1, D, D)}（1 ＝ ${F(D, D)}）。`,
      `${F(D, D)} － ${F(b.n, D)} ＝ ${F(D - b.n, D)}。整数は ${k - 1}${b.w > 0 ? ` － ${b.w}` : ''}。`,
    ],
    explain: `${k} ＝ ${M(k - 1, D, D)} と なおして、${F(D, D)} － ${F(b.n, D)} ＝ ${F(D - b.n, D)}、整数は ${k - 1}${b.w > 0 ? ` － ${b.w} ＝ ${k - 1 - b.w}` : ''}。答えは ${showVal(N, D)}${N > D ? `（${F(N, D)}）` : ''}。`,
  });
}

/* =====================================================================
 * wp ─ ことばの もんだい
 * =================================================================== */

interface AddScene { u: string; text: (A: string, B: string) => string; ask: string }
const ADD_SCENES: AddScene[] = [
  { u: 'kg', text: (A, B) => `重さが ${A}kg の かごに、${B}kg の りんごを 入れました。全体の 重さは 何kgに なりましたか。`, ask: '全体の 重さ' },
  { u: 'L', text: (A, B) => `ジュースが ${A}L、お茶が ${B}L あります。あわせて 何Lですか。`, ask: 'あわせた かさ' },
  { u: 'm', text: (A, B) => `赤い テープが ${A}m、青い テープが ${B}m あります。2本 あわせると 何mですか。`, ask: 'あわせた 長さ' },
  { u: 'km', text: (A, B) => `家から 公園まで ${A}km、公園から 駅まで ${B}km です。家から 公園を とおって 駅まで 何kmですか。`, ask: '道のり' },
  { u: 'L', text: (A, B) => `水そうに 水が ${A}L 入って います。そこへ ${B}L 入れると、水は 何Lに なりますか。`, ask: '水の かさ' },
  { u: 'kg', text: (A, B) => `さとうを きのう ${A}kg、きょう ${B}kg 使いました。あわせて 何kg 使いましたか。`, ask: '使った 重さ' },
  { u: 'm', text: (A, B) => `ひもを ${A}m 使い、あとから ${B}m 使いました。ぜんぶで 何m 使いましたか。`, ask: '使った 長さ' },
];

/** 文章題の数（分母が同じ。A は真分数か帯分数、B は帯分数） */
function wpTerms(D: number, carry: boolean): [Term, Term] {
  return retry(() => {
    const a: Term = Math.random() < 0.5 ? { w: 0, n: rnd(1, D - 1) } : { w: rnd(1, 4), n: rnd(1, D - 1) };
    const b: Term = { w: rnd(1, 4), n: rnd(1, D - 1) };
    return [a, b] as [Term, Term];
  }, ([a, b]) => tv(a, D) !== tv(b, D) && (carry ? a.n + b.n > D : a.n + b.n < D));
}

function genWpAdd(): Prob {
  const s = pick(ADD_SCENES);
  const D = rnd(3, 9);
  const carry = Math.random() < 0.5;
  const [a, b] = wpTerms(D, carry);
  const A = tr(a, D);
  const B = tr(b, D);
  const N = tv(a, D) + tv(b, D);
  const big = tv(a, D) >= tv(b, D) ? [A, B] : [B, A];
  const right = `${A} ＋ ${B}`;
  const text = s.text(A, B);
  return {
    skillId: 'wp-add', tag: carry ? 'carry' : 'plain',
    text,
    steps: [
      exprStep('しきを カードで つくろう（数と ＋ － の カードを タップ）',
        { need: [A, B], dummies: dummyTerms(D, [A, B], 2), op: '＋',
          opWhy: '「あわせて」「入れると」「全体」は たし算だよ。＋と － を とりちがえて いないかな？',
          orderWhy: '数と 記号の ならびを もう一度 見なおそう。' },
        right, [`${big[0]} － ${big[1]}`, `${big[1]} － ${big[0]}`], {
          [`${big[0]} － ${big[1]}`]: '「あわせて」「入れると」「全体」は たし算だよ。',
          [`${big[1]} － ${big[0]}`]: '「あわせて」「入れると」「全体」は たし算だよ。',
        }),
      mk(`${s.ask}は 何${s.u}？${ANY_NOTE}`, anyAns(N, D, 'mixed'), (x) => diagDen(D, '+')(x)
        ?? (carry && x.w === a.w + b.w && x.n === a.n + b.n - D ? '分数の ところが 1より 大きく なったら、1を 整数に くり上げよう。' : null)),
    ],
    hints: [
      '2つの 量を あわせるから、たし算だよ。',
      `式は ${right}。整数どうし、分数どうしに 分けて 計算しよう。`,
      carry ? `分数の ところ ${F(a.n, D)} ＋ ${F(b.n, D)} ＝ ${F(a.n + b.n, D)}。1を くり上げよう。` : `分数の ところ ${F(a.n, D)} ＋ ${F(b.n, D)} ＝ ${F(a.n + b.n, D)}。`,
    ],
    explain: `式は ${right} ＝ ${bothRich(N, D)}。答えは ${showVal(N, D)}${s.u}（${F(N, D)}${s.u}）。`,
    scratch: { kind: 'frac', tools: ['convert'] },
    label: `${s.ask}（${tp(a, D)}＋${tp(b, D)}）`,
    q: plain(text),
    a: `${bothVal(N, D)}${s.u}`,
  };
}

interface DiffScene { u: string; text: (P: string, A: string, Q: string, B: string) => string }
const DIFF_SCENES: DiffScene[] = [
  { u: 'km', text: (P, A, Q, B) => `${P}さんの 家から 学校までの 道のりは ${A}km、${Q}さんの 家から 学校までの 道のりは ${B}km です。家から 学校までの 道のりの ちがいは 何kmですか。` },
  { u: 'm', text: (P, A, Q, B) => `${P}さんの リボンは ${A}m、${Q}さんの リボンは ${B}m です。長さの ちがいは 何mですか。` },
  { u: 'L', text: (P, A, Q, B) => `${P}さんの 水とうには ${A}L、${Q}さんの 水とうには ${B}L 入ります。入る かさの ちがいは 何Lですか。` },
  { u: 'kg', text: (P, A, Q, B) => `${P}さんが ほった いもは ${A}kg、${Q}さんが ほった いもは ${B}kg でした。重さの ちがいは 何kgですか。` },
];

function genWpSub(): Prob {
  const s = pick(DIFF_SCENES);
  const D = rnd(3, 9);
  const borrow = Math.random() < 0.6;
  const [hi, lo] = retry(() => {
    const h: Term = { w: rnd(1, 4), n: rnd(1, D - 1) };
    const l: Term = Math.random() < 0.6 ? { w: 0, n: rnd(1, D - 1) } : { w: rnd(1, h.w), n: rnd(1, D - 1) };
    return [h, l] as [Term, Term];
  }, ([h, l]) => tv(h, D) > tv(l, D) && (borrow ? h.n < l.n : h.n > l.n));
  const [P, Q] = shuffle(NAMES).slice(0, 2) as [string, string];
  const swap = Math.random() < 0.4;
  const [A, B] = swap ? [tr(lo, D), tr(hi, D)] : [tr(hi, D), tr(lo, D)];
  const H = tr(hi, D);
  const L = tr(lo, D);
  const N = tv(hi, D) - tv(lo, D);
  const text = s.text(P, A, Q, B);
  const right = `${H} － ${L}`;
  return {
    skillId: 'wp-sub', tag: borrow ? 'borrow' : 'plain',
    text,
    steps: [
      exprStep('しきを カードで つくろう（数と ＋ － の カードを タップ）',
        { need: [H, L], dummies: dummyTerms(D, [H, L], 2), op: '－',
          opWhy: '「ちがい」は ひき算で もとめるよ。＋と － を とりちがえて いないかな？',
          orderWhy: '「ちがい」は、大きい ほうから 小さい ほうを ひくよ。ひかれる数と ひく数が 逆に なって いないかな？' },
        right, [`${L} － ${H}`, `${H} ＋ ${L}`], {
          [`${L} － ${H}`]: '「ちがい」は、大きい ほうから 小さい ほうを ひくよ。',
          [`${H} ＋ ${L}`]: '「ちがい」は ひき算で もとめるよ。',
        }),
      mk(`ちがいは 何${s.u}？${ANY_NOTE}`, anyAns(N, D, N > D ? 'mixed' : 'frac'), (x) => diagDen(D, '-')(x)
        ?? (borrow && x.w === hi.w - lo.w && x.n === lo.n - hi.n ? 'ひけない ときに、大きい ほうから 小さい ほうを ひいて いないかな？ 整数から 1 くり下げよう。' : null)),
    ],
    hints: [
      '「ちがい」は ひき算。2つの 量の どちらが 大きいか 見よう。',
      `大きい ほうは ${H}${s.u}。式は ${right}。`,
      borrow ? `${F(hi.n, D)} から ${F(lo.n, D)} は ひけないから、整数から 1 くり下げて ${M(hi.w - 1, D + hi.n, D)} に しよう。` : '整数どうし、分数どうしに 分けて ひこう。',
    ],
    explain: `式は ${right} ＝ ${bothRich(N, D)}。答えは ${showVal(N, D)}${s.u}${N > D ? `（${F(N, D)}${s.u}）` : ''}。`,
    scratch: { kind: 'frac', tools: ['borrow', 'convert'] },
    label: `ちがい（${tp(hi, D)}－${tp(lo, D)}）`,
    q: plain(text),
    a: `${bothVal(N, D)}${s.u}`,
  };
}

interface RemScene { u: string; text: (A: string, B: string) => string }
const REM_SCENES: RemScene[] = [
  { u: 'L', text: (A, B) => `ジュースが ${A}L ありました。${B}L 飲みました。のこりは 何Lですか。` },
  { u: 'm', text: (A, B) => `リボンが ${A}m あります。かざりに ${B}m 使いました。のこりは 何mですか。` },
  { u: 'kg', text: (A, B) => `こむぎこが ${A}kg ありました。パンを 作るのに ${B}kg 使いました。のこりは 何kgですか。` },
  { u: 'km', text: (A, B) => `${A}km の コースを 走ります。いま ${B}km 走りました。のこりは 何kmですか。` },
];

function genWpRem(): Prob {
  const s = pick(REM_SCENES);
  const D = rnd(3, 9);
  const whole = Math.random() < 0.4;
  const [a, b] = retry(() => {
    const A: Term = whole ? { w: rnd(2, 5), n: 0 } : { w: rnd(1, 4), n: rnd(1, D - 1) };
    const B: Term = Math.random() < 0.6 ? { w: 0, n: rnd(1, D - 1) } : { w: rnd(1, 3), n: rnd(1, D - 1) };
    return [A, B] as [Term, Term];
  }, ([A, B]) => tv(A, D) > tv(B, D));
  const N = tv(a, D) - tv(b, D);
  const A = tr(a, D);
  const B = tr(b, D);
  const text = s.text(A, B);
  const right = `${A} － ${B}`;
  return {
    skillId: 'wp-rem', tag: whole ? 'whole' : 'mixed',
    text,
    steps: [
      exprStep('しきを カードで つくろう（数と ＋ － の カードを タップ）',
        { need: [A, B], dummies: dummyTerms(D, [A, B], 2), op: '－',
          opWhy: '「のこり」は ひき算だよ。＋と － を とりちがえて いないかな？',
          orderWhy: 'はじめの 量から 使った 量を ひくよ。ひかれる数と ひく数が 逆に なって いないかな？' },
        right, [`${A} ＋ ${B}`, `${B} － ${A}`], {
          [`${A} ＋ ${B}`]: '「のこり」は ひき算だよ。',
          [`${B} － ${A}`]: 'はじめの 量から 使った 量を ひくよ。',
        }),
      mk(`のこりは 何${s.u}？${ANY_NOTE}`, anyAns(N, D, N > D ? 'mixed' : 'frac'), (x) => diagDen(D, '-')(x)
        ?? (whole && b.n > 0 && x.w === a.w - 1 - b.w && x.n === b.n && b.n * 2 !== D ? `整数を 分数に なおさずに ${F(b.n, D)} を そのまま かいて いないかな？ 1 ＝ ${F(D, D)} と して ひこう。` : null)),
    ],
    hints: [
      '「のこり」は ひき算。はじめの 量から 使った 量を ひくよ。',
      `式は ${right}。`,
      a.n < b.n || a.n === 0 ? `分数の ところが ひけないね。整数から 1 くり下げよう（1 ＝ ${F(D, D)}）。` : '整数どうし、分数どうしに 分けて ひこう。',
    ],
    explain: `式は ${right} ＝ ${bothRich(N, D)}。答えは ${showVal(N, D)}${s.u}${N > D ? `（${F(N, D)}${s.u}）` : ''}。`,
    scratch: { kind: 'frac', tools: ['borrow', 'convert'] },
    label: `のこり（${tp(a, D)}－${tp(b, D)}）`,
    q: plain(text),
    a: `${bothVal(N, D)}${s.u}`,
  };
}

/** 進み具合をくらべる（いかそう算数）: のこりの分数 → 終わった分数 → はやい順 */
function genWpProg(): Prob {
  const unit = Math.random() < 0.5;
  const names = shuffle(NAMES).slice(0, 3) as [string, string, string];
  type Say = { say: string; done: [number, number] };
  let says: Say[];
  let remIdx: number;
  if (unit) {
    // 単位分数（分子が1）で くらべる。1人は「のこり」で言う
    const dens = retry(() => shuffle([2, 3, 4, 5, 6, 8]).slice(0, 3), (ds) => new Set(ds).size === 3);
    remIdx = rnd(0, 2);
    says = dens.map((d, i) => {
      if (i === remIdx) return { say: `のこりは ${F(d - 1, d)} だよ。`, done: [1, d] as [number, number] };
      if (d === 2) return { say: '半分 終わったよ。', done: [1, 2] as [number, number] };
      return { say: `${F(1, d)} が 終わったよ。`, done: [1, d] as [number, number] };
    });
  } else {
    const D = rnd(5, 9);
    const ds = retry(() => [rnd(1, D - 1), rnd(1, D - 1), rnd(1, D - 1)], (xs) => new Set(xs).size === 3);
    remIdx = rnd(0, 2);
    says = ds.map((n, i) => (i === remIdx
      ? { say: `のこりは ${F(D - n, D)} だよ。`, done: [n, D] as [number, number] }
      : { say: `${F(n, D)} 終わったよ。`, done: [n, D] as [number, number] }));
  }
  const order = [0, 1, 2].sort((i, j) => cmpFrac(says[j]!.done[0], says[j]!.done[1], says[i]!.done[0], says[i]!.done[1]));
  const rem = says[remIdx]!;
  const remN = rem.done[1] - rem.done[0];
  const ans: Ans = { kind: 'order', items: [...names], correct: order };
  const text = `3人が、計算ドリルの しゅくだいに ついて 話して います。${names.map((n, i) => `${n}「${says[i]!.say}」`).join('　')}　はやく 進んで いる じゅんに ならべましょう。`;
  return {
    skillId: 'wp-prog', tag: unit ? 'unit' : 'same',
    text,
    steps: [
      exprStep('終わった ぶんを もとめる しきを カードで つくろう（数と ＋ － の カードを タップ）',
        { need: ['1', F(remN, rem.done[1])], dummies: dummyTerms(rem.done[1], ['1', F(remN, rem.done[1])], 2).filter((c) => c !== '1'), op: '－',
          opWhy: 'ぜんたいの 1 から のこりを ひいて、終わった ぶんを もとめるよ。＋と － を とりちがえて いないかな？',
          orderWhy: 'ぜんたい（1）から のこりを ひくよ。ひかれる数と ひく数が 逆に なって いないかな？' },
        `1 － ${F(remN, rem.done[1])}`, [`${F(remN, rem.done[1])} － 1`, `1 ＋ ${F(remN, rem.done[1])}`], {
          [`${F(remN, rem.done[1])} － 1`]: 'ぜんたい（1）から のこりを ひくよ。',
          [`1 ＋ ${F(remN, rem.done[1])}`]: '終わった ぶんは、ぜんたいから のこりを ひいて もとめるよ。',
        }),
      mk(`${names[remIdx]}さんは「のこりは ${F(remN, rem.done[1])}」。終わったのは ぜんたいの どれだけ？`, { kind: 'frac', n: rem.done[0], d: rem.done[1] }, (x) => (
        x.n === remN && x.d === rem.done[1] ? 'それは のこりの ぶんだよ。ぜんたいの 1 から のこりを ひこう。' : null
      )),
      {
        prompt: 'はやく 進んで いる じゅんに 名前を タップしよう',
        ans,
        diagnose: guard(ans, (x) => {
          if (!x.seq) return null;
          const rev = [...order].reverse();
          if (x.seq.every((v, k) => v === rev[k])) return 'おそい じゅんに なって いるよ。終わった ぶんが 多い ほうが はやいよ。';
          return unit ? '分子が 同じ（1）なら、分母が 小さい ほうが 大きいよ。' : null;
        }),
      },
    ],
    hints: [
      '「のこり」で 言って いる 人は、終わった ぶんに なおして くらべよう（ぜんたい ＝ 1）。',
      `1 ＝ ${F(rem.done[1], rem.done[1])}。${F(rem.done[1], rem.done[1])} － ${F(remN, rem.done[1])} ＝ ？`,
      unit ? '分子が 1 どうしの 分数は、分母が 小さい ほうが 大きい。半分 ＝ ' + F(1, 2) + '。' : '分母が 同じ なら、分子が 大きい ほうが 大きい。',
    ],
    explain: `終わった ぶんは ${names.map((n, i) => `${n} ${F(says[i]!.done[0], says[i]!.done[1])}`).join('、')}。はやい じゅんに ${order.map((i) => names[i]).join(' → ')}。`,
    label: '進み具合をくらべる',
    q: plain(text),
    a: order.map((i) => names[i]).join(' → '),
  };
}

/* =====================================================================
 * レベル表
 * =================================================================== */

export type UnitModuleId = 'hyo' | 'hen' | 'eq' | 'cmp' | 'add' | 'sub' | 'word-problem';

export const MODULE_LEVELS: Record<UnitModuleId, LevelDef[]> = {
  hyo: [
    { id: 'hyo-kind', label: '真分数・仮分数・帯分数', desc: 'どの 分数か 見分けよう', gen: genHyoKind },
    { id: 'hyo-unit', label: '何こ分？', desc: '4分の7 は 4分の1 の 7こ分', gen: genHyoUnit },
    { id: 'hyo-tape', label: 'テープと 水の かさ', desc: '目もりを 読んで 仮分数で', gen: genHyoTape },
    { id: 'hyo-draw', label: '色を ぬって あらわそう', desc: '4分の7m に なるように ぬる', gen: genHyoDraw },
    { id: 'hyo-line', label: '数直線の 分数', desc: '1より 大きい 目もり', gen: genHyoLine },
  ],
  hen: [
    { id: 'hen-mixed', label: '仮分数 → 帯分数・整数', desc: '3分の5 ＝ 1と3分の2', gen: genHenMixed },
    { id: 'hen-div', label: 'わり算で なおそう', desc: '分子 ÷ 分母 の 商と あまり', gen: genHenDiv },
    { id: 'hen-imp', label: '帯分数 → 仮分数', desc: '3と9分の2 ＝ 9分の29', gen: genHenImp },
  ],
  eq: [
    { id: 'eq-line', label: '数直線で 等しい 分数', desc: '3分の2 ＝ 6分の□', gen: genEqLine },
    { id: 'eq-tap', label: '同じ 大きさを タップ', desc: 'たてに そろう 目もり', gen: genEqTap },
    { id: 'eq-pick', label: '等しい 分数を えらぼう', desc: '数直線を 見て えらぶ', gen: genEqPick },
  ],
  cmp: [
    { id: 'cmp-same', label: '分母が 同じ 大きさくらべ', desc: '4と7分の6 □ 7分の35', gen: genCmpSame },
    { id: 'cmp-num', label: '分子が 同じ 大きさくらべ', desc: '6分の3 □ 8分の3', gen: genCmpNum },
    { id: 'cmp-order', label: '大きい じゅんに', desc: '仮分数を ならべよう', gen: genCmpOrder },
  ],
  add: [
    { id: 'add-fig', label: '図で 考える たし算', desc: '5分の1 の 何こ分？', gen: genAddFig },
    { id: 'add-basic', label: '真分数・仮分数の たし算', desc: '5分の2 ＋ 5分の4', gen: genAddBasic },
    { id: 'add-mixed', label: '帯分数の たし算', desc: '4と3分の1 ＋ 2と3分の1', gen: genAddMixed },
    { id: 'add-whole', label: '整数 ＋ 帯分数', desc: '3 ＋ 1と9分の5', gen: genAddWhole },
    { id: 'add-carry', label: 'くり上がり', desc: '2と8分の5 ＋ 8分の4', gen: genAddCarry },
    { id: 'add-one', label: '答えが 整数', desc: '1と7分の5 ＋ 7分の2', gen: genAddOne },
  ],
  sub: [
    { id: 'sub-basic', label: '仮分数の ひき算', desc: '4分の6 － 4分の3', gen: genSubBasic },
    { id: 'sub-mixed', label: '帯分数の ひき算', desc: '2と9分の6 － 1と9分の4', gen: genSubMixed },
    { id: 'sub-whole', label: '帯分数 － 整数', desc: '7と8分の3 － 5', gen: genSubWhole },
    { id: 'sub-borrow', label: 'くり下がり', desc: '5と7分の2 － 7分の4', gen: genSubBorrow },
    { id: 'sub-from', label: '整数 － 分数', desc: '3 － 5分の3', gen: genSubFrom },
  ],
  'word-problem': [
    { id: 'wp-add', label: 'あわせて いくつ？', desc: 'たし算の 文章題', gen: genWpAdd },
    { id: 'wp-sub', label: 'ちがいは いくつ？', desc: 'ひき算の 文章題', gen: genWpSub },
    { id: 'wp-rem', label: 'のこりは いくつ？', desc: '整数 － 分数 も', gen: genWpRem },
    { id: 'wp-prog', label: 'どこまで 進んだ？', desc: 'のこりの 分数から くらべる', gen: genWpProg },
  ],
};

export const UNIT_LEVELS: LevelDef[] = Object.values(MODULE_LEVELS).flat();

const BY_ID = new Map(UNIT_LEVELS.map((l) => [l.id, l]));

/* =====================================================================
 * けいさんらん（分数）を出す画面と、開いたときの道具（docs/DESIGN.md §6）
 *   4年は分母が同じなので、convert（仮分数・帯分数）と borrow（くり下げ）だけ。
 *   数は問題文に書いてあるものだけ initial で渡す（文章題は渡さない。立式は子どもの仕事）。
 *   出さない画面: hyo-*（図が道具）、eq-*（数直線が道具）、cmp-same/cmp-num（直す数が小さい）、
 *   add-mixed/add-whole/sub-basic/sub-mixed/sub-whole（くり上がり・くり下がりが無い）、add-fig（図が道具）、wp-prog（考えをならべる）。
 * =================================================================== */

const pad = (tools: FractionTool[], initial?: FracScratch['initial']): FracScratch => ({ kind: 'frac', tools, initial });
/** q の先頭の項（「3と2/9」「29/9」「3」）を FractionPad の mixed にする */
function firstTerm(q: string): FracScratch['initial'] {
  const m = /^(\d+)と(\d+)\/(\d+)/.exec(q);
  if (m) return { mixed: { w: Number(m[1]), n: Number(m[2]), d: Number(m[3]) } };
  const f = /^(\d+)\/(\d+)/.exec(q);
  if (f) return { mixed: { w: 0, n: Number(f[1]), d: Number(f[2]) } };
  return undefined;
}
const denOf = (q: string): number => Number(/\/(\d+)/.exec(q)?.[1] ?? 0);

const PADS: Record<string, (p: Prob) => FracScratch | undefined> = {
  'hen-mixed': (p) => pad(['convert'], firstTerm(p.q)),
  'hen-div': (p) => pad(['convert'], firstTerm(p.q)),
  'hen-imp': (p) => (p.tag === 'mixed' ? pad(['convert'], firstTerm(p.q)) : undefined),
  'add-basic': () => pad(['convert']),
  'add-carry': () => pad(['convert']),
  'add-one': () => pad(['convert']),
  'sub-borrow': (p) => pad(['borrow', 'convert'], firstTerm(p.q)),
  'sub-from': (p) => {
    const k = /^(\d+)－/.exec(p.q);
    return pad(['borrow', 'convert'], k ? { mixed: { w: Number(k[1]), n: 0, d: denOf(p.q) } } : undefined);
  },
  'cmp-order': () => pad(['convert']),
};

function attachPad(p: Prob): Prob {
  const f = PADS[p.skillId];
  if (!f) return p;
  const s = f(p);
  return s ? { ...p, scratch: s } : p;
}

/** 項目の記号から1問つくる（エラーハンター eh-* は errorHunter.ts） */
export function generate(skillId: string): Prob {
  const l = BY_ID.get(skillId);
  if (!l) throw new Error(`unknown skillId: ${skillId}`);
  return attachPad(l.gen());
}

/** 「この形」の問題が出るまで作り直す（本番テストで形を指定するのに使う） */
export function generateTagged(skillId: string, tag: string): Prob {
  return retry(() => generate(skillId), (p) => p.tag === tag, 4000);
}
