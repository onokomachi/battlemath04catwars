// このファイルは単元アプリ syo4-mennsekinokurabekatatoarawasikata の src/lib/problems.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 小4 算数「面積のくらべ方と表し方」の問題ジェネレーター（純粋関数）。
 *
 * 単元の柱（東京書籍 新しい算数4下「12. 面積のくらべ方と表し方」）
 *   ① 面積の表し方   … 1cm²の いくつ分（方眼を数える・ななめ半分・くらべる・形をつくる） → grid-*
 *   ② 面積の公式     … 長方形＝たて×横、正方形＝1辺×1辺、cm と cm² のちがい          → formula-*
 *   ③ 大きな面積の単位 … m²・km²・a・ha、単位の関係、量感と単位えらび                 → unit-*
 *   ④ 面積を求める   … km²・単位をそろえる・a・ha で求める                            → calc-*
 *   ⑤ 辺の長さ       … 面積と横から たて（□×横＝面積）                               → side-*
 *   ⑥ 複合図形       … 分ける・ひく・考え方と式・道をはしに寄せる                     → comp-*
 *   ⑦ 面積の変わり方 … まわりの長さが同じ長方形（表・折れ線グラフ・いちばん広い形）   → change-*
 *   ⑧ まちがいさがし … 面積の誤概念6つ                                               → eh-*
 *
 * 記録の名前（skillId）はレベルIDと同じ文字列にする（カタログの skill_id と一致させるため）。
 * 図は shapes.ts の部品で作り、figArea に「図から出し直せる面積」を入れる（検査が照合する）。
 */
import {
  Question, NumStep, ChoiceStep, BuildStep, FillStep, FillToken, CellsStep, PlotStep, Figure, Poly, GridShape, GridCell, PadSpec,
  rnd, pick, shuffle, fmt, same, buildOk,
} from './question';
import {
  Pt, rectPts, edgeDims, makeL, makeC, polyomino, addHalves, gridPerimeter, connected, rectOf, polyLabel,
} from './shapes';

/* ================================================================== */
/* 共通の部品                                                            */
/* ================================================================== */

const MUL: PadSpec = { kind: 'calc', ops: ['×', '÷', '+', '-'] };
const KANA = ['あ', 'い', 'う', 'え'];

function mix(correct: string, wrongs: { text: string; note: string }[]): { choices: string[]; correct: number; wrong: (string | null)[] } {
  const all = shuffle([{ text: correct, note: null as string | null }, ...wrongs]);
  return { choices: all.map((x) => x.text), correct: all.findIndex((x) => x.note === null), wrong: all.map((x) => x.note) };
}

const choiceStep = (o: { label: string; prompt: string; correct: string; wrongs: { text: string; note: string }[]; why: string; hints: string[] }): ChoiceStep => ({
  kind: 'choice', label: o.label, prompt: o.prompt, ...mix(o.correct, o.wrongs), why: o.why, hints: o.hints,
});

const numStep = (o: Omit<NumStep, 'kind'>): NumStep => ({ kind: 'num', ...o });

/* ---- カードを置いて組み立てる（ことば・単位） ---- */

/** 同じ意味の別の書き方（accept）を全部ならべた BuildStep を作る。cards はシャッフルして ダミーを混ぜる */
function buildStep(o: Omit<BuildStep, 'kind' | 'cards'> & { cards: string[] }): BuildStep {
  return { kind: 'build', ...o, cards: shuffle(o.cards) };
}

const LENGTH_UNITS = ['cm', 'm', 'km'];
const ALL_UNITS = ['cm²', 'm²', 'km²', 'a', 'ha', 'cm', 'm', 'km'];

/** 面積の単位のカードを置いたときの ひとこと（correct＝正しい単位）。正しいときは null */
function diagnoseUnit(correct: string) {
  return (u: string): string | null => {
    if (u === correct) return null;
    if (LENGTH_UNITS.includes(u)) return `長さの 単位（${u}）だよ。面積は 2つの 長さを かけるから ${u}² のように 2 が付くよ。`;
    if ((u === 'a' || u === 'ha') && (correct === 'a' || correct === 'ha')) return '1a は 1辺 10mの 正方形、1ha は 1辺 100mの 正方形。a と ha の 取りちがいに 気をつけよう。';
    return `${u} だと 広さが ちがうよ。${UNIT_NOTE[u] ?? ''}`;
  };
}

/** 公式（ことば）のカード。正方形は「1辺」を2まい */
function formulaWordStep(kind: 'rect' | 'square'): BuildStep {
  const rect = kind === 'rect';
  const name = rect ? '長方形' : '正方形';
  const correct = rect ? 'たて × 横' : '1辺 × 1辺';
  const sc = rect
    ? choiceStep({
      label: '公式', prompt: '長方形の 面積 ＝ ？', correct,
      wrongs: [
        { text: '（たて ＋ 横）× 2', note: 'それは 長方形の まわりの 長さの 式だよ。' },
        { text: 'たて ＋ 横', note: '面積は たし算では 出ないよ。1cm²が たてに □こ、横に □こ ならぶ…。' },
        { text: 'たて × たて', note: 'たて と 横、2つの 長さを 使うよ。' },
      ],
      why: '1cm²の 正方形が たてに たての数、横に 横の数 ならぶから、たて × 横（横 × たて でも よい）。',
      hints: ['1cm²の 正方形が 何こ ならぶかを 考えよう。', '1れつに 横の数だけ ならび、それが たての数だけ ある。', 'かけ算で 求められる。'],
    })
    : choiceStep({
      label: '公式', prompt: '正方形の 面積 ＝ ？', correct,
      wrongs: [
        { text: '1辺 × 4', note: 'それは 正方形の まわりの 長さの 式だよ。' },
        { text: '1辺 ＋ 1辺', note: '面積は たし算では 出ないよ。' },
        { text: '1辺 × 2', note: 'たても 横も 1辺と 同じ 長さ。たて×横 に あてはめよう。' },
      ],
      why: '正方形は たて も 横も 1辺の 長さ。だから 1辺 × 1辺。',
      hints: ['正方形は 4つの 辺の 長さが 同じ。', '長方形の 公式「たて × 横」に あてはめよう。', 'たても 横も「1辺」。'],
    });
  return buildStep({
    label: '公式', prompt: `${name}の 面積を 求める 公式を、カードを おいて つくろう。`,
    layout: [`${name}の 面積 ＝`, { slot: 0 }, '×', { slot: 1 }],
    cards: rect ? ['たて', '横', '1辺', '高さ', 'まわり', '底辺'] : ['1辺', '1辺', 'たて', '横', 'まわり', '高さ'],
    accept: rect ? [['たて', '横'], ['横', 'たて']] : [['1辺', '1辺']],
    diagnose: (v) => {
      if (buildOk({ accept: rect ? [['たて', '横'], ['横', 'たて']] : [['1辺', '1辺']] }, v)) return null;
      const set = new Set(v);
      if (rect) {
        if (set.has('まわり')) return 'まわりの 長さは「（たて＋横）×2」。面積の 公式には 使わないよ。';
        if (set.has('高さ') || set.has('底辺')) return '高さ・底辺は、三角形や 平行四辺形の 面積で 使う ことば。長方形は「たて」と「横」。';
        if (set.has('1辺')) return '「1辺」は 正方形の ことば。長方形は 長さが ちがう 2つ（たて と 横）を かけるよ。';
        if (v[0] === v[1]) return 'たて と 横、ちがう 2つの 長さを かけるよ。';
      } else {
        if (set.has('まわり')) return 'まわりの 長さの 式（1辺×4）に なって いるよ。面積は「1辺 × 1辺」。';
        if (set.has('高さ')) return '高さは 三角形や 平行四辺形の ことば。正方形は「1辺」を 2つ かけるよ。';
        if (set.has('たて') || set.has('横')) return '正方形は たて も 横も 同じ 長さ。だから「1辺」で 表すよ。';
      }
      return 'もう一度 ことばを 見なおそう。';
    },
    hints: rect
      ? ['長方形の 面積は、1cm²の 正方形が たてと 横に ならんだ 数。', '長方形には 長さが ちがう 2つの 辺が ある。', '「たて」と「横」を かけるよ（じゅんじょは どちらでも よい）。']
      : ['正方形は 4つの 辺の 長さが 同じ。', '長方形の 公式の「たて」も「横」も、同じ 長さ。', '同じ ことばを 2まい つかうよ。'],
    scaffold: sc,
  });
}

/** 「□ × □」の式。かけ算は じゅんじょを 入れかえても 正解 */
function mulExpr(a: number, b: number, o: { hints: string[]; prompt?: string; diagnose?: (v: number[]) => string | null; pad?: PadSpec }): FillStep {
  return {
    kind: 'fill', label: '式', prompt: o.prompt ?? '式を 書こう（□に 数を 入れる）。',
    layout: { type: 'expr', parts: [{ slot: 0 }, '×', { slot: 1 }] },
    accept: a === b ? [[a, b]] : [[a, b], [b, a]],
    hints: o.hints, diagnose: o.diagnose, pad: o.pad,
  };
}

/** 長方形の式の よくある まちがい */
const diagnoseRectExpr = (a: number, b: number) => (v: number[]): string | null => {
  const [x, y] = v;
  if ((x === a && y === b) || (x === b && y === a)) return null;
  if (x === y && (x === a || x === b) && a !== b) return 'たて と 横、ちがう 2つの 長さを かけるよ。';
  if (x === a || x === b || y === a || y === b) return 'かける 数の 1つは 合っているよ。もう1つの 長さを 図で たしかめよう。';
  return '面積 ＝ たて × 横。図に 書いてある 長さを 使おう。';
};

/** 長方形の面積の答えの よくある まちがい */
const diagnoseRectAns = (a: number, b: number, unitLen: string) => (v: number): string | null => {
  if (same(v, a * b)) return null;
  if (same(v, (a + b) * 2)) return `それは まわりの 長さ（${unitLen}）だよ。面積は たて × 横。`;
  if (same(v, a + b)) return 'たし算に なっているよ。面積は かけ算。';
  return null;
};

/** 長方形の図（たて a、横 b） */
function rectFig(a: number, b: number, unit: string, o: { center?: string; topText?: string; leftText?: string } = {}): Figure {
  const pts = rectPts(0, 0, b, a);
  return {
    type: 'shape',
    polys: [{ pts, role: 'main' }],
    dims: edgeDims(pts, unit, [1, 2], (i, len) => (i === 0 ? o.topText ?? `${fmt(len)}${unit}` : o.leftText ?? `${fmt(len)}${unit}`)),
    center: o.center,
  };
}

const fin = (q: Question): Question => q;

/* ================================================================== */
/* ① 方眼で面積（grid-*）                                                */
/* ================================================================== */

const GRID_COLS = 9, GRID_ROWS = 5;
const SHAPE_COLORS = ['#fdba74', '#93c5fd', '#86efac', '#f9a8d4'];

/** 形の 中心に近い「全部のマス」（記号を書く場所） */
function gridShape(cells: GridCell[], name: string, color: string): GridShape {
  return { cells, name, color };
}

export function genGridCount(): Question {
  const n = rnd(5, 12);
  const cells = polyomino(n, 0, 0, GRID_COLS, GRID_ROWS);
  const per = gridPerimeter(cells);
  return fin({
    skillId: 'grid-count', title: '方眼の 面積', emoji: '🟧',
    text: '1マスは 1辺が 1cmの 正方形です。\nあ の 面積は 何cm²ですか。',
    figure: { type: 'grid', cols: GRID_COLS, rows: GRID_ROWS, shapes: [gridShape(cells, 'あ', SHAPE_COLORS[0]!)], showUnit: true },
    steps: [numStep({
      label: '面積', prompt: 'あ の 面積は？（マスを タップすると しるしが つくよ）', answer: n, unit: 'cm²',
      hints: ['1辺が 1cmの 正方形の 面積が 1cm²。', 'マスに しるしを つけながら、1つずつ 数えよう。', 'たての れつごとに 数えて、あとで たそう。'],
      diagnose: (v) => (same(v, n) ? null : same(v, per) ? 'それは まわりの 長さ（cm）だよ。面積は 中の マスの 数。' : null),
    })],
    summary: `1cm²の 正方形が ${n}こ分 だから、${n}cm²。`,
    label: `方眼の 面積（${n}cm²）`, q: '方眼の形 あ の面積', a: `${n}cm²`, figArea: n,
  });
}

