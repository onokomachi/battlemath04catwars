// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/lib/geometry.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 単元「垂直、平行と四角形」の数学的な中身を担う純粋関数群。
 *
 * ここに集約する理由は2つ。
 * (1) 問題ジェネレーター・解答判定・検証スクリプトが同じ判定関数を使うことで、
 *     「アプリの正解」と「単元の定義」がずれないようにする。
 * (2) 定義（垂直・平行・台形・平行四辺形・ひし形）が複数条件のANDになっているので、
 *     条件ごとに関数を分け、反例を機械的に作れるようにする。
 *
 * 定義は学習指導要領解説 算数編 第4学年 B(1)（p.202-203）に従う。
 *  - 垂直: 二つの直線が直角に交わっているとき。**交わっていなくても延長して直角に交われば垂直**。
 *  - 平行: 一つの直線に垂直な二つの直線。性質として「どこまでも交わらない」「幅がどこでも等しい」。
 *  - 台形: 向かい合った一組の辺が平行な四角形
 *  - 平行四辺形: 向かい合った二組の辺が平行な四角形
 *  - ひし形: 四つの辺の長さが等しい四角形
 */
import { Pt, QuadKind, LineRelation } from '../types';

/** 角度の比較に使う許容誤差（度）。格子点で作る図形は誤差がほぼ出ないので小さくてよい。 */
const EPS_DEG = 0.5;
/** 長さの比較に使う許容誤差。 */
const EPS_LEN = 1e-6;

export const sub = (a: Pt, b: Pt): Pt => ({ x: a.x - b.x, y: a.y - b.y });
export const add = (a: Pt, b: Pt): Pt => ({ x: a.x + b.x, y: a.y + b.y });
export const scale = (a: Pt, k: number): Pt => ({ x: a.x * k, y: a.y * k });
export const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
export const dot = (a: Pt, b: Pt): number => a.x * b.x + a.y * b.y;
export const cross = (a: Pt, b: Pt): number => a.x * b.y - a.y * b.x;
export const len = (a: Pt): number => Math.hypot(a.x, a.y);
export const dist = (a: Pt, b: Pt): number => len(sub(a, b));
export const eqPt = (a: Pt, b: Pt): boolean => dist(a, b) < 1e-6;

/**
 * 2直線のなす角（0〜90度）。直線には向きがないので、鈍角側は補角に直して返す。
 * どちらの向きから測っても同じ値になるので、垂直・平行の判定に安全に使える。
 */
export function angleBetween(d1: Pt, d2: Pt): number {
  const l1 = len(d1);
  const l2 = len(d2);
  if (l1 < EPS_LEN || l2 < EPS_LEN) return NaN;
  const cos = Math.min(1, Math.max(-1, dot(d1, d2) / (l1 * l2)));
  const deg = (Math.acos(cos) * 180) / Math.PI;
  return deg > 90 ? 180 - deg : deg;
}

/** 2直線（方向ベクトル）が平行か。長さも向きも問わない。 */
export function isParallelDir(d1: Pt, d2: Pt): boolean {
  const a = angleBetween(d1, d2);
  return !Number.isNaN(a) && a < EPS_DEG;
}

/** 2直線（方向ベクトル）が垂直か。**交わって見えるかどうかは条件にしない**。 */
export function isPerpendicularDir(d1: Pt, d2: Pt): boolean {
  const a = angleBetween(d1, d2);
  return !Number.isNaN(a) && Math.abs(a - 90) < EPS_DEG;
}

/** 線分 a→b の方向ベクトル。 */
export const dirOf = (a: Pt, b: Pt): Pt => sub(b, a);

/**
 * 2直線の位置関係を返す。線分としてではなく「直線として」判定する。
 * 同一直線上（重なる）の場合も parallel 扱いにはせず 'none' を返す
 * （小4では扱わないので、ジェネレーター側でこの組合せを作らないようにする）。
 */
