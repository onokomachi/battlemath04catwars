/**
 * CAT-WARS 進み方の計算（2026-11-15 CW-4a）
 *
 *   npm run test:progress
 *   VERBOSE=1 npm run test:progress   … 1日ごとの表
 *
 * 戦闘は回さない。balanceTest の勝率（下の WIN_RATE）と、報酬の式（data/rewards.ts・campaign.ts の rewardCredits・
 * data/facilities.ts の値段）だけで、「1日に何戦・何問」の子が 日ごとに 💠・XP・かけら・施設のレベルを どこまで進めるかを出す。
 *
 * **合格条件（どちらかが欠けたら exit 1）**
 *   1. エンジョイ勢（1日20分＝2〜3戦・1戦10問・正答率0.7）が 4週間で 第8章（ふつう）に届く手持ち
 *      （上位5系統の平均レベルが 第8章の基準 CHAPTER_BASE_LEVEL[8] 以上）。施設は全種類 Lv4 以上（めやす Lv4〜5）。
 *   2. トップ層（1日90分＝10〜12戦・1戦10問・正答率0.9）が 8週間たっても、
 *      全系統 Lv60 にも、全施設 Lv10（持てる数も全部）にも **届いていない**（どちらにも目標が残る）。
 *
 * 決めごと（かんたんな計算のための仮定。数値は報告に書く）：
 *   - 問題は、エンジョイ勢＝出撃の5枠に結びついた単元（図鑑の「つぎの上限：『単元名』を とこう」に合わせる）、
 *     トップ層＝全単元 の項目から同じ割合で出る（かけらは 3回 まちがえずに解けた項目の割合 × 8）
 *   - 勝つと 出撃させた5系統に BATTLE_XP_WIN、負けると BATTLE_XP_LOSS。問題1問（まちがえず）で5系統に STUDY_XP_PER_CORRECT
 *   - エンジョイ勢は いつも同じ5枠。トップ層は 8系統を順にまわす（全系統を育てようとする）
 *   - 💠 は、毎日おわりに いちばん安い「買う／レベルを上げる」から使う（コア→砲台→… の順の好みは つけない）
 *   - 章は ふつう 1〜8 → むずかしい 1〜8 → げきむず 1〜8 の順に進む。手持ちが めやすより 6 以上 低いときは、前の章をくりかえす
 */
import { APP_ROUNDS } from '../apps/registry';
import { buildPackRounds, FAMILY_UNITS, PACK_UNITS } from '../catwars/learn/gradePack';
import {
  CAMPAIGN, CHAPTER_BASE_LEVEL, TIER_INFO, TIER_ORDER, chapterBaseLevel, type ChapterTier,
} from '../catwars/data/campaign';
import { CHARACTERS, MAX_LEVEL, levelCapForShards, xpToNext } from '../catwars/data/characters';
import {
  BATTLE_XP_LOSS, BATTLE_XP_WIN, CREDIT_PER_CORRECT, STUDY_XP_PER_CORRECT, START_CREDITS,
} from '../catwars/data/rewards';
import {
  FACILITY_MAX_COUNT, MAX_FACILITY_LEVEL, buyCost, upgradeCost, powerPlantBonus,
} from '../catwars/data/facilities';
import { BuildingType } from '../catwars/types';
import { DetRNG } from '../catwars/sim/rng';

const VERBOSE = process.env.VERBOSE === '1';

interface Profile {
  label: string;
  days: number;
  battlesPerDay: [number, number];
  problemsPerBattle: number;
  accuracy: number;
  /** めやすのレベルで戦ったときの勝率（balanceTest の「ふつう」と「にがて」の間からとる） */
  winRate: number;
  rotateAll: boolean;
  /** 問題の出どころ：formation＝出撃の5枠に結びついた単元（図鑑の「つぎの上限：『単元名』を とこう」に合わせて えらぶ）／all＝全単元 */
  range: 'formation' | 'all';
}

