// このファイルは単元アプリ syo4-tyokuhoutaitorippoutai の src/lib/problems.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 小4 算数「直方体と立方体」の問題ジェネレーター（純粋関数）。
 *
 * 単元の柱（東京書籍 新しい算数4下「14. 直方体と立方体」）
 *   ① 直方体・立方体の面・辺・頂点   … 面の形と数、等しい辺、ひごと ねん土玉、厚紙で箱  → kousei-*
 *   ② 面や辺の平行・垂直             … 面と面・辺と辺・面と辺                        → heiko-*
 *   ③ 展開図                         … なる/ならない・続きをかく・重なる点や辺・平行な面 → tenkai-*
 *   ④ 見取図                         … 見えない辺は点線・続きをかく                   → mitori-*
 *   ⑤ 位置の表し方                   … 平面（横・たて）・空間（横・たて・高さ）         → ichi-*
 *   ⑥ いかそう                       … リボンの長さ・リボンの線                       → katsuyo-*
 *   ⑦ まちがいさがし                 … 誤概念8つ                                      → eh-*
 *
 * 展開図の答え（続きの正しいかき方・重なる点や辺・向かい合う面）は、lib/solid.ts で
 * 組み立てを計算して出す（手で書いた対応表は使わない）。
 * 記録の名前（skillId）はレベルIDと同じ文字列にする（カタログの skill_id と一致させるため）。
 */
import type { Question, Step, ChoiceStep, NumStep, MultiStep, EdgesStep, Figure, LabeledPt } from './question';
import { rnd, pick, shuffle } from './question';
import {
  randomNet, completions, randomHexomino, isCubeNet, boundaryPoints, oppositeFace, netBounds, normalizeNet, netLines,
  baseFace, step as foldStep, cellsOf,
  EDGES, FACES, edgeName, parallelEdges, perpendicularEdges, edgesPerpToFace, edgesParallelToFace, edgesOnFace,
  oppositeOf, perpendicularFaces, hiddenEdges, vertexAt, VERTS, v3key,
  type Dims, type Net, type FaceId, type VName, type Seg, type Pt, type Rect, type FaceState,
} from './solid';

/* ================================================================== */
/* 共通の部品                                                            */
/* ================================================================== */

const KATA = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ'.split('');
const HIRA = ['あ', 'い', 'う', 'え', 'お', 'か'];

const FACE_JP: Record<FaceId, string> = { top: '上', bottom: '下', front: '前', back: 'うしろ', right: '右', left: '左' };
const faceName = (id: FaceId): string => `面${(FACES.find((f) => f.id === id) as (typeof FACES)[number]).name}`;

/** 直方体の大きさ。distinct＝3つともちがう、square＝2つが同じ（正方形の面がある） */
function cuboidDims(kind: 'distinct' | 'square' | 'any' = 'any'): Dims {
  const k = kind === 'any' ? (Math.random() < 0.8 ? 'distinct' : 'square') : kind;
  for (;;) {
    const L = rnd(3, 9), W = rnd(2, 8), H = rnd(2, 8);
    if (k === 'distinct' && new Set([L, W, H]).size === 3) return [L, W, H];
    if (k === 'square' && L !== W && W === H) return [L, W, H];
  }
}
const pickView = (): 'right' | 'left' => (Math.random() < 0.5 ? 'right' : 'left');

/** 選ぶ問題を作る（正解の位置はまぜる） */
function choice(o: {
  label: string; prompt: string; correct: string; wrongs: { text: string; note: string }[]; why: string; hints: string[];
}): ChoiceStep {
  const all = shuffle([{ text: o.correct, note: null as string | null }, ...o.wrongs.map((w) => ({ text: w.text, note: w.note as string | null }))]);
  return {
    kind: 'choice', label: o.label, prompt: o.prompt,
    choices: all.map((x) => x.text), correct: all.findIndex((x) => x.text === o.correct),
    wrong: all.map((x) => x.note), why: o.why, hints: o.hints,
  };
}

function num(o: Omit<NumStep, 'kind'>): NumStep { return { kind: 'num', ...o }; }

/** 辺をえらぶ問題（12本から） */
function edgeMulti(o: { label: string; prompt: string; correct: string[]; why: string; hints: string[]; exclude?: string[]; diagnose?: (picked: string[]) => string | null }): MultiStep {
  const options = EDGES.map(edgeName).filter((n) => !(o.exclude ?? []).includes(n)).map((n) => `辺${n}`);
  const correct = o.correct.map((c) => options.indexOf(`辺${c}`));
  return {
    kind: 'multi', label: o.label, prompt: o.prompt, options, correct, why: o.why, hints: o.hints,
    diagnose: o.diagnose ? (p) => o.diagnose!(p.map((i) => (options[i] as string).slice(1))) : undefined,
  };
}

/** 辺の名前は、文字を並べかえても同じ辺（EH と HE）。小さい順にそろえた形にする */
export const canonEdge = (n: string): string => [...n].sort().join('');
const EDGE_STYLE = new Map(EDGES.map((e) => [canonEdge(edgeName(e)), edgeName(e)]));

/**
 * 辺を、頂点の文字を2つタップして組み立てて答える問い。
 * 足場（scaffold）に、いまの「12本から全部えらぶ」形を持たせる（練習で2回まちがえたら出す）。
 */
function edgeBuild(o: Parameters<typeof edgeMulti>[0]): EdgesStep {
  return {
    kind: 'edges', label: o.label, prompt: o.prompt, hints: o.hints,
    letters: [...VERTS], edges: EDGES.map((e) => canonEdge(edgeName(e))), correct: o.correct.map(canonEdge),
    diagnose: o.diagnose ? (p) => o.diagnose!(p.map((c) => EDGE_STYLE.get(c) ?? c)) : undefined,
    scaffold: edgeMulti(o),
  };
}

/** 組み立てる形を、「えらぶ」形（足場）にもどす。ボス戦はこちらを使う（ボス戦は変えない決まり） */
export function toPickForm(q: Question): Question {
  return { ...q, steps: q.steps.map((s) => (s.kind === 'edges' ? s.scaffold : s)) };
}

const cuboidFig = (dims: Dims, view: 'right' | 'left', extra: Partial<Extract<Figure, { type: 'cuboid' }>> = {}): Figure =>
  ({ type: 'cuboid', dims, view, ...extra });

/* ================================================================== */
/* ① 面・辺・頂点                                                        */
/* ================================================================== */

export type CubePart = 'shape' | 'face' | 'edge' | 'vertex' | 'all';

export function genKouseiCube(part: CubePart = 'all'): Question {
  const a = rnd(1, 12);
  const view = pickView();
  const shape = choice({
    label: '面の形', prompt: 'どんな形の面で かこまれて いますか。', correct: '正方形',
    wrongs: [
      { text: '長方形', note: '立方体の面は、4つの辺の長さが みんな 同じだよ。' },
      { text: '三角形', note: '面の 辺の数を 数えてみよう。' },
      { text: 'ひし形', note: '面の 角は みんな 直角だよ。' },
    ],
    why: '立方体は、正方形だけで かこまれた 形。6つの 面は みんな 同じ 大きさの 正方形だよ。',
    hints: ['1つの 面の 辺の 長さを くらべよう。', '角は みんな 直角。辺の 長さは みんな 同じ。', '辺の長さが ぜんぶ 同じで、角が 直角の 四角形は？'],
  });
  const face = num({
    label: '面', prompt: '面は いくつ ありますか。', answer: 6, unit: 'つ',
    hints: ['見えて いる 面は 3つ。うしろ・下・横にも 面が あるよ。', 'さいころを 思い出そう。目は 1〜何まで ある？', '上と下、前とうしろ、右と左。'],
    diagnose: (v) => (v === 3 ? '見えて いる 面は 3つ。見えない うしろ・下・横の 面も 数えよう。' : null),
  });
  const edge = num({
    label: '辺', prompt: '辺は いくつ ありますか。', answer: 12, unit: '',
    hints: ['見えない 辺（点線の 辺）も 数えよう。', '上の 面の まわりに 4本、下の 面の まわりに 4本。', '上と下を つなぐ たての 辺も 4本。'],
    diagnose: (v) => (v === 9 ? '見えて いる 辺だけ 数えて いないかな？ 見えない 辺（点線）も 数えよう。' : v === 8 ? '上と下の 面の まわりだけで なく、たての 辺も あるよ。' : v === 6 ? 'それは 面の 数。辺は 面と 面の さかいめの 線だよ。' : null),
  });
  const vertex = num({
    label: '頂点', prompt: '頂点は いくつ ありますか。', answer: 8, unit: 'つ',
    hints: ['頂点は、辺と 辺が 集まる 角の 点。', '上の 面に 4つ、下の 面に 4つ。', '見えない 頂点も 1つ あるよ。'],
    diagnose: (v) => (v === 7 ? '見えない 頂点（かくれて いる 角）も 数えよう。' : v === 4 ? '上の 面の 角だけで なく、下の 面の 角も あるよ。' : null),
  });
  const steps: Step[] = part === 'all' ? [shape, face, edge, vertex] : [{ shape, face, edge, vertex }[part]];
  return {
    skillId: 'kousei-cube', title: '立方体の 面・辺・頂点', emoji: '🎲',
    text: `下の 立方体（1辺 ${a}cm）に ついて 答えましょう。`,
    figure: cuboidFig([a, a, a], view, { dimLabels: true }),
    steps,
    summary: '立方体は 正方形 6つで かこまれた 形。面 6つ・辺 12・頂点 8つ。',
    label: `立方体（1辺${a}cm）`, q: `立方体の ${part === 'all' ? '面の形・面・辺・頂点の数' : steps[0]!.label}`, a: part === 'shape' ? '正方形' : part === 'face' ? '6つ' : part === 'edge' ? '12' : part === 'vertex' ? '8つ' : '正方形・6・12・8',
  };
}

export type CuboidPart = 'faces' | 'edges' | 'all';

