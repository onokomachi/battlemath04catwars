/**
 * 収集を ほかのストアと つなぐところ（2026-11-16 CW-4c）。
 * ・answer()：戦闘の問題カード1問ごと（bridge.grantStudyReward から）
 * ・refresh()：バッジ・ネコの図鑑を いまの学習の記録から 決めなおす（ホーム・戦闘のあと）
 * 判定そのものは 純粋な関数（badges.ts・dex.ts・useCollectionStore の applyXxx）。
 */
import { useCollectionStore } from '../store/useCollectionStore';
import { useStudyStore } from '../store/useStudyStore';
import { useCampaignStore } from '../store/useCampaignStore';
import { useArmyStore } from '../store/useArmyStore';
import { useBaseStore } from '../store/useBaseStore';
import { useProgressStore } from '../store/useProgressStore';
import { PACK_UNITS } from '../learn/gradePack';
import { localShards, familyShards } from '../learn/shards';
import { CHARACTERS } from '../data/characters';
import { skillsForFamily, unlockedSkillIds } from '../data/skills';
import { unlockedFamilies } from '../utils/battleLoadout';
import { evalBadges, type BadgeInput } from './badges';
import { foundCatKeys } from './dex';

/** いまの記録から バッジの判定の数を作る（starsOverride＝戦いの結果を まだ ストアに入れていないとき） */
export function buildBadgeInput(starsOverride?: Record<string, number>): BadgeInput {
  const perfect = useStudyStore.getState().perfect;
  const c = useCollectionStore.getState();
  const unitPerfect: Record<string, number> = {};
  let perfectTotal = 0;
  for (const [k, v] of Object.entries(perfect)) {
    const unit = k.slice(0, k.indexOf('/'));
    unitPerfect[unit] = (unitPerfect[unit] ?? 0) + v;
    perfectTotal += v;
  }
  const unitShards: Record<string, number> = {};
  for (const u of PACK_UNITS) unitShards[u.key] = localShards(u.key, perfect);
  const fams = CHARACTERS.filter((f) => skillsForFamily(f.id).length > 0);
  let skillsOpen = 0;
  let familiesWithSkill = 0;
  for (const f of fams) {
    const n = unlockedSkillIds(f.id, familyShards(f.id, perfect)).length;
    skillsOpen += n;
    if (n > 0) familiesWithSkill += 1;
  }
  const st = c.stats;
  return {
    // まちがえずに といた合計は 収集を入れる前の記録もふくむ（useStudyStore）。1日の数は 収集の記録から
    perfectTotal: Math.max(perfectTotal, 0),
    bestDayPerfect: st.bestDayPerfect,
    bestStreak: st.bestStreak,
    studyDays: st.studyDays,
    reviewCleared: st.reviewCleared,
    unitPerfect, unitShards,
    bestRun: st.bestRun,
    hardPerfect: st.hardPerfect,
    star3Battles: st.star3Battles,
    stars: { ...useCampaignStore.getState().stars, ...(starsOverride ?? {}) },
    extremePerfectChapters: st.extremePerfect.length,
    shieldBreaks: st.shieldBreaks,
    skillsOpen, familiesWithSkill, familiesTotal: fams.length,
    bestBattlePerfect: st.bestBattlePerfect,
    bestBattleShield: st.bestBattleShield,
  };
}

/** いま見つけている ネコの鍵 */
export function currentCatKeys(): string[] {
  const owned = useBaseStore.getState().owned;
  const unlocked = unlockedFamilies(owned, useProgressStore.getState().permanentUnlocks);
  const army = useArmyStore.getState().army;
  const levels = Object.fromEntries(Object.entries(army).map(([k, v]) => [k, v?.level ?? 1]));
  return foundCatKeys(unlocked, levels);
}

/** バッジと ネコの図鑑を 決めなおす。あたらしく取った バッジの段・図鑑に のった ネコを返す */
export function refreshCollection(starsOverride?: Record<string, number>): { badges: { id: string; tier: number }[]; cats: string[] } {
  const store = useCollectionStore.getState();
  const cats = store.setCats(currentCatKeys());
  const badges = useCollectionStore.getState().setBadges(evalBadges(buildBadgeInput(starsOverride)));
  return { badges, cats };
}

/** 1問ぶん（戦闘の問題カードから）。もらった シールコインを返す */
export function recordCollectionAnswer(a: { unitKey: string; skillId: string; difficulty?: number; perfect: boolean }): number {
  return useCollectionStore.getState().recordAnswer(a);
}
