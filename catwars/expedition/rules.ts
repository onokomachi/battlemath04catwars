/**
 * 週がわりの遠征の「ルール」（CW-6a・2026-11-17）。1週に1つ。docs/REBUILD_SPEC.md §5a。
 *
 * どのルールも **試合の前に 入力を変えるだけ**（難易度 ChapterDifficulty・敵の基地の配置・ネコの性能表 UnitStatLine）。
 * sim（catwars/sim/）の中には手を入れていない＝決定性も、ふだんの章の数値も そのまま。
 * ネコの性能表は buildSimConfig のあとに `applyRuleToConfig` で書きかえる（ストアは読まない＝PvP と同じ「焼きこみ」）。
 *
 * 合格条件（`npm run test:expedition:balance`）：どのルール・どの戦場・どのレベルでも「とかない」（解かない子）は 0%、
 * 「ふつう」の子は 勝てる（帯は scripts/expeditionTest.ts）。
 */
import type { ChapterDifficulty } from '../data/campaign';
import { BuildingType, type BattleMap } from '../types';
import type { SimConfig, UnitStatLine } from '../sim/types';
import { withExtraDefenses } from '../data/battleMaps';
import { CHARACTER_BY_ID } from '../data/characters';

export type ExpeditionRuleId = 'sky' | 'fog' | 'swarm' | 'nowall' | 'hero' | 'armor' | 'boss' | 'towers';

export interface RuleContext {
  /** 「きょうの しゅやく」で強くなる系統（週で決まる。はじめから使える3系統から） */
  heroFamily: string;
}

export interface ExpeditionRule {
  id: ExpeditionRuleId;
  icon: string;
  /** 子どもに見せる名前（短く） */
  name: string;
  /** どんなルールか（1〜2文。小4が読める ことば） */
  desc: (ctx: RuleContext) => string;
  /** たたかい方のヒント（1行） */
  hint: string;
  /** その戦場で なりたつか（なりたたないときは 次のルールにする） */
  fits?: (map: BattleMap) => boolean;
  difficulty?: (d: ChapterDifficulty) => ChapterDifficulty;
  enemyBase?: (map: BattleMap, base: BattleMap['enemyBase']) => BattleMap['enemyBase'];
  /** ネコ（P1）の性能表を書きかえる（試合の前に1回） */
  units?: (lines: Record<string, UnitStatLine>, ctx: RuleContext) => Record<string, UnitStatLine>;
}

const hasType = (map: BattleMap, t: BuildingType) => map.enemyBase.some((b) => b.type === t);

/** 「きり」で みじかくなる射程（近接 1.2〜1.4 は そのまま。遠くを うつ ネコだけ −1。いちばん短くて 1.5） */
export const FOG_RANGE_CUT = 1;
export const FOG_RANGE_MIN = 1.5;
/** 「きょうの しゅやく」の HP・こうげきの倍率 */
export const HERO_MULT = 1.3;
/** 「きょうの しゅやく」に なる系統（はじめから使える3つ＝だれでも出せる） */
export const HERO_FAMILIES = ['barbarian', 'archer', 'giant'] as const;

