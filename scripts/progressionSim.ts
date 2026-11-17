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
 *   3. スキル（2026-11-15 CW-4b。かけら 2／4／8 で開く）：エンジョイ勢が 4週間で 5枠の系統に 平均1つ以上／
 *      トップ層が 4週間たっても 全24個は開いていない（8週間の数も出す）。
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
import { SKILLS, unlockedSkillIds } from '../catwars/data/skills';
import { TIER_CARD_LIMIT, tierDifficulty, tierKey } from '../catwars/data/campaign';
import { starsFor } from '../catwars/data/rewards';
import { BADGES, BADGE_TIER_TOTAL, badgeTierCount, evalBadges, type BadgeInput } from '../catwars/collection/badges';
import { CAPSULE_RULES, EXCHANGE_COST, RARITY_ORDER, STICKERS, ownedKinds, pullCapsule, exchangeSticker } from '../catwars/collection/stickers';
import { ENEMY_DEX, CAT_DEX_KEYS, foundCatKeys, unitDexKey, bossDexKey } from '../catwars/collection/dex';
import { applyAnswer, applyBattle, applyBadges, emptySave, localDay, type CollectionSave } from '../catwars/store/useCollectionStore';
import { BARRACKS_UNLOCKS } from '../catwars/data/facilities';
import { FRIEND_ATTACK_CREDITS } from '../catwars/friend/friendAttack';

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

const DIFF_OF: Record<string, number> = Object.fromEntries(rounds.map(r => [`${r.unitKey}/${r.skillId}`, r.difficulty]));
const HARD_KEYS = ALL_SKILLS.filter(k => (DIFF_OF[k] ?? 3) >= 4);
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
function familyShardsOf(fam: string, perfect: Map<string, number>): number {
  const units = FAMILY_UNITS[fam] ?? PACK_UNITS.map(u => u.key);
  return Math.floor(units.reduce((a, k) => a + unitShards(k, perfect), 0) / units.length);
}
function familyCap(fam: string, perfect: Map<string, number>): number {
  return levelCapForShards(familyShardsOf(fam, perfect));
}
/** 開いているスキルの数（系統ごと） */
function skillCount(fam: string, perfect: Map<string, number>): number {
  return unlockedSkillIds(fam, familyShardsOf(fam, perfect)).length;
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
  /** 日 → 系統ごとの 開いているスキルの数（7日ごと） */
  skillsByDay: Record<number, Record<string, number>>;
  /** 収集（CW-4c）：日 → うまり具合 */
  col: Record<number, ColDay>;
  /** 収集：何も あたらしく 手に入らなかった日 */
  emptyDays: number[];
  /** 収集：1日に あたらしく手に入れた数の いちばん少ない日の数 */
  minNewPerDay: number;
  /** あたらしいもの（ダブりでない）が 無かった日 */
  strictEmpty: number[];
  colBadges: Record<string, number>;
}

