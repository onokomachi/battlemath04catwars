// このファイルは単元アプリ syo4-bunnsu の src/lib/errorHunter.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * エラーハンターの問題。ともだちのノートに、この単元で よくある まちがいが 書いてある。
 * 「正しい？ まちがい？」を見ぬき → 正しく直し → なぜまちがえたかを選ぶ。
 *
 * まちがいの型（記号 eh-*）。どれも単元の代表的な考えちがい（誤概念。docs/DESIGN.md §3）に1つずつ対応する:
 *   eh-den    … 分母どうしもたす                    2/5 ＋ 4/5 ＝ 6/10
 *   eh-carry  … くり上げた1を落とす                 2と5/8 ＋ 4/8 ＝ 2と1/8
 *   eh-borrow … くり下げずに逆にひく               5と2/7 － 4/7 ＝ 5と2/7
 *   eh-whole  … 整数－分数で整数を分数に直さない   3 － 3/5 ＝ 2と3/5
 *   eh-wadd   … 整数＋帯分数で整数を分子にたす     3 ＋ 1と5/9 ＝ 1と8/9
 *   eh-tomix  … 仮分数→帯分数で商とあまりを入れかえ 17/5 ＝ 2と3/5
 *   eh-toimp  … 帯分数→仮分数で整数と分子をたすだけ 3と2/9 ＝ 5/9
 *   eh-cmp    … 分母が大きいほど大きい             3/6 ＜ 3/8
 *   eh-mixcmp … 見えている数字だけでくらべる       2と1/5 ＜ 9/5
 *   eh-eq     … 等しい分数を「たし算」でつくる     2/3 ＝ 5/6
 * eh-judge は、正しいノートと まちがいのノートを 半々に見せる（正しいものを正しいと見ぬく力。いつも正しいと 押すだけで当たるので 半々にした）。
 */
import { F, M, rnd, pick, shuffle, retry, plain } from './frac';
import { type Step, type Scratch, type FracScratch, type Ans, type Inp, guard, NAMES, tr, tp, showVal, plainVal, bothVal, type Term } from './problems';

export interface ErrProb {
  skillId: string;
  character: string;
  work: string[];
  isCorrect: boolean;
  /** まちがいを直す手順（isCorrect のときは使わない） */
  fix: Step;
  reasons: string[];
  correctReason: number;
  fixHint: string;
  explain: string;
  scratch?: Scratch | FracScratch;
  label: string;
  q: string;
  a: string;
}

export const ERROR_TYPES = [
  { id: 'eh-judge', label: '正しい ノートを 見ぬく', desc: '正しい ノートと まちがいの ノートが まざって いるよ' },
  { id: 'eh-den', label: '分母まで たしてる？', desc: '5分の2 ＋ 5分の4 ＝ 10分の6 ?' },
  { id: 'eh-carry', label: 'くり上がりの まちがい', desc: '帯分数の たし算' },
  { id: 'eh-borrow', label: 'くり下がりの まちがい', desc: '帯分数の ひき算' },
  { id: 'eh-whole', label: '整数 － 分数 の まちがい', desc: '整数を 分数に なおさない' },
  { id: 'eh-wadd', label: '整数 ＋ 帯分数 の まちがい', desc: '整数を 分子に たしてる？' },
  { id: 'eh-tomix', label: '帯分数に なおす まちがい', desc: '商と あまりが 逆？' },
  { id: 'eh-toimp', label: '仮分数に なおす まちがい', desc: '整数と 分子を たしただけ？' },
  { id: 'eh-cmp', label: '分子が 同じ 大きさくらべ', desc: '分母が 大きいほど 大きい ?' },
  { id: 'eh-mixcmp', label: '帯分数と 仮分数の 大きさくらべ', desc: '見えている 数字だけで くらべてる？' },
  { id: 'eh-eq', label: '等しい 分数の まちがい', desc: '分母に 3 たしたら 分子にも ?' },
] as const;

