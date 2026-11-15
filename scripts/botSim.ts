/**
 * バランス計測・レート探索で共通に使う「AIプレイヤー」と「章ごとの想定装備」。
 *
 * balanceTest.ts（計測）と tuneRates.ts（探索）が別々にボットを持っていると、
 * 探索した値を反映しても計測結果が合わない、という事故が起きる。
 * ここに1つだけ置いて両方から使う。
 */
import { SimRunner, CommandProvider } from '../catwars/sim/runner';
import { buildSimConfig, ResolvedBuffs } from '../catwars/sim/setup';
import { SimCommand, TICK_MS, TICKS_PER_SEC } from '../catwars/sim/types';
import {
  CAMPAIGN, ChapterDifficulty, QUIZ_BASE_REWARD, ChapterTier, tierDifficulty, withThreat, threatMultFor, chapterBaseLevel,
} from '../catwars/data/campaign';
import { BATTLE_MAP_BY_ID, tierEnemyBase } from '../catwars/data/battleMaps';
import { facilityMult } from '../catwars/data/facilities';
import { BuildingType } from '../catwars/types';
import { DetRNG } from '../catwars/sim/rng';

/**
 * プレイヤーの上手さ。
 *
 * 戦闘のエナジーは自動ではたまらず、問題を解いて手に入れる。解いている間は戦闘が止まるので、
 * 「何秒に1問」ではなく **「ネコを出したいのにエナジーが足りないとき、解く」** で模す。
 * 上手さは 正答率（まちがえると その問題のエナジーは無し）・根気（1戦で何問まで解くか）・編成の適切さ で表す。
 */
export interface Skill {
  label: string;
  /** 一度もまちがえずに解ける割合 */
  accuracy: number;
  /** 1戦で解く問題の上限（根気）。0 なら「解かない子」 */
  maxProblems: number;
  /** タンクを混ぜる確率（役割理解の指標） */
  tankRatio: number;
  /**
   * 次の一手までの秒数（戦場を見る → 決める → 出す）。機械の速さで出しつづけると、どの章も楽勝に見えてしまう。
   * 8〜10歳の選択反応は大人より遅い（campaign.ts 冒頭の Kail 1991）。問題を解く時間は入れない（その間は戦闘が止まる）。
   */
  actionIntervalSec: number;
}

/**
 * 3段階で挟んで評価する。設計の目標勝率（章1〜2で85%など）は実在の子ども向けの数字なので、
 * 「にがて」がおおよそ目標に届いているかを合格条件にする。
 * 「とかない」は、問題を1問も解かない子。**どの章でも勝てないこと**を毎回確かめる（解かずに勝てる作りに戻さない）。
 */
export const SKILL_LEVELS: Skill[] = [
  { label: 'じょうず', accuracy: 0.92, maxProblems: 30, tankRatio: 0.35, actionIntervalSec: 2.0 },
  { label: 'ふつう',   accuracy: 0.78, maxProblems: 30, tankRatio: 0.25, actionIntervalSec: 3.0 },
  { label: 'にがて',   accuracy: 0.58, maxProblems: 30, tankRatio: 0.10, actionIntervalSec: 4.5 },
];
export const NO_SOLVE_SKILL: Skill = { label: 'とかない', accuracy: 0, maxProblems: 0, tankRatio: 0.25, actionIntervalSec: 3.0 };

export const NORMAL_SKILL: Skill = SKILL_LEVELS[1];
export const WEAK_SKILL: Skill = SKILL_LEVELS[2];

