// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/lib/problems/draw.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * モジュール2「三角じょうぎラボ」＝ 作図。
 *
 * 現物の単元テストは6大問中3大問が作図（垂直・平行をひく／長方形をかく／平行四辺形をかく）で、
 * この単元でいちばん配点が大きい技能。数値を計算させる問題で代用してはいけない。
 *
 * 方針は2本立て:
 *  (1) 手順カード（order）… 三角じょうぎ・分度器・コンパスの「当て方・使う順番」を扱う。
 *      方眼のタップでは絶対に学べない部分をここで押さえる。
 *  (2) 方眼タップ（gridDraw）… 実際に頂点を置いて図を完成させる。
 *      「辺の長さ」「平行の向き」を自分で決める経験をさせる。
 *
 * ドラッグで三角じょうぎを再現しないのは、指の操作精度の問題で児童がいらだつため。
 * 手順を分解して順に決めさせれば、作図の思考（ねらい）は達成できる。
 */
import { FigLine, FigPoint, FigureSpec, Pt } from '../../types';
import { GeoProblem, LevelDef } from '../problemTypes';
import { add, eqPt, fitInto, isParallelDir, isPerpendicularDir, parallelogramFrom, rhombusFrom, sub } from '../geometry';
import { pick, randInt, shuffle } from './rng';

export type DrawLevel = 'draw-perp' | 'draw-para' | 'draw-order' | 'draw-rect' | 'draw-quad';

export const DRAW_LEVELS: LevelDef<DrawLevel>[] = [
  { id: 'draw-perp', label: '① 垂直な直線をひく', desc: '点を通って、直線に垂直な直線をひこう。' },
  { id: 'draw-para', label: '② 平行な直線をひく', desc: '点を通って、直線に平行な直線をひこう。' },
  { id: 'draw-order', label: '③ かき方の じゅんばん', desc: '三角じょうぎ・分度器を つかう手順を 正しい順に ならべよう。' },
  { id: 'draw-rect', label: '④ 長方形をかく', desc: 'たて・横の長さを 決めて 長方形をかこう。' },
  { id: 'draw-quad', label: '⑤ 四角形をかく', desc: '平行四辺形・ひし形・台形を 方眼にかこう。' },
];

/** 方眼のマス数。タップしやすさと図の見やすさのバランスで決めた。 */
const GW = 14;
const GH = 10;

/** 方眼で扱える傾き（既約な格子ベクトル）。垂直をとっても格子上に乗る。 */
const LATTICE_DIRS: Pt[] = [
  { x: 1, y: 0 }, { x: 0, y: 1 },
  { x: 1, y: 1 }, { x: 1, y: -1 },
  { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: -1 }, { x: 1, y: -2 },
  { x: 3, y: 1 }, { x: 1, y: 3 }, { x: 3, y: -1 }, { x: 1, y: -3 },
  { x: 3, y: 2 }, { x: 2, y: 3 }, { x: 3, y: -2 }, { x: 2, y: -3 },
];

/** 方眼上の全格子点。 */
function allLattice(): Pt[] {
  const out: Pt[] = [];
  for (let x = 0; x <= GW; x++) for (let y = 0; y <= GH; y++) out.push({ x, y });
  return out;
}

/** 点 c から方向 d に、方眼の中に収まる範囲で線分を伸ばす。 */
function clipLine(c: Pt, d: Pt): [Pt, Pt] {
  const step = (s: number) => ({ x: c.x + d.x * s, y: c.y + d.y * s });
  const inside = (p: Pt) => p.x >= 0 && p.x <= GW && p.y >= 0 && p.y <= GH;
  let lo = 0;
  let hi = 0;
  while (inside(step(lo - 1))) lo -= 1;
  while (inside(step(hi + 1))) hi += 1;
  return [step(lo), step(hi)];
}

/** 方眼の向き（ますの数）を「右へ2・下へ3」のことばにする（画面は下が +y）。 */
export function stepWords(v: Pt): string {
  const parts: string[] = [];
  if (v.x !== 0) parts.push(`${v.x > 0 ? '右' : '左'}へ ${Math.abs(v.x)}ます`);
  if (v.y !== 0) parts.push(`${v.y > 0 ? '下' : '上'}へ ${Math.abs(v.y)}ます`);
  return parts.join('・');
}