export function genKouseiCuboid(part: CuboidPart = 'all'): Question {
  const p = part === 'all' ? (Math.random() < 0.5 ? 'faces' : 'edges') : part;
  const dims = p === 'edges' ? cuboidDims('distinct') : cuboidDims('any');
  const [L, W, H] = dims;
  const view = pickView();
  const fig = cuboidFig(dims, view, { dimLabels: true });
  const intro = `下の 直方体（横 ${L}cm、たて ${W}cm、高さ ${H}cm）に ついて 答えましょう。`;
  if (p === 'faces') {
    const pairs: [number, number][] = [[W, L], [H, L], [H, W]];
    const [a, b] = pick(pairs);
    const count = pairs.filter(([x, y]) => (x === a && y === b) || (x === b && y === a)).length * 2;
    const prompt = a === b ? `1辺 ${a}cm の 正方形の 面は いくつ ありますか。` : `たて ${a}cm、横 ${b}cm の 長方形の 面は いくつ ありますか。`;
    return {
      skillId: 'kousei-cuboid', title: '直方体の 面', emoji: '📦', text: intro, figure: fig,
      steps: [num({
        label: '面の数', prompt, answer: count, unit: 'つ',
        hints: ['向かい合う 面は、同じ 形・同じ 大きさ。', `${a}cm と ${b}cm の 辺で かこまれた 面を、見えない 面も ふくめて さがそう。`, '前と うしろ、上と 下、右と 左 が 同じ 形だよ。'],
        diagnose: (v) => (v === count / 2 ? '向かい合う 面も 同じ 形だよ。見えない 面も 数えよう。' : null),
      })],
      summary: `直方体の 向かい合う 面は 同じ 形。${a === b ? `正方形の 面は ${count}つ` : `たて${a}cm・横${b}cm の 面は ${count}つ`}。`,
      label: `直方体 ${L}×${W}×${H} の面`, q: prompt.replace('ありますか。', ''), a: `${count}つ`,
    };
  }
  return {
    skillId: 'kousei-cuboid', title: '直方体の 等しい辺', emoji: '📦', text: intro, figure: fig,
    steps: [
      num({
        label: 'いくつずつ', prompt: '長さの 等しい 辺は、いくつずつ ありますか。', answer: 4, unit: 'つずつ',
        hints: [`${L}cm の 辺を、見えない 辺も ふくめて 数えよう。`, '同じ 向きの 辺は、同じ 長さ。', '上の 面に 2本、下の 面に 2本。'],
        diagnose: (v) => (v === 2 ? '見えない 辺や、下の 面の 辺も 数えよう。同じ 向きの 辺は 何本 ある？' : v === 3 ? 'それは 組の 数かな？ 1つの 長さの 辺が 何本 あるかを 答えよう。' : null),
      }),
      num({
        label: '何組', prompt: '長さの 等しい 辺は、何組 ありますか。', answer: 3, unit: '組',
        hints: ['辺の 長さは 何種類 ある？', `${L}cm・${W}cm・${H}cm。`, '長さが 3種類だから…'],
        diagnose: (v) => (v === 4 ? 'それは 1組の 辺の 数。長さの 種類が いくつ あるかを 数えよう。' : null),
      }),
    ],
    summary: `${L}cm・${W}cm・${H}cm の 辺が 4本ずつ、3組 ある（4×3＝12本）。`,
    label: `直方体 ${L}×${W}×${H} の辺`, q: '長さの等しい辺は いくつずつ何組', a: '4つずつ 3組',
  };
}

export function genKouseiHigo(): Question {
  const cube = Math.random() < 0.25;
  const dims: Dims = cube ? (() => { const a = rnd(3, 12); return [a, a, a] as Dims; })() : cuboidDims('distinct');
  const [L, W, H] = dims;
  const view = pickView();
  const steps: Step[] = cube
    ? [num({
        label: `${L}cmのひご`, prompt: `${L}cm の ひごは 何本 いりますか。`, answer: 12, unit: '本',
        hints: ['立方体は、辺が みんな 同じ 長さ。', 'ひご 1本が 辺 1本。', '辺の 数は いくつ？'],
        diagnose: (v) => (v === 9 ? '見えない 辺の ぶんも ひごが いるよ。' : null),
      })]
    : [L, W, H].map((d, i) => num({
        label: `${d}cmのひご`, prompt: `${d}cm の ひごは 何本 いりますか。`, answer: 4, unit: '本',
        hints: ['ひご 1本が 辺 1本。', `${d}cm の 辺は、同じ 向きに ならんで いるよ。`, i === 0 ? '上の 面に 2本、下の 面に 2本。' : '見えない 辺も 数えよう。'],
        diagnose: (v) => (v === 2 ? '見えない 辺や 下の 面の 辺の ぶんも いるよ。' : v === 3 ? '見えない 辺の ぶんも 1本 いるよ。' : null),
      }));
  steps.push(num({
    label: 'ねん土玉', prompt: 'ねん土玉は いくつ いりますか。', answer: 8, unit: 'こ',
    hints: ['ねん土玉は、ひごと ひごを つなぐ 角（頂点）に つける。', '頂点の 数を 数えよう。', '上に 4つ、下に 4つ。'],
    diagnose: (v) => (v === 7 ? '見えない 頂点にも ねん土玉が いるよ。' : v === 12 ? 'それは ひごの 本数。ねん土玉は 頂点の 数だよ。' : null),
  }));
  return {
    skillId: 'kousei-higo', title: 'ひごと ねん土玉で 作る', emoji: '🥢',
    text: `ひごと ねん土玉で、${cube ? `1辺 ${L}cm の 立方体` : `横 ${L}cm、たて ${W}cm、高さ ${H}cm の 直方体`}の 形を 作ります。`,
    figure: cuboidFig(dims, view, { dimLabels: true }),
    steps,
    summary: cube ? `ひごは 辺の数で 12本、ねん土玉は 頂点の数で 8こ。` : `${L}cm・${W}cm・${H}cm の ひごが 4本ずつ、ねん土玉は 頂点の 数の 8こ。`,
    label: cube ? `立方体${L}cm を ひごで` : `直方体 ${L}×${W}×${H} を ひごで`,
    q: 'ひごの本数と ねん土玉の数', a: cube ? '12本・8こ' : '4本ずつ・8こ',
  };
}

export type PaperVariant = 'abc' | 'square' | 'any';

/** 紙のテスト 大問9: 厚紙を何まいずつ使って直方体を作るか */
export function genKouseiPaper(variant: PaperVariant = 'any'): Question {
  const v = variant === 'any' ? (Math.random() < 0.5 ? 'abc' : 'square') : variant;
  const nums = shuffle([4, 5, 6, 7, 8, 9, 10]).slice(0, 3).sort((x, y) => x - y);
  const [a, b, c] = nums as [number, number, number];
  // 紙のテストと同じ組: (a×c) (c×c) (a×b) (b×c)。並び（あいうえ）はまぜる
  const kinds = shuffle([
    { key: 'ac', w: a, h: c }, { key: 'cc', w: c, h: c }, { key: 'ab', w: a, h: b }, { key: 'bc', w: b, h: c },
  ]).map((k) => (Math.random() < 0.5 ? k : { ...k, w: k.h, h: k.w }));
  const lab: Record<string, string> = {};
  kinds.forEach((k, i) => { lab[k.key] = HIRA[i] as string; });
  const cards = kinds.map((k) => ({ label: lab[k.key] as string, w: k.w, h: k.h }));
  const sz = (key: string) => { const k = kinds.find((x) => x.key === key)!; return `${k.w}cm×${k.h}cm`; };
  let given: string, answerKey: string;
  if (v === 'abc') {
    const order = shuffle(['ac', 'ab', 'bc']);
    given = `${lab[order[0]!]}の あつ紙を 2まい、${lab[order[1]!]}の あつ紙を 2まい 使うと`;
    answerKey = order[2]!;
  } else {
    const four = pick(['ac', 'bc']);
    given = `${lab[four]}の あつ紙を 4まい 使うと`;
    answerKey = 'cc';
  }
  const ans = lab[answerKey] as string;
  const wrongs = kinds.filter((k) => k.key !== answerKey).map((k) => ({
    text: lab[k.key] as string,
    note: v === 'abc' && k.key === 'cc' ? `${sz('cc')} の 正方形の 面は、この 直方体には ないよ。辺の 長さを たしかめよう。`
      : v === 'square' && k.key !== 'cc' ? `その 形を 足すと、辺の 長さが 合わない ところが できるよ。のこりの 2つの 面の 辺の 長さを 考えよう。`
        : 'その あつ紙は もう 使って いるよ。のこりの 面の 形を 考えよう。',
  }));
  return {
    skillId: 'kousei-paper', title: 'あつ紙で 直方体を 作る', emoji: '🟩',
    text: `下の 図のような あつ紙を 何まいかずつ 使って、直方体を 作ります。\n${given}、あと、どの あつ紙を 何まい 使えば よいですか。`,
    figure: { type: 'cards', cards },
    steps: [
      choice({
        label: 'あつ紙', prompt: 'どの あつ紙を 使えば よいですか。', correct: ans, wrongs,
        why: v === 'abc' ? '直方体は、同じ 形の 面が 2まいずつ 3組。のこりの 1組は、使って いない 2つの 長さで できる 面だよ。'
          : '同じ 長方形が 4まいなら、のこりの 2まいは、長方形の 長い ほう（または 同じ長さ）の 辺で できる 正方形に なるよ。',
        hints: ['直方体の 面は、向かい合う 面が 同じ 形。', 'のこりの 面の 辺は、もう 使った 面の 辺と くっつくよ。辺の 長さを くらべよう。', v === 'abc' ? `${a}cm・${b}cm・${c}cm の 3つの 長さで、まだ 使って いない 組み合わせは？` : '箱の 両はしの 面は どんな 形？'],
      }),
      num({
        label: 'まい数', prompt: `${ans}の あつ紙を 何まい 使えば よいですか。`, answer: 2, unit: 'まい',
        hints: ['面は ぜんぶで 6まい。', 'もう 4まい 使って いるよ。', '向かい合う 2つの 面。'],
        diagnose: (x) => (x === 1 ? '向かい合う 面が あるので、同じ 形が 2まい いるよ。' : x === 4 ? '面は ぜんぶで 6まい。もう 4まい 使って いるよ。' : null),
      }),
    ],
    summary: `${ans}（${sz(answerKey)}）を 2まい。直方体は 同じ形の面が 2まいずつ。`,
    label: `あつ紙 ${a}・${b}・${c}cm`, q: `${given}、あとどのあつ紙を何まい`, a: `${ans}を2まい`,
  };
}

export function genKouseiSort(): Question {
  const r = Math.random();
  const dims: Dims = r < 0.4 ? (() => { const a = rnd(2, 9); return [a, a, a] as Dims; })() : cuboidDims(r < 0.6 ? 'square' : 'distinct');
  const isCube = dims[0] === dims[1] && dims[1] === dims[2];
  const ask = pick(['面', '辺', '頂点'] as const);
  const ans = { 面: 6, 辺: 12, 頂点: 8 }[ask];
  const what = isCube ? '立方体' : '直方体';
  return {
    skillId: 'kousei-sort', title: '直方体と 立方体', emoji: '🧊',
    text: `下の 形（${dims[0]}cm、${dims[1]}cm、${dims[2]}cm）に ついて 答えましょう。`,
    figure: cuboidFig(dims, pickView(), { dimLabels: true }),
    steps: [
      choice({
        label: '名前', prompt: 'この 形を 何と いいますか。', correct: what,
        wrongs: [{ text: isCube ? '直方体' : '立方体', note: isCube ? '正方形だけで かこまれた 形は、とくべつな 名前が あるよ。' : '長方形が ある（辺の 長さが ちがう）ね。正方形だけで かこまれて いるかな？' }],
        why: isCube ? '正方形だけで かこまれた 形を 立方体と いう。' : '長方形だけ、または 長方形と 正方形で かこまれた 形を 直方体と いう。',
        hints: ['面の 形を 見よう。', '辺の 長さは みんな 同じ？', '正方形だけ → 立方体、長方形が ある → 直方体。'],
      }),
      num({
        label: `${ask}の数`, prompt: `${ask}は いくつ ありますか。`, answer: ans, unit: ask === '辺' ? '' : 'つ',
        hints: ['見えない ところも 数えよう。', ask === '面' ? '上・下・前・うしろ・右・左。' : ask === '辺' ? '上の 面に 4本、下の 面に 4本、たてに 4本。' : '上に 4つ、下に 4つ。', `直方体も 立方体も、${ask}の 数は 同じ。`],
        diagnose: (v) => ((ask === '面' && v === 3) || (ask === '辺' && v === 9) || (ask === '頂点' && v === 7) ? '見えない ところも 数えよう。' : null),
      }),
    ],
    summary: `${what}。直方体も 立方体も 面 6・辺 12・頂点 8。`,
    label: `${what}の 見分け`, q: `${dims.join('cm,')}cm の形の名前と${ask}の数`, a: `${what}・${ans}`,
  };
}

