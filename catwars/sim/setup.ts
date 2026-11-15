// ── SimConfig の組み立て ────────────────────────────────────────────────
//
// ★ ロックステップで最も事故りやすい所 ★
//
// レベル（useArmyStore）やデイリーバフ（useProgressStore）は**端末ごとに違う**。
// シミュレーションの途中でこれらを参照すると、相手の端末には無い情報を読むことに
// なり、その瞬間にデシンクする。
//
// そこで「試合開始時に全部解決して SimConfig に焼き込み、以後は SimConfig しか
// 見ない」という形にする。PvP では、この解決ずみテーブルを試合開始時に相手へ
// 送り、**両者がまったく同じ SimConfig オブジェクトを持つ**状態にしてから始める。

import { CHARACTERS, CHARACTER_BY_ID, levelMult } from '../data/characters';
import type { CampaignChapter, ChapterDifficulty } from '../data/campaign';
import type { BattleMap } from '../types';
import { SimConfig, UnitStatLine, SimBuffs, PlayerId } from './types';

/** バフの解決結果（呼び出し側で useProgressStore から作る） */
export interface ResolvedBuffs {
  /** バフ種別 → 効果量。無効なバフはキーごと無い */
  values: Record<string, number>;
}

const v = (b: ResolvedBuffs, key: string): number => b.values[key] ?? 0;

/**
 * 系統ごとに、レベルとバフを適用した最終ステータスを作る（一時ランクアップだけは戦闘中に変わるので sim 側で処理する）。
 *
 * formation（出撃の5枠）を渡すと、**その系統だけ**を表に入れる。表に無い系統は DEPLOY が通らない
 * （＝5枠の外の系統は sim の中で出せない。画面も5枠だけを出す。2026-11-15 CW-4a）。
 */
export function resolveUnitStats(
  levels: Record<string, number>,
  buffs: ResolvedBuffs,
  formation?: string[],
): Record<string, UnitStatLine> {
  const out: Record<string, UnitStatLine> = {};

  for (const c of CHARACTERS) {
    if (formation && !formation.includes(c.id)) continue;
    const m = levelMult(levels[c.id] ?? 1);

    let hp = c.base.hp * m;
    let damage = c.base.damage * m;
    let range = c.base.attackRange;
    let moveSpeed = c.base.moveSpeed;
    let attackSpeed = c.base.attackSpeed;

    if (v(buffs, 'POWER_BOOST')) damage *= 1 + v(buffs, 'POWER_BOOST') / 100;
    if (v(buffs, 'ARMAGEDDON')) damage *= 1 + v(buffs, 'ARMAGEDDON') / 100;
    if (v(buffs, 'SWIFT_ARMY')) moveSpeed *= 1 + v(buffs, 'SWIFT_ARMY') / 100;
    if (v(buffs, 'GENIUS_COMMANDER')) {
      const g = v(buffs, 'GENIUS_COMMANDER') / 100;
      damage *= 1 + g; hp *= 1 + g;
    }
    if (c.id === 'barbarian' && v(buffs, 'RARE_BARBARIAN')) {
      const r = v(buffs, 'RARE_BARBARIAN') / 100;
      hp *= 1 + r; damage *= 1 + r;
    }
    if (c.id === 'archer' && v(buffs, 'RARE_ARCHER')) {
      const r = v(buffs, 'RARE_ARCHER') / 100;
      range += r * 3; attackSpeed *= 1 - r * 0.5;
    }
    if (c.id === 'giant' && v(buffs, 'GIANT_FORTRESS')) {
      hp *= 1 + v(buffs, 'GIANT_FORTRESS') / 100;
    }

    // FAST_DEPLOY バフはキャラごとの待ち時間に比例して効く
    const fd = v(buffs, 'FAST_DEPLOY');
    const cooldownMs = Math.max(400, Math.round(c.cooldownMs * (fd > 0 ? 1 - fd / 100 : 1)));

    out[c.id] = {
      hp: Math.round(hp),
      damage: Math.round(damage),
      attackRange: range,
      attackSpeed: Math.round(attackSpeed),
      moveSpeed,
      cost: c.cost.gold,
      cooldownMs,
      buildingDamageMult: c.buildingDamageMult,
      target: c.base.target,
    };
  }
  return out;
}

