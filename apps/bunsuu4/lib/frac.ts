// このファイルは単元アプリ syo4-bunnsu の src/lib/frac.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 分数の計算と、文章の中に分数を書くための小さな記法。純粋関数だけ（画面・ストアに依存しない）。
 *
 * 記法（問題文・ヒント・選択肢のどこでも使える）:
 *   {3|4}    → 4分の3        （F(3,4)）
 *   {1;3|4}  → 1と4分の3     （M(1,3,4)）
 * 画面では RichText が縦書きの分数に直す。テストの答案・学習のきろくには plain() で
 * 「3/4」「1と3/4」の文字にして残す。
 */

export function rnd(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)]!;
}
export function shuffle<T>(a: readonly T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
}
export function gcd(a: number, b: number): number {
  a = Math.abs(a); b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}
export const coprime = (a: number, b: number) => gcd(a, b) === 1;
/** 最小公倍数 */
export const lcm = (a: number, b: number) => (a / gcd(a, b)) * b;

/** [分子, 分母] */
export type FR = [number, number];
/** 約分した分数 */
export function reduce(n: number, d: number): FR {
  const g = gcd(n, d);
  return [n / g, d / g];
}
/** 分数のたし算・ひき算（約分した形で返す） */
export const addFr = (a: FR, b: FR): FR => reduce(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
export const subFr = (a: FR, b: FR): FR => reduce(a[0] * b[1] - b[0] * a[1], a[1] * b[1]);
/** 分数どうしの大きさ（交差積）: 正=左が大きい */
export const cmpFr = (a: FR, b: FR) => Math.sign(a[0] * b[1] - b[0] * a[1]);

/** 条件を満たすまで作り直す（無限ループしないよう上限つき） */
export function retry<T>(gen: () => T, pred: (x: T) => boolean, max = 1000): T {
  for (let i = 0; i < max; i++) {
    const x = gen();
    if (pred(x)) return x;
  }
  return gen();
}

/** 分数・帯分数を文章の中に書く記法 */
export const F = (n: number | '□', d: number | '□') => `{${n}|${d}}`;
export const M = (w: number, n: number, d: number) => `{${w};${n}|${d}}`;
/** FR から分数記法 */
export const FF = (f: FR) => F(f[0], f[1]);

export type RichSeg =
  | { t: 'text'; s: string }
  | { t: 'frac'; w?: number; n: number | '□'; d: number | '□' };

const TOKEN = /\{(?:(\d+);)?(\d+|□)\|(\d+|□)\}/g;
const numOrBox = (s: string): number | '□' => (s === '□' ? '□' : Number(s));

export function parseRich(s: string): RichSeg[] {
  const out: RichSeg[] = [];
  let last = 0;
  for (const m of s.matchAll(TOKEN)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: 'text', s: s.slice(last, at) });
    out.push({ t: 'frac', w: m[1] ? Number(m[1]) : undefined, n: numOrBox(m[2]!), d: numOrBox(m[3]!) });
    last = at + m[0].length;
  }
  if (last < s.length) out.push({ t: 'text', s: s.slice(last) });
  return out;
}

/** 記法をふつうの文字にする（答案・きろく用）。{3|4}→3/4、{1;3|4}→1と3/4 */
export function plain(s: string): string {
  return s.replace(TOKEN, (_m, w, n, d) => (w ? `${w}と${n}/${d}` : `${n}/${d}`));
}

/** 小数の表示。浮動小数のゴミ（0.30000000000000004）を落とす */
export function dec(v: number): string {
  return String(Number(v.toFixed(6)));
}

/** 小数の桁数（0.25→2） */
export function decimalPlaces(v: number): number {
  const s = dec(v);
  const at = s.indexOf('.');
  return at < 0 ? 0 : s.length - at - 1;
}

/** 分数どうしの大きさの比べ（交差積。小数にしないので誤差が出ない）: 正=左が大きい */
export function cmpFrac(n1: number, d1: number, n2: number, d2: number): number {
  return Math.sign(n1 * d2 - n2 * d1);
}

/** 分母が 2^a×5^b だけ＝有限小数で書ける分数か */
export function isTerminating(d: number): boolean {
  let x = d;
  while (x % 2 === 0) x /= 2;
  while (x % 5 === 0) x /= 5;
  return x === 1;
}
