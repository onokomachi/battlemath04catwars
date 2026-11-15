// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/lib/problems/property.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * モジュール4「せいしつ調べ」＝ 計算。
 *
 * 現物の単元テスト大問5（平行四辺形の 角C・角D・辺AD を求める）に直接あたる。
 * 解説 p.203 の性質をそのまま段階にする:
 *   平行四辺形 … 向かい合う辺の長さが等しい／向かい合う角の大きさが等しい
 *   ひし形     … 二組の向かい合う角がそれぞれ等しい（＋平行四辺形の性質すべて）
 * さらに東京書籍の指導内容にある「平行線を活用してできる角の大きさの考察」を1レベル置く。
 *
 * 誤答診断は「隣り合う角と向かい合う角の取りちがえ（a と 180−a）」を中心に組む。
 * これがこの単元でいちばん多い計算まちがいだから。
 */
import { FigureSpec, Pt } from '../../types';
import { GeoProblem, LevelDef } from '../problemTypes';
import { fitInto, parallelogramFrom, rhombusFrom, rotate } from '../geometry';
import { pick, randInt, shuffle, pickN } from './rng';
import { pickVertexLabels } from './shapes';

export type PropertyLevel = 'prop-oppo' | 'prop-adj' | 'prop-rhombus' | 'prop-parallel' | 'prop-fact';

export const PROPERTY_LEVELS: LevelDef<PropertyLevel>[] = [
  { id: 'prop-oppo', label: '① 向かい合う 辺と角', desc: '平行四辺形の 向かい合う 辺の長さ・角の大きさは 等しい。' },
  { id: 'prop-adj', label: '② となり合う 角', desc: 'となり合う 2つの角を たすと 180度に なる。' },
  { id: 'prop-rhombus', label: '③ ひし形の せいしつ', desc: '4つの辺が 等しい ひし形の 辺と角。' },
  { id: 'prop-parallel', label: '④ 平行線でできる角', desc: '平行な2直線に 1本の直線が 交わってできる角。' },
  { id: 'prop-fact', label: '⑤ せいしつの ことば', desc: '正しい せいしつの せつめいを えらぼう。' },
];

const W = 58;
const H = 40;

/** 角の値として使う度数。90 を入れると長方形になってしまうので除く。 */
const ANGLES = [40, 50, 55, 60, 65, 70, 75, 80, 100, 105, 110, 115, 120, 125, 130, 140];

/**
 * 平行四辺形／ひし形を図にする。
 * 頂点の記号は ア〜エ と A〜D を毎回入れ替える。教科書と市販テストで表記が分かれており
 * （現物の啓林館テストは A/B/C/D、東京書籍は ア/イ/ウ/エ）、片方しか経験していないと
 * 「辺AD はどこか」の対応づけに余計な負荷がかかるため。
 */
function quadFigure(
  raw: Pt[],
  edgeLabels: (string | null)[],
  angleLabels: (string | null)[],
  rotation: number,
  labels: string[],
): FigureSpec {
  const pts = fitInto(rotate(raw, rotation), W, H, 9);
  return {
    w: W,
    h: H,
    polys: [{ id: 'q', pts, vertexLabels: labels, edgeLabels, angleLabels, fill: 'accent' }],
  };
}

/* ============================ ①② 平行四辺形の 辺と角 ============================ */

