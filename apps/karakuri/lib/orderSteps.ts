// このファイルは単元アプリ syo4-keisannokimari の src/lib/orderSteps.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * じゅんばんマスターの「どこを計算する？」を判定し、式を書きかえる部品（画面にも検算にも使う）。
 *
 * ルール（先生が子どもに教えるとおり）:
 *   1. ( )の中が先。( )が入れこんでいたら、いちばん内側から。
 *   2. かけ算・わり算は、たし算・ひき算より先。
 *   3. 同じなかま（×÷どうし、＋－どうし）がならんだら、左から じゅんに。
 *   どれも「いま計算してよい演算」ならOK。たとえば 80÷4＋15×2 は、どちらのかけ算・わり算から計算してもよい。
 * 式は文字（トークン）の列で持つ。数は整数のまま、( )は結果が1つの数になったら外す。
 */
export type Seg = string | { u: string } | { r: string };

export const PAREN_HINT = '( )の中を さいしょに 計算するよ。';
export const MULDIV_HINT = 'かけ算・わり算は、たし算・ひき算より 先に 計算するよ。';
/** ×と÷だけ／＋と－だけが ならぶ式は、左から じゅんに計算する（×を÷より先にしない） */
export const LEFT_HINT = '同じ なかまの 計算が ならんだら、左から じゅんに 計算するよ。';
const OTHER_HINT = 'ここは まだ 計算できないよ。( )の中や、かけ算・わり算を 先に 見つけよう。';

export const tokenize = (expr: string): string[] => expr.match(/\d+|[()×÷＋－]/g) ?? [];

const isNum = (t: string | undefined): t is string => t !== undefined && /^\d+$/.test(t);
export const isOp = (t: string | undefined): boolean => t === '×' || t === '÷' || t === '＋' || t === '－';
const rank = (op: string): number => (op === '×' || op === '÷' ? 2 : 1);

/** i番目の文字の外側にある「ひらいた( )の数」 */
function depthAt(tokens: readonly string[], i: number): number {
  let d = 0;
  for (let k = 0; k < i; k++) {
    if (tokens[k] === '(') d++;
    else if (tokens[k] === ')') d--;
  }
  return d;
}

export type PickResult = { ok: true } | { ok: false; hint: string };

/** i番目の演算子を、いま計算してよいか。だめなら、その理由（ルール）を子ども向けの言葉で返す。 */
export function checkPick(tokens: readonly string[], i: number): PickResult {
  const op = tokens[i];
  if (!isOp(op)) return { ok: false, hint: OTHER_HINT };
  let deepest = 0;
  tokens.forEach((t, k) => { if (isOp(t)) deepest = Math.max(deepest, depthAt(tokens, k)); });
  // 1. ( )の中が先
  if (depthAt(tokens, i) < deepest) return { ok: false, hint: PAREN_HINT };
  if (!isNum(tokens[i - 1]) || !isNum(tokens[i + 1])) return { ok: false, hint: OTHER_HINT };
  // 2. 右どなりの演算のほうが強い（×÷ に ＋－ が負ける）
  const right = tokens[i + 2];
  if (isOp(right) && rank(right) > rank(op)) return { ok: false, hint: MULDIV_HINT };
  // 3. 左どなりの演算が先（強いほう／同じなかまなら左から）
  const left = tokens[i - 2];
  if (isOp(left)) {
    if (rank(left) > rank(op)) return { ok: false, hint: MULDIV_HINT };
    if (rank(left) === rank(op)) return { ok: false, hint: LEFT_HINT };
  }
  return { ok: true };
}

/** いま計算してよい演算子の位置の一覧 */
export function validPicks(tokens: readonly string[]): number[] {
  return tokens.map((_, i) => i).filter((i) => isOp(tokens[i]) && checkPick(tokens, i).ok);
}

export function opCount(tokens: readonly string[]): number {
  return tokens.filter(isOp).length;
}

function calc(a: number, op: string, b: number): number {
  return op === '＋' ? a + b : op === '－' ? a - b : op === '×' ? a * b : a / b;
}

/** i番目の演算子の「a op b」を計算した値 */
export function pickValue(tokens: readonly string[], i: number): number {
  return calc(Number(tokens[i - 1]), tokens[i], Number(tokens[i + 1]));
}

/** 下線を引く範囲 [はじめ, おわり]（その計算だけを ( ) がちょうど囲んでいたら、( )も含める） */
export function pickSpan(tokens: readonly string[], i: number): [number, number] {
  if (tokens[i - 2] === '(' && tokens[i + 2] === ')') return [i - 2, i + 2];
  return [i - 1, i + 1];
}

/** i番目の演算子を計算して、結果に置きかえた式にする。結果の数の位置も返す。 */
export function reduceAt(tokens: readonly string[], i: number): { tokens: string[]; resultAt: number; value: number } {
  const value = pickValue(tokens, i);
  const [from, to] = pickSpan(tokens, i);
  const next = [...tokens.slice(0, from), String(value), ...tokens.slice(to + 1)];
  return { tokens: next, resultAt: from, value };
}

/** 1行ぶんの式を、表示用の部品に分ける。under＝下線の範囲、mark＝結果の数の位置。 */
export function toSegs(tokens: readonly string[], under?: [number, number], mark?: number): Seg[] {
  const out: Seg[] = [];
  let plain = '';
  const flush = () => { if (plain) { out.push(plain); plain = ''; } };
  let k = 0;
  while (k < tokens.length) {
    if (under && k === under[0]) {
      flush();
      out.push({ u: tokens.slice(under[0], under[1] + 1).join('') });
      k = under[1] + 1;
    } else if (mark === k) {
      flush();
      out.push({ r: tokens[k] });
      k++;
    } else {
      plain += tokens[k];
      k++;
    }
  }
  flush();
  return out;
}
