// このファイルは単元アプリ syo4-tyokuhoutaitorippoutai の src/lib/solid.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 直方体・立方体の「かたち」を計算する道具（純粋関数）。
 *
 * - 展開図は、面（長方形）を方眼の上に置いたものとして持ち、**組み立て（折りたたみ）を計算して**
 *   どの面が立体のどの面になるか・どの点がどの頂点に重なるかを出す。手作業の対応表は使わない。
 *   面を右へたどると、箱を右の辺で転がしたのと同じ向きの変わり方をする（下の step）。
 * - 見取図の直方体は、頂点 A〜H（上の面 ABCD・下の面 EFGH、E は A の真下）で持つ。
 *   平行・垂直の答えは、辺の向き・面の法線から計算する。
 */

/* ================================================================== */
/* 3次元のベクトル（座標軸の向きだけを使う）                               */
/* ================================================================== */

export type V3 = [number, number, number];
/** 箱の大きさ [横(x), たて(y・奥行き), 高さ(z)] */
export type Dims = [number, number, number];

const neg = (a: V3): V3 => [-a[0] || 0, -a[1] || 0, -a[2] || 0];
const addV = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a: V3, k: number): V3 => [a[0] * k || 0, a[1] * k || 0, a[2] * k || 0];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** 向き d に沿った箱の長さ */
const ext = (dims: Dims, d: V3): number => Math.abs(d[0]) * dims[0] + Math.abs(d[1]) * dims[1] + Math.abs(d[2]) * dims[2];
export const v3key = (a: V3): string => a.map((x) => (Object.is(x, -0) ? 0 : x)).join(',');

/* ================================================================== */
/* 展開図                                                                */
/* ================================================================== */

/** 方眼の上の長方形（左上の格子点と、横・たてのマス数） */
export interface Rect { x: number; y: number; w: number; h: number }

/**
 * 展開図の1つの面の状態。
 *  n: 箱のどの面か（外向きの法線）
 *  u: 展開図で右へ進む向きが、箱では どの向きか
 *  v: 展開図で下へ進む向きが、箱では どの向きか
 *  o: 長方形の左上の点が、箱では どこか
 */
export interface FaceState { rect: Rect; n: V3; u: V3; v: V3; o: V3 }

export type Dir = 'R' | 'L' | 'D' | 'U';
export const DIRS: readonly Dir[] = ['R', 'L', 'D', 'U'];

/**
 * 面 f の dir 側に、となりの面をつなげる（箱をその辺で転がすのと同じ）。
 * となりの面の「つなぐ辺に垂直な長さ」は、f の法線の向きの箱の長さになる。
 */
export function step(dims: Dims, f: FaceState, dir: Dir): FaceState {
  const { rect: r, n, u, v, o } = f;
  const d = ext(dims, n);
  switch (dir) {
    case 'R': return { rect: { x: r.x + r.w, y: r.y, w: d, h: r.h }, n: u, u: neg(n), v, o: addV(o, mul(u, r.w)) };
    case 'L': return { rect: { x: r.x - d, y: r.y, w: d, h: r.h }, n: neg(u), u: n, v, o: addV(o, mul(n, -d)) };
    case 'D': return { rect: { x: r.x, y: r.y + r.h, w: r.w, h: d }, n: v, u, v: neg(n), o: addV(o, mul(v, r.h)) };
    case 'U': return { rect: { x: r.x, y: r.y - d, w: r.w, h: d }, n: neg(v), u, v: n, o: addV(o, mul(n, -d)) };
  }
}

/** 最初の面（底の面。横 dims[0] × たて dims[1]）を (x, y) に置く */
export function baseFace(dims: Dims, x = 0, y = 0): FaceState {
  return { rect: { x, y, w: dims[0], h: dims[1] }, n: [0, 0, -1], u: [1, 0, 0], v: [0, 1, 0], o: [0, 0, 0] };
}

/** 展開図の点 (px, py) が、面 f を組み立てたとき箱の どの点になるか */
export function pointOn(f: FaceState, px: number, py: number): V3 {
  return addV(addV(f.o, mul(f.u, px - f.rect.x)), mul(f.v, py - f.rect.y));
}