/** 方眼の向きを 90° まわした向き（右へ2・下へ3 → 右へ3・上へ2）。 */
export function perpOf(v: Pt): Pt {
  return { x: v.y, y: -v.x };
}

/* ============================ ① 垂直な直線をひく ============================ */

function genDrawPerpOrPara(mode: 'perp' | 'para'): GeoProblem {
  const level: DrawLevel = mode === 'perp' ? 'draw-perp' : 'draw-para';
  const d = pick(LATTICE_DIRS);
  // 与える直線「あ」。方眼の中を通るように中心付近の格子点から伸ばす。
  const onLine: Pt = { x: randInt(3, GW - 3), y: randInt(3, GH - 3) };
  const [la, lb] = clipLine(onLine, d);

  // 通る点 A。直線あの上に無い格子点から選ぶ（平行のときは必ず外、垂直は外を基本にする）。
  const offLine = allLattice().filter((p) => {
    const v = sub(p, onLine);
    const onIt = Math.abs(v.x * d.y - v.y * d.x) < 1e-9;
    return !onIt && p.x >= 1 && p.x <= GW - 1 && p.y >= 1 && p.y <= GH - 1;
  });
  const A = pick(offLine);

  // 正解になりうる点＝A を通り、目的の向きになる格子点すべて
  const accept = allLattice()
    .filter((p) => !eqPt(p, A))
    .filter((p) => {
      const v = sub(p, A);
      return mode === 'perp' ? isPerpendicularDir(v, d) : isParallelDir(v, d);
    })
    .map((p) => [p]);

  // 正解の点が少なすぎる（端に寄りすぎ）ときは作り直す
  if (accept.length < 2) return genDrawPerpOrPara(mode);

  const lines: FigLine[] = [{ id: 'given', a: la, b: lb, label: 'あ', color: 'base' }];
  const points: FigPoint[] = [{ id: 'A', at: A, label: 'A', color: 'accent2' }];

  const figure: FigureSpec = { w: GW, h: GH, grid: true, lines, points, note: '1マス＝1cm' };

  return {
    skillId: level,
    moduleId: 'draw',
    prompt:
      mode === 'perp'
        ? '点 A を通って、直線 **あ** に **垂直** な直線をひきましょう。\n直線が通る 方眼の点を 1つ タップしてね。'
        : '点 A を通って、直線 **あ** に **平行** な直線をひきましょう。\n直線が通る 方眼の点を 1つ タップしてね。',
    figure,
    answer: {
      kind: 'gridDraw',
      gw: GW,
      gh: GH,
      taps: 1,
      accept,
      connect: 'lineFrom',
      base: A,
      target: { dir: d, mode },
      guide: mode === 'perp' ? 'A から 垂直に のびる先の点を えらぼう' : 'A から 同じ向きに のびる先の点を えらぼう',
    },
    hints: [
      mode === 'perp'
        ? '三角じょうぎの 直角の かどを 直線あに あわせるように 考えよう。方眼なら、ますを 数えて 向きを たしかめられるよ。'
        : '三角じょうぎを ふたつ つかって ずらすように 考えよう。方眼なら、ますを 数えて 向きを たしかめられるよ。',
      `直線あは ${stepWords(d)} ずつ すすむ 向きだね。` + (mode === 'perp'
        ? '垂直な 直線は、横と たての ますの数を 入れかえた 向きに なるよ（どちらか 1つの 向きが 反対になる）。'
        : '平行な 直線は、これと まったく同じ ますの数で すすむよ。'),
      mode === 'perp'
        ? `A から ${stepWords(perpOf(d))}（または ${stepWords({ x: -perpOf(d).x, y: -perpOf(d).y })}）ずつ すすんだ 点を さがそう。`
        : `A から ${stepWords(d)}（または ${stepWords({ x: -d.x, y: -d.y })}）ずつ すすんだ 点を さがそう。`,
    ],
    explain:
      mode === 'perp'
        ? `直線あ（${stepWords(d)}）に 垂直なのは、ますの数を 入れかえた ${stepWords(perpOf(d))} の 向き。点Aを通る 垂直な直線は 1本だけ ひける。`
        : `直線あと 同じ ${stepWords(d)} の 向きに、点Aから 直線を ひけたね。この2本は どこまでいっても 交わらない（平行）。`,
    label: mode === 'perp' ? '垂直な直線をひく' : '平行な直線をひく',
    signature: `${level}:${d.x},${d.y}:${A.x},${A.y}:${onLine.x},${onLine.y}`,
  };
}