export function genGridHalf(): Question {
  for (;;) {
    const n = rnd(4, 9);
    const halves = pick([2, 2, 4]);
    const base = polyomino(n, 1, 1, GRID_COLS - 2, GRID_ROWS - 1);
    const cells = addHalves(base, halves, 0, 0, GRID_COLS, GRID_ROWS);
    if (!cells) continue;
    const area = n + halves / 2;
    return fin({
      skillId: 'grid-half', title: 'ななめ半分の マス', emoji: '🔺',
      text: '1マスは 1辺が 1cmの 正方形です。\nい の 面積は 何cm²ですか。',
      figure: { type: 'grid', cols: GRID_COLS, rows: GRID_ROWS, shapes: [gridShape(cells, 'い', SHAPE_COLORS[1]!)], showUnit: true },
      steps: [numStep({
        label: '面積', prompt: 'い の 面積は？', answer: area, unit: 'cm²',
        hints: ['ななめの 線で 半分に なった 三角は、1cm²の 半分。', '半分の 三角が 2つ で 1cm²。', `全部の マスは ${n}こ、半分の 三角は ${halves}こ。`],
        diagnose: (v) => same(v, area) ? null
          : same(v, n + halves) ? 'ななめ半分の 三角を 1cm² と 数えて いないかな？ 三角 2つで 1cm² だよ。'
            : same(v, n) ? 'ななめ半分の 三角も わすれずに。2つで 1cm² だよ。' : null,
      })],
      summary: `全部の マスが ${n}こ、半分の 三角が ${halves}こ（${halves / 2}cm²）。${n} ＋ ${halves / 2} ＝ ${area}cm²。`,
      label: `ななめ半分の マス（${area}cm²）`, q: '方眼の形 い（ななめ半分の三角をふくむ）の面積', a: `${area}cm²`, figArea: area,
    });
  }
}

export function genGridCompare(): Question {
  for (;;) {
    const na = rnd(5, 11), nb = rnd(5, 11);
    if (na === nb || Math.abs(na - nb) > 4) continue;
    const a = polyomino(na, 0, 0, 5, GRID_ROWS);
    const b = polyomino(nb, 6, 0, 5, GRID_ROWS);
    const big = na > nb ? 'あ' : 'い';
    const d = Math.abs(na - nb);
    return fin({
      skillId: 'grid-compare', title: 'どちらが 広い？', emoji: '⚖️',
      text: '1マスは 1辺が 1cmの 正方形です。\nあ と い では、どちらが 何cm² 広いですか。',
      figure: { type: 'grid', cols: 11, rows: GRID_ROWS, shapes: [gridShape(a, 'あ', SHAPE_COLORS[0]!), gridShape(b, 'い', SHAPE_COLORS[2]!)], showUnit: true },
      steps: [
        choiceStep({
          label: '広いのは', prompt: '広いのは どちら？', correct: big,
          wrongs: [
            { text: big === 'あ' ? 'い' : 'あ', note: 'マスの 数を 数えて くらべよう。見た目の 長さでは 決まらないよ。' },
            { text: '同じ', note: 'マスの 数を 数えると ちがうよ。' },
          ],
          why: `あ は ${na}cm²、い は ${nb}cm²。1cm²の いくつ分かで くらべられる。`,
          hints: ['それぞれ 1cm²の 正方形が いくつ分か 数えよう。', 'マスを タップすると しるしが つくよ。', `あ は ${na}こ。い も 数えよう。`],
        }),
        numStep({
          label: 'ちがい', prompt: `${big} の ほうが 何cm² 広い？`, answer: d, unit: 'cm²',
          hints: ['広さの ちがいは ひき算。', `大きい ほう － 小さい ほう。`, `${Math.max(na, nb)} － ${Math.min(na, nb)}`],
          diagnose: (v) => (same(v, d) ? null : same(v, Math.max(na, nb)) ? 'それは 広い ほうの 面積。ちがいを 答えよう。' : null),
        }),
      ],
      summary: `あ ${na}cm²、い ${nb}cm²。${big} の ほうが ${d}cm² 広い。`,
      label: `どちらが 広い？（${na}と${nb}）`, q: `方眼の形 あ（${na}マス）と い（${nb}マス）のちがい`, a: `${big}が${d}cm²広い`,
    });
  }
}

const MAKE_COLS = 8, MAKE_ROWS = 5;

export function genGridMake(): Question {
  const kind = pick(['free', 'free', 'rect', 'wh', 'sq'] as const);
  let prompt = '', check: CellsStep['check'], example: { x: number; y: number }[] = [], title = '', ans = '';
  const fill = (w: number, h: number) => { const r: { x: number; y: number }[] = []; for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) r.push({ x, y }); return r; };
  if (kind === 'free') {
    const n = rnd(4, 10);
    prompt = `面積が ${n}cm² の 形を つくろう。（マスどうしは へんで つなげる）`;
    title = `${n}cm²の 形`; ans = `${n}マスのつながった形`;
    example = fill(n, 1).length <= MAKE_COLS ? fill(n, 1) : [...fill(5, 1), ...fill(n - 5, 2).filter((c) => c.y === 1)];
    check = (c) => c.length !== n ? `いま ${c.length}cm²。${n}cm² に しよう。`
      : !connected(c) ? 'はなれた マスが あるよ。へんで つながる ように しよう。' : null;
  } else if (kind === 'rect') {
    const n = pick([6, 8, 10, 12]);
    prompt = `面積が ${n}cm² の 長方形を つくろう。`;
    title = `${n}cm²の 長方形`; ans = `${n}cm²の長方形`;
    example = n === 12 ? fill(4, 3) : fill(n / 2, 2);
    check = (c) => { const r = rectOf(c); return c.length !== n ? `いま ${c.length}cm²。${n}cm² に しよう。` : !r ? '長方形に なって いないよ。四つの かどが 直角の 形に しよう。' : null; };
  } else if (kind === 'wh') {
    const h = rnd(2, 4), w = rnd(2, 7);
    if (w === h) return genGridMake();
    prompt = `たて ${h}cm、横 ${w}cm の 長方形を つくろう。`;
    title = `たて${h}cm 横${w}cm`; ans = `たて${h}マス×横${w}マスの長方形`;
    example = fill(w, h);
    check = (c) => { const r = rectOf(c); return !r ? '長方形に なって いないよ。' : r[0] === h && r[1] === w ? 'たて と 横が 反対だよ。横は ←→ の 向き。' : r[0] !== w || r[1] !== h ? `いまは たて ${r[1]}cm、横 ${r[0]}cm。` : null; };
  } else {
    const s = rnd(2, 4);
    prompt = `1辺が ${s}cm の 正方形を つくろう。`;
    title = `1辺${s}cmの 正方形`; ans = `${s}マス×${s}マスの正方形`;
    example = fill(s, s);
    check = (c) => { const r = rectOf(c); return !r ? '正方形に なって いないよ。' : r[0] !== s || r[1] !== s ? `いまは たて ${r[1]}cm、横 ${r[0]}cm。1辺 ${s}cm に そろえよう。` : null; };
  }
  return fin({
    skillId: 'grid-make', title: '形を つくろう', emoji: '✏️',
    text: '1マスは 1辺が 1cmの 正方形です。マスを タップして 形を かきましょう。',
    steps: [{
      kind: 'cells', label: '作図', prompt, cols: MAKE_COLS, rows: MAKE_ROWS, check, example,
      hints: ['1マスが 1cm²。ぬった マスの 数が 面積。', 'もう一度 タップすると けせるよ。', kind === 'free' ? 'いろいろな 形が かけるよ。同じ 面積でも 形は ちがって いい。' : '長方形は、たての マスの 数 × 横の マスの 数。'],
    }],
    summary: '1cm²の いくつ分で 面積が きまる。同じ 面積でも いろいろな 形が ある。',
    label: title, q: prompt, a: ans,
  });
}

/* ================================================================== */
/* ② 面積の公式（formula-*）                                             */
/* ================================================================== */

export function genFormulaWord(kind: 'rect' | 'square' = pick(['rect', 'square'] as const)): Question {
  const rect = kind === 'rect';
  const name = rect ? '長方形' : '正方形';
  const fig: Figure = rect
    ? { type: 'shape', polys: [{ pts: rectPts(0, 0, 6, 4), role: 'main' }], dims: edgeDims(rectPts(0, 0, 6, 4), '', [1, 2], (i) => (i === 0 ? '横' : 'たて')) }
    : { type: 'shape', polys: [{ pts: rectPts(0, 0, 4, 4), role: 'main' }], dims: edgeDims(rectPts(0, 0, 4, 4), '', [1, 2, 3], () => '1辺') };
  return fin({
    skillId: 'formula-word', title: `${name}の 面積の 公式`, emoji: '📐',
    text: `${name}の 面積を 求める 公式を、カードを おいて 書きましょう。`,
    figure: fig, steps: [formulaWordStep(kind)],
    summary: rect ? '長方形の 面積 ＝ たて × 横（横 × たて）' : '正方形の 面積 ＝ 1辺 × 1辺',
    label: `${name}の 公式`, q: `${name}の面積を求める公式`, a: rect ? 'たて×横' : '1辺×1辺',
  });
}

function rectQuestion(skillId: string, title: string, a: number, b: number, unit: string, o: { square?: boolean; text?: string; emoji?: string; formula?: boolean } = {}): Question {
  const area = a * b;
  const name = o.square ? '正方形' : '長方形';
  return fin({
    skillId, title, emoji: o.emoji ?? '📏',
    text: o.text ?? (o.square ? `1辺が ${a}${unit}の 正方形の 面積を 求めましょう。` : `たてが ${a}${unit}、横が ${b}${unit}の 長方形の 面積を 求めましょう。`),
    figure: rectFig(a, b, unit),
    steps: [
      ...(o.formula ? [formulaWordStep(o.square ? 'square' : 'rect')] : []),
      mulExpr(a, b, {
        hints: [o.square ? '正方形の 面積 ＝ 1辺 × 1辺' : '長方形の 面積 ＝ たて × 横', '図の 長さを 公式に あてはめよう。', o.square ? `1辺は ${a}${unit}。` : `たては ${a}${unit}、横は ${b}${unit}。`],
        diagnose: diagnoseRectExpr(a, b),
      }),
      numStep({
        label: '答え', prompt: `${name}の 面積は？`, answer: area, unit: `${unit}²`, pad: area >= 100 ? MUL : undefined,
        hints: ['式の かけ算を しよう。', area >= 100 ? '筆算で けいさんしても いいよ。' : '九九や 2けたの かけ算で。', `${a} × ${b}`],
        diagnose: diagnoseRectAns(a, b, unit),
      }),
    ],
    summary: `${a} × ${b} ＝ ${area}。答えは ${area}${unit}²。`,
    label: `${title}（${a}×${b}）`, q: o.square ? `1辺${a}${unit}の正方形の面積` : `たて${a}${unit}・横${b}${unit}の長方形の面積`, a: `${a}×${b}＝${area}　${area}${unit}²`, figArea: area,
  });
}

export function genFormulaRect(): Question {
  for (;;) {
    const a = rnd(2, 15), b = rnd(2, 15);
    if (a === b || Math.max(a, b) > 4 * Math.min(a, b)) continue;
    const unit = pick(['cm', 'cm', 'm']);
    return rectQuestion('formula-rect', '長方形の 面積', a, b, unit, { formula: true });
  }
}

/** withFormula: 練習では はじめに 公式を カードで 組み立てる。本番テストの大問6①は 式と答えだけ（紙と同じ） */
export function genFormulaSquare(withFormula = true): Question {
  const a = rnd(3, 15);
  const unit = pick(['cm', 'cm', 'm']);
  return rectQuestion('formula-square', '正方形の 面積', a, a, unit, { square: true, emoji: '🟦', formula: withFormula });
}

