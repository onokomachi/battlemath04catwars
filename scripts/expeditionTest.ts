/**
 * 週がわりの遠征（CW-6a・2026-11-17）の試験。
 *
 *   npm run test:expedition            … 週の きまり・遠征の決まり方・ルール・ルールごとの sim の決定性・星の記録・学級の合計・ごほうび（数十秒。npm run check に入れた）
 *   npm run test:expedition:balance    … 全部の 戦場×ルール × 手持ちのレベル で「とかない」が 0%・「ふつう」が勝てる（数十分。RUNS=4 LV=1,6,12,24,40,60）
 *
 * サーバは ぜんぶ 差しかえる（本番のサーバには 何も送らない）。
 */
import './lib/memStorage';
import {
  weekIndexOf, weekStartOf, weekStartOfIndex, weekIndexOfStart, nextWeekStartMs, daysLeftInWeek,
} from '../catwars/expedition/week';
import {
  expeditionForWeek, currentExpedition, expeditionBaseDifficulty, expeditionDifficulty, expeditionEnemyBase, expeditionEnemyLevel,
  tuneExpeditionConfig, classGoal, MAP_ORDER, EXPEDITION_GOAL_COINS, EXPEDITION_START_ENERGY,
} from '../catwars/expedition/expedition';
import { EXPEDITION_RULES, RULE_BY_ID, HERO_MULT, type ExpeditionRuleId } from '../catwars/expedition/rules';
import { buildSimConfig } from '../catwars/sim/setup';
import { BuildingType } from '../catwars/types';
import { recordBest, sanitizeExpedition, useExpeditionStore, KEEP_WEEKS } from '../catwars/store/useExpeditionStore';
import { useCollectionStore } from '../catwars/store/useCollectionStore';
import { usePlayerStore } from '../catwars/store/usePlayerStore';
import {
  __setExpeditionRpc, flushExpedition, refreshClassExpedition, useClassExpedition, parseClassExpedition, claimGoalRewards, expeditionNamed,
} from '../catwars/portal/expeditionSync';
import { settleExpedition } from '../catwars/utils/settleExpedition';
import { exportBundle, importBundle, measureBundle } from '../catwars/portal/saveBundle';
import { SAVE_KEYS } from '../catwars/portal/saveKeys';
import {
  playExpedition, seedFor, NO_SOLVE_SKILL, NORMAL_SKILL, WEAK_SKILL, loadoutForLevel, chapterNoForLevel,
} from './botSim';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };

if (process.env.BALANCE === '1') {
  await balance();
  process.exit(fails ? 1 : 0);
}

// ── [1] 週の きまり（日本時間の月曜 0:00 で切りかわる） ─────────────────
console.log('[1] 週の きまり');
{
  const sunLast = Date.parse('2026-11-15T14:59:59.999Z'); // 日本時間 11/15（日）23:59:59.999
  const monZero = Date.parse('2026-11-15T15:00:00.000Z'); // 日本時間 11/16（月）0:00
  check(weekStartOf(sunLast) === '2026-11-09', `日曜 23:59:59 は 前の週（${weekStartOf(sunLast)}）`);
  check(weekStartOf(monZero) === '2026-11-16', `月曜 0:00 から 次の週（${weekStartOf(monZero)}）`);
  check(weekIndexOf(monZero) === weekIndexOf(sunLast) + 1, '週の番号は 1 ふえる');
  // UTC の月曜 0:00（日本時間 月曜 9:00）は 同じ週のまま／UTC の日曜 20:00（日本時間 月曜 5:00）は もう次の週
  check(weekStartOf(Date.parse('2026-11-16T00:00:00Z')) === '2026-11-16', 'UTC の月曜 0:00（日本時間 9:00）も 同じ週');
  check(weekStartOf(Date.parse('2026-11-15T20:00:00Z')) === '2026-11-16', 'UTC では まだ日曜でも 日本時間が月曜なら 次の週');
  check(weekStartOf(Date.parse('2026-11-22T14:59:00Z')) === '2026-11-16', '同じ週の 日曜の夜まで 同じ週');
  let okRound = true;
  for (let w = 2800; w < 3000; w++) if (weekIndexOfStart(weekStartOfIndex(w)) !== w) okRound = false;
  check(okRound, '週の番号 ⇄ 月曜の日づけ が もどる');
  let monday = true;
  for (let w = 2800; w < 2900; w++) if (new Date(`${weekStartOfIndex(w)}T00:00:00Z`).getUTCDay() !== 1) monday = false;
  check(monday, '週の名前は いつも月曜の日づけ（サーバの date_trunc(\'week\', …) と同じ）');
  check(nextWeekStartMs(sunLast) === monZero, `次に切りかわる時刻＝月曜 0:00（${new Date(nextWeekStartMs(sunLast)).toISOString()}）`);
  check(daysLeftInWeek(sunLast) === 1 && daysLeftInWeek(monZero) === 7, 'のこりの日：日曜は 1・月曜は 7');
  check(weekIndexOfStart('2026-13-99') === null || typeof weekIndexOfStart('x') === 'object', 'こわれた日づけは null');
}