export const overlaps = (a: Rect, b: Rect): boolean =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

export const sameRect = (a: Rect, b: Rect): boolean => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

export const rectContainsPt = (r: Rect, px: number, py: number): boolean =>
  px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;

/** 展開図（面の状態と、つながり方の木） */
export interface Net {
  dims: Dims;
  faces: FaceState[];
  /** faces[i] の親（つながっている面）。最初の面は -1 */
  parent: number[];
}

/**
 * でたらめに面をつないで、箱の展開図を1つ作る。重なったり、同じ面を2回使ったりしたら作り直す。
 * 6つの面がそろうまでつなぐ。
 */
export function randomNet(dims: Dims, rand: () => number = Math.random): Net {
  for (let t = 0; t < 500; t++) {
    const faces: FaceState[] = [baseFace(dims)];
    const parent: number[] = [-1];
    let guard = 0;
    while (faces.length < 6 && guard++ < 200) {
      const pi = Math.floor(rand() * faces.length);
      const dir = DIRS[Math.floor(rand() * 4)] as Dir;
      const nf = step(dims, faces[pi] as FaceState, dir);
      if (faces.some((f) => v3key(f.n) === v3key(nf.n))) continue;
      if (faces.some((f) => overlaps(f.rect, nf.rect))) continue;
      faces.push(nf);
      parent.push(pi);
    }
    if (faces.length === 6) return normalizeNet({ dims, faces, parent });
  }
  throw new Error('randomNet: 展開図が作れません');
}

/** 左上が (0,0) になるようにずらす */
export function normalizeNet(net: Net, mx = 0, my = 0): Net {
  const minX = Math.min(...net.faces.map((f) => f.rect.x));
  const minY = Math.min(...net.faces.map((f) => f.rect.y));
  return { ...net, faces: net.faces.map((f) => ({ ...f, rect: { ...f.rect, x: f.rect.x - minX + mx, y: f.rect.y - minY + my } })) };
}

export function netBounds(rects: Rect[]): { w: number; h: number } {
  return {
    w: Math.max(...rects.map((r) => r.x + r.w)) - Math.min(...rects.map((r) => r.x)),
    h: Math.max(...rects.map((r) => r.y + r.h)) - Math.min(...rects.map((r) => r.y)),
  };
}

/** 長方形が マス単位でしめる場所（"x,y" の集合） */
export function cellsOf(rects: Rect[]): Set<string> {
  const s = new Set<string>();
  for (const r of rects) for (let i = 0; i < r.w; i++) for (let j = 0; j < r.h; j++) s.add(`${r.x + i},${r.y + j}`);
  return s;
}
export const cellKey = (cells: Iterable<string>): string => [...cells].sort().join(';');

/**
 * いま置いてある面（given）に面をつないで、展開図を完成させる方法をすべて数える。
 * gw × gh マスの方眼からはみ出すものは数えない。返すのは「しめるマスの集合」の文字列（cellKey）。
 */
export function completions(dims: Dims, given: FaceState[], gw: number, gh: number): string[] {
  const out = new Set<string>();
  const inGrid = (r: Rect) => r.x >= 0 && r.y >= 0 && r.x + r.w <= gw && r.y + r.h <= gh;
  const seen = new Set<string>();
  const rec = (faces: FaceState[]) => {
    const sig = faces.map((f) => `${f.rect.x},${f.rect.y},${f.rect.w},${f.rect.h}`).sort().join('|');
    if (seen.has(sig)) return;
    seen.add(sig);
    if (faces.length === 6) { out.add(cellKey(cellsOf(faces.map((f) => f.rect)))); return; }
    for (const f of faces) {
      for (const dir of DIRS) {
        const nf = step(dims, f, dir);
        if (!inGrid(nf.rect)) continue;
        if (faces.some((g) => v3key(g.n) === v3key(nf.n))) continue;
        if (faces.some((g) => overlaps(g.rect, nf.rect))) continue;
        rec([...faces, nf]);
      }
    }
  };
  rec(given);
  return [...out];
}