export function relationOf(l1: [Pt, Pt], l2: [Pt, Pt]): LineRelation {
  const d1 = dirOf(l1[0], l1[1]);
  const d2 = dirOf(l2[0], l2[1]);
  if (isPerpendicularDir(d1, d2)) return 'perpendicular';
  if (isParallelDir(d1, d2)) {
    // 同一直線かどうかを見る（l2[0] が l1 上にあれば重なっている）
    const v = sub(l2[0], l1[0]);
    return Math.abs(cross(d1, v)) < EPS_LEN * Math.max(1, len(d1)) ? 'none' : 'parallel';
  }
  return 'crossing';
}

/**
 * 2直線（無限に伸ばしたもの）の交点。平行なら null。
 * 「延長すると交わるか」を児童に見せるために使う。
 */
export function intersection(l1: [Pt, Pt], l2: [Pt, Pt]): Pt | null {
  const d1 = dirOf(l1[0], l1[1]);
  const d2 = dirOf(l2[0], l2[1]);
  const den = cross(d1, d2);
  if (Math.abs(den) < EPS_LEN) return null;
  const t = cross(sub(l2[0], l1[0]), d2) / den;
  return add(l1[0], scale(d1, t));
}

/**
 * 描画されている線分どうしが、延長せずに（見た目で）交わっているか。
 * 「垂直だが交わって見えない」問題を作るとき、この関数が false になる配置を選ぶ。
 */
export function segmentsIntersect(l1: [Pt, Pt], l2: [Pt, Pt]): boolean {
  const p = intersection(l1, l2);
  if (!p) return false;
  const on = (s: [Pt, Pt]) => {
    const d = dirOf(s[0], s[1]);
    const t = dot(sub(p, s[0]), d) / dot(d, d);
    return t >= -1e-9 && t <= 1 + 1e-9;
  };
  return on(l1) && on(l2);
}

/** 平行な2直線の幅（＝どこで測っても等しい距離）。平行でなければ NaN。 */
export function parallelWidth(l1: [Pt, Pt], l2: [Pt, Pt]): number {
  const d = dirOf(l1[0], l1[1]);
  if (!isParallelDir(d, dirOf(l2[0], l2[1]))) return NaN;
  return Math.abs(cross(d, sub(l2[0], l1[0]))) / len(d);
}

/* ============================ 四角形 ============================ */

/** 四角形の4辺の方向ベクトル（AB, BC, CD, DA）。 */
export function edgeDirs(q: Pt[]): Pt[] {
  return q.map((p, i) => dirOf(p, q[(i + 1) % 4]));
}

/** 四角形の4辺の長さ（AB, BC, CD, DA）。 */
export function edgeLengths(q: Pt[]): number[] {
  return q.map((p, i) => dist(p, q[(i + 1) % 4]));
}

/**
 * 頂点 i の内角（度）。四角形が凸で頂点が順に並んでいることを前提とする。
 * 内角なので 0〜180 の値を返す（凹四角形は扱わない）。
 */
export function interiorAngle(q: Pt[], i: number): number {
  const prev = q[(i + 3) % 4];
  const next = q[(i + 1) % 4];
  const a = sub(prev, q[i]);
  const b = sub(next, q[i]);
  const cos = Math.min(1, Math.max(-1, dot(a, b) / (len(a) * len(b))));
  return (Math.acos(cos) * 180) / Math.PI;
}

export function interiorAngles(q: Pt[]): number[] {
  return [0, 1, 2, 3].map((i) => interiorAngle(q, i));
}

/** 向かい合う辺（AB と CD、BC と DA）が平行な組の数。0/1/2 のいずれか。 */
export function parallelPairCount(q: Pt[]): number {
  const d = edgeDirs(q);
  let n = 0;
  if (isParallelDir(d[0], d[2])) n++;
  if (isParallelDir(d[1], d[3])) n++;
  return n;
}

