/**
 * CAT-WARS バランス計測
 *
 *   npm run test:balance          … 章ごとの想定装備で到達したプレイヤー（既定）
 *   BARE=1 npm run test:balance   … 何も育てていない最悪ケース
 *   RUNS=10 MAXSEC=240 npm run test:balance
 *   TIER=hard / TIER=extreme npm run test:balance  … むずかしい・げきむず（目標は ふつう −15／−30）
 *   THREAT=1 npm run test:balance  … 脅威レベルの試験（育てた手持ちでも 勝率が大きく変わらないこと）
 *   BAND=1 …「にがて」の勝率が目標の帯の外なら不合格にする（npm run test:balance:all は これで流す）
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
import { CAMPAIGN, ChapterTier, TIER_INFO, chapterBaseLevel, threatLevel, threatMultFor } from '../catwars/data/campaign';
import {
  playOnce, seedFor, BARE_LOADOUT, SKILL_LEVELS, NO_SOLVE_SKILL, NORMAL_SKILL, WEAK_SKILL, PlayResult, loadoutForChapter,
} from './botSim';

const RUNS = Number(process.env.RUNS ?? 40);
const MAX_SECONDS = Number(process.env.MAXSEC ?? 300);
const USE_BARE = process.env.BARE === '1';
/** 「ふつう」が勝った試合で解いた問題の平均が、これを超えたら不合格 */
const MAX_PROBLEMS_OK = Number(process.env.MAXPROB ?? 18);
/** 「ふつう」が勝つまでに解く問題の上限（段ごと）。げきむず だけは 24問まで許す（docs/REBUILD_SPEC.md §2） */
const MAX_PROBLEMS_BY_TIER: Record<ChapterTier, number> = { normal: MAX_PROBLEMS_OK, hard: MAX_PROBLEMS_OK, extreme: Number(process.env.MAXPROB ?? 24) };

/** TIER=hard / TIER=extreme で、むずかしい・げきむず を測る（目標は ふつう −15／−30） */
const TIER = (['normal', 'hard', 'extreme'].includes(process.env.TIER ?? '') ? process.env.TIER : 'normal') as ChapterTier;
const TIER_MINUS: Record<ChapterTier, number> = { normal: 0, hard: 15, extreme: 30 };
const BASE_TARGET: Record<number, number> = { 1: 85, 2: 85, 3: 70, 4: 70, 5: 70, 6: 70, 7: 55, 8: 55 };
const TARGET: Record<number, number> = Object.fromEntries(Object.entries(BASE_TARGET).map(([k, v]) => [k, v - TIER_MINUS[TIER]]));
/**
 * 「ふつう」の勝率の帯（トップ層が むずかしい・げきむず で手ごたえを感じること。2026-11-15 CW-4a）。
 * ふつう の段は 決めない（にがての帯で決まる）。
 */
const NORMAL_BAND: Record<ChapterTier, [number, number] | null> = { normal: null, hard: [70, 98], extreme: [50, 85] };
// CH=5 のように章を絞れる（1章だけ詰めたいときに使う）
const ONLY = (process.env.CH ?? '').split(',').map(s => Number(s.trim())).filter(n => n > 0);

/**
 * THREAT=1：脅威レベルの試験（ふつうの段）。
 * 章の めやすの手持ち（plusLevel 0）と、そこから 20 レベル育てた手持ち（脅威レベルあり）で、
 * **「にがて」の勝率の差（+20 − +0）が −5〜+20 ポイント**なら合格（育てて弱くなってはいけない・楽勝にもならない）。
 * 手持ちは両方とも loadoutForLevel で作る。脅威レベルなし（noThreat）は参考に出す（無いと どれだけ楽になるか）。
 */