/** 2つの長方形が、辺をまるごと共有してとなり合っているか。となりなら a から見た向き */
function adjacentDir(a: Rect, b: Rect): Dir | null {
  if (a.y === b.y && a.h === b.h) {
    if (a.x + a.w === b.x) return 'R';
    if (b.x + b.w === a.x) return 'L';
  }
  if (a.x === b.x && a.w === b.w) {
    if (a.y + a.h === b.y) return 'D';
    if (b.y + b.h === a.y) return 'U';
  }
  return null;
}

/** 最初の面の置き方（向き）をすべて。u×v＝−n の関係を保つ */
function startStates(dims: Dims, r: Rect): FaceState[] {
  const axes: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
  const out: FaceState[] = [];
  for (const u of axes) for (const v of axes) {
    if (Math.abs(u[0] * v[0] + u[1] * v[1] + u[2] * v[2]) > 0) continue;
    if (ext(dims, u) !== r.w || ext(dims, v) !== r.h) continue;
    const n = neg(cross(u, v));
    // 左上の点: n の軸は（正なら長さ・負なら0）、u・v の軸は（正なら0・負なら長さ）
    const o: V3 = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      if (n[k] === 1) o[k] = dims[k] as number;
      if (u[k] === -1 || v[k] === -1) o[k] = dims[k] as number;
    }
    out.push({ rect: r, n, u, v, o });
  }
  return out;
}

/**
 * 長方形の集まりが、箱（dims）の展開図になっているかを、組み立てを計算して調べる。
 * なっていれば各面の状態（rects と同じ並び）を返す。なっていなければ null。
 * つながり方（どの辺で折るか）は、となり合う辺から木をすべて作って試す。
 */
export function foldRects(dims: Dims, rects: Rect[]): FaceState[] | null {
  if (rects.length !== 6) return null;
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) if (overlaps(rects[i] as Rect, rects[j] as Rect)) return null;
  const edges: [number, number, Dir][] = [];
  for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) {
    const d = adjacentDir(rects[i] as Rect, rects[j] as Rect);
    if (d) edges.push([i, j, d]);
  }
  if (edges.length < 5) return null;
  const opposite: Record<Dir, Dir> = { R: 'L', L: 'R', D: 'U', U: 'D' };
  // 辺の組から5本を選ぶ（木になるものだけ）
  const m = edges.length;
  const pick: number[] = [];
  let found: FaceState[] | null = null;
  const tryTree = () => {
    const adj: [number, Dir][][] = Array.from({ length: 6 }, () => []);
    for (const k of pick) {
      const [a, b, d] = edges[k] as [number, number, Dir];
      adj[a]!.push([b, d]);
      adj[b]!.push([a, opposite[d]]);
    }
    for (const s0 of startStates(dims, rects[0] as Rect)) {
      const st: (FaceState | null)[] = [s0, null, null, null, null, null];
      const queue = [0];
      let ok = true;
      while (queue.length && ok) {
        const a = queue.shift() as number;
        for (const [b, d] of adj[a]!) {
          if (st[b]) continue;
          const nf = step(dims, st[a] as FaceState, d);
          if (!sameRect(nf.rect, rects[b] as Rect)) { ok = false; break; }
          st[b] = nf;
          queue.push(b);
        }
      }
      if (!ok || st.some((x) => !x)) continue;
      const normals = new Set(st.map((x) => v3key((x as FaceState).n)));
      if (normals.size === 6) { found = st as FaceState[]; return; }
    }
  };
  const rec = (start: number) => {
    if (found) return;
    if (pick.length === 5) { tryTree(); return; }
    for (let k = start; k < m; k++) { pick.push(k); rec(k + 1); pick.pop(); if (found) return; }
  };
  rec(0);
  return found;
}

/** マス（1×1）の集まりが立方体の展開図か */
export function isCubeNet(cells: { x: number; y: number }[]): boolean {
  return foldRects([1, 1, 1], cells.map((c) => ({ x: c.x, y: c.y, w: 1, h: 1 }))) !== null;
}