function genParallelogramAsk(level: 'prop-oppo' | 'prop-adj'): GeoProblem {
  const ab = randInt(4, 8);
  const bc = pick([2, 3, 4, 5, 6].filter((v) => v !== ab));
  const angA = pick(ANGLES);
  const angB = 180 - angA;
  const raw = parallelogramFrom(ab, bc, angA);
  // 見た目の向きを毎回変える。ただしラベルが読める範囲（大きく傾けすぎない）。
  const rotation = pick([0, 0, 15, -15, 180, 165, -165]);

  const L = pickVertexLabels();

  // 出題対象。① は向かい合う関係だけ、② はとなり合う角だけ。
  interface Target { q: string; ans: number; unit: string; why: string }
  const targets: Target[] =
    level === 'prop-oppo'
      ? ([
          { q: `角${L[2]}`, ans: angA, unit: '度', why: `角${L[0]}と 角${L[2]}は **向かい合う角**。平行四辺形の 向かい合う角は 等しいので、角${L[2]}＝角${L[0]} だよ。` },
          { q: `辺${L[2]}${L[3]}`, ans: ab, unit: 'cm', why: `辺${L[0]}${L[1]}と 辺${L[2]}${L[3]}は **向かい合う辺**。平行四辺形の 向かい合う辺の長さは 等しいよ。` },
          { q: `辺${L[3]}${L[0]}`, ans: bc, unit: 'cm', why: `辺${L[1]}${L[2]}と 辺${L[3]}${L[0]}は **向かい合う辺**。長さは 等しいよ。` },
        ])
      : ([
          { q: `角${L[1]}`, ans: angB, unit: '度', why: `角${L[0]}と 角${L[1]}は **となり合う角**。平行な2直線に はさまれているので、たすと 180度に なるよ。` },
          { q: `角${L[3]}`, ans: angB, unit: '度', why: `角${L[0]}と 角${L[3]}は **となり合う角**。たすと 180度に なるよ。` },
        ]);
  const t = pick(targets);

  const figure = quadFigure(
    raw,
    [`${ab}cm`, `${bc}cm`, null, null],
    [`${angA}°`, null, null, null],
    rotation,
    L,
  );

  const wrong = t.unit === '度' ? (t.ans === angA ? angB : angA) : t.ans === ab ? bc : ab;

  return {
    skillId: level,
    moduleId: 'property',
    prompt: `下の四角形は **平行四辺形** です。${t.q} は 何${t.unit} ですか。`,
    figure,
    answer: { kind: 'number', correct: t.ans, unit: t.unit },
    hints: [
      level === 'prop-oppo'
        ? '平行四辺形の **向かい合う** 辺・角には きまりが あったね。'
        : 'となり合う 2つの角は、平行な 2本の直線に はさまれているよ。',
      level === 'prop-oppo'
        ? '向かい合う辺の長さは 等しい。向かい合う角の大きさも 等しい。'
        : 'となり合う 2つの角を たすと 180度に なるよ。',
      `${t.q} は ${t.ans}${t.unit} だよ。`,
    ],
    explain: t.why,
    label: `平行四辺形の${t.q}`,
    diagnose: (given) => {
      if (given === t.ans) return null;
      if (given === wrong) {
        return t.unit === '度'
          ? '**向かい合う角**と **となり合う角** を 取りちがえているよ。向かい合う角は 等しい、となり合う角は たして 180度。'
          : '**向かい合う辺**と **となり合う辺** を 取りちがえているよ。長さが 等しいのは 向かい合う辺どうし。';
      }
      if (t.unit === '度' && given === 360 - t.ans) return '4つの角ぜんぶを たすと 360度だけれど、聞かれているのは 1つの角だよ。';
      if (t.unit === '度' && given === 90) return `平行四辺形の 角は、いつも 直角とは かぎらないよ。図の 角${L[0]}を 手がかりに 考えよう。`;
      return `${t.q} と 同じ長さ（大きさ）に なる ところを 図から さがそう。`;
    },
    signature: `${level}:${ab}:${bc}:${angA}:${t.q}:${rotation}:${L[0]}`,
  };
}

/* ============================ ③ ひし形の せいしつ ============================ */

function genRhombus(): GeoProblem {
  const side = randInt(3, 8);
  const angA = pick(ANGLES);
  const angB = 180 - angA;
  const raw = rhombusFrom(side, angA);
  const rotation = pick([0, 15, -15, 30, -30, 180]);

  const L = pickVertexLabels();
  const targets: { q: string; ans: number; unit: string; why: string }[] = [
    { q: `辺${L[1]}${L[2]}`, ans: side, unit: 'cm', why: 'ひし形は **4つの辺の長さが すべて 等しい**。だから どの辺も 同じ長さだよ。' },
    { q: `辺${L[2]}${L[3]}`, ans: side, unit: 'cm', why: 'ひし形は **4つの辺の長さが すべて 等しい**。だから どの辺も 同じ長さだよ。' },
    { q: `角${L[2]}`, ans: angA, unit: '度', why: `角${L[0]}と 角${L[2]}は 向かい合う角。ひし形も 平行四辺形の なかまなので、向かい合う角は 等しいよ。` },
    { q: `角${L[1]}`, ans: angB, unit: '度', why: `角${L[0]}と 角${L[1]}は となり合う角。たすと 180度に なるよ。` },
  ];
  const t = pick(targets);

  return {
    skillId: 'prop-rhombus',
    moduleId: 'property',
    prompt: `下の四角形は **ひし形** です。${t.q} は 何${t.unit} ですか。`,
    figure: quadFigure(raw, [`${side}cm`, null, null, null], [`${angA}°`, null, null, null], rotation, L),
    answer: { kind: 'number', correct: t.ans, unit: t.unit },
    hints: [
      'ひし形の いちばんの とくちょうは 「4つの辺の長さ」だったね。',
      'ひし形は 平行四辺形の せいしつも ぜんぶ もっている。向かい合う角は 等しく、となり合う角は たして 180度。',
      `${t.q} は ${t.ans}${t.unit} だよ。`,
    ],
    explain: t.why,
    label: `ひし形の${t.q}`,
    diagnose: (given) => {
      if (given === t.ans) return null;
      if (t.unit === '度' && given === (t.ans === angA ? angB : angA)) {
        return '向かい合う角（等しい）と となり合う角（たして180度）を 取りちがえているよ。';
      }
      if (t.unit === 'cm') return 'ひし形は 4つの辺が **すべて** 等しいよ。図に 書いてある 長さと 同じに なるね。';
      return `角${L[0]}を 手がかりに、向かい合う角・となり合う角の きまりを つかおう。`;
    },
    signature: `prop-rhombus:${side}:${angA}:${t.q}:${rotation}:${L[0]}`,
  };
}

