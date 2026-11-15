// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/lib/problems/relation.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * モジュール1「すいちょく・平行はっけん」の問題ジェネレーター。
 *
 * 単元の出発点。解説 p.202 の指導順（まず垂直を約束し、その上で平行を約束する）に合わせ、
 * 垂直 → 交わらない場合の垂直 → 平行 → 図の中から探す → 平行線の性質、の順に段階化する。
 *
 * この単元最大の誤概念に正面から当てる:
 *  - 「垂直＝たてとよこ」→ 基準の傾きを毎回ランダムに変え、水平・垂直の配置を特別扱いしない
 *  - 「交わっていないから垂直ではない」→ rel-extend で、線をのばして初めて交わる配置だけを出す
 *    （解説 p.202「垂直とは二直線の位置関係を表すものであり，形としての直角とは異なる」）
 */
import { FigLine, FigureSpec, Pt } from '../../types';
import { GeoProblem, LevelDef } from '../problemTypes';
import { dirOf, isParallelDir, isPerpendicularDir, r2, segmentsIntersect } from '../geometry';
import { pick, pickN, randInt, shuffle } from './rng';

export type RelationLevel = 'rel-perp' | 'rel-extend' | 'rel-para' | 'rel-find' | 'rel-prop';

export const RELATION_LEVELS: LevelDef<RelationLevel>[] = [
  { id: 'rel-perp', label: '① 垂直をみつける', desc: '直角に交わっていたら「垂直」。ななめでも垂直だよ。' },
  { id: 'rel-extend', label: '② のばして たしかめる', desc: 'いまは交わっていなくても、のばすと直角に交わることがある。' },
  { id: 'rel-para', label: '③ 平行をみつける', desc: '1本の直線に垂直な2本の直線は「平行」。' },
  { id: 'rel-find', label: '④ ぜんぶ みつける', desc: '図の中から、垂直な組・平行な組をすべて答えよう。' },
  { id: 'rel-prop', label: '⑤ 平行の せいしつ', desc: '平行な2本の直線の「はば」はどこでも等しい。' },
];

const SYMBOLS = ['あ', 'い', 'う', 'え', 'お', 'か', 'き'];

/** 基準の傾き。0/90 に偏らせないことが「垂直＝たてよこ」誤概念への対策そのもの。 */
const BASE_ANGLES = [0, 15, 20, 30, 40, 45, 55, 60, 70, 75, 90, 105, 115, 120, 135, 150];

/** 垂直でも平行でもない角度差（度）。90 と 0 から十分に離す。 */
const OFF_ANGLES = [25, 35, 40, 50, 55, 65, 115, 125, 130, 140, 145, 155];

const rad = (deg: number) => (deg * Math.PI) / 180;

/** 中心 c を通り、傾き deg・長さ 2*half の線分をつくる。 */
function lineAt(id: string, c: Pt, deg: number, half: number, label?: string, extend = 0): FigLine {
  const u = { x: Math.cos(rad(deg)), y: Math.sin(rad(deg)) };
  return {
    id,
    a: { x: r2(c.x - u.x * half), y: r2(c.y - u.y * half) },
    b: { x: r2(c.x + u.x * half), y: r2(c.y + u.y * half) },
    label,
    extend,
  };
}

const segOf = (l: FigLine): [Pt, Pt] => [l.a, l.b];

const W = 62;
const H = 44;