/**
 * 理由の選択肢（正しい理由 ＋ ほかの理由3つ）。位置は毎回入れかえる。
 * ほかの理由は、**ほかの まちがいの型の「正しい理由」**から えらぶ（2026-11）。
 * 前は「九九を まちがえた」などの 短い決まり文句だったので、正しい理由が いつも いちばん長く、読まずに当てられた。
 * 同じ形・同じくらいの長さの 考えちがいどうしを くらべることで、どの考えちがいかを 見分ける問題になる。
 * SIMILAR は、まぎらわしくて どちらも当てはまりそうな 型の組（同じ問題には いっしょに出さない）。
 */
const SIMILAR: string[][] = [['くり下げ']];
const similar = (a: string, b: string) => SIMILAR.some((g) => g.some((w) => a.includes(w)) && g.some((w) => b.includes(w)));
const REASON_POOL = new Set<string>();
let collecting = false;
function reasonPool(): string[] {
  if (REASON_POOL.size === 0) {
    // どの型の「正しい理由」も ここで1回だけ集める（作り方の中で reasonSet が呼ばれるので、それを記録する）
    collecting = true;
    try { for (const make of Object.values(MAKERS)) for (let i = 0; i < 40; i++) make(false); } finally { collecting = false; }
  }
  return [...REASON_POOL];
}
function reasonSet(right: string): { reasons: string[]; correctReason: number } {
  if (collecting) { REASON_POOL.add(right); return { reasons: [right], correctReason: 0 }; }
  const others = shuffle(reasonPool().filter((r) => r !== right && !similar(r, right))).slice(0, 3);
  const reasons = shuffle([right, ...others]);
  return { reasons, correctReason: reasons.indexOf(right) };
}

const anyAns = (N: number, D: number, start: 'frac' | 'mixed', only?: 'mixed'): Ans => ({ kind: 'any', n: N, d: D, start, only });

type Maker = (correct: boolean) => Omit<ErrProb, 'skillId' | 'character' | 'isCorrect'>;

const makeDen: Maker = (ok) => {
  const D = rnd(3, 9);
  const [n1, n2] = retry(() => [rnd(1, D - 1), rnd(1, D - 1)] as [number, number], ([p, q]) => p + q > D && (p + q) % D !== 0);
  const N = n1 + n2;
  const fixAns = anyAns(N, D, 'frac');
  return {
    work: ok ? [`${F(n1, D)} ＋ ${F(n2, D)} ＝ ${F(N, D)} ＝ ${showVal(N, D)}`] : [`${F(n1, D)} ＋ ${F(n2, D)} ＝ ${F(N, D * 2)}`],
    fix: {
      prompt: `${F(n1, D)} ＋ ${F(n2, D)} の 正しい 答えは？（帯分数でも 仮分数でも いいよ）`,
      ans: fixAns,
      diagnose: guard(fixAns, (x) => (x.d === D * 2 ? 'まだ 分母を たして いるよ。分母は 1つ分の 大きさ。そのまま。' : null)),
    },
    ...reasonSet('分母まで たしてしまった（分母は 1つ分の 大きさだから そのまま）'),
    fixHint: `${F(1, D)} が ${n1}こ と ${n2}こ。あわせて 何こ分かな？ 1つ分の 大きさは かわらないね。`,
    explain: `正しくは ${F(n1, D)} ＋ ${F(n2, D)} ＝ ${F(N, D)}（＝ ${showVal(N, D)}）。分母は そのままで 分子だけ たすよ。`,
    label: `${n1}/${D}＋${n2}/${D} ＝ ${ok ? `${N}/${D}` : `${N}/${D * 2}`}`,
    q: `まちがい探し：${n1}/${D}＋${n2}/${D} ＝ ${ok ? `${N}/${D}` : `${N}/${D * 2}`}`,
    a: ok ? '正しい' : `正しくは ${bothVal(N, D)}`,
  };
};