/** 6マスがつながった形（ヘキソミノ）をでたらめに作る。左上を (0,0) にそろえる */
export function randomHexomino(rand: () => number = Math.random): { x: number; y: number }[] {
  const cells = [{ x: 0, y: 0 }];
  const has = (x: number, y: number) => cells.some((c) => c.x === x && c.y === y);
  while (cells.length < 6) {
    const c = cells[Math.floor(rand() * cells.length)] as { x: number; y: number };
    const d = [[1, 0], [-1, 0], [0, 1], [0, -1]][Math.floor(rand() * 4)] as [number, number];
    const nx = c.x + d[0], ny = c.y + d[1];
    if (!has(nx, ny)) cells.push({ x: nx, y: ny });
  }
  const mx = Math.min(...cells.map((c) => c.x)), my = Math.min(...cells.map((c) => c.y));
  return cells.map((c) => ({ x: c.x - mx, y: c.y - my }));
}

/** 形の向き・位置をそろえた名前（回転・裏返しで同じものは同じ名前） */
export function shapeId(cells: { x: number; y: number }[]): string {
  const vars: string[] = [];
  let cur = cells;
  for (let flip = 0; flip < 2; flip++) {
    for (let r = 0; r < 4; r++) {
      cur = cur.map((c) => ({ x: -c.y, y: c.x }));
      const mx = Math.min(...cur.map((c) => c.x)), my = Math.min(...cur.map((c) => c.y));
      vars.push(cur.map((c) => `${c.x - mx},${c.y - my}`).sort().join(';'));
    }
    cur = cur.map((c) => ({ x: -c.x, y: c.y }));
  }
  return vars.sort()[0] as string;
}

/* ---------------- 展開図のまわりの点・辺（組み立てで重なるもの） ---------------- */

export interface NetPoint { x: number; y: number; label: string; corner: string }
export interface NetEdge { a: number; b: number; key: string }

/**
 * 展開図の外まわりの格子点を、ぐるっと回る順に並べる（立方体の展開図＝1×1のマス用）。
 * corner は、組み立てたときに重なる箱の頂点（同じ corner の点どうしが重なる）。
 */
export function boundaryPoints(net: Net): { points: { x: number; y: number; corner: string }[]; edges: { a: number; b: number; edge: string }[] } {
  const cells = cellsOf(net.faces.map((f) => f.rect));
  const has = (x: number, y: number) => cells.has(`${x},${y}`);
  // 外まわりの単位の辺を、マスを右手に見る向き（時計回り）に並べる
  const next = new Map<string, [number, number]>();
  for (const k of cells) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    if (!has(x, y - 1)) next.set(`${x},${y}`, [x + 1, y]);          // 上の辺: 左→右
    if (!has(x + 1, y)) next.set(`${x + 1},${y}`, [x + 1, y + 1]);  // 右の辺: 上→下
    if (!has(x, y + 1)) next.set(`${x + 1},${y + 1}`, [x, y + 1]);  // 下の辺: 右→左
    if (!has(x - 1, y)) next.set(`${x},${y + 1}`, [x, y]);          // 左の辺: 下→上
  }
  // 左上のいちばん上の点から回りはじめる
  const startKey = [...next.keys()].sort((a, b) => {
    const [ax, ay] = a.split(',').map(Number) as [number, number];
    const [bx, by] = b.split(',').map(Number) as [number, number];
    return ay - by || ax - bx;
  })[0] as string;
  const order: [number, number][] = [];
  let cur = startKey;
  for (let g = 0; g < 100; g++) {
    const [x, y] = cur.split(',').map(Number) as [number, number];
    order.push([x, y]);
    const nx = next.get(cur);
    if (!nx) break;
    cur = `${nx[0]},${nx[1]}`;
    if (cur === startKey) break;
  }
  const cornerOf = (px: number, py: number): string => {
    for (const f of net.faces) if (rectContainsPt(f.rect, px, py)) return v3key(pointOn(f, px, py));
    return '?';
  };
  const points = order.map(([x, y]) => ({ x, y, corner: cornerOf(x, y) }));
  const edges = points.map((p, i) => {
    const q = points[(i + 1) % points.length] as typeof p;
    return { a: i, b: (i + 1) % points.length, edge: [p.corner, q.corner].sort().join('|') };
  });
  return { points, edges };
}