/* ================================================================== */
/* ② 平行・垂直                                                          */
/* ================================================================== */

export type FacePart = 'par' | 'perp' | 'all';

/** 面と面の平行・垂直（紙のテスト 大問3 ①②） */
export function genHeikoFace(part: FacePart = 'all'): Question {
  const p = part === 'all' ? pick(['par', 'parName', 'perp'] as const) : part;
  const dims = cuboidDims('distinct');
  const view = pickView();
  // 記号をつける面は、図の上で記号どうしが重ならない組にする（前とうしろの面は中心が近いので、両方には つけない）
  const T: FaceId = p === 'parName' ? pick(FACES).id : pick(['top', 'bottom', 'left', 'right'] as FaceId[]);
  const O = oppositeOf(T);
  const J = pick(perpendicularFaces(T).filter((f) => f !== 'back'));
  const labs = shuffle(['あ', 'い', 'う']);
  const [lt, lo, lj] = labs as [string, string, string];
  if (p === 'par') {
    const opts = shuffle([lo, lj]);
    return {
      skillId: 'heiko-face', title: '面と面の 平行', emoji: '🧱',
      text: '下の 直方体に ついて 答えましょう。',
      figure: cuboidFig(dims, view, { letters: true, faceLabels: { [T]: lt, [O]: lo, [J]: lj } }),
      steps: [choice({
        label: '平行な面', prompt: `面${lt}に 平行な 面は、面${opts[0]}、面${opts[1]}の どちらですか。`, correct: `面${lo}`,
        wrongs: [{ text: `面${lj}`, note: `面${lj}は 面${lt}と 直角に 交わるよ。平行な 面は、向かい合って 交わらない 面。` }],
        why: '直方体で 向かい合う 面は 平行。どこまで 広げても 交わらないよ。',
        hints: ['平行な 面は、交わらない 面。', `面${lt}と 向かい合って いる 面は どれ？`, `面${lt}と となり合う 面は 垂直に 交わるよ。`],
      })],
      summary: `面${lt}と 面${lo}は 向かい合う 面なので 平行。`,
      label: `面${lt}に平行な面`, q: `面${lt}に平行な面`, a: `面${lo}`,
    };
  }
  if (p === 'parName') {
    const others = shuffle(perpendicularFaces(T)).slice(0, 3);
    return {
      skillId: 'heiko-face', title: '面と面の 平行', emoji: '🧱',
      text: '下の 直方体に ついて 答えましょう。',
      figure: cuboidFig(dims, view, { letters: true, shadeFace: T }),
      steps: [choice({
        label: '平行な面', prompt: `${faceName(T)}（色の ついた 面）に 平行な 面は どれですか。`, correct: faceName(O),
        wrongs: others.map((x) => ({ text: faceName(x), note: `${faceName(x)}は ${faceName(T)}と 辺で つながって、直角に 交わるよ。` })),
        why: `${faceName(T)}と 向かい合う ${faceName(O)}は 平行。`,
        hints: ['平行な 面は 交わらない 面。', `${faceName(T)}と 頂点を 1つも 共有しない 面を さがそう。`, `${FACE_JP[T]}の 面と 向かい合うのは ${FACE_JP[O]}の 面。`],
      })],
      summary: `${faceName(T)}に 平行なのは ${faceName(O)}。`,
      label: `${faceName(T)}に平行な面`, q: `${faceName(T)}に平行な面`, a: faceName(O),
    };
  }
  return {
    skillId: 'heiko-face', title: '面と面の 垂直', emoji: '🧱',
    text: '下の 直方体に ついて 答えましょう。',
    figure: cuboidFig(dims, view, { letters: true, faceLabels: { [T]: lt, [O]: lo, [J]: lj } }),
    steps: [num({
      label: '垂直な面', prompt: `面${lt}に 垂直な 面は、全部で いくつ ありますか。`, answer: 4, unit: 'つ',
      hints: ['面と 面が 直角に 交わって いたら 垂直。', `面${lt}と となり合う 面を 数えよう。見えない 面も。`, '6つの 面から、自分と 向かい合う 面を のぞくと…'],
      diagnose: (v) => (v === 5 ? '向かい合う 面は 平行。垂直では ないよ。' : v === 2 || v === 3 ? '見えない 面も 数えよう。' : v === 1 ? 'それは 平行な 面の 数かな？' : null),
    })],
    summary: `面${lt}と となり合う 4つの 面が 垂直（向かい合う 面${lo}は 平行）。`,
    label: `面${lt}に垂直な面`, q: `面${lt}に垂直な面の数`, a: '4つ',
  };
}

/** 辺と辺の平行（紙のテスト 大問3 ③） */
export function genHeikoEdge(): Question {
  const e = pick(EDGES);
  const name = edgeName(e);
  const par = parallelEdges(e).map(edgeName);
  return {
    skillId: 'heiko-edge', title: '辺と辺の 平行', emoji: '📏',
    text: `下の 直方体で、辺${name}に 平行な 辺を 全部 書きましょう。`,
    figure: cuboidFig(cuboidDims('distinct'), pickView(), { letters: true, highlight: [name] }),
    steps: [edgeBuild({
      label: '平行な辺', prompt: `辺${name}に 平行な 辺（全部）`, correct: par, exclude: [name],
      why: `辺${name}と 同じ 向きの 辺は 平行。直方体では、1本の 辺に 平行な 辺が 3本 あるよ。`,
      hints: ['平行な 辺は、同じ 向きで 交わらない 辺。', `辺${name}と 同じ 向きの 辺を、見えない 辺も ふくめて さがそう。`, '同じ 面の 向かいの 辺だけで なく、はなれた ところにも あるよ（全部で 3本）。'],
      diagnose: (p) => {
        if (p.some((x) => canonEdge(x) === canonEdge(name))) return `辺${name}じしんは 入れないよ。辺${name}に 平行な 辺を さがそう。`;
        if (p.some((x) => perpendicularEdges(e).map(edgeName).includes(x))) return `垂直と 平行を とりちがえて いないかな。辺${name}と 交わる 辺は 平行では ないよ。`;
        if (p.some((x) => !par.includes(x))) return `辺${name}と 平行な 辺は、同じ 向きで むかい合って いる 辺だよ。交わらない 辺でも、向きが ちがうと 平行では ないよ。`;
        return null;
      },
    })],
    summary: `辺${name}に 平行な 辺は ${par.map((x) => `辺${x}`).join('・')}。`,
    label: `辺${name}に平行な辺`, q: `辺${name}に平行な辺を全部`, a: par.map((x) => `辺${x}`).join('、'),
  };
}

/** 辺と辺の垂直 */
export function genHeikoEdgePerp(): Question {
  const e = pick(EDGES);
  const name = edgeName(e);
  const per = perpendicularEdges(e).map(edgeName);
  const par = parallelEdges(e).map(edgeName);
  return {
    skillId: 'heiko-edgeperp', title: '辺と辺の 垂直', emoji: '📐',
    text: `下の 直方体で、辺${name}に 垂直な 辺を 全部 書きましょう。`,
    figure: cuboidFig(cuboidDims('distinct'), pickView(), { letters: true, highlight: [name] }),
    steps: [edgeBuild({
      label: '垂直な辺', prompt: `辺${name}に 垂直な 辺（全部）`, correct: per, exclude: [name],
      why: `辺${name}と 直角に 交わる 辺が 垂直。両はしの 頂点${e[0]}・${e[1]}から 2本ずつで 4本。`,
      hints: ['垂直な 辺は、直角に 交わる 辺。', `頂点${e[0]}に 集まる 辺と、頂点${e[1]}に 集まる 辺を 見よう。`, `頂点${e[0]}から 2本、頂点${e[1]}から 2本。`],
      diagnose: (p) => {
        if (p.some((x) => par.includes(x))) return '平行な 辺が まじって いるよ。垂直な 辺は 交わる 辺だよ。';
        if (p.some((x) => !per.includes(x))) return `辺${name}と 交わらない 辺は、垂直とは いわないよ。辺${name}と 直角に 交わる 辺を さがそう。`;
        return null;
      },
    })],
    summary: `辺${name}に 垂直な 辺は ${per.map((x) => `辺${x}`).join('・')}。`,
    label: `辺${name}に垂直な辺`, q: `辺${name}に垂直な辺を全部`, a: per.map((x) => `辺${x}`).join('、'),
  };
}

/** 面と辺の平行・垂直（紙のテスト 大問3 ④） */
export function genHeikoFaceEdge(part: FacePart = 'all'): Question {
  const p = part === 'all' ? (Math.random() < 0.6 ? 'perp' : 'par') : part;
  const T = pick(FACES).id;
  const useLabel = Math.random() < 0.5;
  const fname = useLabel ? '面あ' : faceName(T);
  const ans = (p === 'perp' ? edgesPerpToFace(T) : edgesParallelToFace(T)).map(edgeName);
  const on = edgesOnFace(T).map(edgeName);
  const word = p === 'perp' ? '垂直' : '平行';
  return {
    skillId: 'heiko-faceedge', title: `面と辺の ${word}`, emoji: '📐',
    text: `下の 直方体で、${fname}に ${word}な 辺を 全部 書きましょう。`,
    figure: cuboidFig(cuboidDims('distinct'), pickView(), { letters: true, ...(useLabel ? { faceLabels: { [T]: 'あ' } } : {}), shadeFace: T }),
    steps: [edgeBuild({
      label: `${word}な辺`, prompt: `${fname}に ${word}な 辺（全部）`, correct: ans,
      why: p === 'perp' ? `${fname}に 直角に 交わる 辺（面から まっすぐ 出て いる 辺）が 垂直。4本 あるよ。` : `${fname}と 向かい合う 面の まわりの 4本の 辺は、${fname}と 交わらないので 平行。`,
      hints: p === 'perp'
        ? [`${fname}から まっすぐ 出て いる 辺を さがそう。`, `${fname}の 4つの 頂点から 1本ずつ 出て いるよ。`, `${fname}の 上に ある 辺は 数えないよ。`]
        : [`${fname}と 交わらない 辺を さがそう。`, `${fname}と 向かい合う 面の 辺を 見よう。`, `${fname}の 上に ある 辺は 数えないよ。`],
      diagnose: (pk) => {
        if (pk.some((x) => on.includes(x))) return `${fname}の 上に ある 辺が まじって いるよ。面の 上の 辺は、垂直でも 平行でも ないよ。`;
        const other = (p === 'perp' ? edgesParallelToFace(T) : edgesPerpToFace(T)).map(edgeName);
        if (pk.some((x) => other.includes(x))) return `垂直と 平行を とりちがえて いないかな。${word}な 辺は ${p === 'perp' ? '面から まっすぐ 出て いる 辺' : '面と 交わらない 辺'}だよ。`;
        return null;
      },
    })],
    summary: `${fname}に ${word}な 辺は ${ans.map((x) => `辺${x}`).join('・')}。`,
    label: `${fname}に${word}な辺`, q: `${fname}に${word}な辺を全部`, a: ans.map((x) => `辺${x}`).join('、'),
  };
}