export function genFormulaUnit(): Question {
  for (;;) {
    const a = rnd(2, 9), b = rnd(3, 12);
    if (a === b || a * b === 2 * (a + b)) continue;
    const unit = pick(['cm', 'm']);
    const area = a * b, per = 2 * (a + b);
    const other = unit === 'cm' ? 'm' : 'cm';
    const unitCards = [`${unit}²`, unit, `${other}²`, other];
    const sq = `${unit}²`;
    const ask = (what: '面積' | 'まわりの 長さ', ok: [number, string], numNote: (n: number) => string | null, unitNote: (u: string) => string | null, scaffold: ChoiceStep): BuildStep => buildStep({
      label: what, prompt: `この 長方形の ${what}を、数と 単位の カードを おいて 書こう。`,
      layout: [`${what} ＝`, { slot: 0 }, { slot: 1 }],
      cards: [String(area), String(per), String(a + b), ...unitCards],
      accept: [[String(ok[0]), ok[1]]],
      diagnose: (v) => numNote(Number(v[0])) ?? unitNote(v[1]!) ?? (v[0] === String(ok[0]) && v[1] === ok[1] ? null : 'もう一度 数と 単位を 見なおそう。'),
      hints: what === '面積'
        ? ['面積は たて × 横。', `長さの 単位は ${unit}、広さの 単位は ${unit}²。`, `${a} × ${b} を 計算しよう。`]
        : ['まわりの 長さは 4本の 辺の 長さの 合計。', `たて ${a}${unit} が 2本、横 ${b}${unit} が 2本。`, `（${a} ＋ ${b}）× 2`],
      scaffold,
    });
    return fin({
      skillId: 'formula-unit', title: '面積と まわりの 長さ', emoji: '🔍',
      text: `たてが ${a}${unit}、横が ${b}${unit}の 長方形が あります。`,
      figure: rectFig(a, b, unit),
      steps: [
        ask('面積', [area, sq],
          (n) => (n === per ? 'それは まわりの 長さの 数。面積は たて × 横。' : n === a + b ? 'たし算に なっているよ。面積は かけ算。' : null),
          (u) => (LENGTH_UNITS.includes(u) ? `長さの 単位（${u}）だよ。面積は 2つの 長さを かけるから ${u}² のように 2 が付くよ。` : u === sq ? null : `${u} ではなく、図の 長さの 単位は ${unit} だよ。${unit}² を つかおう。`),
          choiceStep({
            label: '面積', prompt: 'この 長方形の 面積は どれ？', correct: `${area}${unit}²`,
            wrongs: [
              { text: `${per}${unit}`, note: 'それは まわりの 長さ。面積は たて × 横 で、単位は ' + unit + '²。' },
              { text: `${area}${unit}`, note: '数は 合っているよ。面積の 単位は ' + unit + '²。' },
              { text: `${per}${unit}²`, note: 'まわりの 長さの 数に なっているよ。たて × 横 を 計算しよう。' },
            ],
            why: `面積は ${a} × ${b} ＝ ${area}。広さの 単位は ${unit}²。`,
            hints: ['面積は たて × 横。', `長さの 単位は ${unit}、広さの 単位は ${unit}²。`, `${a} × ${b} を 計算しよう。`],
          })),
        ask('まわりの 長さ', [per, unit],
          (n) => (n === area ? 'それは 面積の 数。まわりの 長さは 4つの 辺を たす。' : n === a + b ? 'たて と 横を 1本ずつ しか たして いないよ。辺は 4本。' : null),
          (u) => (u === unit ? null : u === sq ? `長さの 単位は ${unit}。${sq} は 広さの 単位だよ。` : `図の 長さの 単位は ${unit} だよ。`),
          choiceStep({
            label: 'まわりの長さ', prompt: 'まわりの 長さは どれ？', correct: `${per}${unit}`,
            wrongs: [
              { text: `${area}${unit}`, note: 'それは 面積の 数。まわりの 長さは 4つの 辺を たす。' },
              { text: `${a + b}${unit}`, note: 'たてと 横を 1本ずつ しか たして いないよ。辺は 4本。' },
              { text: `${per}${unit}²`, note: '長さの 単位は ' + unit + '。' + unit + '² は 広さの 単位。' },
            ],
            why: `まわりの 長さは（${a} ＋ ${b}）× 2 ＝ ${per}${unit}。長さの 単位は ${unit}。`,
            hints: ['まわりの 長さは 4本の 辺の 長さの 合計。', `たて ${a}${unit} が 2本、横 ${b}${unit} が 2本。`, `（${a} ＋ ${b}）× 2`],
          })),
      ],
      summary: `面積 ${area}${unit}²（たて×横）、まわりの 長さ ${per}${unit}（4本の 辺の 合計）。単位も ちがう。`,
      label: `面積と まわり（${a}×${b}）`, q: `たて${a}${unit}・横${b}${unit}の長方形の面積とまわりの長さ`, a: `${area}${unit}²、${per}${unit}`, figArea: area,
    });
  }
}

/* ================================================================== */
/* ③ 大きな面積の単位（unit-*）                                          */
/* ================================================================== */

const UNIT_TABLE: Figure = {
  type: 'table',
  headers: ['1辺の 長さ', '1cm', '1m', '10m', '100m', '1km'],
  rows: [['正方形の 面積', '1cm²', '1m²', '1a', '1ha', '1km²']],
};

export function genUnitM2(kind: 'm2' | 'km2' | 'any' = 'any', kMax = 9): Question {
  const v = kind === 'any' ? pick(['m2', 'km2', 'm2r', 'km2r'] as const) : kind;
  const k = rnd(1, kMax);
  let prompt = '', answer = 0, unit = '', hints: string[] = [], diagnose: (x: number) => string | null, q = '';
  if (v === 'm2') {
    prompt = `${k}m² ＝ □cm²`; answer = k * 10000; unit = 'cm²'; q = `${k}m²＝□cm²`;
    hints = ['1m ＝ 100cm。', '1m²は 1辺が 100cmの 正方形の 面積。', '100 × 100 を 計算しよう。'];
    diagnose = (x) => same(x, answer) ? null : same(x, k * 100) ? '1m²は 1辺 100cmの 正方形。100 × 100 だよ（100倍では ない）。' : same(x, k * 1000) ? '0の 数を たしかめよう。100 × 100 ＝ 10000。' : null;
  } else if (v === 'km2') {
    prompt = `${k}km² ＝ □m²`; answer = k * 1000000; unit = 'm²'; q = `${k}km²＝□m²`;
    hints = ['1km ＝ 1000m。', '1km²は 1辺が 1000mの 正方形の 面積。', '1000 × 1000 を 計算しよう。'];
    diagnose = (x) => same(x, answer) ? null : same(x, k * 1000) ? '1km²は 1辺 1000mの 正方形。1000 × 1000 だよ。' : same(x, k * 10000) || same(x, k * 100000) ? '0の 数を たしかめよう。1000 × 1000 ＝ 1000000。' : null;
  } else if (v === 'm2r') {
    prompt = `${k * 10000}cm² ＝ □m²`; answer = k; unit = 'm²'; q = `${k * 10000}cm²＝□m²`;
    hints = ['1m² ＝ 10000cm²。', `${k * 10000}cm² は 10000cm² の いくつ分？`, `${k * 10000} ÷ 10000`];
    diagnose = (x) => same(x, answer) ? null : same(x, k * 100) ? '10000cm² で 1m²。100 で わるのでは ないよ。' : null;
  } else {
    prompt = `${k * 1000000}m² ＝ □km²`; answer = k; unit = 'km²'; q = `${k * 1000000}m²＝□km²`;
    hints = ['1km² ＝ 1000000m²。', `${k * 1000000}m² は 1000000m² の いくつ分？`, '0を 6こ とると…'];
    diagnose = (x) => same(x, answer) ? null : same(x, k * 1000) ? '1km² ＝ 1000000m²。1000 で わるのでは ないよ。' : null;
  }
  return fin({
    skillId: 'unit-m2', title: v.startsWith('m2') ? 'm²と cm²' : 'km²と m²', emoji: '🗺️',
    text: '□に あてはまる 数を 書きましょう。',
    steps: [numStep({ label: '単位', prompt, answer, unit, hints, diagnose })],
    summary: v.startsWith('m2') ? '1m² ＝ 100cm × 100cm ＝ 10000cm²' : '1km² ＝ 1000m × 1000m ＝ 1000000m²',
    label: q, q, a: `${answer}`,
  });
}

const SQUARE_UNITS: { side: string; unit: string }[] = [
  { side: '1cm', unit: 'cm²' }, { side: '1m', unit: 'm²' }, { side: '10m', unit: 'a' }, { side: '100m', unit: 'ha' }, { side: '1km', unit: 'km²' },
];

/** 単位カードを おいて 書く問題（unit-aha と unit-choose で共通）。cards は 面積の単位 5つ ＋ 長さの単位 3つ */
function unitBuildStep(o: { label: string; prompt: string; lead: string; correct: string; scaffold: ChoiceStep; hints: string[] }): BuildStep {
  return buildStep({
    label: o.label, prompt: o.prompt, layout: [o.lead, { slot: 0 }], cards: ALL_UNITS, accept: [[o.correct]],
    diagnose: (v) => diagnoseUnit(o.correct)(v[0]!) ?? null, hints: o.hints, scaffold: o.scaffold,
  });
}

export function genUnitAha(kind: '10m' | '100m' | 'any' = 'any'): Question {
  const v = kind !== 'any' ? kind : pick(['10m', '100m', 'side', 'side', 'num', 'num', 'num'] as const);
  if (v !== 'num') {
    const target = v === '10m' ? SQUARE_UNITS[2]! : v === '100m' ? SQUARE_UNITS[3]! : pick(SQUARE_UNITS);
    const others = shuffle(SQUARE_UNITS.filter((u) => u !== target)).slice(0, 3);
    const note = (u: string) => {
      const s = SQUARE_UNITS.find((x) => x.unit === u)!;
      return `1${u} は 1辺が ${s.side} の 正方形の 面積だよ。`;
    };
    return fin({
      skillId: 'unit-aha', title: `1辺${target.side}の 正方形`, emoji: '🌾',
      text: '□に あてはまる 面積の 単位を、カードを おいて 書きましょう。',
      figure: { type: 'shape', polys: [{ pts: rectPts(0, 0, 4, 4), role: 'main' }], dims: edgeDims(rectPts(0, 0, 4, 4), '', [1, 2], () => target.side), center: '1□' },
      steps: [unitBuildStep({
        label: '単位', prompt: `1辺が ${target.side}の 正方形の 面積 ＝ 1□`, lead: `1辺が ${target.side}の 正方形の 面積 ＝ 1`, correct: target.unit,
        hints: ['1辺の 長さを かけた 広さの 単位を 考えよう。', '1辺 10m の 正方形 ＝ 1a（アール）、1辺 100m の 正方形 ＝ 1ha（ヘクタール）。', '1辺 1m なら 1m²、1辺 1km なら 1km²。'],
        scaffold: choiceStep({
          label: '単位', prompt: `1辺が ${target.side}の 正方形の 面積 ＝ 1□`, correct: target.unit,
          wrongs: others.map((u) => ({ text: u.unit, note: note(u.unit) })),
          why: `1辺が ${target.side}の 正方形の 面積を 1${target.unit} という。`,
          hints: ['1辺 10m の 正方形 ＝ 1a（アール）。', '1辺 100m の 正方形 ＝ 1ha（ヘクタール）。', '1辺 1m なら 1m²、1辺 1km なら 1km²。'],
        }),
      })],
      summary: '1辺 10m → 1a（＝100m²）、1辺 100m → 1ha（＝10000m²）',
      label: `1辺${target.side} → 1${target.unit}`, q: `1辺が${target.side}の正方形の面積＝1□`, a: target.unit,
    });
  }
  const items = [
    { p: '1a ＝ □m²', a: 100, u: 'm²', h: '1aは 1辺が 10mの 正方形の 面積。', h3: '10 × 10' },
    { p: '1ha ＝ □m²', a: 10000, u: 'm²', h: '1haは 1辺が 100mの 正方形の 面積。', h3: '100 × 100' },
    { p: '1ha ＝ □a', a: 100, u: 'a', h: 'ha の 正方形の 1辺は、a の 正方形の 1辺の 10倍。', h3: 'たてに 10こ、横に 10こ。' },
    { p: '1km² ＝ □ha', a: 100, u: 'ha', h: 'km² の 正方形の 1辺（1km）は、ha の 正方形の 1辺の 10倍。', h3: 'たてに 10こ、横に 10こ。' },
    { p: '1辺が 10mの 正方形の 面積 ＝ □m²', a: 100, u: 'm²', h: '正方形の 面積 ＝ 1辺 × 1辺。', h3: '10 × 10' },
    { p: '1辺が 100mの 正方形の 面積 ＝ □m²', a: 10000, u: 'm²', h: '正方形の 面積 ＝ 1辺 × 1辺。', h3: '100 × 100' },
  ];
  const it = pick(items);
  return fin({
    skillId: 'unit-aha', title: 'a と ha', emoji: '🌾',
    text: '□に あてはまる 数を 書きましょう。',
    figure: UNIT_TABLE,
    steps: [numStep({
      label: '単位', prompt: it.p, answer: it.a, unit: it.u,
      hints: [it.h, '表の となりどうしは、1辺が 10倍。', it.h3],
      diagnose: (x) => same(x, it.a) ? null : same(x, it.a / 10) ? '1辺が 10倍 だと、面積は 10 × 10 ＝ 100倍。' : null,
    })],
    summary: '1a ＝ 100m²、1ha ＝ 100a ＝ 10000m²、1km² ＝ 100ha',
    label: it.p, q: it.p, a: `${it.a}`,
  });
}

