/**
 * 体験版（SOL の体験の入口 #trial から開いたタブ）で 先生が PRISM の管理タブで閉じられる項目（CW-5c・2026-11-16）。
 * キーは kit の TRIAL_FEATURE_SETS.catwars（kit 0.37.0〜）と同じ文字列（サーバの trial_settings.features にそのまま入る。変えると設定がずれる）。
 * ここに同じキーを書いておくのは、古い kit（0.36.0）でも型が通るように（kit を上げたあとも 同じ値）。
 *   sortie     … 出撃（範囲・ステージ・メンバー・陣地づくり・戦闘）
 *   army       … ネコ部隊（育てる・スキル）・なかまを よぶ・出撃バフ
 *   collection … あつめる（図鑑・バッジ・カプセル・称号）
 * はじめは全部「使える」（キーが無い＝使える）。閉じた所は kit の TrialLock（「たいけんばんでは つかえないよ」）。
 */
export const CATWARS_TRIAL_KEYS = {
  sortie: 'sortie',
  army: 'army',
  collection: 'collection',
} as const;
export type CatwarsTrialKey = (typeof CATWARS_TRIAL_KEYS)[keyof typeof CATWARS_TRIAL_KEYS];

/** 画面（CatWars.tsx の view）→ 項目のキー。ホームなど 項目に入らない画面は null */
export function catwarsTrialKeyOf(view: string): CatwarsTrialKey | null {
  switch (view) {
    // 週がわりの遠征（CW-6a）・なかまの基地に いく（CW-6b）・同時対戦（CW-6c）も 出撃と同じ あつかい
    case 'range': case 'stage': case 'expedition': case 'friend': case 'versus': case 'formation': case 'prep': case 'battle': return 'sortie';
    case 'army': case 'buffs': case 'mercs': return 'army';
    case 'collection': return 'collection';
    default: return null;
  }
}

/** 閉じたときに出す 項目の名前 */
export const CATWARS_TRIAL_LABEL: Record<CatwarsTrialKey, string> = {
  sortie: '出撃',
  army: 'ネコ部隊',
  collection: 'あつめる',
};
