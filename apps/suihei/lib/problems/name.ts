// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/lib/problems/name.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * モジュール3「四角形めいめい所」＝ 判定・弁別。
 *
 * 単元の定義（解説 p.203）をそのまま技能にしたモジュール。
 *   台形     … 向かい合った **一組** の辺が平行
 *   平行四辺形 … 向かい合った **二組** の辺が平行
 *   ひし形   … **四つの辺の長さが等しい**
 *
 * この単元で いちばん こわいのは「1種類の図形だけで問題を作ってしまい、条件の欠落に
 * 気づけない」こと。そこで反例（等脚台形・たこ形・一般四角形）を必ず出題プールに入れ、
 * かつ図形を毎回ランダムに回転させる（＝置き方で名前を決めるクセを崩す）。
 */
import { FigureSpec, Pt, QUAD_LABEL, QuadKind } from '../../types';
import { GeoProblem, LevelDef } from '../problemTypes';
import {
  allAnglesRight,
  allSidesEqual,
  classifyQuad,
  diagonalFacts,
  edgeLengths,
  interiorAngles,
  isKind,
  parallelPairCount,
} from '../geometry';
import { Shape, ShapeKind, SHAPE_ANSWER, fitShape, makeValidShape, pickVertexLabels } from './shapes';
import { pick, pickN, shuffle } from './rng';

export type NameLevel = 'name-basic' | 'name-pairs' | 'name-counter' | 'name-find' | 'name-include' | 'name-table' | 'name-sort';

export const NAME_LEVELS: LevelDef<NameLevel>[] = [
  { id: 'name-basic', label: '① 名前を こたえる', desc: 'かたむいていても 名前が わかるかな？' },
  { id: 'name-pairs', label: '② 平行な辺は 何組？', desc: '平行が 何組あるかで 四角形を 分けられる。' },
  { id: 'name-counter', label: '③ にているけど ちがう', desc: 'たこ形・等脚台形 …まぎらわしい図形を 見やぶろう。' },
  { id: 'name-find', label: '④ すべて えらぶ', desc: '4つの図から、その名前の 四角形を すべて 見つけよう。' },
  { id: 'name-include', label: '⑤ 〜と いえる？', desc: '正方形は 平行四辺形と いえる？ 図形の なかまを 考えよう。' },
  { id: 'name-table', label: '⑥ せいしつの ひょう', desc: 'あてはまる ところに ○を つけよう。テストで よく 出る 形式。' },
  { id: 'name-sort', label: '⑦ なかま分け', desc: '平行な辺が 何組 あるかで、四角形を 分けよう。' },
];

const SYMBOLS = ['あ', 'い', 'う', 'え'];

/** 名前を答えるときの選択肢。「どれでもない」まで含めて 6 つ。 */
const NAME_OPTIONS: QuadKind[] = ['square', 'rect', 'rhombus', 'parallelogram', 'trapezoid', 'other'];

const W = 56;
const H = 40;

function singleFigure(s: Shape, opts: { ticks?: boolean; rightAngles?: boolean; labels?: string[] } = {}): FigureSpec {
  const pts = fitShape(s, W, H);
  const cls = classifyQuad(s.raw);
  const tickMarks =
    opts.ticks && (cls === 'rhombus' || cls === 'square')
      ? [1, 1, 1, 1]
      : opts.ticks && (cls === 'parallelogram' || cls === 'rect')
        ? [1, 2, 1, 2]
        : undefined;
  const rightAngleAt = opts.rightAngles && (cls === 'square' || cls === 'rect') ? [0, 1, 2, 3] : undefined;
  return {
    w: W,
    h: H,
    polys: [{ id: 'q', pts, vertexLabels: opts.labels ?? ['ア', 'イ', 'ウ', 'エ'], fill: 'accent', tickMarks, rightAngleAt }],
  };
}

/** 4つの図形を 2×2 に並べた図。「すべて選ぶ」型の問題に使う。 */
function gridFigure(shapes: Shape[]): FigureSpec {
  const cw = 46;
  const ch = 34;
  const polys = shapes.map((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const local = fitShape(s, cw, ch, 8);
    const pts: Pt[] = local.map((p) => ({ x: p.x + col * cw, y: p.y + row * ch }));
    return { id: `q${i}`, pts, label: SYMBOLS[i], fill: 'accent' as const };
  });
  return { w: cw * 2, h: ch * 2, polys };
}

