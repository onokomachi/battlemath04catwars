/**
 * シールコイン（カプセルを回すもの。2026-11-16 CW-4c）。docs/REBUILD_SPEC.md §3d。
 *
 * **学習の成果だけで手に入る**：
 *   ・その日 はじめて まちがえずに とけた（FIRST_OF_DAY）
 *   ・まちがえずに といた問題 PER_PERFECT 問ごとに 1まい（1日 DAILY_PERFECT_CAP まいまで。長く遊んでも ふえすぎない）
 *   ・バッジ（銅・銀・金。BADGE_COINS）
 *   ・章の星（あたらしく ふえた 星1つにつき STAR_COIN）
 * 💠・⚡・戦闘の速さ・勝った数・放置では ふえない。お金（課金）は無い。
 * 数は scripts/progressionSim.ts（エンジョイ勢・トップ層）で決めた。
 */

export const COIN_RULES = {
  /** その日 はじめて まちがえずに とけたとき */
  firstOfDay: 6,
  /** この数 まちがえずに とくごとに 1まい */
  perPerfect: 4,
  /** 問題から もらえるのは 1日にこの まいすうまで（はじめての ぶんは べつ） */
  dailyPerfectCap: 5,
  /** あたらしく ふえた 章の星 1つにつき */
  star: 1,
} as const;

/** バッジの段ごとの シールコイン（1=銅・2=銀・3=金。段の1つしかないバッジは 銀と同じ） */
export const BADGE_COINS: Record<1 | 2 | 3, number> = { 1: 1, 2: 2, 3: 4 };

/**
 * 1問 まちがえずに といたときの シールコイン（純粋な関数）。
 * @param dayPerfectBefore その日 これまでに まちがえずに といた数（この1問の前）
 */
export function coinsForPerfect(dayPerfectBefore: number): number {
  const after = dayPerfectBefore + 1;
  let c = dayPerfectBefore === 0 ? COIN_RULES.firstOfDay : 0;
  if (after % COIN_RULES.perPerfect === 0 && after / COIN_RULES.perPerfect <= COIN_RULES.dailyPerfectCap) c += 1;
  return c;
}

/** 1日に問題から もらえる いちばん多い数（はじめての ぶん＋上限） */
export const DAILY_COIN_MAX = COIN_RULES.firstOfDay + COIN_RULES.dailyPerfectCap;