/* ================================================================== */
/* ③ 展開図                                                              */
/* ================================================================== */

const netRects = (net: Net): Rect[] => net.faces.map((f) => f.rect);

export function genTenkaiCubeOk(): Question {
  const want = Math.random() < 0.5;
  let cells = randomHexomino();
  for (let t = 0; t < 400 && isCubeNet(cells) !== want; t++) cells = randomHexomino();
  const ok = isCubeNet(cells);
  return {
    skillId: 'tenkai-cubeok', title: '立方体の 展開図に なる？', emoji: '✂️',
    text: '下の 図を 組み立てると、立方体に なりますか。',
    figure: { type: 'net', rects: cells.map((c) => ({ x: c.x, y: c.y, w: 1, h: 1 })), grid: true },
    steps: [choice({
      label: 'なる？', prompt: '立方体に なりますか。', correct: ok ? 'なる' : 'ならない',
      wrongs: [{ text: ok ? 'ならない' : 'なる', note: ok ? '1つの 面を 底に して、まわりの 面を 順に 折り上げて みよう。重なる 面は ある？' : '頭の 中で 組み立てると、重なる 面が できて、どこかの 面が たりなく なるよ。' }],
      why: ok ? '6つの 面が 重ならずに、上・下・前・うしろ・右・左に 1つずつ くるので、立方体に なる。' : '組み立てると 2つの 面が 同じ ところに 重なり、ふたの ない ところが できる。6つの 正方形が つながって いても、展開図に なるとは かぎらない。',
      hints: ['どれか 1つの 面を 底に しよう。', '底の 面の となりの 面を 折り上げて、横の 面に しよう。', '横に 4つより 多く ならぶと 重なるよ。向かい合う 面が 1つずつ あるか たしかめよう。'],
    })],
    summary: ok ? '立方体の 展開図。向かい合う 面が 3組 そろう。' : '組み立てると 面が 重なるので、立方体の 展開図では ない。',
    label: '展開図に なる？', q: '組み立てると立方体になるか', a: ok ? 'なる' : 'ならない',
  };
}

/** 展開図の木から、葉の面を k まい はずす（のこりは つながったまま） */
function removeLeaves(net: Net, k: number): number[] {
  const alive = net.faces.map((_, i) => i);
  for (let r = 0; r < k; r++) {
    const leaves = alive.filter((i) => i !== 0 && !alive.some((j) => net.parent[j] === i));
    const pickLeaf = pick(leaves.length ? leaves : alive.filter((i) => i !== 0));
    alive.splice(alive.indexOf(pickLeaf), 1);
  }
  return alive;
}

function paintQuestion(o: { skillId: string; dims: Dims; missing: number; maxW: number; maxH: number; margin: number; isCube: boolean }): Question {
  for (let t = 0; t < 300; t++) {
    const raw = randomNet(o.dims);
    const b = netBounds(netRects(raw));
    const gw = b.w + o.margin * 2, gh = b.h + o.margin * 2;
    if (gw > o.maxW || gh > o.maxH) continue;
    const net = normalizeNet(raw, o.margin, o.margin);
    const keep = removeLeaves(net, o.missing);
    const given = keep.map((i) => net.faces[i] as FaceState);
    const answers = completions(o.dims, given, gw, gh);
    const lack = net.faces.filter((_, i) => !keep.includes(i)).map((f) => `横${f.rect.w}cm×たて${f.rect.h}cm`);
    const [L, W, H] = o.dims;
    const what = o.isCube ? `1辺 ${L}cm の 立方体` : `横 ${L}cm、たて ${W}cm、高さ ${H}cm の 直方体`;
    return {
      skillId: o.skillId, title: o.isCube ? '立方体の 展開図を かく' : '直方体の 展開図を かく', emoji: '✏️',
      text: `下の ${what}の 展開図の 続きを かきましょう。`,
      figure: cuboidFig(o.dims, pickView(), { dimLabels: true }),
      steps: [{
        kind: 'paint', label: '展開図', prompt: `方眼の マスを ぬって、たりない 面（あと ${o.missing}面）を かこう。`,
        dims: o.dims, gw, gh, given: given.map((f) => f.rect), answers, missing: o.missing, unitLabel: '1cm',
        hints: [
          '向かい合う 面は 同じ 形・同じ 大きさ。どの 面が まだ ないか 考えよう。',
          'となりの 面と くっつく 辺は、同じ 長さに なるよ。組み立てたとき 重ならない ところに 足そう。',
          `たりない 面は ${lack.join('、')}。`,
        ],
      }],
      summary: o.isCube ? '立方体の 展開図は 正方形 6つ。組み立てて 重ならない ように 面を 足す。' : '直方体の 展開図は、同じ 形の 長方形が 2まいずつ 3組。くっつく 辺の 長さを そろえる。',
      label: o.isCube ? `立方体${L}cmの展開図` : `直方体${L}×${W}×${H}の展開図`,
      q: `${what}の展開図の続き`, a: '（作図）',
    };
  }
  throw new Error('paintQuestion: 作れません');
}

export function genTenkaiCube(missing?: number): Question {
  return paintQuestion({ skillId: 'tenkai-cube', dims: [2, 2, 2], missing: missing ?? pick([2, 2, 3]), maxW: 13, maxH: 11, margin: 2, isCube: true });
}

const CUBOID_NET_DIMS: Dims[] = [[3, 2, 1], [4, 2, 1], [3, 1, 2], [2, 3, 1], [4, 1, 2], [3, 2, 2], [4, 3, 1], [2, 1, 3], [3, 1, 1], [4, 2, 2]];

export function genTenkaiCuboid(missing?: number): Question {
  return paintQuestion({ skillId: 'tenkai-cuboid', dims: pick(CUBOID_NET_DIMS), missing: missing ?? 2, maxW: 13, maxH: 12, margin: 2, isCube: false });
}

/** 立方体の展開図に、まわりの点の記号と面の記号をつける（紙のテスト 大問8 の形） */
function labeledCubeNet() {
  const net = randomNet([1, 1, 1]);
  const bp = boundaryPoints(net);
  const points: LabeledPt[] = bp.points.map((p, i) => ({ x: p.x, y: p.y, label: KATA[i] as string }));
  const faceLabels = shuffle(HIRA);
  return { net, bp, points, faceLabels };
}

export function genTenkaiPoint(): Question {
  const { net, bp, points, faceLabels } = labeledCubeNet();
  const partners = (i: number) => bp.points.map((p, j) => (j !== i && p.corner === bp.points[i]!.corner ? j : -1)).filter((j) => j >= 0);
  const cands = bp.points.map((_, i) => i).filter((i) => partners(i).length === 1);
  const i = pick(cands);
  const j = partners(i)[0] as number;
  const n = bp.points.length;
  const neighbors = [(i + 1) % n, (i + n - 1) % n].filter((k) => k !== j);
  const others = shuffle(bp.points.map((_, k) => k).filter((k) => k !== i && k !== j && !neighbors.includes(k)));
  const wrongIdx = [...neighbors, ...others].slice(0, 3);
  const P = (k: number) => `点${points[k]!.label}`;
  return {
    skillId: 'tenkai-point', title: '重なる 点', emoji: '🔺',
    text: `下の 立方体の 展開図を 組み立てます。\n${P(i)}と 重なる 点は どれですか。`,
    figure: { type: 'net', rects: netRects(net), points, faceLabels, highlightPoint: i },
    steps: [choice({
      label: '重なる点', prompt: `${P(i)}と 重なる 点`, correct: P(j),
      wrongs: wrongIdx.map((k) => ({ text: P(k), note: neighbors.includes(k) ? `${P(k)}は ${P(i)}と 同じ 辺の はしの 点。組み立てても はなれて いるよ。` : `頭の 中で 組み立てて、${P(i)}の ところに 集まる 点を さがそう。` })),
      why: `組み立てると、${P(i)}と ${P(j)}は 立方体の 同じ 頂点に 集まるよ。`,
      hints: [`${P(i)}を ふくむ 面を 底に して、となりの 面を 折り上げて みよう。`, '折ったとき くっつく 辺の はしの 点どうしが 重なる。', `${P(i)}が はしに ある 辺と くっつく 辺を さがそう。`],
    })],
    summary: `${P(i)}と ${P(j)}が 重なる。`,
    label: `${P(i)}と重なる点`, q: `${P(i)}と重なる点`, a: P(j),
  };
}

export function genTenkaiEdge(): Question {
  const { net, bp, points, faceLabels } = labeledCubeNet();
  const n = bp.edges.length;
  const k = Math.floor(Math.random() * n);
  const e = bp.edges[k]!;
  const m = bp.edges.findIndex((x, t) => t !== k && x.edge === e.edge);
  const f = bp.edges[m]!;
  // 重なる辺の名前は、対応する点の順にする（エ↔ク、オ↔キ なら「辺クキ」）。組み立てる答えは順番を問わない
  const fa = bp.points[f.a]!;
  const ea = bp.points[e.a]!;
  const partnerName = fa.corner === ea.corner ? `${points[f.a]!.label}${points[f.b]!.label}` : `${points[f.b]!.label}${points[f.a]!.label}`;
  const nm = (t: number) => `${points[bp.edges[t]!.a]!.label}${points[bp.edges[t]!.b]!.label}`;
  const adj = [(k + 1) % n, (k + n - 1) % n].filter((t) => t !== m);
  const others = shuffle(bp.edges.map((_, t) => t).filter((t) => t !== k && t !== m && !adj.includes(t)));
  const wrongIdx = [...adj, ...others].slice(0, 3);
  const en = nm(k);
  const hints = [`辺${en}の 両はしの 点と、それぞれ 重なる 点を さがそう。`, '重なる 点どうしを むすんだ 辺が、重なる 辺。', '辺の 先の 面を 折り上げると、どの 辺と くっつく？'];
  const adjNames = adj.map((t) => canonEdge(nm(t)));
  const scaffold = choice({
    label: '重なる辺', prompt: `辺${en}と 重なる 辺`, correct: `辺${partnerName}`,
    wrongs: wrongIdx.map((t) => ({ text: `辺${nm(t)}`, note: adj.includes(t) ? `辺${nm(t)}は 辺${en}と となりあって いる 辺。組み立てると 直角に なるよ。` : '頭の 中で 組み立てよう。まず、辺の はしの 点と 重なる 点を さがそう。' })),
    why: `組み立てると 辺${en}と 辺${partnerName}は くっついて、立方体の 同じ 辺に なるよ。`,
    hints,
  });
  return {
    skillId: 'tenkai-edge', title: '重なる 辺', emoji: '🔗',
    text: `下の 立方体の 展開図を 組み立てます。\n辺${en}と 重なる 辺を 書きましょう。`,
    figure: { type: 'net', rects: netRects(net), points, faceLabels, highlightEdge: [e.a, e.b] },
    steps: [{
      kind: 'edges', label: '重なる辺', prompt: `辺${en}と 重なる 辺`, hints,
      letters: points.map((p) => p.label), edges: bp.edges.map((_, t) => canonEdge(nm(t))), correct: [canonEdge(partnerName)],
      diagnose: (p) => {
        const c = p[0] as string;
        if (c === canonEdge(en)) return `辺${en}じしんでは なく、組み立てると 辺${en}に 重なる 相手の 辺を 書こう。`;
        if (adjNames.includes(c)) return `その 辺は 辺${en}と となりあって いる 辺。組み立てると 直角に なるよ。重なる 辺は、辺の はしの 点と 重なる 点を むすんだ 辺。`;
        return null;
      },
      scaffold,
    }],
    summary: `辺${en}と 辺${partnerName}が 重なる。`,
    label: `辺${en}と重なる辺`, q: `辺${en}と重なる辺`, a: `辺${partnerName}`,
  };
}