// ── 章ごとの「そこに着いた子が普通に持っているもの」（2026-11-15 CW-4a で作りなおした）────────────
//
// 手持ちのレベル＝その章・その段の めやす（chapterBaseLevel）。レベルは levelMult で少しずつ強くなる。
// 施設：持ちつづける形（data/facilities.ts）。戦闘に出せるのは その日に動かせる数まで（2 + まちがえずに解いた数÷5）。
//   1日に数戦して 10問ほど まちがえずに解いた子を想定し、コアのほか 4つまで（BASE_MID）。
//   施設のレベルは scripts/progressionSim.ts の進み方から（エンジョイ勢が4週間で Lv4・トップ層は げきむず のころ Lv7〜9）。
// バフ：デイリー配布なので日によってブレる。ここでは控えめに見積もる（Lomas et al. 2013 の「易しめが最適」）。
// 出撃の5枠：近接・遠距離・タンク・爆発・魔法（空中・盾持ちに とどく 遠距離・魔法を ふくむ。章の画面で すすめている形）。

export interface Loadout {
  /** 系統ID → レベル */
  levels: Record<string, number>;
  buffs: ResolvedBuffs;
  /** mult＝施設のレベルの倍率 */
  buildings: { type: BuildingType; x: number; y: number; mult?: number }[];
  /** 出撃の5枠（この外の系統は出せない） */
  formation: string[];
}

const CORE_ONLY = [{ type: BuildingType.TOWN_HALL, x: 0, y: 7 }];
const BASE_SMALL = [
  ...CORE_ONLY,
  { type: BuildingType.CANNON, x: 2, y: 5 },
];
const BASE_MID = [
  ...CORE_ONLY,
  { type: BuildingType.CANNON, x: 2, y: 5 },
  { type: BuildingType.CANNON, x: 2, y: 9 },
  { type: BuildingType.WALL, x: 3, y: 6 },
  { type: BuildingType.WALL, x: 3, y: 8 },
];

/** 想定の出撃の5枠（ボットが使う系統。ほかの系統は5枠の外なので出せない） */
export const BOT_FORMATION = ['barbarian', 'archer', 'giant', 'bomber', 'magic'];

const ALL_FAMILIES = ['barbarian', 'archer', 'giant', 'bomber', 'magic', 'speed', 'flying', 'healer'];

/** 章・段ごとの 施設のレベル（progressionSim の進み方から） */
function facilityLevelFor(chNo: number, tier: ChapterTier): number {
  if (tier === 'hard') return 5;
  if (tier === 'extreme') return 7;
  return 1 + Math.floor((chNo - 1) / 2);
}

/**
 * 手持ちのレベルが level の子の想定装備（章・段で 施設とバフを決める）。
 * 章ごとの想定装備も、脅威レベルの試験（めやす＋20）も、これ1つで作る。
 */
export function loadoutForLevel(level: number, chNo = 8, tier: ChapterTier = 'normal'): Loadout {
  const lv = Math.max(1, Math.round(level));
  const buffs: Record<string, number> =
    tier !== 'normal' || chNo >= 8 ? { POWER_BOOST: 15, GENIUS_COMMANDER: 10 }
    : chNo >= 7 ? { POWER_BOOST: 15 }
    : chNo >= 6 ? { POWER_BOOST: 10 }
    : {};
  const base = tier !== 'normal' || chNo >= 5 ? BASE_MID : chNo >= 3 ? BASE_SMALL : CORE_ONLY;
  const fl = facilityLevelFor(chNo, tier);
  return {
    levels: Object.fromEntries(ALL_FAMILIES.map(id => [id, lv])),
    buffs: { values: buffs },
    buildings: base.map(b => ({ ...b, mult: facilityMult(b.type, fl) })),
    formation: BOT_FORMATION,
  };
}

/** その章・その段に着いた子の想定装備（手持ち＝めやすのレベル＋plus） */
export function loadoutForChapter(chapterIndex: number, tier: ChapterTier = 'normal', plus = 0): Loadout {
  const ch = CAMPAIGN[chapterIndex];
  return loadoutForLevel(chapterBaseLevel(ch, tier) + plus, ch.no, tier);
}

/** 何も育てていない最悪ケース（ここでも詰まないかの下限チェック用） */
export const BARE_LOADOUT: Loadout = {
  levels: {}, buffs: { values: {} }, buildings: CORE_ONLY, formation: BOT_FORMATION,
};

