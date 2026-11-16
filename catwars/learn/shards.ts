/**
 * かけら（レベルの上限を上げるもの。2026-11-15 CW-4a）。
 *
 * **ポータルにつなぐ前の、端末の中だけの数え方**。CW-5 で kit の sanmonShards に置きかえるので、
 * 数え方は localShards の1か所にまとめてある。
 *
 * 単元のかけら（0〜8）＝ その単元の項目のうち「まちがえずに3回以上解けた項目」の割合 × 8 を切り捨て。
 * 系統のかけら ＝ 結びつけた単元（gradePack の FAMILY_UNITS）の かけらの平均（切り捨て）。
 * 系統のレベルの上限 ＝ 20 + 5 × かけら（60まで。data/characters.ts の levelCapForShards）。
 */
import { unitSkillIds, unitsForFamily } from './gradePack';
import { useStudyStore } from '../store/useStudyStore';
import { levelCapForShards } from '../data/characters';
import { unlockedSkillIds } from '../data/skills';

export const MAX_SHARDS = 8;
/** この回数 まちがえずに解けた項目を「できた」と数える */
export const PERFECT_TIMES_FOR_SHARD = 3;

/** 単元のかけら（0〜8） */
export function localShards(unitKey: string, perfect: Record<string, number> = useStudyStore.getState().perfect): number {
  const skills = unitSkillIds(unitKey);
  if (skills.length === 0) return 0;
  const done = skills.filter((id) => (perfect[`${unitKey}/${id}`] ?? 0) >= PERFECT_TIMES_FOR_SHARD).length;
  return Math.floor((done / skills.length) * MAX_SHARDS);
}

/** 次のかけらまで、あと何項目を「3回 まちがえずに」すればよいか（上限なら 0） */
export function skillsToNextShard(unitKey: string, perfect: Record<string, number> = useStudyStore.getState().perfect): number {
  const skills = unitSkillIds(unitKey);
  const cur = localShards(unitKey, perfect);
  if (skills.length === 0 || cur >= MAX_SHARDS) return 0;
  const done = skills.filter((id) => (perfect[`${unitKey}/${id}`] ?? 0) >= PERFECT_TIMES_FOR_SHARD).length;
  const need = Math.ceil(((cur + 1) / MAX_SHARDS) * skills.length);
  return Math.max(1, need - done);
}

/** 系統のかけら（結びつけた単元の平均・切り捨て） */
export function familyShards(familyId: string, perfect: Record<string, number> = useStudyStore.getState().perfect): number {
  const units = unitsForFamily(familyId);
  if (units.length === 0) return 0;
  const sum = units.reduce((a, k) => a + localShards(k, perfect), 0);
  return Math.floor(sum / units.length);
}

/** 系統のレベルの上限 */
export function familyLevelCap(familyId: string, perfect: Record<string, number> = useStudyStore.getState().perfect): number {
  return levelCapForShards(familyShards(familyId, perfect));
}

/**
 * つぎの上限に いちばん近い単元（図鑑の「つぎの上限：『単元名』を まちがえずに とこう」に出す）。
 * 結びつけた単元のうち かけらが いちばん少ないもの（同じなら 先に書いたもの）。
 */
export function weakestUnitForFamily(familyId: string, perfect: Record<string, number> = useStudyStore.getState().perfect): string | null {
  const units = unitsForFamily(familyId);
  let best: string | null = null;
  let bestS = Infinity;
  for (const k of units) {
    const s = localShards(k, perfect);
    if (s < bestS) { bestS = s; best = k; }
  }
  return best;
}

/** その系統で 開いているスキルの id（かけら 2／4／8 で開く。data/skills.ts） */
export function familySkillIds(familyId: string, perfect: Record<string, number> = useStudyStore.getState().perfect): string[] {
  return unlockedSkillIds(familyId, familyShards(familyId, perfect));
}