/* ============================ ③ かき方の じゅんばん ============================ */

interface Procedure {
  title: string;
  steps: string[];
  sig: string;
  /** 何をかこうとしているのかを示す図。手順だけの文字問題にしないために必ずつける。 */
  figure: FigureSpec;
}

/** 手順カード用: できあがりの四角形を、辺の長さと角の大きさつきで描く。 */
function targetQuadFigure(pts: { x: number; y: number }[], edgeLabels: (string | null)[], angleLabels: (string | null)[]): FigureSpec {
  const fitted = fitInto(pts, 52, 34, 8);
  return {
    w: 52,
    h: 34,
    polys: [{ id: 'target', pts: fitted, vertexLabels: ['ア', 'イ', 'ウ', 'エ'], edgeLabels, angleLabels, fill: 'accent' }],
    note: 'この図を かきたい',
  };
}

/** 手順カード用: 直線と、通らせたい点を描く。 */
function targetLineFigure(lineName: string, ptName: string): FigureSpec {
  return {
    w: 52,
    h: 34,
    lines: [{ id: 'g', a: { x: 6, y: 24 }, b: { x: 46, y: 18 }, label: lineName }],
    points: [{ id: 'p', at: { x: 24, y: 9 }, label: ptName, color: 'accent2' }],
    note: 'この点を通る直線を ひきたい',
  };
}

function procedurePerp(): Procedure {
  const ptName = pick(['A', 'P', 'イ']);
  const lineName = pick(['あ', 'い', 'う']);
  const outside = pick([true, false]);
  return {
    title: `点${ptName} を通って 直線${lineName} に **垂直** な直線を ひく`,
    steps: [
      `三角じょうぎの 直角の 1つの辺を 直線${lineName} に ぴったり あわせる`,
      `三角じょうぎを すべらせて、直角の もう1つの辺が 点${ptName} を 通るように する`,
      `その辺に そって、点${ptName} を通る 直線を ひく`,
      outside ? `ひいた直線と 直線${lineName} が 直角に交わって いるか たしかめる` : `点${ptName} が 直線${lineName} の上にあっても やり方は 同じだと たしかめる`,
    ],
    sig: `perp:${ptName}:${lineName}:${outside}`,
    figure: targetLineFigure(lineName, ptName),
  };
}

function procedurePara(): Procedure {
  const ptName = pick(['A', 'P', 'イ']);
  const lineName = pick(['あ', 'い', 'う']);
  return {
    title: `点${ptName} を通って 直線${lineName} に **平行** な直線を ひく`,
    steps: [
      `1まいめの 三角じょうぎの 辺を 直線${lineName} に あわせる`,
      `2まいめの 三角じょうぎを、1まいめに ぴったり そえて おさえる`,
      `1まいめを、2まいめに そって 点${ptName} まで すべらせる`,
      `1まいめの 辺に そって、点${ptName} を通る 直線を ひく`,
    ],
    sig: `para:${ptName}:${lineName}`,
    figure: targetLineFigure(lineName, ptName),
  };
}

function procedureParallelogram(): Procedure {
  const ab = randInt(3, 6);
  const ad = pick([2, 3, 4, 5].filter((v) => v !== ab));
  const ang = pick([50, 60, 70, 110, 120, 130]);
  return {
    title: `2つの辺が ${ab}cm と ${ad}cm、その間の角が ${ang}度 の **平行四辺形** をかく`,
    steps: [
      `${ab}cm の 辺アイを ひく`,
      `点アに 分度器を あてて ${ang}度 の 角を つくる`,
      `その線の上に ${ad}cm を はかって 点エを とる`,
      `点イから 辺アエと 平行に、点エから 辺アイと 平行に 直線を ひいて 交わった点を ウ とする`,
    ],
    sig: `pg:${ab}:${ad}:${ang}`,
    figure: targetQuadFigure(
      parallelogramFrom(ab, ad, ang),
      [`${ab}cm`, null, null, `${ad}cm`],
      [`${ang}°`, null, null, null],
    ),
  };
}

