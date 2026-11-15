// このファイルは単元アプリ syo4-mennsekinokurabekatatoarawasikata の src/lib/shapes.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 図の部品（方眼の形・長方形・L字・コの字・道のある畑）。
 * 図は「長さの単位の座標」で作り、寸法の文字は辺の長さから自動で書く（図と数が食いちがわない）。
 */
import type { Dim, GridCell, HalfCorner, Poly } from './question';
import { fmt, pick, rnd, shuffle } from './question';

export type Pt = [number, number];

export const rectPts = (x: number, y: number, w: number, h: number): Pt[] => [[x, y], [x + w, y], [x + w, y + h], [x, y + h]];

/** 点が多角形の中にあるか（レイキャスト） */
export function inPoly(p: Pt, pts: readonly Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/**
 * 多角形の辺に長さの文字をつける（omit の番号の辺は書かない）。
 * 文字は形の外がわに書く。
 */
export function edgeDims(pts: readonly Pt[], unit: string, omit: number[] = [], text?: (i: number, len: number) => string): Dim[] {
  const out: Dim[] = [];
  const e = 1e-3;
  pts.forEach((a, i) => {
    if (omit.includes(i)) return;
    const b = pts[(i + 1) % pts.length]!;
    const len = Math.abs(b[0] - a[0]) + Math.abs(b[1] - a[1]);
    const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
    let side: Dim['side'];
    if (a[1] === b[1]) side = inPoly([mx, my - e], pts) ? 'bottom' : 'top';
    else side = inPoly([mx - e, my], pts) ? 'right' : 'left';
    out.push({ a: [a[0], a[1]], b: [b[0], b[1]], text: text ? text(i, len) : `${fmt(len)}${unit}`, side });
  });
  return out;
}

/** 形を左右・上下にうらがえす（向きを変えても、面積と式は同じ） */
export function makeFlip(W: number, H: number): (p: Pt) => Pt {
  const fx = Math.random() < 0.5, fy = Math.random() < 0.5;
  return ([x, y]) => [fx ? W - x : x, fy ? H - y : y];
}

/* ------------------------------------------------------------------ */
/* L字の形（右上が かけた形が もと）                                       */
/* ------------------------------------------------------------------ */

export interface LShape {
  W: number; H: number; nw: number; nh: number;
  pts: Pt[];
  /** たてに分けた 2つ / 横に分けた 2つ / 大きい長方形とかけた部分 */
  vParts: [Pt[], Pt[]];
  hParts: [Pt[], Pt[]];
  big: Pt[];
  notch: Pt[];
}

export function makeL(o: { W?: [number, number]; H?: [number, number] } = {}): LShape {
  for (;;) {
    const W = rnd(...(o.W ?? [5, 10]));
    const H = rnd(...(o.H ?? [4, 9]));
    const nw = rnd(2, W - 2);
    const nh = rnd(1, H - 2);
    if (W === H || nw === nh || W - nw === nh || H - nh === nw) continue;   // 長さの数が かぶりすぎない
    const f = makeFlip(W, H);
    const T = (a: Pt[]) => a.map(f);
    return {
      W, H, nw, nh,
      pts: T([[0, 0], [W - nw, 0], [W - nw, nh], [W, nh], [W, H], [0, H]]),
      vParts: [T(rectPts(0, 0, W - nw, H)), T(rectPts(W - nw, nh, nw, H - nh))],
      hParts: [T(rectPts(0, 0, W - nw, nh)), T(rectPts(0, nh, W, H - nh))],
      big: T(rectPts(0, 0, W, H)),
      notch: T(rectPts(W - nw, 0, nw, nh)),
    };
  }
}

/* ------------------------------------------------------------------ */
/* コの字の形（右の まん中が へこんだ形が もと）                             */
/* ------------------------------------------------------------------ */

export interface CShape { W: number; H: number; d: number; h: number; t: number; pts: Pt[]; notch: Pt[]; big: Pt[] }

export function makeC(): CShape {
  for (;;) {
    const W = rnd(5, 10), H = rnd(7, 12);
    const d = rnd(2, W - 2), h = rnd(2, H - 4);
    const t = rnd(1, H - h - 1);
    if (W === H || d === h) continue;
    const base: Pt[] = [[0, 0], [W, 0], [W, t], [W - d, t], [W - d, t + h], [W, t + h], [W, H], [0, H]];
    const notch = rectPts(W - d, t, d, h);
    const big = rectPts(0, 0, W, H);
    // 向き: 左右うらがえし と、たて横の入れかえ
    const fx = Math.random() < 0.5, tr = Math.random() < 0.5;
    const f = ([x, y]: Pt): Pt => { const p: Pt = [fx ? W - x : x, y]; return tr ? [p[1], p[0]] : p; };
    return { W, H, d, h, t, pts: base.map(f), notch: notch.map(f), big: big.map(f) };
  }
}

/* ------------------------------------------------------------------ */
/* 方眼の形                                                              */
/* ------------------------------------------------------------------ */

const key = (x: number, y: number) => `${x},${y}`;

/** つながったマスの形（ポリオミノ）を作る */
export function polyomino(n: number, x0: number, y0: number, w: number, h: number, notRect = true): GridCell[] {
  for (let t = 0; t < 500; t++) {
    const set = new Map<string, GridCell>();
    const sx = x0 + rnd(0, w - 1), sy = y0 + rnd(0, h - 1);
    set.set(key(sx, sy), { x: sx, y: sy });
    let guard = 0;
    while (set.size < n && guard++ < 2000) {
      const c = pick([...set.values()]);
      const [dx, dy] = pick([[1, 0], [-1, 0], [0, 1], [0, -1]] as const);
      const nx = c.x + dx, ny = c.y + dy;
      if (nx < x0 || ny < y0 || nx >= x0 + w || ny >= y0 + h) continue;
      if (!set.has(key(nx, ny))) set.set(key(nx, ny), { x: nx, y: ny });
    }
    if (set.size !== n) continue;
    const cells = [...set.values()];
    if (notRect) {
      const xs = cells.map((c) => c.x), ys = cells.map((c) => c.y);
      const bw = Math.max(...xs) - Math.min(...xs) + 1, bh = Math.max(...ys) - Math.min(...ys) + 1;
      if (bw * bh === n) continue;           // 長方形は「数えなくても かけ算で出る」ので、ここでは使わない
      if (bw === 1 || bh === 1) continue;
    }
    return cells;
  }
  throw new Error('polyomino: 形が作れません');
}

/** ななめ半分のマスの、2本の直角の辺の となり と、ななめの辺の がわの となり */
const HALF_SIDES: Record<HalfCorner, { legs: [number, number][]; hyp: [number, number][] }> = {
  sw: { legs: [[-1, 0], [0, 1]], hyp: [[0, -1], [1, 0]] },
  se: { legs: [[1, 0], [0, 1]], hyp: [[0, -1], [-1, 0]] },
  nw: { legs: [[0, -1], [-1, 0]], hyp: [[0, 1], [1, 0]] },
  ne: { legs: [[0, -1], [1, 0]], hyp: [[0, 1], [-1, 0]] },
};

/**
 * 形に、ななめ半分の三角を count こ つける。
 * 三角は 直角の辺が 形にくっつき、ななめの辺が 外を向くところだけに置く（屋根や かどの 形になる）。
 */
export function addHalves(cells: GridCell[], count: number, x0: number, y0: number, w: number, h: number): GridCell[] | null {
  const full = new Set(cells.map((c) => key(c.x, c.y)));
  const cand: GridCell[] = [];
  for (let x = x0; x < x0 + w; x++) {
    for (let y = y0; y < y0 + h; y++) {
      if (full.has(key(x, y))) continue;
      for (const corner of ['ne', 'nw', 'se', 'sw'] as HalfCorner[]) {
        const s = HALF_SIDES[corner];
        const legHits = s.legs.filter(([dx, dy]) => full.has(key(x + dx, y + dy))).length;
        const hypHits = s.hyp.filter(([dx, dy]) => full.has(key(x + dx, y + dy))).length;
        if (legHits >= 1 && hypHits === 0) cand.push({ x, y, half: corner });
      }
    }
  }
  const picked: GridCell[] = [];
  const used = new Set<string>();
  for (const c of shuffle(cand)) {
    if (used.has(key(c.x, c.y))) continue;
    // となりあう三角が向かいあって 1マスに見えないように、半分のマスどうしは となりにしない
    if (picked.some((p) => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) === 1)) continue;
    picked.push(c);
    used.add(key(c.x, c.y));
    if (picked.length === count) return [...cells, ...picked];
  }
  return null;
}