// ── [2] 遠征の決まり方（週の番号だけから・決定的） ─────────────────
console.log('[2] 遠征の決まり方');
{
  const key = (w: number) => { const e = expeditionForWeek(w); return `${e.weekStart}|${e.chapter.id}|${e.rule.id}|${e.ctx.heroFamily}|${e.extraEnemy}`; };
  let same = true;
  for (let w = 2800; w < 2900; w++) if (key(w) !== key(w)) same = false;
  check(same, '同じ週の番号なら 同じ遠征（なんかい 作っても）');
  const mon = Date.parse('2026-11-15T15:00:00Z');
  const inWeek = [0, 1, 3.5, 6.99].map((d) => currentExpedition(mon + d * 86_400_000));
  check(inWeek.every((e) => key(e.week) === key(inWeek[0].week)), `同じ週（月曜 0:00〜日曜 23:59）は 同じ遠征：「${inWeek[0].rule.name}」${inWeek[0].map.name}`);
  check(currentExpedition(mon - 1).week === inWeek[0].week - 1, '月曜 0:00 の 1ms 前は 前の週の遠征');
  const W0 = 2900, N = MAP_ORDER.length * EXPEDITION_RULES.length;
  const combos = new Set<string>(); const rules = new Set<string>(); const maps: Record<number, number> = {};
  let fitsOk = true, neighbor = true, starters = true;
  for (let w = W0; w < W0 + N; w++) {
    const e = expeditionForWeek(w);
    combos.add(`${e.chapter.no}:${e.rule.id}`); rules.add(e.rule.id); maps[e.chapter.no] = (maps[e.chapter.no] ?? 0) + 1;
    if (e.rule.fits && !e.rule.fits(e.map)) fitsOk = false;
    if (expeditionForWeek(w + 1).chapter.no === e.chapter.no) neighbor = false;
    if (!['barbarian', 'archer', 'giant'].includes(e.ctx.heroFamily)) starters = false;
  }
  check(rules.size === EXPEDITION_RULES.length, `${N}週で ルール ${rules.size}/${EXPEDITION_RULES.length} しゅるいが ぜんぶ出る`);
  check(Object.keys(maps).length === MAP_ORDER.length && Object.values(maps).every((n) => n === EXPEDITION_RULES.length), `戦場は 第${[...MAP_ORDER].sort().join('・')}章 が 同じ回数（${Object.values(maps).join('/')}）`);
  check(!Object.keys(maps).includes('1'), '第1章（まもりの施設が無い）は 出ない');
  check(combos.size >= N - 6, `戦場×ルール の組みあわせ ${combos.size}/${N}（なりたたない組みは 次のルール）`);
  check(fitsOk, 'なりたたない組み（兵舎の無い戦場で「そらの たいぐん」など）は 出ない');
  check(neighbor, 'となりの週は ちがう戦場');
  check(starters, '主役は はじめから使える系統だけ');
}