const makeCarry: Maker = (ok) => {
  const D = rnd(3, 9);
  const [n1, n2] = retry(() => [rnd(1, D - 1), rnd(1, D - 1)] as [number, number], ([p, q]) => p + q > D);
  const a: Term = { w: rnd(1, 5), n: n1 };
  const b: Term = Math.random() < 0.5 ? { w: rnd(1, 3), n: n2 } : { w: 0, n: n2 };
  const W = a.w + b.w;
  const N = W * D + n1 + n2;
  const expr = `${tr(a, D)} ＋ ${tr(b, D)}`;
  const fixAns = anyAns(N, D, 'mixed');
  return {
    work: ok
      ? [expr, `分数 ${F(n1, D)} ＋ ${F(n2, D)} ＝ ${F(n1 + n2, D)} ＝ ${M(1, n1 + n2 - D, D)}`, `整数 ${a.w}${b.w ? ` ＋ ${b.w}` : ''} ＋ 1 ＝ ${W + 1}`, `答え ${showVal(N, D)}`]
      : [expr, `分数 ${F(n1, D)} ＋ ${F(n2, D)} ＝ ${F(n1 + n2, D)} → ${F(n1 + n2 - D, D)}`, `整数 ${a.w}${b.w ? ` ＋ ${b.w}` : ''} ＝ ${W}`, `答え ${M(W, n1 + n2 - D, D)}`],
    fix: {
      prompt: `${expr} の 正しい 答えは？（帯分数でも 仮分数でも いいよ）`,
      ans: fixAns,
      diagnose: guard(fixAns, (x) => (x.w === W && x.n === n1 + n2 - D ? 'まだ くり上げた 1 を 整数に たして いないよ。' : null)),
    },
    ...reasonSet('分数の ところで くり上がった 1 を、整数に たさなかった'),
    fixHint: `${F(n1 + n2, D)} ＝ ${M(1, n1 + n2 - D, D)}。この 1 は どこへ いったかな？`,
    explain: `正しくは 分数の ところ ${F(n1 + n2, D)} ＝ ${M(1, n1 + n2 - D, D)}。1 を 整数に くり上げて ${W} ＋ 1 ＝ ${W + 1}。答えは ${showVal(N, D)}（${F(N, D)}）。`,
    label: `${tp(a, D)}＋${tp(b, D)}`,
    q: `まちがい探し：${tp(a, D)}＋${tp(b, D)} ＝ ${ok ? plainVal(N, D) : `${W}と${n1 + n2 - D}/${D}`}`,
    a: ok ? '正しい' : `正しくは ${bothVal(N, D)}`,
  };
};

const makeBorrow: Maker = (ok) => {
  const D = rnd(4, 9);
  const [n1, n2] = retry(() => [rnd(1, D - 2), rnd(2, D - 1)] as [number, number], ([p, q]) => p < q && D + p - q !== q - p);
  const w1 = rnd(2, 7);
  const b: Term = Math.random() < 0.5 ? { w: rnd(1, w1 - 1), n: n2 } : { w: 0, n: n2 };
  const a: Term = { w: w1, n: n1 };
  const N = (w1 - b.w) * D + n1 - n2;
  const Wrong = w1 - b.w;
  const expr = `${tr(a, D)} － ${tr(b, D)}`;
  const fixAns = anyAns(N, D, 'mixed');
  return {
    work: ok
      ? [expr, `1 くり下げて ${M(w1 - 1, D + n1, D)} － ${tr(b, D)}`, `分数 ${F(D + n1, D)} － ${F(n2, D)} ＝ ${F(D + n1 - n2, D)}`, `答え ${showVal(N, D)}`]
      : [expr, `分数 ${F(n2, D)} － ${F(n1, D)} ＝ ${F(n2 - n1, D)}`, `整数 ${w1}${b.w ? ` － ${b.w}` : ''} ＝ ${Wrong}`, `答え ${M(Wrong, n2 - n1, D)}`],
    fix: {
      prompt: `${expr} の 正しい 答えは？（帯分数でも 仮分数でも いいよ）`,
      ans: fixAns,
      diagnose: guard(fixAns, (x) => (x.w === Wrong && x.n === n2 - n1 ? 'まだ 逆に ひいて いるよ。整数から 1 くり下げて、分数に たしてから ひこう。' : null)),
    },
    ...reasonSet('ひけない ところで、大きい ほうから 小さい ほうを ひいてしまった（くり下げが 必要）'),
    fixHint: `${F(n1, D)} から ${F(n2, D)} は ひけないね。整数から 1 くり下げて、${F(D, D)} を ${F(n1, D)} に たそう。`,
    explain: `正しくは ${M(w1, n1, D)} ＝ ${M(w1 - 1, D + n1, D)} と なおして、${F(D + n1, D)} － ${F(n2, D)} ＝ ${F(D + n1 - n2, D)}。答えは ${showVal(N, D)}${N > D ? `（${F(N, D)}）` : ''}。`,
    label: `${tp(a, D)}－${tp(b, D)}`,
    q: `まちがい探し：${tp(a, D)}－${tp(b, D)} ＝ ${ok ? plainVal(N, D) : `${Wrong}と${n2 - n1}/${D}`}`,
    a: ok ? '正しい' : `正しくは ${bothVal(N, D)}`,
  };
};