/** マスの形の まわりの長さ（全部のマスだけのとき） */
export function gridPerimeter(cells: readonly GridCell[]): number {
  const full = new Set(cells.filter((c) => !c.half).map((c) => key(c.x, c.y)));
  let p = 0;
  for (const c of cells) {
    if (c.half) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!full.has(key(c.x + dx!, c.y + dy!))) p++;
  }
  return p;
}

/** マスの集まりが へんで つながっているか */
export function connected(cells: readonly { x: number; y: number }[]): boolean {
  if (cells.length === 0) return false;
  const set = new Set(cells.map((c) => key(c.x, c.y)));
  const seen = new Set<string>([key(cells[0]!.x, cells[0]!.y)]);
  const st = [cells[0]!];
  while (st.length) {
    const c = st.pop()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = key(c.x + dx!, c.y + dy!);
      if (set.has(k) && !seen.has(k)) { seen.add(k); st.push({ x: c.x + dx!, y: c.y + dy! }); }
    }
  }
  return seen.size === set.size;
}

/** マスの集まりが ちょうど長方形か。長方形なら [横, たて] */
export function rectOf(cells: readonly { x: number; y: number }[]): [number, number] | null {
  if (cells.length === 0) return null;
  const xs = cells.map((c) => c.x), ys = cells.map((c) => c.y);
  const w = Math.max(...xs) - Math.min(...xs) + 1, h = Math.max(...ys) - Math.min(...ys) + 1;
  const set = new Set(cells.map((c) => key(c.x, c.y)));
  return w * h === set.size ? [w, h] : null;
}

export const polyLabel = (pts: Pt[], label: string, role: Poly['role'] = 'ghost'): Poly => ({ pts, role, label });
