// このファイルは単元アプリ syo4-tyokuhoutaitorippoutai の src/lib/question.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 「直方体と立方体」の問題の型と、数の道具。
 *
 * このアプリの問題は、練習・本番テスト・実力の階段・ボス戦のどれでも
 * 同じ形（Question）で作り、同じ画面（QuestionRound）で解く。
 * 「答えの入れ方」は問題の中の steps に並べる（面の数 → 辺の数 → 頂点の数、のように）。
 *
 * 作図（展開図・見取図・点の位置）は、紙にかく代わりに方眼をタップして答える:
 *   paint  … 展開図の続き。方眼のマスをぬって面を足す（正解は組み立てを計算して出す）
 *   sketch … 見取図の続き・リボンの線。格子点を2つタップして線をひく（実線／点線）
 *   dash   … 見取図の見えない辺を、タップして点線にする
 *   point  … 平面の点の位置。格子点をタップして点をかく
 *   multi  … 「全部書きましょう」。あてはまるものを全部えらぶ
 *   edges  … 辺を答える問い。図の頂点の文字を2つタップして「辺○○」を組み立てる（EH と HE は同じ辺）。
 *            練習では2回まちがえたら足場（scaffold＝えらぶ形）を出す。本番テスト・実力の階段は組み立てだけ。
 */
import type { ScratchOp } from 'learning-app-kit/react';
import type { Dims, FaceId, Rect, Seg, Pt } from './solid';

/* ------------------------------------------------------------------ */
/* 図                                                                   */
/* ------------------------------------------------------------------ */

export interface LabeledPt { x: number; y: number; label: string }

export type Figure =
  /** 直方体・立方体の見取図（頂点 A〜H、面の記号、長さ） */
  | {
      type: 'cuboid';
      dims: Dims;
      view: 'right' | 'left';
      letters?: boolean;
      faceLabels?: Partial<Record<FaceId, string>>;
      /** 長さを書くか（横・たて・高さ） */
      dimLabels?: boolean;
      /** 太く色をつける辺（'AB' など） */
      highlight?: string[];
      /** 色をつける面 */
      shadeFace?: FaceId;
      /** リボンをかけた箱 */
      ribbon?: boolean;
      /** 見えない辺も実線でかく（まちがいさがし用） */
      allSolid?: boolean;
      /** 頂点に印をつける */
      markVertex?: string;
    }
  /** 展開図（方眼つき） */
  | {
      type: 'net';
      rects: Rect[];
      /** 1マスの長さの表示（'1cm' など） */
      unitLabel?: string;
      faceLabels?: string[];
      points?: LabeledPt[];
      /** 方眼を出すか */
      grid?: boolean;
      /** 色をつける面の番号 */
      shade?: number[];
      /** 太くする辺（点の番号の組） */
      highlightEdge?: [number, number];
      highlightPoint?: number;
      /** 線（リボンなど） */
      lines?: Seg[];
    }
  /** 平面の点の位置（方眼・目もり） */
  | { type: 'plane'; w: number; h: number; points: LabeledPt[] }
  /** 厚紙のカード */
  | { type: 'cards'; cards: { label: string; w: number; h: number }[] }
  /** 表 */
  | { type: 'table'; headers: string[]; rows: (string | number)[][] };

/* ------------------------------------------------------------------ */
/* けいさんらん                                                          */
/* ------------------------------------------------------------------ */

export type PadSpec = { kind: 'calc'; ops: ScratchOp[] };

/* ------------------------------------------------------------------ */
/* 答えの入れ方（ステップ）                                               */
/* ------------------------------------------------------------------ */

interface StepBase {
  label: string;
  prompt: string;
  /** 段階ヒント。1回目から答えを見せない（3段） */
  hints: string[];
}

export interface NumStep extends StepBase {
  kind: 'num';
  answer: number;
  unit?: string;
  /** 欄の前に出す ことば（「横」「たて」など） */
  before?: string;
  /** 典型誤答の診断。正答を入れたときは必ず null を返すこと */
  diagnose?: (v: number) => string | null;
  pad?: PadSpec;
}