/* ============================ ① 名前を こたえる ============================ */

function genBasic(): GeoProblem {
  const kind = pick<ShapeKind>(['square', 'rect', 'rhombus', 'parallelogram', 'trapezoid', 'rightTrapezoid', 'isoTrapezoid']);
  const s = makeValidShape(kind);
  const correct = SHAPE_ANSWER[kind];
  const pairs = parallelPairCount(s.raw);

  return {
    skillId: 'name-basic',
    moduleId: 'name',
    prompt: 'この四角形の 名前を こたえましょう。',
    figure: singleFigure(s),
    answer: { kind: 'name', correct, options: NAME_OPTIONS },
    hints: [
      'まず 向かい合った辺が 平行かどうかを 見よう。何組 あるかな？',
      pairs === 2
        ? '平行な組が 2組 あるね。つぎに 辺の長さと 角を 見よう。'
        : '平行な組は 1組だけ だね。1組だけ 平行な四角形の 名前は 何だったかな。',
      `${QUAD_LABEL[correct]} だよ。`,
    ],
    explain: explainName(s.raw, correct),
    label: `四角形の名前（${QUAD_LABEL[correct]}）`,
    diagnose: (given) => diagnoseName(s.raw, NAME_OPTIONS[given], correct),
    signature: `name-basic:${s.sig}`,
  };
}

function explainName(q: Pt[], correct: QuadKind): string {
  const pairs = parallelPairCount(q);
  switch (correct) {
    case 'square':
      return '4つの辺の長さが すべて 等しく、4つの角も すべて 直角。だから **正方形**。正方形は ひし形でも 長方形でも 平行四辺形でも あるよ。';
    case 'rect':
      return '向かい合う 2組の辺が 平行で、4つの角が すべて 直角。だから **長方形**。長方形は 平行四辺形の なかまでも あるよ。';
    case 'rhombus':
      return '4つの辺の長さが すべて 等しいので **ひし形**。ひし形は 平行四辺形の せいしつを ぜんぶ もっているよ。';
    case 'parallelogram':
      return '向かい合う **2組** の辺が 平行なので **平行四辺形**。辺の長さは すべて 等しくはないので ひし形では ないよ。';
    case 'trapezoid':
      return '向かい合う **1組** だけ 辺が 平行なので **台形**。2組 平行なら 平行四辺形に なるね。';
    default:
      return `平行な辺の組が ${pairs}組 しか ないので、習った 四角形の どれにも あてはまらないよ。`;
  }
}

function diagnoseName(q: Pt[], given: QuadKind, correct: QuadKind): string | null {
  if (given === correct) return null;
  const pairs = parallelPairCount(q);
  if (correct === 'trapezoid' && given === 'parallelogram') {
    return '平行な組を 数えなおそう。この図形は **1組** しか 平行では ないよ。2組 平行なのが 平行四辺形だよ。';
  }
  if (correct === 'parallelogram' && given === 'rhombus') {
    return '4つの辺を ぜんぶ はかってみよう。**すべて** 等しいときだけ ひし形だよ。';
  }
  if (correct === 'parallelogram' && given === 'trapezoid') {
    return '平行な組を もう一度。この図形は **2組** とも 平行だから 台形より くわしい 名前が つくよ。';
  }
  if (correct === 'rhombus' && given === 'parallelogram') {
    return '平行四辺形でも 合っているけれど、4つの辺が **すべて** 等しいから、もっと くわしい 名前が あるよ。';
  }
  if (correct === 'square' && (given === 'rect' || given === 'rhombus')) {
    return `${QUAD_LABEL[given]}でも 合っているけれど、辺が すべて 等しく、角も すべて 直角。いちばん くわしい 名前で こたえよう。`;
  }
  if (correct === 'other' && given !== 'other') {
    return pairs === 0
      ? '向かい合う辺を よく 見よう。**平行な組が 1つも ない** から、習った 四角形には あてはまらないよ。'
      : '辺の長さが 等しいところが あっても、平行かどうかは べつの話だよ。';
  }
  if (given === 'other') return '習った 四角形の どれかに あてはまるよ。平行な辺の組を 数えなおそう。';
  return `${QUAD_LABEL[given]}の じょうけんを 思い出そう。この図形は それを みたしていないよ。`;
}