// ── [3] ルール（試合の前に 入力を変えるだけ） ─────────────────
console.log('[3] ルール');
const weekOf = (id: ExpeditionRuleId, chNo?: number): number => {
  for (let w = 2900; w < 3100; w++) { const e = expeditionForWeek(w); if (e.rule.id === id && (chNo == null || e.chapter.no === chNo)) return w; }
  throw new Error(`no week for ${id}`);
};
{
  const cfgOf = (w: number) => {
    const e = expeditionForWeek(w);
    const kit = loadoutForLevel(12, 5);
    const base = buildSimConfig({ mode: 'PVE', seed: 1, chapter: e.chapter, difficulty: expeditionDifficulty(e, 12), battleMap: e.map, p1: { levels: kit.levels, buffs: kit.buffs, formation: kit.formation } });
    return { e, base, tuned: tuneExpeditionConfig(e, base) };
  };
  const fog = cfgOf(weekOf('fog'));
  check(fog.tuned.unitStats.P1.archer.attackRange === fog.base.unitStats.P1.archer.attackRange - 1, `きり：遠距離の しゃてい ${fog.base.unitStats.P1.archer.attackRange} → ${fog.tuned.unitStats.P1.archer.attackRange}`);
  check(fog.tuned.unitStats.P1.barbarian.attackRange === fog.base.unitStats.P1.barbarian.attackRange, 'きり：近接は そのまま');
  check(fog.base.unitStats.P1.archer.attackRange === 3.5, 'もとの cfg は 変えない');
  const hero = cfgOf(weekOf('hero'));
  const hf = hero.e.ctx.heroFamily;
  check(hero.tuned.unitStats.P1[hf].hp === Math.round(hero.base.unitStats.P1[hf].hp * HERO_MULT), `主役（${hf}）の HP ×${HERO_MULT}`);
  check(Object.keys(hero.base.unitStats.P1).filter((id) => id !== hf).every((id) => hero.tuned.unitStats.P1[id].hp === hero.base.unitStats.P1[id].hp), '主役いがいは そのまま');
  const sky = expeditionForWeek(weekOf('sky'));
  check(JSON.stringify(expeditionBaseDifficulty(sky).unitPool) === '["flyer"]', 'そらの たいぐん：敵は 飛行ドローンだけ');
  const nw = expeditionForWeek(weekOf('nowall'));
  check(nw.map.enemyBase.some((b) => b.type === BuildingType.WALL) && !expeditionEnemyBase(nw).some((b) => b.type === BuildingType.WALL), 'かべの ない とりで：かべが なくなる');
  const tw = expeditionForWeek(weekOf('towers'));
  const cannons = (bs: { type: BuildingType }[]) => bs.filter((b) => b.type === BuildingType.CANNON).length;
  check(cannons(expeditionEnemyBase(tw)) === cannons(tw.map.enemyBase) + 2, `ほうだいの まち：砲台 ${cannons(tw.map.enemyBase)} → ${cannons(expeditionEnemyBase(tw))}`);
  const bs = expeditionForWeek(weekOf('boss'));
  check(expeditionBaseDifficulty(bs).bossShield === 2 && (expeditionBaseDifficulty(bs).bossAtSpawnCount ?? 999) <= 25, 'おやぶん：25体めまでに シールド2まいの おやぶん');
  const sw = expeditionForWeek(weekOf('swarm'));
  const plain = { ...sw, rule: { ...RULE_BY_ID.swarm, difficulty: undefined } };
  check(Math.abs(expeditionBaseDifficulty(sw).enemySpawnRatePerSec / expeditionBaseDifficulty(plain).enemySpawnRatePerSec - 1.6) < 1e-9, 'てきが いっぱい：出現 1.6ばい');
  const ar = expeditionForWeek(weekOf('armor'));
  check(['guard', 'brute'].every((k) => expeditionBaseDifficulty(ar).unitPool.includes(k as never)), 'かたい てき：たてロボ・重装ロボが 入る');
  check(expeditionBaseDifficulty(fog.e).startEnergy === EXPEDITION_START_ENERGY, `はじめの ⚡ は ${EXPEDITION_START_ENERGY}`);
  // 手持ちに合わせた敵の強さ（脅威レベルのしくみ・基準 Lv1）
  const e8 = expeditionForWeek(weekOf('hero', 8));
  const hp = (lv: number) => expeditionDifficulty(e8, lv).enemyHpMult;
  check(hp(1) < hp(12) && hp(12) < hp(24) && hp(24) < hp(40), `敵の HP の倍率は 手持ちとともに上がる（Lv1 ${hp(1).toFixed(2)}・Lv24 ${hp(24).toFixed(2)}・Lv40 ${hp(40).toFixed(2)}）`);
  check(Math.abs(hp(24) / 1.3 - 1) < 0.08, `第8章の戦場・Lv24（第8章の めやす）で ほぼ 第8章の ふつう（${hp(24).toFixed(2)} ≒ 1.3）`);
  check(expeditionEnemyLevel(1) === 1 && expeditionEnemyLevel(24) >= 24 && expeditionEnemyLevel(40) > expeditionEnemyLevel(24), `「てき Lv」：Lv1→${expeditionEnemyLevel(1)}・Lv24→${expeditionEnemyLevel(24)}・Lv40→${expeditionEnemyLevel(40)}`);
}

