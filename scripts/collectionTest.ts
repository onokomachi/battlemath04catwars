/**
 * 収集（CW-4c）の試験。  npm run test:collection
 *
 *   [1] シールの確率：めずらしさの％の合計が 100、数えた割合が 表示の％に近い
 *   [2] 天井：どの種でも 10回以内に「レア」いじょうが 出る（9回つづけて ふつう なら 10回めは かならず レアいじょう）
 *   [3] ダブり → シールのかけら → こうかん（まだのシールだけ・たりないときは できない）
 *   [4] バッジの条件：しきい値の手前では 取れない・ちょうどで取れる・段は 下がらない・コインは 段ごと
 *   [5] シールコインは 学習でしか ふえない（まちがえた・💠・勝ち負けの数 では ふえない。1日の上限）
 *   [6] 保存の形：JSON にして もどしても 同じ・こわれたデータでも 落ちない
 *   [7] 称号・かざり：シールで開くのは 半分まで（コンプガチャに しない）
 */
import { DetRNG } from '../catwars/sim/rng';
import {
  CAPSULE_RULES, DUP_FRAGMENTS, EXCHANGE_COST, RARITY_ORDER, RARITY_RATE, STICKERS, STICKER_BY_ID,
  canExchange, exchangeSticker, pullCapsule, pickRarity, type CapsuleState,
} from '../catwars/collection/stickers';
import { BADGES, BADGE_BY_ID, badgeTier, emptyBadgeInput, evalBadges, type BadgeInput } from '../catwars/collection/badges';
import { BADGE_COINS, COIN_RULES, DAILY_COIN_MAX, coinsForPerfect } from '../catwars/collection/coins';
import {
  applyAnswer, applyBadges, applyBattle, emptySave, sanitizeSave, type CollectionSave,
} from '../catwars/store/useCollectionStore';
import { DECORS, TITLES } from '../catwars/collection/titles';
import { ENEMY_DEX, CAT_DEX_KEYS } from '../catwars/collection/dex';
import { ENEMY_UNIT_STATS } from '../catwars/data/campaign';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };

// ── [1] 確率 ──
console.log('[1] シールの確率');
const rateSum = RARITY_ORDER.reduce((a, r) => a + RARITY_RATE[r], 0);
check(Math.abs(rateSum - 100) < 1e-9, `めずらしさの％の合計 ${rateSum}`);
check(STICKERS.length >= 40 && STICKERS.length <= 60, `シールは ${STICKERS.length}しゅるい（40〜60）`);
check(new Set(STICKERS.map((s) => s.id)).size === STICKERS.length, 'シールの id は ぜんぶ ちがう');
for (const r of RARITY_ORDER) check(STICKERS.some((s) => s.rarity === r), `「${r}」の シールが ある`);
{
  const rng = new DetRNG(1);
  const N = 200000;
  const cnt: Record<string, number> = {};
  for (let i = 0; i < N; i++) { const r = pickRarity(() => rng.next()); cnt[r] = (cnt[r] ?? 0) + 1; }
  for (const r of RARITY_ORDER) {
    const got = (cnt[r] / N) * 100;
    check(Math.abs(got - RARITY_RATE[r]) < 0.4, `「${r}」 表示 ${RARITY_RATE[r]}% ／ 数えた ${got.toFixed(2)}%`);
  }
  // 天井ありで 回したときの、レアいじょうの 割合（表示の 30% より すこし多い）
  let st: CapsuleState = { stickers: {}, sinceUp: 0, frag: 0 };
  let up = 0;
  const M = 50000;
  for (let i = 0; i < M; i++) { const p = pullCapsule(st, () => rng.next()); st = p.next; if (p.sticker.rarity !== 'normal') up++; }
  console.log(`    （天井こみで 回したときの レアいじょう：${((up / M) * 100).toFixed(1)}%。表示は ${100 - RARITY_RATE.normal}%＋天井）`);
}