export function genTenkaiFace(part: FacePart = 'all'): Question {
  const p = part === 'all' ? (Math.random() < 0.6 ? 'par' : 'perp') : part;
  const net = randomNet([1, 1, 1]);
  const faceLabels = shuffle(HIRA);
  const i = rnd(0, 5);
  const o = oppositeFace(net, i);
  const L = (k: number) => `面${faceLabels[k]}`;
  if (p === 'par') {
    return {
      skillId: 'tenkai-face', title: '展開図で 平行な 面', emoji: '🎲',
      text: `下の 立方体の 展開図を 組み立てます。\n${L(i)}に 平行な 面は どれですか。`,
      figure: { type: 'net', rects: netRects(net), faceLabels, shade: [i] },
      steps: [choice({
        label: '平行な面', prompt: `${L(i)}に 平行な 面`, correct: L(o),
        wrongs: shuffle([0, 1, 2, 3, 4, 5].filter((k) => k !== i && k !== o)).slice(0, 3).map((k) => ({ text: L(k), note: `${L(k)}は 組み立てると ${L(i)}の となりに なり、垂直に 交わるよ。` })),
        why: `組み立てると ${L(i)}と ${L(o)}が 向かい合う。向かい合う 面は 平行。`,
        hints: ['平行な 面は、組み立てたとき 向かい合う 面。', `${L(i)}と となり合って いる 面は 平行に ならない。`, 'まっすぐ 3つ ならんだ 面の 両はしは 向かい合うよ。'],
      })],
      summary: `${L(i)}と ${L(o)}が 向かい合って 平行。`,
      label: `${L(i)}に平行な面`, q: `${L(i)}に平行な面`, a: L(o),
    };
  }
  const options = [0, 1, 2, 3, 4, 5].filter((k) => k !== i).map((k) => L(k));
  const correct = options.map((t, idx) => (t === L(o) ? -1 : idx)).filter((x) => x >= 0);
  return {
    skillId: 'tenkai-face', title: '展開図で 垂直な 面', emoji: '🎲',
    text: `下の 立方体の 展開図を 組み立てます。\n${L(i)}に 垂直な 面を 全部 えらびましょう。`,
    figure: { type: 'net', rects: netRects(net), faceLabels, shade: [i] },
    steps: [{
      kind: 'multi', label: '垂直な面', prompt: `${L(i)}に 垂直な 面（全部）`, options, correct,
      why: `${L(i)}と 向かい合う ${L(o)}だけが 平行。のこりの 4つは 垂直。`,
      hints: ['垂直な 面は、組み立てたとき となりに くる 面。', `まず ${L(i)}と 向かい合う 面を 見つけよう。`, '向かい合う 面 いがいの 4つ。'],
      diagnose: (pk) => (pk.includes(options.indexOf(L(o))) ? `${L(o)}は 組み立てると ${L(i)}と 向かい合うよ。向かい合う 面は 平行。` : null),
    }],
    summary: `${L(o)}いがいの 4つの 面が 垂直。`,
    label: `${L(i)}に垂直な面`, q: `${L(i)}に垂直な面を全部`, a: correct.map((x) => options[x]).join('、'),
  };
}

/* ================================================================== */
/* ④ 見取図                                                              */
/* ================================================================== */

export function genMitoriHidden(): Question {
  const dims = cuboidDims('any');
  const view = pickView();
  const ans = hiddenEdges(view).map(edgeName);
  return {
    skillId: 'mitori-hidden', title: '見えない 辺は 点線', emoji: '👀',
    text: `下の 直方体の 見取図は、辺を ぜんぶ 実線で かいて あります。\n見えない 辺を タップして 点線に しましょう。`,
    steps: [{
      kind: 'dash', label: '見えない辺', prompt: '見えない 辺（全部）を 点線に しよう。', dims, view, answer: ans,
      hints: ['手前の 面に かくれて 見えない 辺が ある。', 'おくの 下の 角に 集まる 辺を 見よう。', '見えない 辺は 3本。'],
    }],
    summary: '見取図では、見えない 辺を 点線で かく。おくの 下の 頂点に 集まる 3本。',
    label: '見えない辺を点線に', q: '見取図の見えない辺', a: ans.map((x) => `辺${x}`).join('、'),
  };
}

/** 方眼にかく見取図の形（格子点の上の8つの頂点） */
function latticeCuboid() {
  // おくへの ずれ（ox, oy）は前の面より小さくする。同じか大きいと、見えない辺が前の面の辺と重なってしまう
  let w = 0, h = 0, ox = 0, oy = 0;
  do {
    w = rnd(3, 6); h = rnd(2, 4);
    [ox, oy] = pick([[2, 1], [3, 1], [2, 2], [3, 2], [4, 2], [1, 1], [4, 1]] as [number, number][]);
  } while (ox >= w || oy >= h);
  const view = pickView();
  const sg = view === 'right' ? 1 : -1;
  const x0 = 1 + (view === 'left' ? ox : 0), y0 = 1 + oy + h;
  const P: Record<VName, Pt> = {
    E: { x: x0, y: y0 }, F: { x: x0 + w, y: y0 }, A: { x: x0, y: y0 - h }, B: { x: x0 + w, y: y0 - h },
    H: { x: x0 + sg * ox, y: y0 - oy }, G: { x: x0 + w + sg * ox, y: y0 - oy }, D: { x: x0 + sg * ox, y: y0 - h - oy }, C: { x: x0 + w + sg * ox, y: y0 - h - oy },
  };
  return { P, view, gw: w + ox + 2, gh: h + oy + 2, w, h };
}

export function genMitoriDraw(given?: 'test' | 'easy' | 'hard'): Question {
  const lvl = given ?? pick(['easy', 'test', 'hard'] as const);
  const { P, view, gw, gh, w, h } = latticeCuboid();
  const hid = hiddenEdges(view).map(edgeName);
  const front = ['AB', 'EF', 'AE', 'BF'];
  const visible = EDGES.map(edgeName).filter((n) => !hid.includes(n) && !front.includes(n));
  // easy: 見えない辺だけかく / test: 見える辺を1本と見えない辺 / hard: 前の面だけ与える
  const drop = lvl === 'easy' ? 0 : lvl === 'test' ? 1 : visible.length;
  const dropped = shuffle(visible).slice(0, drop);
  const seg = (n: string, dashed = false): Seg => ({ a: P[n[0] as VName], b: P[n[1] as VName], dashed });
  const givenSegs = [...front, ...visible.filter((n) => !dropped.includes(n))].map((n) => seg(n));
  const expected = [...dropped.map((n) => seg(n)), ...hid.map((n) => seg(n, true))];
  return {
    skillId: 'mitori-draw', title: '見取図の 続きを かく', emoji: '🖊️',
    text: `下の 直方体の 見取図の 続きを かきましょう。${drop > 0 ? '\n（見える 辺は 実線、見えない 辺は 点線で かく）' : '\n（見えない 辺を 点線で かく）'}`,
    steps: [{
      kind: 'sketch', label: '見取図', prompt: `点を 2つ タップして 辺を かこう。あと ${expected.length}本。`, gw, gh,
      given: givenSegs, expected, useDashed: true,
      hints: [
        '平行な 辺は、方眼の 上で 同じ 向き・同じ 長さに かく。',
        '見えない 辺は、おくの 下の 角に 集まる 3本。点線に きりかえて かこう。',
        `おくの 辺は、前の 辺を ななめに ずらした ところ。前の 面は 横 ${w}マス・たて ${h}マス。`,
      ],
    }],
    summary: '見取図は、平行な 辺を 平行に、見えない 辺を 点線で かく。',
    label: '見取図の続き', q: '直方体の見取図の続き', a: '（作図）',
  };
}

export function genMitoriCount(): Question {
  const dims = cuboidDims('any');
  const view = pickView();
  const asks = shuffle([
    { label: '見える面', prompt: '見取図で、見えて いる 面は いくつ ありますか。', answer: 3, unit: 'つ', note: '前・上・横の 3つ。' },
    { label: '見えない辺', prompt: '見えない 辺（点線の 辺）は 何本 ありますか。', answer: 3, unit: '本', note: 'おくの 下の 角に 集まる 辺。' },
    { label: '見えない頂点', prompt: '見えない 頂点は いくつ ありますか。', answer: 1, unit: 'つ', note: '点線が 集まる 角。' },
    { label: '見える辺', prompt: '見えて いる 辺（実線の 辺）は 何本 ありますか。', answer: 9, unit: '本', note: '12本から 見えない 3本を ひく。' },
  ]).slice(0, 2);
  return {
    skillId: 'mitori-count', title: '見取図を 読む', emoji: '🔍',
    text: '下の 直方体の 見取図を 見て 答えましょう。',
    figure: cuboidFig(dims, view, { letters: true }),
    steps: asks.map((a) => num({
      label: a.label, prompt: a.prompt, answer: a.answer, unit: a.unit,
      hints: ['実線は 見える 辺、点線は 見えない 辺。', a.note, '図の 線を 1本ずつ 指で おさえて 数えよう。'],
      diagnose: (v) => (v === 12 ? 'それは 辺 ぜんぶの 数。見える・見えないで 分けよう。' : v === 6 ? 'それは 面 ぜんぶの 数。' : null),
    })),
    summary: '見える 面 3つ・見える 辺 9本・見えない 辺 3本・見えない 頂点 1つ。',
    label: '見取図を読む', q: asks.map((a) => a.label).join('・'), a: asks.map((a) => `${a.answer}${a.unit}`).join('・'),
  };
}

/* ================================================================== */
/* ⑤ 位置の表し方                                                        */
/* ================================================================== */

function planePoints(n: number) {
  const w = rnd(5, 7), h = rnd(4, 6);
  const used = new Set<string>(['0,0']);
  const pts: LabeledPt[] = [];
  const names = ['B', 'C', 'D', 'E'];
  while (pts.length < n) {
    const x = rnd(0, w), y = rnd(0, h);
    if (used.has(`${x},${y}`) || (x === 0 && y === 0) || x === y) continue;
    if (pts.length === 0 && (x === 0 || y === 0)) continue;
    used.add(`${x},${y}`);
    pts.push({ x, y, label: names[pts.length] as string });
  }
  return { w, h, pts, used };
}