if (process.env.THREAT === '1') {
  const PLUS = Number(process.env.PLUS ?? 20);
  const LO = -5, HI = 20;
  console.log(`\nCAT-WARS 脅威レベルの試験（ふつうの段・各 ${RUNS}回。手持ち＝めやす と めやす+${PLUS}）\n`);
  console.log('章  脅威  倍率   にがて:+0  +' + PLUS + '(脅威)  +' + PLUS + '(なし)  差  判定 │ ふつう:+0  +' + PLUS + '(脅威)  +' + PLUS + '(なし) │ 解いた問題(ふつう・勝ち) +0 / +' + PLUS + '(脅威) / +' + PLUS + '(なし)');
  console.log('─'.repeat(130));
  let bad = 0;
  for (let i = 0; i < CAMPAIGN.length; i++) {
    const ch = CAMPAIGN[i];
    if (ONLY.length > 0 && !ONLY.includes(ch.no)) continue;
    const base = chapterBaseLevel(ch, 'normal');
    const play = (skill: typeof NORMAL_SKILL, plus: number, noThreat = false) =>
      Array.from({ length: RUNS }, (_, r) => playOnce(i, seedFor(r), {
        skill, maxSeconds: MAX_SECONDS, plusLevel: plus, noThreat, loadout: loadoutForChapter(i, 'normal', plus),
      }));
    const rate = (rs: PlayResult[]) => (rs.filter(r => r.win).length / RUNS) * 100;
    const probs = (rs: PlayResult[]) => { const w = rs.filter(r => r.win); return w.length ? w.reduce((a, b) => a + b.problems, 0) / w.length : 0; };
    const n0 = play(NORMAL_SKILL, 0), nT = play(NORMAL_SKILL, PLUS), nN = play(NORMAL_SKILL, PLUS, true);
    const w0 = play(WEAK_SKILL, 0), wT = play(WEAK_SKILL, PLUS), wN = play(WEAK_SKILL, PLUS, true);
    const diff = rate(wT) - rate(w0);
    const ok = diff >= LO && diff <= HI;
    if (!ok) bad++;
    const th = threatLevel(base + PLUS, base);
    const pct = (v: number) => `${v.toFixed(0).padStart(4)}%`;
    console.log(
      `${String(ch.no).padStart(2)}  ${String(th).padStart(3)}  ×${threatMultFor(base + PLUS, base).toFixed(2)}   ` +
      `${pct(rate(w0))}    ${pct(rate(wT))}     ${pct(rate(wN))}  ${(diff >= 0 ? '+' : '') + diff.toFixed(0)}  ${ok ? '✅' : '❌'}  │ ` +
      `${pct(rate(n0))}    ${pct(rate(nT))}     ${pct(rate(nN))}  │ ` +
      `${probs(n0).toFixed(1)} / ${probs(nT).toFixed(1)} / ${probs(nN).toFixed(1)}問`,
    );
  }
  console.log(`\n（差＝にがての勝率の「+${PLUS}(脅威)」−「+0」。${LO}〜+${HI}ポイントなら ✅。「なし」は脅威レベルを はたらかせないとき＝育てすぎると楽になる分）`);
  if (bad) { console.log(`\n✗ ${bad} 章で、育てた手持ちとの差が 帯の外（THREAT_GROWTH を 0.6〜0.9 の間で見なおす）\n`); process.exit(1); }
  console.log('\n✓ 育てても 弱くならず、楽勝にもならない（脅威レベルが はたらいている）\n');
  process.exit(0);
}

console.log(
  '\nCAT-WARS バランス計測（' +
  (USE_BARE ? '進化なし・バフなし・拠点なしの素の条件' : '章ごとの想定装備で到達したプレイヤー') +
  ', 各章 各上手さ ' + RUNS + '回・段：' + TIER_INFO[TIER].label + '）\n'
);
console.log('章  目標   じょうず  ふつう  にがて  とかない  判定  ふつうの帯  解いた問題(ふつう・勝ち)  正解  平均決着  敵の出現数');
console.log('─'.repeat(100));

let failed = 0;
let offBand = 0;
let offNormal = 0;

for (let i = 0; i < CAMPAIGN.length; i++) {
  const ch = CAMPAIGN[i];
  if (ONLY.length > 0 && !ONLY.includes(ch.no)) continue;
  const run = (skill: typeof NO_SOLVE_SKILL): PlayResult[] =>
    Array.from({ length: RUNS }, (_, r) => playOnce(i, seedFor(r), {
      skill, loadout: USE_BARE ? BARE_LOADOUT : undefined, maxSeconds: MAX_SECONDS, tier: TIER,
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
  const probsOk = normalWins.length === 0 || probs <= MAX_PROBLEMS_BY_TIER[TIER];
  const bandOk = Math.abs(diff) <= 15;
  const nb = NORMAL_BAND[TIER];
  const normalOk = !nb || (rates[1] >= nb[0] && rates[1] <= nb[1]);
  if (!noSolveOk || !probsOk) failed++;
  if (!bandOk) offBand++;
  if (!normalOk) offNormal++;

  console.log(
    `${String(ch.no).padStart(2)}  ${String(target).padStart(3)}%  ` +
    rates.map(r => `${r.toFixed(0).padStart(6)}%`).join(' ') +
    `  ${noneRate.toFixed(0).padStart(5)}%${noSolveOk ? '✓' : '✗'}  ${balance}   ${nb ? (normalOk ? ' ✓      ' : (rates[1] > nb[1] ? ' ✗易    ' : ' ✗難    ')) : ' −      '}  ` +
    `${probs.toFixed(1).padStart(8)}問${probsOk ? '✓' : '✗'}        ${corrects.toFixed(1).padStart(5)}  ${avgSec.toFixed(0).padStart(5)}秒  ${avgSpawn.toFixed(1).padStart(7)}体`
  );
}
console.log('\n（判定：「にがて」の勝率が目標±15ポイント以内なら ✅。とかない＝問題を解かない子は 0% でなければ ✗）');
if (NORMAL_BAND[TIER]) console.log(`（ふつうの帯：「ふつう」の勝率が ${NORMAL_BAND[TIER]![0]}〜${NORMAL_BAND[TIER]![1]}% なら ✓。トップ層が手ごたえを感じること）`);
if (failed) { console.log(`\n✗ ${failed} 章で不合格（解かずに勝てる、または 解く問題が多すぎる）\n`); process.exit(1); }
// 目標の帯は BAND=1 のときだけ不合格にする（試合数が少ないと ゆれるため。test:balance:all は BAND=1 で流す）
if ((offBand || offNormal) && process.env.BAND === '1') {
  console.log(`\n✗ ${offBand} 章で「にがて」の勝率が 目標の帯（±15ポイント）の外・${offNormal} 章で「ふつう」の勝率が 帯の外\n`);
  process.exit(1);
}
console.log(`\n✓ 解かない子はどの章でも勝てず、解く問題の数も目安の中${offBand ? `（帯の外 ${offBand} 章）` : '・にがての勝率も 目標の帯の中'}\n`);
