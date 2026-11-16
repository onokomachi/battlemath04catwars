// このファイルは単元アプリ syo4-suityoku-heikotosikakkei の src/lib/problems/life.ts の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * モジュール7「まちの中の垂直・平行」＝ 活用。
 *
 * 解説 p.202 の「日常生活の中には，平行な二直線や，垂直な二直線が数多く見いだせることを知る」
 * と、東京書籍が単元の導入で使う「地図を見て道の交わり方を調べる」場面に対応する。
 *
 * 「判定・計算・作図」だけを実装して活用を落とすのがよくある抜け。ここは技能としては
 * やさしいが、単元の入口と出口（学んだことを身のまわりに見つける）にあたる。
 */
import { FigLine, FigureSpec, Pt } from '../../types';
import { GeoProblem, LevelDef } from '../problemTypes';
import { dirOf, isParallelDir, isPerpendicularDir, r2 } from '../geometry';
import { pick, pickN, shuffle } from './rng';

export type LifeLevel = 'life-map' | 'life-object';

export const LIFE_LEVELS: LevelDef<LifeLevel>[] = [
  { id: 'life-map', label: '① まちの 地図', desc: '道の 交わり方から 垂直・平行を 見つけよう。' },
  { id: 'life-object', label: '② 身のまわりの 形', desc: '身のまわりの ものに かくれた 垂直・平行。' },
];

const W = 62;
const H = 44;

const ROAD_NAMES = ['さくら通り', 'ひばり通り', 'みどり通り', 'かえで通り', 'すずかけ通り', 'あおば通り', 'ゆりのき通り', 'けやき通り'];
const rad = (d: number) => (d * Math.PI) / 180;

function road(id: string, c: Pt, deg: number, half: number, label: string): FigLine {
  const u = { x: Math.cos(rad(deg)), y: Math.sin(rad(deg)) };
  return {
    id,
    a: { x: r2(c.x - u.x * half), y: r2(c.y - u.y * half) },
    b: { x: r2(c.x + u.x * half), y: r2(c.y + u.y * half) },
    label,
  };
}

/* ============================ ① まちの 地図 ============================ */

function genMap(): GeoProblem {
  const base = pick([0, 10, 15, 20, 30, 35, 45, 55, 60, 70, 75, 105, 115, 120, 135, 150]);
  const relation = pick(['垂直', '平行'] as const);
  const names = pickN(ROAD_NAMES, 5);

  // 基準の道と、垂直・平行・無関係 をそれぞれ用意する。
  // 正解が必ず1本だけになる構成にして「すべて選ぶ」ではなく単一選択で答えられるようにする。
  const off = pick([25, 35, 40, 50, 55, 65, 115, 125, 130, 140]);
  const specs: { deg: number; slot: Pt }[] = [
    { deg: base, slot: { x: 31, y: 22 } },                       // 基準（0番）
    { deg: base + 90, slot: { x: 18, y: 14 } },                  // 垂直
    { deg: base, slot: { x: 44, y: 32 } },                       // 平行
    { deg: base + off, slot: { x: 20, y: 33 } },                 // 無関係1
    { deg: base + off + 20, slot: { x: 46, y: 12 } },            // 無関係2
  ];
  const lines = specs.map((s, i) => road(`R${i}`, s.slot, s.deg, i === 0 ? 22 : 13, names[i]));

  // 正解は構成の意図ではなく、実際の方向ベクトルから判定する
  const d0 = dirOf(lines[0].a, lines[0].b);
  const hits = lines
    .map((l, i) => (i === 0 ? -1 : (relation === '垂直' ? isPerpendicularDir(dirOf(l.a, l.b), d0) : isParallelDir(dirOf(l.a, l.b), d0)) ? i : -1))
    .filter((i) => i > 0);
  if (hits.length !== 1) return genMap();

  const others = lines.map((_, i) => i).filter((i) => i > 0 && i !== hits[0]);
  const shownIdx = shuffle([hits[0], ...others]);
  const correct = shownIdx.indexOf(hits[0]);

  const figure: FigureSpec = {
    w: W,
    h: H,
    lines: lines.map((l, i) => ({ ...l, color: i === 0 ? 'accent' : 'base', extend: 10 })),
    note: '※ 道は のばして 考えてよい',
  };

  return {
    skillId: 'life-map',
    moduleId: 'life',
    prompt: `まちの 地図です。**${names[0]}**（青い道）に **${relation}** な 道は どれですか。`,
    figure,
    answer: { kind: 'choice', choices: shownIdx.map((i) => names[i]), correct },
    hints: [
      relation === '垂直'
        ? '三角じょうぎの 直角を 道の 交わるところに あててみよう。'
        : '2本の 道の はばが、どこでも 同じかを 見よう。',
      '交わって 見えない道も、のばして 考えると 交わるかも しれないよ。',
      `${names[hits[0]]} だよ。`,
    ],
    explain:
      relation === '垂直'
        ? `${names[0]} と ${names[hits[0]]} は **直角に交わる** ので 垂直だよ。まちの中には、こうした 垂直な 道が たくさん あるね。`
        : `${names[0]} と ${names[hits[0]]} は 向きが 同じで **どこまでも 交わらない** ので 平行だよ。`,
    label: `地図の中の${relation}`,
    diagnose: (given) => {
      if (given === correct) return null;
      const idx = shownIdx[given];
      const d = dirOf(lines[idx].a, lines[idx].b);
      if (relation === '垂直' && isParallelDir(d, d0)) return 'その道は 基準の道と **平行**（同じ向き）だよ。垂直は 直角に交わる ことだったね。';
      if (relation === '平行' && isPerpendicularDir(d, d0)) return 'その道は 基準の道と **垂直**（直角に交わる）だよ。平行は 交わらないこと。';
      return relation === '垂直'
        ? '交わってはいるけれど、その角は 直角では ないよ。三角じょうぎの 直角と くらべよう。'
        : 'その道は のばしていくと 交わってしまうよ。はばが 同じか たしかめよう。';
    },
    signature: `life-map:${relation}:${base}:${off}:${names.join(',')}`,
  };
}

