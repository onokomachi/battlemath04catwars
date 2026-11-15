/**
 * 単元アプリの progressStore の代わり。
 * SANMON では 記録は SANMON の learningLogService が取る（サブトピック単位）。アプリの記録は作らない。
 */
const state = {
  recordResult: (_r: unknown) => {},
  getMasteryStreak: (_skillId: string) => 0,
  getTodaySkillCount: (_skillId: string) => 0,
  mastery: {} as Record<string, unknown>,
};
type S = typeof state;
export function useProgressStore<T>(selector: (s: S) => T): T { return selector(state); }
useProgressStore.getState = () => state;

/** アプリによっては skill_id → モジュールの対応も progressStore から読む（記録の見出し用。SANMON では使わない） */
export function skillToModuleId(_skillId: string): string | null { return null; }
export type ModuleId = string;
