// ── 決定論シミュレーション本体 ───────────────────────────────────────────
//
// BattleScene.tsx の戦闘ロジックを、React から切り離した純粋関数に移植したもの。
// 「同じ SimConfig ＋ 同じコマンド列 → 同じ SimState」が保証される。
//
// 移植にあたって変えたのは以下の4点だけで、ゲームバランスの数値は変えていない。
//
//   1. 時刻を Date.now()(ms) から tick 番号に置換
//   2. 移動量を「1フレームあたり」から「1tickあたり」に置換（＝フレームレート非依存）
//   3. Math.pow/hypot/atan2/cos/sin を sim/math.ts の決定論版に置換
//   4. 演出（弾道・ヒットエフェクト・メッセージ・SFX）を戻り値の SimEvent に分離
//
// PvE と PvP は同じコードを通る。違いは「P2の行動をAIが決めるか、
// ネットワーク越しのコマンドが決めるか」だけ（cfg.mode で分岐）。

import { BattleEntity, BuildingType, GRID_W, GRID_H, Coordinates } from '../types';
import { BUILDING_STATS } from '../constants';
import { CHARACTER_BY_ID } from '../data/characters';
import {
  ENEMY_UNIT_STATS, ENEMY_UNIT_COST, enemySpawnRate, pickWeightedEnemyUnit,
  ENEMY_SPAWN_BUILDINGS, ENEMY_PRODUCTION_RATE, BARRACKS_ONLY_UNITS, EnemyUnitKind,
  MEDIC_HEAL_PCT, MEDIC_HEAL_RADIUS, MEDIC_HEAL_INTERVAL_MS, GUARD_PHYSICAL_MULT, GUARD_MAGIC_MULT, SHIELD_DAMAGE_MULT,
} from '../data/campaign';
import { collectWallCells, hasLineOfSight, isFlying, pickDefenseTarget } from '../utils/combatRules';
import { ALIEN_STATS, LAVA_DPS, collectLavaCells, makeAlienEntity, makeTitanEntity } from '../utils/stageHazards';
import { buildTerrainCostMap, TerrainCostMap } from '../utils/aiEngine';
import { findPathDet } from './pathfind';
import { DetRNG } from './rng';
import { dist, dist2, len, stepToward } from './math';
import {
  SimState, SimConfig, SimCommand, SimEvent, PlayerId, PlayerSimState,
  TICK_MS, TICKS_PER_SEC, msToTicks, TEAM_OF, OPPONENT,
} from './types';
import type { SkillEffects } from '../data/skills';

// 旧実装は「1フレームあたり moveSpeed*0.013」だった。60fps 換算で
// moveSpeed 1 あたり毎秒 0.78 マス。バランスを変えないようこの係数を保つ。
const MOVE_CELLS_PER_SEC = 0.78;
// 経路が見つからないときの直進フォールバックは旧実装で 0.010（=毎秒0.6マス）
const FALLBACK_CELLS_PER_SEC = 0.60;

/** 「手詰まり」が続いたと判定するまでの時間（30秒） */
const STALL_LOSE_TICKS = msToTicks(30000);
const SPELL_DURATION_TICKS = msToTicks(6000);
const SPELL_RADIUS = 2.8;
const HEAL_AURA_INTERVAL_TICKS = msToTicks(3000);
const IN_BATTLE_BUILD_COSTS: Partial<Record<BuildingType, number>> = {
  [BuildingType.WALL]: 40,
  [BuildingType.CANNON]: 120,
  [BuildingType.ARMY_CAMP]: 80,
};

/** そのエンティティがどちらのプレイヤーのものか（中立は null） */
export function playerOf(e: BattleEntity): PlayerId | null {
  if (e.team === 'ATTACKER' || e.team === 'ATTACKER_BUILDING') return 'P1';
  if (e.team === 'DEFENDER') return 'P2';
  return null;
}

/** 敵対関係。中立はすべてに敵対し、すべてから敵対される。 */
function isHostile(a: BattleEntity, b: BattleEntity): boolean {
  const pa = playerOf(a);
  const pb = playerOf(b);
  if (pa === null || pb === null) return true;
  return pa !== pb;
}

/**
 * 特別なきまりを通したダメージ（盾持ち・ボスのシールド）。攻撃は applyHit か ここを通す。
 * attackerSub は こうげきした側の subType（施設の こうげきは null）。
 */
function dealDamage(target: BattleEntity, amount: number, attackerSub: string | null): void {
  let a = amount;
  if (target.kind === 'guard' && attackerSub !== null) {
    a *= attackerSub === 'magic' ? GUARD_MAGIC_MULT : GUARD_PHYSICAL_MULT;
  }
  if ((target.shield ?? 0) > 0) a *= SHIELD_DAMAGE_MULT;
  target.hp -= a;
}

// ── スキル（data/skills.ts。2026-11-15 CW-4b）──────────────────────────────
// 効き目の数値は 試合開始時に cfg.unitStats[player][系統].skills に焼きこみずみ。ここは きまりだけ。

/** プレイヤーのネコの スキル（敵AIの兵・施設・中立には無い） */
function skillsOf(cfg: SimConfig, e: BattleEntity): SkillEffects | undefined {
  if (e.type !== 'TROOP' || e.kind) return undefined;
  const owner = playerOf(e);
  if (!owner) return undefined;
  return cfg.unitStats[owner][e.subType]?.skills;
}

/** こうげきしない施設（スキル「うらまわり」の相手） */
const SUPPORT_BUILDINGS: string[] = [BuildingType.GOLD_MINE, BuildingType.ARMY_CAMP, BuildingType.BARRACKS];

const within = (a: BattleEntity, b: BattleEntity, r: number): boolean => dist2(a.x, a.y, b.x, b.y) <= r * r;

/**
 * 1回の こうげき（スキルを通す）。
 * amount＝この相手への ダメージ（施設への倍率は 掛けずみ）。splashBase＝まわりに あたるときの もとの こうげき力（0 なら まわりには あたらない）。
 */