/**
 * AIプレイヤー。
 * ・出せるものがあれば自陣ゾーンの前線寄りに出す（安いものを主軸に、たまにタンク）
 * ・エナジーが足りないときは、問題を解いて手に入れる（正答率と根気は Skill）
 * ・役割を理解したプレイヤーを模し、攻城(ぼむにゃー)・盾(にゃいあんと)を混ぜる
 */
export class BotPlayer implements CommandProvider {
  private rng: DetRNG;
  private queued: SimCommand[] = [];
  private streak = 0;
  private nextActionTick = 0;
  /** 解いた問題の数・うち まちがえずに解けた数 */
  problems = 0;
  corrects = 0;

  constructor(private runner: SimRunner, private skill: Skill, seed: number, private tiered = false) {
    this.rng = new DetRNG(seed);
  }

  think(): void {
    const st = this.runner.state;
    const cfg = this.runner.cfg;
    const p = st.players.P1;

    const zone = this.runner.statics.deployZones.P1;
    if (!zone) return;
    // 人の速さでしか動かない
    if (st.tick < this.nextActionTick) return;
    // ボスにシールドがあるときは、復習の問題を解いて わる（まちがえたら われない。1手ぶんの時間を使う）
    if (st.entities.some(e => e.team === 'DEFENDER' && (e.shield ?? 0) > 0) && this.problems < this.skill.maxProblems) {
      this.problems++;
      if (this.rng.next() < this.skill.accuracy) {
        this.corrects++; this.streak++;
        this.queued.push({ type: 'BREAK_SHIELD', player: 'P1' });
      } else this.streak = 0;
      this.nextActionTick = st.tick + Math.round(this.skill.actionIntervalSec * TICKS_PER_SEC);
      return;
    }
    const roll = this.rng.next();
    // むずかしい・げきむず では、新しい敵に合わせて 魔法（盾持ちに強い）・遠距離（空中にとどく）を混ぜる。
    // 役割が分かっている子ほど（tankRatio を目安にする）よく混ぜる
    const counter = this.tiered && this.rng.next() < 0.15 + this.skill.tankRatio;
    const order = counter ? (this.rng.next() < 0.5 ? ['magic', 'archer', 'barbarian'] : ['archer', 'barbarian', 'giant'])
                : roll < 0.18 ? ['bomber', 'giant', 'barbarian']
                : roll < this.skill.tankRatio + 0.18 ? ['giant', 'barbarian', 'archer']
                : ['barbarian', 'archer', 'giant'];

    // このティックに 解いて入るぶん（命令は次のティックで効くので、見こみを足して考える）
    let pending = 0;
    for (const id of order) {
      const line = cfg.unitStats.P1[id];
      if (!line) continue;
      const cost = Math.round(line.cost * cfg.costMult.P1);
      const last = p.deployCd[id];
      const cdTicks = Math.max(1, Math.round(line.cooldownMs / TICK_MS));
      if (last !== undefined && st.tick - last < cdTicks) continue;
      // 足りないときは、足りるまで問題を解く（解いている間は戦闘が止まるので、時間は進まない）
      while (p.energy + pending < cost && this.problems < this.skill.maxProblems) {
        this.problems++;
        if (this.rng.next() < this.skill.accuracy) {
          this.streak++;
          this.corrects++;
          // むずかしさは 1〜5 が同じ割合で出るとみる。連続正解で ×1.0〜2.0（InBattleQuiz と同じ式）
          const weight = 0.75 + 0.175 * this.rng.int(5);
          const combo = Math.min(2.0, 1 + (this.streak - 1) * 0.2);
          const amount = Math.round(QUIZ_BASE_REWARD * weight * combo);
          pending += amount;
          this.queued.push({ type: 'GRANT_ENERGY', player: 'P1', amount });
        } else {
          this.streak = 0;
        }
      }
      if (p.energy + pending < cost) continue;
      pending -= cost;
      this.nextActionTick = st.tick + Math.round(this.skill.actionIntervalSec * TICKS_PER_SEC);
      this.queued.push({
        type: 'DEPLOY', player: 'P1', troopId: id,
        x: Math.max(zone.xMin, zone.xMax - 1 - this.rng.int(2)),
        y: zone.yMin + this.rng.int(Math.max(1, zone.yMax - zone.yMin + 1)),
      });
      break;
    }
  }