/* ============================ ② 平行な辺は 何組？ ============================ */

function genPairs(): GeoProblem {
  const kind = pick<ShapeKind>(['square', 'rect', 'rhombus', 'parallelogram', 'trapezoid', 'rightTrapezoid', 'isoTrapezoid', 'kite', 'general']);
  const s = makeValidShape(kind);
  const pairs = parallelPairCount(s.raw);
  const choices = ['0組', '1組', '2組'];

  return {
    skillId: 'name-pairs',
    moduleId: 'name',
    prompt: 'この四角形で、向かい合った辺が **平行** な組は 何組 ありますか。',
    figure: singleFigure(s),
    answer: { kind: 'choice', choices, correct: pairs },
    hints: [
      '向かい合う辺は 2組 あるね（アイとウエ、イウとエア）。1組ずつ しらべよう。',
      '2本の辺を のばして いくと 交わるかな。交わらなければ 平行だよ。',
      `平行な組は ${pairs}組 だよ。`,
    ],
    explain:
      pairs === 2
        ? '2組とも 平行だね。2組 平行な四角形は **平行四辺形**（ひし形・長方形・正方形も なかま）だよ。'
        : pairs === 1
          ? '1組だけ 平行だね。1組だけ 平行な四角形は **台形** だよ。'
          : '平行な組は 1つも ないね。習った 四角形には あてはまらないよ。',
    label: '平行な辺の組の数',
    diagnose: (given) => {
      if (given === pairs) return null;
      if (given > pairs) return '「なんとなく 平行に 見える」だけかも。辺を のばして、本当に 交わらないか たしかめよう。';
      return '見のがしている 組が あるよ。アイとウエ、イウとエア の 2組を 両方 しらべよう。';
    },
    signature: `name-pairs:${s.sig}`,
  };
}

/* ============================ ③ にているけど ちがう ============================ */

function genCounter(): GeoProblem {
  // 反例を厚めに出す。ここが単元の「思考をゆさぶる」場面。
  const kind = pick<ShapeKind>(['isoTrapezoid', 'kite', 'general', 'isoTrapezoid', 'kite', 'rhombus', 'parallelogram']);
  const s = makeValidShape(kind);
  const correct = SHAPE_ANSWER[kind];

  const trap: Record<string, string> = {
    isoTrapezoid: '向かい合う 左右の辺の **長さは 等しい** けれど、**平行では ない**ね。長さが 等しいだけでは 平行四辺形に ならないよ。',
    kite: '辺の長さが 等しい組が 2つ あるけれど、それは **となりどうし**。ひし形は 4つ **すべて** が 等しいときだけだよ。',
    general: '平行な組が 1つも ないから、台形にも 平行四辺形にも ならないよ。',
    rhombus: '4つの辺が すべて 等しいので ひし形。かたむいていても 名前は 変わらないよ。',
    parallelogram: '2組とも 平行なので 平行四辺形。辺の長さは すべて 等しくは ないよ。',
  };

  return {
    skillId: 'name-counter',
    moduleId: 'name',
    prompt: 'この四角形の 名前を こたえましょう。（あてはまるものが ないときは「どれでもない」）',
    figure: singleFigure(s, { ticks: true }),
    answer: { kind: 'name', correct, options: NAME_OPTIONS },
    hints: [
      '辺の長さが 等しいことと、辺が 平行なことは **べつのこと** だよ。',
      'まず 平行な組を 数える。つぎに 長さを くらべる。この順で しらべよう。',
      `${QUAD_LABEL[correct]} だよ。`,
    ],
    explain: trap[kind] ?? explainName(s.raw, correct),
    label: `にた図形の見わけ（${QUAD_LABEL[correct]}）`,
    diagnose: (given) => {
      const g = NAME_OPTIONS[given];
      if (g === correct) return null;
      if (kind === 'isoTrapezoid' && g === 'parallelogram') return trap.isoTrapezoid;
      if (kind === 'kite' && g === 'rhombus') return trap.kite;
      if (kind === 'kite' && g === 'parallelogram') return '向かい合う辺を のばして みよう。どの組も 平行では ないよ。';
      return diagnoseName(s.raw, g, correct);
    },
    signature: `name-counter:${s.sig}`,
  };
}

/* ============================ ④ すべて えらぶ ============================ */