interface AreaItem { thing: string; value: number; unit: 'cm²' | 'm²' | 'a' | 'ha' | 'km²' }
const AREA_ITEMS: AreaItem[] = [
  { thing: '色紙の 面積', value: 144, unit: 'cm²' },
  { thing: 'はがきの 面積', value: 148, unit: 'cm²' },
  { thing: '切手の 面積', value: 6, unit: 'cm²' },
  { thing: 'トランプ 1まいの 面積', value: 55, unit: 'cm²' },
  { thing: 'ハンカチの 面積', value: 625, unit: 'cm²' },
  { thing: '算数の 教科書の 表紙の 面積', value: 450, unit: 'cm²' },
  { thing: '教室の 面積', value: 60, unit: 'm²' },
  { thing: '黒板の 面積', value: 4, unit: 'm²' },
  { thing: '体育館の ゆかの 面積', value: 800, unit: 'm²' },
  { thing: '子ども部屋の 面積', value: 10, unit: 'm²' },
  { thing: 'プールの 水面の 面積', value: 300, unit: 'm²' },
  { thing: '田んぼ 1まいの 面積', value: 10, unit: 'a' },
  { thing: '学校の 畑の 面積', value: 2, unit: 'a' },
  { thing: '牧場の 面積', value: 30, unit: 'ha' },
  { thing: '大きな 公園の 面積', value: 5, unit: 'ha' },
  { thing: '市の 面積', value: 80, unit: 'km²' },
  { thing: '大きな 湖の 面積', value: 670, unit: 'km²' },
];
const UNIT_NOTE: Record<string, string> = {
  'cm²': 'cm² は 1辺 1cm の 正方形。手のひらに のる くらいの ものに 使う。',
  'm²': 'm² は 1辺 1m の 正方形。部屋や 教室の 広さに 使う。',
  a: 'a は 1辺 10m の 正方形（100m²）。田や 畑の 広さに 使う。',
  ha: 'ha は 1辺 100m の 正方形（10000m²）。牧場や 大きな 公園の 広さに 使う。',
  'km²': 'km² は 1辺 1km の 正方形。町や 市の 広さに 使う。',
};

export function genUnitChoose(onlyCmM = false): Question {
  const pool = onlyCmM ? AREA_ITEMS.filter((x) => x.unit === 'cm²' || x.unit === 'm²') : AREA_ITEMS;
  const it = pick(pool);
  const others = onlyCmM ? [it.unit === 'cm²' ? 'm²' : 'cm²'] : shuffle((['cm²', 'm²', 'a', 'ha', 'km²'] as const).filter((u) => u !== it.unit)).slice(0, 3);
  return fin({
    skillId: 'unit-choose', title: '単位えらび', emoji: '🏫',
    text: `□に あてはまる 面積の 単位を、カードを おいて 書きましょう。`,
    steps: [unitBuildStep({
      label: '単位', prompt: `${it.thing} …… ${it.value}□`, lead: `${it.thing} ……  ${it.value}`, correct: it.unit,
      hints: ['1辺 1cm、1m、10m、100m、1km の 正方形を 思いうかべよう。', `${it.value}こ ならべた ときの 広さを 考えよう。`, UNIT_NOTE[it.unit]!.split('。')[0] + '。'],
      scaffold: choiceStep({
        label: '単位', prompt: `${it.thing} …… ${it.value}□`, correct: it.unit,
        wrongs: others.map((u) => ({ text: u, note: `${it.value}${u} だと 広さが ぜんぜん ちがうよ。${UNIT_NOTE[u]}` })),
        why: `${UNIT_NOTE[it.unit]} だから ${it.thing}は ${it.value}${it.unit}。`,
        hints: ['1辺 1cm、1m、10m、100m、1km の 正方形を 思いうかべよう。', `${it.value}こ ならべた ときの 広さを 考えよう。`, UNIT_NOTE[it.unit]!.split('。')[0] + '。'],
      }),
    })],
    summary: `${it.thing}は 約 ${it.value}${it.unit}。`,
    label: `${it.thing} ${it.value}${it.unit}`, q: `${it.thing}…${it.value}□（面積の単位）`, a: it.unit,
  });
}

export function genUnitConvert(): Question {
  const v = pick(['m2a', 'm2ha', 'am2', 'haa', 'ham2'] as const);
  let prompt = '', answer = 0, unit = '', hint = '', wrong10 = 0;
  if (v === 'm2a') { const k = rnd(2, 90); prompt = `${k * 100}m² ＝ □a`; answer = k; unit = 'a'; hint = '1a ＝ 100m²。100m² の いくつ分？'; wrong10 = k * 10; }
  else if (v === 'm2ha') { const k = rnd(1, 30); prompt = `${k * 10000}m² ＝ □ha`; answer = k; unit = 'ha'; hint = '1ha ＝ 10000m²。10000m² の いくつ分？'; wrong10 = k * 100; }
  else if (v === 'am2') { const k = rnd(2, 90); prompt = `${k}a ＝ □m²`; answer = k * 100; unit = 'm²'; hint = '1a ＝ 100m²。'; wrong10 = k * 10; }
  else if (v === 'haa') { const k = rnd(2, 90); prompt = `${k}ha ＝ □a`; answer = k * 100; unit = 'a'; hint = '1ha ＝ 100a。'; wrong10 = k * 10; }
  else { const k = rnd(2, 60); prompt = `${k}ha ＝ □m²`; answer = k * 10000; unit = 'm²'; hint = '1ha ＝ 10000m²。'; wrong10 = k * 1000; }
  return fin({
    skillId: 'unit-convert', title: '単位を なおそう', emoji: '🔁',
    text: '□に あてはまる 数を 書きましょう。',
    figure: UNIT_TABLE,
    steps: [numStep({
      label: '単位', prompt, answer, unit,
      hints: [hint, '大きい 単位 → 小さい 単位 なら かけ算、小さい → 大きい なら わり算。', '1a＝100m²、1ha＝100a＝10000m²'],
      diagnose: (x) => same(x, answer) ? null : same(x, wrong10) ? '0の 数を たしかめよう。面積の 単位は 100倍ずつ ちがうよ。' : null,
    })],
    summary: '1a ＝ 100m²、1ha ＝ 100a ＝ 10000m²',
    label: prompt, q: prompt, a: `${answer}`,
  });
}

export function genUnitRelation(): Question {
  const v = pick(['times', 'times', 'k', 'ten'] as const);
  if (v === 'ten') {
    return fin({
      skillId: 'unit-relation', title: '1辺が 10倍だと', emoji: '🔟',
      text: '正方形の 1辺の 長さを 10倍に すると、面積は 何倍に なりますか。',
      figure: UNIT_TABLE,
      steps: [numStep({
        label: '何倍', prompt: '面積は 何倍？', answer: 100, unit: '倍',
        hints: ['表の 1m と 10m、1m² と 1a を くらべよう。', 'たて も 横も 10倍に なる。', '1a ＝ 100m²'],
        diagnose: (x) => same(x, 100) ? null
          : same(x, 10) ? 'たて も 横も 10倍。10 × 10 倍だよ。'
            : same(x, 20) ? 'たして いないかな？ たて も 横も 10倍 だから かけ算。'
              : same(x, 1000) ? '0が 1つ 多いよ。10 × 10 ＝ 100。' : null,
        scaffold: choiceStep({
          label: '何倍', prompt: '面積は？', correct: '100倍',
          wrongs: [
            { text: '10倍', note: 'たて も 横も 10倍。10 × 10 倍だよ。' },
            { text: '20倍', note: 'たして いないかな？ たて も 横も 10倍 だから かけ算。' },
            { text: '1000倍', note: '0が 1つ 多いよ。10 × 10 ＝ 100。' },
          ],
          why: 'たて も 横も 10倍 だから、面積は 10 × 10 ＝ 100倍。だから 面積の 単位は 100倍ずつ（1m² → 1a → 1ha → 1km²）。',
          hints: ['表の 1m と 10m、1m² と 1a を くらべよう。', 'たて も 横も 10倍に なる。', '1a ＝ 100m²'],
        }),
      })],
      summary: '1辺が 10倍 → 面積は 100倍',
      label: '1辺10倍 → 面積100倍', q: '1辺を10倍にすると面積は何倍', a: '100倍',
    });
  }
  if (v === 'k') {
    const k = rnd(2, 6), s = rnd(1, 4);
    const unit = pick(['cm', 'm']);
    return fin({
      skillId: 'unit-relation', title: `1辺が ${k}倍だと`, emoji: '🔲',
      text: `1辺が ${s}${unit}の 正方形と、1辺が その ${k}倍の 正方形が あります。`,
      steps: [numStep({
        label: '何倍', prompt: '大きい 正方形の 面積は、小さい 正方形の 面積の 何倍？', answer: k * k, unit: '倍',
        hints: ['それぞれの 面積を 求めて くらべよう。', `大きい 正方形の 1辺は ${s * k}${unit}。`, `${s * k} × ${s * k} は ${s} × ${s} の 何倍？`],
        diagnose: (x) => same(x, k * k) ? null : same(x, k) ? `1辺は ${k}倍 でも、面積は たて も 横も ${k}倍 だから ${k} × ${k} 倍。` : null,
      })],
      summary: `1辺が ${k}倍 → 面積は ${k} × ${k} ＝ ${k * k}倍`,
      label: `1辺${k}倍 → ${k * k}倍`, q: `1辺${s}${unit}の正方形と1辺が${k}倍の正方形の面積の比`, a: `${k * k}倍`,
    });
  }
  const it = pick([
    { p: '1a は 1m² の 何倍？', a: 100 }, { p: '1ha は 1a の 何倍？', a: 100 }, { p: '1km² は 1ha の 何倍？', a: 100 },
    { p: '1m² は 1cm² の 何倍？', a: 10000 }, { p: '1ha は 1m² の 何倍？', a: 10000 }, { p: '1km² は 1a の 何倍？', a: 10000 },
  ]);
  return fin({
    skillId: 'unit-relation', title: '単位の かんけい', emoji: '📊',
    text: '表を 見て 答えましょう。',
    figure: UNIT_TABLE,
    steps: [numStep({
      label: '何倍', prompt: it.p, answer: it.a, unit: '倍',
      hints: ['表で 2つの 単位の 1辺の 長さを くらべよう。', '1辺が 10倍 → 面積は 100倍。', it.a === 100 ? '1辺が 10倍 の かんけい。' : '1辺が 100倍 の かんけい（100 × 100）。'],
      diagnose: (x) => same(x, it.a) ? null : same(x, Math.sqrt(it.a)) ? '1辺の 長さの 倍に なって いるよ。面積は たて も 横も だから、かけ算で。' : null,
    })],
    summary: `${it.p.replace('何倍？', '')}${it.a}倍。`,
    label: it.p, q: it.p, a: `${it.a}倍`,
  });
}

/* ================================================================== */
/* ④ 面積を求める（calc-*）                                              */
/* ================================================================== */

export function genCalcKm(forceRect = false): Question {
  for (;;) {
    const sq = !forceRect && Math.random() < 0.3;
    const a = rnd(2, 9), b = sq ? a : rnd(2, 15);
    if (!sq && (a === b || Math.max(a, b) > 4 * Math.min(a, b))) continue;
    return rectQuestion('calc-km', sq ? '正方形（km²）' : '長方形（km²）', a, b, 'km', { square: sq, emoji: '🏞️' });
  }
}