function applyHit(
  state: SimState, cfg: SimConfig, attacker: BattleEntity | null, target: BattleEntity, amount: number, splashBase = 0,
): void {
  const ak = attacker ? skillsOf(cfg, attacker) : undefined;
  let a = amount;
  if (ak && attacker) {
    if (ak.vsFlyerMult && target.kind === 'flyer') a *= ak.vsFlyerMult;
    if (ak.vsGuardMult && target.kind === 'guard') a *= ak.vsGuardMult;
    if (ak.vsPreferMult && ak.preferKind && target.kind === ak.preferKind) a *= ak.vsPreferMult;
    if (target.type === 'BUILDING') {
      if (ak.vsSupportMult && SUPPORT_BUILDINGS.includes(target.subType)) a *= ak.vsSupportMult;
      if (ak.vsWallMult && target.subType === BuildingType.WALL) a *= ak.vsWallMult;
    }
    if (ak.firstHitMult && splashBase > 0 && !attacker.firstHitDone) { a *= ak.firstHitMult; attacker.firstHitDone = true; }
  }
  // シールドのある ボスの こうげきは、ちかくの「しずめの うた」で よわまる（1体ぶんだけ）
  if (attacker && attacker.kind === 'boss' && (attacker.shield ?? 0) > 0) {
    for (const h of state.entities) {
      const hk = h.hp > 0 ? skillsOf(cfg, h) : undefined;
      if (hk?.bossWeakenPct && isHostile(h, attacker) && within(h, attacker, hk.bossWeakenRadius ?? 3)) { a *= 1 - hk.bossWeakenPct; break; }
    }
  }
  const tk = skillsOf(cfg, target);
  if (tk) {
    if (tk.spawnGuardMs && target.bornTick !== undefined && state.tick - target.bornTick < msToTicks(tk.spawnGuardMs)) return;
    if (tk.packAllies) {
      let n = 0;
      for (const o of state.entities) {
        if (o !== target && o.type === 'TROOP' && o.hp > 0 && o.team === target.team && within(o, target, tk.packRadius ?? 1.6)) n++;
      }
      if (n >= tk.packAllies) a *= tk.packTakenMult ?? 1;
    }
  }
  // 施設の こうげきを、ちかくのタンク（かばう）が 一部 ひきうける
  if (attacker && attacker.type === 'BUILDING' && target.type === 'TROOP' && !target.kind && target.subType !== 'giant') {
    for (const g of state.entities) {
      const gk = g.hp > 0 ? skillsOf(cfg, g) : undefined;
      if (!gk?.coverPct || g.team !== target.team || !within(g, target, gk.coverRadius ?? 2)) continue;
      const share = a * gk.coverPct;
      a -= share;
      const resist = CHARACTER_BY_ID[g.subType]?.defenseResist ?? 0;
      g.hp -= share * (1 - resist);
      break;
    }
  }
  const before = target.hp;
  dealDamage(target, a, attacker && attacker.type === 'TROOP' ? attacker.subType : null);
  if (ak?.healOnKillPct && attacker && before > 0 && target.hp <= 0) {
    attacker.hp = Math.min(attacker.maxHp, attacker.hp + attacker.maxHp * ak.healOnKillPct);
  }
  // まわりにも あたる（魔法・爆発）。まわりの相手には もう一度は ひろがらない
  if (ak?.splashPct && attacker && splashBase > 0) {
    const r = ak.splashRadius ?? 1;
    const owner = playerOf(attacker);
    const bMult = owner ? (cfg.unitStats[owner][attacker.subType]?.buildingDamageMult ?? 1) : 1;
    for (const o of state.entities) {
      if (o === target || o.hp <= 0 || o.isHidden || !isHostile(attacker, o) || !canReach(attacker, o)) continue;
      if (!within(o, target, r)) continue;
      applyHit(state, cfg, attacker, o, splashBase * ak.splashPct * (o.type === 'BUILDING' ? bMult : 1), 0);
    }
  }
}

/** たおれたネコの スキル（さいごの はげまし・さいごの ばくはつ）。死んだものを取りのぞく前に 1回だけ */
function applyDeathSkills(state: SimState, cfg: SimConfig): void {
  const dead = state.entities.filter(e => e.hp <= 0);
  for (const e of dead) {
    const sk = skillsOf(cfg, e);
    if (!sk) continue;
    if (sk.deathHealPct) {
      const r = sk.deathHealRadius ?? 2.5;
      for (const o of state.entities) {
        if (o === e || o.type !== 'TROOP' || o.hp <= 0 || o.team !== e.team || !within(o, e, r)) continue;
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * sk.deathHealPct);
      }
    }
    if (sk.deathBlastMult) {
      const r = sk.deathBlastRadius ?? 1.5;
      const owner = playerOf(e);
      const bMult = owner ? (cfg.unitStats[owner][e.subType]?.buildingDamageMult ?? 1) : 1;
      for (const o of state.entities) {
        if (o.hp <= 0 || o.isHidden || !isHostile(e, o) || !within(o, e, r)) continue;
        dealDamage(o, e.damage * sk.deathBlastMult * (o.type === 'BUILDING' ? bMult : 1), e.subType);
      }
    }
  }
}

/** 回復のスキル（いやしの ひかり・はねやすめ） */
function applyHealSkills(state: SimState, cfg: SimConfig, wallEntities: BattleEntity[]): void {
  for (const h of state.entities) {
    const sk = h.hp > 0 ? skillsOf(cfg, h) : undefined;
    if (!sk) continue;
    if (sk.healPct && state.tick % msToTicks(sk.healIntervalMs ?? 2000) === 0) {
      const r = (sk.healRadius ?? 2.5) + (sk.healRadiusBonus ?? 0);
      for (const o of state.entities) {
        if (o.type !== 'TROOP' || o.hp <= 0 || o.hp >= o.maxHp || o.team !== h.team || !within(o, h, r)) continue;
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * sk.healPct);
      }
    }
    if (sk.wallRestHealPct && state.tick % TICKS_PER_SEC === 0 && h.hp < h.maxHp
      && wallEntities.some(w => w.hp > 0 && within(w, h, 1.5))) {
      h.hp = Math.min(h.maxHp, h.hp + h.maxHp * sk.wallRestHealPct);
    }
  }
}

/** 空中の敵には、近接のネコ（射程2未満・飛行でない）の こうげきが とどかない */
function canReach(attacker: BattleEntity, target: BattleEntity): boolean {
  if (target.kind !== 'flyer') return true;
  if (attacker.type === 'BUILDING') return true;
  return attacker.attackRange >= 2 || isFlying(attacker.subType);
}

function emptyPlayerState(startEnergy: number, healCharges: number, rageCharges: number): PlayerSimState {
  return {
    energy: startEnergy,
    killBuffer: 0,
    deployCd: {},
    spells: { HEAL: healCharges, RAGE: rageCharges },
    tempRank: {},
    deployedFamilies: [],
  };
}

export interface SimInit {
  /** 敵（P2）の拠点。PvEでは章の固定配置、PvPでは相手が組んだ陣地 */
  defenderBuildings: { type: BuildingType; x: number; y: number }[];
  /** 自軍（P1）の拠点。mult＝施設のレベルの倍率（HP・こうげき。無ければ1） */
  playerBuildings: { type: BuildingType; x: number; y: number; mult?: number }[];
  spellCharges: Record<PlayerId, { HEAL: number; RAGE: number }>;
}

export function createSimState(cfg: SimConfig, init: SimInit): SimState {
  const entities: BattleEntity[] = [];
  let counter = 0;

  for (const b of init.defenderBuildings) {
    const stats = BUILDING_STATS[b.type];
    const hp = Math.round(stats.hp * cfg.difficulty.defenseHpMult);
    const dmg = Math.round((stats.damage ?? 0) * cfg.difficulty.defenseDamageMult);
    entities.push({
      id: `def-${counter++}`,
      type: 'BUILDING', subType: b.type, x: b.x, y: b.y,
      hp, maxHp: hp, damage: dmg, team: 'DEFENDER',
      attackRange: stats.range || 0,
      attackSpeed: stats.attackSpeed ?? 1000,
      lastAttack: -999999, moveSpeed: 0, targetPreference: 'ANY',
      isHidden: b.type === BuildingType.HIDDEN_TESLA,
    });
  }

  for (const b of init.playerBuildings) {
    const stats = BUILDING_STATS[b.type];
    // 施設のレベルの倍率（HP・こうげき）。試合の前に決めて渡す（sim の中でストアを読まない）
    const m = b.mult ?? 1;
    const hp = Math.round(stats.hp * m);
    entities.push({
      id: `pb-${counter++}`,
      type: 'BUILDING', subType: b.type, x: b.x, y: b.y,
      hp, maxHp: hp, damage: Math.round((stats.damage ?? 0) * m),
      team: 'ATTACKER_BUILDING',
      attackRange: stats.range ?? 0,
      attackSpeed: stats.attackSpeed ?? 1500,
      lastAttack: -999999, moveSpeed: 0, targetPreference: 'ANY',
    });
  }

  if (cfg.battleMap?.titan) {
    entities.push(makeTitanEntity(cfg.battleMap.titan, `titan-${counter++}`));
  }

  return {
    tick: 0,
    entities,
    players: {
      P1: emptyPlayerState(cfg.startEnergy.P1, init.spellCharges.P1.HEAL, init.spellCharges.P1.RAGE),
      P2: emptyPlayerState(cfg.startEnergy.P2, init.spellCharges.P2.HEAL, init.spellCharges.P2.RAGE),
    },
    activeSpells: [],
    meteors: [],
    rngState: new DetRNG(cfg.seed).getState(),
    entityCounter: counter,
    started: false,
    result: null,
    ai: { lastSpawnTick: 0, pendingUnit: null, spawnCount: 0, bossSpawned: false },
    lastLavaTick: 0,
    lastMeteorTick: {},
    lastAlienTick: {},
    titanDir: 1,
    aim: {},
    skeletonsSpawned: false,
    stalledSinceTick: -1,
    hadEnemyBuildings: init.defenderBuildings.length > 0,
    hadPlayerTownHall: init.playerBuildings.some(b => b.type === BuildingType.TOWN_HALL),
  };
}