/** 2直線の関係を3択で答えさせる問題を組み立てる（レベル①②③で共有）。 */
function makeRelationChoice(
  level: RelationLevel,
  lines: FigLine[],
  kind: 'perp' | 'para' | 'none',
  opts: { extendNote: boolean; sig: string },
): GeoProblem {
  const choices = ['垂直（すいちょく）', '平行（へいこう）', 'どちらでもない'];
  const correct = kind === 'perp' ? 0 : kind === 'para' ? 1 : 2;

  const figure: FigureSpec = {
    w: W,
    h: H,
    lines,
    note: opts.extendNote ? '※ 直線は どちらにも のばして 考えよう' : undefined,
  };

  const explain =
    kind === 'perp'
      ? '2本の直線が **直角に交わって** いるので 垂直だよ。ななめを向いていても、直角に交われば 垂直というよ。'
      : kind === 'para'
        ? '2本の直線は **どこまでいっても交わらない**（はばが どこでも 等しい）ので 平行だよ。'
        : '交わっているけれど 直角ではないし、はばも 等しくないね。だから 垂直でも 平行でもないよ。';

  const diagnose = (given: number): string | null => {
    if (given === correct) return null;
    if (kind === 'perp' && given === 2) {
      return opts.extendNote
        ? 'いまは 交わって見えないけれど、**直線を のばすと 直角に交わる**ね。垂直かどうかは「のばしたときに どう交わるか」で 決まるよ。'
        : '交わっているところの 角を、三角じょうぎの 直角と くらべてみよう。ぴったり 直角だよ。';
    }
    if (kind === 'perp' && given === 1) return '交わっているから 平行では ないよ。交わり方が 直角かどうかを 見よう。';
    if (kind === 'para' && given === 0) return '垂直は「直角に交わる」こと。この2本は 交わっていないね。交わらない2本は 平行だよ。';
    if (kind === 'para' && given === 2) return '2本の はばを 何か所か くらべてみよう。どこでも 同じなら 平行だよ。';
    if (kind === 'none' && given === 0) return '交わってはいるけれど、その角は 直角では ないよ。三角じょうぎの 直角を あててみよう。';
    if (kind === 'none' && given === 1) return 'のばしていくと 交わってしまうね。はばが だんだん せまく（広く）なっているよ。';
    return null;
  };

  return {
    skillId: level,
    moduleId: 'relation',
    prompt: '2本の直線 あ と い は、どんな関係ですか。',
    figure,
    answer: { kind: 'choice', choices, correct },
    hints: [
      '交わっているかな？ 交わっていないなら、直線を のばして 考えてみよう。',
      '交わるなら、その角が 直角かどうかを 見る。交わらないなら、はばが どこでも 等しいかを 見る。',
      kind === 'perp' ? '直角に交わっているよ。' : kind === 'para' ? '交わらないで、はばが ずっと 同じだよ。' : '交わるけれど 直角では ないよ。',
    ],
    explain,
    label: kind === 'perp' ? '垂直の判定' : kind === 'para' ? '平行の判定' : '位置関係の判定',
    diagnose,
    signature: opts.sig,
  };
}

/** ① 垂直をみつける：見た目でも交わっている2直線。 */
function genPerp(): GeoProblem {
  const base = pick(BASE_ANGLES);
  const kind = pick(['perp', 'perp', 'para', 'none'] as const);
  const delta = kind === 'perp' ? 90 : kind === 'para' ? 0 : pick(OFF_ANGLES);
  const c1: Pt = { x: randInt(24, 38), y: randInt(18, 26) };
  // 平行のときだけ2本目をずらす。それ以外は同じ点の近くで交わらせる。
  const gap = kind === 'para' ? randInt(8, 14) : randInt(-3, 3);
  const n = { x: -Math.sin(rad(base)), y: Math.cos(rad(base)) };
  const c2: Pt = { x: c1.x + n.x * gap, y: c1.y + n.y * gap };

  const l1 = lineAt('L1', c1, base, randInt(16, 22), 'あ');
  const l2 = lineAt('L2', c2, base + delta, randInt(16, 22), 'い');
  return makeRelationChoice('rel-perp', [l1, l2], kind, {
    extendNote: false,
    sig: `perp:${base}:${delta}:${gap}`,
  });
}

/**
 * ② のばして たしかめる：**描かれた線分どうしは交わらない**配置だけを出す。
 * 交わって見える配置を除外することで、「交わっていないから垂直ではない」という
 * 誤概念が必ず表面化する。この除外がなければ、このレベルの意味そのものが無くなる。
 */