const makeWhole: Maker = (ok) => {
  const k = rnd(2, 6);
  const D = rnd(3, 9);
  const n = retry(() => rnd(1, D - 1), (v) => v * 2 !== D); // n と D−n が同じだと、まちがいと正解が区別できない
  const N = k * D - n;
  const fixAns = anyAns(N, D, 'mixed');
  return {
    work: ok
      ? [`${k} － ${F(n, D)}`, `${k} ＝ ${M(k - 1, D, D)} だから`, `答え ${M(k - 1, D - n, D)}`]
      : [`${k} － ${F(n, D)}`, `整数の ${k} から 1 ひいて、分数は そのまま`, `答え ${M(k - 1, n, D)}`],
    fix: {
      prompt: `${k} － ${F(n, D)} の 正しい 答えは？（帯分数でも 仮分数でも いいよ）`,
      ans: fixAns,
      diagnose: guard(fixAns, (x) => (x.w === k - 1 && x.n === n ? `1 を くり下げたなら、その 1 は ${F(D, D)} と して 分数に 入れて ひくんだよ。` : null)),
    },
    ...reasonSet('整数を 分数に なおさずに（くり下げた 1 を 使わずに）、ひく 分数を そのまま 書いた'),
    fixHint: `${k} ＝ ${k - 1} と ${F(D, D)}。${F(D, D)} から ${F(n, D)} を ひこう。`,
    explain: `正しくは ${k} ＝ ${M(k - 1, D, D)} と なおして、${F(D, D)} － ${F(n, D)} ＝ ${F(D - n, D)}。答えは ${M(k - 1, D - n, D)}（${F(N, D)}）。`,
    label: `${k}－${n}/${D} ＝ ${ok ? `${k - 1}と${D - n}/${D}` : `${k - 1}と${n}/${D}`}`,
    q: `まちがい探し：${k}－${n}/${D} ＝ ${ok ? `${k - 1}と${D - n}/${D}` : `${k - 1}と${n}/${D}`}`,
    a: ok ? '正しい' : `正しくは ${bothVal(N, D)}`,
  };
};

