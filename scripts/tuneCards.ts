/**
 * げきむず の「カードの まいすう」と「出現の速さ」を いっしょに さがす（2026-11-15 CW-4b）。
 *
 *   CH=1,2 RUNS=24 LIMITS=10,12,14 npx tsx scripts/tuneCards.ts
 *
 * まいすう（LIMITS）ごとに、「ふつう」の勝率が TARGET（既定 70）になる 出現の速さ（いまの TIER_SPAWN_MULT に掛ける倍率）を
 * 二分探索し、そのときの じょうず・にがて の勝率と、正答率だけ 0.9／0.6 にした2人の差を出す。
 * えらんだ値を catwars/data/campaign.ts の TIER_CARD_LIMIT.extreme と TIER_SPAWN_MULT.extreme に入れ、
 * `npm run test:balance:all` で たしかめる。1回の実行は 章をしぼって短く。
 */
import { CAMPAIGN, tierDifficulty } from '../catwars/data/campaign';
import { playOnce, seedFor, SKILL_LEVELS, NORMAL_SKILL, Skill } from './botSim';

const RUNS = Number(process.env.RUNS ?? 24);
const ITERS = Number(process.env.ITERS ?? 5);
const TARGET = Number(process.env.TARGET ?? 70);
const LO = Number(process.env.LO ?? 0.4);
const HI = Number(process.env.HI ?? 3.0);
const ONLY = (process.env.CH ?? '').split(',').map(s => Number(s.trim())).filter(n => n > 0);
const LIMITS = (process.env.LIMITS ?? '10,12,14').split(',').map(Number);
const MAXSEC = Number(process.env.MAXSEC ?? 300);
const WEAK_TARGET: Record<number, number> = { 1: 55, 2: 55, 3: 40, 4: 40, 5: 40, 6: 40, 7: 25, 8: 25 };

const rate = (i: number, skill: Skill, limit: number, mult: number): number => {
  const d0 = tierDifficulty(CAMPAIGN[i], 'extreme');
  const difficulty = { ...d0, enemySpawnRatePerSec: d0.enemySpawnRatePerSec * mult };
  let w = 0;
  for (let r = 0; r < RUNS; r++) if (playOnce(i, seedFor(r), { skill, tier: 'extreme', difficulty, cardLimit: limit, maxSeconds: MAXSEC }).win) w++;
  return (w / RUNS) * 100;
};

for (let i = 0; i < CAMPAIGN.length; i++) {
  const no = CAMPAIGN[i].no;
  if (ONLY.length && !ONLY.includes(no)) continue;
  for (const limit of LIMITS) {
    let lo = LO, hi = HI, best = 1, bestRate = -1;
    for (let k = 0; k < ITERS; k++) {
      const mid = (lo + hi) / 2;
      const wr = rate(i, NORMAL_SKILL, limit, mid);
      if (bestRate < 0 || Math.abs(wr - TARGET) < Math.abs(bestRate - TARGET)) { best = mid; bestRate = wr; }
      if (wr >= TARGET) lo = mid; else hi = mid;
    }
    const strong = rate(i, SKILL_LEVELS[0], limit, best);
    const weak = rate(i, SKILL_LEVELS[2], limit, best);
    const a9 = rate(i, { ...NORMAL_SKILL, accuracy: 0.9 }, limit, best);
    const a6 = rate(i, { ...NORMAL_SKILL, accuracy: 0.6 }, limit, best);
    console.log(
      `第${no}章 まいすう${limit}  出現×${best.toFixed(3)}  じょうず ${strong.toFixed(0)}%・ふつう ${bestRate.toFixed(0)}%・にがて ${weak.toFixed(0)}%（目標 ${WEAK_TARGET[no]}±15）` +
      `  じょうず−にがて ${(strong - weak).toFixed(0)}  正答率0.9−0.6 ${(a9 - a6).toFixed(0)}`,
    );
  }
}