/* ============================ ② 身のまわりの 形 ============================ */

/** 身のまわりのものを、線と四角形だけで表した図。 */
interface LifeScene {
  name: string;
  figure: FigureSpec;
  /** その場面で「たしかに使われている」性質 */
  fact: { text: string; why: string };
  /** その場面には当てはまらない説明 */
  wrong: { text: string; why: string }[];
}

function ladderScene(): LifeScene {
  const tilt = pick([0, 6, -6, 10, -10]);
  const u = { x: Math.cos(rad(90 + tilt)), y: Math.sin(rad(90 + tilt)) };
  const n = { x: -u.y, y: u.x };
  const gap = 14;
  const left: Pt = { x: 24, y: 6 };
  const right: Pt = { x: left.x + n.x * gap, y: left.y + n.y * gap };
  const lines: FigLine[] = [
    { id: 'p1', a: left, b: { x: left.x + u.x * 34, y: left.y + u.y * 34 } },
    { id: 'p2', a: right, b: { x: right.x + u.x * 34, y: right.y + u.y * 34 } },
  ];
  for (let i = 1; i <= 4; i++) {
    const t = i * 7;
    lines.push({
      id: `s${i}`,
      a: { x: left.x + u.x * t, y: left.y + u.y * t },
      b: { x: right.x + u.x * t, y: right.y + u.y * t },
      color: 'accent',
    });
  }
  return {
    name: 'はしご',
    figure: { w: W, h: H, lines, note: 'はしご' },
    fact: {
      text: 'だん（横の 棒）は、たがいに **平行** である',
      why: 'だんが 平行だから、どこに 足を かけても 同じ はばで、のぼりやすいんだね。',
    },
    wrong: [
      { text: 'だんは、たがいに **垂直** である', why: 'だんどうしは 交わらないね。交わらないのだから 垂直では ないよ。' },
      { text: '2本の 支柱（たての 棒）は 交わっている', why: '支柱は 平行なので、のばしても 交わらないよ。' },
      { text: 'だんと 支柱は **平行** である', why: 'だんと 支柱は 直角に交わっているね。それは 平行では なく 垂直だよ。' },
    ],
  };
}