const makeWadd: Maker = (ok) => {
  const D = rnd(4, 9);
  const k = rnd(1, 5);
  const m: Term = retry(() => ({ w: rnd(1, 5), n: rnd(1, D - 2) }), (t) => t.n + k < D && t.w !== k + t.w);
  const N = k * D + m.w * D + m.n;
  const fixAns = anyAns(N, D, 'mixed');
  return {
    work: ok
      ? [`${k} ＋ ${tr(m, D)}`, `整数どうし ${k} ＋ ${m.w} ＝ ${k + m.w}`, `答え ${M(k + m.w, m.n, D)}`]
      : [`${k} ＋ ${tr(m, D)}`, `分子に ${k} を たして ${m.n} ＋ ${k} ＝ ${m.n + k}`, `答え ${M(m.w, m.n + k, D)}`],
    fix: {
      prompt: `${k} ＋ ${tr(m, D)} の 正しい 答えは？（帯分数でも 仮分数でも いいよ）`,
      ans: fixAns,
      diagnose: guard(fixAns, (x) => (x.w === m.w && x.n === m.n + k ? 'まだ 整数を 分子に たして いるよ。整数は 整数どうしで たそう。' : null)),
    },
    ...reasonSet('整数を 分子に たしてしまった（整数は 整数どうしで たす）'),
    fixHint: `${k} は 整数。${tr(m, D)} の 整数の ところ（${m.w}）と たそう。`,
    explain: `正しくは 整数どうし ${k} ＋ ${m.w} ＝ ${k + m.w}、分数の ${F(m.n, D)} は そのままで ${M(k + m.w, m.n, D)}（${F(N, D)}）。`,
    label: `${k}＋${tp(m, D)}`,
    q: `まちがい探し：${k}＋${tp(m, D)} ＝ ${ok ? `${k + m.w}と${m.n}/${D}` : `${m.w}と${m.n + k}/${D}`}`,
    a: ok ? '正しい' : `正しくは ${bothVal(N, D)}`,
  };
};

const makeToMix: Maker = (ok) => {
  const { D, w, r } = retry(() => {
    const D = rnd(3, 9);
    return { D, w: rnd(1, D - 1), r: rnd(1, D - 1) };
  }, (t) => t.w !== t.r);
  const N = w * D + r;
  const fixAns = anyAns(N, D, 'mixed', 'mixed');
  return {
    work: ok
      ? [`${F(N, D)}`, `${N} ÷ ${D} ＝ ${w} あまり ${r}`, `答え ${M(w, r, D)}`]
      : [`${F(N, D)}`, `${N} ÷ ${D} ＝ ${w} あまり ${r}`, `答え ${M(r, w, D)}`],
    fix: {
      prompt: `${F(N, D)} を 正しく 帯分数に なおそう`,
      ans: fixAns,
      diagnose: guard(fixAns, (x) => (x.w === r && x.n === w ? 'まだ 商と あまりが 入れかわって いるよ。商が 整数の ところ。' : null)),
    },
    ...reasonSet('商と あまりを 入れかえて しまった（商が 整数、あまりが 分子）'),
    fixHint: `${N} ÷ ${D} の 商は いくつ分 とれるか、あまりは のこった ${F(1, D)} の こ数だよ。`,
    explain: `正しくは ${N} ÷ ${D} ＝ ${w} あまり ${r}。商の ${w} が 整数、あまりの ${r} が 分子で、${F(N, D)} ＝ ${M(w, r, D)}。`,
    label: `${N}/${D} を帯分数に`,
    q: `まちがい探し：${N}/${D} ＝ ${ok ? `${w}と${r}/${D}` : `${r}と${w}/${D}`}`,
    a: ok ? '正しい' : `正しくは ${w}と${r}/${D}`,
  };
};

const makeToImp: Maker = (ok) => {
  const D = rnd(3, 9);
  const w = rnd(2, 6);
  const n = rnd(1, D - 1);
  const N = w * D + n;
  const fixAns: Ans = { kind: 'frac', n: N, d: D };
  return {
    work: ok
      ? [`${M(w, n, D)}`, `${D} × ${w} ＋ ${n} ＝ ${N}`, `答え ${F(N, D)}`]
      : [`${M(w, n, D)}`, `${w} ＋ ${n} ＝ ${w + n}`, `答え ${F(w + n, D)}`],
    fix: {
      prompt: `${M(w, n, D)} を 正しく 仮分数に なおそう`,
      ans: fixAns,
      diagnose: guard(fixAns, (x: Inp) => (x.n === w + n ? `まだ 整数と 分子を たした だけ だよ。整数の ${w} は ${F(1, D)} の ${D} × ${w} こ分。` : null)),
    },
    ...reasonSet('整数と 分子を たした だけで、整数を 分母の こ数ぶんに なおさなかった（整数 × 分母 ＋ 分子）'),
    fixHint: `1 ＝ ${F(D, D)}。${w} は ${F(1, D)} が いくつ 集まった 数かな？`,
    explain: `正しくは ${D} × ${w} ＋ ${n} ＝ ${N} だから、${M(w, n, D)} ＝ ${F(N, D)}。`,
    label: `${w}と${n}/${D} を仮分数に`,
    q: `まちがい探し：${w}と${n}/${D} ＝ ${ok ? `${N}/${D}` : `${w + n}/${D}`}`,
    a: ok ? '正しい' : `正しくは ${N}/${D}`,
  };
};