const swapNote = '横（右へ）を 先に、たて（上へ）を あとに 数えるよ。横と たてが 入れかわって いないかな？';

export function genIchiRead(): Question {
  const { w, h, pts } = planePoints(3);
  const ex = pts[0]!, t = pick(pts.slice(1));
  return {
    skillId: 'ichi-read', title: '点の 位置を 表す', emoji: '📍',
    text: `下の 図で、点${ex.label}の 位置は、点Aを もとに して（横 ${ex.x}cm、たて ${ex.y}cm）と 表す ことが できます。\n点Aを もとに して、点${t.label}の 位置を 表しましょう。`,
    figure: { type: 'plane', w, h, points: [{ x: 0, y: 0, label: 'A' }, ...pts] },
    steps: [
      num({ label: '横', prompt: `点${t.label}は、点Aから 横（右）へ 何cm？`, answer: t.x, before: '横', unit: 'cm',
        hints: ['点Aから 右へ 何マス 進むか 数えよう。', `点${t.label}の 真下の 目もりを 読もう。`, '1マスは 1cm。'],
        diagnose: (v) => (v === t.y ? swapNote : null) }),
      num({ label: 'たて', prompt: `点${t.label}は、点Aから たて（上）へ 何cm？`, answer: t.y, before: 'たて', unit: 'cm',
        hints: ['点Aから 上へ 何マス 進むか 数えよう。', `点${t.label}の 真横の 目もりを 読もう。`, '1マスは 1cm。'],
        diagnose: (v) => (v === t.x ? swapNote : null) }),
    ],
    summary: `点${t.label}は（横 ${t.x}cm、たて ${t.y}cm）。横を 先に 書く。`,
    label: `点${t.label}の位置`, q: `点Aをもとにした点${t.label}の位置`, a: `横${t.x}cm、たて${t.y}cm`,
  };
}

export function genIchiPlot(): Question {
  const { w, h, pts, used } = planePoints(2);
  let ax = 0, ay = 0;
  for (let k = 0; k < 200; k++) {
    ax = rnd(1, w); ay = rnd(1, h);
    if (ax !== ay && !used.has(`${ax},${ay}`) && !used.has(`${ay},${ax}`) && ay <= w && ax <= h) break;
  }
  if (ax === ay || used.has(`${ax},${ay}`)) { ax = Math.min(w, 2); ay = 1; }
  const ex = pts[0]!;
  return {
    skillId: 'ichi-plot', title: '点を かく', emoji: '📍',
    text: `点${ex.label}の 位置は、点Aを もとに して（横 ${ex.x}cm、たて ${ex.y}cm）と 表せます。\n点D（横 ${ax}cm、たて ${ay}cm）を、図の 中に かきましょう。`,
    steps: [{
      kind: 'point', label: '点D', prompt: `点D（横 ${ax}cm、たて ${ay}cm）`, w, h,
      points: [{ x: 0, y: 0, label: 'A' }, ...pts], answer: { x: ax, y: ay }, answerLabel: 'D',
      hints: ['点Aから はじめよう。', `まず 右へ ${ax}マス。`, `そこから 上へ ${ay}マス。`],
      diagnose: (p) => (p.x === ax && p.y === ay ? null : p.x === ay && p.y === ax ? swapNote : p.x === ax ? `横は あって いるよ。たて（上へ）${ay}cm を たしかめよう。` : p.y === ay ? `たては あって いるよ。横（右へ）${ax}cm を たしかめよう。` : null),
    }],
    summary: `点Aから 右へ ${ax}、上へ ${ay} の ところが 点D。`,
    label: `点D（${ax},${ay}）をかく`, q: `点D（横${ax}cm、たて${ay}cm）をかく`, a: `横${ax}・たて${ay}の点`,
  };
}

export function genIchiSpace(): Question {
  const dims = cuboidDims('distinct');
  const [L, W, H] = dims;
  const view: 'right' = 'right';
  const target = pick(VERTS.filter((v) => v !== 'E' && v !== 'F'));
  const [x, y, z] = vertexAt(target, dims);
  const inv = Math.random() < 0.3;
  const base = `頂点Eを もとに すると、頂点Fの 位置は（横 ${L}cm、たて 0cm、高さ 0cm）と 表せます。`;
  const fig = cuboidFig(dims, view, { letters: true, dimLabels: true, markVertex: 'E' });
  if (inv) {
    const others = shuffle(VERTS.filter((v) => v !== target && v !== 'E')).slice(0, 3);
    return {
      skillId: 'ichi-space', title: '空間の 位置', emoji: '🧭',
      text: `下の 直方体で、${base}\n（横 ${x}cm、たて ${y}cm、高さ ${z}cm）の 位置に ある 頂点は どれですか。`,
      figure: fig,
      steps: [choice({
        label: '頂点', prompt: `（横 ${x}cm、たて ${y}cm、高さ ${z}cm）の 頂点`, correct: `頂点${target}`,
        wrongs: others.map((o) => { const p = vertexAt(o, dims); return { text: `頂点${o}`, note: `頂点${o}は（横 ${p[0]}cm、たて ${p[1]}cm、高さ ${p[2]}cm）だよ。` }; }),
        why: `頂点Eから 横へ ${x}cm、たて（おく）へ ${y}cm、高さ ${z}cm 進んだ ところが 頂点${target}。`,
        hints: ['頂点Eから、横 → たて（おく） → 高さ の 順に 進もう。', `横に ${x}cm、おくに ${y}cm。`, `そこから 上に ${z}cm。`],
      })],
      summary: `（横 ${x}、たて ${y}、高さ ${z}）は 頂点${target}。`,
      label: `空間の位置→頂点${target}`, q: `（横${x}、たて${y}、高さ${z}）の頂点`, a: `頂点${target}`,
    };
  }
  const note = (v: number, want: number, axis: string) => (v !== want && [x, y, z].includes(v) ? `${axis}の 長さを、図の 長さから もう一度 たしかめよう。横・たて・高さの 順だよ。` : null);
  return {
    skillId: 'ichi-space', title: '空間の 位置', emoji: '🧭',
    text: `下の 直方体で、${base}\n頂点${target}の 位置を 表しましょう。`,
    figure: { ...fig, markVertex: target } as Figure,
    steps: [
      num({ label: '横', prompt: `頂点${target}は 横 何cm？`, answer: x, before: '横', unit: 'cm', hints: ['頂点Eから 横（右）へ 進む 長さ。', '横の 辺の 長さを 見よう。', `横の 辺は ${L}cm。進まなければ 0cm。`], diagnose: (v) => note(v, x, '横') }),
      num({ label: 'たて', prompt: `頂点${target}は たて 何cm？`, answer: y, before: 'たて', unit: 'cm', hints: ['頂点Eから おくへ 進む 長さ。', 'ななめに かいた 辺が おくゆき（たて）。', `たての 辺は ${W}cm。進まなければ 0cm。`], diagnose: (v) => note(v, y, 'たて') }),
      num({ label: '高さ', prompt: `頂点${target}は 高さ 何cm？`, answer: z, before: '高さ', unit: 'cm', hints: ['頂点Eから 上へ 進む 長さ。', '下の 面の 頂点なら 高さは 0cm。', `高さの 辺は ${H}cm。`], diagnose: (v) => note(v, z, '高さ') }),
    ],
    summary: `頂点${target}は（横 ${x}cm、たて ${y}cm、高さ ${z}cm）。`,
    label: `頂点${target}の位置`, q: `頂点Eをもとにした頂点${target}の位置`, a: `横${x}cm、たて${y}cm、高さ${z}cm`,
  };
}

/* ================================================================== */
/* ⑥ いかそう（リボン）                                                   */
/* ================================================================== */

export function genKatsuyoRibbon(): Question {
  const L = pick([30, 40, 50, 60]), W = pick([20, 30, 40].filter((x) => x < L)), H = pick([5, 10, 15, 20].filter((x) => x < W));
  const bow = pick([20, 25, 30, 40]);
  const total = L * 2 + W * 2 + H * 4 + bow;
  return {
    skillId: 'katsuyo-ribbon', title: 'リボンの 長さ', emoji: '🎁',
    text: `横 ${L}cm、たて ${W}cm、高さ ${H}cm の 箱に、図のように リボンを かけます。\n結び目に リボンを ${bow}cm 使うと、リボンは 全部で 何cm あれば よいですか。`,
    figure: cuboidFig([L, W, H], 'right', { ribbon: true, dimLabels: true }),
    steps: [
      num({
        label: '高さの回数', prompt: `高さ（${H}cm）の ところを、リボンは 何回 通りますか。`, answer: 4, unit: '回',
        hints: ['リボンは、横向きに 1周、たて向きに 1周 して いるよ。', '1周するとき、高さの ところを 2回 通る。', '2周で…'],
        diagnose: (v) => (v === 2 ? '横向きの 1周と、たて向きの 1周、それぞれで 2回ずつ 通るよ。' : null),
      }),
      num({
        label: '全部の長さ', prompt: 'リボンは 全部で 何cm？', answer: total, unit: 'cm', pad: { kind: 'calc', ops: ['×', '+'] },
        hints: [`横 ${L}cm を 2回、たて ${W}cm を 2回、高さ ${H}cm を 4回。`, `${L}×2 ＋ ${W}×2 ＋ ${H}×4 ＋ 結び目`, `${L * 2} ＋ ${W * 2} ＋ ${H * 4} ＋ ${bow}`],
        diagnose: (v) => (v === total - bow ? `結び目の ${bow}cm を わすれずに たそう。` : v === total - H * 2 ? '高さの ところは 4回 通るよ。' : v === L + W + H + bow ? '横も たても、上と 下で 2回ずつ 通るよ。' : null),
      }),
    ],
    summary: `${L}×2＋${W}×2＋${H}×4＋${bow}＝${total}cm。`,
    label: `リボン ${L}×${W}×${H}`, q: `箱(${L}×${W}×${H})にかけるリボンの長さ（結び目${bow}cm）`, a: `${total}cm`,
  };
}

const RIBBON_NET_DIMS: Dims[] = [[4, 2, 1], [6, 2, 1], [4, 4, 1], [2, 4, 1], [4, 2, 2], [6, 4, 1], [2, 2, 1], [6, 2, 2], [2, 6, 1], [4, 6, 1]];