/** 4辺の長さがすべて等しいか（＝ひし形の定義そのもの）。 */
export function allSidesEqual(q: Pt[]): boolean {
  const e = edgeLengths(q);
  return e.every((v) => Math.abs(v - e[0]) < 1e-6);
}

/** 4つの角がすべて直角か。 */
export function allAnglesRight(q: Pt[]): boolean {
  return interiorAngles(q).every((a) => Math.abs(a - 90) < EPS_DEG);
}

/** 四角形が凸で、頂点が順に並んでいるか（自己交差していないか）を確かめる。 */
export function isConvexQuad(q: Pt[]): boolean {
  if (q.length !== 4) return false;
  const d = edgeDirs(q);
  const signs = d.map((v, i) => Math.sign(cross(v, d[(i + 1) % 4])));
  if (signs.some((s) => s === 0)) return false; // 3点が一直線 → 四角形にならない
  return signs.every((s) => s === signs[0]);
}

/**
 * 四角形の種類を、単元の定義にしたがって判定する。
 *
 * 大事なのは「もっとも特殊な名前」を返すこと。正方形はひし形でも長方形でも
 * 平行四辺形でも台形でもあるが、名前を答える問題の正解は「正方形」である。
 * 包含関係そのものを問う問題は isKind() を使う。
 */
export function classifyQuad(q: Pt[]): QuadKind {
  if (!isConvexQuad(q)) return 'other';
  const pairs = parallelPairCount(q);
  const equal = allSidesEqual(q);
  const right = allAnglesRight(q);
  if (pairs === 2) {
    if (equal && right) return 'square';
    if (equal) return 'rhombus';
    if (right) return 'rect';
    return 'parallelogram';
  }
  if (pairs === 1) return 'trapezoid';
  return 'other';
}

/**
 * 「この四角形は〈kind〉といえるか」。包含関係の問題（正方形は平行四辺形といえるか）に使う。
 * 解説 p.204「正方形，長方形は…平行四辺形と同じ性質をもっている図形として捉え直すことができる」
 * にもとづき、正方形・長方形は平行四辺形に含める。台形は「一組の辺が平行」なので
 * 平行四辺形も台形に含める（包含的な立場）が、この単元では「台形といえるか」を
 * 平行四辺形について問う場面は作らない（教科書会社間で扱いが分かれるため）。
 */
export function isKind(q: Pt[], kind: QuadKind): boolean {
  const actual = classifyQuad(q);
  if (actual === 'other') return kind === 'other';
  switch (kind) {
    case 'square':
      return actual === 'square';
    case 'rect':
      return actual === 'square' || actual === 'rect';
    case 'rhombus':
      return actual === 'square' || actual === 'rhombus';
    case 'parallelogram':
      return parallelPairCount(q) === 2;
    case 'trapezoid':
      return parallelPairCount(q) >= 1;
    default:
      return false;
  }
}

/* ============================ 対角線 ============================ */

export interface DiagonalFacts {
  /** 2本の対角線の長さが等しい */
  equalLength: boolean;
  /** 2本の対角線が垂直に交わる */
  perpendicular: boolean;
  /** 2本の対角線が互いに二等分される（交点が両方の中点） */
  bisectEachOther: boolean;
}

/** 四角形 ABCD の対角線 AC・BD について、単元で扱う3つの性質を判定する。 */
export function diagonalFacts(q: Pt[]): DiagonalFacts {
  const ac: [Pt, Pt] = [q[0], q[2]];
  const bd: [Pt, Pt] = [q[1], q[3]];
  const p = intersection(ac, bd);
  return {
    equalLength: Math.abs(dist(q[0], q[2]) - dist(q[1], q[3])) < 1e-6,
    perpendicular: isPerpendicularDir(dirOf(q[0], q[2]), dirOf(q[1], q[3])),
    bisectEachOther: !!p && dist(p, mid(q[0], q[2])) < 1e-6 && dist(p, mid(q[1], q[3])) < 1e-6,
  };
}

/* ============================ 変換 ============================ */

