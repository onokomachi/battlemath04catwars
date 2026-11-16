export enum BuildingType {
  TOWN_HALL = 'TOWN_HALL',
  GOLD_MINE = 'GOLD_MINE',
  BARRACKS = 'BARRACKS',
  ARMY_CAMP = 'ARMY_CAMP',
  WALL = 'WALL',
  CANNON = 'CANNON',
  HIDDEN_TESLA = 'HIDDEN_TESLA'
}

export enum ResourceType {
  GOLD = 'GOLD'
}

export enum BuildingStatus {
  CONSTRUCTING = 'CONSTRUCTING',
  ACTIVE = 'ACTIVE'
}

export interface Coordinates {
  x: number;
  y: number;
}

export interface Building {
  id: string;
  type: BuildingType;
  level: number;
  position: Coordinates;
  hp: number;
  maxHp: number;
  status: BuildingStatus;
  constructionEndTime?: number; // Timestamp when construction finishes
  lastCollected?: number; // Timestamp
}

export interface Troop {
  id: string;
  name: string;
  count: number;
  damage: number;
  hp: number;
  target: 'ANY' | 'DEFENSE' | 'RESOURCE';
  moveSpeed: number; // Tiles per second
}

export interface GameState {
  resources: {
    gold: number;
    maxGold: number;
  };
  buildings: Building[];
  troops: Troop[];
  lastTick: number;
}

export interface BattleEntity {
  id: string;
  type: 'TROOP' | 'BUILDING';
  subType: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  damage: number;
  // NEUTRAL = 第3勢力（中立エイリアン・巨大生物）。敵味方の区別なく攻撃し、両陣営から攻撃される。
  team: 'ATTACKER' | 'DEFENDER' | 'ATTACKER_BUILDING' | 'NEUTRAL';
  targetId?: string | null;
  attackRange: number;
  attackSpeed: number; // ms per attack
  lastAttack: number;
  moveSpeed: number;
  path?: Coordinates[]; // Current path to target
  targetPreference: 'ANY' | 'DEFENSE' | 'RESOURCE' | 'RUSH' | 'HOLD' | 'MOVE_TO';
  customTarget?: { x: number; y: number };
  /**
   * プレイヤーが「こいつを狙え」と名指ししたエンティティID。
   * 生きているあいだは、距離に関係なくこの相手を最優先で追いかけて攻撃する。
   * 倒されたら自動で解除され、通常の「いちばん近い敵」に戻る。
   */
  focusId?: string | null;
  isHidden?: boolean; // For traps
  /** 敵の種類（EnemyUnitKind）。特別なきまり（盾・回復・自爆・空中）の判定に使う。絵は subType */
  kind?: string;
  /** ボスのシールドの残り枚数。1枚でもあると、うけるダメージは1割。復習の問題を解くと1枚われる */
  shield?: number;
  /** 出てきた tick（スキル「ダッシュ」の むてきの時間に使う。sim の中だけ） */
  bornTick?: number;
  /** さいしょの1発を うったか（スキル「せんせいの いちげき」） */
  firstHitDone?: boolean;
}

// LAVA = 溶岩。乗っているあいだ継続ダメージ（敵味方・中立すべてに適用）。通行は可能。
export type TerrainType = 'GRASS' | 'WATER' | 'BRIDGE' | 'ROCK' | 'SWAMP' | 'LAVA';

// ── Daily Buff System（T1〜T4 グラデーション）─────────────────────────────────
export type BuffTier = 1 | 2 | 3 | 4;