/** 静的な地形情報。tickごとに作り直さなくてよいのでキャッシュして渡す。 */
export interface SimStatics {
  terrainCosts: TerrainCostMap;
  lavaCells: Set<string>;
  impassable: Set<string>;
  deployZones: Record<PlayerId, { xMin: number; xMax: number; yMin: number; yMax: number } | null>;
}

/** そのマスが建物・通行不可地形でふさがっているか（UI側の事前チェック用） */
export function isBlockedCell(state: SimState, statics: SimStatics, x: number, y: number): boolean {
  if (statics.impassable.has(`${x},${y}`)) return true;
  return state.entities.some(e => {
    if (e.type !== 'BUILDING' || e.hp <= 0) return false;
    const { w, h } = buildingCells(e);
    return x >= e.x && x < e.x + w && y >= e.y && y < e.y + h;
  });
}

export function buildStatics(cfg: SimConfig): SimStatics {
  const terrain = cfg.battleMap?.terrain ?? [];
  const impassable = new Set<string>();
  for (const t of terrain) {
    if (t.type === 'WATER' || t.type === 'ROCK') impassable.add(`${t.x},${t.y}`);
  }
  const z = cfg.battleMap?.playerDeployZone ?? null;
  // P2 の出撃ゾーンは、P1のゾーンを左右反転したもの（PvPで対称にするため）
  const mirrored = z
    ? { xMin: GRID_W - 1 - z.xMax, xMax: GRID_W - 1 - z.xMin, yMin: z.yMin, yMax: z.yMax }
    : null;
  return {
    terrainCosts: buildTerrainCostMap(terrain),
    lavaCells: collectLavaCells(terrain),
    impassable,
    deployZones: { P1: z, P2: mirrored },
  };
}

// ── 内部ヘルパ ────────────────────────────────────────────────────────

function buildingCells(e: BattleEntity): { w: number; h: number } {
  const s = BUILDING_STATS[e.subType as BuildingType];
  return { w: s?.width ?? 1, h: s?.height ?? 1 };
}

/** 建物のいちばん近いふちまでの距離（中心ではなく縁で交戦判定する） */
function distToEntity(from: BattleEntity, target: BattleEntity): number {
  if (target.type === 'BUILDING') {
    const { w, h } = buildingCells(target);
    const nearX = Math.max(target.x, Math.min(from.x, target.x + w - 1));
    const nearY = Math.max(target.y, Math.min(from.y, target.y + h - 1));
    return dist(nearX, nearY, from.x, from.y);
  }
  // TROOP は 0.6 マス相当の当たり判定（元実装と同じ扱い）
  const cx = target.x + 0.6 / 2 - 0.5;
  const cy = target.y + 0.6 / 2 - 0.5;
  return dist(cx, cy, from.x, from.y);
}

function makeTroop(
  state: SimState, cfg: SimConfig, player: PlayerId, troopId: string, x: number, y: number,
): BattleEntity | null {
  const line = cfg.unitStats[player][troopId];
  if (!line) return null;
  const rank = state.players[player].tempRank[troopId] ?? 0;
  const hpMult = 1 + 0.25 * rank;
  const dmgMult = 1 + 0.25 * rank;
  const hp = Math.round(line.hp * hpMult);
  return {
    id: `t${state.entityCounter++}`,
    type: 'TROOP',
    subType: troopId,
    x, y,
    hp, maxHp: hp,
    damage: Math.round(line.damage * dmgMult),
    team: TEAM_OF[player].troop,
    attackRange: line.attackRange,
    attackSpeed: Math.round(line.attackSpeed),
    lastAttack: -999999,
    moveSpeed: line.moveSpeed,
    targetPreference: line.target,
    path: [],
    bornTick: state.tick,
  };
}

/** その地点に出撃・建設できるか（UI側の事前チェックにも使う） */
export function canDeployAt(
  state: SimState, statics: SimStatics, player: PlayerId, x: number, y: number,
): boolean {
  const zone = statics.deployZones[player];
  if (zone && x >= zone.xMin && x <= zone.xMax && y >= zone.yMin && y <= zone.yMax) return true;
  // 自分の城・キャンプの周囲 半径2.5
  const R = 2.5;
  const myBuildingTeam = TEAM_OF[player].building;
  return state.entities.some(b => {
    if (b.type !== 'BUILDING' || b.team !== myBuildingTeam || b.hp <= 0) return false;
    if (b.subType !== BuildingType.TOWN_HALL && b.subType !== BuildingType.ARMY_CAMP) return false;
    const s = BUILDING_STATS[b.subType as BuildingType];
    const cx = b.x + s.width / 2;
    const cy = b.y + s.height / 2;
    return dist(x + 0.5, y + 0.5, cx, cy) <= R + Math.max(s.width, s.height) / 2;
  });
}

// ── コマンドの適用 ────────────────────────────────────────────────────