export interface ChoiceStep extends StepBase {
  kind: 'choice';
  choices: string[];
  correct: number;
  /** 正解したあとに出す理由（練習のときだけ） */
  why: string;
  /** 選んだまちがいへの助言（choices と同じ並び。正解の位置は null） */
  wrong?: (string | null)[];
}

/** あてはまるものを全部えらぶ */
export interface MultiStep extends StepBase {
  kind: 'multi';
  options: string[];
  /** 正解の番号（すべて） */
  correct: number[];
  why: string;
  /** えらんだ組へのひとこと。正解の組では必ず null を返すこと */
  diagnose?: (picked: number[]) => string | null;
}

/** 展開図の続き。マスをぬって面を足す */
export interface PaintStep extends StepBase {
  kind: 'paint';
  dims: Dims;
  /** 方眼の大きさ（マス） */
  gw: number;
  gh: number;
  /** もうかいてある面 */
  given: Rect[];
  /** 正しい展開図になる「しめるマスの集合」（given もふくむ）。組み立てを計算して出したもの */
  answers: string[];
  /** 足りない面の数（あと何面） */
  missing: number;
  unitLabel: string;
}

/** 格子点をタップして線をひく */
export interface SketchStep extends StepBase {
  kind: 'sketch';
  gw: number;
  gh: number;
  given: Seg[];
  /** ひくべき線（点線は dashed） */
  expected: Seg[];
  /** 点線をつかう問題か */
  useDashed: boolean;
  /** 目印の点（頂点など） */
  marks?: LabeledPt[];
}

/** 見取図の辺をタップして点線にする */
export interface DashStep extends StepBase {
  kind: 'dash';
  dims: Dims;
  view: 'right' | 'left';
  /** 点線にする辺の名前（'EH' など） */
  answer: string[];
}

/** 格子点をタップして点をかく */
export interface PointStep extends StepBase {
  kind: 'point';
  w: number;
  h: number;
  points: LabeledPt[];
  answer: Pt;
  answerLabel: string;
  diagnose?: (p: Pt) => string | null;
}

/**
 * 辺を、頂点の文字を2つタップして組み立てて答える（紙の「辺ADに平行な辺を全部書きましょう」と同じ形）。
 * 辺の名前は文字を並べかえても同じ辺（EH と HE）。リストの順番も問わない。
 */
export interface EdgesStep extends StepBase {
  kind: 'edges';
  /** 図に出ている頂点の文字（ここだけを出す。ダミーは混ぜない） */
  letters: string[];
  /** 図にある本当の辺（文字を並べかえて小さい順にした名前。'EH'）。これに無い組は足せない */
  edges: string[];
  /** 正解の辺（同じ形の名前）。1本なら答えを1本だけ組み立てる */
  correct: string[];
  /** 組み立てた辺の組へのひとこと。正解の組では必ず null を返すこと（名前は小さい順にした形で渡す） */
  diagnose?: (picked: string[]) => string | null;
  /** 足場。練習で2回まちがえたら出す、いまの「えらぶ」形（本番テスト・実力の階段では出さない） */
  scaffold: MultiStep | ChoiceStep;
}

export type Step = NumStep | ChoiceStep | MultiStep | EdgesStep | PaintStep | SketchStep | DashStep | PointStep;

/* ------------------------------------------------------------------ */
/* 問題                                                                  */
/* ------------------------------------------------------------------ */

export interface Question {
  /** 記録の名前。カタログの skill_id と同じ文字列にする */
  skillId: string;
  /** 本番テストの答案・学習のきろくに出す短い題 */
  title: string;
  text: string;
  emoji?: string;
  figure?: Figure;
  steps: Step[];
  /** 全部できたあとに出す まとめ */
  summary: string;
  /** 学習のきろくに出す1行 */
  label: string;
  /** 答案に残す問題と答え */
  q: string;
  a: string;
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

/** 入力された文字を数にする。空は null */
export function toNum(s: string): number | null {
  if (s === '') return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

export const sameSet = (a: readonly number[], b: readonly number[]): boolean =>
  a.length === b.length && a.every((x) => b.includes(x));