const makeCmp: Maker = (ok) => {
  const n = rnd(1, 5);
  const [d1, d2] = retry(() => [rnd(n + 1, 10), rnd(n + 1, 10)] as [number, number], ([p, q]) => p < q);
  const choices = shuffle([F(n, d1), F(n, d2)]);
  return {
    work: ok
      ? [`${F(n, d1)} と ${F(n, d2)}`, `分子が 同じ だから、分母が 小さい ${F(n, d1)} の ほうが 大きい。`]
      : [`${F(n, d1)} と ${F(n, d2)}`, `${d2} の ほうが 大きい 数 だから、${F(n, d2)} の ほうが 大きい。`],
    fix: {
      prompt: `${F(n, d1)} と ${F(n, d2)} で、大きいのは どちら？`,
      ans: { kind: 'choice', choices, correct: choices.indexOf(F(n, d1)) },
    },
    ...reasonSet('分母が 大きいほど 大きい 数だと 思いこんだ（分母が 大きいほど 1つ分は 小さい）'),
    fixHint: `${F(1, d1)} と ${F(1, d2)}、1つ分が 大きいのは どちらかな？`,
    explain: `正しくは ${F(n, d1)} の ほうが 大きい。分子が 同じ ときは、分母が 小さい ほうが 1つ分が 大きいから。`,
    label: `${n}/${d1} と ${n}/${d2} の大きさ`,
    q: `まちがい探し：${n}/${d1} と ${n}/${d2} は ${ok ? `${n}/${d1}` : `${n}/${d2}`} が大きい`,
    a: ok ? '正しい' : `正しくは ${n}/${d1} が大きい`,
  };
};

const makeMixCmp: Maker = (ok) => {
  // 帯分数のほうが大きいのに、分子の数字だけ見て仮分数のほうが大きいとした
  const { D, w, r, M2 } = retry(() => {
    const D = rnd(3, 9);
    const w = rnd(1, 4);
    const r = rnd(1, D - 2);
    const M2 = rnd(D + 1, w * D + r - 1);
    return { D, w, r, M2 };
  }, (t) => t.M2 > t.r && t.M2 % t.D !== 0 && t.M2 < t.w * t.D + t.r);
  const mix = M(w, r, D);
  const imp = F(M2, D);
  const choices = shuffle([mix, imp]);
  return {
    work: ok
      ? [`${mix} と ${imp}`, `${mix} ＝ ${F(w * D + r, D)} だから、${mix} の ほうが 大きい。`]
      : [`${mix} と ${imp}`, `${M2} は ${r} より 大きいから、${imp} の ほうが 大きい。`],
    fix: {
      prompt: `${mix} と ${imp} で、大きいのは どちら？`,
      ans: { kind: 'choice', choices, correct: choices.indexOf(mix) },
    },
    ...reasonSet('帯分数の 整数の ところを 見ずに、見えている 分子の 数字だけで くらべた（形を そろえて くらべる）'),
    fixHint: `${mix} を 仮分数に なおすと？ ${D} × ${w} ＋ ${r}。`,
    explain: `正しくは ${mix} ＝ ${F(w * D + r, D)}。${F(w * D + r, D)} と ${imp} では ${mix} の ほうが 大きい。形を そろえて くらべよう。`,
    label: `${w}と${r}/${D} と ${M2}/${D} の大きさ`,
    q: `まちがい探し：${w}と${r}/${D} と ${M2}/${D} は ${ok ? `${w}と${r}/${D}` : `${M2}/${D}`} が大きい`,
    a: ok ? '正しい' : `正しくは ${w}と${r}/${D} が大きい`,
  };
};