/* ============================ ④ 平行線でできる角 ============================ */

/**
 * 平行な2直線 あ・い に 1本の直線 う が交わってできる角。
 * 東京書籍の指導内容「平行線を活用してできる角の大きさの考察」に対応する。
 * 同じ位置にある角は等しい／となり合う角は たして180度、を図の上で確かめさせる。
 */
function genParallelAngle(): GeoProblem {
  const baseDeg = pick([0, 8, -8, 12, -12]);
  const cutDeg = pick([35, 40, 45, 50, 55, 60, 65, 70, 115, 120, 125, 130, 135, 140]);
  const angleA = cutDeg; // ㋐に表示する角（直線あ と 直線う の なす角）
  const same = pick([true, false]); // true: 同じ位置の角（等しい）/ false: となり合う角（180−）

  const rad = (d: number) => (d * Math.PI) / 180;
  const u = { x: Math.cos(rad(baseDeg)), y: Math.sin(rad(baseDeg)) };
  const n = { x: -u.y, y: u.x };
  const gap = 16;
  const c1: Pt = { x: 29, y: 12 };
  const c2: Pt = { x: c1.x + n.x * gap, y: c1.y + n.y * gap };

  // 交わる直線 う。あ・い との交点をそのまま c1・c2 にする。
  const v = { x: Math.cos(rad(baseDeg + cutDeg)), y: Math.sin(rad(baseDeg + cutDeg)) };
  const cut = { a: { x: c1.x - v.x * 12, y: c1.y - v.y * 12 }, b: { x: c2.x + v.x * 12, y: c2.y + v.y * 12 } };

  const answer = same ? angleA : 180 - angleA;

  const figure: FigureSpec = {
    w: 58,
    h: 42,
    lines: [
      { id: 'a', a: { x: c1.x - u.x * 24, y: c1.y - u.y * 24 }, b: { x: c1.x + u.x * 24, y: c1.y + u.y * 24 }, label: 'あ' },
      { id: 'b', a: { x: c2.x - u.x * 24, y: c2.y - u.y * 24 }, b: { x: c2.x + u.x * 24, y: c2.y + u.y * 24 }, label: 'い' },
      { id: 'c', a: cut.a, b: cut.b, label: 'う', color: 'accent' },
    ],
    angleMarks: [
      // ㋐: 直線あ の右向き と 直線う の下向き の間の角
      { at: c1, d1: u, d2: v, label: '㋐', color: 'accent2' },
      // ㋑: 交点2 で、同じ位置の角 or となり合う角
      same
        ? { at: c2, d1: u, d2: v, label: '㋑', color: 'accent' }
        : { at: c2, d1: { x: -u.x, y: -u.y }, d2: v, label: '㋑', color: 'accent' },
    ],
    note: '直線 あ と い は 平行',
  };

  return {
    skillId: 'prop-parallel',
    moduleId: 'property',
    prompt: `直線 あ と い は 平行です。㋐の角が ${angleA}度 のとき、㋑の角は 何度ですか。`,
    figure,
    answer: { kind: 'number', correct: answer, unit: '度' },
    hints: [
      '平行な2本の直線に、1本の直線が 同じように 交わっているね。交わり方は どこでも 同じだよ。',
      same
        ? '㋐と ㋑は、交わったところで **同じ位置** に ある角。同じ位置の角は 等しくなるよ。'
        : '㋑は ㋐と **となり合う** 位置に ある角。一直線の上に ならぶので、たすと 180度に なるよ。',
      `㋑は ${answer}度 だよ。`,
    ],
    explain: same
      ? `平行な2直線に 1本の直線が 交わると、**同じ位置に できる角は 等しい**。だから ㋑＝㋐＝${answer}度。`
      : `㋐と ㋑は 一直線の上で となり合う角なので、たすと 180度。だから ㋑＝180−${angleA}＝${answer}度。`,
    label: '平行線でできる角',
    diagnose: (given) => {
      if (given === answer) return null;
      if (given === (same ? 180 - angleA : angleA)) {
        return same
          ? '㋐と ㋑は **同じ位置** に ある角だよ。となり合う角と まちがえていないかな。'
          : '㋐と ㋑は **となり合う** 位置に ある角だよ。同じ位置の角と まちがえていないかな。';
      }
      if (given === 90) return '交わり方は 直角とは かぎらないよ。㋐の 大きさを 手がかりに しよう。';
      if (given === 360 - answer) return '一直線は 180度だよ。360度は 1まわりの 大きさだね。';
      return '平行な2直線に 交わる 直線の 交わり方は、上でも 下でも まったく 同じだよ。';
    },
    signature: `prop-parallel:${baseDeg}:${cutDeg}:${same}`,
  };
}