// ── [2] 天井 ──
console.log('[2] 天井（10回以内に かならず レアいじょう）');
{
  let worst = 0;
  let allOk = true;
  for (let seed = 1; seed <= 3000; seed++) {
    const rng = new DetRNG(seed);
    let st: CapsuleState = { stickers: {}, sinceUp: 0, frag: 0 };
    let since = 0;
    for (let i = 0; i < 60; i++) {
      const p = pullCapsule(st, () => rng.next());
      st = p.next;
      since = p.sticker.rarity === 'normal' ? since + 1 : 0;
      worst = Math.max(worst, since);
      if (since >= CAPSULE_RULES.pity) allOk = false;
    }
  }
  check(allOk, `3000の種×60回で、ふつうが つづいたのは いちばん長くて ${worst}回（${CAPSULE_RULES.pity - 1}回まで）`);
  // いちばん わるい 乱数（いつも 0.999…）でも 10回めは レアいじょう
  let st: CapsuleState = { stickers: {}, sinceUp: 0, frag: 0 };
  const bad = () => 0.0;   // 0 は いつも 先頭＝ふつう
  let first = -1;
  for (let i = 1; i <= 10; i++) { const p = pullCapsule(st, bad); st = p.next; if (p.sticker.rarity !== 'normal') { first = i; break; } }
  check(first === CAPSULE_RULES.pity, `いつも「ふつう」を引く乱数でも ${first}回めで レアいじょう（天井 ${CAPSULE_RULES.pity}）`);
  const p9 = pullCapsule({ stickers: {}, sinceUp: CAPSULE_RULES.pity - 1, frag: 0 }, bad);
  check(p9.pity && p9.sticker.rarity !== 'normal' && p9.next.sinceUp === 0, '天井で出たら かぞえは 0 にもどる');
}

// ── [3] ダブりと こうかん ──
console.log('[3] ダブり → シールのかけら → こうかん');
{
  const first = STICKERS.find((s) => s.rarity === 'normal')!;
  const st0: CapsuleState = { stickers: { [first.id]: 1 }, sinceUp: 0, frag: 0 };
  const p = pullCapsule(st0, () => 0);   // ふつうの先頭＝持っているもの
  check(p.dup && p.fragGain === DUP_FRAGMENTS.normal && p.next.frag === DUP_FRAGMENTS.normal, `ダブると シールのかけら +${DUP_FRAGMENTS.normal}`);
  const legend = STICKERS.find((s) => s.rarity === 'legend')!;
  const poor: CapsuleState = { stickers: {}, sinceUp: 0, frag: EXCHANGE_COST.legend - 1 };
  check(!canExchange(poor, legend.id), 'かけらが たりないと こうかんできない');
  const rich: CapsuleState = { stickers: {}, sinceUp: 0, frag: EXCHANGE_COST.legend };
  const after = exchangeSticker(rich, legend.id);
  check(after.stickers[legend.id] === 1 && after.frag === 0, `でんせつは かけら ${EXCHANGE_COST.legend}で こうかん`);
  check(!canExchange({ ...after, frag: 999 }, legend.id), 'もう持っているシールは こうかんできない');
  // ダブりだけで 全部 そろえられる（運だけで つまらない）：ふつうだけ ひきつづけても かけらで のこりが こうかんできる
  let st: CapsuleState = { stickers: {}, sinceUp: 0, frag: 0 };
  const rng = new DetRNG(7);
  let n = 0;
  while (STICKERS.some((s) => !(st.stickers[s.id] > 0)) && n < 5000) {
    st = pullCapsule(st, () => rng.next()).next; n++;
    for (const s of STICKERS) if (canExchange(st, s.id)) st = exchangeSticker(st, s.id);
  }
  check(n < 5000, `かけらの こうかん こみで ${n}回 回すと ぜんぶ そろう（上限なしの運だのみに ならない）`);
  check(Object.values(STICKER_BY_ID).every((s) => !('power' in s)), 'シールに 強さの数は ない（かざりだけ）');
}

