/** 単元アプリの useAdaptive（おまかせのレベル調整）の代わり。SANMON ではレベルを出題側で決めるので使わない */
export function useAdaptive<L extends string>(levelIds: L[], _toSkillId?: (levelId: L) => string) {
  return {
    level: levelIds[0], index: 0, total: levelIds.length, leveledUp: false,
    clearLevelUp: () => {}, onResult: (_perfect: boolean) => {},
  };
}
export type Adaptive<L extends string> = ReturnType<typeof useAdaptive<L>>;
