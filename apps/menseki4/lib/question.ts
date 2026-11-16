// このファイルは単元アプリ syo4-mennsekinokurabekatatoarawasikata の src/lib/question.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 「面積のくらべ方と表し方」の問題の型と、数の道具。
 *
 * このアプリの問題は、練習・本番テスト・実力の階段・ボス戦のどれでも
 * 同じ形（Question）で作り、同じ画面（QuestionRound）で解く。
 * 「答えの入れ方」は問題の中の steps に並べる（式 → 答え、のように）。
 *
 * 図は、検査（scripts/verify-problems.ts）が図そのものから面積を計算し直せる形で持つ:
 *   - 方眼（grid）… マス1つずつ（全部 or ななめ半分）。数え直せる
 *   - 形（shape）  … 長さの単位の座標の多角形。ひも掛けの公式で面積を出し直せる
 */
import type { ScratchOp } from 'learning-app-kit/react';

/* ------------------------------------------------------------------ */
/* 図                                                                   */
/* ------------------------------------------------------------------ */

/** ななめ半分のマス。corner は、三角が 残っている かど（ne＝右上 の半分） */
export type HalfCorner = 'ne' | 'nw' | 'se' | 'sw';

export interface GridCell {
  x: number;
  y: number;
  /** なし＝マス全部。あり＝ななめ半分 */
  half?: HalfCorner;
}

export interface GridShape {
  cells: GridCell[];
  /** 図の中に書く記号（あ・い） */
  name?: string;
  color?: string;
}

/** 長さの線（寸法）。a→b の辺の横に text を書く。side は書く側 */
export interface Dim {
  a: [number, number];
  b: [number, number];
  text: string;
  side: 'top' | 'bottom' | 'left' | 'right';
}

export interface Poly {
  pts: [number, number][];
  /** 'main'＝面積を求める形 / 'road'＝道（花をうえない）/ 'cut'＝のぞく部分 / 'ghost'＝点線のわく */
  role?: 'main' | 'road' | 'cut' | 'ghost';
  label?: string;
}

export type Figure =
  /** 1cm の方眼。shapes をマスでぬる */
  | { type: 'grid'; cols: number; rows: number; shapes: GridShape[]; showUnit?: boolean }
  /** 長方形・組み合わせた形。座標は長さの単位（y は下向き） */
  | { type: 'shape'; polys: Poly[]; dims: Dim[]; center?: string; notToScale?: boolean }
  /** 表 */
  | { type: 'table'; headers: string[]; rows: (string | number)[][] };

/* ------------------------------------------------------------------ */
/* けいさんらん                                                          */
/* ------------------------------------------------------------------ */

/** kit のけいさんらん（かけ算・わり算など）。数は子どもが入れる */
export interface PadSpec { kind: 'calc'; ops: ScratchOp[]; initial?: { op: ScratchOp; a: string; b: string } }

/* ------------------------------------------------------------------ */
/* 答えの入れ方（ステップ）                                               */
/* ------------------------------------------------------------------ */

export interface NumStep {
  kind: 'num';
  label: string;
  prompt: string;
  answer: number;
  unit?: string;
  decimal?: boolean;
  /** 段階ヒント。1回目から答えを見せない（3段） */
  hints: string[];
  /** 典型誤答の診断。正答を入れたときは必ず null を返すこと */
  diagnose?: (v: number) => string | null;
  pad?: PadSpec;
  /** 足場: 2回まちがえたら出す「選ぶ」形（本番テスト・実力の階段では出さない。ボス戦はこちらで出す） */
  scaffold?: ChoiceStep;
}

export interface ChoiceStep {
  kind: 'choice';
  label: string;
  prompt: string;
  choices: string[];
  correct: number;
  why: string;
  wrong?: (string | null)[];
  hints: string[];
  pad?: PadSpec;
}

/**
 * □に数を入れる欄（式・表）。parts の { slot: i } が i 番目の□。
 * accept のどれか1つと全部の□が一致したら正解（たて×横 と 横×たて を両方みとめる、など）。
 */
export type FillToken = string | number | { slot: number };
export interface FillStep {
  kind: 'fill';
  label: string;
  prompt: string;
  layout: { type: 'expr'; parts: FillToken[] } | { type: 'table'; rows: FillToken[][] };
  /** 正解の組（1つめが代表。答案にはこれを書く） */
  accept: number[][];
  hints: string[];
  /** まちがえたときの ひとこと。正解の組では null を返すこと */
  diagnose?: (v: number[]) => string | null;
  pad?: PadSpec;
}