// ── [4] ルールごとに sim が決定的 ─────────────────
console.log('[4] ルールごとの sim の決定性');
for (const r of EXPEDITION_RULES) {
  const w = weekOf(r.id);
  const a = playExpedition(w, 12, 4242, { maxSeconds: 60 });
  const b = playExpedition(w, 12, 4242, { maxSeconds: 60 });
  const c = playExpedition(w, 12, 777, { maxSeconds: 60 });
  check(a.checksum === b.checksum, `${r.icon} ${r.name}：同じ たね なら 同じ結果（${a.checksum.length}文字の 状態が一致）${a.checksum === c.checksum ? '' : '・たねが ちがえば ちがう'}`);
}

// ── [5] 星の記録（良いときだけ） ─────────────────
console.log('[5] 星の記録');
{
  let b: Record<string, number> = {};
  let r = recordBest(b, '2026-11-16', 1); b = r.best;
  check(r.improved && b['2026-11-16'] === 1, 'はじめての星 1 を入れる');
  r = recordBest(b, '2026-11-16', 3); b = r.best;
  check(r.improved && b['2026-11-16'] === 3, '3 は 良いので 上書き');
  r = recordBest(b, '2026-11-16', 2);
  check(!r.improved && r.best['2026-11-16'] === 3, '2 は 前より わるいので のこさない');
  r = recordBest(b, '2026-11-16', 3);
  check(!r.improved, '同じ星は 上書きしない');
  let many: Record<string, number> = {};
  for (let w = 2900; w < 2920; w++) many = recordBest(many, weekStartOfIndex(w), 1).best;
  check(Object.keys(many).length === KEEP_WEEKS && many[weekStartOfIndex(2919)] === 1, `のこすのは 新しい ${KEEP_WEEKS}週だけ`);
  const s = sanitizeExpedition({ best: { '2026-11-16': 9, x: 1, '2026-11-09': -2 }, pending: { weekStart: 'bad', stars: 1 }, claimed: ['2026-11-09', '2026-11-09', 5] });
  check(s.best['2026-11-16'] === 3 && s.best['2026-11-09'] === 0 && !('x' in s.best) && s.pending === null && s.claimed.length === 1, 'こわれたセーブを なおす（星は 0〜3・知らない鍵は すてる）');
}