export function genCalcMixunit(kind: 'm' | 'cm' | 'any' = 'any'): Question {
  const v = kind === 'any' ? pick(['m', 'm', 'cm'] as const) : kind;
  if (v === 'm') {
    for (;;) {
      const N = rnd(2, 9), b = rnd(2, 9);
      if (N === b) continue;
      const area = N * b;
      return fin({
        skillId: 'calc-mixunit', title: '単位を そろえて（m²）', emoji: '📐',
        text: `たてが ${N * 100}cm、横が ${b}mの 長方形の 面積は 何m²ですか。`,
        figure: rectFig(N, b, 'm', { leftText: `${N * 100}cm`, topText: `${b}m` }),
        steps: [
          numStep({
            label: '単位を そろえる', prompt: `まず 単位を そろえよう。${N * 100}cm ＝ □m`, answer: N, unit: 'm',
            hints: ['100cm ＝ 1m。', `${N * 100}cm は 100cm の いくつ分？`, `${N * 100} ÷ 100`],
            diagnose: (x) => (same(x, N) ? null : same(x, N * 10) ? '1m ＝ 100cm。10 で わるのでは ないよ。' : null),
          }),
          mulExpr(N, b, {
            hints: ['m に そろえた 長さで 式を 書こう。', 'たて × 横', `たては ${N}m、横は ${b}m。`],
            diagnose: (x) => (x.includes(N * 100) ? 'cm の ままの 数が 入っているよ。m に そろえた 数で。' : diagnoseRectExpr(N, b)(x)),
          }),
          numStep({
            label: '答え', prompt: '面積は 何m²？', answer: area, unit: 'm²',
            hints: ['式の かけ算を しよう。', '単位は m²。', `${N} × ${b}`],
            diagnose: (x) => same(x, area) ? null : same(x, N * 100 * b) ? '単位を そろえずに かけて いるよ。' : diagnoseRectAns(N, b, 'm')(x),
          }),
        ],
        summary: `${N * 100}cm ＝ ${N}m。${N} × ${b} ＝ ${area}。答えは ${area}m²（${area * 10000}cm²）。`,
        label: `${N * 100}cm × ${b}m`, q: `たて${N * 100}cm・横${b}mの長方形の面積（m²）`, a: `${N}×${b}＝${area}　${area}m²`, figArea: area,
      });
    }
  }
  const a = rnd(2, 9), c = pick([20, 30, 40, 50, 60, 70, 80, 90]);
  const area = a * 100 * c;
  return fin({
    skillId: 'calc-mixunit', title: '単位を そろえて（cm²）', emoji: '📐',
    text: `たてが ${c}cm、横が ${a}mの 長方形の 面積は 何cm²ですか。`,
    // 長さの比が大きすぎるので、図は形だけ（長さは文字で書く）
    figure: { ...rectFig(2, 5, 'cm', { leftText: `${c}cm`, topText: `${a}m` }), notToScale: true } as Figure,
    steps: [
      numStep({
        label: '単位を そろえる', prompt: `まず 単位を そろえよう。${a}m ＝ □cm`, answer: a * 100, unit: 'cm',
        hints: ['1m ＝ 100cm。', `${a}m は 100cm の ${a}こ分。`, `${a} × 100`],
        diagnose: (x) => (same(x, a * 100) ? null : same(x, a * 10) ? '1m ＝ 100cm だよ。' : null),
      }),
      mulExpr(c, a * 100, {
        hints: ['cm に そろえた 長さで 式を 書こう。', 'たて × 横', `たては ${c}cm、横は ${a * 100}cm。`],
        diagnose: (x) => (x.includes(a) && !x.includes(a * 100) ? 'm の ままの 数が 入っているよ。cm に そろえた 数で。' : diagnoseRectExpr(c, a * 100)(x)),
      }),
      numStep({
        label: '答え', prompt: '面積は 何cm²？', answer: area, unit: 'cm²', pad: MUL,
        hints: ['式の かけ算を しよう。', '0の 数に 気をつけて。', `${c} × ${a * 100}`],
        diagnose: (x) => same(x, area) ? null : same(x, c * a) ? '単位を そろえずに かけて いるよ。' : null,
      }),
    ],
    summary: `${a}m ＝ ${a * 100}cm。${c} × ${a * 100} ＝ ${area}。答えは ${area}cm²。`,
    label: `${c}cm × ${a}m`, q: `たて${c}cm・横${a}mの長方形の面積（cm²）`, a: `${c}×${a * 100}＝${area}　${area}cm²`,
  });
}

function bigUnitQuestion(skillId: 'calc-a' | 'calc-ha', step: number, unitName: 'a' | 'ha'): Question {
  for (;;) {
    const sq = Math.random() < 0.3;
    const p = rnd(skillId === 'calc-a' ? 2 : 1, 9), q = sq ? p : rnd(skillId === 'calc-a' ? 2 : 1, 9);
    if (!sq && (p === q || Math.max(p, q) > 4 * Math.min(p, q))) continue;
    if (p * q === 1) continue;
    const a = p * step, b = q * step;
    const m2 = a * b, ans = p * q;
    const per = unitName === 'a' ? 100 : 10000;
    return fin({
      skillId, title: `${unitName}で 求める`, emoji: unitName === 'a' ? '🌾' : '🐄',
      text: sq ? `1辺が ${a}mの 正方形の 面積は 何${unitName}ですか。` : `たてが ${a}m、横が ${b}mの 長方形の 面積は 何${unitName}ですか。`,
      figure: rectFig(a, b, 'm', { center: `〔${unitName}〕` }),
      steps: [
        mulExpr(a, b, { hints: ['まず m² で 面積を 求めよう。', sq ? '1辺 × 1辺' : 'たて × 横', `${a} と ${b} を かける。`], diagnose: diagnoseRectExpr(a, b) }),
        numStep({
          label: 'm²', prompt: '面積は 何m²？', answer: m2, unit: 'm²', pad: MUL,
          hints: ['式の かけ算を しよう。', '0を のぞいて かけてから、0を つけると らく。', `${p} × ${q} に 0を ${unitName === 'a' ? 2 : 4}こ`],
          diagnose: diagnoseRectAns(a, b, 'm'),
        }),
        numStep({
          label: unitName, prompt: `${m2}m² は 何${unitName}？`, answer: ans, unit: unitName,
          hints: [`1${unitName} ＝ ${per}m²。`, `${m2}m² は ${per}m² の いくつ分？`, `1辺 ${step}m の 正方形が たてに ${p}こ、横に ${q}こ。`],
          diagnose: (x) => same(x, ans) ? null : same(x, unitName === 'a' ? m2 / 10 : m2 / 100) ? `1${unitName} ＝ ${per}m² だよ。` : same(x, m2) ? `m² の ままだよ。${unitName} に なおそう。` : null,
        }),
      ],
      summary: `${a} × ${b} ＝ ${m2}（m²）。${m2}m² ＝ ${ans}${unitName}。1辺 ${step}m の 正方形 ${p} × ${q} ＝ ${ans}こ分 と 考えても よい。`,
      label: `${a}m × ${b}m ＝ ${ans}${unitName}`, q: sq ? `1辺${a}mの正方形の面積（${unitName}）` : `たて${a}m・横${b}mの長方形の面積（${unitName}）`, a: `${a}×${b}＝${m2}　${ans}${unitName}`, figArea: m2,
    });
  }
}

export const genCalcA = (): Question => bigUnitQuestion('calc-a', 10, 'a');
export const genCalcHa = (): Question => bigUnitQuestion('calc-ha', 100, 'ha');

/* ================================================================== */
/* ⑤ 辺の長さ（side-*）                                                  */
/* ================================================================== */

const PLACES = [
  { thing: '花だん', unit: 'm', emoji: '🌷' }, { thing: '畑', unit: 'm', emoji: '🥕' }, { thing: 'しき物', unit: 'm', emoji: '🧺' },
  { thing: 'カード', unit: 'cm', emoji: '🃏' }, { thing: '画用紙', unit: 'cm', emoji: '🖼️' }, { thing: 'タイル', unit: 'cm', emoji: '🔳' },
];

export function genSideFind(): Question {
  for (;;) {
    const a = rnd(2, 12), b = rnd(2, 12);
    if (a === b || Math.max(a, b) > 4 * Math.min(a, b)) continue;
    const pl = pick(PLACES);
    const A = a * b, u = pl.unit;
    return fin({
      skillId: 'side-find', title: 'たての 長さ', emoji: pl.emoji,
      text: `面積が ${A}${u}²で、横の 長さが ${b}${u}の 長方形の 形を した ${pl.thing}が あります。この ${pl.thing}の たての 長さは 何${u}ですか。`,
      figure: rectFig(a, b, u, { leftText: `□${u}`, center: `${A}${u}²` }),
      steps: [
        {
          kind: 'fill', label: '式', prompt: 'たての 長さを □${u} として、公式に あてはめよう。'.replace('${u}', u),
          layout: { type: 'expr', parts: ['□', '×', { slot: 0 }, '＝', { slot: 1 }] }, accept: [[b, A]],
          hints: ['長方形の 面積 ＝ たて × 横。', 'たてが □、横が ' + b + u + '、面積が ' + A + u + '²。', '□ × 横 ＝ 面積'],
          diagnose: (v) => (v[0] === A && v[1] === b ? '横 と 面積が 反対だよ。□ × 横 ＝ 面積。' : null),
        },
        {
          kind: 'fill', label: '□を 求める', prompt: '□を 求める 式は？',
          layout: { type: 'expr', parts: ['□', '＝', { slot: 0 }, '÷', { slot: 1 }] }, accept: [[A, b]],
          hints: ['□ × ' + b + ' ＝ ' + A + ' の □は、わり算で 求められる。', 'かけ算の 答え ÷ かける数', '面積 ÷ 横'],
          diagnose: (v) => (v[0] === b && v[1] === A ? 'わる数 と わられる数が 反対だよ。' : null),
        },
        numStep({
          label: '答え', prompt: `たての 長さは 何${u}？`, answer: a, unit: u,
          hints: ['わり算を しよう。', `□ × ${b} ＝ ${A}`, `${b}の だんの 九九を 思い出そう。`],
          diagnose: (x) => same(x, a) ? null : same(x, A * b) ? 'かけ算では なく わり算だよ。' : same(x, A - b) ? 'ひき算では なく わり算だよ。' : null,
        }),
      ],
      summary: `□ × ${b} ＝ ${A}、□ ＝ ${A} ÷ ${b} ＝ ${a}。たては ${a}${u}。`,
      label: `面積${A} 横${b} → たて${a}`, q: `面積${A}${u}²・横${b}${u}の長方形のたて`, a: `${A}÷${b}＝${a}　${a}${u}`,
    });
  }
}

export function genSideSquare(): Question {
  const s = rnd(2, 12);
  const pl = pick(PLACES);
  const u = pl.unit, A = s * s;
  return fin({
    skillId: 'side-square', title: '正方形の 1辺', emoji: pl.emoji,
    text: `面積が ${A}${u}²の 正方形の ${pl.thing}が あります。1辺の 長さは 何${u}ですか。`,
    figure: { type: 'shape', polys: [{ pts: rectPts(0, 0, 4, 4), role: 'main' }], dims: edgeDims(rectPts(0, 0, 4, 4), '', [1, 2, 3], () => `□${u}`), center: `${A}${u}²` },
    steps: [numStep({
      label: '1辺', prompt: `1辺は 何${u}？`, answer: s, unit: u,
      hints: ['正方形の 面積 ＝ 1辺 × 1辺。', `□ × □ ＝ ${A} に なる 数を さがそう。`, '同じ 数を かける 九九（2×2、3×3 …）を 思い出そう。'],
      diagnose: (x) => same(x, s) ? null : same(x, A / 4) ? '÷4 は まわりの 長さから 1辺を 出す ときだよ。□ × □ ＝ 面積。' : same(x, A / 2) ? '□ × □ に なる 数を さがそう。' : null,
    })],
    summary: `${s} × ${s} ＝ ${A} だから、1辺は ${s}${u}。`,
    label: `面積${A} → 1辺${s}`, q: `面積${A}${u}²の正方形の1辺`, a: `${s}${u}`,
  });
}

/* ================================================================== */
/* ⑥ 複合図形（comp-*）                                                  */
/* ================================================================== */

const unitPick = () => pick(['cm', 'cm', 'm']);

export function genCompSplit(): Question {
  const L = makeL();
  const u = unitPick();
  const vert = Math.random() < 0.5;
  const [p1, p2] = vert ? L.vParts : L.hParts;
  const a1 = vert ? L.H * (L.W - L.nw) : L.nh * (L.W - L.nw);
  const a2 = vert ? (L.H - L.nh) * L.nw : (L.H - L.nh) * L.W;
  const area = a1 + a2;
  return fin({
    skillId: 'comp-split', title: '2つに 分けて', emoji: '✂️',
    text: `下の 形の 面積を、点線で 2つの 長方形 あ・い に 分けて 求めましょう。`,
    figure: { type: 'shape', polys: [{ pts: L.pts, role: 'main' }, polyLabel(p1, 'あ'), polyLabel(p2, 'い')], dims: edgeDims(L.pts, u) },
    steps: [
      numStep({ label: 'あ', prompt: `あ の 長方形の 面積は？`, answer: a1, unit: `${u}²`, hints: ['あ の たて と 横の 長さを 図から 読もう。', '書いて いない 長さは、ほかの 辺から ひき算で 出す。', 'たて × 横'] }),
      numStep({ label: 'い', prompt: `い の 長方形の 面積は？`, answer: a2, unit: `${u}²`, hints: ['い の たて と 横の 長さを 図から 読もう。', '全体の 長さ － わかっている 長さ で 出せる 辺も あるよ。', 'たて × 横'] }),
      numStep({
        label: '答え', prompt: '形 全体の 面積は？', answer: area, unit: `${u}²`, pad: MUL,
        hints: ['あ と い の 面積を たそう。', `${a1} ＋ ${a2}`, '分けた 面積の 合計が 全体の 面積。'],
        diagnose: (x) => (same(x, area) ? null : same(x, L.W * L.H) ? 'それは 大きな 長方形 全部の 面積。かけた ところが あるよ。' : null),
      }),
    ],
    summary: `あ ${a1}${u}² ＋ い ${a2}${u}² ＝ ${area}${u}²。`,
    label: `L字（${area}${u}²）`, q: `L字形の面積（全体${L.W}×${L.H}、かけた部分${L.nw}×${L.nh}）`, a: `${area}${u}²`, figArea: area,
  });
}

