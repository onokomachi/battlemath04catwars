// ── CAT-WARS 経済ブリッジ ───────────────────────────────────────────────
// 戦闘中の問題（SOL の単元アプリと同じ問題）を まちがえずに解くたびに、
// CAT-WARS の通貨・部隊育成へ報酬を流し込む。
//
// 2通貨設計（詳細は docs/CATWARS_DESIGN.md）:
//   💠 クレジット(CR) … 永続通貨。建設・強化・レアネコ解放の元手。正解でコツコツ貯まる。
//   ⚡ エナジー(EN)   … 当日リセット。出撃バフ／防衛配置／戦闘の元手。今日の学習ぶんは今日つかう。
//   部隊XP           … 通貨ではなく自動成長。学習で薄く・戦闘で厚く育ち、レベル→進化する。
//   （内部の store フィールド名 resources.gold=CR / dailyStars=EN は後方互換のため据え置き）

import { usePlayerStore } from './store/usePlayerStore';
import { useProgressStore } from './store/useProgressStore';
import { useArmyStore } from './store/useArmyStore';
import { CHARACTERS } from './data/characters';
import { difficultyFactor } from './data/problemWeights';

export const CREDIT_PER_CORRECT = 12;   // 難易度3(標準)の問題1問あたりのクレジット(CR)
export const ENERGY_PER_CORRECT = 2;    // 難易度3の問題1問あたりのエナジー(EN・当日)
export const STUDY_XP_PER_CORRECT = 4;  // 難易度3の問題1問あたり、各スターター系統へ配分するXP

const STARTER_IDS = CHARACTERS.filter(c => c.isStarter).map(c => c.id);

/** むずかしさ3を 1.0 とした倍率（1で約0.75倍、5で約1.25倍） */
function studyMultiplier(difficulty = 3): number {
  return difficultyFactor(difficulty) / difficultyFactor(3);
}

/**
 * 1問ぶんの結果を CAT-WARS の経済に反映する（戦闘中の問題から呼ぶ）。
 * @param unitId 記録の名前（単元アプリの skill_id）
 * @param difficulty その項目のむずかしさ 1〜5（gradePack）
 */
export function grantStudyReward(isCorrect: boolean, unitId?: string, difficulty = 3): void {
  const progress = useProgressStore.getState();
  // 学習量を記録（バフのティア解放条件・連続日数）
  try { progress.recordAnswer(unitId ?? 'study', isCorrect); } catch { /* noop */ }
  if (!isCorrect) return;

  const m = studyMultiplier(difficulty);
  usePlayerStore.getState().addResources(Math.round(CREDIT_PER_CORRECT * m));
  progress.addDailyStars(Math.max(1, Math.round(ENERGY_PER_CORRECT * m)));
  const army = useArmyStore.getState();
  const xp = Math.max(1, Math.round(STUDY_XP_PER_CORRECT * m));
  for (const id of STARTER_IDS) army.addXp(id, xp);
}

/** まとめ報酬（本番テスト完了時など、複数問ぶんをまとめて付与したい場面用） */
export function grantBulkReward(correctCount: number): void {
  if (correctCount <= 0) return;
  usePlayerStore.getState().addResources(CREDIT_PER_CORRECT * correctCount);
  useProgressStore.getState().addDailyStars(Math.round(ENERGY_PER_CORRECT * correctCount));
}