interface ColDay { stickers: number; badgeTiers: number; badges: number; dex: number; coinsTotal: number; pulls: number; frag: number }
const DEX_TOTAL = ENEMY_DEX.length + CAT_DEX_KEYS.length;

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
  const skillsByDay: Record<number, Record<string, number>> = {};
  // ── 収集（CW-4c）。乱数は べつ（上の育ち方・施設の数を 変えないため）──
  const crng = new DetRNG(20261116);
  const crand = () => crng.next();
  let col: CollectionSave = emptySave();
  const campStars: Record<string, number> = {};
  const colByDay: Record<number, ColDay> = {};
  const emptyDays: number[] = [];
  const strictEmpty: number[] = [];
  let minNew = Infinity;
  const unitPerfect: Record<string, number> = {};
  const countNew = (before: CollectionSave, after: CollectionSave) =>
    (ownedKinds(after.cap.stickers) - ownedKinds(before.cap.stickers)) + (badgeTierCount(after.badges) - badgeTierCount(before.badges))
    + (after.enemySeen.length - before.enemySeen.length) + (after.cats.length - before.cats.length);
  const badgeInput = (): BadgeInput => {
    const unitSh: Record<string, number> = {};
    for (const u of PACK_UNITS) unitSh[u.key] = unitShards(u.key, perfect);
    let open = 0, famsWith = 0;
    for (const f of FAMILIES) { const c = skillCount(f, perfect); open += c; if (c > 0) famsWith++; }
    let total = 0; for (const v of perfect.values()) total += v;
    const st = col.stats;
    return {
      perfectTotal: total, bestDayPerfect: st.bestDayPerfect, bestStreak: st.bestStreak, studyDays: st.studyDays,
      reviewCleared: st.reviewCleared, unitPerfect: { ...unitPerfect }, unitShards: unitSh, bestRun: st.bestRun,
      hardPerfect: st.hardPerfect, star3Battles: st.star3Battles, stars: { ...campStars },
      extremePerfectChapters: st.extremePerfect.length, shieldBreaks: st.shieldBreaks,
      skillsOpen: open, familiesWithSkill: famsWith, familiesTotal: FAMILIES.length,
      bestBattlePerfect: st.bestBattlePerfect, bestBattleShield: st.bestBattleShield,
    };
  };

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
    const today = localDay(new Date(2026, 0, day));
    const dayStart = col;
    for (let b = 0; b < battles; b++) {
      const form = p.rotateAll
        ? Array.from({ length: 5 }, (_, i) => FAMILIES[(rot + i) % FAMILIES.length])
        : FIXED_FORMATION;
      rot = (rot + 1) % FAMILIES.length;
      // 問題
      let ok = 0;
      const pool0 = p.range === 'all' ? ALL_SKILLS : skillsForFormation(form);
      // 収集：どの章・段で戦うかは 下で きまるので、カードの まいすうは 前もって 最前線で見る（げきむず だけ）
      const frPeek = frontier();
      const lim = frPeek && frPeek.tier === 'extreme' ? (TIER_CARD_LIMIT.extreme?.[frPeek.no] ?? p.problemsPerBattle) : p.problemsPerBattle;
      let bAnswered = 0, bPerfect = 0;
      for (let q = 0; q < p.problemsPerBattle; q++) {
        const hit = rng.next() < p.accuracy;
        if (q < lim) {
          // まちがえた ときの 項目は 収集の乱数で（上の乱数の並びを 変えない）
          const km = hit ? null : pool0[crng.int(pool0.length)];
          if (km) {
            bAnswered++;
            const [u, sk] = [km.slice(0, km.indexOf('/')), km.slice(km.indexOf('/') + 1)];
            col = applyAnswer(col, { unitKey: u, skillId: sk, difficulty: DIFF_OF[km], perfect: false }, today).save;
          }
        }
        if (!hit) continue;
        ok++;
        const pool = pool0;
        const k = pool[rng.int(pool.length)];
        if (q < lim) {
          bAnswered++; bPerfect++;
          const u = k.slice(0, k.indexOf('/'));
          unitPerfect[u] = (unitPerfect[u] ?? 0) + 1;
          col = applyAnswer(col, { unitKey: u, skillId: k.slice(k.indexOf('/') + 1), difficulty: DIFF_OF[k], perfect: true }, today).save;
        }
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
        // ぜんぶクリアしたら、★3 で ない 章・段を くりかえす（収集の「ぜんぶ ★3」のため。無ければ げきむず 第8章）
        let pickT: { tier: ChapterTier; no: number } = { tier: 'extreme', no: CAMPAIGN.length };
        outer: for (const t of TIER_ORDER) for (const c of CAMPAIGN) if ((campStars[tierKey(c.id, t)] ?? 0) < 3) { pickT = { tier: t, no: c.no }; break outer; }
        fr = pickT;
        replay = true;
      }
      const ch = CAMPAIGN[fr.no - 1];
      const base = chapterBaseLevel(ch, fr.tier);
      // 勝率：めやす以上なら p.winRate（脅威レベルで 楽にはならない）。めやすより低いと 1レベルにつき 4% さがる
      const gap = avg - base;
      const wr = Math.max(0.05, p.winRate * (gap >= 0 ? 1 : Math.max(0.1, 1 + 0.04 * gap)));
      const win = rng.next() < wr;
      // 収集：ボスのシールドは ふくしゅうカード（まちがえた項目 → 無ければ むずかしい項目）。まちがえずに とけたら 1まい われる
      {
        const td = tierDifficulty(ch, fr.tier);
        let shields = 0;
        for (let i = 0; i < (td.bossShield ?? 0); i++) {
          const pend = col.stats.reviewPending;
          const k = pend.length ? pend[crng.int(pend.length)] : HARD_KEYS[crng.int(HARD_KEYS.length)];
          const okS = crng.next() < p.accuracy;
          const u = k.slice(0, k.indexOf('/'));
          col = applyAnswer(col, { unitKey: u, skillId: k.slice(k.indexOf('/') + 1), difficulty: DIFF_OF[k], perfect: okS }, today).save;
          bAnswered++;
          if (okS) { bPerfect++; shields++; unitPerfect[u] = (unitPerfect[u] ?? 0) + 1; }  // かけら（perfect）には 足さない（CW-4a/4b の 育ち方の数を 変えないため）
        }
        const seen = [...td.unitPool.map(unitDexKey), ...(td.bossAtSpawnCount != null ? [unitDexKey('boss')] : []), bossDexKey(ch.id)];
        const defeated: Record<string, number> = {};
        for (const k of td.unitPool) defeated[unitDexKey(k)] = win ? 6 : 2;
        const tk = tierKey(ch.id, fr.tier);
        const stars = win ? starsFor(bAnswered, bPerfect) : undefined;
        const prev = campStars[tk] ?? 0;
        col = applyBattle(col, { chapterId: ch.id, tier: fr.tier, win, stars, prevStars: prev, answered: bAnswered, perfect: bPerfect, shields, seen, defeated }).save;
        if (win && stars && stars > prev) campStars[tk] = stars;
      }
      for (const f of form) giveXp(f, win ? BATTLE_XP_WIN : BATTLE_XP_LOSS);
      if (win) {
        const bonus = powerPlantBonus(owned[BuildingType.GOLD_MINE], facLv[BuildingType.GOLD_MINE]);
        const c = Math.round(ch.rewardCredits * TIER_INFO[fr.tier].rewardMult * (1 + bonus));
        credits += c; earned += c;
        if (!replay) cleared[fr.tier] = Math.max(cleared[fr.tier], fr.no);
      }
    }
    // なかまの 基地に いく（CW-6b）：その日 1回目の 勝ちで 💠（毎日 1回 勝つ とみる。いちばん多く 見つもった形）
    credits += FRIEND_ATTACK_CREDITS; earned += FRIEND_ATTACK_CREDITS;
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
    // 収集：ネコの図鑑・バッジ → シールコインで カプセル → シールのかけらで こうかん
    {
      const unlocked = [...FAMILIES.filter(f => CHARACTERS.find(c => c.id === f)?.isStarter)];
      for (const u of BARRACKS_UNLOCKS) if (owned[BuildingType.BARRACKS] >= u.need) unlocked.push(...u.ids);
      const cats = foundCatKeys(unlocked, lv).filter(k => !col.cats.includes(k));
      if (cats.length) col = { ...col, cats: [...col.cats, ...cats] };
      col = applyBadges(col, evalBadges(badgeInput())).save;
      while (col.coins >= CAPSULE_RULES.cost) {
        const r = pullCapsule(col.cap, crand);
        col = { ...col, coins: col.coins - CAPSULE_RULES.cost, cap: { ...r.next, pulls: col.cap.pulls + 1 } };
      }
      // こうかん：たりる いちばん めずらしい まだのシール
      for (;;) {
        const cand = [...RARITY_ORDER].reverse().flatMap(rr => STICKERS.filter(x => x.rarity === rr && !(col.cap.stickers[x.id] > 0)))
          .find(x => col.cap.frag >= EXCHANGE_COST[x.rarity]);
        if (!cand) break;
        col = { ...col, cap: { ...exchangeSticker(col.cap, cand.id), pulls: col.cap.pulls } };
      }
      // 「何か手に入れた」＝ あたらしい バッジの段・図鑑・シール、または カプセルで シールを1まい（ダブりでも かけらになる）
      const nNew = countNew(dayStart, col);
      const pulled = col.cap.pulls - dayStart.cap.pulls;
      if (nNew === 0 && pulled === 0) emptyDays.push(day);
      if (nNew === 0) strictEmpty.push(day);
      minNew = Math.min(minNew, nNew + pulled);
      if (process.env.BADGEDAY && Number(process.env.BADGEDAY) === day) {
        const bi = badgeInput();
        console.log(`[${p.label} ${day}日] バッジ ` + BADGES.map(b => `${b.id}=${col.badges[b.id] ?? 0}/${b.tiers.length}(${b.measure(bi)})`).join(' '));
      }
      colByDay[day] = {
        stickers: ownedKinds(col.cap.stickers), badgeTiers: badgeTierCount(col.badges),
        badges: Object.keys(col.badges).length, dex: col.enemySeen.length + col.cats.length,
        coinsTotal: col.coinsTotal, pulls: col.cap.pulls, frag: col.cap.frag,
      };
    }
    if (day % 7 === 0) skillsByDay[day] = Object.fromEntries(FAMILIES.map(f => [f, skillCount(f, perfect)]));
    if (VERBOSE || day % 7 === 0) {
      const fr = frontier();
      weekly.push(
        `${String(day).padStart(3)}日  上位5平均 Lv${top5().toFixed(1).padStart(5)}  ` +
        `系統 ${FAMILIES.map(f => lv[f]).join('/')}  上限 ${FAMILIES.map(f => familyCap(f, perfect)).join('/')}  ` +
        `施設Lv ${TYPES.map(t => facLv[t]).join('/')}  数 ${TYPES.map(t => owned[t]).join('/')}  ` +
        `💠 累計${earned}・のこり${credits}  スキル ${FAMILIES.map(f => skillCount(f, perfect)).join('/')}  つぎ ${fr ? `${TIER_INFO[fr.tier].label}${fr.no}章` : 'ぜんぶクリア'}`,
      );
    }
  }
  const fr = frontier();
  return {
    avgTop5: top5(), levels: lv, facLevels: facLv, owned, creditsEarned: earned, creditsLeft: credits,
    frontier: fr ? `${TIER_INFO[fr.tier].label} 第${fr.no}章` : 'ぜんぶクリア',
    caps: Object.fromEntries(FAMILIES.map(f => [f, familyCap(f, perfect)])),
    weekly, skillsByDay, col: colByDay, emptyDays, strictEmpty, minNewPerDay: minNew, colBadges: col.badges,
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

// スキルの開く時期
const sum = (r: Record<string, number>, fams: string[]) => fams.reduce((a, f) => a + (r[f] ?? 0), 0);
const e28 = e.skillsByDay[28] ?? {};
const enjoyAvg = sum(e28, FIXED_FORMATION) / FIXED_FORMATION.length;
const t28 = sum(t.skillsByDay[28] ?? {}, FAMILIES), t56 = sum(t.skillsByDay[56] ?? {}, FAMILIES);
const ok4 = enjoyAvg >= 1;
const ok5 = t28 < SKILLS.length;
console.log(`\n■ スキル（かけら 2／4／8 で開く）`);
for (const d of [7, 14, 21, 28]) console.log(`  エンジョイ勢 ${String(d).padStart(2)}日：5枠の系統に 平均 ${(sum(e.skillsByDay[d] ?? {}, FIXED_FORMATION) / 5).toFixed(1)}個（${FIXED_FORMATION.map(f => (e.skillsByDay[d] ?? {})[f] ?? 0).join('/')}）`);
for (const d of [7, 14, 21, 28, 35, 42, 49, 56]) console.log(`  トップ層 ${String(d).padStart(2)}日：${sum(t.skillsByDay[d] ?? {}, FAMILIES)}/${SKILLS.length}個`);
console.log(`  → エンジョイ勢 4週間で 5枠に 平均 ${enjoyAvg.toFixed(1)}個 ${ok4 ? '✅' : '❌'}（1つ以上）・トップ層 4週間で ${t28}/${SKILLS.length}個 ${ok5 ? '✅' : '❌'}（全部は開いていない）・8週間で ${t56}/${SKILLS.length}個`);
if (!ok4) bad++;
if (!ok5) bad++;

// ── 収集（CW-4c）──
const pct = (a: number, b: number) => `${Math.round((a / b) * 100)}%`;
const colLine = (r: Result, d: number) => {
  const c = r.col[d];
  return c ? `${String(d).padStart(2)}日：シール ${c.stickers}/${STICKERS.length}（${pct(c.stickers, STICKERS.length)}）・バッジ ${c.badgeTiers}/${BADGE_TIER_TOTAL}段（${pct(c.badgeTiers, BADGE_TIER_TOTAL)}・${c.badges}/${BADGES.length}こ）・図鑑 ${c.dex}/${DEX_TOTAL}・コイン累計 ${c.coinsTotal}・回した ${c.pulls}回・のこりのかけら ${c.frag}` : '';
};
const tc = run({ ...TOP, days: 84 });
console.log(`\n■ 収集（シール ${STICKERS.length}しゅるい・バッジ ${BADGES.length}こ／${BADGE_TIER_TOTAL}段・図鑑 ${DEX_TOTAL}）`);
for (const d of [1, 2, 3, 7, 14, 21, 28]) console.log(`  エンジョイ勢 ${colLine(e, d)}`);
for (const d of [7, 14, 21, 28, 42, 56, 70, 84]) console.log(`  トップ層 ${colLine(tc, d)}`);
const ec28 = e.col[28], t28c = tc.col[28], t56c = tc.col[56], t84c = tc.col[84];
const sr = (c: ColDay) => c.stickers / STICKERS.length, br = (c: ColDay) => c.badgeTiers / BADGE_TIER_TOTAL;
const okC1 = e.emptyDays.length === 0;
const okC2 = sr(ec28) >= 0.4 && sr(ec28) <= 0.6;
const okC3 = br(ec28) >= 0.3 && br(ec28) <= 0.5;
const okC4 = sr(t28c) < 0.8 && br(t28c) < 0.8;
const okC5 = sr(t84c) >= 0.9 && br(t84c) >= 0.85;
console.log(`  → エンジョイ勢：何も 手に入らない日 ${e.emptyDays.length}日${e.emptyDays.length ? `（${e.emptyDays.join(',')}日め）` : ''}・1日に 手に入れた数の いちばん少ない日 ${e.minNewPerDay} ${okC1 ? '✅' : '❌'}（毎日1つ以上）。ダブりでない あたらしいものが 無かった日 ${e.strictEmpty.length}日${e.strictEmpty.length ? `（${e.strictEmpty.join(',')}日め）` : ''}`);
console.log(`     28日で シール ${pct(ec28.stickers, STICKERS.length)} ${okC2 ? '✅' : '❌'}（40〜60%）・バッジ ${pct(ec28.badgeTiers, BADGE_TIER_TOTAL)} ${okC3 ? '✅' : '❌'}（30〜50%）`);
console.log(`  → トップ層：28日で シール ${pct(t28c.stickers, STICKERS.length)}・バッジ ${pct(t28c.badgeTiers, BADGE_TIER_TOTAL)} ${okC4 ? '✅' : '❌'}（どちらも 80%未満）／56日で シール ${pct(t56c.stickers, STICKERS.length)}・バッジ ${pct(t56c.badgeTiers, BADGE_TIER_TOTAL)}／84日で シール ${pct(t84c.stickers, STICKERS.length)}・バッジ ${pct(t84c.badgeTiers, BADGE_TIER_TOTAL)} ${okC5 ? '✅' : '❌'}（シール90%・バッジ85% いじょう）`);
const lastBadges = BADGES.filter(b => (tc.colBadges?.[b.id] ?? 0) < b.tiers.length).map(b => b.id);
if (VERBOSE) console.log(`  84日で のこっている バッジ：${lastBadges.join(', ')}`);
for (const ok of [okC1, okC2, okC3, okC4, okC5]) if (!ok) bad++;

if (bad) { console.log(`\n✗ 進み方の条件を ${bad} つ満たしていない（XP・値段を見なおす：data/rewards.ts・data/characters.ts の XP_CURVE・data/facilities.ts）\n`); process.exit(1); }
console.log('\n✓ エンジョイ勢は4週間で第8章に届き、トップ層は8週間たっても目標が残っている\n');
