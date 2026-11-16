// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/lib/problems/shapes.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 出題に使う四角形のカタログ。
 *
 * 単元の定義は複数条件のANDでできているので、「その条件だけ満たす反例」を必ず持たせる。
 *   - 等脚台形: 向かい合う一組の辺（左右の辺）の長さが等しいが、平行ではない
 *              →「向かい合う辺の長さが等しい＝平行四辺形」という誤概念の反例
 *   - たこ形  : 4辺のうち2組が等しいが、ひし形ではない（4辺すべてが等しくはない）
 *              →「2組の辺が等しい＝ひし形」という誤概念の反例
 *   - 一般四角形: 平行な組が1つもない
 *
 * すべての図形に **ランダムな回転** をかける。解説 p.203 が
 * 「図形の置き方をいろいろと変えても，その図形の名称が判断できるようにする」と
 * 明示しているためで、いつも同じ向きで出すとこの目標が丸ごと抜ける。
 */
import { Pt, QuadKind } from '../../types';
import {
  classifyQuad,
  fitInto,
  isConvexQuad,
  kiteFrom,
  parallelPairCount,
  parallelogramFrom,
  rectFrom,
  rhombusFrom,
  rotate,
  trapezoidFrom,
} from '../geometry';
import { pick, randInt } from './rng';

/** 出題上の図形の種類。QuadKind に「反例」を足したもの。 */
export type ShapeKind = 'square' | 'rect' | 'rhombus' | 'parallelogram' | 'trapezoid' | 'isoTrapezoid' | 'rightTrapezoid' | 'kite' | 'general';

/** 出題上の種類 → 正解として答えるべき名前。反例はすべて「どれでもない」か「台形」になる。 */
export const SHAPE_ANSWER: Record<ShapeKind, QuadKind> = {
  square: 'square',
  rect: 'rect',
  rhombus: 'rhombus',
  parallelogram: 'parallelogram',
  trapezoid: 'trapezoid',
  isoTrapezoid: 'trapezoid',
  rightTrapezoid: 'trapezoid',
  kite: 'other',
  general: 'other',
};

export interface Shape {
  kind: ShapeKind;
  /** 回転前の頂点（性質の計算に使う。回転しても性質は変わらないが、数値が読みやすい） */
  raw: Pt[];
  /** 実際に描く頂点（回転済み・viewBox に収めるのは呼び出し側） */
  pts: Pt[];
  rotation: number;
  /** 出題バリエーションの署名に使う */
  sig: string;
}