  commandsForTick(): SimCommand[] {
    const c = this.queued;
    this.queued = [];
    return c;
  }
}

export interface PlayResult {
  win: boolean;
  seconds: number;
  enemySpawned: number;
  /** 同時に盤上へ出た最大エンティティ数（描画負荷の上限を見るため） */
  peakEntities: number;
  /** 解いた問題の数・うち まちがえずに解けた数 */
  problems: number;
  corrects: number;
}

export interface PlayOptions {
  /** 章の難易度を差し替える（レート探索で使う） */
  difficulty?: ChapterDifficulty;
  loadout?: Loadout;
  maxSeconds?: number;
  skill?: Skill;
  /** 難易度の段（既定は ふつう） */
  tier?: ChapterTier;
  /** 章の基準より どれだけ育てたか（レベル）。脅威レベルの試験で使う */
  plusLevel?: number;
  /** 脅威レベルを はたらかせない（くらべるため） */
  noThreat?: boolean;
}

/** 1試合ぶんシミュレーションして結果を返す（同じ seed なら必ず同じ結果） */
export function playOnce(chapterIndex: number, seed: number, opts: PlayOptions = {}): PlayResult {
  const ch = CAMPAIGN[chapterIndex];
  const map = BATTLE_MAP_BY_ID[ch.mapId];
  const tier = opts.tier ?? 'normal';
  const plus = opts.plusLevel ?? 0;
  const baseLevel = chapterBaseLevel(ch, tier);
  const kit = opts.loadout ?? loadoutForChapter(chapterIndex, tier, plus);
  const skill = opts.skill ?? NORMAL_SKILL;
  const threat = opts.noThreat ? 1 : threatMultFor(baseLevel + plus, baseLevel);
  const difficulty = withThreat(opts.difficulty ?? tierDifficulty(ch, tier), threat);

  const cfg = buildSimConfig({
    mode: 'PVE', seed, chapter: ch,
    difficulty,
    battleMap: map,
    p1: { levels: kit.levels, buffs: kit.buffs, formation: kit.formation },
  });
  const runner = new SimRunner(cfg, {
    defenderBuildings: tierEnemyBase(map, tier),
    playerBuildings: kit.buildings,
    spellCharges: { P1: { HEAL: 2, RAGE: 2 }, P2: { HEAL: 0, RAGE: 0 } },
  });
  // 特別な敵（空中・盾持ち など）が出る章では、それに合う系統を混ぜる（章の画面に 敵の種類と たおし方を出している）
  const special = difficulty.unitPool.some(k => k === 'flyer' || k === 'guard' || k === 'medic' || k === 'kamikaze');
  const bot = new BotPlayer(runner, skill, seed ^ 0x5bf03635, special);

  const maxTicks = (opts.maxSeconds ?? 300) * TICKS_PER_SEC;
  let peak = 0;
  for (let i = 0; i < maxTicks; i++) {
    bot.think();
    runner.advance(TICK_MS, bot);
    if (i % 20 === 0 && runner.state.entities.length > peak) peak = runner.state.entities.length;
    if (runner.state.result) break;
  }
  return {
    win: runner.state.result === 'P1',
    seconds: runner.tick / TICKS_PER_SEC,
    enemySpawned: runner.state.ai.spawnCount,
    peakEntities: peak,
    problems: bot.problems,
    corrects: bot.corrects,
  };
}

/** 計測のたねを固定しておく（毎回同じ試合列を回すので、差分が読める） */
export const seedFor = (run: number): number => 1000 + run * 7919;
