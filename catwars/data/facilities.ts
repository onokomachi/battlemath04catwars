// ── 基地の施設（持ちつづける・レベル1〜10。2026-11-15 CW-4a）──────────────────────
//
// 前は 施設を毎日 ⚡（当日の通貨）で建て直し、日付が変わると消えた。これをやめ、
//   ・施設は 持ちつづける（種類ごとに「持っている数」と「レベル」。レベルは種類ごとに1つ）
//   ・買う・レベルを上げるのは 💠クレジット（問題と勝利でたまる）
//   ・その日に動かせる数は「きょう まちがえずに解いた数」で決まる（コアは いつも動く）
// にした。休んでも施設は消えない（損失で子どもを縛らない）が、動かすには その日の学習が要る。
//
// 値段は scripts/progressionSim.ts で決めた：1日20分・4週間の子が 全種類を Lv4〜5 にでき、
// 1日90分の子でも 8週間で 全部を Lv10 にはできない。

import { BuildingType } from '../types';

export const MAX_FACILITY_LEVEL = 10;

/** 持てる数の上限（コアは1つ・はじめから持っている） */
export const FACILITY_MAX_COUNT: Record<BuildingType, number> = {
  [BuildingType.TOWN_HALL]: 1,
  [BuildingType.CANNON]: 4,
  [BuildingType.HIDDEN_TESLA]: 2,
  [BuildingType.WALL]: 12,
  [BuildingType.ARMY_CAMP]: 2,
  [BuildingType.BARRACKS]: 3,
  [BuildingType.GOLD_MINE]: 2,
};

/** 1つめを買う値段（💠）。2つめ以降は「n × この値段」（n＝何個めか） */
export const FACILITY_BUY_COST: Record<BuildingType, number> = {
  [BuildingType.TOWN_HALL]: 0,
  [BuildingType.CANNON]: 250,
  [BuildingType.HIDDEN_TESLA]: 450,
  [BuildingType.WALL]: 40,
  [BuildingType.ARMY_CAMP]: 300,
  [BuildingType.BARRACKS]: 300,
  [BuildingType.GOLD_MINE]: 400,
};

/** Lv1→2 に上げる値段（💠）。そこから 1レベルごとに ×UPGRADE_GROWTH */
export const FACILITY_UPGRADE_BASE: Record<BuildingType, number> = {
  [BuildingType.TOWN_HALL]: 1200,
  [BuildingType.CANNON]: 1050,
  [BuildingType.HIDDEN_TESLA]: 1050,
  [BuildingType.WALL]: 750,
  [BuildingType.ARMY_CAMP]: 750,
  [BuildingType.BARRACKS]: 750,
  [BuildingType.GOLD_MINE]: 900,
};
/**
 * 1レベルごとの値段の上がり方。仕様の出発点は ×1.6 だったが、トップ層（1日90分）の 💠 は エンジョイ勢の約21倍
 * （げきむず の勝利 ×2.2 が大きい）で、×1.6 では 3週めに 全施設が Lv10 になった。×1.8 にして、
 * エンジョイ勢が4週間で Lv4〜5・トップ層が8週間で Lv9〜10（全部は そろわない）にした（scripts/progressionSim.ts）。
 */
export const UPGRADE_GROWTH = 1.8;

/** その種類の n 個めを買う値段（n は 1 から） */
export function buyCost(type: BuildingType, nth: number): number {
  return FACILITY_BUY_COST[type] * Math.max(1, nth);
}

/** Lv(level) → Lv(level+1) に上げる値段。上限なら Infinity */
export function upgradeCost(type: BuildingType, level: number): number {
  if (level >= MAX_FACILITY_LEVEL) return Infinity;
  let c = FACILITY_UPGRADE_BASE[type];
  for (let l = 1; l < level; l++) c *= UPGRADE_GROWTH;
  return Math.round(c / 10) * 10;
}

/** レベルで強くなる施設（HP・こうげき ×(1 + 0.1×(Lv−1))） */
export const LEVELED_COMBAT: BuildingType[] = [
  BuildingType.TOWN_HALL, BuildingType.CANNON, BuildingType.HIDDEN_TESLA, BuildingType.WALL,
];
export function facilityMult(type: BuildingType, level: number): number {
  if (!LEVELED_COMBAT.includes(type)) return 1;
  return 1 + 0.1 * (Math.max(1, Math.min(MAX_FACILITY_LEVEL, level)) - 1);
}

/** 戦場に置く施設（動かせる数に数える）。兵舎・発電所は置かず、持っているだけで はたらく */
export const PLACEABLE_FACILITIES: BuildingType[] = [
  BuildingType.WALL, BuildingType.CANNON, BuildingType.HIDDEN_TESLA, BuildingType.ARMY_CAMP,
];
export const SUPPORT_FACILITIES: BuildingType[] = [BuildingType.BARRACKS, BuildingType.GOLD_MINE];

/** まちがえずに これだけ解くと、動かせる施設が 1 ふえる */
export const PERFECT_PER_ACTIVE = 5;
/** その日に動かせる施設の数（コアのほか）。休んでも施設は消えないが、動かすには その日の学習が要る */
export function activeFacilityLimit(todayPerfect: number): number {
  return 2 + Math.floor(Math.max(0, todayPerfect) / PERFECT_PER_ACTIVE);
}

/** 発電所：勝ったときの 💠 の上乗せ（1つにつき +5%・レベルごとに +1%）。放置の収入は無い */
export function powerPlantBonus(count: number, level: number): number {
  if (count <= 0) return 0;
  return count * (0.05 + 0.01 * (Math.max(1, level) - 1));
}

/**
 * 兵舎の数で開く系統（近接・遠距離・タンクは はじめから）。
 * ボス系統は 兵舎では開かない（傭兵召集で 💠 を使って開く）。
 */
export const BARRACKS_UNLOCKS: { need: number; ids: string[] }[] = [
  { need: 1, ids: ['bomber', 'speed'] },
  { need: 2, ids: ['magic', 'healer'] },
  { need: 3, ids: ['flying'] },
];
export function barracksNeededFor(id: string): number | null {
  for (const u of BARRACKS_UNLOCKS) if (u.ids.includes(id)) return u.need;
  return null;
}
