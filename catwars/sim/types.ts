// ── シミュレーションの型定義 ─────────────────────────────────────────────
//
// ここに置くものの原則:
//   ・SimState は「同じ入力なら必ず同じ結果になる」状態だけを持つ。
//     見た目のためだけの情報（弾道アニメ・トリガーメッセージ）は入れない。
//   ・見た目は SimEvent として tick ごとに吐き出し、描画側が消費する。
//     こうしておくと、演出を変えてもシミュレーションの一致性が壊れない。
//   ・SimState は JSON でまるごと直列化できること（スナップショット・
//     デシンク時のダンプ・リプレイ保存に使う）。

import { BattleEntity, BuildingType, BattleMap } from '../types';
import type { ChapterDifficulty, EnemyUnitKind } from '../data/campaign';

/** シミュレーションの刻み幅。20Hz。描画は60fpsのまま補間する。 */
export const TICK_MS = 50;
export const TICKS_PER_SEC = 1000 / TICK_MS;

/** ms を tick 数に変換（切り上げず四捨五入。両者で同じ値になればよい） */
export const msToTicks = (ms: number): number => Math.max(1, Math.round(ms / TICK_MS));

export type PlayerId = 'P1' | 'P2';

// ── コマンド ──────────────────────────────────────────────────────────
//
// ネットワークに流れるのはこれだけ。座標や体力は一切送らない。
// tick は「このコマンドを実行すべき tick 番号」（入力遅延ぶん未来）。

export type SimCommand =
  | { type: 'DEPLOY'; player: PlayerId; troopId: string; x: number; y: number }
  | { type: 'MOVE_TO'; player: PlayerId; entityId: string; x: number; y: number }
  /** 敵（キャラ・施設）を名指しして「こいつを狙え」と指示する */
  | { type: 'FOCUS'; player: PlayerId; entityId: string; targetId: string }
  | { type: 'SET_ORDER'; player: PlayerId; entityId: string; order: 'RUSH' | 'DEFENSE' | 'HOLD' }
  | { type: 'CAST_SPELL'; player: PlayerId; spell: 'HEAL' | 'RAGE'; x: number; y: number }
  | { type: 'BUILD'; player: PlayerId; building: BuildingType; x: number; y: number }
  | { type: 'BUY_RANK'; player: PlayerId; troopId: string }
  | { type: 'BUY_SPELL'; player: PlayerId; spell: 'HEAL' | 'RAGE' }
  /** 戦闘中クイズの正解報酬。PvPでも「自分で解いた量」は自分の資源になる */
  | { type: 'GRANT_ENERGY'; player: PlayerId; amount: number }
  /** 復習の問題を まちがえずに解いた：相手のボスのシールドを1枚わる */
  | { type: 'BREAK_SHIELD'; player: PlayerId }
  | { type: 'SURRENDER'; player: PlayerId };

/** 1tick ぶんの、全プレイヤーのコマンド束 */
export interface TickCommands {
  tick: number;
  commands: SimCommand[];
}

// ── イベント（描画・音のためだけに使う。状態には影響しない）──────────────

export type SimEvent =
  | { type: 'PROJECTILE'; fromX: number; fromY: number; toX: number; toY: number; kind: 'CANNON' | 'TESLA' }
  | { type: 'HIT'; x: number; y: number; fromX: number; fromY: number; kind: 'SLASH' | 'BOLT' | 'SHOCK'; color: string }
  | { type: 'DAMAGED'; entityId: string }
  | { type: 'MESSAGE'; text: string; durationMs: number }
  | { type: 'SFX'; name: 'hit' | 'explosion' | 'laserShot' | 'deploy' | 'tap' | 'battleWin' | 'battleLose' }
  | { type: 'RESULT'; winner: PlayerId | 'DRAW' };

// ── 状態 ──────────────────────────────────────────────────────────────

/** プレイヤーごとの資源・所持品 */
export interface PlayerSimState {
  /** ⚡エナジー（戦闘中通貨） */
  energy: number;
  /** 撃破報酬のバッファ（tick境界でenergyに加算） */
  killBuffer: number;
  /** 系統ごとの最終出撃tick（クールダウン判定） */
  deployCd: Record<string, number>;
  /** 呪文の残り数 */
  spells: { HEAL: number; RAGE: number };
  /** 一時ランクアップ段階 */
  tempRank: Record<string, number>;
  /** この戦闘で出撃させた系統（XP付与用） */
  deployedFamilies: string[];
}

export interface ActiveSpell {
  id: string;
  x: number;
  y: number;
  type: 'HEAL' | 'RAGE';
  /** 効果が切れる tick */
  endTick: number;
}

export interface MeteorSimState {
  id: string;
  zoneIndex: number;
  warnedTick: number;
  impactTick: number;
  resolved: boolean;
}

/**
 * シミュレーションの全状態。これと SimConfig と コマンド列があれば、
 * どの端末でも同じ結果が再現できる。
 */