function procedureRhombus(): Procedure {
  const side = pick([3, 4, 5, 6]);
  const ang = pick([50, 60, 70, 110, 120, 130]);
  return {
    title: `1辺が ${side}cm、1つの角が ${ang}度 の **ひし形** をかく`,
    steps: [
      `${side}cm の 辺アイを ひく`,
      `点アに 分度器を あてて ${ang}度 の 角を つくる`,
      `その線の上に、辺アイと 同じ ${side}cm を はかって 点エを とる`,
      `点イと 点エから、それぞれ ${side}cm の ところで 交わる 点ウを とって 結ぶ`,
    ],
    sig: `rh:${side}:${ang}`,
    figure: targetQuadFigure(
      rhombusFrom(side, ang),
      [`${side}cm`, null, null, `${side}cm`],
      [`${ang}°`, null, null, null],
    ),
  };
}

function genOrder(): GeoProblem {
  const proc = pick([procedurePerp, procedurePara, procedureParallelogram, procedureRhombus])();
  const order = shuffle(proc.steps.map((_, i) => i));
  const shown = order.map((i) => proc.steps[i]);
  // correct[k] = 「k番目に置くべきカード」が shown の何番目にあるか
  const correct = proc.steps.map((_, i) => order.indexOf(i));

  return {
    skillId: 'draw-order',
    moduleId: 'draw',
    prompt: `${proc.title} には、どんな じゅんばんで すすめれば よいですか。\nカードを 正しい じゅんに ならべましょう。`,
    figure: proc.figure,
    answer: { kind: 'order', steps: shown, correct },
    hints: [
      'まず 何を 決めれば、あとが 決まるかな。長さや 角の もとに なるものから 考えよう。',
      '「はじめに1本の辺をひく」→「角や 長さを 決める」→「のこりを ひく」の 流れだよ。',
      `いちばん はじめは「${proc.steps[0]}」だよ。`,
    ],
    explain: proc.steps.map((s, i) => `${i + 1}. ${s}`).join('\n'),
    label: 'かき方のじゅんばん',
    signature: `order:${proc.sig}:${order.join('')}`,
  };
}

/* ============================ ④ 長方形をかく ============================ */

function genRect(): GeoProblem {
  const w = randInt(3, 7);
  const h = pick([2, 3, 4, 5, 6].filter((v) => v !== w));
  // 底辺 AB を方眼上の水平／垂直に置く（長方形は方眼にそってかくのが教科書の基本）
  const horizontal = pick([true, false]);
  const bw = horizontal ? w : h;
  const bh = horizontal ? h : w;
  const A: Pt = { x: randInt(1, GW - bw - 1), y: randInt(1 + bh, GH - 1) };
  const B: Pt = { x: A.x + bw, y: A.y };

  // 上下どちらに立ててもよい＝正解は2通り
  const up: Pt[] = [{ x: B.x, y: A.y - bh }, { x: A.x, y: A.y - bh }];
  const down: Pt[] = [{ x: B.x, y: A.y + bh }, { x: A.x, y: A.y + bh }];
  const accept: Pt[][] = [up];
  if (A.y + bh <= GH) accept.push(down);

  return {
    skillId: 'draw-rect',
    moduleId: 'draw',
    prompt: `たて ${bh}cm、横 ${bw}cm の **長方形** を かきましょう。\n辺アイは かいてあります。のこりの 2つの頂点を タップしてね。`,
    figure: {
      w: GW,
      h: GH,
      grid: true,
      points: [
        { id: 'A', at: A, label: 'ア', color: 'accent2' },
        { id: 'B', at: B, label: 'イ', color: 'accent2' },
      ],
      lines: [{ id: 'AB', a: A, b: B, color: 'accent' }],
      note: '1マス＝1cm',
    },
    answer: {
      kind: 'gridDraw',
      gw: GW,
      gh: GH,
      taps: 2,
      accept,
      connect: 'polygon',
      given: [A, B],
      guide: 'イ の となり から じゅんに 2つ タップしよう',
    },
    hints: [
      '長方形の 4つの角は ぜんぶ 直角。辺アイに 垂直な 直線を 2本 立てるんだね。',
      `辺アイの 長さは ${bw}cm。垂直に 立てる 長さは ${bh}cm だよ。`,
      `ア と イ から それぞれ ${bh}マス はなれた 点を えらぼう。`,
    ],
    explain: `たて ${bh}cm・横 ${bw}cm の 長方形が かけたね。向かい合う辺は 平行で 長さが 等しく、4つの角は ぜんぶ 直角だよ。`,
    label: `長方形をかく（たて${bh}・横${bw}）`,
    signature: `rect:${bw}:${bh}:${A.x},${A.y}:${horizontal}`,
  };
}

