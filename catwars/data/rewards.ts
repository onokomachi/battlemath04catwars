// ── 報酬の数（2026-11-15 CW-4a。scripts/progressionSim.ts で決めた）─────────────────
// 画面（bridge.ts・useArmyStore）と 進み方の計算（progressionSim）が同じ数を使うよう、ここに1つだけ置く。

/** むずかしさ3の問題を まちがえずに解いたときの 💠 */
export const CREDIT_PER_CORRECT = 12;
/** むずかしさ3の問題を まちがえずに解いたときの ⚡（その日の出撃バフに使う） */
export const ENERGY_PER_CORRECT = 2;
/** むずかしさ3の問題を まちがえずに解いたとき、出撃の5枠の系統それぞれに入るXP */
export const STUDY_XP_PER_CORRECT = 12;
/** 戦闘のあと、出撃させた系統それぞれに入るXP（勝ち／負け。負けても育つ） */
export const BATTLE_XP_WIN = 150;
export const BATTLE_XP_LOSS = 50;

/** 💠 のはじめの額（施設を1つ買えるくらい） */
export const START_CREDITS = 500;
/** 💠 の上限（事実上なし。前は 8000 で、施設を持ちつづける形では すぐ止まってしまう） */
export const MAX_CREDITS = 9_999_999;
