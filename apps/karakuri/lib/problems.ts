// このファイルは単元アプリ syo4-keisannokimari の src/lib/problems.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 「計算のきまり」単元（東京書籍4年下・単元8）の問題ジェネレーター。
 * すべて純粋関数。UIコンポーネントからはこれらを呼ぶだけにして、
 * ロジックとUIを分離する（テスト・ボス戦からも同じ関数を再利用する）。
 *
 * 表記は教科書の書式にそろえる: ＋－は全角、×÷は半角記号、＝は全角、( )は半角。
 */
import { tokenize, isOp, validPicks } from './orderSteps';

export type Op = '+' | '-' | '×' | '÷';

function rnd(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}
function shuffle<T>(a: T[]): T[] {
  const arr = [...a];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
function compute(a: number, op: Op, b: number): number {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '×': return a * b;
    case '÷': return a / b;
  }
}
function opDisplay(op: Op): string {
  return op === '+' ? '＋' : op === '-' ? '－' : op;
}
function fmt(a: number, op: Op, b: number): string {
  return `${a}${opDisplay(op)}${b}`;
}

/* =========================================================================
 * 1. じゅんばんマスター（order） — ( )→×÷→＋－ の計算じゅんじょ
 * ========================================================================= */
export type OrderLevel = 'order-first' | 'order-2step' | 'order-3step';
export const ORDER_LEVELS: { id: OrderLevel; label: string; desc: string }[] = [
  { id: 'order-first', label: 'はじめは どこ？', desc: 'いちばん はじめに 計算する ところを えらぼう' },
  { id: 'order-2step', label: '2だんかい', desc: '( )や ×÷ を 見つけて 先に 計算しよう' },
  { id: 'order-3step', label: '3だんかい', desc: '3つの けいさんを じゅんばんよく すすめよう' },
];

export interface OrderCheckpoint { value: number; hint: string; }
export interface OrderProblem {
  level: OrderLevel;
  expr: string;
  checkpoints: OrderCheckpoint[]; // 最後の要素が さいしゅうの答え
  explain: string;
}

const RANK: Record<Op, number> = { '×': 2, '÷': 2, '+': 1, '-': 1 };
const PAREN_HINT = '( )の中を さいしょに 計算するよ。';
const MULDIV_HINT = 'かけ算・わり算は、たし算・ひき算より 先に 計算するよ。';
/** ×と÷だけ／＋と－だけが ならぶ式は、左から じゅんに計算する（×を÷より先にしない） */
const LEFT_HINT = '同じ なかまの 計算が ならんだら、左から じゅんに 計算するよ。';

/** op で結んだとき、非負整数・わり切れる、を満たす [x, y] を1組つくる。 */
function genPair(op: Op): [number, number] {
  if (op === '-') { const y = rnd(2, 12); return [y + rnd(1, 15), y]; }
  if (op === '÷') { const y = rnd(2, 6); return [y * rnd(2, 6), y]; }
  return [rnd(2, 12), rnd(2, 12)];
}

/**
 * a op1 b op2 c の3項式を1つつくる（必要ならどちらかの組に( )をつける）。
 * 「先に計算される組」を先に決め、そこから安全な数値を生成することで、
 * どのじゅんばんで計算しても 負の数や わりきれない数が出ないようにする。
 */
function genTriple(): { a: number; op1: Op; b: number; op2: Op; c: number; paren: 'none' | 'left' | 'right' } {
  for (let i = 0; i < 300; i++) {
    const op1 = pick<Op>(['+', '-', '×', '÷']);
    const op2 = pick<Op>(['+', '-', '×', '÷']);
    // 同じ順位（＋－どうし／×÷どうし）が( )なしで ならぶ式も出す。
    // 「24÷4×2 を ×から先に計算してしまう」誤りは、この形でしか練習できない。
    const paren: 'none' | 'left' | 'right' = pick<'none' | 'left' | 'right'>(['none', 'none', 'left', 'right']);
    const firstIsLeft = paren === 'left' ? true : paren === 'right' ? false : RANK[op1] >= RANK[op2];

    let a: number, b: number, c: number;
    if (firstIsLeft) {
      [a, b] = genPair(op1);
      const leftVal = compute(a, op1, b);
      if (op2 === '÷') {
        const divisors = [2, 3, 4, 5, 6].filter((d) => leftVal % d === 0);
        if (divisors.length === 0) continue;
        c = pick(divisors);
      } else if (op2 === '-') {
        if (leftVal < 2) continue;
        c = rnd(1, leftVal - 1);
      } else {
        c = rnd(2, 12);
      }
    } else {
      [b, c] = genPair(op2);
      const rightVal = compute(b, op2, c);
      if (op1 === '÷') a = rightVal * rnd(2, 6);
      else if (op1 === '-') a = rightVal + rnd(1, 15);
      else a = rnd(2, 15);
    }
    return { a, op1, b, op2, c, paren };
  }
  // フォールバック（安全な固定値）
  return { a: 3, op1: '+', b: 4, op2: '×', c: 5, paren: 'none' };
}

function buildOrder2(level: OrderLevel): OrderProblem {
  const { a, op1, b, op2, c, paren } = genTriple();
  const leftVal = compute(a, op1, b);
  const rightVal = compute(b, op2, c);
  const rank1 = RANK[op1], rank2 = RANK[op2];
  const firstIsLeft = paren === 'left' ? true : paren === 'right' ? false : rank1 >= rank2;
  const hint = paren !== 'none' ? PAREN_HINT : rank1 === rank2 ? LEFT_HINT : MULDIV_HINT;

  let expr: string;
  if (paren === 'left') expr = `(${fmt(a, op1, b)})${opDisplay(op2)}${c}`;
  else if (paren === 'right') expr = `${a}${opDisplay(op1)}(${fmt(b, op2, c)})`;
  else expr = `${fmt(a, op1, b)}${opDisplay(op2)}${c}`;

  const firstValue = firstIsLeft ? leftVal : rightVal;
  const finalValue = firstIsLeft ? compute(leftVal, op2, c) : compute(a, op1, rightVal);

  return {
    level,
    expr,
    checkpoints: [
      { value: firstValue, hint },
      { value: finalValue, hint: 'のこりの 計算を すると…？' },
    ],
    explain: `${expr} ＝ ${finalValue}`,
  };
}