function genFind(): GeoProblem {
  const target = pick<QuadKind>(['rhombus', 'parallelogram', 'trapezoid', 'rect']);
  const pool: ShapeKind[] = ['square', 'rect', 'rhombus', 'parallelogram', 'trapezoid', 'isoTrapezoid', 'rightTrapezoid', 'kite', 'general'];
  const kinds = pickN(pool, 4);
  const shapes = kinds.map((k) => makeValidShape(k));
  // 正解は「その名前だと **いえる**」もの＝包含関係で判定する。
  // 例: 正方形は ひし形とも 長方形とも 平行四辺形とも いえる。
  const correct = shapes.map((s, i) => (isKind(s.raw, target) ? i : -1)).filter((i) => i >= 0);
  // 正解が0個だと「1つも えらばない」が正解になり 混乱するので作り直す
  if (correct.length === 0 || correct.length === 4) return genFind();

  return {
    skillId: 'name-find',
    moduleId: 'name',
    prompt: `下の4つの図から、**${QUAD_LABEL[target]}** と いえるものを **すべて** えらびましょう。`,
    figure: gridFigure(shapes),
    answer: { kind: 'multi', choices: SYMBOLS, correct },
    hints: [
      `${QUAD_LABEL[target]}の じょうけんは 何だったかな。1つずつ たしかめよう。`,
      target === 'rhombus'
        ? '4つの辺が **すべて** 等しければ ひし形。正方形も ひし形の なかまだよ。'
        : target === 'parallelogram'
          ? '向かい合う **2組** の辺が 平行なら 平行四辺形。長方形も 正方形も ひし形も なかまだよ。'
          : target === 'rect'
            ? '4つの角が すべて 直角なら 長方形。正方形も 長方形の なかまだよ。'
            : '向かい合う **1組** でも 平行なら 台形だよ。',
      `${correct.map((i) => SYMBOLS[i]).join('・')} が ${QUAD_LABEL[target]}だよ。`,
    ],
    explain: shapes
      .map((s, i) => `${SYMBOLS[i]}：${QUAD_LABEL[SHAPE_ANSWER[s.kind]]}${isKind(s.raw, target) ? ` → ${QUAD_LABEL[target]}と いえる` : ''}`)
      .join('\n'),
    label: `${QUAD_LABEL[target]}をすべて選ぶ`,
    signature: `name-find:${target}:${shapes.map((s) => s.sig).join('|')}`,
  };
}

/* ============================ ⑤ 〜と いえる？ ============================ */

/**
 * 包含関係（解説 p.204「正方形，長方形は…平行四辺形と同じ性質をもっている図形として捉え直す」）。
 * 「正方形は平行四辺形ではない（別のもの）」という誤概念に正面から当てる。
 */
/**
 * reason は「そう言える／言えない わけ」の短い形（選択肢に使う）。why は解説（くわしい形）。
 * 紙のテストの裏面は「いえますか。わけも書きましょう」と、判断と理由をセットで問う。
 * 判断だけの2択にすると、当てずっぽうでも半分は当たるので、判断とわけを組にした4択にする。
 */