/** 箱の展開図にリボンの線（真ん中を通る直線）をかく */
export function genKatsuyoRibbonNet(): Question {
  for (let t = 0; t < 100; t++) {
    const dims = pick(RIBBON_NET_DIMS);
    const [L, W] = dims;
    // 十字の形の展開図（底を真ん中にして、上下左右に4つ、下の面の先にふた）
    const f0 = baseFace(dims, 0, 0);
    const fU = foldStep(dims, f0, 'U'), fD = foldStep(dims, f0, 'D'), fL = foldStep(dims, f0, 'L'), fR = foldStep(dims, f0, 'R');
    // ふたの面を、どの面の先に つけるか（4通り）
    const lid = pick([[2, 'D'], [1, 'U'], [3, 'L'], [4, 'R']] as [number, 'D' | 'U' | 'L' | 'R'][]);
    const side = [f0, fU, fD, fL, fR];
    const fT = foldStep(dims, side[lid[0]]!, lid[1]);
    const net = normalizeNet({ dims, faces: [f0, fU, fD, fL, fR, fT], parent: [-1, 0, 0, 0, 0, lid[0]] }, 1, 1);
    const rects = netRects(net);
    const b = netBounds(rects);
    const gw = b.w + 2, gh = b.h + 2;
    if (gw > 12 || gh > 12) continue;
    // リボン: 平面 x = L/2 と y = W/2 が 各面を切る線
    const lines: Seg[] = [];
    for (const f of net.faces) {
      for (const [k, c] of [[0, L / 2], [1, W / 2]] as [number, number][]) {
        const r = f.rect;
        if (f.u[k] !== 0) {
          const px = r.x + (c - f.o[k]!) / f.u[k]!;
          lines.push({ a: { x: px, y: r.y }, b: { x: px, y: r.y + r.h } });
        } else if (f.v[k] !== 0) {
          const py = r.y + (c - f.o[k]!) / f.v[k]!;
          lines.push({ a: { x: r.x, y: py }, b: { x: r.x + r.w, y: py } });
        }
      }
    }
    const { solid, dashed } = netLines(rects);
    const u = 10;
    return {
      skillId: 'katsuyo-ribbonnet', title: 'リボンの 線', emoji: '🎀',
      text: `横 ${L * u}cm、たて ${W * u}cm、高さ ${dims[2] * u}cm の 箱に、図のように リボンを かけます。\nリボンが 通る 直線を、下の 展開図に ひきましょう。（方眼の 1マスは ${u}cm）`,
      figure: cuboidFig([L * u, W * u, dims[2] * u], 'right', { ribbon: true, dimLabels: true }),
      steps: [{
        kind: 'sketch', label: 'リボンの線', prompt: '点を 2つ タップして、リボンの 線を ひこう（1本の 線を 何回かに 分けて ひいても よい）。',
        gw, gh, given: [...solid, ...dashed], expected: lines, useDashed: false,
        hints: ['リボンは、上の 面と 下の 面の 真ん中で 十字に 交わる。', '横の 面では、真ん中を まっすぐ 通るよ。', `上の 面の 横 ${L}マスの 真ん中、たて ${W}マスの 真ん中を 通る 線。`],
      }],
      summary: 'リボンは 面の 真ん中を まっすぐ 通る。展開図では、となりの 面に つながる 直線に なる。',
      label: `リボンの線 ${L * u}×${W * u}`, q: '展開図にリボンが通る直線をひく', a: '（作図）',
    };
  }
  throw new Error('genKatsuyoRibbonNet');
}

/* ================================================================== */
/* ⑦ エラーハンター                                                       */
/* ================================================================== */

const A_SAYS = (s: string) => `Aさんは、次のように 考えました。\n「${s}」`;

export function genEhEdges(): Question {
  const dims = cuboidDims('any');
  const kind = pick(['辺', '頂点', '面'] as const);
  const said = { 辺: 9, 頂点: 7, 面: 3 }[kind], ans = { 辺: 12, 頂点: 8, 面: 6 }[kind];
  return {
    skillId: 'eh-edges', title: '見えて いる ものだけ 数えた', emoji: '🕵️',
    text: `${A_SAYS(`見取図の ${kind}を 数えたら ${said}${kind === '辺' ? '本' : 'つ'} だったから、直方体の ${kind}は ${said}${kind === '辺' ? '本' : 'つ'}。`)}`,
    figure: cuboidFig(dims, pickView(), { letters: true }),
    steps: [
      choice({
        label: 'まちがいの もと', prompt: 'Aさんの まちがいの もとは どれ？', correct: kind === '面' ? '見えない 面を 数えて いない' : `見えない ${kind}を 数えて いない`,
        wrongs: [
          { text: kind === '面' ? '上と 下の 面を 1つと 数えた' : '点線の ぶんを 2回 数えて しまった', note: '図を もう一度 見よう。見えない ところは どう かかれて いる？' },
          { text: '直方体と 立方体で 数が ちがうから', note: '直方体も 立方体も、面・辺・頂点の 数は 同じだよ。' },
        ],
        why: `見取図では 見えない ところも ある（点線）。見えない ${kind}も 数えないと いけない。`,
        hints: ['点線の 辺は、見えない 辺。', '見えない ところは、うしろ・下に ある。', `見える ${kind}だけ 数えると たりない。`],
      }),
      num({
        label: `正しい${kind}の数`, prompt: `正しい ${kind}の 数は？`, answer: ans, unit: kind === '辺' ? '本' : 'つ',
        hints: ['見えない ところも ふくめて 数えよう。', kind === '辺' ? '4本ずつ 3組。' : kind === '頂点' ? '上に 4つ、下に 4つ。' : '上・下・前・うしろ・右・左。', `Aさんの ${said} に、見えない ぶんを たそう。`],
        diagnose: (v) => (v === said ? 'Aさんと 同じ答えだよ。見えない ぶんも 数えよう。' : null),
      }),
    ],
    summary: `直方体の ${kind}は ${ans}${kind === '辺' ? '本' : 'つ'}。見えない ところも 数える。`,
    label: `見えない${kind}の数えわすれ`, q: `Aさん「${kind}は${said}」の直し`, a: `${ans}`,
  };
}

export function genEhHidden(): Question {
  const dims = cuboidDims('any');
  const view = pickView();
  const ans = hiddenEdges(view).map(edgeName);
  return {
    skillId: 'eh-hidden', title: '見えない 辺を 実線で かいた', emoji: '🕵️',
    text: `${A_SAYS('直方体の 見取図を かいたよ。辺は 12本 ぜんぶ かいたから だいじょうぶ。')}\n（Aさんは 辺を ぜんぶ 実線で かきました）`,
    figure: cuboidFig(dims, view, { allSolid: true }),
    steps: [
      choice({
        label: 'まちがい', prompt: 'Aさんの 見取図の まちがいは どれ？', correct: '見えない 辺も 実線で かいた',
        wrongs: [
          { text: '辺の 数が たりない', note: '辺は 12本 かいて あるよ。数は あって いる。' },
          { text: '平行な 辺を、ちがう 長さで かいて しまった', note: '平行な 辺は 同じ 長さに かけて いるよ。' },
        ],
        why: '見取図では、見えない 辺は 点線で かく。そうしないと、どこが 手前か わからない 図に なる。',
        hints: ['ほんとうの 箱を 前から 見ると、見えない 辺が ある。', '見えない 辺は どう かく 約束だった？', '点線。'],
      }),
      {
        kind: 'dash', label: '直す', prompt: '見えない 辺を タップして 点線に 直そう。', dims, view, answer: ans,
        hints: ['おくの 下の 角に 集まる 辺。', '手前の 面に かくれて 見えない 辺。', '3本 あるよ。'],
      },
    ],
    summary: '見えない 3本の 辺を 点線に すると、正しい 見取図に なる。',
    label: '見えない辺を実線でかいた', q: 'Aさんの見取図の直し', a: ans.map((x) => `辺${x}`).join('、'),
  };
}

export function genEhNet(): Question {
  // 4回に1〜2回は ほんとうに 展開図に なる形を出す（いつも「正しくない」だと、考えずに 押すだけで 当たる。2026-11）
  if (Math.random() < 0.4) {
    let ok = randomHexomino();
    for (let t = 0; t < 500 && !isCubeNet(ok); t++) ok = randomHexomino();
    if (isCubeNet(ok)) {
      return {
        skillId: 'eh-net', title: '6つ つながれば 展開図？', emoji: '🕵️',
        text: A_SAYS('正方形が 6つ つながって いるから、この 図は 立方体の 展開図だ。'),
        figure: { type: 'net', rects: ok.map((c) => ({ x: c.x, y: c.y, w: 1, h: 1 })), grid: true },
        steps: [
          choice({
            label: '正しい？', prompt: 'Aさんの 考えは 正しいですか。', correct: '正しい',
            wrongs: [{ text: '正しくない', note: '頭の 中で 組み立てて みよう。重なる 面は ある？' }],
            why: 'この 形は、組み立てると 重なる 面が なく、立方体に なる。ただし 6つ つながって いれば いつも 展開図に なるわけでは ない。',
            hints: ['1つの 面を 底に して 組み立てて みよう。', '同じ ところに 2つの 面が こないか たしかめよう。', '立方体の 展開図は 全部で 11通り。'],
          }),
        ],
        summary: 'この 形は 立方体の 展開図。でも、6つの 正方形が つながって いても 展開図に ならない 形も ある（展開図は 全部で 11通り）。',
        label: '展開図になる形', q: 'Aさん「6つつながれば展開図」（この形は展開図）', a: '正しい',
      };
    }
  }
  let cells = randomHexomino();
  for (let t = 0; t < 500 && isCubeNet(cells); t++) cells = randomHexomino();
  return {
    skillId: 'eh-net', title: '6つ つながれば 展開図？', emoji: '🕵️',
    text: A_SAYS('正方形が 6つ つながって いるから、この 図は 立方体の 展開図だ。'),
    figure: { type: 'net', rects: cells.map((c) => ({ x: c.x, y: c.y, w: 1, h: 1 })), grid: true },
    steps: [
      choice({
        label: '正しい？', prompt: 'Aさんの 考えは 正しいですか。', correct: '正しくない',
        wrongs: [{ text: '正しい', note: '頭の 中で 組み立てて みよう。重なる 面は ない？' }],
        why: '正方形が 6つ つながって いても、組み立てると 重なる 面が できる 形が ある。',
        hints: ['1つの 面を 底に して 組み立てて みよう。', '同じ ところに 2つの 面が くると、立方体に ならない。', '横に 4つ より 多く ならんで いないかな？'],
      }),
      choice({
        label: '組み立てると', prompt: 'この 図を 組み立てると どう なる？', correct: '面が 重なって、ふさがらない 面が できる',
        wrongs: [
          { text: '立方体が できる', note: 'もう一度 組み立てて みよう。' },
          { text: '直方体が できる', note: '正方形 6まいで 箱を 作ると、できるなら 立方体だよ。' },
        ],
        why: '2つの 面が 同じ 場所に きて 重なり、どこかに あなが あく。',
        hints: ['重なる 面を さがそう。', '重なった ぶん、どこかが たりない。', 'ふたが できない ところが ある。'],
      }),
    ],
    summary: '6つの 正方形が つながって いても、展開図に なるとは かぎらない（全部で 11通り）。',
    label: '展開図にならない形', q: 'Aさん「6つつながれば展開図」の直し', a: '正しくない（面が重なる）',
  };
}