/** 方眼のマスをタップして形をつくる（作図） */
export interface CellsStep {
  kind: 'cells';
  label: string;
  prompt: string;
  cols: number;
  rows: number;
  /** 作った形を判定する。正しければ null、ちがえば ひとこと */
  check: (cells: { x: number; y: number }[]) => string | null;
  /** 正しい形の例（検査で check が通ることを確かめる） */
  example: { x: number; y: number }[];
  hints: string[];
}

/** 折れ線グラフに点をうつ（作図） */
export interface PlotStep {
  kind: 'plot';
  label: string;
  prompt: string;
  xLabel: string;
  yLabel: string;
  xMax: number;
  yMax: number;
  yStep: number;
  points: { x: number; y: number }[];
  hints: string[];
}

/**
 * カードを置いて組み立てる（ことば・単位・数のカード）。手書き文字は使わない。
 * layout の { slot: i } が i 番目の置き場所。cards には ダミー（よけいなカード）を混ぜる。
 * accept のどれか1つと、置いたカードの文字が全部一致したら正解（同じ意味の別の書き方は accept に全部入れる）。
 * カードは1まいずつしか使えない（同じ文字が要るときは、同じカードを2まい入れる）。
 */
export interface BuildStep {
  kind: 'build';
  label: string;
  prompt: string;
  layout: FillToken[];
  cards: string[];
  accept: string[][];
  hints: string[];
  /** まちがいの置き方への ひとこと。正解の置き方では null を返すこと */
  diagnose?: (v: string[]) => string | null;
  /** 足場: 2回まちがえたら出す「選ぶ」形（本番テスト・実力の階段では出さない。ボス戦はこちらで出す） */
  scaffold?: ChoiceStep;
  pad?: undefined;
}

/** 置いたカードが正解か（同じ意味の別の書き方も accept に入っている） */
export function buildOk(step: Pick<BuildStep, 'accept'>, vals: readonly string[]): boolean {
  return step.accept.some((a) => a.length === vals.length && a.every((x, i) => x === vals[i]));
}

export type Step = NumStep | ChoiceStep | FillStep | CellsStep | PlotStep | BuildStep;

/* ------------------------------------------------------------------ */
/* 問題                                                                  */
/* ------------------------------------------------------------------ */

export interface Question {
  /** 記録の名前。カタログの skill_id と同じ文字列にする */
  skillId: string;
  title: string;
  text: string;
  emoji?: string;
  figure?: Figure;
  steps: Step[];
  summary: string;
  label: string;
  q: string;
  a: string;
  /**
   * 図から計算し直した面積と照合する値（図の座標の単位で）。
   * 検査が grid のマス・shape の多角形から面積を出し直して、これと比べる。
   */
  figArea?: number;
}

/* ------------------------------------------------------------------ */
/* 数の道具                                                              */
/* ------------------------------------------------------------------ */

export function rnd(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
export function pick<T>(a: readonly T[]): T {
  return a[Math.floor(Math.random() * a.length)] as T;
}
export function shuffle<T>(a: readonly T[]): T[] {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j] as T, r[i] as T];
  }
  return r;
}

export function clean(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

export function fmt(n: number): string {
  return String(clean(n));
}

export function toNum(s: string): number | null {
  const t = s.endsWith('.') ? s.slice(0, -1) : s;
  if (t === '' || t === '.') return null;
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

export function same(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-6;
}

/** ひも掛けの公式（多角形の面積） */
export function polyArea(pts: readonly [number, number][]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]!;
    const [x2, y2] = pts[(i + 1) % pts.length]!;
    s += x1 * y2 - x2 * y1;
  }
  return Math.abs(s) / 2;
}

/** 方眼の形の面積（マス全部＝1、ななめ半分＝0.5） */
export function gridArea(shape: GridShape): number {
  return shape.cells.reduce((a, c) => a + (c.half ? 0.5 : 1), 0);
}

/** 図の面積（main から cut・road をひく） */
export function figureArea(f: Figure): number | null {
  if (f.type === 'grid') return f.shapes.length === 1 ? gridArea(f.shapes[0]!) : null;
  if (f.type === 'shape') {
    let a = 0;
    for (const p of f.polys) {
      if (p.role === 'ghost') continue;
      const v = polyArea(p.pts);
      a += p.role === 'cut' || p.role === 'road' ? -v : v;
    }
    return clean(a);
  }
  return null;
}

/** 3けたごとに区切らず、そのまま（小4は 10000 のような数を読む練習も兼ねる） */
export function num(n: number): string {
  return fmt(n);
}
