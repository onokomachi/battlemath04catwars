/**
 * 「なかまの 基地」の形（CW-6b・2026-11-17）。docs/REBUILD_SPEC.md §5b。
 *
 * 自分の基地の配置（陣地づくりで置いた施設）を、**同じ学級の なかま**が 攻められるように サーバへ しまう。形は ゲームの今の型
 * （DeployedBuilding＝種類・x・y）と 施設のレベル。サーバに入れる JSON は 小さく（めやす 0.4KB・上限 2KB）：
 *
 *   { v: 1, b: [["T", 2, 7], ["C", 4, 5], ["W", 5, 6], …], lv: [コア, 砲台, 電撃トラップ, 壁] }
 *     T＝コア C＝砲台 H＝電撃トラップ W＝壁 A＝キャンプ。x・y は 陣地ゾーンの中（x 0〜9・y 0〜15。左が自陣）。
 *
 * サーバから来る形は **ほかの子の端末が書いたもの**なので、信用しない：`sanitizeFriendBase` が 形・数・場所・重なりを ぜんぶ見て、
 * 合わないものは すてる（持てる数の上限＝FACILITY_MAX_COUNT・コアは1つ・ゾーンの外は すてる）。
 *
 * 攻める側の戦場では 左右を反転して 右（敵陣）に置く（`placeOnMap`）。施設のレベルは sim に渡せない（sim は変えない）ので、
 * 「火力の目安」（`firepower`）として 敵の強さを 上限・下限つきで そろえるのに使う（friend/friendAttack.ts）。
 */
import { BuildingType, GRID_H, GRID_W, BASE_MAX_W, type BattleMap } from '../types';
import { BUILDING_STATS } from '../constants';
import { FACILITY_MAX_COUNT, MAX_FACILITY_LEVEL, facilityMult } from '../data/facilities';
import { ENEMY_PRODUCTION_RATE } from '../data/campaign';
import { mirrorBase, withExtraDefenses } from '../data/battleMaps';

/** サーバに入れる JSON の 大きさの上限（バイト。サーバの SQL と同じ） */
export const FRIEND_BASE_MAX_BYTES = 2048;
export const FRIEND_BASE_VERSION = 1;

const CODE_OF: Partial<Record<BuildingType, string>> = {
  [BuildingType.TOWN_HALL]: 'T', [BuildingType.CANNON]: 'C', [BuildingType.HIDDEN_TESLA]: 'H',
  [BuildingType.WALL]: 'W', [BuildingType.ARMY_CAMP]: 'A',
};
const TYPE_OF: Record<string, BuildingType> = Object.fromEntries(
  Object.entries(CODE_OF).map(([t, c]) => [c as string, t as BuildingType]),
);
/** レベルを送る 4つの種類（戦うときに 強さが かわるもの）。この順 */
const LEVEL_TYPES = [BuildingType.TOWN_HALL, BuildingType.CANNON, BuildingType.HIDDEN_TESLA, BuildingType.WALL] as const;

export interface PlacedBuilding { type: BuildingType; x: number; y: number }

/** 中身を 見なおした なかまの 基地（左が自陣の ままの 座標。x 0〜9） */
export interface FriendBase {
  buildings: PlacedBuilding[];
  /** 種類 → レベル（1〜10。LEVEL_TYPES の4つだけ） */
  levels: Partial<Record<BuildingType, number>>;
}

/** サーバに入れる形（JSON） */
export interface FriendBaseWire { v: number; b: [string, number, number][]; lv: number[] }

const isInt = (n: unknown): n is number => typeof n === 'number' && Number.isInteger(n);

/** 自分の配置（DeployedBuilding の並び）と 施設のレベルから、サーバに入れる形を作る（配置は 先に置いた順のまま） */
export function encodeFriendBase(layout: readonly PlacedBuilding[], levelOf: (t: BuildingType) => number): FriendBaseWire | null {
  const core = layout.find((d) => d.type === BuildingType.TOWN_HALL);
  if (!core) return null;
  const rest = layout.filter((d) => d !== core && CODE_OF[d.type]);
  const b = [core, ...rest].map((d) => [CODE_OF[d.type]!, d.x, d.y] as [string, number, number]);
  return { v: FRIEND_BASE_VERSION, b, lv: LEVEL_TYPES.map((t) => Math.max(1, Math.min(MAX_FACILITY_LEVEL, Math.round(levelOf(t))))) };
}

/** サーバに入れる JSON の バイト数 */
export const wireBytes = (w: unknown): number => new TextEncoder().encode(JSON.stringify(w)).length;

/** 名乗っている子が 見せてよい基地か（コアのほかに 1つは 置いてある・大きさの上限の中） */
export function shareable(w: FriendBaseWire | null): w is FriendBaseWire {
  return !!w && w.b.length >= 2 && wireBytes(w) <= FRIEND_BASE_MAX_BYTES;
}

const footprint = (t: BuildingType) => ({ w: BUILDING_STATS[t].width, h: BUILDING_STATS[t].height });

/**
 * サーバから来た JSON を 見なおす（信用しない）。形がちがう・コアが無い なら null。
 * 持てる数を こえた分・ゾーンの外・重なり・知らない種類は すてる。コアは 1つだけ（先のもの）。
 */