function applyCommand(
  state: SimState, cfg: SimConfig, statics: SimStatics,
  obstacles: Set<string>, cmd: SimCommand, out: SimEvent[],
): void {
  const p = state.players[cmd.player];

  switch (cmd.type) {
    case 'DEPLOY': {
      if (obstacles.has(`${cmd.x},${cmd.y}`)) return;
      if (!canDeployAt(state, statics, cmd.player, cmd.x, cmd.y)) return;
      const line = cfg.unitStats[cmd.player][cmd.troopId];
      if (!line) return;
      const cost = Math.round(line.cost * cfg.costMult[cmd.player]);
      // 再出撃の待ち時間はキャラごとに違う（にゃんこ大戦争と同じ考え方）
      const cdTicks = msToTicks(line.cooldownMs);
      const last = p.deployCd[cmd.troopId];
      if (last !== undefined && state.tick - last < cdTicks) return;
      if (p.energy < cost) return;

      const rng = new DetRNG(1); rng.setState(state.rngState);
      const jx = (rng.next() - 0.5) * 0.4;
      const jy = (rng.next() - 0.5) * 0.4;
      state.rngState = rng.getState();

      const troop = makeTroop(state, cfg, cmd.player, cmd.troopId, cmd.x + jx, cmd.y + jy);
      if (!troop) return;
      p.energy -= cost;
      p.deployCd[cmd.troopId] = state.tick;
      if (!p.deployedFamilies.includes(cmd.troopId)) p.deployedFamilies.push(cmd.troopId);
      state.entities.push(troop);
      state.started = true;
      out.push({ type: 'SFX', name: 'deploy' });
      return;
    }

    case 'MOVE_TO': {
      if (obstacles.has(`${cmd.x},${cmd.y}`)) return;
      const e = state.entities.find(en => en.id === cmd.entityId);
      if (!e || e.hp <= 0 || playerOf(e) !== cmd.player || e.type !== 'TROOP') return;
      e.customTarget = { x: cmd.x, y: cmd.y };
      e.path = [];
      e.focusId = null;              // 場所への移動命令は、名指しターゲットを打ち消す
      e.targetPreference = 'MOVE_TO';
      out.push({ type: 'MESSAGE', text: '📍 移動命令を発令！', durationMs: 1500 });
      return;
    }

    case 'FOCUS': {
      const e = state.entities.find(en => en.id === cmd.entityId);
      if (!e || e.hp <= 0 || playerOf(e) !== cmd.player || e.type !== 'TROOP') return;
      const t = state.entities.find(en => en.id === cmd.targetId);
      if (!t || t.hp <= 0 || !isHostile(e, t)) return;
      e.focusId = cmd.targetId;
      e.customTarget = undefined;    // 名指しは場所への移動命令を打ち消す
      e.path = [];
      e.targetPreference = 'ANY';
      out.push({ type: 'MESSAGE', text: '🎯 ねらいを さだめた！', durationMs: 1500 });
      return;
    }

    case 'SET_ORDER': {
      const e = state.entities.find(en => en.id === cmd.entityId);
      if (!e || e.hp <= 0 || playerOf(e) !== cmd.player || e.type !== 'TROOP') return;
      e.targetPreference = cmd.order;
      e.customTarget = undefined;
      return;
    }

    case 'CAST_SPELL': {
      if (p.spells[cmd.spell] <= 0) return;
      p.spells[cmd.spell] -= 1;
      state.activeSpells.push({
        id: `s${state.entityCounter++}`,
        x: cmd.x, y: cmd.y, type: cmd.spell,
        endTick: state.tick + SPELL_DURATION_TICKS,
      });
      state.started = true;
      out.push({
        type: 'MESSAGE', durationMs: 2500,
        text: cmd.spell === 'HEAL'
          ? '💚 【回復の呪文】を発動！味方部隊のHPを持続回復します'
          : '💜 【レイジの呪文】を発動！味方の攻撃・移動をブースト！',
      });
      return;
    }

    case 'BUILD': {
      const cost = IN_BATTLE_BUILD_COSTS[cmd.building] ?? 999;
      if (Math.floor(p.energy) < cost) return;
      if (!canDeployAt(state, statics, cmd.player, cmd.x, cmd.y)) return;
      const stats = BUILDING_STATS[cmd.building];
      const occupied = state.entities.some(e => {
        if (e.type !== 'BUILDING' || e.hp <= 0) return false;
        const { w, h } = buildingCells(e);
        return e.x < cmd.x + stats.width && e.x + w > cmd.x
            && e.y < cmd.y + stats.height && e.y + h > cmd.y;
      });
      if (occupied) return;
      p.energy -= cost;
      state.entities.push({
        id: `b${state.entityCounter++}`,
        type: 'BUILDING', subType: cmd.building, x: cmd.x, y: cmd.y,
        hp: stats.hp, maxHp: stats.hp, damage: stats.damage ?? 0,
        team: TEAM_OF[cmd.player].building,
        attackRange: stats.range ?? 0,
        attackSpeed: stats.attackSpeed ?? 1500,
        lastAttack: -999999, moveSpeed: 0, targetPreference: 'ANY',
      });
      out.push({ type: 'SFX', name: 'tap' });
      out.push({ type: 'MESSAGE', text: `🏗️ ${stats.name}を建設した！（${cost}⚡）`, durationMs: 1600 });
      return;
    }

    case 'BUY_RANK': {
      const line = cfg.unitStats[cmd.player][cmd.troopId];
      if (!line) return;
      const cost = Math.round(line.cost * 3);
      if (Math.floor(p.energy) < cost) return;
      p.energy -= cost;
      p.tempRank[cmd.troopId] = (p.tempRank[cmd.troopId] ?? 0) + 1;
      return;
    }

    case 'BUY_SPELL': {
      const cost = cmd.spell === 'HEAL' ? 60 : 80;
      if (p.energy < cost) return;
      p.energy -= cost;
      p.spells[cmd.spell] += 1;
      return;
    }

    case 'GRANT_ENERGY': {
      p.energy = Math.min(9999, p.energy + cmd.amount);
      return;
    }

    case 'BREAK_SHIELD': {
      // 相手のボスのシールドを1枚わる（id順でいちばん先のボス。決定論のため）
      const foeTeam = TEAM_OF[OPPONENT[cmd.player]].troop;
      let boss: BattleEntity | null = null;
      for (const e of state.entities) {
        if (e.team !== foeTeam || (e.shield ?? 0) <= 0 || e.hp <= 0) continue;
        if (!boss || e.id < boss.id) boss = e;
      }
      if (!boss) return;
      boss.shield = (boss.shield ?? 0) - 1;
      out.push({ type: 'SFX', name: 'explosion' });
      out.push({
        type: 'MESSAGE', durationMs: 2600,
        text: boss.shield > 0
          ? `🛡️ シールドを1枚 わった！ あと${boss.shield}枚`
          : '💥 シールドが ぜんぶ われた！ いまだ、こうげき！',
      });
      return;
    }

    case 'SURRENDER': {
      state.result = OPPONENT[cmd.player];
      return;
    }
  }
}

// ── 敵AI（PvEのみ）────────────────────────────────────────────────────