/* ============================ ⑤ 四角形をかく ============================ */

/**
 * 方眼の上でひし形をつくるための辺ベクトルの組。
 * 「長さが等しく、垂直でない」2ベクトルが必要で、格子点の上では
 * 3-4-5 の直角三角形を使った (5,0)/(3,4) 系の組み合わせしか作れない。
 * (1,0)/(0,1) を選んでしまうと正方形になり、「ひし形をかく」という問題にならない。
 */
const RHOMBUS_PAIRS: [Pt, Pt][] = [
  [{ x: 5, y: 0 }, { x: 3, y: -4 }],
  [{ x: 5, y: 0 }, { x: 4, y: -3 }],
  [{ x: 5, y: 0 }, { x: -3, y: -4 }],
  [{ x: 5, y: 0 }, { x: -4, y: -3 }],
  [{ x: 0, y: -5 }, { x: 4, y: -3 }],
  [{ x: 0, y: -5 }, { x: 3, y: -4 }],
];

/**
 * 平行四辺形の辺ベクトルの組。
 * 直交する組（長方形になる）と、長さが等しくなる組（ひし形になる）は入れない。
 * 入れてしまうと「平行四辺形をかきましょう」の正解図が長方形や正方形になり、
 * 名前を答える問題の正解とくいちがう。
 */
const PARALLELOGRAM_PAIRS: [Pt, Pt][] = [
  [{ x: 4, y: 0 }, { x: 2, y: -3 }],
  [{ x: 5, y: 0 }, { x: 2, y: -3 }],
  [{ x: 6, y: 0 }, { x: -2, y: -3 }],
  [{ x: 5, y: 0 }, { x: -2, y: -2 }],
  [{ x: 4, y: 0 }, { x: 1, y: -3 }],
  [{ x: 6, y: 0 }, { x: 2, y: -2 }],
  [{ x: 0, y: -4 }, { x: 3, y: -2 }],
  [{ x: 0, y: -5 }, { x: 3, y: -1 }],
];