type Order3Shape = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
function buildOrder3(level: OrderLevel): OrderProblem {
  const shape = pick<Order3Shape>(['A', 'B', 'C', 'D', 'E', 'E', 'F', 'F', 'G', 'G']);
  const mulOp: Op = pick(['×', '÷']);
  const addOp1: Op = pick(['+', '-']);
  const addOp2: Op = pick(['+', '-']);

  if (shape === 'A') {
    // a ○ b ×÷ c ○ d  （先に かけ算・わり算）
    let b: number, c: number;
    if (mulOp === '÷') { c = pick([2, 3, 4]); b = c * rnd(2, 7); } else { b = rnd(2, 9); c = rnd(2, 8); }
    const bc = compute(b, mulOp, c);
    const a = addOp1 === '-' ? bc + rnd(3, 20) : rnd(3, 20);
    const step2 = compute(a, addOp1, bc);
    const d = addOp2 === '-' ? rnd(1, Math.max(1, step2 - 1)) : rnd(2, 15);
    const final = compute(step2, addOp2, d);
    const expr = `${a}${opDisplay(addOp1)}${fmt(b, mulOp, c)}${opDisplay(addOp2)}${d}`;
    return {
      level, expr,
      checkpoints: [
        { value: bc, hint: MULDIV_HINT },
        { value: step2, hint: '左から じゅんばんに 計算しよう。' },
        { value: final, hint: 'さいごまで 計算しよう。' },
      ],
      explain: `${expr} ＝ ${final}`,
    };
  }
  if (shape === 'B') {
    // (a ± b) × c ○ d （わり算は 別の形で扱うので、ここは かけ算に固定して確実に割り切れる数だけにする）
    const a = rnd(4, 20);
    const b = addOp1 === '-' ? rnd(1, a - 1) : rnd(2, 12);
    const ab = compute(a, addOp1, b);
    const c = rnd(2, 7);
    const abc = ab * c;
    const d = addOp2 === '-' ? rnd(1, Math.max(1, abc - 1)) : rnd(2, 20);
    const final = compute(abc, addOp2, d);
    const expr = `(${fmt(a, addOp1, b)})×${c}${opDisplay(addOp2)}${d}`;
    return {
      level, expr,
      checkpoints: [
        { value: ab, hint: PAREN_HINT },
        { value: abc, hint: 'つぎに かけ算・わり算を しよう。' },
        { value: final, hint: 'さいごまで 計算しよう。' },
      ],
      explain: `${expr} ＝ ${final}`,
    };
  }
  if (shape === 'C') {
    // a ○ b ○ c ×÷ d  （かけ算・わり算は うしろにあっても 先）
    let c: number, d: number;
    if (mulOp === '÷') { d = pick([2, 3, 4]); c = d * rnd(2, 7); } else { c = rnd(2, 9); d = rnd(2, 8); }
    const cd = compute(c, mulOp, d);
    const a = rnd(4, 20);
    const b = addOp1 === '-' ? rnd(1, a - 1) : rnd(2, 12);
    const ab = compute(a, addOp1, b);
    const final = compute(ab, addOp2, cd);
    if (addOp2 === '-' && ab - cd < 0) return buildOrder3(level); // 安全のため作り直す
    const expr = `${fmt(a, addOp1, b)}${opDisplay(addOp2)}${fmt(c, mulOp, d)}`;
    return {
      level, expr,
      checkpoints: [
        { value: cd, hint: MULDIV_HINT + '（うしろに あっても 先だよ）' },
        { value: ab, hint: '左の たし算・ひき算も 計算しておこう。' },
        { value: final, hint: '2つの けっかを あわせよう。' },
      ],
      explain: `${expr} ＝ ${final}`,
    };
  }
  if (shape === 'E') {
    // a ×÷ b ○ c ×÷ d （80÷4＋15×2 型）。かけ算・わり算が2か所あり、どちらも先に計算する
    const mulOp2: Op = pick(['×', '÷']);
    let a: number, b: number, c: number, d: number;
    if (mulOp === '÷') { b = rnd(2, 6); a = b * rnd(2, 9); } else { a = rnd(2, 9); b = rnd(2, 9); }
    if (mulOp2 === '÷') { d = rnd(2, 6); c = d * rnd(2, 9); } else { c = rnd(2, 9); d = rnd(2, 9); }
    const ab = compute(a, mulOp, b);
    const cd = compute(c, mulOp2, d);
    if (addOp1 === '-' && ab - cd < 0) return buildOrder3(level); // ひけない組は作り直す
    const final = compute(ab, addOp1, cd);
    const expr = `${fmt(a, mulOp, b)}${opDisplay(addOp1)}${fmt(c, mulOp2, d)}`;
    return {
      level, expr,
      checkpoints: [
        { value: ab, hint: MULDIV_HINT },
        { value: cd, hint: 'もう一つの かけ算・わり算も、先に 計算しよう。' },
        { value: final, hint: 'さいごに たし算・ひき算を しよう。' },
      ],
      explain: `${expr} ＝ ${final}`,
    };
  }
  if (shape === 'F') {
    // (a × b ○ c) ÷ d （(3×9－6)÷3 型）。( )の中が2つの計算になっている
    const a = rnd(2, 9);
    const b = rnd(2, 9);
    const ab = a * b;
    const c = addOp1 === '-' ? rnd(1, ab - 1) : rnd(2, 20);
    const abc = compute(ab, addOp1, c);
    const divisors = [2, 3, 4, 5, 6].filter((x) => abc % x === 0 && abc / x >= 2);
    if (divisors.length === 0) return buildOrder3(level);
    const d = pick(divisors);
    const final = abc / d;
    const expr = `(${fmt(a, '×', b)}${opDisplay(addOp1)}${c})÷${d}`;
    return {
      level, expr,
      checkpoints: [
        { value: ab, hint: PAREN_HINT + '( )の 中でも かけ算が 先だよ。' },
        { value: abc, hint: '( )の 中を さいごまで 計算しよう。' },
        { value: final, hint: '( )の 答えを わろう。' },
      ],
      explain: `${expr} ＝ ${final}`,
    };
  }
  if (shape === 'G') {
    // a × (b ○ c ÷ d) （3×(9－6÷3) 型）。( )の中に わり算とひき算がある
    const d = rnd(2, 5);
    const c = d * rnd(2, 6);
    const cd = c / d;
    const b = addOp1 === '-' ? cd + rnd(1, 12) : rnd(2, 12);
    const bcd = compute(b, addOp1, cd);
    const a = rnd(2, 9);
    const final = a * bcd;
    const expr = `${a}×(${b}${opDisplay(addOp1)}${fmt(c, '÷', d)})`;
    return {
      level, expr,
      checkpoints: [
        { value: cd, hint: PAREN_HINT + '( )の 中でも わり算が 先だよ。' },
        { value: bcd, hint: '( )の 中を さいごまで 計算しよう。' },
        { value: final, hint: '( )の 答えに かけよう。' },
      ],
      explain: `${expr} ＝ ${final}`,
    };
  }
  // shape === 'D': a ×÷ (b ○ c) － d
  const b = rnd(2, 12);
  const c = addOp1 === '-' ? rnd(1, b - 1) : rnd(2, 12);
  const bc = compute(b, addOp1, c);
  const a = mulOp === '÷' ? bc * rnd(2, 6) : rnd(2, 8);
  const abc = compute(a, mulOp, bc || 1);
  const d = rnd(1, Math.max(1, abc - 1));
  const final = abc - d;
  const expr = `${a}${opDisplay(mulOp)}(${fmt(b, addOp1, c)})－${d}`;
  return {
    level, expr,
    checkpoints: [
      { value: bc, hint: PAREN_HINT },
      { value: abc, hint: 'つぎに かけ算・わり算を しよう。' },
      { value: final, hint: 'さいごに ひき算を しよう。' },
    ],
    explain: `${expr} ＝ ${final}`,
  };
}

export function generateOrder(level: OrderLevel): OrderProblem {
  if (level === 'order-first') return generateFirst().source;
  return level === 'order-2step' ? buildOrder2(level) : buildOrder3(level);
}

/**
 * 「いちばん はじめに 計算する ところは どこですか」（紙のテストの大問2）。
 * 式の演算子に左から あ・い・う と名前をつけ、最初に計算してよい演算子が1つだけの式を出す。
 * 判定は じゅんばんマスターと同じ orderSteps（( )→×÷→＋－、同じなかまは左から）。
 */
export interface FirstProblem {
  level: 'order-first';
  expr: string;
  tokens: string[];
  /** 演算子のトークン位置（左から あ・い・う） */
  opAt: number[];
  /** opAt の何番目が正解か */
  correct: number;
  /** 正解の理由（( )／×÷／左から） */
  reason: string;
  source: OrderProblem;
}

export const FIRST_LABELS = ['あ', 'い', 'う', 'え'] as const;
const PAREN_FIRST = '( )の中を いちばん はじめに 計算するよ。';
const MULDIV_FIRST = 'かけ算・わり算は、たし算・ひき算より 先に 計算するよ。';
const PAREN_MULDIV_FIRST = '( )の中を先に計算するよ。( )の中でも、かけ算・わり算は たし算・ひき算より 先だよ。';
const LEFT_FIRST = '同じ なかまの 計算が ならんだら、左から じゅんに 計算するよ。';

export function generateFirst(): FirstProblem {
  for (let i = 0; i < 500; i++) {
    const src = Math.random() < 0.35 ? buildOrder2('order-first') : buildOrder3('order-first');
    const tokens = tokenize(src.expr);
    const opAt = tokens.map((t, k) => (isOp(t) ? k : -1)).filter((k) => k >= 0);
    if (opAt.length < 2) continue;
    const valid = validPicks(tokens);
    if (valid.length !== 1) continue; // 答えが1つに決まる式だけ
    const at = valid[0]!;
    const correct = opAt.indexOf(at);
    // 正解がいつも「あ」にならないように、左はしが正解の式は半分すてる
    if (correct === 0 && Math.random() < 0.5) continue;
    const before = tokens.slice(0, at);
    const inParen = before.filter((t) => t === '(').length > before.filter((t) => t === ')').length;
    const op = tokens[at]!;
    const hasAddSub = opAt.some((k) => tokens[k] === '＋' || tokens[k] === '－');
    const parenHasAddSub = inParen && opAt.some((k) => k !== at && (tokens[k] === '＋' || tokens[k] === '－')
      && tokens.slice(0, k).filter((t) => t === '(').length > tokens.slice(0, k).filter((t) => t === ')').length);
    const reason = inParen
      ? ((op === '×' || op === '÷') && parenHasAddSub ? PAREN_MULDIV_FIRST : PAREN_FIRST)
      : (op === '×' || op === '÷') && hasAddSub ? MULDIV_FIRST : LEFT_FIRST;
    return { level: 'order-first', expr: src.expr, tokens, opAt, correct, reason, source: src };
  }
  const tokens = tokenize('8×(4＋2)');
  return { level: 'order-first', expr: '8×(4＋2)', tokens, opAt: [1, 4], correct: 1, reason: PAREN_FIRST, source: buildOrder2('order-first') };
}