const INCLUSION_QUESTIONS: { from: ShapeKind; to: QuadKind; reason: string; why: string }[] = [
  { from: 'square', to: 'parallelogram', reason: '向かい合う 2組の辺が 平行だから', why: '正方形は 向かい合う 2組の辺が 平行。だから 平行四辺形の なかまだよ。' },
  { from: 'square', to: 'rhombus', reason: '4つの辺の長さが すべて 等しいから', why: '正方形は 4つの辺が すべて 等しい。だから ひし形の なかまだよ。' },
  { from: 'square', to: 'rect', reason: '4つの角が すべて 直角だから', why: '正方形は 4つの角が すべて 直角。だから 長方形の なかまだよ。' },
  { from: 'rect', to: 'parallelogram', reason: '向かい合う 2組の辺が 平行だから', why: '長方形は 向かい合う 2組の辺が 平行。だから 平行四辺形の なかまだよ。' },
  { from: 'rect', to: 'rhombus', reason: '4つの辺の長さが すべて 等しいとは かぎらないから', why: '長方形の 4つの辺は すべて 等しいとは かぎらない。だから ひし形とは いえないよ。' },
  { from: 'rhombus', to: 'parallelogram', reason: '向かい合う 2組の辺が 平行だから', why: 'ひし形は 向かい合う 2組の辺が 平行。平行四辺形の せいしつを ぜんぶ もっているよ。' },
  { from: 'rhombus', to: 'square', reason: '4つの角が 直角とは かぎらないから', why: 'ひし形の 角は 直角とは かぎらない。だから 正方形とは いえないよ。' },
  { from: 'parallelogram', to: 'rhombus', reason: '4つの辺の長さが すべて 等しいとは かぎらないから', why: '平行四辺形の 4つの辺は すべて 等しいとは かぎらない。だから ひし形とは いえないよ。' },
  { from: 'parallelogram', to: 'rect', reason: '4つの角が 直角とは かぎらないから', why: '平行四辺形の 角は 直角とは かぎらない。だから 長方形とは いえないよ。' },
  { from: 'isoTrapezoid', to: 'parallelogram', reason: '平行な 辺の組が 1組しか ないから', why: '台形は 平行な組が 1組だけ。2組 必要な 平行四辺形とは いえないよ。' },
  { from: 'trapezoid', to: 'parallelogram', reason: '平行な 辺の組が 1組しか ないから', why: '台形は 平行な組が 1組だけ。2組 必要な 平行四辺形とは いえないよ。' },
  { from: 'kite', to: 'rhombus', reason: '4つの辺の長さが すべて 等しくは ないから', why: 'たこ形は となりどうしの 辺が 等しいだけ。4つ すべてが 等しい ひし形とは いえないよ。' },
];

/** その四角形の じょうけん（「〜から」の形）。まちがいの選択肢「じょうけんを みたしている／いない」に使う */
const CONDITION: Partial<Record<QuadKind, string>> = {
  parallelogram: '向かい合う 2組の辺が 平行',
  rhombus: '4つの辺の長さが すべて 等しい',
  rect: '4つの角が すべて 直角',
  square: '4つの辺が 等しく、4つの角が すべて 直角',
};

/** まちがいの選択肢の型（誤答診断に使う） */
type IncludeWrong = 'name' | 'look' | 'cond';
const INCLUDE_ADVICE: Record<IncludeWrong, string> = {
  name: '名前が ちがっても、じょうけんを ぜんぶ みたしていれば その なかまと いえるよ。名前ではなく じょうけんで きめよう。',
  look: '見た目が にているかではなく、辺の長さ・角・平行の じょうけんで きめよう。',
  cond: 'じょうけんを みたしているか、図の 辺と角を もう一度 1つずつ たしかめよう。',
};

function genInclude(): GeoProblem {
  const q = pick(INCLUSION_QUESTIONS);
  const s = makeValidShape(q.from);
  const yes = isKind(s.raw, q.to);
  const cond = CONDITION[q.to] ?? '';
  // 判断（いえる／いえない）と わけ を組にした4択。正解は「正しい判断＋正しいわけ」の1つだけ
  const items: { text: string; wrong: IncludeWrong | null }[] = yes
    ? [
        { text: `いえる。${q.reason}。`, wrong: null },
        { text: 'いえない。名前が ちがうので、べつの 四角形だから。', wrong: 'name' },
        { text: 'いえる。形が なんとなく にているから。', wrong: 'look' },
        { text: `いえない。${cond}とは かぎらないから。`, wrong: 'cond' },
      ]
    : [
        { text: `いえない。${q.reason}。`, wrong: null },
        { text: 'いえない。名前が ちがうので、べつの 四角形だから。', wrong: 'name' },
        { text: 'いえる。形が なんとなく にているから。', wrong: 'look' },
        { text: `いえる。${cond}から。`, wrong: 'cond' },
      ];
  const order = shuffle(items.map((_, i) => i));
  const choices = order.map((i) => items[i].text);
  const correct = order.indexOf(0);
  const fromLabel = QUAD_LABEL[SHAPE_ANSWER[q.from]] === 'どれでもない' ? 'たこ形' : QUAD_LABEL[SHAPE_ANSWER[q.from]];

  return {
    skillId: 'name-include',
    moduleId: 'name',
    prompt: `この図形（${fromLabel}）は、**${QUAD_LABEL[q.to]}** と いえますか。わけも あわせて えらびましょう。`,
    figure: singleFigure(s, { ticks: true, rightAngles: true }),
    answer: { kind: 'choice', choices, correct },
    hints: [
      `${QUAD_LABEL[q.to]}の じょうけん（${cond}）を 思い出そう。`,
      'その じょうけんを、この図形が いつでも みたしているか 見よう。名前や 見た目ではなく、じょうけんで きめるよ。',
      yes ? 'じょうけんを ぜんぶ みたしているよ。わけも じょうけんで 言えている ものを えらぼう。' : 'みたしていない じょうけんが あるよ。どの じょうけんか 言えている ものを えらぼう。',
    ],
    explain: q.why,
    label: `${QUAD_LABEL[q.to]}といえるか`,
    diagnose: (given) => {
      if (given === correct) return null;
      const w = items[order[given]]?.wrong;
      return w ? `${INCLUDE_ADVICE[w]}（${q.why}）` : q.why;
    },
    signature: `name-include:${q.from}->${q.to}:${s.sig}`,
  };
}

