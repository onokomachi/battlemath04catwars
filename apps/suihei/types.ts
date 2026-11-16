// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/types.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 単元「垂直、平行と四角形」で扱う図形の型。
 * 座標系は SVG と同じ「右がx＋・下がy＋」。1マス＝1（方眼）を基本単位とし、
 * 描画時に GeoFigure がスケールする。角度は「度」で、数学の慣習どおり反時計回りを正とするが、
 * y軸が下向きなので画面上は時計回りに見える点に注意（geometry.ts 内で吸収する）。
 */

export interface Pt {
  x: number;
  y: number;
}

/** 四角形の種類。判定・弁別の正解値であり、包含関係の判定にも使う。 */
export type QuadKind = 'square' | 'rect' | 'rhombus' | 'parallelogram' | 'trapezoid' | 'other';

export const QUAD_LABEL: Record<QuadKind, string> = {
  square: '正方形',
  rect: '長方形',
  rhombus: 'ひし形',
  parallelogram: '平行四辺形',
  trapezoid: '台形',
  other: 'どれでもない',
};

/** 2直線の位置関係。 */
export type LineRelation = 'perpendicular' | 'parallel' | 'crossing' | 'none';

/** 直線（線分として描画するが、数学的には両方向に無限に伸びる直線として扱う）。 */
export interface FigLine {
  id: string;
  /** 画面に実線で描く範囲 */
  a: Pt;
  b: Pt;
  /** 「あ」「い」などの記号ラベル */
  label?: string;
  /** 延長線を点線で描くか（垂直の判定で「延長すると交わる」を見せるときに使う） */
  extend?: number;
  color?: 'base' | 'accent' | 'accent2' | 'muted';
}

/** 図に置く点（作図の通過点など）。 */
export interface FigPoint {
  id: string;
  at: Pt;
  label?: string;
  color?: 'base' | 'accent' | 'accent2';
}

/** 多角形（四角形が主）。頂点は順に結ばれ、閉じる。 */
export interface FigPoly {
  id: string;
  pts: Pt[];
  /** 頂点につけるラベル（A,B,C,D など）。pts と同じ順・同じ長さ。 */
  vertexLabels?: string[];
  label?: string;
  /**
   * label を図形の中心ではなく **下** に置く。
   * 「正方形」「平行四辺形」のような長い名前を中心に置くと図形の線と重なって読めないので、
   * 名前をキャプションとして見せたいときはこれを使う。
   */
  labelBelow?: boolean;
  fill?: 'none' | 'accent' | 'accent2' | 'muted';
  /** 辺につける等長マーク。辺 i（pts[i]→pts[i+1]）に何本の斜線を引くか。 */
  tickMarks?: number[];
  /** 辺につける長さラベル（'6cm' など）。辺 i に対応。null で非表示。 */
  edgeLabels?: (string | null)[];
  /** 頂点につける角ラベル（'130°' や '？'）。pts と同じ順。null で非表示。 */
  angleLabels?: (string | null)[];
  /** 直角マークをつける頂点のインデックス */
  rightAngleAt?: number[];
  /** 対角線を引くか（0: pts[0]-pts[2], 1: pts[1]-pts[3]） */
  diagonals?: number[];
}

/** 敷き詰めに使う1枚のタイル配置。 */
export interface TilePlacement {
  /** 基本タイル形状の頂点（原点まわり） */
  shape: Pt[];
  at: Pt;
  /** 度。0/180 のみ使う（小4は「回す・裏返す」だけで敷き詰められる） */
  rotation: number;
  flipped?: boolean;
}

/**
 * 角のマーク。点 at で2方向 d1・d2 にはさまれた角に、円弧とラベルを描く。
 * 「平行線でできる角」のように、どの角のことを言っているのかを図で示すために使う。
 */
export interface FigAngleMark {
  at: Pt;
  d1: Pt;
  d2: Pt;
  label: string;
  color?: 'accent' | 'accent2';
}

/** 図の描画仕様。GeoFigure がこれだけを受け取って SVG を描く。 */
export interface FigureSpec {
  /** viewBox の幅・高さ（方眼のマス数） */
  w: number;
  h: number;
  /** 方眼を描くか */
  grid?: boolean;
  lines?: FigLine[];
  points?: FigPoint[];
  polys?: FigPoly[];
  angleMarks?: FigAngleMark[];
  /** 図の下に添える注記（「1マス＝1cm」など） */
  note?: string;
}
