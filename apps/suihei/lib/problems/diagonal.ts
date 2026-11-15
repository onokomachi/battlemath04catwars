// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/lib/problems/diagonal.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * モジュール5「対角線のひみつ」。
 *
 * 解説 p.203 の対角線の記述と、東京書籍の指導内容「いろいろな四角形の対角線の性質」
 * ＋発展「対角線による四角形の考察」に対応する。扱う性質は3つ:
 *   ① 2本の対角線の長さが等しい
 *   ② 2本の対角線が垂直に交わる
 *   ③ 2本の対角線が互いに二等分される
 *
 * 「四角形 → 対角線の性質」だけでなく **逆向き**（対角線の性質 → 四角形の名前）も出す。
 * 双方向にしないと、性質の表を丸暗記しただけでも解けてしまう。
 */
import { FigureSpec, Pt, QUAD_LABEL, QuadKind } from '../../types';
import { GeoProblem, LevelDef } from '../problemTypes';
import { diagonalFacts, mid } from '../geometry';
import { Shape, ShapeKind, SHAPE_ANSWER, fitShape, makeValidShape, pickVertexLabels } from './shapes';
import { pick, pickN, shuffle } from './rng';

export type DiagonalLevel = 'diag-mean' | 'diag-facts' | 'diag-reverse' | 'diag-compare' | 'diag-cut';

export const DIAGONAL_LEVELS: LevelDef<DiagonalLevel>[] = [
  { id: 'diag-mean', label: '① 対角線とは', desc: '向かい合った頂点を むすんだ 直線が 対角線。' },
  { id: 'diag-facts', label: '② 対角線の せいしつ', desc: '長さは 等しい？ 垂直に 交わる？ 二等分される？' },
  { id: 'diag-reverse', label: '③ せいしつから 名前を', desc: '対角線の せいしつだけを 手がかりに 四角形を あてよう。' },
  { id: 'diag-compare', label: '④ どの四角形？', desc: '4つの図から、その せいしつを もつものを すべて えらぼう。' },
  { id: 'diag-cut', label: '⑤ 対角線で 切ると', desc: '対角線で 切ると どんな形が いくつ できる？（東書の発展）' },
];

const W = 56;
const H = 40;
const SYMBOLS = ['あ', 'い', 'う', 'え'];

/** 対角線つきの1図形。頂点の記号は毎回 ア〜エ / A〜D から選ぶ。 */
function figureWithDiagonals(s: Shape, showDiagonals: boolean, labels: string[] = ['ア', 'イ', 'ウ', 'エ']): FigureSpec {
  const pts = fitShape(s, W, H);
  return {
    w: W,
    h: H,
    polys: [
      {
        id: 'q',
        pts,
        vertexLabels: labels,
        fill: 'accent',
        diagonals: showDiagonals ? [0, 1] : undefined,
      },
    ],
  };
}

/** 対角線の性質を持つ図形の種類。逆向き問題の正解表そのもの。 */
const KIND_FACTS: { kind: ShapeKind; name: QuadKind; equal: boolean; perp: boolean; bisect: boolean }[] = [
  { kind: 'square', name: 'square', equal: true, perp: true, bisect: true },
  { kind: 'rect', name: 'rect', equal: true, perp: false, bisect: true },
  { kind: 'rhombus', name: 'rhombus', equal: false, perp: true, bisect: true },
  { kind: 'parallelogram', name: 'parallelogram', equal: false, perp: false, bisect: true },
  { kind: 'isoTrapezoid', name: 'trapezoid', equal: true, perp: false, bisect: false },
  { kind: 'trapezoid', name: 'trapezoid', equal: false, perp: false, bisect: false },
];

/* ============================ ① 対角線とは ============================ */