/* ============================ ⑥ せいしつの ひょう ============================ */

/**
 * 四角形 × 性質 の一覧表。市販の単元テストで定番の形式で、
 * 「平行・辺の長さ・角・対角線を **すべて** 調べて判断する」という
 * 単元の到達目標（授業実践でいう C 段階）に直接あたる。
 *
 * 正解は、その種類の代表的な図形から **実際に計算して** 決める。
 * 表を手で書くと写しまちがいが混入し、しかも tsc も build も通ってしまうため。
 */
const TABLE_PROPS: { label: string; test: (q: Pt[]) => boolean }[] = [
  { label: '向かい合う 辺が 2組とも 平行', test: (q) => parallelPairCount(q) === 2 },
  { label: '向かい合う 辺の 長さが 等しい', test: (q) => {
    const e = edgeLengths(q);
    return Math.abs(e[0] - e[2]) < 1e-6 && Math.abs(e[1] - e[3]) < 1e-6;
  } },
  { label: '4つの 辺の 長さが すべて 等しい', test: allSidesEqual },
  { label: '向かい合う 角の 大きさが 等しい', test: (q) => {
    const a = interiorAngles(q);
    return Math.abs(a[0] - a[2]) < 0.5 && Math.abs(a[1] - a[3]) < 0.5;
  } },
  { label: '4つの 角が すべて 直角', test: allAnglesRight },
  { label: '2本の 対角線が 垂直に 交わる', test: (q) => diagonalFacts(q).perpendicular },
  { label: '2本の 対角線の 長さが 等しい', test: (q) => diagonalFacts(q).equalLength },
  { label: '2本の 対角線が たがいに 二等分される', test: (q) => diagonalFacts(q).bisectEachOther },
];

/** 表の行に使う四角形。台形は「等脚でない一般の台形」を代表とする（教科書の表と同じ扱い）。 */
const TABLE_ROWS: { kind: ShapeKind; label: string }[] = [
  { kind: 'trapezoid', label: '台形' },
  { kind: 'parallelogram', label: '平行四辺形' },
  { kind: 'rhombus', label: 'ひし形' },
  { kind: 'rect', label: '長方形' },
  { kind: 'square', label: '正方形' },
];

function genTable(): GeoProblem {
  // 3行×3列。小4がスマホでも押しきれる大きさに絞る（テストは5×7だが、練習は分割してよい）
  const rows = pickN(TABLE_ROWS, 3);
  const cols = pickN(TABLE_PROPS, 3);
  const shapes = rows.map((r) => makeValidShape(r.kind));
  const correct = shapes.map((s) => cols.map((c) => c.test(s.raw)));

  // すべて○／すべて× になると弁別にならないので作り直す
  const flat = correct.flat();
  if (flat.every((v) => v) || flat.every((v) => !v)) return genTable();

  // 図形の下に名前（キャプション）を置くぶんの高さを確保する
  const cw = 44;
  const ch = 40;
  const shapeH = 30;
  const polys = shapes.map((s, i) => {
    const local = fitShape(s, cw, shapeH, 7);
    return {
      id: `q${i}`,
      pts: local.map((p) => ({ x: p.x + i * cw, y: p.y })),
      label: rows[i].label,
      labelBelow: true,
      fill: 'accent' as const,
    };
  });

  return {
    skillId: 'name-table',
    moduleId: 'name',
    prompt: 'つぎの 表で、あてはまる ところに ○、あてはまらない ところに × を つけましょう。',
    figure: { w: cw * 3, h: ch, polys, note: '※ どの向きに おいても せいしつは 同じ' },
    answer: {
      kind: 'matrix',
      rowLabels: rows.map((r) => r.label),
      colLabels: cols.map((c) => c.label),
      correct,
    },
    hints: [
      '1つの ますごとに「この四角形は、この せいしつを もっているかな？」と 考えよう。',
      '「いつでも そうなる」なら ○。「そうならないことも ある」なら × だよ。',
      rows
        .map((r, i) => `${r.label}：${cols.map((c, j) => (correct[i][j] ? '○' : '×')).join('')}`)
        .join(' ／ '),
    ],
    explain: rows
      .map((r, i) => `${r.label} … ${cols.map((c, j) => `${c.label}＝${correct[i][j] ? '○' : '×'}`).join('、')}`)
      .join('\n'),
    label: 'せいしつの一覧表',
    signature: `name-table:${rows.map((r) => r.kind).join(',')}:${cols.map((c) => c.label).join(',')}`,
  };
}