const ENJOY: Profile = { label: 'エンジョイ勢（1日20分）', days: 28, battlesPerDay: [2, 3], problemsPerBattle: 10, accuracy: 0.7, winRate: 0.75, rotateAll: false, range: 'formation' };
const TOP: Profile = { label: 'トップ層（1日90分）', days: 56, battlesPerDay: [10, 12], problemsPerBattle: 10, accuracy: 0.9, winRate: 0.9, rotateAll: true, range: 'all' };

const FAMILIES = CHARACTERS.filter(c => !c.id.startsWith('boss')).map(c => c.id);
const FIXED_FORMATION = ['barbarian', 'archer', 'giant', 'bomber', 'magic'];
const TYPES = Object.values(BuildingType) as BuildingType[];

const rounds = buildPackRounds(APP_ROUNDS as never);
const ALL_SKILLS = rounds.map(r => `${r.unitKey}/${r.skillId}`);
const SKILLS_BY_UNIT: Record<string, string[]> = {};
for (const r of rounds) (SKILLS_BY_UNIT[r.unitKey] ??= []).push(`${r.unitKey}/${r.skillId}`);

const formationSkillCache = new Map<string, string[]>();
function skillsForFormation(form: string[]): string[] {
  const key = form.join(',');
  let v = formationSkillCache.get(key);
  if (!v) {
    const units = new Set(form.flatMap(f => FAMILY_UNITS[f] ?? PACK_UNITS.map(u => u.key)));
    v = [...units].flatMap(u => SKILLS_BY_UNIT[u] ?? []);
    formationSkillCache.set(key, v);
  }
  return v;
}

function unitShards(unitKey: string, perfect: Map<string, number>): number {
  const sk = SKILLS_BY_UNIT[unitKey] ?? [];
  if (!sk.length) return 0;
  const done = sk.filter(k => (perfect.get(k) ?? 0) >= 3).length;
  return Math.floor((done / sk.length) * 8);
}
function familyCap(fam: string, perfect: Map<string, number>): number {
  const units = FAMILY_UNITS[fam] ?? PACK_UNITS.map(u => u.key);
  const s = Math.floor(units.reduce((a, k) => a + unitShards(k, perfect), 0) / units.length);
  return levelCapForShards(s);
}

interface Result {
  avgTop5: number;
  levels: Record<string, number>;
  facLevels: Record<string, number>;
  owned: Record<string, number>;
  creditsEarned: number;
  creditsLeft: number;
  frontier: string;
  caps: Record<string, number>;
  /** 日ごとの記録（週の終わり） */
  weekly: string[];
}

