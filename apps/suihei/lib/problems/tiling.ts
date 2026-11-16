// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/lib/problems/tiling.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * モジュール6「しきつめアトリエ」。
 *
 * 学習指導要領「内容の取扱い」(7) に
 *   「平行四辺形，ひし形，台形で平面を敷き詰めるなどの**操作的な活動を重視する**」
 * と明記されている必須事項。ここが抜けている単元アプリは多いが、解説 p.203 が挙げる
 *   ・敷き詰めた図形の中に ほかの図形を認める（台形2枚で平行四辺形ができる）
 *   ・角アと角イを合わせると 180度、角ウと角エを合わせても 180度
 *   ・平行線の性質に気付く
 * という、この単元の「思考・判断・表現」の中核がここにある。
 *
 * 操作は「空いたところに置くタイルの向きを選ぶ」形にする。ドラッグは指の精度の問題で
 * 児童がいらだつので使わない。
 */
import { FigureSpec, Pt } from '../../types';
import { GeoProblem, LevelDef } from '../problemTypes';
import { add, interiorAngles, mid, rotate, scale } from '../geometry';
import { pick, randInt, shuffle } from './rng';

export type TilingLevel = 'tile-fit' | 'tile-inside' | 'tile-angle';

export const TILING_LEVELS: LevelDef<TilingLevel>[] = [
  { id: 'tile-fit', label: '① すきまなく しきつめる', desc: '空いたところに 入る 向きを えらぼう。' },
  { id: 'tile-inside', label: '② 中に かくれた 四角形', desc: 'しきつめた 形の中に、どんな 四角形が 見える？' },
  { id: 'tile-angle', label: '③ 集まった 角の 大きさ', desc: '1つの点に 集まった 角を たすと 何度？' },
];

const W = 62;
const H = 44;

/** 敷き詰めに使うタイルの元になる四角形（単位は「マス」）。 */
interface TileDef {
  name: string;
  /** 原点まわりの頂点（ア・イ・ウ・エ） */
  pts: Pt[];
  /** 横方向の並進ベクトル */
  ux: Pt;
  /** 縦方向の並進ベクトル（180度回転して並べる台形はこれを使わず special で扱う） */
  uy: Pt;
  angles: number[];
}

function parallelogramTile(w: number, h: number, slant: number): TileDef {
  const pts: Pt[] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w + slant, y: -h },
    { x: slant, y: -h },
  ];
  return { name: '平行四辺形', pts, ux: { x: w, y: 0 }, uy: { x: slant, y: -h }, angles: interiorAngles(pts) };
}

function rhombusTile(side: number, slant: number, h: number): TileDef {
  const pts: Pt[] = [
    { x: 0, y: 0 },
    { x: side, y: 0 },
    { x: side + slant, y: -h },
    { x: slant, y: -h },
  ];
  return { name: 'ひし形', pts, ux: { x: side, y: 0 }, uy: { x: slant, y: -h }, angles: interiorAngles(pts) };
}

function trapezoidTile(top: number, bottom: number, h: number, off: number): TileDef {
  const pts: Pt[] = [
    { x: 0, y: 0 },
    { x: bottom, y: 0 },
    { x: off + top, y: -h },
    { x: off, y: -h },
  ];
  // 台形は「1枚を180度回して となりに置く」と 平行四辺形1つぶんになり、それが並進の単位になる
  return { name: '台形', pts, ux: { x: top + bottom, y: 0 }, uy: { x: off, y: -h }, angles: interiorAngles(pts) };
}

function randomTile(): TileDef {
  const k = pick(['parallelogram', 'rhombus', 'trapezoid'] as const);
  if (k === 'parallelogram') return parallelogramTile(randInt(8, 11), randInt(7, 9), randInt(2, 4));
  if (k === 'rhombus') {
    // 辺の長さをそろえる（3-4-5 を使う）
    const [side, slant, h] = pick([
      [10, 6, 8],
      [10, 8, 6],
      [5, 3, 4],
    ] as [number, number, number][]);
    return rhombusTile(side, slant, h);
  }
  const bottom = randInt(9, 12);
  const top = randInt(4, 6);
  return trapezoidTile(top, bottom, randInt(6, 8), randInt(1, 3));
}