function genQuad(): GeoProblem {
  const kind = pick(['parallelogram', 'rhombus', 'trapezoid'] as const);

  if (kind === 'parallelogram' || kind === 'rhombus') {
    // 3頂点 ア・イ・ウ を与え、エ（＝ア＋ウ−イ）を1点だけタップさせる。
    // 平行四辺形の「向かい合う辺が平行で長さが等しい」を、位置の決定として体で覚えさせる。
    const [u, v] = pick(kind === 'rhombus' ? RHOMBUS_PAIRS : PARALLELOGRAM_PAIRS);
    const A: Pt = { x: randInt(1, 5), y: randInt(6, GH - 1) };
    const B: Pt = add(A, u);
    const C: Pt = add(B, v);
    const D: Pt = add(A, v);
    const pts = [A, B, C, D];
    if (pts.some((p) => p.x < 0 || p.x > GW || p.y < 0 || p.y > GH)) return genQuad();

    const name = kind === 'rhombus' ? 'ひし形' : '平行四辺形';
    return {
      skillId: 'draw-quad',
      moduleId: 'draw',
      prompt: `**${name}** アイウエ を かんせいさせましょう。\nのこりの 頂点 エ を タップしてね。`,
      figure: {
        w: GW,
        h: GH,
        grid: true,
        points: [
          { id: 'A', at: A, label: 'ア', color: 'accent2' },
          { id: 'B', at: B, label: 'イ', color: 'accent2' },
          { id: 'C', at: C, label: 'ウ', color: 'accent2' },
        ],
        lines: [
          { id: 'AB', a: A, b: B, color: 'accent' },
          { id: 'BC', a: B, b: C, color: 'accent' },
        ],
        note: '1マス＝1cm',
      },
      answer: {
        kind: 'gridDraw',
        gw: GW,
        gh: GH,
        taps: 1,
        accept: [[D]],
        connect: 'polygon',
        given: [A, B, C],
        guide: 'エ に なる 点を 1つ タップ',
      },
      hints: [
        `${name}は 向かい合う 2組の辺が 平行だったね。`,
        '辺アイと 平行で 同じ長さの 辺エウ、辺イウと 平行で 同じ長さの 辺アエ に なる ところだよ。',
        `ア から 辺イウ と 同じ ぶんだけ 動かした 点が エ だよ。`,
      ],
      explain:
        kind === 'rhombus'
          ? '4つの辺の 長さが ぜんぶ 等しい ひし形が できたね。ひし形は 平行四辺形の せいしつも ぜんぶ もっているよ。'
          : '向かい合う 2組の辺が 平行な 平行四辺形が できたね。向かい合う辺の長さ・角の大きさも 等しくなるよ。',
      label: `${name}をかく`,
      signature: `quad:${kind}:${u.x},${u.y}:${v.x},${v.y}:${A.x},${A.y}`,
    };
  }

  // 台形: 下底 アイ を与え、上底の 2頂点 を タップさせる（上底は下底と平行・長さは異なる）
  const bottom = randInt(5, 8);
  const top = pick([2, 3, 4].filter((v) => v !== bottom));
  const h = randInt(2, 4);
  const A: Pt = { x: randInt(1, GW - bottom - 1), y: randInt(2 + h, GH - 1) };
  const B: Pt = { x: A.x + bottom, y: A.y };
  const accept: Pt[][] = [];
  for (let off = 0; off <= bottom - top; off++) {
    accept.push([
      { x: A.x + off + top, y: A.y - h },
      { x: A.x + off, y: A.y - h },
    ]);
  }
  return {
    skillId: 'draw-quad',
    moduleId: 'draw',
    prompt: `上の辺の長さが ${top}cm、下の辺の長さが ${bottom}cm、高さが ${h}cm の **台形** を かきましょう。\nのこりの 2つの頂点を タップしてね。`,
    figure: {
      w: GW,
      h: GH,
      grid: true,
      points: [
        { id: 'A', at: A, label: 'ア', color: 'accent2' },
        { id: 'B', at: B, label: 'イ', color: 'accent2' },
      ],
      lines: [{ id: 'AB', a: A, b: B, color: 'accent' }],
      note: '1マス＝1cm',
    },
    answer: {
      kind: 'gridDraw',
      gw: GW,
      gh: GH,
      taps: 2,
      accept,
      connect: 'polygon',
      given: [A, B],
      guide: 'イ の となり から じゅんに 2つ タップしよう',
    },
    hints: [
      '台形は 向かい合った **1組** の辺が 平行な 四角形だったね。',
      `平行に する ためには、上の辺も 下の辺と 同じ 向き（横）に する。高さは ${h}マス 上だよ。`,
      `上の辺の 長さは ${top}マス。左右の ずれ方は 自由に 決めて いいよ。`,
    ],
    explain: `上の辺と 下の辺が 平行で、長さが ちがう（${top}cm と ${bottom}cm）ので 台形だね。もし 長さも 同じなら 平行四辺形に なってしまうよ。`,
    label: '台形をかく',
    signature: `quad:trap:${top}:${bottom}:${h}:${A.x},${A.y}`,
  };
}

export function generateDraw(level: DrawLevel): GeoProblem {
  switch (level) {
    case 'draw-perp':
      return genDrawPerpOrPara('perp');
    case 'draw-para':
      return genDrawPerpOrPara('para');
    case 'draw-order':
      return genOrder();
    case 'draw-rect':
      return genRect();
    case 'draw-quad':
      return genQuad();
  }
}