/* ============================ ⑦ なかま分け ============================ */

/**
 * 解説 p.204「平行が何組あるかに着目することで，図形を分類することが可能になる。
 * 四角形を取り上げると，一組しかない四角形（台形）と二組ある四角形
 * （平行四辺形，ひし形）に分類することができる」に対応する。
 *
 * 授業では「かいた四角形を仲間分けする」のが中心活動なので、
 * 「1種類をすべて選ぶ」（name-find）とは別に、複数のグループへ振り分ける形を用意する。
 */
const SORT_GROUPS = ['平行な辺が ない', '平行な辺が 1組', '平行な辺が 2組'];

function genSort(): GeoProblem {
  const pool: ShapeKind[] = ['square', 'rect', 'rhombus', 'parallelogram', 'trapezoid', 'isoTrapezoid', 'rightTrapezoid', 'kite', 'general'];
  const kinds = pickN(pool, 4);
  const shapes = kinds.map((k) => makeValidShape(k));
  const correct = shapes.map((s) => parallelPairCount(s.raw));
  // 1つのグループに全部入ってしまうと 分類にならない
  if (new Set(correct).size < 2) return genSort();

  const cw = 46;
  const ch = 34;
  const polys = shapes.map((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const local = fitShape(s, cw, ch, 8);
    return {
      id: `q${i}`,
      pts: local.map((p) => ({ x: p.x + col * cw, y: p.y + row * ch })),
      label: SYMBOLS[i],
      fill: 'accent' as const,
    };
  });

  return {
    skillId: 'name-sort',
    moduleId: 'name',
    prompt: '4つの 四角形を、**平行な辺の 組の数** で なかま分けしましょう。',
    figure: { w: cw * 2, h: ch * 2, polys },
    answer: { kind: 'sort', itemLabels: SYMBOLS, groups: SORT_GROUPS, correct },
    hints: [
      '向かい合う辺は 2組 あるね。1組ずつ「平行かどうか」を しらべよう。',
      '辺を のばして 考えるのを わすれずに。長さが 等しいことと 平行なことは べつだよ。',
      shapes.map((_, i) => `${SYMBOLS[i]}：${SORT_GROUPS[correct[i]]}`).join(' ／ '),
    ],
    explain: shapes
      .map((s, i) => `${SYMBOLS[i]}：${QUAD_LABEL[SHAPE_ANSWER[s.kind]] === 'どれでもない' && s.kind === 'kite' ? 'たこ形' : QUAD_LABEL[SHAPE_ANSWER[s.kind]]} → 平行な辺が ${correct[i]}組`)
      .join('\n') + '\n平行が 1組なら 台形、2組なら 平行四辺形の なかま（ひし形・長方形・正方形もふくむ）だよ。',
    label: '平行の組の数でなかま分け',
    signature: `name-sort:${shapes.map((s) => s.sig).join('|')}`,
  };
}

export function generateName(level: NameLevel): GeoProblem {
  switch (level) {
    case 'name-basic':
      return genBasic();
    case 'name-pairs':
      return genPairs();
    case 'name-counter':
      return genCounter();
    case 'name-find':
      return genFind();
    case 'name-include':
      return genInclude();
    case 'name-table':
      return genTable();
    case 'name-sort':
      return genSort();
  }
}