// ── [6] 結果を入れる・送る（おためしは 送らない） ─────────────────
console.log('[6] 結果を入れる・送る');
{
  const W = weekStartOf(Date.now());
  const calls: { fn: string; body: Record<string, unknown> }[] = [];
  let server: { week: string; size: number; stars: Record<string, number>; others: number } = { week: W, size: 30, stars: {}, others: 44 };
  const fakeRpc = async <T,>(fn: string, body: unknown) => {
    const b = body as Record<string, unknown>;
    calls.push({ fn, body: b });
    if (fn === 'catwars_expedition_put') {
      const id = String(b.p_student_id); const s = Number(b.p_stars);
      server.stars[id] = Math.max(server.stars[id] ?? -1, s);
      return { ok: true as const, data: { week: server.week, stars: server.stars[id], improved: true } as T };
    }
    if (fn === 'catwars_expedition_class') {
      const id = String(b.p_student_id);
      const total = server.others + Object.values(server.stars).reduce((a, x) => a + Math.max(0, x), 0);
      const goal = Math.ceil(server.size * 1.5);
      return { ok: true as const, data: { size: server.size, weeks: [{ week: server.week, total, goal, achieved: total >= goal, me: server.stars[id] ?? null }] } as T };
    }
    return { ok: false as const, message: '404' };
  };
  useExpeditionStore.getState().reset();
  const gold0 = usePlayerStore.getState().resources.gold;
  const c0 = useCollectionStore.getState().coins;

  // おためし（名乗っていない）：端末には のこるが 送らない
  let who: string | null = null;
  const asWho = () => who;
  __setExpeditionRpc(fakeRpc, asWho);
  check(!expeditionNamed(), 'おためし：学級の星に 入らない');
  check(settleExpedition({ battleId: 'b1', weekStart: W, win: true, gold: 300, stars: 2, perfect: 6 }), 'おためしの勝ち：入れる');
  check(!settleExpedition({ battleId: 'b1', weekStart: W, win: true, gold: 300, stars: 2, perfect: 6 }), '同じ出撃の2回目は 入れない');
  check(usePlayerStore.getState().resources.gold === gold0 + 300, '勝ちの 💠 は 1回だけ');
  check(useExpeditionStore.getState().best[W] === 2 && useExpeditionStore.getState().pending === null, 'おためし：自分の星は のこる・送る星は 無い');
  await flushExpedition();
  check(calls.length === 0, 'おためし：サーバに 何も送らない');

  // 名乗っている
  useExpeditionStore.getState().reset();
  who = 'stu-a';
  check(expeditionNamed(), '名乗っている：学級の星に入る');
  check(settleExpedition({ battleId: 'b2', weekStart: W, win: false, gold: 0, perfect: 0 }) && useExpeditionStore.getState().best[W] === undefined, 'まちがえずに といた問題が 0 の戦いは 記録しない（放置で ごほうびに ならない）');
  settleExpedition({ battleId: 'b3', weekStart: W, win: false, gold: 0, perfect: 3 });
  await new Promise((r) => setTimeout(r, 0));
  check(useExpeditionStore.getState().best[W] === 0, '負けても まちがえずに といたら「ちょうせん」（星0）を のこす');
  check(calls.some((c) => c.fn === 'catwars_expedition_put' && c.body.p_stars === 0 && c.body.p_student_id === 'stu-a'), '星0 を 送る（学級の ごほうびの しるし）');
  settleExpedition({ battleId: 'b4', weekStart: W, win: true, gold: 300, stars: 3, perfect: 9 });
  await new Promise((r) => setTimeout(r, 10));
  check(server.stars['stu-a'] === 3 && useExpeditionStore.getState().pending === null, 'もっと良い星（3）を 送って とどいたら 消す');
  const n = calls.filter((c) => c.fn === 'catwars_expedition_put').length;
  settleExpedition({ battleId: 'b5', weekStart: W, win: true, gold: 300, stars: 1, perfect: 2 });
  await flushExpedition();
  check(calls.filter((c) => c.fn === 'catwars_expedition_put').length === n && useExpeditionStore.getState().best[W] === 3, 'わるい星（1）は 送らない・3 のまま');
  // 送れなかったら 端末に のこして あとで
  __setExpeditionRpc(async () => ({ ok: false as const, message: 'offline' }), asWho);
  useExpeditionStore.setState({ best: {}, pending: null });
  settleExpedition({ battleId: 'b6', weekStart: W, win: true, gold: 0, stars: 2, perfect: 5 });
  await new Promise((r) => setTimeout(r, 0));
  check(useExpeditionStore.getState().pending?.stars === 2, '通信できない：送る星を のこす');
  __setExpeditionRpc(fakeRpc, asWho);
  check(await flushExpedition(), 'つながったら 送る');
  useExpeditionStore.setState({ pending: { weekStart: '2026-01-05', stars: 3 } });
  const before = calls.length;
  await flushExpedition();
  check(useExpeditionStore.getState().pending === null && calls.length === before, '週が かわった 送れていない星は すてる（前の週には 書けない）');

  // 学級の合計：ほかの子の星は 出さない
  await refreshClassExpedition();
  const d = useClassExpedition.getState().data;
  check(!!d && d.thisWeek.total === 44 + 3 + 0 && d.thisWeek.goal === classGoal(30) && d.thisWeek.me === 3, `学級の合計 ★${d?.thisWeek.total} / ${d?.thisWeek.goal}・自分 ★${d?.thisWeek.me}`);
  check(d !== null && Object.keys(d.thisWeek).sort().join(',') === 'achieved,goal,me,total,weekStart', '画面に わたすのは 合計・目標・達成・自分の星だけ（ほかの子の星は 持たない）');
  check(parseClassExpedition({ size: 3, weeks: [{ week: W, total: 5, goal: 5, achieved: true, me: null, rows: [{ n: 1, stars: 3 }] }] })?.thisWeek && !('rows' in parseClassExpedition({ size: 3, weeks: [{ week: W, total: 5, goal: 5, achieved: true, me: null, rows: [1] }] })!.thisWeek), 'サーバが よぶんな列を 返しても すてる');

  // ごほうび：達成 かつ ちょうせんした子だけ・1週に1回
  check(d?.thisWeek.achieved === true && useClassExpedition.getState().reward === EXPEDITION_GOAL_COINS && useCollectionStore.getState().coins === c0 + EXPEDITION_GOAL_COINS, `目標 たっせい：ちょうせんした子に 🪙${EXPEDITION_GOAL_COINS}（読んだときに もらった）`);
  await refreshClassExpedition();
  check(useClassExpedition.getState().reward === EXPEDITION_GOAL_COINS, 'もう一度 読んでも 2回目は もらわない');
  check(claimGoalRewards({ size: 30, thisWeek: { weekStart: '2026-11-02', total: 50, goal: 45, achieved: true, me: null }, lastWeek: null }) === 0, 'ちょうせんしていない子（me が null）は もらわない');
  check(claimGoalRewards({ size: 30, thisWeek: { weekStart: '2026-10-26', total: 40, goal: 45, achieved: false, me: 3 }, lastWeek: null }) === 0, '目標に とどかない週は もらわない');
  check(claimGoalRewards({ size: 30, thisWeek: { weekStart: '2026-10-19', total: 50, goal: 45, achieved: true, me: 0 }, lastWeek: null, sample: true }) === 0, 'デモの 見本では もらわない');
  check(useExpeditionStore.getState().claimed.includes(W), 'もらった週は セーブに のこす（別の端末でも 2回目は無い）');

  // セーブに入る
  const bundle = exportBundle();
  check(!!bundle.stores.expedition, `サーバのセーブ（saveBundle）に 遠征の記録が入る（${measureBundle(bundle).byStore.expedition} バイト）`);
  useExpeditionStore.getState().reset();
  importBundle(bundle);
  const saved = (bundle.stores.expedition as { best: Record<string, number> }).best[W];
  check(saved !== undefined && useExpeditionStore.getState().best[W] === saved && useExpeditionStore.getState().claimed.includes(W), 'セーブから もどせる');
  check(SAVE_KEYS.expedition === 'catwars-expedition-v1', 'セーブの鍵は saveKeys.ts に');
  __setExpeditionRpc(null);
}