function genMean(): GeoProblem {
  const s = makeValidShape(pick<ShapeKind>(['square', 'rect', 'rhombus', 'parallelogram', 'trapezoid', 'isoTrapezoid']));
  const variant = pick(['name', 'count', 'which'] as const);
  const L = pickVertexLabels();

  if (variant === 'name') {
    const items = [
      { t: '対角線', ok: true, why: '向かい合った頂点を むすんだ 直線を **対角線** と いうよ。' },
      { t: '平行線', ok: false, why: '平行線は「交わらない 2本の直線」のこと。頂点を むすんだ線では ないよ。' },
      { t: '垂直線', ok: false, why: '垂直は 2直線の 交わり方の 名前だよ。' },
      { t: '対辺（たいへん）', ok: false, why: '辺では なく、頂点と 頂点を むすんだ 直線だね。' },
    ];
    const sh = shuffle(items);
    const correct = sh.findIndex((x) => x.ok);
    return {
      skillId: 'diag-mean',
      moduleId: 'diagonal',
      prompt: `点${L[0]} と 点${L[2]} を むすんだ 赤い直線を 何と いいますか。`,
      figure: (() => {
        const f = figureWithDiagonals(s, false, L);
        f.polys![0].diagonals = [0];
        return f;
      })(),
      answer: { kind: 'choice', choices: sh.map((x) => x.t), correct },
      hints: [`${L[0]}と${L[2]}は、となりどうしでは なく **向かい合った** 頂点だね。`, '四角形の 向かい合った頂点を むすんだ 直線の 名前だよ。', '「対角線」だよ。'],
      explain: '四角形の **対角線** とは、向かい合う頂点を むすんでできる 直線のこと。四角形の 対角線は 2本 あるよ。',
      label: '対角線の意味',
      diagnose: (given) => (given === correct ? null : sh[given].why),
      signature: `diag-mean:name:${s.sig}:${L[0]}`,
    };
  }

  if (variant === 'count') {
    return {
      skillId: 'diag-mean',
      moduleId: 'diagonal',
      prompt: 'この四角形に、対角線は 何本 ひけますか。',
      figure: figureWithDiagonals(s, false, L),
      answer: { kind: 'number', correct: 2, unit: '本' },
      hints: [
        '対角線は「向かい合った 頂点」どうしを むすぶ 直線だよ。',
        `${L[0]}と${L[2]}、${L[1]}と${L[3]}。となりどうし（${L[0]}と${L[1]} など）は 辺に なってしまうね。`,
        '2本 だよ。',
      ],
      explain: `四角形の 対角線は **2本**。${L[0]}と${L[2]}、${L[1]}と${L[3]} を むすんだ 直線だよ。となりどうしを むすぶと それは 辺だね。`,
      label: '対角線の本数',
      diagnose: (given) => {
        if (given === 2) return null;
        if (given === 4) return 'となりどうしを むすんだ線（アとイ など）は 対角線では なく **辺** だよ。';
        if (given === 1) return `もう1本 あるよ。${L[0]}と${L[2]} の ほかに、${L[1]}と${L[3]} も 向かい合っているね。`;
        return '向かい合った頂点の 組を 数えよう。四角形では 2組 あるよ。';
      },
      signature: `diag-mean:count:${s.sig}:${L[0]}`,
    };
  }

  // which: 4本の線から対角線であるものをすべて選ぶ
  const opts = [
    { t: `点${L[0]} と 点${L[2]} を むすんだ 直線`, ok: true },
    { t: `点${L[1]} と 点${L[3]} を むすんだ 直線`, ok: true },
    { t: `点${L[0]} と 点${L[1]} を むすんだ 直線`, ok: false },
    { t: `点${L[2]} と 点${L[3]} を むすんだ 直線`, ok: false },
  ];
  const sh = shuffle(opts);
  const correct = sh.map((x, i) => (x.ok ? i : -1)).filter((i) => i >= 0);
  return {
    skillId: 'diag-mean',
    moduleId: 'diagonal',
    prompt: 'この四角形の **対角線** を すべて えらびましょう。',
    figure: figureWithDiagonals(s, false, L),
    answer: { kind: 'multi', choices: sh.map((x) => x.t), correct },
    hints: ['対角線は 向かい合った頂点どうしを むすぶよ。', `${L[0]}の 向かい合う頂点は ${L[2]}、${L[1]}の 向かい合う頂点は ${L[3]} だね。`, '2本 あるよ。'],
    explain: `対角線は ${L[0]}と${L[2]}、${L[1]}と${L[3]} の 2本。${L[0]}と${L[1]} のように となりどうしを むすんだ線は **辺** だよ。`,
    label: '対角線をすべて選ぶ',
    signature: `diag-mean:which:${s.sig}:${L[0]}:${sh.map((x) => x.t).join('|')}`,
  };
}

/* ============================ ② 対角線の せいしつ ============================ */