function genExtend(): GeoProblem {
  const base = pick(BASE_ANGLES);
  const kind = pick(['perp', 'perp', 'none'] as const);
  const delta = kind === 'perp' ? 90 : pick(OFF_ANGLES);

  // 交点は図の中に置きつつ、そこから両方の線分をずらして「離れて見える」ようにする。
  const cross: Pt = { x: randInt(26, 36), y: randInt(18, 26) };
  const u1 = { x: Math.cos(rad(base)), y: Math.sin(rad(base)) };
  const u2 = { x: Math.cos(rad(base + delta)), y: Math.sin(rad(base + delta)) };
  const half = randInt(9, 12);
  const off1 = randInt(11, 14);
  const off2 = randInt(11, 14);
  const s1 = pick([1, -1]);
  const s2 = pick([1, -1]);

  const c1: Pt = { x: cross.x + u1.x * off1 * s1, y: cross.y + u1.y * off1 * s1 };
  const c2: Pt = { x: cross.x + u2.x * off2 * s2, y: cross.y + u2.y * off2 * s2 };
  const l1 = lineAt('L1', c1, base, half, 'あ', 22);
  const l2 = lineAt('L2', c2, base + delta, half, 'い', 22);

  // 保険: 万一 線分どうしが交わる配置になったら、このレベルの前提が崩れるので作り直す
  if (segmentsIntersect(segOf(l1), segOf(l2))) return genExtend();

  return makeRelationChoice('rel-extend', [l1, l2], kind, {
    extendNote: true,
    sig: `ext:${base}:${delta}:${off1}:${off2}:${s1}:${s2}`,
  });
}

/** ③ 平行をみつける：平行と「わずかに傾きが違う」ものを見分ける。 */
function genPara(): GeoProblem {
  const base = pick(BASE_ANGLES);
  const kind = pick(['para', 'para', 'none', 'perp'] as const);
  // 「ほとんど平行だが少しだけ違う」を誤答として出す。見た目だけで判断させないため。
  const delta = kind === 'para' ? 0 : kind === 'perp' ? 90 : pick([8, 10, 12, 14, 168, 170]);
  const gap = randInt(9, 16);
  const n = { x: -Math.sin(rad(base)), y: Math.cos(rad(base)) };
  const c1: Pt = { x: randInt(26, 36), y: randInt(20, 26) };
  const c2: Pt = { x: c1.x + n.x * gap, y: c1.y + n.y * gap };
  const l1 = lineAt('L1', c1, base, randInt(17, 22), 'あ', kind === 'none' ? 16 : 0);
  const l2 = lineAt('L2', c2, base + delta, randInt(17, 22), 'い', kind === 'none' ? 16 : 0);
  return makeRelationChoice('rel-para', [l1, l2], kind, {
    extendNote: kind === 'none',
    sig: `para:${base}:${delta}:${gap}`,
  });
}

/**
 * ④ ぜんぶ みつける（現物テスト大問3と同じ形式）。
 * 直線を3つのグループに分ける:
 *   A: 基準の傾き / B: 基準+90（Aと垂直・B同士は平行）/ C: 無関係な傾き
 * こうすると 垂直の組・平行の組の正解が構成から機械的に決まり、数え落としが起きない。
 */