function run(p: Profile): Result {
  const rng = new DetRNG(20261115);
  const perfect = new Map<string, number>();
  const lv: Record<string, number> = Object.fromEntries(FAMILIES.map(f => [f, 1]));
  const xp: Record<string, number> = Object.fromEntries(FAMILIES.map(f => [f, 0]));
  const facLv: Record<string, number> = Object.fromEntries(TYPES.map(t => [t, 1]));
  const owned: Record<string, number> = Object.fromEntries(TYPES.map(t => [t, t === BuildingType.TOWN_HALL ? 1 : 0]));
  let credits = START_CREDITS;
  let earned = 0;
  // 進み具合：段ごとに クリアした章の数
  const cleared: Record<ChapterTier, number> = { normal: 0, hard: 0, extreme: 0 };
  let rot = 0;
  const weekly: string[] = [];

  const top5 = () => FAMILIES.map(f => lv[f]).sort((a, b) => b - a).slice(0, 5).reduce((a, b) => a + b, 0) / 5;
  const giveXp = (fam: string, amount: number) => {
    const cap = Math.min(MAX_LEVEL, familyCap(fam, perfect));
    if (lv[fam] >= cap) { xp[fam] = 0; return; }
    xp[fam] += amount;
    while (lv[fam] < cap && xp[fam] >= xpToNext(lv[fam])) { xp[fam] -= xpToNext(lv[fam]); lv[fam]++; }
    if (lv[fam] >= cap) xp[fam] = 0;
  };
  const frontier = (): { tier: ChapterTier; no: number } | null => {
    for (const t of TIER_ORDER) if (cleared[t] < CAMPAIGN.length) return { tier: t, no: cleared[t] + 1 };
    return null;
  };

  for (let day = 1; day <= p.days; day++) {
    const [lo, hi] = p.battlesPerDay;
    const battles = lo + rng.int(hi - lo + 1);
    for (let b = 0; b < battles; b++) {
      const form = p.rotateAll
        ? Array.from({ length: 5 }, (_, i) => FAMILIES[(rot + i) % FAMILIES.length])
        : FIXED_FORMATION;
      rot = (rot + 1) % FAMILIES.length;
      // 問題
      let ok = 0;
      for (let q = 0; q < p.problemsPerBattle; q++) {
        if (rng.next() >= p.accuracy) continue;
        ok++;
        const pool = p.range === 'all' ? ALL_SKILLS : skillsForFormation(form);
        const k = pool[rng.int(pool.length)];
        perfect.set(k, (perfect.get(k) ?? 0) + 1);
        credits += CREDIT_PER_CORRECT; earned += CREDIT_PER_CORRECT;
        for (const f of form) giveXp(f, STUDY_XP_PER_CORRECT);
      }
      // どの章で戦うか：最前線が めやす−6 より低ければ、1つ前（クリアずみ）をくりかえす
      const avg = form.reduce((a, f) => a + lv[f], 0) / form.length;
      let fr = frontier();
      let replay = false;
      if (fr) {
        const base = chapterBaseLevel(CAMPAIGN[fr.no - 1], fr.tier);
        if (avg < base - 6 && (fr.no > 1 || fr.tier !== 'normal')) {
          replay = true;
          fr = fr.no > 1 ? { tier: fr.tier, no: fr.no - 1 } : { tier: TIER_ORDER[TIER_ORDER.indexOf(fr.tier) - 1], no: CAMPAIGN.length };
        }
      } else {
        fr = { tier: 'extreme', no: CAMPAIGN.length };
        replay = true;
      }
      const ch = CAMPAIGN[fr.no - 1];
      const base = chapterBaseLevel(ch, fr.tier);
      // 勝率：めやす以上なら p.winRate（脅威レベルで 楽にはならない）。めやすより低いと 1レベルにつき 4% さがる
      const gap = avg - base;
      const wr = Math.max(0.05, p.winRate * (gap >= 0 ? 1 : Math.max(0.1, 1 + 0.04 * gap)));
      const win = rng.next() < wr;
      for (const f of form) giveXp(f, win ? BATTLE_XP_WIN : BATTLE_XP_LOSS);
      if (win) {
        const bonus = powerPlantBonus(owned[BuildingType.GOLD_MINE], facLv[BuildingType.GOLD_MINE]);
        const c = Math.round(ch.rewardCredits * TIER_INFO[fr.tier].rewardMult * (1 + bonus));
        credits += c; earned += c;
        if (!replay) cleared[fr.tier] = Math.max(cleared[fr.tier], fr.no);
      }
    }
    // 💠 を使う：いちばん安い「買う／上げる」から
    for (;;) {
      let best: { cost: number; act: () => void } | null = null;
      for (const t of TYPES) {
        if (t !== BuildingType.TOWN_HALL && owned[t] < FACILITY_MAX_COUNT[t]) {
          const c = buyCost(t, owned[t] + 1);
          if (!best || c < best.cost) best = { cost: c, act: () => { owned[t]++; } };
        }
        if (owned[t] > 0 && facLv[t] < MAX_FACILITY_LEVEL) {
          const c = upgradeCost(t, facLv[t]);
          if (!best || c < best.cost) best = { cost: c, act: () => { facLv[t]++; } };
        }
      }
      if (!best || best.cost > credits) break;
      credits -= best.cost;
      best.act();
    }
    if (VERBOSE || day % 7 === 0) {
      const fr = frontier();
      weekly.push(
        `${String(day).padStart(3)}日  上位5平均 Lv${top5().toFixed(1).padStart(5)}  ` +
        `系統 ${FAMILIES.map(f => lv[f]).join('/')}  上限 ${FAMILIES.map(f => familyCap(f, perfect)).join('/')}  ` +
        `施設Lv ${TYPES.map(t => facLv[t]).join('/')}  数 ${TYPES.map(t => owned[t]).join('/')}  ` +
        `💠 累計${earned}・のこり${credits}  つぎ ${fr ? `${TIER_INFO[fr.tier].label}${fr.no}章` : 'ぜんぶクリア'}`,
      );
    }
  }
  const fr = frontier();
  return {
    avgTop5: top5(), levels: lv, facLevels: facLv, owned, creditsEarned: earned, creditsLeft: credits,
    frontier: fr ? `${TIER_INFO[fr.tier].label} 第${fr.no}章` : 'ぜんぶクリア',
    caps: Object.fromEntries(FAMILIES.map(f => [f, familyCap(f, perfect)])),
    weekly,
  };
}