export function genCompSub(): Question {
  const L = makeL();
  const u = unitPick();
  const big = L.W * L.H, cut = L.nw * L.nh, area = big - cut;
  return fin({
    skillId: 'comp-sub', title: '大きい 長方形から ひく', emoji: '➖',
    text: '下の 形の 面積を、点線の 大きな 長方形から、ない ところ（う）を ひいて 求めましょう。',
    figure: { type: 'shape', polys: [{ pts: L.pts, role: 'main' }, polyLabel(L.big, ''), polyLabel(L.notch, 'う')], dims: edgeDims(L.pts, u) },
    steps: [
      numStep({ label: '大きい 長方形', prompt: '点線の 大きな 長方形の 面積は？', answer: big, unit: `${u}²`, hints: ['大きな 長方形の たて と 横は、形の いちばん 長い 辺。', `たて ${L.H}${u}、横 ${L.W}${u}。`, `${L.H} × ${L.W}`] }),
      numStep({ label: 'う', prompt: 'ない ところ（う）の 面積は？', answer: cut, unit: `${u}²`, hints: ['う の たて と 横を 図から 読もう。', 'へこんだ ところの 辺の 長さを 見よう。', `${L.nh} × ${L.nw}`] }),
      numStep({
        label: '答え', prompt: '形の 面積は？', answer: area, unit: `${u}²`,
        hints: ['大きい 長方形 － う。', `${big} － ${cut}`, 'ひき算で 求める。'],
        diagnose: (x) => (same(x, area) ? null : same(x, big + cut) ? 'たして いるよ。ない ところは ひく。' : same(x, big) ? 'ない ところを ひこう。' : null),
      }),
    ],
    summary: `${L.H} × ${L.W} － ${L.nh} × ${L.nw} ＝ ${big} － ${cut} ＝ ${area}${u}²。`,
    label: `ひいて（${area}${u}²）`, q: `L字形の面積をひいて求める（${L.W}×${L.H}−${L.nw}×${L.nh}）`, a: `${area}${u}²`, figArea: area,
  });
}

const FRIENDS = ['そうたさん', 'ゆいさん', 'はるとさん', 'あおいさん', 'れんさん'];

export function genCompWhich(): Question {
  for (;;) {
    const L = makeL({ W: [4, 8], H: [3, 7] });
    const { W, H, nw, nh } = L;
    if (W === H - nh) continue;
    const u = unitPick();
    const vExpr = `${H}×${W - nw}＋（${H}－${nh}）×${nw}`;
    const hExpr = `${nh}×${W - nw}＋（${H}－${nh}）×${W}`;
    const sExpr = `${H}×${W}－${nh}×${nw}`;
    const wExpr = `${H}×${W - nw}＋${W}×${nw}`;
    if (new Set([vExpr, hExpr, sExpr, wExpr]).size < 4) continue;
    const method = pick(['v', 'h', 's'] as const);
    const friend = pick(FRIENDS);
    const say = method === 'v' ? 'たてに 2つの 長方形に 分けて 考えたよ。' : method === 'h' ? '横に 2つの 長方形に 分けて 考えたよ。' : '大きな 長方形から、ない ところを ひいて 考えたよ。';
    const ghosts: Poly[] = method === 'v' ? [polyLabel(L.vParts[0], ''), polyLabel(L.vParts[1], '')]
      : method === 'h' ? [polyLabel(L.hParts[0], ''), polyLabel(L.hParts[1], '')]
        : [polyLabel(L.big, ''), polyLabel(L.notch, '')];
    const correct = method === 'v' ? vExpr : method === 'h' ? hExpr : sExpr;
    const others = [vExpr, hExpr, sExpr].filter((e) => e !== correct);
    const area = W * H - nw * nh;
    const mc = mix(correct, [
      ...others.map((e) => ({ text: e, note: `この 式も 面積は 出せるけど、${friend}の 考え方（図の 点線）とは ちがうよ。` })),
      { text: wExpr, note: '右（左）の 長方形の たてを、形 全体の たてに して いるよ。この 式は 面積に ならない。' },
    ]);
    const labeled = mc.choices.map((c, i) => `${KANA[i]}　${c}`);
    return fin({
      skillId: 'comp-which', title: '考え方と 式', emoji: '💭',
      text: `${friend}は、下の 形の 面積を 次のように 考えて 求めました。\n「${say}」\n${friend}の 考えを 表す 式を えらびましょう。`,
      figure: { type: 'shape', polys: [{ pts: L.pts, role: 'main' }, ...ghosts], dims: edgeDims(L.pts, u, [3]) },
      steps: [{
        kind: 'choice', label: '式', prompt: `${friend}の 考えを 表す 式は？`, choices: labeled, correct: mc.correct,
        wrong: mc.wrong,
        why: method === 'v' ? `たてに 分けると、${H}×${W - nw} と（${H}－${nh}）×${nw} の 2つの 長方形。` : method === 'h' ? `横に 分けると、${nh}×${W - nw} と（${H}－${nh}）×${W} の 2つの 長方形。` : `大きな 長方形 ${H}×${W} から、ない ところ ${nh}×${nw} を ひく。`,
        hints: ['図の 点線を 見て、どんな 長方形に 分けたか（どこを ひいたか）を 考えよう。', '式の かけ算 1つが、長方形 1つの 面積。', '書いて いない 辺の 長さは、ひき算（－）で 表して いるよ。'],
      }],
      summary: `${friend}の 式は ${correct} ＝ ${area}。ほかの 考え方の 式でも 同じ ${area}${u}² に なる。`,
      label: `考え方と 式（${method === 'v' ? 'たて' : method === 'h' ? '横' : 'ひく'}）`, q: `L字形の面積を「${say}」と考えた式`, a: correct, figArea: area,
    });
  }
}

export function genCompCshape(): Question {
  const C = makeC();
  const u = pick(['m', 'cm']);
  const big = C.W * C.H, cut = C.d * C.h, area = big - cut;
  const right = `${C.H}×${C.W}－${C.d}×${C.h}`;
  const wrongs = [
    { text: `${C.H}×${C.W}＋${C.d}×${C.h}`, note: 'へこんだ ところは たすのでは なく ひくよ。' },
    { text: `${C.H}×${C.W}－${C.d}×${C.H}`, note: 'へこんだ ところの たては、形 全体の たてとは ちがうよ。' },
    { text: `${C.H}×${C.W}－${C.W}×${C.h}`, note: 'へこんだ ところの 横（ふかさ）は、形 全体の 横とは ちがうよ。' },
  ].filter((w) => w.text !== right);
  return fin({
    skillId: 'comp-cshape', title: 'へこんだ 形', emoji: '🧩',
    text: '下のような 形の 面積を 求めましょう。',
    figure: { type: 'shape', polys: [{ pts: C.pts, role: 'main' }], dims: edgeDims(C.pts, u) },
    steps: [
      choiceStep({
        label: '式', prompt: '大きな 長方形から へこんだ ところを ひく 式は？', correct: right, wrongs,
        why: `大きな 長方形（${C.H}×${C.W}）から、へこんだ 長方形（${C.d}×${C.h}）を ひく。3つに 分けて たしても 同じ 答えに なるよ。`,
        hints: ['へこみを うめると、大きな 長方形に なる。', 'へこんだ ところの たて と 横を 図から 読もう。', '大きな 長方形 － へこんだ ところ'],
      }),
      numStep({
        label: '答え', prompt: '面積は？', answer: area, unit: `${u}²`, pad: MUL,
        hints: ['式の 計算を しよう。', `${big} － ${cut}`, 'かけ算を 先に して から ひき算。'],
        diagnose: (x) => (same(x, area) ? null : same(x, big) ? 'へこんだ ところを ひこう。' : same(x, big + cut) ? 'へこんだ ところは ひくよ。' : null),
      }),
    ],
    summary: `${right} ＝ ${big} － ${cut} ＝ ${area}${u}²。`,
    label: `コの字（${area}${u}²）`, q: `コの字形の面積（${C.W}×${C.H}からへこみ${C.d}×${C.h}）`, a: `${right}＝${area}　${area}${u}²`, figArea: area,
  });
}

export function genCompRoad(): Question {
  for (;;) {
    const a = rnd(5, 12), b = rnd(4, 10);
    if (a === b) continue;
    const kind = pick(['one', 'compare'] as const);
    // 道（はば1m）が十字に通る畑
    const px = rnd(1, a - 2), py = rnd(1, b - 2);
    const roads: Poly[] = [
      { pts: rectPts(px, 0, 1, b), role: 'road' },
      { pts: rectPts(0, py, px, 1), role: 'road' },
      { pts: rectPts(px + 1, py, a - px - 1, 1), role: 'road' },
    ];
    const flowers = (a - 1) * (b - 1);
    const dims = [...edgeDims(rectPts(0, 0, a, b), 'm', [1, 2]), { a: [px, b] as [number, number], b: [px + 1, b] as [number, number], text: '1m', side: 'bottom' as const }];
    if (kind === 'one') {
      return fin({
        skillId: 'comp-road', title: '道を はしに よせて', emoji: '🌻',
        text: `たて ${b}m、横 ${a}mの 畑に、はば 1mの 道を 十字に つくりました。のこりに 花を うえます。`,
        figure: { type: 'shape', polys: [{ pts: rectPts(0, 0, a, b), role: 'main' }, ...roads], dims },
        steps: [
          choiceStep({
            label: '道を よせる', prompt: '道を 畑の はしに よせると、花を うえる ところは どんな 形に なる？', correct: `たて ${b - 1}m、横 ${a - 1}m の 長方形`,
            wrongs: [
              { text: `たて ${b}m、横 ${a}m の 長方形`, note: 'それは 畑 全体。道の ぶんが へるよ。' },
              { text: `たて ${b - 2}m、横 ${a - 2}m の 長方形`, note: '道は たてに 1本、横に 1本。それぞれ 1m だけ へる。' },
              { text: `たて ${b - 1}m、横 ${a}m の 長方形`, note: 'たての 道の ぶん、横の 長さも 1m へるよ。' },
            ],
            why: `たての 道を はしに よせると 横が ${a - 1}m、横の 道を よせると たてが ${b - 1}m の 長方形が のこる。`,
            hints: ['4つに 分かれた 花だんを、すきまなく よせ集めて みよう。', 'たての 道の はばの ぶん、横が へる。', '横の 道の はばの ぶん、たてが へる。'],
          }),
          numStep({
            label: '答え', prompt: '花を うえる 面積は 何m²？', answer: flowers, unit: 'm²',
            hints: ['よせた 長方形の たて × 横。', `${b - 1} × ${a - 1}`, '4つに 分けて 求めて たしても 同じに なる。'],
            diagnose: (x) => (same(x, flowers) ? null : same(x, a * b) ? '道の ぶんを ひこう。' : null),
          }),
        ],
        summary: `道を はしに よせると、たて ${b - 1}m、横 ${a - 1}m。${b - 1} × ${a - 1} ＝ ${flowers}m²。`,
        label: `道を よせて（${flowers}m²）`, q: `たて${b}m横${a}mの畑に1m幅の十字の道。花の面積`, a: `${flowers}m²`, figArea: flowers,
      });
    }
    // くらべる: A＝十字の道（1m・1m）、B＝はしに道（たて方向 w1、横方向 w2）
    const w = pick([[1, 2], [2, 1], [1, 1]] as const);
    const fa = flowers, fb = (a - w[0]) * (b - w[1]);
    const ans = fa > fb ? 'Aの 計画' : fa < fb ? 'Bの 計画' : '同じ';
    const off = a + 2;
    const figB: Poly[] = [
      { pts: rectPts(off, 0, a, b), role: 'main', label: 'B' },
      { pts: rectPts(off, 0, w[0], b), role: 'road' },
      { pts: rectPts(off + w[0], 0, a - w[0], w[1]), role: 'road' },
    ];
    return fin({
      skillId: 'comp-road', title: 'どちらが 広い？', emoji: '🌻',
      text: `たて ${b}m、横 ${a}mの 畑に 花を うえます。A は はば 1mの 道を 十字に、B は はしに 道（はば ${w[0]}m と ${w[1]}m）を つくります。花を うえる 面積が 広いのは どちらですか。`,
      figure: {
        type: 'shape',
        polys: [{ pts: rectPts(0, 0, a, b), role: 'main', label: 'A' }, ...roads, ...figB],
        dims: [...dims, { a: [off, b], b: [off + w[0], b], text: `${w[0]}m`, side: 'bottom' }, { a: [off + a, 0], b: [off + a, w[1]], text: `${w[1]}m`, side: 'right' }],
      },
      steps: [
        choiceStep({
          label: '広いのは', prompt: '花を うえる 面積が 広いのは？', correct: ans,
          wrongs: ['Aの 計画', 'Bの 計画', '同じ'].filter((x) => x !== ans).map((x) => ({ text: x, note: 'A の 道を はしに よせて、B と 同じ ならび方に して くらべよう。' })),
          why: `A の 道を はしに よせると たて ${b - 1}m・横 ${a - 1}m（${fa}m²）。B は たて ${b - w[1]}m・横 ${a - w[0]}m（${fb}m²）。`,
          hints: ['A の 十字の 道を、畑の はしに よせて みよう。', 'どちらも「はしに 道が ある 形」に すると、道の はばだけで くらべられる。', `A の 花だんは たて ${b - 1}m、横 ${a - 1}m。`],
        }),
        numStep({
          label: 'Aの 面積', prompt: 'A の 花を うえる 面積は 何m²？', answer: fa, unit: 'm²',
          hints: ['道を はしに よせた 長方形の たて × 横。', `たて ${b - 1}m、横 ${a - 1}m。`, `${b - 1} × ${a - 1}`],
          diagnose: (x) => (same(x, fa) ? null : same(x, a * b) ? '道の ぶんを ひこう。' : null),
        }),
      ],
      summary: `A ${fa}m²、B ${fb}m²。${ans === '同じ' ? '同じ 広さ' : ans + 'の ほうが 広い'}。道を はしに よせると くらべやすい。`,
      label: `道の くらべ（${ans}）`, q: `たて${b}m横${a}mの畑、A十字の道1m・Bはしの道${w[0]}mと${w[1]}m`, a: `${ans}（A${fa}m²、B${fb}m²）`,
    });
  }
}