function runEnemyAI(state: SimState, cfg: SimConfig, obstacles: Set<string>, statics: SimStatics, out: SimEvent[]): void {
  const d = cfg.difficulty;
  const rng = new DetRNG(1); rng.setState(state.rngState);

  const defenderBldgs = state.entities.filter(e => e.team === 'DEFENDER' && e.type === 'BUILDING' && e.hp > 0);
  const spawnBldgs = defenderBldgs.filter(b => ENEMY_SPAWN_BUILDINGS.includes(b.subType as BuildingType));
  const barracksAlive = defenderBldgs.some(b => b.subType === BuildingType.BARRACKS);
  const spawnRate = enemySpawnRate(d, defenderBldgs.map(b => b.subType as string));

  const pool = barracksAlive
    ? d.unitPool
    : d.unitPool.filter(k => !BARRACKS_ONLY_UNITS.includes(k));
  const effectivePool: EnemyUnitKind[] = pool.length > 0 ? pool : ['grunt'];

  if (!state.ai.pendingUnit || !effectivePool.includes(state.ai.pendingUnit)) {
    state.ai.pendingUnit = pickWeightedEnemyUnit(effectivePool, rng);
  }
  const pending = state.ai.pendingUnit;
  const isFirst = state.ai.spawnCount === 0;
  // 下限 600ms。ここは 1500ms だったが、それだと終盤の章で
  // enemySpawnRatePerSec をいくら上げても「1.5秒に1体」で頭打ちになり、
  // 実測で第4〜5章が 1.7秒/体 に貼りついていた（＝レートを上げても
  // 難易度が動かない）。にゃんこ大戦争のように「わっと押し寄せる」波を
  // 作れるよう、律速をレート側に戻す。
  const intervalTicks = isFirst
    ? msToTicks(d.firstSpawnDelayMs)
    : msToTicks(Math.max(600, (ENEMY_UNIT_COST[pending] / Math.max(0.1, spawnRate)) * 1000));

  if (state.tick - state.ai.lastSpawnTick > intervalTicks) {
    state.ai.lastSpawnTick = state.tick;
    state.ai.spawnCount += 1;

    if (defenderBldgs.length > 0) {
      const isBoss = d.bossAtSpawnCount === state.ai.spawnCount && !state.ai.bossSpawned;
      if (isBoss) state.ai.bossSpawned = true;
      const kind: EnemyUnitKind = isBoss ? 'boss' : pending;

      const isBlocked = (x: number, y: number) =>
        x < 0 || x >= GRID_W || y < 0 || y >= GRID_H ||
        obstacles.has(`${x},${y}`) || statics.impassable.has(`${x},${y}`);

      let sx: number, sy: number, fromLabel = '';
      const src = spawnBldgs.length > 0 ? spawnBldgs[rng.int(spawnBldgs.length)] : null;

      if (src) {
        const st = BUILDING_STATS[src.subType as BuildingType];
        fromLabel = st?.name ?? '';
        const perimeter: Coordinates[] = [];
        for (let dy = -1; dy <= (st?.height ?? 1); dy++) {
          perimeter.push({ x: src.x - 1, y: src.y + dy });
          perimeter.push({ x: src.x + (st?.width ?? 1), y: src.y + dy });
        }
        for (let dx = 0; dx < (st?.width ?? 1); dx++) {
          perimeter.push({ x: src.x + dx, y: src.y - 1 });
          perimeter.push({ x: src.x + dx, y: src.y + (st?.height ?? 1) });
        }
        const free = perimeter.filter(p => !isBlocked(p.x, p.y));
        const pick = free.length > 0 ? free[rng.int(free.length)] : { x: src.x, y: src.y };
        sx = pick.x; sy = pick.y;
      } else {
        sx = Math.min(GRID_W - 1, Math.max(...defenderBldgs.map(b => b.x)) + 1);
        const ys: number[] = [];
        for (let y = 0; y < GRID_H; y++) if (!isBlocked(sx, y)) ys.push(y);
        sy = ys.length > 0 ? ys[rng.int(ys.length)] : Math.round(GRID_H / 2);
      }

      const s = ENEMY_UNIT_STATS[kind];
      const hp = Math.round(s.hp * d.enemyHpMult);
      state.entities.push({
        id: `w${state.entityCounter++}`,
        type: 'TROOP', subType: s.subType,
        x: Math.max(0, Math.min(GRID_W - 1, sx + (rng.next() - 0.5) * 0.6)),
        y: Math.max(0, Math.min(GRID_H - 1, sy + (rng.next() - 0.5) * 0.6)),
        hp, maxHp: hp,
        damage: Math.round(s.damage * d.enemyDamageMult),
        team: 'DEFENDER',
        kind,
        ...(isBoss && (d.bossShield ?? 0) > 0 ? { shield: d.bossShield } : {}),
        attackRange: s.attackRange, attackSpeed: s.attackSpeed,
        lastAttack: -999999, moveSpeed: s.moveSpeed,
        targetPreference: 'ANY', path: [],
      });

      out.push({
        type: 'MESSAGE', durationMs: 2200,
        text: isBoss
          ? ((d.bossShield ?? 0) > 0
              ? `👑 ${cfg.enemyName}の親衛隊が出現！ 🛡️シールドは「ふくしゅうカード」を といて わろう！`
              : `👑 ${cfg.enemyName}の親衛隊が出現！ 総力をあげて食い止めろ！`)
          : fromLabel
            ? `⚠️ 敵の${fromLabel}から 増援（${s.label}）が出てきた！`
            : `⚠️ 敵の増援（${s.label}）が出現！`,
      });
    }
    state.ai.pendingUnit = pickWeightedEnemyUnit(effectivePool, rng);
  }

  state.rngState = rng.getState();
}

// ── 1tick を進める ────────────────────────────────────────────────────