// ── [4] バッジ ──
console.log('[4] バッジの条件');
check(BADGES.length >= 30 && BADGES.length <= 40, `バッジは ${BADGES.length}こ（30〜40）`);
check(BADGES.filter((b) => b.hidden).length >= 2 && BADGES.filter((b) => b.hidden).length <= 3, `かくしバッジ ${BADGES.filter((b) => b.hidden).length}こ（2〜3）`);
check(BADGES.filter((b) => b.tiers.length === 3).length >= BADGES.length / 2, `銅・銀・金の あるバッジが 半分いじょう（${BADGES.filter((b) => b.tiers.length === 3).length}こ）`);
check(new Set(BADGES.map((b) => b.id)).size === BADGES.length, 'バッジの id は ぜんぶ ちがう');
for (const b of BADGES) {
  const inc = b.tiers.every((t, i) => i === 0 || t > b.tiers[i - 1]);
  if (!inc) check(false, `${b.id} の しきい値が ふえていく順`);
}
{
  // ひとつずつ「しきい値の手前・ちょうど」を 確かめる（数の項目を さがして 入れる）
  const probe = (b: typeof BADGES[number], v: number): BadgeInput => {
    const i = emptyBadgeInput();
    const keys: (keyof BadgeInput)[] = ['perfectTotal', 'bestDayPerfect', 'bestStreak', 'studyDays', 'reviewCleared', 'bestRun', 'hardPerfect', 'star3Battles', 'extremePerfectChapters', 'shieldBreaks', 'skillsOpen', 'bestBattlePerfect', 'bestBattleShield'];
    for (const k of keys) (i as unknown as Record<string, number>)[k] = v;
    return i;
  };
  const numeric = ['first-step', 'perfect-total', 'day-perfect', 'streak', 'study-days', 'review', 'run', 'hard', 'star3-battles', 'extreme-perfect', 'shield', 'skills', 'secret-battle15', 'secret-shield3'];
  let ok = true;
  for (const id of numeric) {
    const b = BADGE_BY_ID[id];
    b.tiers.forEach((t, k) => {
      if (badgeTier(b, probe(b, t - 1)) !== k) { ok = false; console.log(`    ${id} 段${k + 1} の手前 ${t - 1} で ${badgeTier(b, probe(b, t - 1))}`); }
      if (badgeTier(b, probe(b, t)) !== k + 1) { ok = false; console.log(`    ${id} 段${k + 1} ちょうど ${t} で ${badgeTier(b, probe(b, t))}`); }
    });
  }
  check(ok, `数の バッジ ${numeric.length}こ：しきい値の手前では 取れず、ちょうどで 取れる`);
  // 単元の バッジ
  const ub = BADGES.find((b) => b.group === 'unit')!;
  const key = ub.id.slice(5);
  const i1 = emptyBadgeInput(); i1.unitShards = { [key]: ub.tiers[1] - 1 };
  const i2 = emptyBadgeInput(); i2.unitShards = { [key]: ub.tiers[1] };
  check(badgeTier(ub, i1) === 1 && badgeTier(ub, i2) === 2, `単元の バッジ（${ub.name}）：かけら ${ub.tiers[1] - 1} で 銅・${ub.tiers[1]} で 銀`);
  // 段は下がらない・コインは段ごと
  let save: CollectionSave = emptySave();
  const r1 = applyBadges(save, { 'perfect-total': 2 });
  check(r1.coins === BADGE_COINS[1] + BADGE_COINS[2], `銅と銀を いっしょに取ると コイン ${BADGE_COINS[1]}＋${BADGE_COINS[2]}`);
  save = r1.save;
  const r2 = applyBadges(save, { 'perfect-total': 1 });
  check(r2.save.badges['perfect-total'] === 2 && r2.coins === 0, '段は 下がらない（コインも ふえない）');
  const r3 = applyBadges(save, { 'perfect-total': 2 });
  check(r3.gained.length === 0 && r3.coins === 0, '同じ段では 2回 もらえない');
  // 何もしていない子には バッジなし
  check(Object.keys(evalBadges(emptyBadgeInput())).length === 0, '何もしていないときは バッジ 0こ');
  // 条件の文に「速さ」「勝った数」「ログイン」「放置」を使っていない
  const words = ['はやく', '速', '秒', 'ログイン', 'ほうち', '放置', '勝った数', '対戦'];
  const txt = BADGES.flatMap((b) => b.tiers.map((t) => b.cond(t) + b.name)).join(' ');
  check(!words.some((w) => txt.includes(w)), 'バッジの条件に 速さ・ログイン・放置・対戦の勝ち数 の言葉が ない');
}