console.log(fails ? `\n✗ ${fails} 件 失敗` : '\n✓ 遠征の試験は ぜんぶ通った');
process.exit(fails ? 1 : 0);

// ── バランス（BALANCE=1） ─────────────────
async function balance(): Promise<void> {
  const RUNS = Number(process.env.RUNS ?? 4);
  const LEVELS = (process.env.LV ?? '1,6,12,24,40,60').split(',').map(Number);
  const MAXSEC = Number(process.env.MAXSEC ?? 300);
  const ONLY = (process.env.CH ?? '').split(',').filter(Boolean).map(Number);
  const W0 = 2900;
  const combos = new Map<string, number>();
  for (let w = W0; w < W0 + MAP_ORDER.length * EXPEDITION_RULES.length; w++) {
    const e = expeditionForWeek(w);
    if (ONLY.length && !ONLY.includes(e.chapter.no)) continue;
    const k = `${e.chapter.no}:${e.rule.id}`;
    if (!combos.has(k)) combos.set(k, w);
  }
  console.log(`遠征のバランス（戦場×ルール ${combos.size}・レベル ${LEVELS.join('/')}・各 ${RUNS}回）`);
  console.log('ふ＝ふつう に＝にがて と＝とかない（勝った数）・ふつうが勝つまでに解いた問題の平均');
  let nosolveWins = 0; let normalWins = 0; let normalRuns = 0; let probSum = 0; let probN = 0;
  const weakCells: string[] = [];
  const byLevel: Record<number, [number, number]> = {};
  for (const [k, w] of [...combos].sort()) {
    const line: string[] = [k.padEnd(9)];
    let comboWins = 0, comboRuns = 0;
    for (const lv of LEVELS) {
      // Lv1〜3 の子は はじめの3系統だけ
      const lo = lv <= 3 ? { ...loadoutForLevel(lv, chapterNoForLevel(lv)), formation: ['barbarian', 'archer', 'giant'] } : undefined;
      let n = 0, wk = 0, ns = 0, prob = 0;
      for (let r = 0; r < RUNS; r++) {
        const a = playExpedition(w, lv, seedFor(r), { skill: NORMAL_SKILL, loadout: lo, maxSeconds: MAXSEC });
        if (a.win) { n++; prob += a.problems; }
        if (playExpedition(w, lv, seedFor(r), { skill: WEAK_SKILL, loadout: lo, maxSeconds: MAXSEC }).win) wk++;
        if (playExpedition(w, lv, seedFor(r), { skill: NO_SOLVE_SKILL, loadout: lo, maxSeconds: MAXSEC }).win) ns++;
      }
      nosolveWins += ns; normalWins += n; normalRuns += RUNS; probSum += prob; probN += n; comboWins += n; comboRuns += RUNS;
      byLevel[lv] = [(byLevel[lv]?.[0] ?? 0) + n, (byLevel[lv]?.[1] ?? 0) + RUNS];
      line.push(`Lv${lv} ふ${n}に${wk}と${ns}${n ? ` ${(prob / n).toFixed(0)}問` : ''}`);
    }
    if (comboWins / comboRuns < 0.5) weakCells.push(k);
    console.log(line.join(' | '));
  }
  const rate = normalWins / Math.max(1, normalRuns);
  const avgProb = probSum / Math.max(1, probN);
  console.log('\nレベルごとの「ふつう」の勝率：' + Object.entries(byLevel).map(([lv, [w, n]]) => `Lv${lv} ${Math.round((w / n) * 100)}%`).join('・'));
  check(nosolveWins === 0, `「とかない」は どの遠征・どのレベルでも勝てない（勝った ${nosolveWins}回）`);
  check(rate >= 0.85, `「ふつう」の勝率 ${Math.round(rate * 100)}%（85% いじょう）`);
  check(weakCells.length === 0, `「ふつう」が 半分も勝てない 戦場×ルール が無い${weakCells.length ? `（${weakCells.join('・')}）` : ''}`);
  check(avgProb <= 18, `「ふつう」が勝つまでに解いた問題 平均 ${avgProb.toFixed(1)}問（18問いか）`);
}
