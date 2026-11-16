import { BuildingType, BattleLoadout, DeployedBuilding } from '../types';
import type { FacilityCounts } from '../store/useBaseStore';
import { CHARACTERS } from '../data/characters';
import { BARRACKS_UNLOCKS, PLACEABLE_FACILITIES } from '../data/facilities';

/** はじめから使える系統（近接・遠距離・タンク） */
export const STARTER_IDS = CHARACTERS.filter(c => c.isStarter).map(c => c.id);

/**
 * 使える系統：はじめから の3つ＋**持っている兵舎の数**で開く系統＋傭兵召集（💠）で開いた系統。
 * 兵舎は戦場に置かない施設なので、その日に動かせる数には数えない（持っていれば いつも はたらく）。
 */
export function unlockedFamilies(owned: FacilityCounts, permanentUnlocks: string[] = []): string[] {
  const barracks = owned[BuildingType.BARRACKS] ?? 0;
  const out = [...STARTER_IDS];
  for (const u of BARRACKS_UNLOCKS) if (barracks >= u.need) out.push(...u.ids);
  for (const id of permanentUnlocks) if (!out.includes(id)) out.push(id);
  return CHARACTERS.map(c => c.id).filter(id => out.includes(id));
}

/**
 * 配置のうち、きょう動かせるもの（コアは いつも。ほかは 先に置いた順に limit 個まで）。
 * 動かせない（止まっている）ものは inactive に入る（画面で うすく出す）。
 */
export function splitActiveLayout(layout: DeployedBuilding[], limit: number): {
  active: DeployedBuilding[]; inactive: DeployedBuilding[];
} {
  const active: DeployedBuilding[] = [];
  const inactive: DeployedBuilding[] = [];
  let n = 0;
  for (const d of layout) {
    if (d.type === BuildingType.TOWN_HALL || !PLACEABLE_FACILITIES.includes(d.type)) { active.push(d); continue; }
    if (n < limit) { active.push(d); n++; } else inactive.push(d);
  }
  return { active, inactive };
}

/**
 * 持っている施設と、きょう動かせる配置から、戦闘で使える能力を出す。
 * @param owned 持っている数
 * @param activeLayout きょう動かせる配置（splitActiveLayout の active）
 */
export function computeBattleLoadout(
  owned: FacilityCounts, activeLayout: DeployedBuilding[] = [], permanentUnlocks: string[] = [],
): BattleLoadout {
  const n = (type: BuildingType) => activeLayout.filter(d => d.type === type).length;
  const camps = n(BuildingType.ARMY_CAMP);
  const cannons = owned[BuildingType.CANNON] ?? 0;
  const teslas = owned[BuildingType.HIDDEN_TESLA] ?? 0;

  const availableBuildingTypes: BuildingType[] = [BuildingType.WALL];
  if (cannons > 0) availableBuildingTypes.push(BuildingType.CANNON);
  if (teslas > 0) availableBuildingTypes.push(BuildingType.HIDDEN_TESLA);

  return {
    unlockedTroopTypes: unlockedFamilies(owned, permanentUnlocks),
    maxBuildingSlots: cannons + teslas + (owned[BuildingType.ARMY_CAMP] ?? 0),
    canBringCannon: cannons > 0,
    canBringTesla: teslas > 0,
    maxWallSlots: owned[BuildingType.WALL] ?? 0,
    // 呪文は きょう動いているキャンプの数で増える（基本2 + キャンプ1つにつき1）
    healCharges: 2 + camps,
    rageCharges: 2 + camps,
    availableBuildingTypes,
  };
}