/* =========================================================================
 * 2. しきに あらわそう（express） — 2だんかいの場面を( )を使って1つの式に
 * ========================================================================= */
export type ExpressLevel = 'express-money' | 'express-mixed' | 'express-divide';
export const EXPRESS_LEVELS: { id: ExpressLevel; label: string; desc: string }[] = [
  { id: 'express-money', label: 'おかいもの', desc: 'おつり・組で 買う・2しゅるい 買う を 1つの しきに' },
  { id: 'express-mixed', label: 'くばりもの・切り取り', desc: 'かけ算と たし算・ひき算を 1つの しきに' },
  { id: 'express-divide', label: 'まとめて わる', desc: '( )で まとめてから わる しきに' },
];

export interface ExpressProblem {
  level: ExpressLevel;
  text: string;
  /** 4択で出すときの選択肢（ボス戦など、すばやく答える場面用に残している） */
  choices: string[];
  correctIndex: number;
  answerValue: number;
  /** 答えの単位（円・こ・箱・組） */
  unit: string;
  /**
   * 式を組み立てるときに使う数のカード（場面に出てくる数。どれも1回ずつ使う）。
   * ＋－×÷と( )のカードは画面が いつも出す。
   * 紙のテストは「式と答え」を白紙に書く。選ぶ（再認）より組み立てる（再生）ほうが定着する。
   */
  cards: string[];
  /** 正解とみなす式（カードを左から並べた文字列。たし算・かけ算の入れかえは どちらも正解） */
  accept: string[];
  explain: string;
}

/** カードを並べた式を、判定用の1本の文字列にする */
export function joinExpr(tokens: readonly string[]): string {
  return tokens.join('');
}

/**
 * 組み立てた式の値を計算する（( )→×÷→＋－、同じなかまは左から）。
 * 式として読めないときは null。正解ではないが答えは合っている式（( )なしで ひき算を2回 など）を見分けるのに使う。
 */
export function evalExpr(tokens: readonly string[]): number | null {
  let i = 0;
  const peek = () => tokens[i];
  const num = (): number | null => {
    const t = peek();
    if (t === '(') {
      i++;
      const v = add();
      if (v === null || peek() !== ')') return null;
      i++;
      return v;
    }
    if (t !== undefined && /^\d+$/.test(t)) { i++; return Number(t); }
    return null;
  };
  const mul = (): number | null => {
    let v = num();
    while (v !== null && (peek() === '×' || peek() === '÷')) {
      const op = tokens[i++];
      const r = num();
      if (r === null) return null;
      v = op === '×' ? v * r : v / r;
    }
    return v;
  };
  const add = (): number | null => {
    let v = mul();
    while (v !== null && (peek() === '＋' || peek() === '－')) {
      const op = tokens[i++];
      const r = mul();
      if (r === null) return null;
      v = op === '＋' ? v + r : v - r;
    }
    return v;
  };
  const v = add();
  return v !== null && i === tokens.length ? v : null;
}

const MONEY_ITEMS: { a: string; b: string }[] = [
  { a: 'ノート', b: 'けしゴム' },
  { a: 'えんぴつ', b: 'クレヨン' },
  { a: 'パン', b: 'ジュース' },
  { a: 'ノート', b: 'ふでばこ' },
  { a: 'シール', b: 'あめ' },
  { a: '色紙', b: 'のり' },
];

function buildExpressMoney(level: ExpressLevel): ExpressProblem {
  const item = pick(MONEY_ITEMS);
  const priceA = rnd(3, 9) * 10;
  let priceB = rnd(2, 8) * 10;
  while (priceB === priceA) priceB = rnd(2, 8) * 10;
  const remainder = rnd(2, 8) * 10;
  const total = priceA + priceB + remainder;
  const correctExpr = `${total}－(${priceA}＋${priceB})`;
  const options = shuffle([
    correctExpr,
    `${total}－${priceA}＋${priceB}`,
    `(${total}－${priceA})＋${priceB}`,
    `${total}＋(${priceA}＋${priceB})`,
  ]);
  return {
    level,
    text: `${total}円 もっています。${item.a}(${priceA}円)と ${item.b}(${priceB}円)を 買いました。のこりは 何円ですか。( )を つかって 1つの しきに あらわしましょう。`,
    choices: options,
    correctIndex: options.indexOf(correctExpr),
    answerValue: remainder,
    unit: '円',
    cards: shuffle([String(total), String(priceA), String(priceB)]),
    accept: [`${total}－(${priceA}＋${priceB})`, `${total}－(${priceB}＋${priceA})`],
    explain: `${correctExpr} ＝ ${remainder}円。買った 2つを ( )で まとめてから ひくよ。`,
  };
}

const MIXED_ITEMS = ['あめ', 'クッキー', 'おはじき', 'ビー玉', 'カード'];
function buildExpressMixed(level: ExpressLevel): ExpressProblem {
  const item = pick(MIXED_ITEMS);
  // 3つの数は別々にする。同じ数があると、まちがいの式（例 3＋3×3）が正しい式と同じになり、
  // カードもどれがどの数か区別できない
  let each = 0, boxes = 0, extra = 0;
  do { each = rnd(3, 8); boxes = rnd(2, 6); extra = rnd(2, 9); }
  while (each === boxes || each === extra || boxes === extra);
  const correctExpr = `${each}×${boxes}＋${extra}`;
  const answer = each * boxes + extra;
  const options = shuffle([
    correctExpr,
    `${each}＋${boxes}×${extra}`,
    `(${each}＋${boxes})×${extra}`,
    `${each}×(${boxes}＋${extra})`,
  ]);
  return {
    level,
    text: `1ふくろに ${item}が ${each}こ 入っています。${boxes}ふくろと、バラで ${extra}こ あります。あわせて 何こ ありますか。1つの しきに あらわしましょう。`,
    choices: options,
    correctIndex: options.indexOf(correctExpr),
    answerValue: answer,
    unit: 'こ',
    cards: shuffle([String(each), String(boxes), String(extra)]),
    // ( )を付けても まちがいではないので正解にする（いらないことは 解説で伝える）
    accept: [
      `${each}×${boxes}＋${extra}`, `${extra}＋${each}×${boxes}`,
      `(${each}×${boxes})＋${extra}`, `${extra}＋(${each}×${boxes})`,
    ],
    explain: `${correctExpr} ＝ ${answer}こ。かけ算を 先に 計算するから、ここは ( )が いらないね。`,
  };
}

const BOX_ITEMS = ['ボール', 'たまご', 'ミニトマト', 'チョコ', 'ビー玉'];
const PAIR_ITEMS: { a: string; b: string }[] = [
  { a: 'パン', b: 'ジュース' },
  { a: 'えんぴつ', b: 'けしゴム' },
  { a: 'おにぎり', b: 'お茶' },
  { a: 'ノート', b: 'したじき' },
  { a: 'シール', b: 'カード' },
];

