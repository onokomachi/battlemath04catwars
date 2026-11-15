/**
 * CAT-WARS バランス計測
 *
 *   npm run test:balance          … 章ごとの想定装備で到達したプレイヤー（既定）
 *   BARE=1 npm run test:balance   … 何も育てていない最悪ケース
 *   RUNS=10 MAXSEC=240 npm run test:balance
 *
 * 決定論シミュレーションの上で小4を模したAIプレイヤーを走らせ、
 * 章ごとの勝率・所要時間・敵の出現数を実測する。
 * これがあると、バランス調整を勘ではなく数字で回せる。
 *
 * 目標値（catwars/data/campaign.ts 冒頭の設計仕様）:
 *   章1〜2: 勝率 約85% / 章3〜6: 約70% / 章7〜8: 約55%
 *
 * 3段階の上手さ（正答率）で挟んで測り、**「にがて」が目標に届いているか**を見る。
 *
 * **合格条件（どちらかが欠けたら exit 1）**:
 *   1. 「とかない」（問題を1問も解かない子）が、どの章でも勝てない
 *   2. 「ふつう」が勝つまでに解く問題が、1戦 MAX_PROBLEMS_OK 問まで（多すぎると だれる）
 * 戦闘のエナジーは自動ではたまらず、問題を解いて手に入れる（catwars/data/campaign.ts の PLAYER_START_ENERGY・QUIZ_BASE_REWARD）。
 * ボットと「章ごとの想定装備」の定義は scripts/botSim.ts にある。
 */
import { CAMPAIGN } from '../catwars/data/campaign';
import { playOnce, seedFor, BARE_LOADOUT, SKILL_LEVELS, NO_SOLVE_SKILL, PlayResult } from './botSim';

const RUNS = Number(process.env.RUNS ?? 40);
const MAX_SECONDS = Number(process.env.MAXSEC ?? 300);
const USE_BARE = process.env.BARE === '1';
/** 「ふつう」が勝った試合で解いた問題の平均が、これを超えたら不合格 */
const MAX_PROBLEMS_OK = Number(process.env.MAXPROB ?? 18);

const TARGET: Record<number, number> = { 1: 85, 2: 85, 3: 70, 4: 70, 5: 70, 6: 70, 7: 55, 8: 55 };

console.log(
  '\nCAT-WARS バランス計測（' +
  (USE_BARE ? '進化なし・バフなし・拠点なしの素の条件' : '章ごとの想定装備で到達したプレイヤー') +
  ', 各章 各上手さ ' + RUNS + '回）\n'
);
console.log('章  目標   じょうず  ふつう  にがて  とかない  判定  解いた問題(ふつう・勝ち)  正解  平均決着  敵の出現数');
console.log('─'.repeat(100));

// CH=5 のように章を絞れる（1章だけ詰めたいときに使う）
const ONLY = (process.env.CH ?? '').split(',').map(s => Number(s.trim())).filter(n => n > 0);
let failed = 0;

for (let i = 0; i < CAMPAIGN.length; i++) {
  const ch = CAMPAIGN[i];
  if (ONLY.length > 0 && !ONLY.includes(ch.no)) continue;
  const run = (skill: typeof NO_SOLVE_SKILL): PlayResult[] =>
    Array.from({ length: RUNS }, (_, r) => playOnce(i, seedFor(r), {
      skill, loadout: USE_BARE ? BARE_LOADOUT : undefined, maxSeconds: MAX_SECONDS,
    }));
  const all = SKILL_LEVELS.map(run);
  const none = run(NO_SOLVE_SKILL);
  const rate = (rs: PlayResult[]) => (rs.filter(r => r.win).length / RUNS) * 100;
  const rates = all.map(rate);
  const noneRate = rate(none);

  const normalWins = all[1].filter(r => r.win);
  const avg = (rs: PlayResult[], f: (r: PlayResult) => number) => rs.length ? rs.reduce((a, b) => a + f(b), 0) / rs.length : 0;
  const probs = avg(normalWins, r => r.problems);
  const corrects = avg(normalWins, r => r.corrects);
  const avgSec = avg(all[2], r => r.seconds);
  const avgSpawn = avg(all[2], r => r.enemySpawned);

  const target = TARGET[ch.no];
  const diff = rates[2] - target;
  const balance = Math.abs(diff) <= 15 ? '✅' : diff > 0 ? '⬆️易' : '⬇️難';
  const noSolveOk = noneRate === 0;
  const probsOk = normalWins.length === 0 || probs <= MAX_PROBLEMS_OK;
  if (!noSolveOk || !probsOk) failed++;

  console.log(
    `${String(ch.no).padStart(2)}  ${String(target).padStart(3)}%  ` +
    rates.map(r => `${r.toFixed(0).padStart(6)}%`).join(' ') +
    `  ${noneRate.toFixed(0).padStart(5)}%${noSolveOk ? '✓' : '✗'}  ${balance}   ` +
    `${probs.toFixed(1).padStart(8)}問${probsOk ? '✓' : '✗'}        ${corrects.toFixed(1).padStart(5)}  ${avgSec.toFixed(0).padStart(5)}秒  ${avgSpawn.toFixed(1).padStart(7)}体`
  );
}
console.log('\n（判定：「にがて」の勝率が目標±15ポイント以内なら ✅。とかない＝問題を解かない子は 0% でなければ ✗）');
if (failed) { console.log(`\n✗ ${failed} 章で不合格（解かずに勝てる、または 解く問題が多すぎる）\n`); process.exit(1); }
console.log('\n✓ 解かない子はどの章でも勝てず、解く問題の数も目安の中\n');