/** 種類を指定して1つ作る。回転角は 15度きざみでランダム。 */
export function makeShape(kind: ShapeKind): Shape {
  let raw: Pt[];
  let sig: string;

  switch (kind) {
    case 'square': {
      const s = randInt(3, 6);
      raw = rectFrom(s, s);
      sig = `sq:${s}`;
      break;
    }
    case 'rect': {
      const w = randInt(4, 7);
      const h = pick([2, 3, 4, 5].filter((v) => v !== w));
      raw = rectFrom(w, h);
      sig = `re:${w}:${h}`;
      break;
    }
    case 'rhombus': {
      const s = randInt(3, 6);
      const a = pick([40, 50, 60, 70, 110, 120, 130, 140]);
      raw = rhombusFrom(s, a);
      sig = `rh:${s}:${a}`;
      break;
    }
    case 'parallelogram': {
      const ab = randInt(4, 7);
      const ad = pick([2, 3, 4, 5].filter((v) => v !== ab));
      const a = pick([40, 50, 60, 70, 110, 120, 130, 140]);
      raw = parallelogramFrom(ab, ad, a);
      sig = `pg:${ab}:${ad}:${a}`;
      break;
    }
    case 'trapezoid': {
      // 一般の台形（左右の辺の長さも 傾きも ちがう）。
      // off = (bottom-top)/2 は等脚台形になり「対角線の長さが等しい」という別の性質を持って
      // しまう（対角線モジュールの正解表とくいちがう）ので、その値だけは避ける。
      const bottom = randInt(6, 8);
      const top = randInt(2, 4);
      const h = randInt(3, 5);
      const isoOff = (bottom - top) / 2;
      const offCandidates = [];
      for (let o = 1; o <= bottom - top - 1; o++) if (Math.abs(o - isoOff) > 1e-9) offCandidates.push(o);
      if (offCandidates.length === 0) return makeShape('trapezoid');
      const off = pick(offCandidates);
      raw = trapezoidFrom(top, bottom, h, off);
      sig = `tz:${top}:${bottom}:${h}:${off}`;
      break;
    }
    case 'rightTrapezoid': {
      const bottom = randInt(6, 8);
      const top = randInt(2, 4);
      const h = randInt(3, 5);
      raw = trapezoidFrom(top, bottom, h, 0);
      sig = `rt:${top}:${bottom}:${h}`;
      break;
    }
    case 'isoTrapezoid': {
      // 等脚台形。左右の辺（向かい合う一組）の長さが等しいのに平行四辺形ではない反例。
      // 左右の辺を等しくするには (bottom - top) が偶数である必要があるので、両方とも偶数から選ぶ。
      // 高さが (top+bottom)/2 になると対角線まで垂直に交わってしまい、
      // 「等脚台形の対角線は長さが等しいが垂直ではない」という前提が崩れるので、その高さは避ける。
      const bottom = pick([6, 8, 10]);
      const top = pick([2, 4]);
      const perpH = (top + bottom) / 2;
      const hCandidates = [3, 4, 5].filter((v) => Math.abs(v - perpH) > 1e-9);
      const h = pick(hCandidates);
      raw = trapezoidFrom(top, bottom, h, (bottom - top) / 2);
      sig = `it:${top}:${bottom}:${h}`;
      break;
    }
    case 'kite': {
      const a = randInt(2, 4);
      const b = pick([4, 5, 6].filter((v) => v !== a));
      const spread = randInt(2, 4);
      raw = kiteFrom(a, b, spread);
      sig = `ki:${a}:${b}:${spread}`;
      break;
    }
    case 'general': {
      // 平行な組が1つも無い凸四角形。条件を満たすまで作り直す。
      for (let i = 0; i < 200; i++) {
        const cand: Pt[] = [
          { x: 0, y: 0 },
          { x: randInt(6, 9), y: randInt(-1, 1) },
          { x: randInt(5, 8), y: -randInt(4, 6) },
          { x: randInt(-1, 2), y: -randInt(3, 5) },
        ];
        if (isConvexQuad(cand) && parallelPairCount(cand) === 0) {
          raw = cand;
          sig = `gn:${cand.map((p) => `${p.x},${p.y}`).join('_')}`;
          return finish(kind, raw, sig);
        }
      }
      // ここに来ることは実質ないが、型のために既定値を返す
      raw = [{ x: 0, y: 0 }, { x: 8, y: 1 }, { x: 6, y: -5 }, { x: 1, y: -3 }];
      sig = 'gn:fallback';
      break;
    }
  }
  return finish(kind, raw!, sig!);
}

function finish(kind: ShapeKind, raw: Pt[], sig: string): Shape {
  const rotation = pick([0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345]);
  return { kind, raw, pts: rotate(raw, rotation), rotation, sig: `${sig}@${rotation}` };
}

/**
 * 頂点につける記号のセット。
 * 教科書・市販テストは「ア・イ・ウ・エ」と「A・B・C・D」の両方を使う
 * （現物の啓林館テストは A/B/C/D、東京書籍は ア/イ/ウ/エ が中心）。
 * 片方しか経験していないと、テストで別の表記に出会ったときに
 * 「辺AD はどこか」を対応づける余計な負荷がかかるので、出題のたびに切り替える。
 */
export const VERTEX_LABEL_SETS: readonly (readonly string[])[] = [
  ['ア', 'イ', 'ウ', 'エ'],
  ['A', 'B', 'C', 'D'],
];

export function pickVertexLabels(): string[] {
  return [...pick(VERTEX_LABEL_SETS)];
}

/** 図形を viewBox に収めた頂点を返す。 */
export function fitShape(s: Shape, w: number, h: number, pad = 7): Pt[] {
  return fitInto(s.pts, w, h, pad);
}

/**
 * 作った図形が意図した種類になっているかを確かめる。
 * 「台形のつもりが平行四辺形になっていた」といった、動作テストでは見つからない
 * 種類の出題事故を、生成のたびに機械的に弾く。
 */
export function shapeIsValid(s: Shape): boolean {
  const actual = classifyQuad(s.raw);
  return actual === SHAPE_ANSWER[s.kind];
}

/** 有効な図形が出るまで作り直す（無限ループにならないよう回数を区切る）。 */
export function makeValidShape(kind: ShapeKind): Shape {
  for (let i = 0; i < 50; i++) {
    const s = makeShape(kind);
    if (shapeIsValid(s)) return s;
  }
  throw new Error(`makeValidShape: ${kind} の図形を作れなかった`);
}