export const EXPEDITION_RULES: ExpeditionRule[] = [
  {
    id: 'sky', icon: '🪽', name: 'そらの たいぐん',
    desc: () => '敵は 空を とぶ ドローンだけ。近接の ネコの こうげきは とどかないよ。',
    hint: '遠距離・まほう・砲台で うちおとそう。兵舎を こわすと ドローンは 出てこなくなる。',
    // 空中の敵は 兵舎から出る（兵舎の無い戦場では なりたたない）
    fits: (map) => hasType(map, BuildingType.BARRACKS),
    // 空中の敵は 1ぴきが重い（増援のポイント 60）。近接が とどかないので、出てくる速さは 0.8ばい（test:expedition:balance）
    difficulty: (d) => ({ ...d, unitPool: ['flyer'], enemySpawnRatePerSec: d.enemySpawnRatePerSec * 0.8 }),
  },
  {
    id: 'fog', icon: '🌫️', name: 'きりの せんじょう',
    desc: () => 'きりで とおくが 見えない。遠くを うつ ネコの しゃていが 1 みじかくなる。',
    hint: 'タンク系を 先に 出して、遠距離の ネコを まもりながら 近づこう。',
    units: (lines) => Object.fromEntries(Object.entries(lines).map(([id, l]) => [id,
      l.attackRange >= 2 ? { ...l, attackRange: Math.max(FOG_RANGE_MIN, l.attackRange - FOG_RANGE_CUT) } : l])),
  },
  {
    id: 'swarm', icon: '🐜', name: 'てきが いっぱい',
    desc: () => '敵の 出てくる数が ふだんの 1.6ばい。そのかわり 1ぴきずつは 少し よわい。',
    hint: 'まとめて こうげきできる まほう系と、たくさん うける タンク系が たよりになる。',
    difficulty: (d) => ({
      ...d, enemySpawnRatePerSec: d.enemySpawnRatePerSec * 1.6,
      enemyHpMult: d.enemyHpMult * 0.75, enemyDamageMult: d.enemyDamageMult * 0.85,
    }),
  },
  {
    id: 'nowall', icon: '🧱', name: 'かべの ない とりで',
    desc: () => '敵の 基地に かべが ない。そのかわり 砲台の こうげきが 2わり つよい。',
    hint: '砲台に ねらわれる前に、すばやく コアを めざそう。ぼむにゃーで 砲台を こわすのも いい。',
    fits: (map) => hasType(map, BuildingType.WALL),
    enemyBase: (_map, base) => base.filter((b) => b.type !== BuildingType.WALL),
    difficulty: (d) => ({ ...d, defenseDamageMult: d.defenseDamageMult * 1.2 }),
  },
  {
    id: 'hero', icon: '⭐', name: 'きょうの しゅやく',
    desc: (ctx) => `${familyLabel(ctx.heroFamily)}が 主役の 週。HP と こうげきが 1.3ばい！`,
    hint: '主役の ネコを 出撃メンバーに 入れよう（はじめから いる ネコなので、だれでも 出せる）。',
    units: (lines, ctx) => {
      const l = lines[ctx.heroFamily];
      if (!l) return lines;
      return { ...lines, [ctx.heroFamily]: { ...l, hp: Math.round(l.hp * HERO_MULT), damage: Math.round(l.damage * HERO_MULT) } };
    },
  },
  {
    id: 'armor', icon: '🛡️', name: 'かたい てき',
    desc: () => 'たてロボと 重装ロボが まざって くる。たては まほう いがいの こうげきを 半分に する。',
    hint: 'たてロボには まほう系が よくきく。兵舎を こわすと かたい敵は 出てこなくなる。',
    fits: (map) => hasType(map, BuildingType.BARRACKS),
    difficulty: (d) => ({ ...d, unitPool: [...new Set([...d.unitPool, 'guard' as const, 'brute' as const])] }),
  },
  {
    id: 'boss', icon: '👑', name: 'おやぶん しゅつげん',
    desc: () => 'とちゅうで 親衛隊の おやぶんが やってくる。シールドは 2まい。',
    hint: 'シールドは「ふくしゅうカード」を まちがえずに とくと われるよ。',
    difficulty: (d) => ({ ...d, bossAtSpawnCount: Math.min(d.bossAtSpawnCount ?? 999, 25), bossShield: 2 }),
  },
  {
    id: 'towers', icon: '🗼', name: 'ほうだいの まち',
    desc: () => '敵の コアの 前に 砲台が 2つ ふえている。',
    hint: '砲台は タンク系で 引きつけて、ぼむにゃーや まほうで こわそう。',
    enemyBase: (map, base) => withExtraDefenses(map, base, [BuildingType.CANNON, BuildingType.CANNON]),
  },
];

export const RULE_BY_ID: Record<ExpeditionRuleId, ExpeditionRule> =
  Object.fromEntries(EXPEDITION_RULES.map((r) => [r.id, r])) as Record<ExpeditionRuleId, ExpeditionRule>;

export function familyLabel(id: string): string {
  const c = CHARACTER_BY_ID[id];
  return c ? `${c.displayName}（${c.forms[0].name}）` : id;
}

/** ルールを ネコの性能表に あてた SimConfig を返す（P1 だけ。元の cfg は変えない） */
export function applyRuleToConfig(cfg: SimConfig, rule: ExpeditionRule, ctx: RuleContext): SimConfig {
  if (!rule.units) return cfg;
  return { ...cfg, unitStats: { ...cfg.unitStats, P1: rule.units(cfg.unitStats.P1, ctx) } };
}