/** 「まとめてから わる」場面。( )で1つ分をまとめてから割る式に表す（48÷(2×4) 型） */
function buildExpressDivide(level: ExpressLevel): ExpressProblem {
  if (Math.random() < 0.5) {
    // 箱づめ: たて r こ × 横 c こ で 1 箱ぶん
    const item = pick(BOX_ITEMS);
    const r = rnd(2, 5);
    let c = rnd(2, 6);
    while (c === r) c = rnd(2, 6);
    const boxes = rnd(3, 9);
    const total = r * c * boxes;
    const correctExpr = `${total}÷(${r}×${c})`;
    const options = shuffle([
      correctExpr,
      `${total}÷${r}×${c}`,
      `${total}÷${r}＋${c}`,
      `(${r}×${c})÷${total}`,
    ]);
    return {
      level,
      text: `1箱に、${item}を たてに ${r}こ、横に ${c}こ ならべて 入れます。${item}が ${total}こ では、箱は 何こ いりますか。( )を つかって 1つの しきに あらわしましょう。`,
      choices: options,
      correctIndex: options.indexOf(correctExpr),
      answerValue: boxes,
      unit: '箱',
      cards: shuffle([String(total), String(r), String(c)]),
      accept: [`${total}÷(${r}×${c})`, `${total}÷(${c}×${r})`],
      explain: `${correctExpr} ＝ ${boxes}箱。1箱ぶんの ${r}×${c}＝${r * c}こ を ( )で まとめてから わるよ。`,
    };
  }
  // 組で買う: a円 と b円 を 組にして買う
  const pair = pick(PAIR_ITEMS);
  const a = rnd(6, 14) * 10;
  let b = rnd(4, 12) * 10;
  while (b === a) b = rnd(4, 12) * 10;
  const sets = rnd(3, 8);
  const money = (a + b) * sets;
  const correctExpr = `${money}÷(${a}＋${b})`;
  const options = shuffle([
    correctExpr,
    `${money}÷${a}＋${b}`,
    `${money}－(${a}＋${b})`,
    `${money}÷${a}÷${b}`,
  ]);
  return {
    level,
    text: `1こ ${a}円の ${pair.a}と 1本 ${b}円の ${pair.b}を 組にして 買います。${money}円 では、何組 買えますか。( )を つかって 1つの しきに あらわしましょう。`,
    choices: options,
    correctIndex: options.indexOf(correctExpr),
    answerValue: sets,
    unit: '組',
    cards: shuffle([String(money), String(a), String(b)]),
    accept: [`${money}÷(${a}＋${b})`, `${money}÷(${b}＋${a})`],
    explain: `${correctExpr} ＝ ${sets}組。1組ぶんの ${a}＋${b}＝${a + b}円 を ( )で まとめてから わるよ。`,
  };
}

/**
 * 紙のテスト（新学社 4年「計算のきまり」裏面）に出る場面。
 *   sets … 組にして□組買った代金      (240＋160)×3
 *   two  … 2種類を いくつずつ買った代金 80×4＋190×3
 *   cut  … テープから切り取った残り     90－7×5
 */
export type ExpressForm = 'change' | 'sets' | 'two' | 'bag' | 'cut' | 'divide';

/** a×b の両方の並びと、( )でつつんだ形 */
const prodForms = (a: number, b: number) => [`${a}×${b}`, `${b}×${a}`];

function buildExpressSets(level: ExpressLevel): ExpressProblem {
  const pair = pick(PAIR_ITEMS);
  const a = rnd(10, 30) * 10;
  let b = rnd(6, 20) * 10;
  while (b === a) b = rnd(6, 20) * 10;
  let sets = rnd(2, 6);
  while (sets * 10 === a || sets * 10 === b) sets = rnd(2, 6);
  const correctExpr = `(${a}＋${b})×${sets}`;
  const answer = (a + b) * sets;
  const options = shuffle([correctExpr, `${a}＋${b}×${sets}`, `${a}×${sets}＋${b}`, `(${a}×${b})＋${sets}`]);
  return {
    level,
    text: `1こ ${a}円の ${pair.a}と、1こ ${b}円の ${pair.b}を 組にして 買います。${sets}組 買うと、代金は 何円ですか。( )を つかって 1つの しきに あらわしましょう。`,
    choices: options,
    correctIndex: options.indexOf(correctExpr),
    answerValue: answer,
    unit: '円',
    cards: shuffle([String(a), String(b), String(sets)]),
    accept: [`(${a}＋${b})×${sets}`, `(${b}＋${a})×${sets}`, `${sets}×(${a}＋${b})`, `${sets}×(${b}＋${a})`],
    explain: `${correctExpr} ＝ ${answer}円。1組の 代金 ${a}＋${b}＝${a + b}円 を ( )で まとめてから、${sets}倍するよ。`,
  };
}

function buildExpressTwo(level: ExpressLevel): ExpressProblem {
  const pair = pick(PAIR_ITEMS);
  const a = rnd(5, 15) * 10;
  let b = rnd(10, 25) * 10;
  while (b === a) b = rnd(10, 25) * 10;
  const m = rnd(2, 6);
  let n = rnd(2, 6);
  while (n === m) n = rnd(2, 6);
  const correctExpr = `${a}×${m}＋${b}×${n}`;
  const answer = a * m + b * n;
  const options = shuffle([correctExpr, `(${a}＋${b})×${m + n}`, `${a}×${m}×${b}×${n}`, `${a}＋${m}×${b}＋${n}`]);
  const accept: string[] = [];
  for (const x of prodForms(a, m)) for (const y of prodForms(b, n)) {
    accept.push(`${x}＋${y}`, `${y}＋${x}`, `(${x})＋(${y})`, `(${y})＋(${x})`);
  }
  return {
    level,
    text: `1こ ${a}円の ${pair.a}を ${m}こと、1こ ${b}円の ${pair.b}を ${n}こ 買いました。代金は 何円ですか。1つの しきに あらわしましょう。`,
    choices: options,
    correctIndex: options.indexOf(correctExpr),
    answerValue: answer,
    unit: '円',
    cards: shuffle([String(a), String(m), String(b), String(n)]),
    accept,
    explain: `${correctExpr} ＝ ${answer}円。かけ算を 先に 計算するから、( )は いらないね。`,
  };
}

const CUT_ITEMS = ['テープ', 'リボン', 'ひも'];
function buildExpressCut(level: ExpressLevel): ExpressProblem {
  const item = pick(CUT_ITEMS);
  let each = 0, k = 0, rest = 0;
  do { each = rnd(4, 12); k = rnd(3, 7); rest = rnd(3, 30); }
  while (each === k || each * k + rest > 200 || [each, k].includes(each * k + rest));
  const total = each * k + rest;
  const correctExpr = `${total}－${each}×${k}`;
  const options = shuffle([correctExpr, `(${total}－${each})×${k}`, `${total}－${each}－${k}`, `${total}÷${each}×${k}`]);
  return {
    level,
    text: `${total}cmの ${item}から、${each}cmの ${item}を ${k}本 切り取ります。${item}は 何cm のこりますか。1つの しきに あらわしましょう。`,
    choices: options,
    correctIndex: options.indexOf(correctExpr),
    answerValue: rest,
    unit: 'cm',
    cards: shuffle([String(total), String(each), String(k)]),
    accept: prodForms(each, k).flatMap((x) => [`${total}－${x}`, `${total}－(${x})`]),
    explain: `${correctExpr} ＝ ${rest}cm。切り取った 長さ ${each}×${k} を 先に 計算するから、( )は いらないね。`,
  };
}

export function generateExpress(level: ExpressLevel, form?: ExpressForm): ExpressProblem {
  const f: ExpressForm = form ?? (level === 'express-money' ? pick<ExpressForm>(['change', 'change', 'sets', 'two'])
    : level === 'express-mixed' ? pick<ExpressForm>(['bag', 'cut'])
    : 'divide');
  switch (f) {
    case 'change': return buildExpressMoney(level);
    case 'sets': return buildExpressSets(level);
    case 'two': return buildExpressTwo(level);
    case 'bag': return buildExpressMixed(level);
    case 'cut': return buildExpressCut(level);
    default: return buildExpressDivide(level);
  }
}

/* =========================================================================
 * 3. くふう けいさん（kufuu） — 分配・交換・結合法則で らくに計算
 * ========================================================================= */
export type KufuuLevel = 'kufuu-distribute' | 'kufuu-assoc' | 'kufuu-decimal' | 'kufuu-blank';
export const KUFUU_LEVELS: { id: KufuuLevel; label: string; desc: string }[] = [
  { id: 'kufuu-distribute', label: '分配法則', desc: '(○＋△)×□ ＝ ○×□＋△×□' },
  { id: 'kufuu-assoc', label: '交換・結合法則', desc: 'じゅんばんを 入れかえて らくに 計算' },
  { id: 'kufuu-decimal', label: '小数でも つかえる', desc: '小数でも 同じ きまりが つかえるかな' },
  { id: 'kufuu-blank', label: 'きまりの □うめ', desc: '7×14＝□×7 の □に 入る数は？' },
];

export type KufuuProblem =
  | { level: KufuuLevel; kind: 'transform'; text: string; choices: string[]; correctIndex: number; explain: string }
  | { level: KufuuLevel; kind: 'blank'; exprLeft: string; exprRight: string; blankAnswer: number; explain: string }
  | { level: KufuuLevel; kind: 'compute'; text: string; answer: number; allowDecimal: boolean; explain: string };