function genFacts(): GeoProblem {
  const entry = pick(KIND_FACTS);
  const s = makeValidShape(entry.kind);
  // 図から計算した事実と、表の事実が一致していることを確かめる（表の写しまちがい対策）
  const actual = diagonalFacts(s.raw);
  if (actual.equalLength !== entry.equal || actual.perpendicular !== entry.perp || actual.bisectEachOther !== entry.bisect) {
    return genFacts();
  }

  return {
    skillId: 'diag-facts',
    moduleId: 'diagonal',
    prompt: `この四角形（**${QUAD_LABEL[entry.name]}**）の 2本の対角線について、正しければ ○、まちがいなら × を えらびましょう。`,
    figure: figureWithDiagonals(s, true),
    answer: {
      kind: 'truth',
      rows: [
        { label: '2本の 対角線の 長さは 等しい', correct: entry.equal },
        { label: '2本の 対角線は 垂直に 交わる', correct: entry.perp },
        { label: '2本の 対角線は たがいに 二等分される', correct: entry.bisect },
      ],
    },
    hints: [
      '図の 赤い点線を よく 見よう。2本の 長さを くらべて、交わり方も 見る。',
      '「二等分される」＝ 交わったところが、どちらの 対角線の 真ん中にも なっている、ということだよ。',
      `長さが等しい：${entry.equal ? '○' : '×'} ／ 垂直：${entry.perp ? '○' : '×'} ／ 二等分：${entry.bisect ? '○' : '×'}`,
    ],
    explain: diagonalExplain(entry),
    label: `${QUAD_LABEL[entry.name]}の対角線`,
    signature: `diag-facts:${entry.kind}:${s.sig}`,
  };
}

function diagonalExplain(e: { name: QuadKind; equal: boolean; perp: boolean; bisect: boolean }): string {
  const lines = [
    `長さが 等しい：${e.equal ? '○' : '×'}`,
    `垂直に 交わる：${e.perp ? '○' : '×'}`,
    `たがいに 二等分される：${e.bisect ? '○' : '×'}`,
  ];
  const extra: Partial<Record<QuadKind, string>> = {
    square: '正方形は「長方形の せいしつ」も「ひし形の せいしつ」も 両方 もっているので、3つとも ○ に なるよ。',
    rect: '長方形の 対角線は 長さが 等しい。でも 垂直には 交わらないよ。',
    rhombus: 'ひし形の 対角線は 垂直に 交わる。でも 長さは ちがうよ。',
    parallelogram: '平行四辺形の 対角線は たがいに 二等分される。長さも 交わり方も とくべつでは ないよ。',
    trapezoid: '台形の 対角線は 二等分されない。ただし **等脚台形** のときだけ 長さが 等しくなるよ。',
  };
  return `${lines.join(' ／ ')}\n${extra[e.name] ?? ''}`;
}

/* ============================ ③ せいしつから 名前を ============================ */

function genReverse(): GeoProblem {
  const entry = pick(KIND_FACTS.filter((e) => e.name !== 'trapezoid'));
  // 同じ性質の組み合わせを持つ別の四角形がないことを確かめる（答えが1つに決まる保証）
  const same = KIND_FACTS.filter((e) => e.equal === entry.equal && e.perp === entry.perp && e.bisect === entry.bisect);
  if (same.length !== 1) return genReverse();

  const options: QuadKind[] = ['square', 'rect', 'rhombus', 'parallelogram', 'trapezoid', 'other'];
  const desc = [
    `・2本の 対角線の 長さは ${entry.equal ? '等しい' : '等しくない'}`,
    `・2本の 対角線は ${entry.perp ? '垂直に 交わる' : '垂直には 交わらない'}`,
    `・2本の 対角線は ${entry.bisect ? 'たがいに 二等分される' : '二等分されない'}`,
  ].join('\n');

  // 図は「対角線だけ」を見せる。四角形の形を見せてしまうと、対角線から考える必然性が消える。
  const s = makeValidShape(entry.kind);
  const pts = fitShape(s, W, H, 10);
  const c = mid(pts[0], pts[2]);
  const figure: FigureSpec = {
    w: W,
    h: H,
    lines: [
      { id: 'd1', a: pts[0], b: pts[2], color: 'accent2' },
      { id: 'd2', a: pts[1], b: pts[3], color: 'accent2' },
    ],
    points: [{ id: 'c', at: c, color: 'accent' }],
    note: '対角線だけを かいた図',
  };

  return {
    skillId: 'diag-reverse',
    moduleId: 'diagonal',
    prompt: `つぎのような 2本の対角線を もつ 四角形は 何ですか。\n${desc}`,
    figure,
    answer: { kind: 'name', correct: entry.name, options },
    hints: [
      '対角線が 「垂直に 交わる」のは どの四角形だったかな。',
      '「長さが 等しい」のは 長方形と 正方形。「垂直に 交わる」のは ひし形と 正方形だよ。',
      `${QUAD_LABEL[entry.name]} だよ。`,
    ],
    explain: `${QUAD_LABEL[entry.name]}の 対角線は、${entry.equal ? '長さが 等しく' : '長さは ちがい'}、${entry.perp ? '垂直に 交わり' : '垂直では なく'}、${entry.bisect ? 'たがいに 二等分される' : '二等分されない'}。この3つが そろうのは ${QUAD_LABEL[entry.name]}だけだよ。`,
    label: `対角線から名前（${QUAD_LABEL[entry.name]}）`,
    diagnose: (given) => {
      const g = options[given];
      if (g === entry.name) return null;
      const other = KIND_FACTS.find((e) => e.name === g);
      if (!other) return '対角線の 3つの せいしつを 1つずつ 見くらべよう。';
      const diffs: string[] = [];
      if (other.equal !== entry.equal) diffs.push(`長さが 等しいか（${QUAD_LABEL[g]}は ${other.equal ? '等しい' : '等しくない'}）`);
      if (other.perp !== entry.perp) diffs.push(`垂直に 交わるか（${QUAD_LABEL[g]}は ${other.perp ? '垂直' : '垂直でない'}）`);
      if (other.bisect !== entry.bisect) diffs.push(`二等分されるか（${QUAD_LABEL[g]}は ${other.bisect ? 'される' : 'されない'}）`);
      return `${QUAD_LABEL[g]}とは、${diffs.join('・')} が ちがうよ。`;
    },
    signature: `diag-reverse:${entry.kind}:${s.sig}`,
  };
}