export function genEhOverlap(): Question {
  const { net, bp, points, faceLabels } = labeledCubeNet();
  const partners = (i: number) => bp.points.map((p, j) => (j !== i && p.corner === bp.points[i]!.corner ? j : -1)).filter((j) => j >= 0);
  const n = bp.points.length;
  const cands = bp.points.map((_, i) => i).filter((i) => partners(i).length === 1);
  const i = pick(cands);
  const j = partners(i)[0] as number;
  const z = [(i + 1) % n, (i + n - 1) % n].find((k) => k !== j) as number;
  const P = (k: number) => `点${points[k]!.label}`;
  const others = shuffle(bp.points.map((_, k) => k).filter((k) => k !== i && k !== j && k !== z)).slice(0, 2);
  return {
    skillId: 'eh-overlap', title: 'となりの 点が 重なると 思った', emoji: '🕵️',
    text: `${A_SAYS(`展開図を 組み立てると、${P(i)}と 重なるのは となりの ${P(z)}。`)}\n正しい 答えは どれですか。`,
    figure: { type: 'net', rects: netRects(net), points, faceLabels, highlightPoint: i },
    steps: [choice({
      label: '重なる点', prompt: `${P(i)}と 重なる 点`, correct: P(j),
      wrongs: [{ text: P(z), note: `Aさんと 同じ答えだよ。${P(z)}は ${P(i)}と 同じ 辺の 両はし。組み立てても はなれて いるよ。` },
        ...others.map((k) => ({ text: P(k), note: '頭の 中で 面を 折り上げて、どの 点が 集まるか 考えよう。' }))],
      why: `同じ 辺の 両はしの 点は 重ならない。折ったとき くっつく 辺の はしどうしが 重なる。${P(i)}と ${P(j)}。`,
      hints: ['同じ 辺の 両はしの 点は、組み立てても はなれた まま。', `${P(i)}が はしに ある 辺が、どの 辺と くっつくか 考えよう。`, '面を 1つずつ 折り上げて みよう。'],
    })],
    summary: `${P(i)}と 重なるのは ${P(j)}。`,
    label: 'となりの点を重なると思った', q: `Aさん「${P(i)}と重なるのは${P(z)}」の直し`, a: P(j),
  };
}

export function genEhParallel(): Question {
  const e = pick(EDGES);
  const name = edgeName(e);
  const par = parallelEdges(e).map(edgeName);
  const onSame = par.find((x) => FACES.some((f) => { const vs = f.name; return vs.includes(x[0]!) && vs.includes(x[1]!) && vs.includes(name[0]!) && vs.includes(name[1]!); })) as string;
  return {
    skillId: 'eh-parallel', title: '平行な 辺を 1本だけ 答えた', emoji: '🕵️',
    text: `${A_SAYS(`辺${name}に 平行な 辺は、同じ 面の 向かいに ある 辺${onSame}だけ。`)}\n正しく 全部 書きましょう。`,
    figure: cuboidFig(cuboidDims('distinct'), pickView(), { letters: true, highlight: [name] }),
    steps: [edgeBuild({
      label: '平行な辺', prompt: `辺${name}に 平行な 辺（全部）`, correct: par, exclude: [name],
      why: '同じ 面の 上だけで なく、はなれた ところにも 同じ 向きの 辺が ある。直方体では 3本。',
      hints: ['同じ 向きの 辺を、見えない 辺も ふくめて さがそう。', 'となりの 面や、向かいの 面にも ある。', '全部で 3本。'],
      diagnose: (p) => (p.length === 1 && canonEdge(p[0]!) === canonEdge(onSame) ? 'Aさんと 同じ答えだよ。はなれた ところにも 平行な 辺が あるよ。' : p.some((x) => perpendicularEdges(e).map(edgeName).includes(x)) ? `垂直と 平行を とりちがえて いないかな。辺${name}と 交わる 辺は 平行では ないよ。` : null),
    })],
    summary: `辺${name}に 平行な 辺は ${par.map((x) => `辺${x}`).join('・')}。`,
    label: '平行な辺を1本だけ', q: `辺${name}に平行な辺を全部`, a: par.map((x) => `辺${x}`).join('、'),
  };
}

export function genEhPerp(): Question {
  const e = pick(EDGES);
  const name = edgeName(e);
  const per = perpendicularEdges(e).map(edgeName);
  const par = parallelEdges(e).map(edgeName);
  const skew = pick(EDGES.map(edgeName).filter((x) => x !== name && !per.includes(x) && !par.includes(x)));
  return {
    skillId: 'eh-perp', title: '交わらない 辺を 垂直と した', emoji: '🕵️',
    text: `${A_SAYS(`辺${skew}は、辺${name}と 向きが ちがうから、辺${name}に 垂直な 辺だ。`)}`,
    figure: cuboidFig(cuboidDims('distinct'), pickView(), { letters: true, highlight: [name, skew] }),
    steps: [
      choice({
        label: 'まちがい', prompt: 'Aさんの 考えの まちがいは どれ？', correct: `辺${skew}は 辺${name}と 交わらない`,
        wrongs: [
          { text: `辺${skew}は 辺${name}と 平行`, note: '向きが ちがう 辺は 平行では ないよ。' },
          { text: `辺${skew}は 辺${name}と 直角に 交わる`, note: '垂直な 辺は、直角に 交わる 辺だったね。2本の 辺は 交わって いる？' },
        ],
        why: '垂直な 辺は、直角に 交わる 辺。向きが ちがっても、交わらない 辺は 垂直とは いわない。',
        hints: ['垂直の 約束を 思い出そう。', `辺${name}と 辺${skew}は、どこかで 交わって いる？`, '交わって いなければ 垂直とは いわない。'],
      }),
      edgeBuild({
        label: '垂直な辺', prompt: `辺${name}に 垂直な 辺（全部）`, correct: per, exclude: [name],
        why: `辺${name}の 両はしで 直角に 交わる 4本。`,
        hints: [`頂点${e[0]}に 集まる 辺を 見よう。`, `頂点${e[1]}に 集まる 辺も 見よう。`, '2本ずつで 4本。'],
        diagnose: (p) => (p.includes(skew) ? `辺${skew}は 辺${name}と 交わらないよ。` : null),
      }),
    ],
    summary: `辺${name}に 垂直なのは ${per.map((x) => `辺${x}`).join('・')}。辺${skew}は 交わらないので 垂直では ない。`,
    label: '交わらない辺を垂直とした', q: `Aさん「辺${skew}は辺${name}に垂直」の直し`, a: per.map((x) => `辺${x}`).join('、'),
  };
}

export function genEhIchi(): Question {
  const { w, h, pts } = planePoints(2);
  const t = pts[1]!;
  return {
    skillId: 'eh-ichi', title: '横と たてを 逆に した', emoji: '🕵️',
    text: `${A_SAYS(`点Aを もとに すると、点${t.label}の 位置は（横 ${t.y}cm、たて ${t.x}cm）。`)}\n正しく 表しましょう。`,
    figure: { type: 'plane', w, h, points: [{ x: 0, y: 0, label: 'A' }, ...pts] },
    steps: [
      num({ label: '横', prompt: `点${t.label}は 横 何cm？`, answer: t.x, before: '横', unit: 'cm', hints: ['横は 右へ 進む 長さ。', `点${t.label}の 真下の 目もり。`, 'Aさんは 横と たてを 入れかえて いるよ。'], diagnose: (v) => (v === t.y ? 'Aさんと 同じだよ。' + swapNote : null) }),
      num({ label: 'たて', prompt: `点${t.label}は たて 何cm？`, answer: t.y, before: 'たて', unit: 'cm', hints: ['たては 上へ 進む 長さ。', `点${t.label}の 真横の 目もり。`, '横を 先、たてを あと。'], diagnose: (v) => (v === t.x ? swapNote : null) }),
    ],
    summary: `点${t.label}は（横 ${t.x}cm、たて ${t.y}cm）。横が 先。`,
    label: '横とたてを逆にした', q: `Aさん「点${t.label}は横${t.y}、たて${t.x}」の直し`, a: `横${t.x}cm、たて${t.y}cm`,
  };
}

export function genEhFace(): Question {
  const dims = cuboidDims('distinct');
  const [L, W, H] = dims;
  const [a, b] = pick([[W, L], [H, L], [H, W]] as [number, number][]);
  return {
    skillId: 'eh-face', title: '同じ形の 面を 1つと した', emoji: '🕵️',
    text: `${A_SAYS(`この 直方体で、たて ${a}cm、横 ${b}cm の 長方形の 面は、見えて いる 1つだけ。`)}`,
    figure: cuboidFig(dims, pickView(), { dimLabels: true }),
    steps: [
      choice({
        label: 'まちがい', prompt: 'Aさんの まちがいは どれ？', correct: '向かい合う 面も 同じ 形',
        wrongs: [
          { text: '見えて いる 面は ほかの 形', note: '見えて いる 面の 長さを たしかめよう。あって いるよ。' },
          { text: '長方形の 面は ない', note: '直方体には 長方形の 面が あるよ。' },
        ],
        why: '直方体の 向かい合う 面は、同じ 形・同じ 大きさ。見えない うしろ側にも 同じ 面が ある。',
        hints: ['見えない 面も ある。', '向かい合う 面を 考えよう。', '同じ 形の 面は 2つずつ。'],
      }),
      num({
        label: '正しい数', prompt: `たて ${a}cm、横 ${b}cm の 面は いくつ？`, answer: 2, unit: 'つ',
        hints: ['向かい合う 面は 同じ 形。', '見えて いる 1つと、その 向かい側。', '2つずつ 3組。'],
        diagnose: (v) => (v === 1 ? 'Aさんと 同じ答えだよ。向かい合う 面を わすれずに。' : null),
      }),
    ],
    summary: '直方体は、同じ 形の 面が 2つずつ 3組。',
    label: '同じ形の面を1つとした', q: `Aさん「${a}×${b}の面は1つ」の直し`, a: '2つ',
  };
}

/* ================================================================== */
/* 登録表                                                                */
/* ================================================================== */

export const GENERATORS: Record<string, () => Question> = {
  'kousei-cube': () => genKouseiCube('all'),
  'kousei-cuboid': () => genKouseiCuboid('all'),
  'kousei-sort': genKouseiSort,
  'kousei-higo': genKouseiHigo,
  'kousei-paper': () => genKouseiPaper('any'),
  'heiko-face': () => genHeikoFace('all'),
  'heiko-edge': genHeikoEdge,
  'heiko-edgeperp': genHeikoEdgePerp,
  'heiko-faceedge': () => genHeikoFaceEdge('all'),
  'tenkai-cubeok': genTenkaiCubeOk,
  'tenkai-cube': () => genTenkaiCube(),
  'tenkai-cuboid': () => genTenkaiCuboid(),
  'tenkai-point': genTenkaiPoint,
  'tenkai-edge': genTenkaiEdge,
  'tenkai-face': () => genTenkaiFace('all'),
  'mitori-hidden': genMitoriHidden,
  'mitori-count': genMitoriCount,
  'mitori-draw': () => genMitoriDraw(),
  'ichi-read': genIchiRead,
  'ichi-plot': genIchiPlot,
  'ichi-space': genIchiSpace,
  'katsuyo-ribbon': genKatsuyoRibbon,
  'katsuyo-ribbonnet': genKatsuyoRibbonNet,
  'eh-edges': genEhEdges,
  'eh-face': genEhFace,
  'eh-hidden': genEhHidden,
  'eh-net': genEhNet,
  'eh-overlap': genEhOverlap,
  'eh-parallel': genEhParallel,
  'eh-perp': genEhPerp,
  'eh-ichi': genEhIchi,
};

export function generate(skillId: string): Question {
  const g = GENERATORS[skillId];
  if (!g) throw new Error(`generate: 知らない項目です (${skillId})`);
  return g();
}

/** 検査用: 展開図の答え（しめるマス）が、もとの完成形をふくむか */
export const _forVerify = { cellsOf, v3key };