export function simulateTick(
  state: SimState, cfg: SimConfig, statics: SimStatics, commands: SimCommand[],
): SimEvent[] {
  const out: SimEvent[] = [];
  state.tick += 1;

  // ── 1. 死亡処理と撃破報酬 ──
  applyDeathSkills(state, cfg);
  for (const e of state.entities) {
    if (e.hp > 0) continue;
    const owner = playerOf(e);
    if (owner) {
      // 撃破報酬にはGOLD_BOOSTを掛けない（元実装でも自然回復のレートにのみ掛かる）。
      // レート側のバフは cfg.energyPerSec に焼き込みずみ。
      //
      // 【一律8→強さに比例へ】敵の増援を増やしたら、逆にプレイヤーが有利になった。
      // 雑兵1体=8⚡ で、ネコ1体が30⚡。つまり雑兵を4体倒すだけで次のネコが出せる。
      // 「敵を増やす→⚡が増える→もっとネコが出せる」という正のループになっていて、
      // 増援レートをいくら上げても勝率が100%から動かなかった（実測: レート89でも100%）。
      // 倒した相手の強さ（最大HP）に応じた報酬にして、
      // 「雑魚はほとんど稼げない／大物を倒すと大きい」形に直す。
      state.players[OPPONENT[owner]].killBuffer +=
        e.type === 'BUILDING' ? 30 : Math.max(1, Math.round(1 + e.maxHp / 30));
    }
    if (e.type === 'BUILDING') {
      out.push({ type: 'SFX', name: 'explosion' });
      if (e.team === 'DEFENDER' && ENEMY_PRODUCTION_RATE[e.subType as BuildingType] != null) {
        const st = BUILDING_STATS[e.subType as BuildingType];
        const isSpawnPoint = ENEMY_SPAWN_BUILDINGS.includes(e.subType as BuildingType);
        out.push({
          type: 'MESSAGE', durationMs: 2600,
          text: isSpawnPoint
            ? `🏭 敵の${st?.name}を破壊！ この場所から増援が出てこなくなった！`
            : `⛏️ 敵の${st?.name}を破壊！ 敵の増援が おそくなった！`,
        });
      }
    }
  }
  state.entities = state.entities.filter(e => e.hp > 0);

  // ── 2. エナジーの自然回復 ──
  if (!state.result) {
    for (const pid of ['P1', 'P2'] as PlayerId[]) {
      const p = state.players[pid];
      const inc = cfg.energyPerSec[pid] / TICKS_PER_SEC + p.killBuffer;
      p.killBuffer = 0;
      if (inc > 0) p.energy = Math.min(9999, p.energy + inc);
    }
  }

  // ── 3. 障害物の再構築（コマンド適用より前。配置判定に使う）──
  const obstacles = new Set<string>();
  const obstaclesNoWall = new Set<string>();
  for (const e of state.entities) {
    if (e.type !== 'BUILDING') continue;
    const { w, h } = buildingCells(e);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        obstacles.add(`${e.x + dx},${e.y + dy}`);
        if (e.subType !== BuildingType.WALL) obstaclesNoWall.add(`${e.x + dx},${e.y + dy}`);
      }
    }
  }
  for (const k of statics.impassable) { obstacles.add(k); obstaclesNoWall.add(k); }
  const wallCells = collectWallCells(state.entities);

  // ── 4. コマンド適用 ──
  for (const cmd of commands) {
    applyCommand(state, cfg, statics, obstacles, cmd, out);
  }
  if (state.result) {
    out.push({ type: 'RESULT', winner: state.result });
    return out;
  }

  // ── 5. 勝敗判定 ──
  // 「拠点があったか」は現在の生存数ではなく開幕時の有無で見る。生存数で見ると、
  // コアを最後に破壊した瞬間（全施設が同時に0になる）に条件が成立しない。
  const hasTownHall = (team: BattleEntity['team']) => state.entities.some(
    e => e.type === 'BUILDING' && e.team === team && e.subType === BuildingType.TOWN_HALL);

  if (state.started && state.hadEnemyBuildings && !hasTownHall('DEFENDER')) {
    state.result = 'P1';
    out.push({ type: 'SFX', name: 'battleWin' });
    out.push({ type: 'RESULT', winner: 'P1' });
    return out;
  }
  if (state.started && state.hadPlayerTownHall && !hasTownHall('ATTACKER_BUILDING')) {
    state.result = 'P2';
    out.push({ type: 'SFX', name: 'battleLose' });
    out.push({ type: 'RESULT', winner: 'P2' });
    return out;
  }
  // PvEのみ: 手詰まり（手駒ゼロ＋最安ネコも買えない）が**続いたら**敗北。
  //
  // 以前は一瞬でもこの状態になった時点で即敗北にしていたが、⚡の自然回復を
  // 上げたことで「出した直後は毎回この状態」になり、戦線が一度途切れただけで
  // 負ける理不尽な仕様になっていた（実測: 第8章で自軍コアが無傷のまま
  // 52秒で敗北）。⚡が回復し続ける以上ほんとうの手詰まりは起きえないので、
  // ここは「本当に何もできない状態が続いた場合」だけを拾う保険にする。
  if (cfg.mode === 'PVE' && state.started) {
    const alive = state.entities.some(e => e.type === 'TROOP' && e.team === 'ATTACKER');
    const broke = Math.floor(state.players.P1.energy) < cfg.minTroopCost.P1;
    if (!alive && broke) {
      if (state.stalledSinceTick < 0) state.stalledSinceTick = state.tick;
      if (state.tick - state.stalledSinceTick >= STALL_LOSE_TICKS) {
        state.result = 'P2';
        out.push({ type: 'SFX', name: 'battleLose' });
        out.push({ type: 'RESULT', winner: 'P2' });
        return out;
      }
    } else {
      state.stalledSinceTick = -1;
    }
  }

  // ── 6. 敵AI（PvEのみ）──
  if (cfg.mode === 'PVE' && state.started) {
    if (state.ai.lastSpawnTick === 0) state.ai.lastSpawnTick = state.tick;
    runEnemyAI(state, cfg, obstacles, statics, out);
  }

  // ── 7. ステージギミック ──
  if (state.started) {
    stepHazards(state, cfg, statics, out);
  }

  // ── 8. 呪文の期限切れ ──
  state.activeSpells = state.activeSpells.filter(s => s.endTick > state.tick);

  // ── 9. HEAL_AURA ──
  for (const pid of ['P1', 'P2'] as PlayerId[]) {
    const pct = cfg.buffs[pid].healAuraPct;
    if (pct <= 0) continue;
    if (state.tick % HEAL_AURA_INTERVAL_TICKS !== 0) continue;
    for (const e of state.entities) {
      if (e.type !== 'TROOP' || playerOf(e) !== pid) continue;
      if (e.hp > 0 && e.hp < e.maxHp) e.hp = Math.min(e.maxHp, e.hp + e.maxHp * (pct / 100));
    }
  }

  // ── 9b. 回復役（敵のしゅうりドローン）──
  if (state.tick % msToTicks(MEDIC_HEAL_INTERVAL_MS) === 0) {
    for (const m of state.entities) {
      if (m.kind !== 'medic' || m.hp <= 0) continue;
      for (const e of state.entities) {
        if (e === m || e.type !== 'TROOP' || e.team !== m.team || e.hp <= 0 || e.hp >= e.maxHp) continue;
        if (dist2(e.x, e.y, m.x, m.y) > MEDIC_HEAL_RADIUS * MEDIC_HEAL_RADIUS) continue;
        e.hp = Math.min(e.maxHp, e.hp + e.maxHp * MEDIC_HEAL_PCT);
      }
    }
  }

  // ── 9c. 回復のスキル ──
  applyHealSkills(state, cfg, state.entities.filter(e => e.type === 'BUILDING' && e.subType === BuildingType.WALL));

  // ── 10. エンティティの更新 ──
  for (const entity of state.entities) {
    if (entity.type === 'BUILDING') {
      updateBuilding(state, cfg, entity, wallCells, out);
    } else {
      updateTroop(state, cfg, statics, entity, obstacles, obstaclesNoWall, wallCells, out);
    }
  }

  return out;
}

// ── 建物（防衛施設）の攻撃 ────────────────────────────────────────────

function updateBuilding(
  state: SimState, cfg: SimConfig, entity: BattleEntity, wallCells: Set<string>, out: SimEvent[],
): void {
  if (!entity.damage || entity.damage <= 0 || !entity.attackRange) return;

  const hostiles = state.entities.filter(e => e.type === 'TROOP' && e.hp > 0 && isHostile(entity, e));

  if (entity.isHidden) {
    // `**` は Math.pow と同じ Number::exponentiate を使う＝実装依存の近似なので、
    // 決定論のため必ず乗算で書く（sim/math.ts の方針）。
    const r = entity.attackRange || 3;
    const near = hostiles.some(a => dist2(a.x, a.y, entity.x, entity.y) < r * r);
    if (near) entity.isHidden = false;
    else return;
  }

  const target = pickDefenseTarget(entity, hostiles, wallCells);

  // 照準時間（新しい標的をとらえてから初弾までの予告）
  const stats = BUILDING_STATS[entity.subType as BuildingType];
  // スキル「ジグザグ ひこう」：ねらうまでが おそくなる
  const dodge = target ? skillsOf(cfg, target)?.aimDelayMs ?? 0 : 0;
  const aimTicks = (stats?.aimTimeMs ? msToTicks(stats.aimTimeMs) : 0) + (dodge > 0 ? msToTicks(dodge) : 0);
  let aimed = true;
  if (target) {
    const rec = state.aim[entity.id];
    if (!rec || rec.targetId !== target.id) {
      state.aim[entity.id] = { targetId: target.id, lockedTick: state.tick };
      aimed = aimTicks === 0;
    } else {
      aimed = state.tick - rec.lockedTick >= aimTicks;
    }
  } else {
    delete state.aim[entity.id];
  }

  if (!target || !aimed) return;
  if (state.tick - entity.lastAttack < msToTicks(entity.attackSpeed)) return;

  const isTesla = entity.subType === BuildingType.HIDDEN_TESLA;
  out.push({
    type: 'PROJECTILE',
    fromX: entity.x + 0.5, fromY: entity.y + 0.5,
    toX: target.x, toY: target.y,
    kind: isTesla ? 'TESLA' : 'CANNON',
  });
  out.push({ type: 'SFX', name: 'laserShot' });

  const resist = CHARACTER_BY_ID[target.subType]?.defenseResist ?? 0;
  const dealt = Math.max(1, Math.round(entity.damage * (1 - resist)));
  applyHit(state, cfg, entity, target, dealt);
  out.push({ type: 'DAMAGED', entityId: target.id });
  entity.lastAttack = state.tick;
}

// ── 兵士のAI ──────────────────────────────────────────────────────────