function buildDistribute(level: KufuuLevel): KufuuProblem {
  const kind = pick<'transform' | 'compute'>(['transform', 'transform', 'compute']);
  const useMinus = Math.random() < 0.4;
  const a = rnd(4, 30);
  const b = rnd(2, 15);
  const c = rnd(2, 9);
  if (kind === 'transform') {
    // かける数が前に来る形（□×(△＋○)）と後ろに来る形（(□＋△)×○）の両方を出す。
    // 指導要領は分配法則を4つの形すべてで示している。
    const frontMul = Math.random() < 0.5;
    const sign = useMinus ? '－' : '＋';
    const flip = useMinus ? '＋' : '－';
    const base = frontMul ? `${c}×(${a}${sign}${b})` : `(${a}${sign}${b})×${c}`;
    const correct = frontMul ? `${c}×${a}${sign}${c}×${b}` : `${a}×${c}${sign}${b}×${c}`;
    const options = shuffle([
      correct,
      frontMul ? `${c}×${a}${sign}${b}` : `${a}×${c}${sign}${b}`, // 片方だけ展開（典型誤答）
      frontMul ? `${a}${sign}${c}×${b}` : `${a}${sign}${b}×${c}`, // もう片方だけ展開
      frontMul ? `${c}×${a}${flip}${c}×${b}` : `${a}×${c}${flip}${b}×${c}`, // 符号ミス
    ]);
    return {
      level, kind: 'transform',
      text: `${base} を、分配法則を つかって かっこを はずした しきに 直すと？`,
      choices: options,
      correctIndex: options.indexOf(correct),
      explain: `${base} ＝ ${correct}。( )の 中の 2つの数に、どちらにも ×${c} するよ。`,
    };
  }
  // compute（100を基準に見る形）: 97×14 ＝ (100－3)×14 のような2けた×2けた
  if (Math.random() < 0.4) {
    const diff = rnd(1, 4);
    const near = 100 - diff;
    const c2 = rnd(11, 19);
    const clever = `(100－${diff})×${c2}`;
    const answer = near * c2;
    return {
      level, kind: 'compute',
      text: `${near}×${c2} を くふうして 計算しよう。${clever} と 考えると らくだよ。`,
      answer, allowDecimal: false,
      explain: `${clever} ＝ 100×${c2}－${diff}×${c2} ＝ ${100 * c2}－${diff * c2} ＝ ${answer}`,
    };
  }
  // compute: くふうした形をそのまま計算させる（98×7＝(100－2)×7 のような形）
  const base10 = pick([20, 30, 40, 50, 60, 70, 80, 90]);
  const diff = rnd(1, 4);
  const near = useMinus ? base10 - diff : base10 + diff;
  const c2 = rnd(3, 9);
  const clever = useMinus ? `(${base10}－${diff})×${c2}` : `(${base10}＋${diff})×${c2}`;
  const answer = near * c2;
  return {
    level, kind: 'compute',
    text: `${near}×${c2} を くふうして 計算しよう。${clever} と 考えると らくだよ。`,
    answer, allowDecimal: false,
    explain: `${clever} ＝ ${base10}×${c2}${useMinus ? '－' : '＋'}${diff}×${c2} ＝ ${answer}`,
  };
}

function buildAssoc(level: KufuuLevel): KufuuProblem {
  const kind = pick<'transform' | 'blank' | 'compute'>(['transform', 'blank', 'compute']);
  const isMul = Math.random() < 0.6;
  if (kind === 'transform') {
    // 3つの数のかけ算／たし算を、らくな組み合わせに並べかえる（3通りの組み合わせから選ぶ）
    const easy = pick([2, 4, 5, 20, 25, 50]);
    const partner = isMul ? pick([2, 4, 5, 20, 25, 50].filter((x) => x !== easy)) : rnd(3, 40);
    const third = isMul ? rnd(2, 19) : rnd(3, 40);
    const nums = shuffle([easy, partner, third]);
    const op = isMul ? '×' : '＋';
    const base = nums.join(op);
    // 3つの数から2つを選んで先に組む、3通りの組み合わせを列挙する
    const idxPairs: [number, number, number][] = [[0, 1, 2], [0, 2, 1], [1, 2, 0]];
    const options = idxPairs.map(([i, j, k]) => `(${nums[i]}${op}${nums[j]})${op}${nums[k]}`);
    // 重複表記（数字の重なり）が出たら作り直す
    if (new Set(options).size < 3) return buildAssoc(level);
    const correctPair = idxPairs.find(([i, j]) => (nums[i] === easy && nums[j] === partner) || (nums[i] === partner && nums[j] === easy))!;
    const correct = `(${nums[correctPair[0]]}${op}${nums[correctPair[1]]})${op}${nums[correctPair[2]]}`;
    const finalOptions = shuffle(options);
    return {
      level, kind: 'transform',
      text: `${base} を くふうして 計算するなら、どの 組み合わせが いちばん らく？`,
      choices: finalOptions,
      correctIndex: finalOptions.indexOf(correct),
      explain: `${correct} が らく。${easy}${op}${partner} が キリのいい 数に なるね。`,
    };
  }
  if (kind === 'blank') {
    const op = isMul ? '×' : '＋';
    const a = isMul ? pick([2, 4, 5]) : rnd(3, 20);
    const b = isMul ? rnd(2, 12) : rnd(3, 20);
    const c = isMul ? pick([2, 5, 10]) : rnd(3, 20);
    // (a op b) op c ＝ a op (□ op c) の □ を求める（結合法則）
    return {
      level, kind: 'blank',
      exprLeft: `(${a}${op}${b})${op}${c}`,
      exprRight: `${a}${op}(□${op}${c})`,
      blankAnswer: b,
      explain: `(${a}${op}${b})${op}${c} ＝ ${a}${op}(${b}${op}${c})。組み合わせを 変えても 答えは 同じだよ。`,
    };
  }
  // compute（2つの数の積を分けて、キリのよい100をつくる）: 32×25 ＝ (8×4)×25 ＝ 8×100
  if (isMul && Math.random() < 0.45) {
    const target = pick([25, 50, 20]);
    const mate = target === 25 ? 4 : target === 50 ? 2 : 5;
    const k = rnd(2, 9);
    const left = mate * k;
    return {
      level, kind: 'compute',
      text: `${left}×${target} を くふうして 計算しよう。（${left}＝${k}×${mate} と 見て、${mate}×${target}＝${mate * target} を 先に 計算すると らくだよ）`,
      answer: left * target, allowDecimal: false,
      explain: `${left}×${target} ＝ ${k}×(${mate}×${target}) ＝ ${k}×${mate * target} ＝ ${left * target}`,
    };
  }
  // compute
  const a = pick([4, 8, 25, 50, 20]);
  const b = rnd(2, 9);
  const c = a === 25 ? 4 : a === 50 ? 2 : a === 20 ? 5 : rnd(2, 9);
  const op: Op = isMul ? '×' : '+';
  const nums = shuffle([a, b, c]);
  const answer = isMul ? a * b * c : a + b + c;
  return {
    level, kind: 'compute',
    text: `${nums[0]}${opDisplay(op)}${nums[1]}${opDisplay(op)}${nums[2]} を くふうして 計算しよう。（${a}${opDisplay(op)}${c} を さきに 計算すると らくだよ）`,
    answer, allowDecimal: false,
    explain: `${a}${opDisplay(op)}${c} ＝ ${isMul ? a * c : a + c} を さきに 計算してから、${b}を ${isMul ? 'かける' : 'たす'}と らくだね。`,
  };
}

function buildDecimalKufuu(level: KufuuLevel): KufuuProblem {
  // 0.1刻みの小数3つ。となり合わせよりキリよく組める順で計算させる
  const pairSum = pick([1.0, 2.0, 3.0, 5.0, 4.0]);
  const x = Math.round((Math.random() * (pairSum - 0.2) + 0.1) * 10) / 10;
  const y = Math.round((pairSum - x) * 10) / 10;
  const z = rnd(5, 40) / 10;
  const nums = shuffle([x, y, z]);
  const answer = Math.round((x + y + z) * 10) / 10;
  return {
    level, kind: 'compute',
    text: `${nums[0]}＋${nums[1]}＋${nums[2]} を くふうして 計算しよう。（${x}＋${y}＝${pairSum} を さきに 計算すると らくだよ）`,
    answer, allowDecimal: true,
    explain: `${x}＋${y}＝${pairSum} を さきに 計算してから ${z} を たすと、${answer}。小数でも たし算の きまりは つかえるね。`,
  };
}