function railScene(): LifeScene {
  const tilt = pick([8, 12, 16, -8, -12, -16]);
  const u = { x: Math.cos(rad(tilt)), y: Math.sin(rad(tilt)) };
  const n = { x: -u.y, y: u.x };
  const gap = 12;
  const a: Pt = { x: 6, y: 16 };
  const b: Pt = { x: a.x + n.x * gap, y: a.y + n.y * gap };
  const lines: FigLine[] = [
    { id: 'r1', a, b: { x: a.x + u.x * 50, y: a.y + u.y * 50 } },
    { id: 'r2', a: b, b: { x: b.x + u.x * 50, y: b.y + u.y * 50 } },
  ];
  for (let i = 1; i <= 6; i++) {
    const t = i * 7;
    lines.push({
      id: `t${i}`,
      a: { x: a.x + u.x * t - n.x * 3, y: a.y + u.y * t - n.y * 3 },
      b: { x: b.x + u.x * t + n.x * 3, y: b.y + u.y * t + n.y * 3 },
      color: 'accent',
    });
  }
  return {
    name: '線路',
    figure: { w: W, h: H, lines, note: '線路（レールと まくら木）' },
    fact: {
      text: '2本の レールは **平行** である',
      why: 'レールの はばが どこでも 等しいから、電車が 安全に 走れるんだね。',
    },
    wrong: [
      { text: '2本の レールは 遠くで 交わる', why: '絵では 遠くで 近づいて 見えるけれど、じっさいの はばは どこでも 同じ。平行だから 交わらないよ。' },
      { text: 'レールと まくら木は **平行** である', why: 'レールと まくら木は 直角に交わっているね。それは 垂直だよ。' },
      { text: 'まくら木どうしは **垂直** である', why: 'まくら木どうしは 交わらないので、垂直では なく 平行だよ。' },
    ],
  };
}

function windowScene(): LifeScene {
  const tilt = pick([0, 5, -5, 8, -8]);
  const u = { x: Math.cos(rad(tilt)), y: Math.sin(rad(tilt)) };
  const v = { x: -u.y, y: u.x };
  const o: Pt = { x: 12, y: 8 };
  const wLen = 38;
  const hLen = 28;
  const corner = (a: number, b: number): Pt => ({ x: o.x + u.x * a + v.x * b, y: o.y + u.y * a + v.y * b });
  const pts = [corner(0, 0), corner(wLen, 0), corner(wLen, hLen), corner(0, hLen)];
  const lines: FigLine[] = [
    { id: 'v1', a: corner(wLen / 2, 0), b: corner(wLen / 2, hLen), color: 'accent' },
    { id: 'h1', a: corner(0, hLen / 2), b: corner(wLen, hLen / 2), color: 'accent' },
  ];
  return {
    name: 'まどわく',
    figure: {
      w: W,
      h: H,
      polys: [{ id: 'frame', pts, fill: 'none', rightAngleAt: [0, 1, 2, 3] }],
      lines,
      note: 'まどわく（十字の さん つき）',
    },
    fact: {
      text: 'たての さんと 横の さんは **垂直** に交わっている',
      why: '直角に交わるように 作ると、まどわくが ゆがまず じょうぶに なるんだね。',
    },
    wrong: [
      { text: 'たての さんと 横の さんは **平行** である', why: '2本は 交わっているね。交わるものは 平行では ないよ。' },
      { text: '向かい合う わくは **垂直** である', why: '向かい合う わくは 交わらないので、垂直では なく 平行だよ。' },
      { text: 'まどわくの 4つの角は 直角では ない', why: '図の 小さな 四角い しるしは 直角の しるし。4つとも 直角だよ。' },
    ],
  };
}

const SCENES = [ladderScene, railScene, windowScene];

function genObject(): GeoProblem {
  const scene = pick(SCENES)();
  const wrongThree = pickN(scene.wrong, 3);
  const items = shuffle([{ ...scene.fact, ok: true }, ...wrongThree.map((w) => ({ ...w, ok: false }))]);
  const correct = items.findIndex((i) => i.ok);

  return {
    skillId: 'life-object',
    moduleId: 'life',
    prompt: `**${scene.name}** の 図です。この形について **正しい** ものを 1つ えらびましょう。`,
    figure: scene.figure,
    answer: { kind: 'choice', choices: items.map((i) => i.text), correct },
    hints: [
      '交わっているか、交わっていないかを まず 見よう。',
      '交わるなら「直角かどうか」、交わらないなら「はばが どこでも 等しいか」を 見る。',
      `「${items[correct].text}」が 正しいよ。`,
    ],
    explain: `${items[correct].text}\n${items[correct].why}`,
    label: `身のまわりの垂直・平行（${scene.name}）`,
    diagnose: (given) => (given === correct ? null : items[given].why),
    signature: `life-object:${scene.name}:${items.map((i) => i.text).join('|')}`,
  };
}

export function generateLife(level: LifeLevel): GeoProblem {
  switch (level) {
    case 'life-map':
      return genMap();
    case 'life-object':
      return genObject();
  }
}