/** 台形は「そのまま」と「180度回転」を交互に置くと平面を敷き詰められる。 */
function tilingPieces(t: TileDef, cols: number, rows: number, skip: number): { polys: FigureSpec['polys']; holePts: Pt[]; holeIsFlipped: boolean } {
  const polys: NonNullable<FigureSpec['polys']> = [];
  let holePts: Pt[] = [];
  let holeIsFlipped = false;
  let idx = 0;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      for (const flipped of t.name === '台形' ? [false, true] : [false]) {
        // 台形は、辺イウ の 中点を 中心に 180度 回した1枚を となりに置くと
        // ちょうど 平行四辺形1つぶんに なり、それが 並進の単位に なる（解説 p.203 の図）。
        const base = flipped ? rotate(t.pts, 180, mid(t.pts[1], t.pts[2])) : t.pts;
        const shift = add(scale(t.ux, c), scale(t.uy, r));
        const pts = base.map((p) => add(p, shift));
        if (idx === skip) {
          holePts = pts;
          holeIsFlipped = flipped;
        } else {
          polys.push({ id: `t${idx}`, pts, fill: 'accent' });
        }
        idx++;
      }
    }
  }
  return { polys, holePts, holeIsFlipped };
}

/** 敷き詰めた図全体を viewBox に収める。 */
function fitAll(polys: NonNullable<FigureSpec['polys']>, extra: Pt[][]): { polys: NonNullable<FigureSpec['polys']>; extra: Pt[][] } {
  const all = [...polys.flatMap((p) => p.pts), ...extra.flat()];
  const xs = all.map((p) => p.x);
  const ys = all.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const k = Math.min((W - 8) / (maxX - minX || 1), (H - 8) / (maxY - minY || 1));
  const map = (p: Pt): Pt => ({ x: (p.x - minX) * k + 4, y: (p.y - minY) * k + 4 });
  return {
    polys: polys.map((p) => ({ ...p, pts: p.pts.map(map) })),
    extra: extra.map((g) => g.map(map)),
  };
}

/* ============================ ① すきまなく しきつめる ============================ */

/**
 * 敷き詰めた図に1か所だけ穴をあけ、そこに入るタイルの向きを選ばせる。
 * 選択肢は「そのまま」「180度回した形」「ずらした形」など。正解は穴の形と完全に一致する1つ。
 */
function genFit(): GeoProblem {
  const t = randomTile();
  const cols = 3;
  const rows = 2;
  const perRow = t.name === '台形' ? 2 : 1;
  const total = cols * rows * perRow;
  const skip = randInt(0, total - 1);
  const { polys, holePts, holeIsFlipped } = tilingPieces(t, cols, rows, skip);
  const fitted = fitAll(polys, [holePts]);
  const hole = fitted.extra[0];

  // 選択肢: 正解＝穴と同じ向き。誤答＝回転・裏返し・別の形。
  const optionDefs: { label: string; ok: boolean; why: string }[] = [
    { label: t.name === '台形' ? (holeIsFlipped ? '上下を さかさまに した形' : 'そのままの 向きの形') : 'そのままの 向きの形', ok: true, why: 'まわりの タイルと 辺が ぴったり 合う 向きだよ。' },
    { label: t.name === '台形' ? (holeIsFlipped ? 'そのままの 向きの形' : '上下を さかさまに した形') : '左右を 反対に した形', ok: false, why: 'その向きだと、上の辺と 下の辺の 長さが 合わなくて すきまが できるよ。' },
    { label: '90度 回した形', ok: false, why: '90度 回すと 辺の 向きが 変わって、となりの タイルと 平行に ならないよ。' },
    { label: 'ひとまわり 大きくした形', ok: false, why: '大きさが ちがうと、すきまなく しきつめられないよ。しきつめは 同じ 形・同じ 大きさで するんだ。' },
  ];
  const sh = shuffle(optionDefs);
  const correct = sh.findIndex((o) => o.ok);

  return {
    skillId: 'tile-fit',
    moduleId: 'tiling',
    prompt: `**${t.name}** で 平面を しきつめています。白く あいた ところに ぴったり 入るのは どれですか。`,
    figure: {
      w: W,
      h: H,
      polys: [...fitted.polys, { id: 'hole', pts: hole, fill: 'none', label: '？' }],
      note: 'すきまも かさなりも なく しきつめる',
    },
    answer: { kind: 'choice', choices: sh.map((o) => o.label), correct },
    hints: [
      'あいた ところの 形を よく 見よう。まわりの タイルと 辺が どう つながるかな。',
      t.name === '台形'
        ? '台形は「そのまま」と「さかさま」を こうごに ならべると すきまなく しきつめられるよ。'
        : `${t.name}は ぜんぶ 同じ 向きの まま、よこと ななめに ずらして ならべられるよ。`,
      `「${sh[correct].label}」だよ。`,
    ],
    explain: `${t.name}は 平面を すきまなく しきつめることが できる。${
      t.name === '台形'
        ? 'さかさまに した1枚と くみあわせると、平行四辺形が 1つ できるからだよ。'
        : '向かい合う辺が 平行で 長さが 等しいので、ずらして ならべるだけで ぴったり つながるからだよ。'
    }`,
    label: `${t.name}でしきつめる`,
    diagnose: (given) => (given === correct ? null : sh[given].why),
    signature: `tile-fit:${t.name}:${t.pts.map((p) => `${p.x},${p.y}`).join('_')}:${skip}`,
  };
}