/* ============================ ⑤ せいしつの ことば ============================ */

const FACTS: { text: string; ok: boolean; why: string }[] = [
  { text: '平行四辺形は、向かい合う 辺の長さが 等しい。', ok: true, why: '平行四辺形の 代表的な せいしつだよ。' },
  { text: '平行四辺形は、向かい合う 角の大きさが 等しい。', ok: true, why: '平行四辺形の 代表的な せいしつだよ。' },
  { text: '平行四辺形の となり合う 2つの角を たすと 180度に なる。', ok: true, why: '平行な2直線に はさまれるからだよ。' },
  { text: 'ひし形は、4つの辺の長さが すべて 等しい。', ok: true, why: 'これが ひし形の 決め方（定義）そのものだよ。' },
  { text: 'ひし形は、平行四辺形の せいしつを すべて もっている。', ok: true, why: 'ひし形は 平行四辺形の なかまだからだよ。' },
  { text: '台形は、向かい合う 1組の辺が 平行である。', ok: true, why: 'これが 台形の 決め方（定義）だよ。' },
  { text: '平行四辺形は、4つの辺の長さが すべて 等しい。', ok: false, why: 'それは ひし形の せいしつ。平行四辺形は 向かい合う辺だけが 等しいよ。' },
  { text: '平行四辺形は、4つの角が すべて 直角である。', ok: false, why: 'それは 長方形の せいしつ。平行四辺形の 角は 直角とは かぎらないよ。' },
  { text: 'ひし形は、4つの角が すべて 等しい。', ok: false, why: 'それは 正方形。ひし形は 向かい合う角どうしが 等しいだけだよ。' },
  { text: '台形は、向かい合う 2組の辺が 平行である。', ok: false, why: '2組 平行なら 平行四辺形。台形は 1組だけだよ。' },
  { text: '平行四辺形の となり合う 2つの角は 等しい。', ok: false, why: 'となり合う角は たして 180度。等しいのは 向かい合う角どうしだよ。' },
  { text: 'ひし形の 向かい合う 辺の長さは ちがう。', ok: false, why: 'ひし形は 4つとも 等しいので、向かい合う辺も もちろん 等しいよ。' },
];

function genFact(): GeoProblem {
  const askCorrect = pick([true, false]);
  const okOne = pick(FACTS.filter((f) => f.ok));
  const ngOne = pick(FACTS.filter((f) => !f.ok));
  const items = askCorrect
    ? shuffle([okOne, ...pickN(FACTS.filter((f) => !f.ok && f !== ngOne), 3)])
    : shuffle([ngOne, ...pickN(FACTS.filter((f) => f.ok && f !== okOne), 3)]);
  const target = askCorrect ? okOne : ngOne;
  const correct = items.indexOf(target);

  const raw = parallelogramFrom(6, 4, pick(ANGLES));
  return {
    skillId: 'prop-fact',
    moduleId: 'property',
    prompt: askCorrect
      ? '四角形の せいしつについて、**正しい** ものを 1つ えらびましょう。'
      : '四角形の せいしつについて、**まちがっている** ものを 1つ えらびましょう。',
    figure: quadFigure(raw, [null, null, null, null], [null, null, null, null], pick([0, 15, -15]), pickVertexLabels()),
    answer: { kind: 'choice', choices: items.map((f) => f.text), correct },
    hints: [
      '「平行四辺形」「ひし形」「台形」の 決め方（定義）を 思い出そう。',
      '定義と せいしつを ごちゃまぜに しないこと。ひし形の 定義は「4つの辺が 等しい」だよ。',
      askCorrect ? `${target.text} が 正しいよ。` : `${target.text} が まちがいだよ。`,
    ],
    explain: `${target.text}\n${target.why}`,
    label: askCorrect ? '正しいせいしつを選ぶ' : 'まちがいを選ぶ',
    diagnose: (given) => (given === correct ? null : items[given].why),
    signature: `prop-fact:${askCorrect}:${target.text}:${items.map((f) => f.text).join('|')}`,
  };
}

export function generateProperty(level: PropertyLevel): GeoProblem {
  switch (level) {
    case 'prop-oppo':
      return genParallelogramAsk('prop-oppo');
    case 'prop-adj':
      return genParallelogramAsk('prop-adj');
    case 'prop-rhombus':
      return genRhombus();
    case 'prop-parallel':
      return genParallelAngle();
    case 'prop-fact':
      return genFact();
  }
}