function genFind(): GeoProblem {
  const base = pick(BASE_ANGLES);
  const off = pick(OFF_ANGLES);
  const relation = pick(['垂直', '平行'] as const);

  // グループの人数。垂直の組が2〜4、平行の組が1〜3 になるように選ぶ。
  const nA = randInt(1, 2);
  const nB = randInt(2, 2);
  const nC = randInt(1, 2);

  const specs: { deg: number }[] = [
    ...Array.from({ length: nA }, () => ({ deg: base })),
    ...Array.from({ length: nB }, () => ({ deg: base + 90 })),
    ...Array.from({ length: nC }, () => ({ deg: base + off })),
  ];
  const order = shuffle(specs.map((_, i) => i));
  const arranged = order.map((i) => specs[i]);

  // 図の中に散らして配置する（重なりすぎないよう、格子状の候補位置から選ぶ）
  const slots: Pt[] = [
    { x: 16, y: 13 }, { x: 34, y: 12 }, { x: 50, y: 14 },
    { x: 14, y: 30 }, { x: 33, y: 31 }, { x: 50, y: 32 },
    { x: 24, y: 21 },
  ];
  const chosen = pickN(slots, arranged.length);

  const lines: FigLine[] = arranged.map((s, i) => lineAt(`L${i}`, chosen[i], s.deg, randInt(8, 11), SYMBOLS[i], 0));

  // 正解の組は、実際の方向ベクトルから判定して作る（構成の意図と実装のズレを防ぐ）
  const correct: [number, number][] = [];
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      const d1 = dirOf(lines[i].a, lines[i].b);
      const d2 = dirOf(lines[j].a, lines[j].b);
      const ok = relation === '垂直' ? isPerpendicularDir(d1, d2) : isParallelDir(d1, d2);
      if (ok) correct.push([i, j]);
    }
  }
  // 組が1つも無い／多すぎるときは作り直す（タップ回数が多くなりすぎるのを防ぐ）
  if (correct.length < 1 || correct.length > 4) return genFind();

  return {
    skillId: 'rel-find',
    moduleId: 'relation',
    prompt: `下の図で、${relation}な 直線の組を **すべて** 見つけて 答えましょう。`,
    figure: { w: W, h: H, lines, note: '※ 直線は のばして 考えてよい' },
    answer: { kind: 'pairs', symbols: lines.map((l) => l.label!), correct, relation },
    hints: [
      relation === '垂直'
        ? '三角じょうぎの 直角を あてて、直角に交わる組を さがそう。'
        : '1本の直線に 垂直な 直線どうしは 平行だよ。まず 垂直な組を 見つけると 見つけやすい。',
      '2本ずつ ていねいに くらべる。交わって見えなくても、のばして 考えるのを わすれずに。',
      `${relation}な組は ${correct.length}組 あるよ。`,
    ],
    explain:
      relation === '垂直'
        ? `${correct.length}組 あったね。向きが 90度 ちがう2本が 垂直だよ。`
        : `${correct.length}組 あったね。同じ向きの2本は、どこまでも 交わらないので 平行だよ。`,
    label: `${relation}な直線の組をすべて`,
    signature: `find:${relation}:${base}:${off}:${arranged.map((s) => s.deg).join(',')}`,
  };
}

/**
 * ⑤ 平行の せいしつ。
 * 2つの型を混ぜる（型が1つだけだと、答えの位置を覚えられてしまう）:
 *  - width: 平行な2直線の「はば」を答える（どこで測っても等しいことの確認）
 *  - fact : 平行・垂直についての正しい説明を選ぶ
 */