/* ============================ ② 中に かくれた 四角形 ============================ */

/**
 * 解説 p.203「台形アイウエによって平面を敷き詰めると…その中に平行四辺形を認めることができる」。
 * 敷き詰めた図の中に別の図形が見えることに気づかせる。
 */
function genInside(): GeoProblem {
  const t = randomTile();
  const cols = 3;
  const rows = 2;
  const perRow = t.name === '台形' ? 2 : 1;
  const { polys } = tilingPieces(t, cols, rows, -1);
  const fitted = fitAll(polys, []);

  const answers: { q: string; choices: { t: string; ok: boolean; why: string }[] }[] = [
    {
      q: t.name === '台形' ? '台形を 2まい 組み合わせると、何が できますか。' : `${t.name}を 2まい 組み合わせて できる 形は どれですか。`,
      choices:
        t.name === '台形'
          ? [
              { t: '平行四辺形', ok: true, why: '台形を さかさまに して となりに つけると、向かい合う 2組の辺が 平行に なるね。' },
              { t: '正方形', ok: false, why: '4つの角が すべて 直角には ならないよ。' },
              { t: 'ひし形', ok: false, why: '4つの辺が すべて 等しくは ならないよ。' },
              { t: '三角形', ok: false, why: '四角形を 2まい 合わせても 三角形には ならないね。' },
            ]
          : [
              { t: `もっと 大きな ${t.name}`, ok: true, why: `同じ ${t.name}を となりに つなげると、向きが そろった 大きな ${t.name}に なるよ。` },
              { t: '正方形', ok: false, why: '角が 直角では ないので 正方形には ならないよ。' },
              { t: '台形', ok: false, why: '2組とも 平行なままなので、1組だけ 平行な 台形には ならないよ。' },
              { t: '五角形', ok: false, why: '四角形を つなげても 頂点が 5つには ならないよ。' },
            ],
    },
    {
      q: 'しきつめた 図の 中に、平行な 直線は ありますか。',
      choices: [
        { t: 'ある。同じ 向きの 辺が つながって、長い 平行線に なる', ok: true, why: '向かい合う辺が 平行だから、となりの タイルの 辺と つながって 長い 平行線に なるよ。' },
        { t: 'ない。1つ1つの タイルの 中だけの 話', ok: false, why: 'タイルを こえて 辺が つながり、長い 平行線が 見えてくるよ。' },
        { t: 'ある。ただし たてだけ', ok: false, why: 'たてにも ななめにも、平行な 直線が 見えるよ。' },
        { t: '数が 多すぎて わからない', ok: false, why: '同じ 向きの 辺を 目で 追ってみよう。まっすぐ つながっているね。' },
      ],
    },
  ];
  const a = pick(answers);
  const sh = shuffle(a.choices);
  const correct = sh.findIndex((c) => c.ok);

  return {
    skillId: 'tile-inside',
    moduleId: 'tiling',
    prompt: `**${t.name}** で しきつめた 図です。${a.q}`,
    figure: { w: W, h: H, polys: fitted.polys, note: `${t.name}を すきまなく ならべた図` },
    answer: { kind: 'choice', choices: sh.map((c) => c.t), correct },
    hints: [
      'となり合う タイルを 2まい セットで 見てみよう。',
      '辺が つながって、1本の 長い 直線に 見える ところを さがそう。',
      `「${sh[correct].t}」だよ。`,
    ],
    explain: sh[correct].why,
    label: 'しきつめた中の図形',
    diagnose: (given) => (given === correct ? null : sh[given].why),
    signature: `tile-inside:${t.name}:${a.q}:${t.pts.map((p) => `${p.x},${p.y}`).join('_')}:${sh.map((c) => c.t).join('|')}`,
  };
}