// ── [5] シールコイン ──
console.log('[5] シールコインは 学習の成果だけ');
{
  let save = emptySave();
  const day = '2026-11-16';
  const miss = applyAnswer(save, { unitKey: 'u', skillId: 'a', perfect: false }, day);
  check(miss.coins === 0 && miss.save.coins === 0, 'まちがえた問題では ふえない');
  let total = 0;
  for (let k = 0; k < 200; k++) { const r = applyAnswer(save, { unitKey: 'u', skillId: `s${k}`, perfect: true }, day); save = r.save; total += r.coins; }
  check(total === DAILY_COIN_MAX, `1日に 200問 といても 問題からは ${total}まい（はじめて ${COIN_RULES.firstOfDay}＋上限 ${COIN_RULES.dailyPerfectCap}）`);
  const next = applyAnswer(save, { unitKey: 'u', skillId: 'x', perfect: true }, '2026-11-17');
  check(next.coins === coinsForPerfect(0), 'つぎの日の はじめての正解で また もらえる');
  // 勝ち負け だけでは ふえない（星が ふえたときだけ）
  const lose = applyBattle(emptySave(), { chapterId: 'ch1', tier: 'normal', win: false, prevStars: 0, answered: 0, perfect: 0, shields: 0, seen: [], defeated: {} });
  check(lose.coins === 0, '負けても 勝ち負けの数では ふえない');
  const winNoNewStar = applyBattle(emptySave(), { chapterId: 'ch1', tier: 'normal', win: true, stars: 2, prevStars: 2, answered: 6, perfect: 5, shields: 0, seen: [], defeated: {} });
  check(winNoNewStar.coins === 0, '勝っても 星が ふえなければ ふえない（くりかえし 勝っても かせげない）');
  const winNewStar = applyBattle(emptySave(), { chapterId: 'ch1', tier: 'normal', win: true, stars: 3, prevStars: 1, answered: 9, perfect: 9, shields: 0, seen: [], defeated: {} });
  check(winNewStar.coins === 2 * COIN_RULES.star, `星が 1→3 で ${2 * COIN_RULES.star}まい`);
  // ふくしゅう：まちがえた項目を あとで とくと 1つ
  let s2 = emptySave();
  s2 = applyAnswer(s2, { unitKey: 'u', skillId: 'r', perfect: false }, day).save;
  s2 = applyAnswer(s2, { unitKey: 'u', skillId: 'r', perfect: true }, day).save;
  s2 = applyAnswer(s2, { unitKey: 'u', skillId: 'r', perfect: true }, day).save;
  check(s2.stats.reviewCleared === 1, 'ふくしゅうは まちがえた あとの 1回めだけ 数える');
  // れんぞく学習
  let s3 = emptySave();
  for (const d of ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-05']) s3 = applyAnswer(s3, { unitKey: 'u', skillId: 'z', perfect: true }, d).save;
  check(s3.stats.bestStreak === 3 && s3.stats.streak === 1 && s3.stats.studyDays === 4, `れんぞく 3日・とぎれて 1日・学習した日 4（${s3.stats.bestStreak}/${s3.stats.streak}/${s3.stats.studyDays}）`);
}

// ── [6] 保存の形 ──
console.log('[6] 保存の形（JSON）');
{
  let save = emptySave();
  save = applyAnswer(save, { unitKey: 'u', skillId: 'a', perfect: true }, '2026-11-16').save;
  save = applyBattle(save, { chapterId: 'ch1', tier: 'hard', win: true, stars: 3, prevStars: 0, answered: 8, perfect: 8, shields: 1, seen: ['unit:grunt', 'boss:ch1'], defeated: { 'unit:grunt': 4 } }).save;
  save = { ...save, cap: { ...save.cap, stickers: { [STICKERS[0].id]: 2 } } };
  const json = JSON.stringify(save);
  const back = sanitizeSave(JSON.parse(json));
  check(JSON.stringify(back) === json, `JSON にして もどしても 同じ（${json.length}バイト）`);
  check(back.marks.includes('unit:grunt@hard') && back.marks.includes('boss:ch1@hard'), '段の しるし（たおした兵・勝った章のボス）');
  const broken = sanitizeSave({ coins: -5, cap: { stickers: { nope: 3, [STICKERS[1].id]: 'x' } }, badges: { fake: 2 }, title: 'zzz', stats: 7 });
  check(broken.coins === 0 && Object.keys(broken.cap.stickers).length === 0 && Object.keys(broken.badges).length === 0 && broken.title === 'rookie',
    'こわれたデータ・知らない id は すてる');
  check(sanitizeSave(null).v === 1 && sanitizeSave('x').coins === 0, 'null・文字でも 落ちない');
}

// ── [7] 称号・かざり・図鑑 ──
console.log('[7] 称号・かざり・図鑑');
{
  const half = Math.ceil(STICKERS.length / 2);
  check(TITLES.length >= 8 && TITLES.length <= 12, `称号 ${TITLES.length}こ`);
  check(DECORS.length >= 3 && DECORS.length <= 6, `かざり ${DECORS.length}こ`);
  check([...TITLES, ...DECORS].every((t) => (t.need.stickers ?? 0) <= half), `シールで 開くのは ${half}しゅるい（半分）まで（そろえた ごほうびに しない）`);
  check(ENEMY_DEX.filter((e) => e.kind === 'unit').length === Object.keys(ENEMY_UNIT_STATS).length, `敵の兵 ${Object.keys(ENEMY_UNIT_STATS).length}しゅるい ぜんぶ 図鑑にある`);
  check(ENEMY_DEX.filter((e) => e.kind === 'boss').length === 8, '各章のボス 8');
  check(CAT_DEX_KEYS.length === 33, `ネコ ${CAT_DEX_KEYS.length}（11系統×3）`);
}

if (fails) { console.log(`\n✗ 収集の試験：${fails}件 失敗\n`); process.exit(1); }
console.log('\n✓ 収集の試験：ぜんぶ通った\n');
