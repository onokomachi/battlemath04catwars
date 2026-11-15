/**
 * 難易度の段ごとに、「敵の出る速さ」の倍率を 目標の勝率に合うよう 二分探索で決める。
 *
 *   npx tsx scripts/tuneTiers.ts                 … 3段ぜんぶ
 *   TIER=hard CH=3,4 RUNS=24 npx tsx scripts/tuneTiers.ts
 *
 * 出てきた値を catwars/data/campaign.ts に入れる（ふつう＝各章の enemySpawnRatePerSec に掛ける。
 * むずかしい・げきむず＝TIER_SPAWN_MULT）。入れたら `npm run test:balance`（TIER=hard / extreme も）。
 * 「にがて」の勝率が目標（ふつう：85/70/55、むずかしい：−15、げきむず：−30）になる値をさがす。
 */
import { CAMPAIGN, ChapterTier, TIER_ORDER, tierDifficulty } from '../catwars/data/campaign';
import { playOnce, seedFor, WEAK_SKILL } from './botSim';

const RUNS = Number(process.env.RUNS ?? 20);
const ITERS = Number(process.env.ITERS ?? 6);
const ONLY = (process.env.CH ?? '').split(',').map(s => Number(s.trim())).filter(n => n > 0);
const TIERS = (process.env.TIER ? [process.env.TIER as ChapterTier] : TIER_ORDER);
const BASE_TARGET: Record<number, number> = { 1: 85, 2: 85, 3: 70, 4: 70, 5: 70, 6: 70, 7: 55, 8: 55 };
const MINUS: Record<ChapterTier, number> = { normal: 0, hard: 15, extreme: 30 };

function winRate(i: number, tier: ChapterTier, mult: number): number {
  const d0 = tierDifficulty(CAMPAIGN[i], tier);
  const difficulty = { ...d0, enemySpawnRatePerSec: d0.enemySpawnRatePerSec * mult };
  let wins = 0;
  for (let r = 0; r < RUNS; r++) if (playOnce(i, seedFor(r), { skill: WEAK_SKILL, tier, difficulty }).win) wins++;
  return (wins / RUNS) * 100;
}

for (const tier of TIERS) {
  console.log(`\n段：${tier}（いまの値に掛ける倍率。1.00 なら そのままでよい）`);
  const out: string[] = [];
  for (let i = 0; i < CAMPAIGN.length; i++) {
    const no = CAMPAIGN[i].no;
    if (ONLY.length > 0 && !ONLY.includes(no)) continue;
    const target = BASE_TARGET[no] - MINUS[tier];
    const now = winRate(i, tier, 1);
    let best = 1, bestRate = now;
    if (Math.abs(now - target) > 8) {
      // 速いほど敵が増える＝勝率は下がる、とみて二分探索
      let lo = 0.3, hi = 3.0;
      bestRate = -1;
      for (let k = 0; k < ITERS; k++) {
        const mid = (lo + hi) / 2;
        const wr = winRate(i, tier, mid);
        if (bestRate < 0 || Math.abs(wr - target) < Math.abs(bestRate - target)) { best = mid; bestRate = wr; }
        if (wr >= target) lo = mid; else hi = mid;
      }
    }
    console.log(`  第${no}章  目標${target}%  いま${now.toFixed(0)}%  →  ×${best.toFixed(2)}（${bestRate.toFixed(0)}%）`);
    out.push(`${no}: ${best.toFixed(2)}`);
  }
  console.log(`  ${tier}: { ${out.join(', ')} }`);
}