/* ============================ ④ どの四角形？ ============================ */

function genCompare(): GeoProblem {
  const prop = pick(['equal', 'perp', 'bisect'] as const);
  const label = prop === 'equal' ? '2本の 対角線の 長さが 等しい' : prop === 'perp' ? '2本の 対角線が 垂直に 交わる' : '2本の 対角線が たがいに 二等分される';
  const kinds = pickN(KIND_FACTS.map((e) => e.kind), 4);
  const shapes = kinds.map((k) => makeValidShape(k));
  const correct = shapes
    .map((s, i) => {
      const f = diagonalFacts(s.raw);
      const hit = prop === 'equal' ? f.equalLength : prop === 'perp' ? f.perpendicular : f.bisectEachOther;
      return hit ? i : -1;
    })
    .filter((i) => i >= 0);
  if (correct.length === 0 || correct.length === 4) return genCompare();

  const cw = 46;
  const ch = 34;
  const polys = shapes.map((s, i) => {
    const col = i % 2;
    const row = Math.floor(i / 2);
    const local = fitShape(s, cw, ch, 9);
    const pts: Pt[] = local.map((p) => ({ x: p.x + col * cw, y: p.y + row * ch }));
    return { id: `q${i}`, pts, label: SYMBOLS[i], fill: 'accent' as const, diagonals: [0, 1] };
  });

  return {
    skillId: 'diag-compare',
    moduleId: 'diagonal',
    prompt: `下の4つの図から、**${label}** ものを すべて えらびましょう。`,
    figure: { w: cw * 2, h: ch * 2, polys },
    answer: { kind: 'multi', choices: SYMBOLS, correct },
    hints: [
      '赤い点線が 対角線だよ。1つずつ 見くらべよう。',
      prop === 'equal'
        ? '長さが 等しくなるのは 長方形と 正方形、それに 等脚台形だよ。'
        : prop === 'perp'
          ? '垂直に 交わるのは ひし形と 正方形だよ。'
          : '二等分されるのは 平行四辺形の なかま（平行四辺形・ひし形・長方形・正方形）だよ。',
    `${correct.map((i) => SYMBOLS[i]).join('・')} だよ。`,
    ],
    explain: shapes
      .map((s, i) => {
        const f = diagonalFacts(s.raw);
        const hit = prop === 'equal' ? f.equalLength : prop === 'perp' ? f.perpendicular : f.bisectEachOther;
        return `${SYMBOLS[i]}：${QUAD_LABEL[SHAPE_ANSWER[s.kind]]} → ${hit ? '○' : '×'}`;
      })
      .join('\n'),
    label: `対角線のせいしつで選ぶ`,
    signature: `diag-compare:${prop}:${shapes.map((s) => s.sig).join('|')}`,
  };
}

/* ============================ ⑤ 対角線で 切ると ============================ */

/**
 * 東京書籍の指導内容にある「発展：対角線による四角形の考察」。
 * 対角線をひくと四角形が三角形に分かれることを扱う。
 * 「性質を覚える」から「性質を使って考える」へ進む場面で、思考・判断・表現にあたる。
 */