export function resolveSimBuffs(buffs: ResolvedBuffs): SimBuffs {
  return { healAuraPct: v(buffs, 'HEAL_AURA') };
}

export function resolveStartEnergy(d: ChapterDifficulty, buffs: ResolvedBuffs): number {
  return d.startEnergy
    + v(buffs, 'GOLD_RUSH')
    + v(buffs, 'EXTRA_TROOPS')
    + v(buffs, 'WIZARD_SUPPORT')
    + v(buffs, 'DRAGON_SUMMON');
}

export function resolveEnergyPerSec(d: ChapterDifficulty, buffs: ResolvedBuffs): number {
  return d.energyPerSec * (1 + v(buffs, 'GOLD_BOOST') / 100);
}

export function resolveDeployCooldownMs(buffs: ResolvedBuffs): number {
  const fd = v(buffs, 'FAST_DEPLOY');
  return fd > 0 ? Math.round(1500 * (1 - fd / 100)) : 1500;
}

export function resolveCostMult(buffs: ResolvedBuffs): number {
  return 1 - v(buffs, 'COST_REDUCTION') / 100;
}

export interface PlayerSetup {
  /** 系統ID → レベル（無ければ1） */
  levels: Record<string, number>;
  buffs: ResolvedBuffs;
  /** 出撃の5枠（無ければ全系統。PvE の敵側・試験用） */
  formation?: string[];
}

/** 相手の情報が無い場合（PvE）に使う、素の設定 */
export const NEUTRAL_SETUP: PlayerSetup = { levels: {}, buffs: { values: {} } };

export function buildSimConfig(args: {
  mode: 'PVE' | 'PVP';
  seed: number;
  chapter: Pick<CampaignChapter, 'enemyName'>;
  difficulty: ChapterDifficulty;
  battleMap: BattleMap | null;
  p1: PlayerSetup;
  p2?: PlayerSetup;
}): SimConfig {
  const p2 = args.p2 ?? NEUTRAL_SETUP;

  const mk = (s: PlayerSetup) => {
    const unitStats = resolveUnitStats(s.levels, s.buffs, s.formation);
    const costMult = resolveCostMult(s.buffs);
    let minCost = Infinity;
    for (const id of Object.keys(unitStats)) {
      minCost = Math.min(minCost, Math.round(unitStats[id].cost * costMult));
    }
    return {
      unitStats,
      costMult,
      minTroopCost: Number.isFinite(minCost) ? minCost : 0,
      energyPerSec: resolveEnergyPerSec(args.difficulty, s.buffs),
      startEnergy: resolveStartEnergy(args.difficulty, s.buffs),
      deployCooldownMs: resolveDeployCooldownMs(s.buffs),
      buffs: resolveSimBuffs(s.buffs),
    };
  };

  const a = mk(args.p1);
  const b = mk(p2);

  const per = <T,>(x: T, y: T): Record<PlayerId, T> => ({ P1: x, P2: y });

  return {
    mode: args.mode,
    seed: args.seed,
    battleMap: args.battleMap,
    difficulty: args.difficulty,
    enemyName: args.chapter.enemyName,
    unitStats: per(a.unitStats, b.unitStats),
    energyPerSec: per(a.energyPerSec, b.energyPerSec),
    startEnergy: per(a.startEnergy, b.startEnergy),
    deployCooldownMs: per(a.deployCooldownMs, b.deployCooldownMs),
    costMult: per(a.costMult, b.costMult),
    minTroopCost: per(a.minTroopCost, b.minTroopCost),
    buffs: per(a.buffs, b.buffs),
  };
}

/** 図鑑に載っている系統ID（出撃UIの並び順に使う） */
export const ALL_TROOP_IDS: string[] = CHARACTERS.map(c => c.id);
export { CHARACTER_BY_ID };