/** 面 i に平行な面（向かい合う面）の番号 */
export function oppositeFace(net: Net, i: number): number {
  const n = (net.faces[i] as FaceState).n;
  return net.faces.findIndex((f) => v3key(f.n) === v3key(neg(n)));
}

/* ================================================================== */
/* 見取図の直方体（頂点 A〜H）                                             */
/* ================================================================== */

export const VERTS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const;
export type VName = (typeof VERTS)[number];

/** 頂点の位置（横 x・たて(奥) y・高さ z を 0/1 で） */
export const VPOS: Record<VName, V3> = {
  A: [0, 0, 1], B: [1, 0, 1], C: [1, 1, 1], D: [0, 1, 1],
  E: [0, 0, 0], F: [1, 0, 0], G: [1, 1, 0], H: [0, 1, 0],
};

/** 12本の辺（名前は教科書の書き方にそろえる） */
export const EDGES: readonly [VName, VName][] = [
  ['A', 'B'], ['D', 'C'], ['E', 'F'], ['H', 'G'],   // 横
  ['A', 'D'], ['B', 'C'], ['E', 'H'], ['F', 'G'],   // たて（奥行き）
  ['A', 'E'], ['B', 'F'], ['C', 'G'], ['D', 'H'],   // 高さ
];

/** 6つの面（名前は頂点を回る順） */
export const FACES = [
  { id: 'top', name: 'ABCD', n: [0, 0, 1] as V3 },
  { id: 'bottom', name: 'EFGH', n: [0, 0, -1] as V3 },
  { id: 'front', name: 'ABFE', n: [0, -1, 0] as V3 },
  { id: 'back', name: 'DCGH', n: [0, 1, 0] as V3 },
  { id: 'right', name: 'BCGF', n: [1, 0, 0] as V3 },
  { id: 'left', name: 'AEHD', n: [-1, 0, 0] as V3 },
] as const;
export type FaceId = (typeof FACES)[number]['id'];

export const edgeName = (e: readonly [VName, VName]): string => `${e[0]}${e[1]}`;

const edgeDir = (e: readonly [VName, VName]): number => {
  const a = VPOS[e[0]], b = VPOS[e[1]];
  return a[0] !== b[0] ? 0 : a[1] !== b[1] ? 1 : 2;
};
export const faceOf = (id: FaceId) => FACES.find((f) => f.id === id) as (typeof FACES)[number];
const faceAxis = (id: FaceId): number => faceOf(id).n.findIndex((x) => x !== 0);
const faceVerts = (id: FaceId): VName[] => faceOf(id).name.split('') as VName[];

/** 辺 e に平行な辺（同じ向きの ほかの3本） */
export function parallelEdges(e: readonly [VName, VName]): [VName, VName][] {
  return EDGES.filter((x) => edgeName(x) !== edgeName(e) && edgeDir(x) === edgeDir(e)) as [VName, VName][];
}
/** 辺 e に垂直な辺（e と交わって直角になる4本。ねじれの位置の辺は入れない＝4年の約束） */
export function perpendicularEdges(e: readonly [VName, VName]): [VName, VName][] {
  return EDGES.filter((x) => edgeDir(x) !== edgeDir(e) && (x.includes(e[0]) || x.includes(e[1]))) as [VName, VName][];
}
/** 面 f に垂直な辺（法線の向きの4本） */
export function edgesPerpToFace(f: FaceId): [VName, VName][] {
  return EDGES.filter((x) => edgeDir(x) === faceAxis(f)) as [VName, VName][];
}
/** 面 f に平行な辺（向かい合う面の4本の辺） */
export function edgesParallelToFace(f: FaceId): [VName, VName][] {
  const opp = oppositeOf(f);
  const vs = faceVerts(opp);
  return EDGES.filter((x) => vs.includes(x[0]) && vs.includes(x[1])) as [VName, VName][];
}
/** 面 f の上にある辺 */
export function edgesOnFace(f: FaceId): [VName, VName][] {
  const vs = faceVerts(f);
  return EDGES.filter((x) => vs.includes(x[0]) && vs.includes(x[1])) as [VName, VName][];
}
export function oppositeOf(f: FaceId): FaceId {
  const n = faceOf(f).n;
  return (FACES.find((x) => v3key(x.n) === v3key(neg(n))) as (typeof FACES)[number]).id;
}
export function perpendicularFaces(f: FaceId): FaceId[] {
  const ax = faceAxis(f);
  return FACES.filter((x) => faceAxis(x.id) !== ax).map((x) => x.id);
}