const EQ_PAIRS: [number, number][] = [[2, 4], [2, 6], [2, 8], [3, 6], [3, 9], [4, 8], [2, 10], [5, 10], [3, 12], [4, 12], [6, 12], [2, 12]];
const makeEq: Maker = (ok) => {
  const [a, b] = pick(EQ_PAIRS);
  const n = rnd(1, a - 1);
  const n2 = (n * b) / a;
  const addN = n + (b - a);
  const fixAns: Ans = { kind: 'num', v: n2 };
  return {
    work: ok
      ? [`${F(n, a)} ＝ ${F(n2, b)}`, '（数直線で 同じ ところに なった）']
      : [`${F(n, a)} ＝ ${F(addN, b)}`, `（分母に ${b - a} を たしたから、分子にも ${b - a} を たした）`],
    fix: {
      prompt: `${F(n, a)} ＝ ${F('□', b)} の □ に 入る 数は？`,
      ans: fixAns,
      diagnose: guard(fixAns, (x) => (x.v === addN ? 'まだ たし算で つくって いるよ。数直線で 同じ ところを たどって みよう。' : null)),
    },
    ...reasonSet('分母と 分子に 同じ数を「たして」しまった（たしても 大きさは 等しく ならない）'),
    fixHint: `${F(1, a)} の 1つ分は、${F(1, b)} の ${b / a}こ分。${F(n, a)} は ${F(1, b)} の 何こ分かな？`,
    explain: `正しくは ${F(n, a)} ＝ ${F(n2, b)}。${F(1, a)} の 1つ分が ${F(1, b)} の ${b / a}こ分 だから、${n} × ${b / a} ＝ ${n2}。`,
    label: `${n}/${a} ＝ ${ok ? n2 : addN}/${b}`,
    q: `まちがい探し：${n}/${a} ＝ ${ok ? n2 : addN}/${b}`,
    a: ok ? '正しい' : `正しくは ${n2}/${b}`,
  };
};

const MAKERS: Record<string, Maker> = {
  'eh-den': makeDen, 'eh-carry': makeCarry, 'eh-borrow': makeBorrow, 'eh-whole': makeWhole, 'eh-wadd': makeWadd,
  'eh-tomix': makeToMix, 'eh-toimp': makeToImp, 'eh-cmp': makeCmp, 'eh-mixcmp': makeMixCmp, 'eh-eq': makeEq,
};

/** 型ごとに、「たしかめる」ための けいさんらん（分数）の道具。ノートの数は問題文ではないので initial は渡さない */
const EH_PADS: Record<string, FracScratch['tools']> = {
  'eh-carry': ['convert'],
  'eh-borrow': ['borrow', 'convert'],
  'eh-whole': ['borrow'],
  'eh-tomix': ['convert'],
  'eh-toimp': ['convert'],
  'eh-mixcmp': ['convert'],
};
const padFor = (kind: string): FracScratch | undefined => (EH_PADS[kind] ? { kind: 'frac', tools: EH_PADS[kind]! } : undefined);

/** 型の記号から1問つくる。eh-judge は、どれかの型の ノート（正しい・まちがいが 半々） */
export function generateError(skillId: string): ErrProb {
  const character = pick(NAMES);
  if (skillId === 'eh-judge') {
    // 正しいノートと まちがいのノートを 半々に出す（いつも正しいと「正しい」を押すだけで当たる。2026-11）
    const kind = pick(Object.keys(MAKERS));
    const ok = Math.random() < 0.5;
    return { skillId, character, isCorrect: ok, scratch: padFor(kind), ...MAKERS[kind]!(ok) };
  }
  const mkr = MAKERS[skillId];
  if (!mkr) throw new Error(`unknown error type: ${skillId}`);
  return { skillId, character, isCorrect: false, scratch: padFor(skillId), ...mkr(false) };
}

/** 答案（テストのきろく）用に、問題と正しい答えを文字にする */
export function describeError(p: ErrProb): { q: string; a: string } {
  return { q: plain(p.q), a: plain(p.a) };
}