export type BuffType =
  // T1 一般（常時開放）
  | 'FAST_DEPLOY'      // 出撃インターバル撤廃
  | 'COST_REDUCTION'   // 戦闘中兵士コスト30%オフ
  | 'GOLD_RUSH'        // 開始時ゴールド+150
  | 'GOLD_BOOST'       // 問題カードで もらえる ⚡ が +20〜50%（CW-5a で作り直し。前は自動の湧きに掛けていて 効き目が無かった）
  // T2 上級（本日10問以上）
  | 'RARE_BARBARIAN'   // 近接系：HP+50%・攻撃力+40%
  | 'RARE_ARCHER'      // 遠距離系：射程+・速度+30%
  | 'POWER_BOOST'      // 全兵士攻撃力+40%
  | 'EXTRA_TROOPS'     // 近接系×6 追加支給
  | 'SWIFT_ARMY'       // 全兵士の移動速度+40%
  // T3 精鋭（本日25問 or 連続5日）
  | 'HEAL_AURA'        // 全兵士が定期的にHP回復
  | 'GIANT_FORTRESS'   // タンク系のHP×2
  | 'DOUBLE_LOOT'      // 勝利時の戦利品2倍
  | 'WIZARD_SUPPORT'   // 魔法系×2 追加支給
  // T4 伝説（本日40問 かつ 連続3日）
  | 'DRAGON_SUMMON'    // 飛行系×1 追加支給（強力）
  | 'ARMAGEDDON'       // 全兵士攻撃力+70%
  | 'GENIUS_COMMANDER'; // 全兵士のHP・攻撃力+20%

export interface ActiveDailyBuff {
  type: BuffType;
  activatedAt: number;
  expiresAt: number; // end of today (midnight)
  level?: 1 | 2 | 3;  // NEW: 1=小, 2=中, 3=大. undefined/missing = 2 for legacy
}

export interface TerrainTile {
  x: number;
  y: number;
  type: TerrainType;
}

/** 流星ゾーン: 一定間隔で予告が出て、そのあと範囲ダメージが落ちる（⑤ ステージギミック） */
export interface MeteorZone {
  x: number;
  y: number;
  /** 効果半径（マス） */
  radius: number;
  /** 落下の間隔(ms) */
  intervalMs: number;
  /** 予告が出てから着弾までの猶予(ms)。見てから避けられる長さにする */
  warningMs: number;
  damage: number;
}

/** 中立エイリアンの巣: 定期的に湧き、敵味方の区別なく最も近い相手を襲う */
export interface AlienNest {
  x: number;
  y: number;
  intervalMs: number;
  /** 同時に存在できる数の上限 */
  max: number;
}

/** 巨大生物: 決まった経路を往復し、進路に入ったキャラを攻撃する中立の大型モンスター */
export interface TitanBeast {
  /** 往復する経路（両端を行き来する） */
  path: Coordinates[];
  moveSpeed: number;
  damage: number;
  attackRange: number;
  attackSpeed: number;
  hp: number;
}

export interface BattleMap {
  id: string;
  name: string;
  description: string;
  terrain: TerrainTile[];
  enemyBase: { type: BuildingType; x: number; y: number }[];
  playerDeployZone: { xMin: number; xMax: number; yMin: number; yMax: number };
  /** ステージギミック（いずれも任意。第1〜2章は付けない） */
  meteorZones?: MeteorZone[];
  alienNests?: AlienNest[];
  titan?: TitanBeast;
}

export interface DeployedBuilding {
  type: BuildingType;
  x: number;
  y: number;
}

export interface BattleLoadout {
  unlockedTroopTypes: string[];
  maxBuildingSlots: number;
  canBringCannon: boolean;
  canBringTesla: boolean;
  maxWallSlots: number;
  healCharges: number;
  rageCharges: number;
  availableBuildingTypes: BuildingType[];
}

// ── 盤面ジオメトリ ────────────────────────────────────────────────────────
// iPad を横向きに持ってプレイするため、正方形(15×15)から**横長(28×16 = 7:4)**へ変更した。
// 16:9 よりわずかに縦を残しているのは、上下のUIバーを引いた実表示領域がおおむね 7:4 に
// なるため（1180×820 の iPad で、上部64px・下部バーを引いた領域に一致させている）。
export const GRID_W = 28;
export const GRID_H = 16;

/** 拠点づくりで扱える最大の陣地サイズ。実際の広さはステージごとの自陣ゾーンで決まる。 */
export const BASE_MAX_W = 10;
export const BASE_MAX_H = GRID_H;