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
import { playOnce, seedFor, WEAK_SKILL, NORMAL_SKILL } from './botSim';

const RUNS = Number(process.env.RUNS ?? 20);
const ITERS = Number(process.env.ITERS ?? 6);
/** 1試合の上限秒（おそいときは 240 などに） */
const MAX_SECONDS = Number(process.env.MAXSEC ?? 300);
/** 二分探索のはば（いまの値に掛ける倍率の下限・上限） */
const LO = Number(process.env.LO ?? 0.3);
const HI = Number(process.env.HI ?? 3.0);
/**
 * KNOB=spawn（出現の速さ）／power（敵の兵の強さ。TIER_POWER_MULT に掛ける）／auto（既定：まず出現の速さ。
 * HI まで速めても目標より易しいままなら、出現は HI のまま 兵の強さを 1〜PHI でさがす）
 */
const KNOB = (['power', 'spawn'].includes(process.env.KNOB ?? '') ? process.env.KNOB : 'auto') as 'power' | 'spawn' | 'auto';
const PHI = Number(process.env.PHI ?? 3.0);
const ONLY = (process.env.CH ?? '').split(',').map(s => Number(s.trim())).filter(n => n > 0);
const TIERS = (process.env.TIER ? [process.env.TIER as ChapterTier] : TIER_ORDER);
const BASE_TARGET: Record<number, number> = { 1: 85, 2: 85, 3: 70, 4: 70, 5: 70, 6: 70, 7: 55, 8: 55 };
/** SKILL=normal で「ふつう」の勝率を TARGET（既定 75）に合わせる（ふつうの帯を見るとき）。そのとき「にがて」の勝率も出す */
const BY_NORMAL = process.env.SKILL === 'normal';
const SKILL = BY_NORMAL ? NORMAL_SKILL : WEAK_SKILL;
const MINUS: Record<ChapterTier, number> = { normal: 0, hard: 15, extreme: 30 };

function winRate(i: number, tier: ChapterTier, mult: number, knob: 'power' | 'spawn' = KNOB === 'power' ? 'power' : 'spawn', spawnMult = 1): number {
  const d0 = tierDifficulty(CAMPAIGN[i], tier);
  const d1 = { ...d0, enemySpawnRatePerSec: d0.enemySpawnRatePerSec * spawnMult };
  const difficulty = knob === 'power'
    ? { ...d1, enemyHpMult: d1.enemyHpMult * mult, enemyDamageMult: d1.enemyDamageMult * mult }
    : { ...d1, enemySpawnRatePerSec: d1.enemySpawnRatePerSec * mult };
  let wins = 0;
  for (let r = 0; r < RUNS; r++) if (playOnce(i, seedFor(r), { skill: SKILL, tier, difficulty, maxSeconds: MAX_SECONDS }).win) wins++;
  return (wins / RUNS) * 100;
}

for (const tier of TIERS) {
  console.log(`\n段：${tier}・${KNOB === 'power' ? '兵の強さ' : '出現の速さ'}（いまの値に掛ける倍率。1.00 なら そのままでよい）`);
  const out: string[] = [];
  for (let i = 0; i < CAMPAIGN.length; i++) {
    const no = CAMPAIGN[i].no;
    if (ONLY.length > 0 && !ONLY.includes(no)) continue;
    const target = BY_NORMAL ? Number(process.env.TARGET ?? 75) : BASE_TARGET[no] - MINUS[tier];
    const now = winRate(i, tier, 1);
    console.log(`    第${no}章 いま ${now.toFixed(0)}%（目標 ${target}%）`);
    let best = 1, bestRate = now, power = 1;
    const search = (knob: 'power' | 'spawn', lo0: number, hi0: number, spawnMult = 1) => {
      // 強いほど・速いほど 勝率は下がる、とみて二分探索
      let lo = lo0, hi = hi0, b = 1, br = -1;
      for (let k = 0; k < ITERS; k++) {
        const mid = (lo + hi) / 2;
        const wr = winRate(i, tier, mid, knob, spawnMult);
        if (br < 0 || Math.abs(wr - target) < Math.abs(br - target)) { b = mid; br = wr; }
        console.log(`    第${no}章 ${knob === 'power' ? '強さ' : '出現'}×${mid.toFixed(3)} → ${wr.toFixed(0)}%`);
        if (wr >= target) lo = mid; else hi = mid;
      }
      return { b, br };
    };
    if (Math.abs(now - target) > 8) {
      if (KNOB === 'power') { const r = search('power', LO, HI); power = r.b; bestRate = r.br; }
      else {
        const r = search('spawn', LO, HI); best = r.b; bestRate = r.br;
        if (KNOB === 'auto' && bestRate > target + 8) {
          const atHi = winRate(i, tier, HI, 'spawn');
          console.log(`    第${no}章 出現×${HI}（上限）でも ${atHi.toFixed(0)}% → 兵の強さも さがす`);
          best = HI;
          const p2 = search('power', 1, PHI, HI); power = p2.b; bestRate = p2.br;
        }
      }
    }
    let weakNote = '';
    if (BY_NORMAL) {
      const d0 = tierDifficulty(CAMPAIGN[i], tier);
      const d = { ...d0, enemySpawnRatePerSec: d0.enemySpawnRatePerSec * best, enemyHpMult: d0.enemyHpMult * power, enemyDamageMult: d0.enemyDamageMult * power };
      let w = 0;
      for (let r = 0; r < RUNS; r++) if (playOnce(i, seedFor(r), { skill: WEAK_SKILL, tier, difficulty: d, maxSeconds: MAX_SECONDS }).win) w++;
      weakNote = `・そのときの にがて ${((w / RUNS) * 100).toFixed(0)}%（にがての目標 ${BASE_TARGET[no] - MINUS[tier]}±15）`;
    }
    console.log(`  第${no}章  目標${target}%  いま${now.toFixed(0)}%  →  出現×${best.toFixed(2)}・強さ×${power.toFixed(2)}（${bestRate.toFixed(0)}%）${weakNote}`);
    out.push(`${no}: 出現${best.toFixed(2)}/強さ${power.toFixed(2)}`);
  }
  console.log(`  ${tier}: { ${out.join(', ')} }`);
}