/** 見取図で見えない頂点（右上から見る＝左奥の下 H、左上から見る＝右奥の下 G） */
export const hiddenVertex = (view: 'right' | 'left'): VName => (view === 'right' ? 'H' : 'G');
export const hiddenEdges = (view: 'right' | 'left'): [VName, VName][] =>
  EDGES.filter((e) => e.includes(hiddenVertex(view))) as [VName, VName][];

/** 頂点の本当の位置（cm）。dims = [横, たて, 高さ] */
export function vertexAt(v: VName, dims: Dims): V3 {
  const p = VPOS[v];
  return [p[0] * dims[0], p[1] * dims[1], p[2] * dims[2]];
}

/* ================================================================== */
/* 格子の線分（見取図をかく・リボンの線）                                    */
/* ================================================================== */

export interface Pt { x: number; y: number }
export interface Seg { a: Pt; b: Pt; dashed?: boolean }

const gcd = (a: number, b: number): number => (b === 0 ? Math.abs(a) : gcd(b, a % b));

/**
 * 線分を、格子点から格子点までの いちばん短い かけらに分ける。
 * 2回に分けてかいた線も、1本でかいた線も、同じかけらの集まりになる（くらべやすくするため）。
 */
export function pieces(s: Seg): string[] {
  const dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
  const g = gcd(Math.abs(dx), Math.abs(dy));
  if (g === 0) return [];
  const sx = dx / g, sy = dy / g;
  const out: string[] = [];
  for (let i = 0; i < g; i++) {
    const p = { x: s.a.x + sx * i, y: s.a.y + sy * i };
    const q = { x: p.x + sx, y: p.y + sy };
    const [m, n] = p.x < q.x || (p.x === q.x && p.y < q.y) ? [p, q] : [q, p];
    out.push(`${m.x},${m.y}-${n.x},${n.y}${s.dashed ? ':d' : ''}`);
  }
  return out;
}
export const piecesOf = (segs: Seg[]): Set<string> => new Set(segs.flatMap(pieces));
export const stripStyle = (k: string): string => k.replace(/:d$/, '');

/** 展開図の線: 外まわりは実線、面と面のさかいめは点線（単位の長さに分けて返す） */
export function netLines(rects: Rect[]): { solid: Seg[]; dashed: Seg[] } {
  const owner = new Map<string, number>();
  rects.forEach((r, i) => { for (let a = 0; a < r.w; a++) for (let b = 0; b < r.h; b++) owner.set(`${r.x + a},${r.y + b}`, i); });
  const solid: Seg[] = [], dashed: Seg[] = [];
  for (const [k, i] of owner) {
    const [x, y] = k.split(',').map(Number) as [number, number];
    const sides: [number, number, Seg][] = [
      [x, y - 1, { a: { x, y }, b: { x: x + 1, y } }],
      [x, y + 1, { a: { x, y: y + 1 }, b: { x: x + 1, y: y + 1 } }],
      [x - 1, y, { a: { x, y }, b: { x, y: y + 1 } }],
      [x + 1, y, { a: { x: x + 1, y }, b: { x: x + 1, y: y + 1 } }],
    ];
    for (const [nx, ny, s] of sides) {
      const j = owner.get(`${nx},${ny}`);
      if (j === undefined) solid.push(s);
      else if (j !== i && (ny > y || nx > x)) dashed.push({ ...s, dashed: true });
    }
  }
  return { solid, dashed };
}