/**
 * きまりの□うめ。交換・結合・分配法則を□を使った式で一般的にまとめる
 * （指導要領 A(6)ア(ｳ)／A(7)）。等号の左右が同じ量であることを読む練習でもある。
 */
function buildLawBlank(level: KufuuLevel): KufuuProblem {
  const kind = pick(['comm', 'assoc', 'expand', 'gather'] as const);
  const isMul = Math.random() < 0.6;
  const op = isMul ? '×' : '＋';

  if (kind === 'comm') {
    // 交換法則: 7×14 ＝ □×7
    const a = rnd(3, 20), b = rnd(3, 20);
    return {
      level, kind: 'blank',
      exprLeft: `${a}${op}${b}`,
      exprRight: `□${op}${a}`,
      blankAnswer: b,
      explain: `${a}${op}${b} ＝ ${b}${op}${a}。${isMul ? 'かけ算' : 'たし算'}は 入れかえても 答えが 同じ（交換法則）。`,
    };
  }
  if (kind === 'assoc') {
    // 結合法則: (a○b)○c ＝ a○(□○c)
    const a = rnd(2, 12), b = rnd(2, 12), c = rnd(2, 9);
    return {
      level, kind: 'blank',
      exprLeft: `(${a}${op}${b})${op}${c}`,
      exprRight: `${a}${op}(□${op}${c})`,
      blankAnswer: b,
      explain: `(${a}${op}${b})${op}${c} ＝ ${a}${op}(${b}${op}${c})。組み合わせを 変えても 答えは 同じ（結合法則）。`,
    };
  }
  if (kind === 'expand') {
    // 分配法則（かっこを はずす向き）: (a＋b)×c ＝ a×c＋□×c
    const a = rnd(3, 20), b = rnd(2, 15), c = rnd(2, 9);
    return {
      level, kind: 'blank',
      exprLeft: `(${a}＋${b})×${c}`,
      exprRight: `${a}×${c}＋□×${c}`,
      blankAnswer: b,
      explain: `(${a}＋${b})×${c} ＝ ${a}×${c}＋${b}×${c}。( )の 中の どちらにも ×${c} するよ。`,
    };
  }
  // 分配法則（まとめる向き）: a×c＋b×c ＝ (a＋□)×c
  const a = rnd(3, 20), b = rnd(2, 15), c = rnd(2, 9);
  return {
    level, kind: 'blank',
    exprLeft: `${a}×${c}＋${b}×${c}`,
    exprRight: `(${a}＋□)×${c}`,
    blankAnswer: b,
    explain: `${a}×${c}＋${b}×${c} ＝ (${a}＋${b})×${c}。同じ ×${c} が あるから、( )で まとめられるよ。`,
  };
}

export function generateKufuu(level: KufuuLevel): KufuuProblem {
  if (level === 'kufuu-distribute') return buildDistribute(level);
  if (level === 'kufuu-assoc') return buildAssoc(level);
  if (level === 'kufuu-blank') return buildLawBlank(level);
  return buildDecimalKufuu(level);
}

/* =========================================================================
 * 4. なりたつ かな？（lawcheck） — 交換・結合法則の反例判定（ひき算・わり算）
 * ========================================================================= */
export type LawCheckLevel = 'law-comm' | 'law-assoc';
export const LAWCHECK_LEVELS: { id: LawCheckLevel; label: string; desc: string }[] = [
  { id: 'law-comm', label: '交換法則', desc: '入れかえても 答えは 同じ？' },
  { id: 'law-assoc', label: '結合法則', desc: '組み合わせを 変えても 答えは 同じ？' },
];

export interface LawCheckProblem {
  level: LawCheckLevel;
  claimLeft: string;
  claimRight: string;
  isTrue: boolean;
  leftValue: number;
  rightValue: number;
  /** 判定のあとに選ぶ「なぜそう言えるか」の理由（指導要領「言葉で理由を説明させる」） */
  reasonOptions: string[];
  correctReasonIndex: number;
  explain: string;
}

/** 判定の根拠を言葉で選ばせるための選択肢をつくる */
function lawReasons(op: Op, isTrue: boolean, isAssoc: boolean): { reasonOptions: string[]; correctReasonIndex: number } {
  const opName = op === '+' ? 'たし算' : op === '-' ? 'ひき算' : op === '×' ? 'かけ算' : 'わり算';
  const correct = isTrue
    ? isAssoc
      ? `${opName}は、どこから 組み合わせても 答えが 同じに なるから`
      : `${opName}は、入れかえても 答えが 同じに なるから`
    : isAssoc
      ? `${opName}は、組み合わせを 変えると ひく数・わる数が 変わって しまうから`
      : `${opName}は、入れかえると ひかれる数と ひく数（わられる数と わる数）が 入れかわって しまうから`;
  const distractors = shuffle([
    '数が 小さいから',
    '左から じゅんに 計算すれば いつでも 同じに なるから',
    '計算の じゅんばんは いつでも 自由に 変えて よいから',
    '答えが 2けたに なるから',
  ]).slice(0, 2);
  const reasonOptions = shuffle([correct, ...distractors]);
  return { reasonOptions, correctReasonIndex: reasonOptions.indexOf(correct) };
}

function buildLawComm(level: LawCheckLevel): LawCheckProblem {
  const op = pick<Op>(['+', '-', '×', '÷']);
  const isTrue = op === '+' || op === '×';
  let a: number, b: number;
  if (op === '÷') { b = rnd(2, 8); a = b * rnd(2, 9); if (a === b) a = b * 2; }
  else if (op === '-') { b = rnd(2, 15); a = b + rnd(2, 20); }
  else { a = rnd(3, 20); b = rnd(3, 20); if (a === b) b += 3; }
  const leftValue = compute(a, op, b);
  const rightValue = compute(b, op, a);
  const claimLeft = fmt(a, op, b);
  const claimRight = fmt(b, op, a);
  const explain = isTrue
    ? `${claimLeft}＝${leftValue}、${claimRight}＝${rightValue}。たし算・かけ算は 入れかえても 答えが 同じ（交換法則）。`
    : `${claimLeft}＝${leftValue}。でも ${claimRight} は ちがう 計算に なってしまうよ。ひき算・わり算では、入れかえると 答えが 変わってしまうんだ。`;
  return {
    level, claimLeft, claimRight, isTrue, leftValue,
    rightValue: op === '-' || op === '÷' ? Number.NaN : rightValue,
    ...lawReasons(op, isTrue, false),
    explain,
  };
}

function buildLawAssoc(level: LawCheckLevel): LawCheckProblem {
  const op = pick<Op>(['+', '-', '×', '÷']);
  const isTrue = op === '+' || op === '×';
  let a: number, b: number, c: number;
  if (op === '-') {
    // (a－b)－c が確実に非負になるように、先に「a－b」を c より大きく確保する
    c = rnd(2, 9);
    const diff = c + rnd(1, 10); // a － b
    b = rnd(3, 20);
    a = b + diff;
  } else if (op === '÷') {
    c = rnd(2, 6); b = c * rnd(2, 6); a = b * rnd(2, 6);
  } else if (op === '×') {
    a = rnd(2, 12); b = rnd(2, 9); c = rnd(2, 9);
  } else {
    a = rnd(3, 30); b = rnd(3, 30); c = rnd(3, 30);
  }
  const leftValue = compute(compute(a, op, b), op, c);
  const rightValue = compute(a, op, compute(b, op, c));
  const claimLeft = `(${fmt(a, op, b)})${opDisplay(op)}${c}`;
  const claimRight = `${a}${opDisplay(op)}(${fmt(b, op, c)})`;
  const explain = isTrue
    ? `${claimLeft}＝${leftValue}、${claimRight}＝${rightValue}。たし算・かけ算は 組み合わせを 変えても 答えが 同じ（結合法則）。`
    : `${claimLeft}＝${leftValue}。でも ${claimRight}＝${rightValue}。ひき算・わり算では、組み合わせを 変えると 答えが 変わってしまうんだ。`;
  return { level, claimLeft, claimRight, isTrue, leftValue, rightValue, ...lawReasons(op, isTrue, true), explain };
}