const CUT_CASES: { kind: ShapeKind; name: string; cuts: number[]; answer: string; wrongs: string[]; why: string }[] = [
  {
    kind: 'parallelogram',
    name: '平行四辺形',
    cuts: [0],
    answer: '同じ 形・同じ 大きさの 三角形が 2つ',
    wrongs: ['直角三角形が 2つ', '大きさの ちがう 三角形が 2つ', '四角形が 2つ'],
    why: '平行四辺形は 向かい合う辺の長さが 等しいので、対角線で 分けた 2つの三角形は ぴったり 重なるよ。',
  },
  {
    kind: 'rect',
    name: '長方形',
    cuts: [0],
    answer: '同じ 形・同じ 大きさの **直角三角形** が 2つ',
    wrongs: ['直角の ない 三角形が 2つ', '大きさの ちがう 直角三角形が 2つ', '正方形が 2つ'],
    why: '長方形の 角は すべて 直角なので、対角線で 分けると 直角三角形が 2つ できるよ。',
  },
  {
    kind: 'rhombus',
    name: 'ひし形',
    cuts: [0, 1],
    answer: '同じ 形・同じ 大きさの **直角三角形** が 4つ',
    wrongs: ['直角の ない 三角形が 4つ', '三角形が 2つ', '大きさの ちがう 三角形が 4つ'],
    why: 'ひし形の 2本の対角線は **垂直に交わり**、たがいに **二等分される**。だから 同じ 直角三角形が 4つ できるよ。',
  },
  {
    kind: 'square',
    name: '正方形',
    cuts: [0, 1],
    answer: '同じ 形・同じ 大きさの **直角三角形** が 4つ',
    wrongs: ['正方形が 4つ', '三角形が 2つ', '大きさの ちがう 三角形が 4つ'],
    why: '正方形の 対角線も 垂直に交わって たがいに 二等分されるので、同じ 直角三角形が 4つに 分かれるよ。',
  },
  {
    kind: 'trapezoid',
    name: '台形',
    cuts: [0],
    answer: '大きさの ちがう 三角形が 2つ',
    wrongs: ['同じ 形・同じ 大きさの 三角形が 2つ', '直角三角形が 2つ', '四角形が 2つ'],
    why: '台形は 向かい合う辺の長さが 等しくないので、対角線で 分けても 同じ大きさには ならないよ。',
  },
];

function genCut(): GeoProblem {
  const c = pick(CUT_CASES);
  const s = makeValidShape(c.kind);
  const L = pickVertexLabels();
  const items = shuffle([{ t: c.answer, ok: true }, ...c.wrongs.map((t) => ({ t, ok: false }))]);
  const correct = items.findIndex((x) => x.ok);

  const f = figureWithDiagonals(s, true, L);
  f.polys![0].diagonals = c.cuts;
  f.note = c.cuts.length === 1 ? '対角線を 1本 ひいた図' : '対角線を 2本 ひいた図';

  return {
    skillId: 'diag-cut',
    moduleId: 'diagonal',
    prompt: `**${c.name}** を、赤い ${c.cuts.length === 1 ? '対角線 1本' : '2本の 対角線'} で 切ると、どんな形が いくつ できますか。`,
    figure: f,
    answer: { kind: 'choice', choices: items.map((x) => x.t), correct },
    hints: [
      '切ったあとの 形を、1つずつ 指で なぞって みよう。角は 直角に なっているかな。',
      c.cuts.length === 2
        ? '2本の 対角線が どう 交わるか（垂直か・二等分されるか）が 手がかりだよ。'
        : '向かい合う辺の 長さが 等しいかどうかが 手がかりだよ。',
      `「${c.answer.replace(/\*\*/g, '')}」だよ。`,
    ],
    explain: c.why,
    label: `${c.name}を対角線で切る`,
    diagnose: (given) => (given === correct ? null : '対角線の せいしつ（垂直に交わるか・二等分されるか）に もどって 考えよう。'),
    signature: `diag-cut:${c.kind}:${s.sig}:${items.map((x) => x.t).join('|')}`,
  };
}

export function generateDiagonal(level: DiagonalLevel): GeoProblem {
  switch (level) {
    case 'diag-mean':
      return genMean();
    case 'diag-facts':
      return genFacts();
    case 'diag-reverse':
      return genReverse();
    case 'diag-compare':
      return genCompare();
    case 'diag-cut':
      return genCut();
  }
}