/* ============================ ③ 集まった 角の 大きさ ============================ */

/**
 * 解説 p.203「角アと角イの大きさを合わせたり，角ウと角エの大きさを合わせたりすると，
 * どちらも 180 度であることに気付くことができる」＋
 * 1つの点に4つの角が集まると 360度になること。
 */
function genAngle(): GeoProblem {
  const t = randomTile();
  const angs = t.angles.map((a) => Math.round(a));
  // 平行四辺形・ひし形・台形とも、となり合う2つの角の和は 180度になる
  const a0 = angs[0];
  const a1 = angs[1];
  const variant = pick(['pair', 'around'] as const);

  const { polys } = tilingPieces(t, 3, 2, -1);
  const fitted = fitAll(polys, []);

  if (variant === 'pair') {
    return {
      skillId: 'tile-angle',
      moduleId: 'tiling',
      prompt: `**${t.name}** の 角アが ${a0}度 のとき、となり合う 角イは 何度ですか。\n（しきつめた 図で、この2つの角は 一直線に ならぶよ）`,
      figure: { w: W, h: H, polys: fitted.polys, note: `${t.name}を しきつめた図` },
      answer: { kind: 'number', correct: a1, unit: '度' },
      hints: [
        'しきつめた 図の 中で、角アと 角イが となり合って 一直線に なっている ところを 見つけよう。',
        '一直線の 角は 180度。だから 角ア＋角イ＝180度 だね。',
        `180 − ${a0} ＝ ${a1} 度だよ。`,
      ],
      explain: `となり合う 2つの角を 合わせると 一直線（180度）に なる。だから 角イ＝180−${a0}＝${a1}度。\nこれは 上下の辺が 平行だから 起きることだよ。`,
      label: 'しきつめた角の和',
      diagnose: (given) => {
        if (given === a1) return null;
        if (given === a0) return '向かい合う角と まちがえていないかな。となり合う角は「たして 180度」だよ。';
        if (given === 360 - a0) return '一直線は 180度だよ。360度は 1つの点の まわり 1しゅうぶんだね。';
        if (given === 90) return '直角とは かぎらないよ。角アの 大きさから 計算しよう。';
        return `角ア＋角イ＝180 に なるように 計算しよう。180 − ${a0} は いくつかな。`;
      },
      signature: `tile-angle:pair:${t.name}:${a0}:${t.pts.map((p) => `${p.x},${p.y}`).join('_')}`,
    };
  }

  return {
    skillId: 'tile-angle',
    moduleId: 'tiling',
    prompt: `**${t.name}** で しきつめると、1つの点の まわりに 4つの角が 集まります。\nその 4つの角を ぜんぶ たすと 何度に なりますか。`,
    figure: { w: W, h: H, polys: fitted.polys, note: '頂点が 集まっている ところを 見よう' },
    answer: { kind: 'number', correct: 360, unit: '度' },
    hints: [
      '1つの点の まわりを ぐるっと 1しゅうすると 何度だったかな。',
      '半分（一直線）が 180度。その 2つぶんだね。',
      '360度 だよ。',
    ],
    explain: `1つの点の まわりを 1しゅうすると **360度**。${t.name}の 4つの角を ぜんぶ 集めると ちょうど 1しゅうに なるので、四角形の 4つの角の 大きさの 和も 360度だと わかるよ。`,
    label: '点のまわりの角の和',
    diagnose: (given) => {
      if (given === 360) return null;
      if (given === 180) return '180度は 一直線（半分）ぶんだよ。ぐるっと 1しゅうは その 2つぶん。';
      if (given === 90) return '90度は 直角 1つぶんだね。1しゅうは 直角 4つぶんだよ。';
      return '1つの点の まわりを ぐるっと 1しゅうした 大きさを 考えよう。';
    },
    signature: `tile-angle:around:${t.name}:${a0}:${t.pts.map((p) => `${p.x},${p.y}`).join('_')}`,
  };
}

export function generateTiling(level: TilingLevel): GeoProblem {
  switch (level) {
    case 'tile-fit':
      return genFit();
    case 'tile-inside':
      return genInside();
    case 'tile-angle':
      return genAngle();
  }
}