/* ================================================================== */
/* ⑦ 面積の変わり方（change-*）                                          */
/* ================================================================== */

export function genChangeTable(perimeter?: number): Question {
  const P = perimeter ?? pick([10, 12, 12, 14, 16]);
  const s = P / 2, n = s - 1;
  const u = pick(['cm', 'cm', 'm']);
  // 横1 は 全部 書いてある。それ以外は ランダムに □ にする（たて 2こ以上・面積 3こ以上）
  for (;;) {
    const tHide = Array.from({ length: n }, (_, i) => i >= 1 && Math.random() < 0.65);
    const aHide = Array.from({ length: n }, (_, i) => i >= 1 && Math.random() < 0.75);
    if (tHide.filter(Boolean).length < 2 || aHide.filter(Boolean).length < 3) continue;
    let k = 0;
    const answers: number[] = [];
    const tRow: FillToken[] = [`たて（${u}）`];
    const aRow: FillToken[] = [`面積（${u}²）`];
    for (let i = 0; i < n; i++) {
      const x = i + 1;
      if (tHide[i]) { tRow.push({ slot: k++ }); answers.push(s - x); } else tRow.push(s - x);
    }
    for (let i = 0; i < n; i++) {
      const x = i + 1;
      if (aHide[i]) { aRow.push({ slot: k++ }); answers.push(x * (s - x)); } else aRow.push(x * (s - x));
    }
    const xRow: FillToken[] = [`横（${u}）`, ...Array.from({ length: n }, (_, i) => i + 1)];
    return fin({
      skillId: 'change-table', title: 'まわりが 同じ 長方形の 表', emoji: '📋',
      text: `まわりの 長さが ${P}${u}に なるように、長方形や 正方形を つくります。\n表の あいている ところに、あてはまる 数を 書きましょう。`,
      steps: [{
        kind: 'fill', label: '表', prompt: '□を タップして 数を 入れよう。',
        layout: { type: 'table', rows: [xRow, tRow, aRow] }, accept: [answers],
        hints: [`まわりの 長さが ${P}${u} だから、たて ＋ 横 ＝ ${s}${u}。`, `たて ＝ ${s} － 横。`, '面積 ＝ たて × 横。'],
        diagnose: (v) => {
          const bad = v.filter((x, i) => x !== answers[i]).length;
          return bad === 0 ? null : `まちがっている □が ${bad}こ あるよ。赤い □を 見なおそう。`;
        },
      }],
      summary: `たて ＋ 横 ＝ ${s}（まわりの 半分）。面積 ＝ たて × 横。横が ふえると 面積は ふえて、とちゅうから へる。`,
      label: `まわり${P}${u}の 表`, q: `まわり${P}${u}の長方形の表（横・たて・面積）`, a: answers.join('、'),
    });
  }
}

export function genChangeGraph(perimeter?: number): Question {
  const P = perimeter ?? pick([8, 10, 12, 14, 16, 18]);
  const s = P / 2, n = s - 1;
  const u = pick(['cm', 'm']);
  const what = perimeter ? 'area' : pick(['area', 'area', 'tate'] as const);
  const ys = Array.from({ length: n }, (_, i) => (what === 'area' ? (i + 1) * (s - i - 1) : s - i - 1));
  const maxY = Math.max(...ys);
  const yStep = maxY > 12 ? 2 : 1;
  const yMax = Math.ceil((maxY + 1) / (yStep * 2)) * yStep * 2;
  const pts = ys.map((y, i) => ({ x: i + 1, y }));
  const yName = what === 'area' ? `面積（${u}²）` : `たて（${u}）`;
  return fin({
    skillId: 'change-graph', title: `横の 長さと ${what === 'area' ? '面積' : 'たて'}`, emoji: '📈',
    text: `まわりの 長さが ${P}${u}の 長方形や 正方形の、横の 長さと ${what === 'area' ? '面積' : 'たての 長さ'}を 表に しました。\n横の 長さが 1${u}、2${u}、…と 変わると ${what === 'area' ? '面積' : 'たての 長さ'}は どう 変わるか、折れ線グラフに 表しましょう。`,
    figure: { type: 'table', headers: [`横（${u}）`, ...pts.map((p) => String(p.x))], rows: [[yName, ...ys]] },
    steps: [{
      kind: 'plot', label: 'グラフ', prompt: '表の 組を 点に して うとう（同じ 横の 位置を タップすると うつしかえ）。',
      xLabel: `横（${u}）`, yLabel: `（${u}${what === 'area' ? '²' : ''}）`, xMax: n + 1, yMax, yStep, points: pts,
      hints: ['横の 長さ 1 の ところで、表の 数の 高さに 点を うつ。', yStep > 1 ? '目もり 1つは 1。太い 線が 2ずつ。' : '目もり 1つは 1。', '点を ぜんぶ うつと、線で つながるよ。'],
    }],
    summary: what === 'area' ? `横が ふえると 面積は ふえて、正方形に 近い ところで いちばん 大きく なり、その あと へる。` : `横が 1 ふえると たては 1 へる（たて ＋ 横 ＝ ${s}）。`,
    label: `まわり${P}${u}の グラフ（${what === 'area' ? '面積' : 'たて'}）`, q: `まわり${P}${u}の長方形：横と${what === 'area' ? '面積' : 'たて'}の折れ線グラフ`, a: pts.map((p) => `(${p.x},${p.y})`).join(''),
  });
}

export function genChangeMax(): Question {
  const P = pick([8, 12, 16, 20, 24]);
  const s = P / 2, h = s / 2;
  const u = pick(['cm', 'm']);
  return fin({
    skillId: 'change-max', title: 'いちばん 広いのは？', emoji: '🏆',
    text: `まわりの 長さが ${P}${u}の 長方形や 正方形を、横の 長さを 1${u}ずつ 変えて つくります（長さは 整数）。`,
    steps: [
      numStep({
        label: '横の長さ', prompt: `面積が いちばん 大きく なるのは、横が 何${u}の とき？`, answer: h, unit: u,
        hints: [`たて ＋ 横 ＝ ${s}${u}。`, '横 1、2、3 … の ときの 面積を 表に して みよう。', 'たて と 横が 近い ほど 面積は 大きい。'],
        diagnose: (x) => (same(x, h) ? null : same(x, s - 1) ? '横が いちばん 長い ときは、たてが 1 で 細長く なるよ。' : null),
      }),
      choiceStep({
        label: '形', prompt: 'その ときの 形は？', correct: '正方形',
        wrongs: [
          { text: '横に 細長い 長方形', note: '細長い 長方形は 面積が 小さいよ。' },
          { text: 'たてに 細長い 長方形', note: '細長い 長方形は 面積が 小さいよ。' },
        ],
        why: `たて ${h}${u}、横 ${h}${u} の 正方形の とき、面積は ${h * h}${u}² で いちばん 大きい。`,
        hints: ['たて と 横の 長さを くらべよう。', `たて ＝ ${s} － 横。`, '4つの 辺が 同じ 長さの 形。'],
      }),
      numStep({
        label: '面積', prompt: 'その ときの 面積は？', answer: h * h, unit: `${u}²`,
        hints: ['たて × 横。', `たても 横も ${h}${u}。`, `${h} × ${h}`],
        diagnose: (x) => (same(x, h * h) ? null : same(x, P) ? 'それは まわりの 長さ。面積は たて × 横。' : null),
      }),
    ],
    summary: `まわりの 長さが 同じでも 面積は ちがう。正方形（${h}${u} × ${h}${u} ＝ ${h * h}${u}²）の とき いちばん 広い。`,
    label: `まわり${P}${u} → 正方形`, q: `まわり${P}${u}の長方形で面積が最大になる横の長さ`, a: `${h}${u}（正方形・${h * h}${u}²）`,
  });
}

/* ================================================================== */
/* ⑧ エラーハンター（eh-*）                                              */
/* ================================================================== */

function ehQuestion(o: {
  skillId: string; title: string; text: string; says: string[]; figure?: Figure;
  part: [string, string, string]; why: string; answer: number; unit: string; answerPrompt: string;
  hints: string[]; diagnose?: (v: number) => string | null; summary: string; figArea?: number; q: string; pad?: PadSpec;
}): Question {
  const mc = mix(o.part[0], [
    { text: o.part[1], note: 'そこは 合って いるよ。Aさんの 計算を もう一度 見なおそう。' },
    { text: o.part[2], note: 'そこは 合って いるよ。Aさんの 計算を もう一度 見なおそう。' },
  ]);
  return fin({
    skillId: o.skillId, title: o.title, emoji: '🕵️',
    text: `${o.text}\nAさんの 答え：\n${o.says.map((s) => `・${s}`).join('\n')}`,
    figure: o.figure,
    steps: [
      { kind: 'choice', label: 'まちがい', prompt: 'Aさんの まちがいは どれ？', ...mc, why: o.why, hints: ['Aさんの 式を 1つずつ 見なおそう。', '公式・単位・数の 読み方の どこかが ちがう。', '正しい 公式・単位の かんけいと、Aさんの 式を くらべよう。'] },
      numStep({ label: '正しい 答え', prompt: o.answerPrompt, answer: o.answer, unit: o.unit, hints: o.hints, diagnose: o.diagnose, pad: o.pad }),
    ],
    summary: o.summary,
    label: o.title, q: `${o.q}（Aさん：${o.says.join(' ')}）`, a: `${fmt(o.answer)}${o.unit}`, figArea: o.figArea,
  });
}

export function genEhPerim(): Question {
  for (;;) {
    const a = rnd(2, 9), b = rnd(3, 12);
    if (a === b || a * b === 2 * (a + b)) continue;
    const u = pick(['cm', 'm']);
    const per = 2 * (a + b), area = a * b;
    return ehQuestion({
      skillId: 'eh-perim', title: 'まわりの 長さを 求めた',
      text: `たて ${a}${u}、横 ${b}${u}の 長方形の 面積を 求めます。`, figure: rectFig(a, b, u),
      says: [`式 （${a}＋${b}）×2＝${per}`, `答え ${per}${u}²`],
      part: ['面積なのに、まわりの 長さの 式に した', 'たて と 横を 反対に して、ちがう 数を かけた', 'かけ算の 計算を、九九で まちがえた'],
      why: `（たて＋横）×2 は まわりの 長さ。面積は たて × 横 ＝ ${a} × ${b}。`,
      answer: area, unit: `${u}²`, answerPrompt: '正しい 面積は？',
      hints: ['面積 ＝ たて × 横。', `${a} × ${b}`, '九九で 計算しよう。'],
      diagnose: (x) => (same(x, area) ? null : same(x, per) ? 'Aさんと 同じ。それは まわりの 長さ。' : null),
      summary: `面積は ${a} × ${b} ＝ ${area}${u}²。（${a}＋${b}）×2 ＝ ${per}${u} は まわりの 長さ。`,
      figArea: area, q: `たて${a}${u}横${b}${u}の長方形の面積`,
    });
  }
}