function updateTroop(
  state: SimState, cfg: SimConfig, statics: SimStatics, entity: BattleEntity,
  obstacles: Set<string>, obstaclesNoWall: Set<string>, wallCells: Set<string>, out: SimEvent[],
): void {
  // 自爆ロボは施設だけをねらう（ネコは ねらわない）。空中の敵は、近接のネコには とどかない
  const isKamikaze = entity.kind === 'kamikaze';
  const potential = state.entities.filter(o =>
    o.hp > 0 && isHostile(entity, o) && !o.isHidden && canReach(entity, o) &&
    (!isKamikaze || o.type === 'BUILDING'));
  if (potential.length === 0) return;

  // ── 名指しターゲット（プレイヤーが敵をタップして指定したもの）──
  // 生きているあいだは距離に関係なくこいつを追う。倒されたら自動で解除。
  let focused: BattleEntity | null = null;
  if (entity.focusId) {
    focused = potential.find(o => o.id === entity.focusId) ?? null;
    if (!focused) entity.focusId = null;
  }

  let preferred = potential;
  if (entity.targetPreference === 'DEFENSE') {
    const defenses = potential.filter(t =>
      t.type === 'BUILDING' && (BUILDING_STATS[t.subType as BuildingType]?.damage ?? 0) > 0);
    if (defenses.length > 0) preferred = defenses;
  } else if (entity.targetPreference === 'RUSH') {
    const halls = potential.filter(t => t.subType === BuildingType.TOWN_HALL);
    if (halls.length > 0) preferred = halls;
  }

  // いちばん近い相手を選ぶ。距離が同点のときは id 順で決める（決定論のため）
  let best: BattleEntity | null = focused;
  // スキル（かいふくやを ねらえ・ばくだん とめ）：その種類の敵が ちかくにいれば 先にねらう
  const mySkills = skillsOf(cfg, entity);
  if (!best && mySkills?.preferKind) {
    const pr = mySkills.preferRadius ?? 5;
    let minD = pr * pr;
    for (const t of potential) {
      if (t.kind !== mySkills.preferKind) continue;
      const d = dist2(t.x, t.y, entity.x, entity.y);
      if (d < minD || (d === minD && best && t.id < best.id)) { minD = d; best = t; }
    }
  }
  if (!best) {
    let minD = Infinity;
    for (const t of preferred) {
      const d = dist2(t.x, t.y, entity.x, entity.y);
      if (d < minD || (d === minD && best && t.id < best.id)) { minD = d; best = t; }
    }
    if (!best) {
      minD = Infinity;
      for (const t of potential) {
        const d = dist2(t.x, t.y, entity.x, entity.y);
        if (d < minD || (d === minD && best && t.id < best.id)) { minD = d; best = t; }
      }
    }
  }
  if (!best) return;
  const target: BattleEntity = best;

  // 呪文の影響
  let atkSpeed = entity.attackSpeed;
  let moveSpeed = entity.moveSpeed;
  let damage = entity.damage;
  const owner = playerOf(entity);
  for (const s of state.activeSpells) {
    if (dist2(s.x, s.y, entity.x, entity.y) > SPELL_RADIUS * SPELL_RADIUS) continue;
    if (s.type === 'RAGE') {
      atkSpeed = entity.attackSpeed * 0.5;
      moveSpeed = entity.moveSpeed * 1.6;
      damage = entity.damage * 1.5;
    } else if (s.type === 'HEAL' && owner !== null && entity.hp < entity.maxHp) {
      // 元実装は毎フレーム0.3回復。tick換算で同じ回復量になるようにする
      entity.hp = Math.min(entity.maxHp, entity.hp + 0.3 * (60 / TICKS_PER_SEC));
    }
  }
  // スキル「ふんばり」：HPが半分以下で こうげきが はやい
  if (mySkills?.lowHpAtkIntervalMult && entity.hp <= entity.maxHp * 0.5) atkSpeed *= mySkills.lowHpAtkIntervalMult;

  const distToTarget = distToEntity(entity, target);

  // 遠距離は壁ごしに撃てない（近接と飛行は例外）
  const canSee =
    entity.attackRange < 2 ||
    isFlying(entity.subType) ||
    target.subType === BuildingType.WALL ||
    hasLineOfSight(entity.x + 0.5, entity.y + 0.5, target.x + 0.5, target.y + 0.5, wallCells);

  // 移動命令中は「立ち止まって撃つ」をしない。
  // ③のフィードバック対応: 以前は射程内に敵がいると必ずここで return していたため、
  // 移動を命じても交戦が始まった瞬間にその場に居ついてしまった。
  // 移動命令が出ているあいだは**移動を最優先**にし、撃てるなら歩きながら撃つ。
  const movingByOrder = entity.targetPreference === 'MOVE_TO' && !!entity.customTarget;

  if (distToTarget <= entity.attackRange && canSee) {
    if (state.tick - entity.lastAttack >= msToTicks(atkSpeed)) {
      // 攻城倍率: 爆発系は建物に大ダメージ（役割説明・章のヒントのとおり）。
      // これが無かったため、砲台が並ぶ終盤の要塞を崩す手段が実質存在しなかった。
      // 敵AIの兵（kind がある）は、見た目に使う subType が同じネコでも その倍率を使わない
      // （自爆ロボ＝bomber の ×4 が掛かり、コアが1回で半分へっていた。2026-11-15 CW-4a で直した）。
      const bMult = target.type === 'BUILDING' && owner && !entity.kind
        ? (cfg.unitStats[owner][entity.subType]?.buildingDamageMult ?? 1)
        : 1;
      applyHit(state, cfg, entity, target, damage * bMult, damage);
      entity.lastAttack = state.tick;
      // 自爆ロボは1回きり
      if (isKamikaze) entity.hp = 0;
      out.push({ type: 'DAMAGED', entityId: target.id });
      out.push({ type: 'SFX', name: 'hit' });
      const sub = entity.subType;
      const isRanged = entity.attackRange >= 2;
      const isHeavy = sub.startsWith('boss') || sub === 'giant';
      const kind = isRanged ? 'BOLT' : isHeavy ? 'SHOCK' : 'SLASH';
      const color = isRanged
        ? (sub.includes('wizard') || sub.includes('mage') ? '#c084fc' : '#67e8f9')
        : isHeavy ? '#fb923c' : '#fde68a';
      out.push({ type: 'HIT', x: target.x, y: target.y, fromX: entity.x, fromY: entity.y, kind, color });
    }
    if (!movingByOrder) {
      entity.path = [];
      return;
    }
    // 移動命令中は撃ったあとも歩き続ける（下の経路処理へ進む）
  }

  if (entity.targetPreference === 'HOLD') { entity.path = []; return; }

  // ── 経路決定（MOVE_TO と通常移動）──
  if (entity.targetPreference === 'MOVE_TO' && entity.customTarget) {
    const ct = entity.customTarget;
    if (dist(ct.x, ct.y, entity.x, entity.y) < 0.8) {
      entity.customTarget = undefined;
      entity.targetPreference = 'ANY';
      entity.path = [];
    } else if (!entity.path || entity.path.length === 0) {
      const path = findPathDet({ x: entity.x, y: entity.y }, ct, obstacles, statics.terrainCosts);
      if (path && path.length > 0) entity.path = path;
      else {
        const s = stepToward(ct.x - entity.x, ct.y - entity.y, moveSpeed * FALLBACK_CELLS_PER_SEC / TICKS_PER_SEC);
        entity.x += s.x; entity.y += s.y;
      }
    }
  } else {
    if (!entity.path || entity.path.length === 0) {
      const obs = isFlying(entity.subType) ? obstaclesNoWall : obstacles;
      const path = findPathDet({ x: entity.x, y: entity.y }, { x: target.x, y: target.y }, obs, statics.terrainCosts);
      if (path && path.length > 0) entity.path = path;
      else {
        const s = stepToward(target.x - entity.x, target.y - entity.y, moveSpeed * FALLBACK_CELLS_PER_SEC / TICKS_PER_SEC);
        entity.x += s.x; entity.y += s.y;
        // 進路をふさぐ壁をたたく
        const wall = state.entities.find(d =>
          d.subType === BuildingType.WALL && isHostile(entity, d) &&
          Math.abs(d.x - entity.x) < 0.8 && Math.abs(d.y - entity.y) < 0.8);
        if (wall && state.tick - entity.lastAttack >= msToTicks(atkSpeed)) {
          applyHit(state, cfg, entity, wall, damage);
          entity.lastAttack = state.tick;
          if (isKamikaze) entity.hp = 0;
          out.push({ type: 'DAMAGED', entityId: wall.id });
          out.push({ type: 'SFX', name: 'hit' });
        }
        return;
      }
    }
  }

  // ── 経路にそって進む（MOVE_TO・通常移動で共通）──
  let moveX = 0, moveY = 0;
  if (entity.path && entity.path.length > 0) {
    const node = entity.path[0];
    const dx = node.x - entity.x;
    const dy = node.y - entity.y;
    const d = len(dx, dy);
    const step = moveSpeed * MOVE_CELLS_PER_SEC / TICKS_PER_SEC;
    if (d < step) {
      entity.x = node.x; entity.y = node.y;
      entity.path.shift();
    } else if (d > 0) {
      moveX = (dx / d) * step;
      moveY = (dy / d) * step;
    }
  }

  // 味方どうしの重なり回避（分離ステアリング）
  let sepX = 0, sepY = 0;
  const R = 0.55;
  for (const o of state.entities) {
    if (o.id === entity.id || o.type !== 'TROOP') continue;
    if (Math.abs(o.x - entity.x) >= R || Math.abs(o.y - entity.y) >= R) continue;
    const dx = entity.x - o.x;
    const dy = entity.y - o.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > 0 && d2 < R * R) {
      const d = Math.sqrt(d2);
      sepX += (dx / d) / d;
      sepY += (dy / d) / d;
    }
  }
  // 元実装は 1フレームあたり 0.035。tick 換算で同じ効き目にそろえる
  const SEP = 0.035 * (60 / TICKS_PER_SEC);
  entity.x += moveX + sepX * SEP;
  entity.y += moveY + sepY * SEP;
}

