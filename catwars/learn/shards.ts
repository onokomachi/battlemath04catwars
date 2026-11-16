/**
 * かけら（レベルの上限を上げるもの。2026-11-15 CW-4a／CW-5a 2026-11-16 で サーバの数え方を足した）。
 *
 * **入口は unitShards の1つ**。スキル・レベルの上限・バッジ・図鑑は どれも unitShards → familyShards を通る。
 *   - 名乗っているとき（学級）：サーバの記録で数える（kit の sanmonShards。portal/usePortal.ts が setServerShards で わたす）。
 *     SANMON と同じ かけら（単元アプリの 本番テストで8割の日・実力の階段の段）なので、端末を変えても同じ。
 *   - おためし・つないでいないビルド・まだ読めていない：端末の中だけの数え方（localShards）。
 *
 * 単元のかけら（0〜8）
 *   端末：その単元の項目のうち「まちがえずに3回以上解けた項目」の割合 × 8 を切り捨て。
 *   サーバ：本番テスト8割の日（5まで）＋実力の階段（半分・4分の3・てっぺん で1つずつ）。ちょうど 0〜8。
 * 系統のかけら ＝ 結びつけた単元（gradePack の FAMILY_UNITS）の かけらの平均（切り捨て）。
 * 系統のレベルの上限 ＝ 20 + 5 × かけら（60まで。data/characters.ts の levelCapForShards＝kit の levelCapFor と同じ式）。
 */
import { create } from 'zustand';
import { unitSkillIds, unitsForFamily } from './gradePack';
import { useStudyStore } from '../store/useStudyStore';
import { levelCapForShards } from '../data/characters';
import { unlockedSkillIds } from '../data/skills';

export const MAX_SHARDS = 8;
/** この回数 まちがえずに解けた項目を「できた」と数える（端末の数え方） */
export const PERFECT_TIMES_FOR_SHARD = 3;

/** サーバの かけら（単元の key → 数）。null のときは 端末の数え方 */
export const useShardSource = create<{ server: Record<string, number> | null }>()(() => ({ server: null }));
export function setServerShards(server: Record<string, number> | null): void {
  useShardSource.setState({ server });
}
/** いま サーバの かけらで 数えているか */
export const shardsFromServer = (): boolean => useShardSource.getState().server !== null;

/** 単元のかけら（0〜8）：端末の中だけの数え方 */
export function localShards(unitKey: string, perfect: Record<string, number> = useStudyStore.getState().perfect): number {
  const skills = unitSkillIds(unitKey);
  if (skills.length === 0) return 0;
  const done = skills.filter((id) => (perfect[`${unitKey}/${id}`] ?? 0) >= PERFECT_TIMES_FOR_SHARD).length;
  return Math.floor((done / skills.length) * MAX_SHARDS);
}

/** 単元のかけら（0〜8）。**かけらの入口**（サーバ → 端末 の順） */
export function unitShards(unitKey: string, perfect: Record<string, number> = useStudyStore.getState().perfect): number {
  const server = useShardSource.getState().server;
  if (server) return Math.max(0, Math.min(MAX_SHARDS, Math.floor(server[unitKey] ?? 0)));
  return localShards(unitKey, perfect);
}

/** 次のかけらまで、あと何項目を「3回 まちがえずに」すればよいか（上限・サーバの数え方なら 0） */
export function skillsToNextShard(unitKey: string, perfect: Record<string, number> = useStudyStore.getState().perfect): number {
  if (shardsFromServer()) return 0;
  const skills = unitSkillIds(unitKey);
  const cur = localShards(unitKey, perfect);
  if (skills.length === 0 || cur >= MAX_SHARDS) return 0;
  const done = skills.filter((id) => (perfect[`${unitKey}/${id}`] ?? 0) >= PERFECT_TIMES_FOR_SHARD).length;
  const need = Math.ceil(((cur + 1) / MAX_SHARDS) * skills.length);
  return Math.max(1, need - done);
}

/** 図鑑の「つぎの上限」の文（数え方で ちがう） */
export function nextShardHint(unitName: string, unitKey: string, perfect: Record<string, number> = useStudyStore.getState().perfect): string {
  if (shardsFromServer()) return `つぎの上限：『${unitName}』の 単元アプリで 本番テスト（8わり）・実力の階段を がんばろう`;
  const n = skillsToNextShard(unitKey, perfect);
  return `つぎの上限：『${unitName}』を まちがえずに とこう${n > 0 ? `（あと ${n}こうもくを 3回ずつ）` : ''}`;
}

/** 系統のかけら（結びつけた単元の平均・切り捨て） */
export function familyShards(familyId: string, perfect: Record<string, number> = useStudyStore.getState().perfect): number {
  const units = unitsForFamily(familyId);
  if (units.length === 0) return 0;
  const sum = units.reduce((a, k) => a + unitShards(k, perfect), 0);
  return Math.floor(sum / units.length);
}

/** 系統のレベルの上限 */
export function familyLevelCap(familyId: string, perfect: Record<string, number> = useStudyStore.getState().perfect): number {
  return levelCapForShards(familyShards(familyId, perfect));
}

/**
 * つぎの上限に いちばん近い単元（図鑑の「つぎの上限：『単元名』…」に出す）。
 * 結びつけた単元のうち かけらが いちばん少ないもの（同じなら 先に書いたもの）。
 */
export function weakestUnitForFamily(familyId: string, perfect: Record<string, number> = useStudyStore.getState().perfect): string | null {
  const units = unitsForFamily(familyId);
  let best: string | null = null;
  let bestS = Infinity;
  for (const k of units) {
    const s = unitShards(k, perfect);
    if (s < bestS) { bestS = s; best = k; }
  }
  return best;
}

/** その系統で 開いているスキルの id（かけら 2／4／8 で開く。data/skills.ts） */
export function familySkillIds(familyId: string, perfect: Record<string, number> = useStudyStore.getState().perfect): string[] {
  return unlockedSkillIds(familyId, familyShards(familyId, perfect));
}