export function genEhUnit(): Question {
  for (;;) {
    const N = rnd(2, 9), b = rnd(2, 9);
    if (N === b) continue;
    const wrong = N * 100 * b, area = N * b;
    return ehQuestion({
      skillId: 'eh-unit', title: '単位を そろえなかった',
      text: `たて ${N * 100}cm、横 ${b}mの 長方形の 面積を m² で 求めます。`,
      figure: rectFig(N, b, 'm', { leftText: `${N * 100}cm`, topText: `${b}m` }),
      says: [`式 ${N * 100}×${b}＝${wrong}`, `答え ${wrong}m²`],
      part: ['cm と m を そろえずに かけた', '公式を たて＋横 と した', 'かけ算の 九九を まちがえた'],
      why: `${N * 100}cm ＝ ${N}m に そろえてから かける。${N} × ${b} ＝ ${area}m²。`,
      answer: area, unit: 'm²', answerPrompt: '正しい 面積は 何m²？',
      hints: [`${N * 100}cm を m に なおそう。`, '100cm ＝ 1m。', `${N} × ${b}`],
      diagnose: (x) => (same(x, area) ? null : same(x, wrong) ? 'Aさんと 同じ。先に 単位を そろえよう。' : null),
      summary: `${N * 100}cm ＝ ${N}m。${N} × ${b} ＝ ${area}m²（cm に そろえるなら ${N * 100}×${b * 100}＝${wrong * 100}cm²）。`,
      figArea: area, q: `たて${N * 100}cm横${b}mの長方形の面積（m²）`,
    });
  }
}

export function genEhConv(): Question {
  const k = rnd(2, 9);
  const big = Math.random() < 0.5;
  if (big) {
    return ehQuestion({
      skillId: 'eh-conv', title: '1km²＝1000m² と 思った',
      text: `${k}km² は 何m² か 考えます。`,
      says: ['1km ＝ 1000m だから、', `${k}km² ＝ ${k * 1000}m²`],
      part: ['1km² を 1000m² と 考えた', '1km ＝ 1000m と したのが まちがい', `${k}倍 したのが まちがい`],
      why: '1km² は 1辺 1000m の 正方形。1000 × 1000 ＝ 1000000m²。',
      answer: k * 1000000, unit: 'm²', answerPrompt: `正しくは ${k}km² ＝ 何m²？`,
      hints: ['1km² は 1辺が 1km（1000m）の 正方形の 面積。', '1000 × 1000', '1km² ＝ 1000000m²'],
      diagnose: (x) => (same(x, k * 1000000) ? null : same(x, k * 1000) ? 'Aさんと 同じだよ。' : null),
      summary: `1km² ＝ 1000000m² だから、${k}km² ＝ ${k * 1000000}m²。`, q: `${k}km²＝□m²`,
    });
  }
  return ehQuestion({
    skillId: 'eh-conv', title: '1m²＝100cm² と 思った',
    text: `${k}m² は 何cm² か 考えます。`,
    says: ['1m ＝ 100cm だから、', `${k}m² ＝ ${k * 100}cm²`],
    part: ['1m² を 100cm² と 考えた', '1m ＝ 100cm と したのが まちがい', `${k}倍 したのが まちがい`],
    why: '1m² は 1辺 100cm の 正方形。100 × 100 ＝ 10000cm²。',
    answer: k * 10000, unit: 'cm²', answerPrompt: `正しくは ${k}m² ＝ 何cm²？`,
    hints: ['1m² は 1辺が 1m（100cm）の 正方形の 面積。', '100 × 100', '1m² ＝ 10000cm²'],
    diagnose: (x) => (same(x, k * 10000) ? null : same(x, k * 100) ? 'Aさんと 同じだよ。' : null),
    summary: `1m² ＝ 10000cm² だから、${k}m² ＝ ${k * 10000}cm²。`, q: `${k}m²＝□cm²`,
  });
}

export function genEhHalf(): Question {
  for (;;) {
    const n = rnd(4, 9), halves = pick([2, 4]);
    const base = polyomino(n, 1, 1, GRID_COLS - 2, GRID_ROWS - 1);
    const cells = addHalves(base, halves, 0, 0, GRID_COLS, GRID_ROWS);
    if (!cells) continue;
    const area = n + halves / 2, wrong = n + halves;
    return ehQuestion({
      skillId: 'eh-half', title: 'ななめの 三角を 1と 数えた',
      text: '1マスは 1辺が 1cmの 正方形です。下の 形の 面積を 求めます。',
      figure: { type: 'grid', cols: GRID_COLS, rows: GRID_ROWS, shapes: [{ cells, name: '', color: SHAPE_COLORS[3] }], showUnit: true },
      says: [`色の ついた マスを 数えると ${wrong}こ`, `答え ${wrong}cm²`],
      part: ['ななめ半分の 三角も 1cm² と 数えた', 'はしの マスを 1つ 数えわすれた', '面積の 単位を cm と 書いてしまった'],
      why: `ななめ半分の 三角は 2つで 1cm²。全部の マス ${n}こ ＋ 三角 ${halves}こで ${halves / 2}cm²。`,
      answer: area, unit: 'cm²', answerPrompt: '正しい 面積は？',
      hints: ['全部の マスと、半分の 三角を 分けて 数えよう。', '半分の 三角 2つで 1cm²。', `全部の マスは ${n}こ。`],
      diagnose: (x) => (same(x, area) ? null : same(x, wrong) ? 'Aさんと 同じだよ。三角は 2つで 1cm²。' : null),
      summary: `${n} ＋ ${halves / 2} ＝ ${area}cm²。`, figArea: area, q: '方眼の形（ななめ半分の三角をふくむ）の面積',
    });
  }
}

export function genEhComp(): Question {
  for (;;) {
    const L = makeL();
    const { W, H, nw, nh } = L;
    const u = unitPick();
    const area = W * H - nw * nh;
    const wrong = H * (W - nw) + H * nw;
    if (wrong === area) continue;
    return ehQuestion({
      skillId: 'eh-comp', title: '分けた 長さを 読みまちがえた',
      text: '下の 形を、点線で 2つの 長方形に 分けて 面積を 求めます。',
      figure: { type: 'shape', polys: [{ pts: L.pts, role: 'main' }, polyLabel(L.vParts[0], 'あ'), polyLabel(L.vParts[1], 'い')], dims: edgeDims(L.pts, u) },
      says: [`あ ${H}×${W - nw}＝${H * (W - nw)}`, `い ${H}×${nw}＝${H * nw}`, `${H * (W - nw)}＋${H * nw}＝${wrong}　答え ${wrong}${u}²`],
      part: [`い の たてを ${H}${u} に した`, 'あ の 面積を 求める 式が まちがい', 'あ と い の 面積を たした こと が まちがい'],
      why: `い の たては ${H} － ${nh} ＝ ${H - nh}${u}。い ＝ ${H - nh} × ${nw} ＝ ${(H - nh) * nw}。`,
      answer: area, unit: `${u}²`, answerPrompt: '正しい 面積は？',
      hints: ['い の たての 長さを 図から 読もう。', `全体の たて ${H}${u} から、へこんだ ぶん ${nh}${u} を ひく。`, `${H * (W - nw)} ＋ ${H - nh} × ${nw}`],
      diagnose: (x) => (same(x, area) ? null : same(x, wrong) ? 'Aさんと 同じだよ。い の たてを 見なおそう。' : null),
      summary: `あ ${H * (W - nw)} ＋ い ${(H - nh) * nw} ＝ ${area}${u}²。`, figArea: area, q: `L字形の面積（全体${W}×${H}、かけた部分${nw}×${nh}）`,
    });
  }
}

export function genEhAha(): Question {
  const v = pick(['a', 'ha', 'ha2'] as const);
  if (v === 'a') {
    const k = rnd(2, 90);
    return ehQuestion({
      skillId: 'eh-aha', title: '1a＝10m² と 思った',
      text: `${k * 100}m² は 何a か 考えます。`,
      says: ['1辺が 10m だから 1a ＝ 10m²', `${k * 100}m² ＝ ${k * 10}a`],
      part: ['1a を 10m² と 考えた', '1a は 1辺 10m の 正方形 と したのが まちがい', 'わり算を した のが まちがい'],
      why: '1a は 1辺 10m の 正方形。10 × 10 ＝ 100m²。',
      answer: k, unit: 'a', answerPrompt: `正しくは ${k * 100}m² ＝ 何a？`,
      hints: ['1a ＝ 10m × 10m。', '1a ＝ 100m²。', `${k * 100} ÷ 100`],
      diagnose: (x) => (same(x, k) ? null : same(x, k * 10) ? 'Aさんと 同じだよ。' : null),
      summary: `1a ＝ 100m² だから、${k * 100}m² ＝ ${k}a。`, q: `${k * 100}m²＝□a`,
    });
  }
  if (v === 'ha') {
    const k = rnd(2, 60);
    return ehQuestion({
      skillId: 'eh-aha', title: '1ha＝100m² と 思った',
      text: `${k}ha は 何m² か 考えます。`,
      says: ['1ha は 1辺 100m だから 1ha ＝ 100m²', `${k}ha ＝ ${k * 100}m²`],
      part: ['1ha を 100m² と 考えた', '1ha は 1辺 100m の 正方形 と したのが まちがい', `${k}倍 した のが まちがい`],
      why: '1ha は 1辺 100m の 正方形。100 × 100 ＝ 10000m²。',
      answer: k * 10000, unit: 'm²', answerPrompt: `正しくは ${k}ha ＝ 何m²？`,
      hints: ['1ha ＝ 100m × 100m。', '1ha ＝ 10000m²。', `${k} × 10000`],
      diagnose: (x) => (same(x, k * 10000) ? null : same(x, k * 100) ? 'Aさんと 同じだよ。' : null),
      summary: `1ha ＝ 10000m² だから、${k}ha ＝ ${k * 10000}m²。`, q: `${k}ha＝□m²`,
    });
  }
  const k = rnd(2, 40);
  return ehQuestion({
    skillId: 'eh-aha', title: '1ha＝10a と 思った',
    text: `${k}ha は 何a か 考えます。`,
    says: ['100m は 10m の 10倍 だから 1ha ＝ 10a', `${k}ha ＝ ${k * 10}a`],
    part: ['1ha を 10a と 考えた', '100m は 10m の 10倍 と したのが まちがい', `${k}倍 した のが まちがい`],
    why: '1辺が 10倍 なら 面積は 10 × 10 ＝ 100倍。1ha ＝ 100a。',
    answer: k * 100, unit: 'a', answerPrompt: `正しくは ${k}ha ＝ 何a？`,
    hints: ['1辺 100m の 正方形に、1辺 10m の 正方形は いくつ 入る？', 'たてに 10こ、横に 10こ。', '1ha ＝ 100a'],
    diagnose: (x) => (same(x, k * 100) ? null : same(x, k * 10) ? 'Aさんと 同じだよ。' : null),
    summary: `1ha ＝ 100a だから、${k}ha ＝ ${k * 100}a。`, q: `${k}ha＝□a`,
  });
}

/* ================================================================== */
/* ディスパッチ表                                                        */
/* ================================================================== */

export const GENERATORS: Record<string, () => Question> = {
  'grid-count': genGridCount,
  'grid-half': genGridHalf,
  'grid-compare': genGridCompare,
  'grid-make': genGridMake,
  'formula-word': () => genFormulaWord(),
  'formula-rect': genFormulaRect,
  'formula-square': genFormulaSquare,
  'formula-unit': genFormulaUnit,
  'unit-m2': () => genUnitM2(),
  'unit-aha': () => genUnitAha(),
  'unit-choose': () => genUnitChoose(),
  'unit-convert': genUnitConvert,
  'unit-relation': genUnitRelation,
  'calc-km': () => genCalcKm(),
  'calc-mixunit': () => genCalcMixunit(),
  'calc-a': genCalcA,
  'calc-ha': genCalcHa,
  'side-find': genSideFind,
  'side-square': genSideSquare,
  'comp-split': genCompSplit,
  'comp-sub': genCompSub,
  'comp-which': genCompWhich,
  'comp-cshape': genCompCshape,
  'comp-road': genCompRoad,
  'change-table': () => genChangeTable(),
  'change-graph': () => genChangeGraph(),
  'change-max': genChangeMax,
  'eh-perim': genEhPerim,
  'eh-unit': genEhUnit,
  'eh-conv': genEhConv,
  'eh-half': genEhHalf,
  'eh-comp': genEhComp,
  'eh-aha': genEhAha,
};

export function generate(skillId: string): Question {
  const g = GENERATORS[skillId];
  if (!g) throw new Error(`generate: 知らない項目です (${skillId})`);
  return g();
}

/** 図の座標（検査用に公開） */
export type { Pt };