// ── ステージギミック ──────────────────────────────────────────────────

function stepHazards(state: SimState, cfg: SimConfig, statics: SimStatics, out: SimEvent[]): void {
  const map = cfg.battleMap;

  // 溶岩（毎tick、DPSを刻んで適用）
  if (statics.lavaCells.size > 0) {
    for (const e of state.entities) {
      if (e.type !== 'TROOP' || e.hp <= 0) continue;
      if (e.subType === 'titan' || isFlying(e.subType)) continue;
      if (statics.lavaCells.has(`${Math.round(e.x)},${Math.round(e.y)}`)) {
        e.hp -= LAVA_DPS / TICKS_PER_SEC;
        out.push({ type: 'DAMAGED', entityId: e.id });
      }
    }
  }

  // 流星: 予告 → 着弾
  if (map?.meteorZones) {
    map.meteorZones.forEach((z, i) => {
      const last = state.lastMeteorTick[i];
      if (last === undefined) { state.lastMeteorTick[i] = state.tick; return; }
      if (state.tick - last <= msToTicks(z.intervalMs)) return;
      state.lastMeteorTick[i] = state.tick;
      state.meteors.push({
        id: `m${state.entityCounter++}`,
        zoneIndex: i,
        warnedTick: state.tick,
        impactTick: state.tick + msToTicks(z.warningMs),
        resolved: false,
      });
    });
    for (const m of state.meteors) {
      if (m.resolved || state.tick < m.impactTick) continue;
      m.resolved = true;
      const z = map.meteorZones[m.zoneIndex];
      out.push({ type: 'SFX', name: 'explosion' });
      for (const e of state.entities) {
        if (e.hp <= 0) continue;
        if (dist(e.x, e.y, z.x, z.y) <= z.radius) {
          e.hp -= z.damage;
          out.push({ type: 'DAMAGED', entityId: e.id });
        }
      }
    }
    state.meteors = state.meteors.filter(m => state.tick - m.impactTick < msToTicks(900));
  }

  // 中立エイリアン
  if (map?.alienNests) {
    const nests = map.alienNests;
    nests.forEach((nest, i) => {
      const last = state.lastAlienTick[i];
      if (last === undefined) { state.lastAlienTick[i] = state.tick; return; }
      if (state.tick - last <= msToTicks(nest.intervalMs)) return;
      state.lastAlienTick[i] = state.tick;
      const alive = state.entities.filter(
        e => e.team === 'NEUTRAL' && e.subType === ALIEN_STATS.subType && e.hp > 0).length;
      if (alive >= nest.max * nests.length) return;
      state.entities.push(makeAlienEntity(nest, `a${state.entityCounter++}`));
      out.push({ type: 'MESSAGE', text: '👾 エイリアンが出現！ 敵も味方もおかまいなしに おそってくるぞ', durationMs: 2600 });
    });
  }

  // 巨大生物（決まった経路を往復）
  if (map?.titan) {
    const t = map.titan;
    const titan = state.entities.find(e => e.subType === 'titan' && e.hp > 0);
    if (titan) {
      const to = state.titanDir === 1 ? t.path[t.path.length - 1] : t.path[0];
      const dx = to.x - titan.x;
      const dy = to.y - titan.y;
      const d = len(dx, dy);
      if (d < 0.4) {
        state.titanDir = state.titanDir === 1 ? -1 : 1;
      } else {
        const s = stepToward(dx, dy, t.moveSpeed / TICKS_PER_SEC);
        titan.x += s.x; titan.y += s.y;
      }
    }
  }

  // タウンホール直前でのスケルトン覚醒（PvEの演出兼ギミック）
  if (cfg.mode === 'PVE' && !state.skeletonsSpawned) {
    const hall = state.entities.find(d => d.team === 'DEFENDER' && d.subType === BuildingType.TOWN_HALL && d.hp > 0);
    if (hall) {
      const near = state.entities.some(a =>
        a.team === 'ATTACKER' && a.type === 'TROOP' && a.hp > 0 && dist(a.x, a.y, hall.x, hall.y) < 3.5);
      if (near) {
        state.skeletonsSpawned = true;
        out.push({ type: 'MESSAGE', text: '⚠️ 警告: 敵のTownHall防衛兵（スケルトンガード）が２体覚醒し突撃してきた！', durationMs: 3500 });
        for (const [dx, dy] of [[0, 1], [1, 0]] as const) {
          state.entities.push({
            id: `sk${state.entityCounter++}`,
            type: 'TROOP', subType: 'skeleton',
            x: hall.x + dx, y: hall.y + dy,
            hp: 55, maxHp: 55, damage: 14, team: 'DEFENDER',
            attackRange: 1.1, attackSpeed: 950, lastAttack: -999999,
            moveSpeed: 2.1, targetPreference: 'ANY', path: [],
          });
        }
      }
    }
  }
}