export function sanitizeFriendBase(raw: unknown): FriendBase | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<FriendBaseWire>;
  if (r.v !== FRIEND_BASE_VERSION || !Array.isArray(r.b) || r.b.length === 0 || r.b.length > 40) return null;
  const used = new Set<string>();
  const count: Partial<Record<BuildingType, number>> = {};
  const out: PlacedBuilding[] = [];
  for (const e of r.b) {
    if (!Array.isArray(e) || e.length !== 3) continue;
    const [c, x, y] = e as unknown[];
    const type = typeof c === 'string' ? TYPE_OF[c] : undefined;
    if (!type || !isInt(x) || !isInt(y)) continue;
    const { w, h } = footprint(type);
    if (x < 0 || y < 0 || x + w > BASE_MAX_W || y + h > GRID_H) continue;
    const n = (count[type] ?? 0) + 1;
    // コアは 1つ。ほかは 持てる数まで
    if (n > (type === BuildingType.TOWN_HALL ? 1 : FACILITY_MAX_COUNT[type])) continue;
    const cells: string[] = [];
    for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) cells.push(`${x + dx},${y + dy}`);
    if (cells.some((k) => used.has(k))) continue;
    cells.forEach((k) => used.add(k));
    count[type] = n;
    out.push({ type, x, y });
  }
  if (!out.some((b) => b.type === BuildingType.TOWN_HALL)) return null;
  const levels: Partial<Record<BuildingType, number>> = {};
  LEVEL_TYPES.forEach((t, i) => {
    const v = Array.isArray(r.lv) ? r.lv[i] : 1;
    levels[t] = isInt(v) ? Math.max(1, Math.min(MAX_FACILITY_LEVEL, v)) : 1;
  });
  return { buildings: out, levels };
}

const lv = (b: FriendBase, t: BuildingType) => b.levels[t] ?? 1;
const countOf = (bs: readonly { type: BuildingType }[], t: BuildingType) => bs.filter((b) => b.type === t).length;

/**
 * 火力の めやす：砲台 3・電撃トラップ 2 に レベルの効き（HP・こうげき ×(1+0.1×(Lv−1))）をかけた合計。
 * 敵の強さを 戦場ごとの「標準の火力」に そろえるのに使う（上限・下限つき。friend/friendAttack.ts）。
 */
export function firepower(buildings: readonly { type: BuildingType }[], level: (t: BuildingType) => number = () => 1): number {
  return countOf(buildings, BuildingType.CANNON) * 3 * facilityMult(BuildingType.CANNON, level(BuildingType.CANNON))
    + countOf(buildings, BuildingType.HIDDEN_TESLA) * 2 * facilityMult(BuildingType.HIDDEN_TESLA, level(BuildingType.HIDDEN_TESLA));
}
export const baseFirepower = (b: FriendBase): number => firepower(b.buildings, (t) => lv(b, t));

/** 敵の増援が出る速さの 上乗せ（キャンプ・兵舎・発電所。ENEMY_PRODUCTION_RATE の合計） */
export function productionBonus(buildings: readonly { type: BuildingType }[]): number {
  return buildings.reduce((a, b) => a + (ENEMY_PRODUCTION_RATE[b.type] ?? 0), 0);
}

/** 下限：砲台は 2つ・キャンプは 1つ いじょう（何も おいていない基地が ただで 勝てる 道に ならないように） */
export const MIN_CANNONS = 2;
export const MIN_CAMPS = 1;

/**
 * 戦場に置く：左右を反転して 右（敵陣）へ。足りない砲台・キャンプは コアの手前に足す（下限）。
 * 地形でふさがれる所（水・岩・溶岩）は 戦場の えらび方（friend/friendAttack.ts の FRIEND_MAPS）で さけている。
 */
export function placeOnMap(map: BattleMap, base: FriendBase): BattleMap['enemyBase'] {
  const mirrored = mirrorBase(base.buildings, (t) => BUILDING_STATS[t].width);
  const need: BuildingType[] = [];
  for (let i = countOf(mirrored, BuildingType.CANNON); i < MIN_CANNONS; i++) need.push(BuildingType.CANNON);
  for (let i = countOf(mirrored, BuildingType.ARMY_CAMP); i < MIN_CAMPS; i++) need.push(BuildingType.ARMY_CAMP);
  return need.length ? withExtraDefenses(map, mirrored, need) : mirrored;
}

/** 戦場の 右はしの 地形（x≥ 18）が 水・岩・溶岩で ふさがっていないか（なかまの基地の 最大の広さ＝x 18〜27） */
export function rightSideClear(map: BattleMap): boolean {
  const minX = GRID_W - BASE_MAX_W;
  return !map.terrain.some((t) => t.x >= minX && (t.type === 'WATER' || t.type === 'ROCK' || t.type === 'LAVA'));
}

/** 画面に出す 基地の ようす（ふやした 砲台・キャンプまで 入れた 敵陣の 配置は placeOnMap） */
export function describeBase(b: FriendBase): { cannons: number; teslas: number; walls: number; camps: number } {
  return {
    cannons: countOf(b.buildings, BuildingType.CANNON), teslas: countOf(b.buildings, BuildingType.HIDDEN_TESLA),
    walls: countOf(b.buildings, BuildingType.WALL), camps: countOf(b.buildings, BuildingType.ARMY_CAMP),
  };
}