export function generateLawCheck(level: LawCheckLevel): LawCheckProblem {
  return level === 'law-comm' ? buildLawComm(level) : buildLawAssoc(level);
}

/* =========================================================================
 * 5. 10ばい・100ばいの ひみつ（times） — 乗法の性質
 * ========================================================================= */
export type TimesLevel = 'times-single' | 'times-both';
export const TIMES_LEVELS: { id: TimesLevel; label: string; desc: string }[] = [
  { id: 'times-single', label: 'かける数だけ10ばい', desc: '積も 10ばいに なるよ' },
  { id: 'times-both', label: 'りょうほう10ばい', desc: '積は 100ばいに なるよ' },
];

export interface TimesProblem {
  level: TimesLevel;
  a: number;
  b: number;
  baseProduct: number;
  scaledText: string;
  answer: number;
  hint: string;
}

export function generateTimes(level: TimesLevel): TimesProblem {
  const a = rnd(2, 9);
  const b = rnd(2, 9);
  const baseProduct = a * b;
  if (level === 'times-single') {
    return {
      level, a, b, baseProduct,
      scaledText: `${a}×${b * 10}`,
      answer: baseProduct * 10,
      hint: `${a}×${b}＝${baseProduct} を もとに、かける数（${b}）が10ばいなら、積も10ばいに なるよ。`,
    };
  }
  return {
    level, a, b, baseProduct,
    scaledText: `${a * 10}×${b * 10}`,
    answer: baseProduct * 100,
    hint: `${a}×${b}＝${baseProduct} を もとに、かけられる数・かける数を どちらも10ばいすると、積は100ばいに なるよ。`,
  };
}

/* =========================================================================
 * 6. ドット たんてい（dots） — 図から くふうして 数える
 * ========================================================================= */
export type DotsLevel = 'dots-basic' | 'dots-advanced';
export const DOTS_LEVELS: { id: DotsLevel; label: string; desc: string }[] = [
  { id: 'dots-basic', label: 'きほん', desc: 'L字がたの ドットを 数えよう' },
  { id: 'dots-advanced', label: 'おおきい図', desc: 'もっと 大きい L字がた に ちょうせん' },
];

export interface DotsProblem {
  level: DotsLevel;
  rows: number;
  cols: number;
  cutR: number;
  cutC: number;
  total: number;
  choices: string[];
  correctIndex: number;
  explain: string;
}

export function generateDots(level: DotsLevel): DotsProblem {
  const small = level === 'dots-basic';
  const rows = small ? rnd(4, 5) : rnd(6, 8);
  const cols = small ? rnd(4, 5) : rnd(6, 8);
  const cutR = rnd(1, rows - 2);
  const cutC = rnd(1, cols - 2);
  const total = rows * cols - cutR * cutC;
  const correct = `${rows}×${cols}－${cutR}×${cutC}`;
  const alt = `${rows - cutR}×${cols}＋${cutR}×${cols - cutC}`; // 別の分け方（同じ答え）
  const wrong1 = `${rows}×${cols}＋${cutR}×${cutC}`;
  const wrong2 = `${rows - cutR}×${cols - cutC}`;
  const options = shuffle([correct, alt, wrong1, wrong2]);
  return {
    level, rows, cols, cutR, cutC, total,
    choices: options,
    correctIndex: options.indexOf(correct),
    explain: `大きい 長方形（${rows}×${cols}）から、かけている 分（${cutR}×${cutC}）を ひくと ${total}こ。${alt} でも 同じ ${total}こに なるよ。`,
  };
}

/* =========================================================================
 * 7. エラーハンター（error hunter） — この単元の代表的な誤答パターン
 * ========================================================================= */
export type EhPreset = 'eh-order' | 'eh-paren' | 'eh-distribute' | 'eh-law';
export const EH_PRESETS: EhPreset[] = ['eh-order', 'eh-paren', 'eh-distribute', 'eh-law'];

export interface RuleErrorExample {
  preset: EhPreset;
  character: string;
  expr: string;
  shownAnswer: number | string;
  isCorrect: boolean;
  correctAnswer: number;
  fixHint: string;
  reasonOptions: string[];
  correctReasonIndex: number;
  explain: string;
}

const CHARACTERS = ['ゆうき', 'みなみ', 'たくま', 'さくら', 'れん', 'ひまり'];

function buildEhOrder(): RuleErrorExample {
  const a = rnd(2, 9), b = rnd(2, 9), c = rnd(2, 9);
  const correctAnswer = a + b * c;
  const isCorrect = Math.random() < 0.35;
  const wrongAnswer = (a + b) * c;
  return {
    preset: 'eh-order',
    character: pick(CHARACTERS),
    expr: `${a}＋${b}×${c}`,
    shownAnswer: isCorrect ? correctAnswer : wrongAnswer,
    isCorrect,
    correctAnswer,
    fixHint: 'かけ算を 先に 計算してから、たし算を しよう。',
    reasonOptions: shuffle([
      'たし算を 先に 計算してしまった',
      'かけ算の 九九を まちがえた',
      '数字を 読みまちがえた',
    ]),
    correctReasonIndex: 0,
    explain: `${a}＋${b}×${c} は、かけ算を 先に 計算して ${a}＋${b * c}＝${correctAnswer}。`,
  };
}

function buildEhParen(): RuleErrorExample {
  const total = rnd(50, 90);
  const x = rnd(10, Math.floor(total / 2) - 2);
  const y = rnd(5, total - x - 5);
  const correctAnswer = total - (x + y);
  const isCorrect = Math.random() < 0.35;
  const wrongAnswer = total - x + y;
  return {
    preset: 'eh-paren',
    character: pick(CHARACTERS),
    expr: `${total}－(${x}＋${y})`,
    shownAnswer: isCorrect ? correctAnswer : wrongAnswer,
    isCorrect,
    correctAnswer,
    fixHint: '( )の中を 先に 計算してから、その 答えを ぜんぶ ひこう。',
    reasonOptions: shuffle([
      '( )の中の 2つとも ひくのを わすれて、片方だけ たしてしまった',
      'ひき算の けたを まちがえた',
      '( )を 無視して 左から 計算した',
    ]),
    correctReasonIndex: 0,
    explain: `${total}－(${x}＋${y}) は、( )の中の ${x}＋${y}＝${x + y} を さきに 計算して、${total}－${x + y}＝${correctAnswer}。`,
  };
}

function buildEhDistribute(): RuleErrorExample {
  const a = rnd(5, 20), b = rnd(2, 15), c = rnd(2, 9);
  const correctAnswer = a * c + b * c;
  const isCorrect = Math.random() < 0.35;
  const wrongAnswer = a * c + b;
  return {
    preset: 'eh-distribute',
    character: pick(CHARACTERS),
    expr: `(${a}＋${b})×${c} を ${a}×${c}＋${b} と 計算した`,
    shownAnswer: isCorrect ? correctAnswer : wrongAnswer,
    isCorrect,
    correctAnswer,
    fixHint: '( )の中の 2つの数、どちらにも ×' + c + ' を しよう。',
    reasonOptions: shuffle([
      `あとの数（${b}）に ×${c} するのを わすれた`,
      `さいしょの数（${a}）に ×${c} するのを わすれた`,
      'かけ算の 九九を まちがえた',
    ]),
    correctReasonIndex: 0,
    explain: `(${a}＋${b})×${c} ＝ ${a}×${c}＋${b}×${c} ＝ ${correctAnswer}。( )の 中の 数は どちらにも かけるよ。`,
  };
}

function buildEhLaw(): RuleErrorExample {
  const op = pick<'－' | '÷'>(['－', '÷']);
  const isDiv = op === '÷';
  const b = isDiv ? rnd(2, 8) : rnd(2, 15);
  const a = isDiv ? b * rnd(2, 8) : b + rnd(2, 20);
  const claim = isDiv ? `${a}÷${b} ＝ ${b}÷${a}` : `${a}－${b} ＝ ${b}－${a}`;
  const isCorrect = false; // この提案は必ず誤り（判定・言語化が目的）
  return {
    preset: 'eh-law',
    character: pick(CHARACTERS),
    expr: `${pick(CHARACTERS)}さんは「${claim} も 正しい」と 言いました`,
    shownAnswer: '入れかえても 同じ',
    isCorrect,
    correctAnswer: isDiv ? a / b : a - b,
    fixHint: `${isDiv ? 'わり算' : 'ひき算'}は、入れかえると 答えが 変わってしまうよ。`,
    reasonOptions: shuffle([
      `たし算・かけ算の きまりを、${isDiv ? 'わり算' : 'ひき算'}にも つかってしまった`,
      '計算する 順番を まちがえた',
      '九九を まちがえた',
    ]),
    correctReasonIndex: 0,
    explain: `${isDiv ? 'わり算' : 'ひき算'}では 入れかえると 答えが 変わるから、交換法則は つかえないよ。（例：${a}${op}${b}＝${isDiv ? a / b : a - b} だけど ${b}${op}${a} は ちがう 計算に なる）`,
  };
}