console.log('\nCAT-WARS 進み方の計算（戦闘は回さない・報酬の式と 想定の勝率から）');
console.log(`施設の並び: ${TYPES.join('/')}（コア/発電所/兵舎/キャンプ/壁/砲台/電撃トラップ）`);
console.log(`系統の並び: ${FAMILIES.join('/')}\n`);

let bad = 0;
const e = run(ENJOY);
console.log(`■ ${ENJOY.label}：${ENJOY.days}日・1日${ENJOY.battlesPerDay.join('〜')}戦・1戦${ENJOY.problemsPerBattle}問・正答率${ENJOY.accuracy}`);
for (const w of e.weekly) console.log('  ' + w);
const need8 = CHAPTER_BASE_LEVEL[8];
const minFac = Math.min(...TYPES.map(t => e.facLevels[t]));
const ok1 = e.avgTop5 >= need8;
const ok2 = minFac >= 4;
console.log(`  → 上位5系統の平均 Lv${e.avgTop5.toFixed(1)}（第8章のめやす Lv${need8}）${ok1 ? '✅' : '❌'}  施設の いちばん低いレベル Lv${minFac}（めやす 4〜5）${ok2 ? '✅' : '❌'}  最前線：${e.frontier}`);
if (!ok1 || !ok2) bad++;

const t = run(TOP);
console.log(`\n■ ${TOP.label}：${TOP.days}日・1日${TOP.battlesPerDay.join('〜')}戦・1戦${TOP.problemsPerBattle}問・正答率${TOP.accuracy}`);
for (const w of t.weekly) console.log('  ' + w);
const allLv = FAMILIES.every(f => t.levels[f] >= MAX_LEVEL);
const allFac = TYPES.every(ty => t.facLevels[ty] >= MAX_FACILITY_LEVEL && t.owned[ty] >= FACILITY_MAX_COUNT[ty]);
const lvLeft = FAMILIES.filter(f => t.levels[f] < MAX_LEVEL).length;
const facLeft = TYPES.filter(ty => t.facLevels[ty] < MAX_FACILITY_LEVEL).length;
// 系統のレベル・施設の それぞれに、まだ目標が残っていること（片方だけ残っている、は不合格）
const ok3 = !allLv && !allFac;
console.log(`  → Lv60 に届いていない系統 ${lvLeft}/${FAMILIES.length}・Lv10 に届いていない施設 ${facLeft}/${TYPES.length}  ${ok3 ? '✅（どちらにも まだ目標が残っている）' : '❌（どちらかが 全部届いた）'}  最前線：${t.frontier}`);
if (!ok3) bad++;

if (bad) { console.log(`\n✗ 進み方の条件を ${bad} つ満たしていない（XP・値段を見なおす：data/rewards.ts・data/characters.ts の XP_CURVE・data/facilities.ts）\n`); process.exit(1); }
console.log('\n✓ エンジョイ勢は4週間で第8章に届き、トップ層は8週間たっても目標が残っている\n');