function genProp(): GeoProblem {
  const variant = pick(['width', 'width', 'fact'] as const);
  const base = pick(BASE_ANGLES);

  if (variant === 'width') {
    const gap = randInt(3, 9);
    const n = { x: -Math.sin(rad(base)), y: Math.cos(rad(base)) };
    const c1: Pt = { x: randInt(28, 34), y: randInt(20, 26) };
    const c2: Pt = { x: c1.x + n.x * gap * 3, y: c1.y + n.y * gap * 3 };
    const l1 = lineAt('L1', c1, base, 20, 'あ');
    const l2 = lineAt('L2', c2, base, 20, 'い');
    // はばを示す矢印がわりに、垂直な短い線を1本引く（左寄り）
    const probe = lineAt('P', { x: (c1.x + c2.x) / 2 - n.x * 0 - Math.cos(rad(base)) * 12, y: (c1.y + c2.y) / 2 - Math.sin(rad(base)) * 12 }, base + 90, (gap * 3) / 2);
    probe.color = 'accent2';
    return {
      skillId: 'rel-prop',
      moduleId: 'relation',
      prompt: `直線 あ と い は 平行です。赤い線のところで はばを はかると ${gap * 3} マスでした。\nはんたいがわの はしで はかると、はばは 何マスですか。`,
      figure: { w: W, h: H, grid: true, lines: [l1, l2, probe], note: '1マス＝1cm' },
      answer: { kind: 'number', correct: gap * 3, unit: 'マス' },
      hints: [
        '平行な2本の直線には、大事な せいしつが あったね。',
        '「平行な2つの直線の はばは、どこでも 等しい」よ。',
        `はかる場所が ちがっても はばは 変わらない。だから ${gap * 3} マスだよ。`,
      ],
      explain: `平行な2つの直線の **はばは どこでも 等しい** ので、どこで はかっても ${gap * 3} マスだよ。`,
      label: '平行な直線のはば',
      diagnose: (given) => {
        if (given === gap * 3) return null;
        if (given === 0) return 'はばが 0 だと 2本の直線が 重なってしまうね。2本は はなれているよ。';
        return 'はかる 場所を 変えても、平行な2直線の はばは 変わらないよ。もう一度 図を 見てみよう。';
      },
      signature: `prop-w:${base}:${gap}`,
    };
  }

  // fact: 正しい説明を1つ選ぶ。誤答は「役割」で書き分け、値の偶然の一致で重複しないようにする。
  const facts: { text: string; ok: boolean; why: string }[] = [
    { text: '平行な2つの直線は、どこまでいっても 交わらない。', ok: true, why: '平行の いちばん 大事な せいしつだよ。' },
    { text: '平行な2つの直線の はばは、どこでも 等しい。', ok: true, why: '平行の いちばん 大事な せいしつだよ。' },
    { text: '1つの直線に 垂直な 2つの直線は、平行である。', ok: true, why: 'これが 平行の 約束（きめ方）だったね。' },
    { text: '垂直な2つの直線は、かならず たてと よこを 向いている。', ok: false, why: 'ななめどうしでも、直角に交われば 垂直だよ。' },
    { text: '交わって いない 2つの直線は、かならず 平行である。', ok: false, why: 'のばすと 交わることが あるね。のばして 考えよう。' },
    { text: '平行な2つの直線は、長さも 等しい。', ok: false, why: '直線の 長さは 関係ないよ。向きだけで きまる。' },
    { text: '垂直な2つの直線は、いつも 図の中で 交わって 見える。', ok: false, why: 'のばして はじめて 交わることも あるよ。' },
    { text: '平行な2つの直線の はばは、はしに いくほど せまくなる。', ok: false, why: 'はばは どこでも 等しいよ。' },
  ];
  const okOne = pick(facts.filter((f) => f.ok));
  const ngThree = pickN(facts.filter((f) => !f.ok), 3);
  const items = shuffle([okOne, ...ngThree]);
  const correct = items.indexOf(okOne);

  return {
    skillId: 'rel-prop',
    moduleId: 'relation',
    prompt: '垂直と 平行について、**正しい** せつめいを 1つ えらびましょう。',
    figure: {
      w: W,
      h: H,
      lines: [lineAt('L1', { x: 31, y: 16 }, base, 20, 'あ'), lineAt('L2', { x: 31, y: 30 }, base, 20, 'い')],
      note: 'あ と い は 平行',
    },
    answer: { kind: 'choice', choices: items.map((f) => f.text), correct },
    hints: [
      '平行の せいしつを 思い出そう。「交わらない」「はばが どこでも 等しい」だったね。',
      '垂直は「直角に交わる」こと。たて・よこ とは かぎらないよ。',
      `${okOne.text} が 正しいよ。`,
    ],
    explain: `${okOne.text}\n${okOne.why}`,
    label: '垂直・平行のせいしつ',
    diagnose: (given) => (given === correct ? null : items[given].why),
    signature: `prop-f:${base}:${okOne.text}:${ngThree.map((f) => f.text).join('|')}`,
  };
}

export function generateRelation(level: RelationLevel): GeoProblem {
  switch (level) {
    case 'rel-perp':
      return genPerp();
    case 'rel-extend':
      return genExtend();
    case 'rel-para':
      return genPara();
    case 'rel-find':
      return genFind();
    case 'rel-prop':
      return genProp();
  }
}