export interface SimState {
  tick: number;
  entities: BattleEntity[];
  players: Record<PlayerId, PlayerSimState>;
  activeSpells: ActiveSpell[];
  meteors: MeteorSimState[];
  /** 決定論RNGの内部状態（シミュレーション用。演出用とは別インスタンス） */
  rngState: number;
  /** エンティティIDの連番。Date.now()ベースをやめ、両者で同じIDにする */
  entityCounter: number;
  /** 戦闘が始まったか（最初の出撃で true） */
  started: boolean;
  /** 決着 */
  result: PlayerId | 'DRAW' | null;

  // ── 敵AI（PvEのみ使用）──
  ai: {
    lastSpawnTick: number;
    pendingUnit: EnemyUnitKind | null;
    spawnCount: number;
    bossSpawned: boolean;
  };
  // ── ギミックの内部状態 ──
  lastLavaTick: number;
  lastMeteorTick: Record<number, number>;
  lastAlienTick: Record<number, number>;
  titanDir: 1 | -1;
  /** 防衛施設の照準状態: 施設ID → { targetId, lockedTick } */
  aim: Record<string, { targetId: string; lockedTick: number }>;
  skeletonsSpawned: boolean;
  /** 開幕時に敵拠点が存在したか（勝利条件の判定） */
  hadEnemyBuildings: boolean;
  /** 開幕時に自軍コアが存在したか（敗北条件の判定） */
  hadPlayerTownHall: boolean;
  /**
   * 「手駒ゼロかつ最安ネコも買えない」状態が続き始めた tick（-1 = 継続していない）。
   * 一瞬でもこの状態になったら即敗北、にすると理不尽なので、
   * 一定時間続いたときだけ「手詰まり」とみなす。
   */
  stalledSinceTick: number;
}

/**
 * 対戦の設定。試合開始時に確定し、以後変わらない。
 * **両クライアントで完全に同一でなければならない**（seed を含む）。
 */
export interface SimConfig {
  mode: 'PVE' | 'PVP';
  seed: number;
  battleMap: BattleMap | null;
  difficulty: ChapterDifficulty;
  /** 章の敵名（メッセージ表示用。状態には影響しない） */
  enemyName: string;
  /**
   * プレイヤーごとのユニット性能テーブル。
   * 進化段階やデイリーバフは端末ごとに違うため、**試合開始時に解決して
   * ここへ焼き込む**。実行時に useArmyStore などを参照してはいけない
   * （相手の端末には無い情報なので、参照した瞬間にデシンクする）。
   */
  unitStats: Record<PlayerId, Record<string, UnitStatLine>>;
  /** ⚡の自然回復（毎秒）。バフ適用ずみの値を焼き込む */
  energyPerSec: Record<PlayerId, number>;
  /** 開始⚡。バフ適用ずみ */
  startEnergy: Record<PlayerId, number>;
  /**
   * 出撃クールダウンの基準値(ms)。実際の待ち時間はキャラごとに違い、
   * `unitStats[player][troopId].cooldownMs` を使う。こちらは表示・後方互換用。
   */
  deployCooldownMs: Record<PlayerId, number>;
  /** 出撃コストの倍率（COST_REDUCTIONバフ適用ずみ） */
  costMult: Record<PlayerId, number>;
  /** いちばん安いユニットのコスト（PvEの「手詰まり敗北」判定に使う） */
  minTroopCost: Record<PlayerId, number>;
  /** 有効なデイリーバフのうち、シミュレーションに効くものだけ */
  buffs: Record<PlayerId, SimBuffs>;
}

export interface UnitStatLine {
  hp: number;
  damage: number;
  attackRange: number;
  attackSpeed: number;
  moveSpeed: number;
  cost: number;
  /** このキャラの再出撃までの待ち時間(ms)。FAST_DEPLOYバフ適用ずみ */
  cooldownMs: number;
  /** 建物に当てたときのダメージ倍率（攻城役ほど大きい） */
  buildingDamageMult: number;
  target: BattleEntity['targetPreference'];
}

/**
 * シミュレーションに影響するバフだけを抜き出したもの。
 * 攻撃力・HP・射程などのバフは cfg.unitStats に、⚡関連は cfg.energyPerSec /
 * startEnergy / costMult に**焼き込みずみ**なのでここには現れない。
 * ここに残るのは「戦闘中に周期的に効く」タイプだけ。
 */
export interface SimBuffs {
  /** HEAL_AURA: 3秒ごとに最大HPの n% 回復（0なら無効） */
  healAuraPct: number;
}

/** チーム → プレイヤーの対応。P1が攻撃側、P2が防衛側の陣営を使う。 */
export const TEAM_OF: Record<PlayerId, { troop: BattleEntity['team']; building: BattleEntity['team'] }> = {
  P1: { troop: 'ATTACKER', building: 'ATTACKER_BUILDING' },
  P2: { troop: 'DEFENDER', building: 'DEFENDER' },
};

export const OPPONENT: Record<PlayerId, PlayerId> = { P1: 'P2', P2: 'P1' };
