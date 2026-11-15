// ── CAT-WARS 経済ブリッジ ───────────────────────────────────────────────
// 戦闘中の問題（SOL の単元アプリと同じ問題）を まちがえずに解くたびに、
// CAT-WARS の通貨・部隊育成・学習の記録へ報酬を流し込む。
//
//   💠 クレジット … ずっと残る通貨。施設を買う・レベルを上げる・傭兵召集。問題と勝利でたまる。
//   ⚡ エナジー    … その日だけの通貨。出撃バフ（DailyBuffsPanel）に使う。
//   部隊XP         … 出撃の5枠の系統に入る（上限は かけら＝learn/shards.ts）。
//   学習の記録     … まちがえずに解いた回数（かけら）と、きょうの数（その日に動かせる施設）。useStudyStore。
//   （内部の store フィールド名 resources.gold=💠 / dailyStars=⚡ は そのまま）
//
// 数は data/rewards.ts（scripts/progressionSim.ts と同じもの）。

import { usePlayerStore } from './store/usePlayerStore';
import { useProgressStore } from './store/useProgressStore';
import { useArmyStore } from './store/useArmyStore';
import { useStudyStore } from './store/useStudyStore';
import { difficultyFactor } from './data/problemWeights';
import { CREDIT_PER_CORRECT, ENERGY_PER_CORRECT, STUDY_XP_PER_CORRECT } from './data/rewards';

/** むずかしさ3を 1.0 とした倍率（1で約0.75倍、5で約1.25倍） */
function studyMultiplier(difficulty = 3): number {
  return difficultyFactor(difficulty) / difficultyFactor(3);
}

/**
 * 1問ぶんの結果を CAT-WARS の経済に反映する（戦闘中の問題から呼ぶ）。
 * @param perfect まちがえずに解けたか
 * @param item 単元の key・記録の名前（単元アプリの skill_id）・むずかしさ 1〜5
 * @param formation 出撃の5枠（XP を入れる系統）
 */
export function grantStudyReward(
  perfect: boolean,
  item: { unitKey: string; skillId: string; difficulty?: number },
  formation: string[],
): void {
  const progress = useProgressStore.getState();
  // 学習量を記録（バフのティア解放条件・連続日数）
  try { progress.recordAnswer(item.skillId ?? 'study', perfect); } catch { /* noop */ }
  useStudyStore.getState().record(item.unitKey, item.skillId, perfect);
  if (!perfect) return;

  const m = studyMultiplier(item.difficulty ?? 3);
  usePlayerStore.getState().addResources(Math.round(CREDIT_PER_CORRECT * m));
  progress.addDailyStars(Math.max(1, Math.round(ENERGY_PER_CORRECT * m)));
  const army = useArmyStore.getState();
  const xp = Math.max(1, Math.round(STUDY_XP_PER_CORRECT * m));
  for (const id of formation) army.addXp(id, xp);
}