/**
 * 図形を回転する。単元の中心的なねらいの一つが
 * 「図形の置き方をいろいろと変えても，その図形の名称が判断できるようにする」（解説 p.203）
 * なので、出題のたびにこれを通して向きを変える。
 */
export function rotate(pts: Pt[], deg: number, about?: Pt): Pt[] {
  const c = about ?? centroid(pts);
  const r = (deg * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return pts.map((p) => {
    const v = sub(p, c);
    return { x: c.x + v.x * cos - v.y * sin, y: c.y + v.x * sin + v.y * cos };
  });
}

export function centroid(pts: Pt[]): Pt {
  const s = pts.reduce((acc, p) => add(acc, p), { x: 0, y: 0 });
  return scale(s, 1 / pts.length);
}

export function translate(pts: Pt[], v: Pt): Pt[] {
  return pts.map((p) => add(p, v));
}

/** 図形を viewBox (0..w, 0..h) の中央に、余白 pad を残して収める。 */
export function fitInto(pts: Pt[], w: number, h: number, pad = 6): Pt[] {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const sw = maxX - minX || 1;
  const sh = maxY - minY || 1;
  const k = Math.min((w - pad * 2) / sw, (h - pad * 2) / sh);
  const offX = (w - sw * k) / 2 - minX * k;
  const offY = (h - sh * k) / 2 - minY * k;
  return pts.map((p) => ({ x: p.x * k + offX, y: p.y * k + offY }));
}

/** 小数の丸め（描画の座標を安定させる）。 */
export const r2 = (v: number): number => Math.round(v * 100) / 100;

/* ============================ 四角形の作成 ============================ */

/**
 * 2辺の長さと間の角から平行四辺形をつくる（作図問題の正解データそのもの）。
 * A を原点、AB を x 軸方向にとり、AD を角 angleDeg だけ持ち上げる。
 * 返り値は A, B, C, D の順（時計回りに見えるよう y を下向きに取る）。
 */
export function parallelogramFrom(ab: number, ad: number, angleDeg: number): Pt[] {
  const r = (angleDeg * Math.PI) / 180;
  const A = { x: 0, y: 0 };
  const B = { x: ab, y: 0 };
  const D = { x: ad * Math.cos(r), y: -ad * Math.sin(r) };
  const C = add(B, D);
  return [A, B, C, D];
}

/** 1辺の長さと角からひし形をつくる。 */
export function rhombusFrom(side: number, angleDeg: number): Pt[] {
  return parallelogramFrom(side, side, angleDeg);
}

/** たて・横から長方形をつくる。 */
export function rectFrom(w: number, h: number): Pt[] {
  return [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: -h },
    { x: 0, y: -h },
  ];
}

/**
 * 台形をつくる。上底 top・下底 bottom（平行な一組）・高さ h・左のずれ offset。
 * offset を変えると直角台形にも等脚台形にもなる。
 * top !== bottom を守ることで、平行四辺形になってしまうのを防ぐ
 * （＝「台形のつもりが平行四辺形だった」という出題事故を型で防ぐ）。
 */
export function trapezoidFrom(top: number, bottom: number, h: number, offset: number): Pt[] {
  if (Math.abs(top - bottom) < 1e-9) throw new Error('trapezoidFrom: top と bottom が等しいと平行四辺形になる');
  return [
    { x: 0, y: 0 },
    { x: bottom, y: 0 },
    { x: offset + top, y: -h },
    { x: offset, y: -h },
  ];
}

/**
 * たこ形（隣り合う2辺ずつが等しい四角形）。ひし形の反例として使う。
 * 「2組の辺の長さが等しい＝ひし形」という誤概念をゆさぶるための図形。
 */
export function kiteFrom(a: number, b: number, spread: number): Pt[] {
  return [
    { x: 0, y: 0 },
    { x: spread, y: -a },
    { x: 0, y: -a - b },
    { x: -spread, y: -a },
  ];
}