export function makeRuleError(preset?: EhPreset): RuleErrorExample {
  const p = preset ?? pick(EH_PRESETS);
  switch (p) {
    case 'eh-order': return buildEhOrder();
    case 'eh-paren': return buildEhParen();
    case 'eh-distribute': return buildEhDistribute();
    case 'eh-law': return buildEhLaw();
  }
}

/* =========================================================================
 * 9. しきを よもう（read） — 式の意味を読み取る（指導要領 A(6)イ(ｱ)）
 *    式が先にあり、その式が表す「数え方の図」「場面」を選ぶ。
 *    式は答えを出す道具であると同時に、考えの筋道を表すもの、という見方を育てる。
 * ========================================================================= */
export type ReadLevel = 'read-dots' | 'read-scene';
export const READ_LEVELS: { id: ReadLevel; label: string; desc: string }[] = [
  { id: 'read-dots', label: 'しきと 図', desc: 'この しきは どの 数え方？' },
  { id: 'read-scene', label: 'しきと 場面', desc: 'この しきは どの 場面？' },
];

/** ドットの分け方。subtract＝大きい長方形からひく／split＝2つの長方形に分ける */
export type DotMode = 'subtract' | 'split';

export interface ReadDotsProblem {
  kind: 'dots';
  level: ReadLevel;
  rows: number; cols: number; cutR: number; cutC: number;
  expr: string;
  correctMode: DotMode;
  total: number;
  explain: string;
}
export interface ReadSceneProblem {
  kind: 'scene';
  level: ReadLevel;
  expr: string;
  choices: string[];
  correctIndex: number;
  explain: string;
}
export type ReadProblem = ReadDotsProblem | ReadSceneProblem;

function buildReadDots(level: ReadLevel): ReadDotsProblem {
  const rows = rnd(4, 7);
  const cols = rnd(4, 7);
  const cutR = rnd(1, rows - 2);
  const cutC = rnd(1, cols - 2);
  const total = rows * cols - cutR * cutC;
  const correctMode: DotMode = Math.random() < 0.5 ? 'subtract' : 'split';
  const expr = correctMode === 'subtract'
    ? `${rows}×${cols}－${cutR}×${cutC}`
    : `${rows - cutR}×${cols}＋${cutR}×${cols - cutC}`;
  return {
    kind: 'dots', level, rows, cols, cutR, cutC, expr, correctMode, total,
    explain: correctMode === 'subtract'
      ? `${expr} は、大きい 長方形（${rows}×${cols}）から かけている 分（${cutR}×${cutC}）を ひく 数え方。答えは ${total}こ。`
      : `${expr} は、下の ${rows - cutR}×${cols} と 上の ${cutR}×${cols - cutC} の 2つに 分ける 数え方。答えは ${total}こ。`,
  };
}

function buildReadScene(level: ReadLevel): ReadSceneProblem {
  const pair = pick(MONEY_ITEMS);
  const a = rnd(3, 9) * 10;
  const b = rnd(2, 8) * 10;
  const rest = rnd(2, 8) * 10;
  const total = a + b + rest;
  const expr = `${total}－(${a}＋${b})`;
  const correct = `${total}円 もって いて、${a}円の ${pair.a}と ${b}円の ${pair.b}を 買いました。のこりは 何円ですか。`;
  const options = shuffle([
    correct,
    `${total}円 もって いて、${a}円の ${pair.a}を 買い、あとで ${b}円 もらいました。今 何円 もって いますか。`,
    `${a}円の ${pair.a}と ${b}円の ${pair.b}を 買って、${total}円 はらいました。おつりを 2人で 同じに 分けます。1人 何円ですか。`,
    `${total}円を、${a}円ずつ ${b}人に 分けます。のこりは 何円ですか。`,
  ]);
  return {
    kind: 'scene', level, expr,
    choices: options,
    correctIndex: options.indexOf(correct),
    explain: `( )で ${a}＋${b} を まとめているから、「2つ 買った 分を まとめて ${total}円から ひく」場面。答えは ${rest}円。`,
  };
}

export function generateRead(level: ReadLevel): ReadProblem {
  return level === 'read-dots' ? buildReadDots(level) : buildReadScene(level);
}

/* =========================================================================
 * 8. □を もとめよう（inverse） — □に数を当てはめて調べる（指導要領 A(6)ア(ｳ)）
 *    □＋38＝60 のように、わからない数を□で表した式から□を求める。
 * ========================================================================= */
export type InverseLevel = 'inverse-addsub' | 'inverse-muldiv';
export const INVERSE_LEVELS: { id: InverseLevel; label: string; desc: string }[] = [
  { id: 'inverse-addsub', label: 'たし算・ひき算', desc: '□＋38＝60 の □を もとめよう' },
  { id: 'inverse-muldiv', label: 'かけ算・わり算', desc: '□×8＝48 の □を もとめよう' },
];

export interface InverseProblem {
  level: InverseLevel;
  expr: string; // □をふくむ式（例: 「□＋38＝60」）
  answer: number;
  hint: string;
  explain: string;
}

export function generateInverse(level: InverseLevel): InverseProblem {
  const boxLeft = Math.random() < 0.5; // □が式の左にあるか
  if (level === 'inverse-addsub') {
    const op: Op = pick(['+', '-']);
    if (op === '+') {
      const x = rnd(5, 60), other = rnd(5, 60);
      const sum = x + other;
      const expr = boxLeft ? `□＋${other}＝${sum}` : `${other}＋□＝${sum}`;
      return {
        level, expr, answer: x,
        hint: `ぜんぶで ${sum}。そこから ${other} を ひくと □が わかるよ。`,
        explain: `${sum}－${other}＝${x} だから、□は ${x}。`,
      };
    }
    if (boxLeft) {
      // □－b＝c
      const b = rnd(5, 40), c = rnd(5, 50);
      const x = b + c;
      return {
        level, expr: `□－${b}＝${c}`, answer: x,
        hint: `${b} を ひいたら ${c} に なったよ。もとの数は ${c} に ${b} を たした数だね。`,
        explain: `${c}＋${b}＝${x} だから、□は ${x}。`,
      };
    }
    // a－□＝c
    const a = rnd(30, 90), c = rnd(5, 25);
    const x = a - c;
    return {
      level, expr: `${a}－□＝${c}`, answer: x,
      hint: `${a} から □を ひいて ${c}。□は ${a} と ${c} の ちがいだね。`,
      explain: `${a}－${c}＝${x} だから、□は ${x}。`,
    };
  }
  // かけ算・わり算
  const op: Op = pick(['×', '÷']);
  if (op === '×') {
    const x = rnd(2, 12), other = rnd(2, 9);
    const prod = x * other;
    const expr = boxLeft ? `□×${other}＝${prod}` : `${other}×□＝${prod}`;
    return {
      level, expr, answer: x,
      hint: `かけて ${prod} に なる数だよ。${prod} を ${other} で わってみよう。`,
      explain: `${prod}÷${other}＝${x} だから、□は ${x}。`,
    };
  }
  if (boxLeft) {
    // □÷b＝c
    const b = rnd(2, 9), c = rnd(2, 12);
    const x = b * c;
    return {
      level, expr: `□÷${b}＝${c}`, answer: x,
      hint: `${b} で わったら ${c} に なったよ。もとの数は ${c} に ${b} を かけた数だね。`,
      explain: `${c}×${b}＝${x} だから、□は ${x}。`,
    };
  }
  // a÷□＝c
  const x2 = rnd(2, 9), c2 = rnd(2, 9);
  const a2 = x2 * c2;
  return {
    level, expr: `${a2}÷□＝${c2}`, answer: x2,
    hint: `${a2} を □で わって ${c2}。${a2} を ${c2} で わると □が わかるよ。`,
    explain: `${a2}÷${c2}＝${x2} だから、□は ${x2}。`,
  };
}
