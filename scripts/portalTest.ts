/**
 * 学級ポータルの つなぎ（CW-5a・CW-5b）の試験。  npm run test:portal
 * サーバの関数は ぜんぶ 差しかえる（本番のサーバには 何も送らない）。
 *
 *   [1] 関門：おためし・つないでいないビルドは スタミナを使わない
 *   [2] 関門：たりない → 出撃できない・やさしい案内（責めない）
 *   [3] 関門：同じ eventId で 二重に引かない（通信が切れた→やりなおし・2回おし・通ったら次は新しい id）
 *   [4] 関門：ことわられたとき（先生が閉じた・じゅぎょうの じかん・番号ごとの停止・とちゅうで閉じた・通信できない）
 *   [5] 町のえらび方（出撃メンバーの系統の単元・町のスタミナが いちばん多い・同じなら 1回の数が少ない）と reason
 *   [6] セーブの入れかえ（学級 ↔ おためし で まざらない）・体験版のタブ
 *   [7] セーブの鍵は1か所（persist のある ストアの鍵が SAVE_KEYS と同じ）
 *   [8] saveBundle：1つの JSON に まとめて もどす（往復で同じ）・大きさ
 *   [9] かけらの入口（サーバ → 端末）
 *  [10] 記録の形（app_id は catwars・detail なし・カタログ catwars の項目だけ・module_id はカタログの町）
 *  [11] 鍵 catwars（はじめ閉じる・開ける・平日モード・番号ごとの停止）
 *  [12] 遊んでいる とちゅうで閉じる（ホームに もどす・やさしい1行）
 *  [13] 記録の送信（名乗り／おためし／ことわられたあとの送りなおし／二重に送らない／直近500件）
 *  [14] セーブを サーバに（往復・新しい方が勝つ・2台・おためしは送らない・大きさ・読みなおし／取りこんだ直後は 送らない）
 *  [15] 戦闘の結果は 勝ち負けが決まった瞬間に1回だけ（💠・章クリア・★・連敗。ボタンを押さずに 読みなおしても のこる・二重に入らない）
 *  [16] SOLO/DUO（kit の PlayModeGate）は 出さない（名乗ったら JoinGate の かわりに AppAccessGate だけ）
 *  [17] 体験版（項目の開け閉め・送らない）は scripts/portalTrialTest.ts（体験のタブを はじめから つくるため 別の試験）
 *  [18] デモモード（0000・0）：入る・出る・セーブが3つに分かれる・送らない・関門がスタミナを使わない・鍵を見ない・中身（章・段・かけら・💠・Lv）
 */
import { memLocal, MemStorage } from './lib/memStorage';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { modeLockMessage, isModeOpen, sanmonBattleCost, type SanmonModes, type SanmonStatus } from 'learning-app-kit/sanmon';
import { createSortieGate, closedWhilePlayingMessage, lockMessage, OFFLINE_MESSAGE, STUDENT_LOCK_MESSAGE, type GateDeps } from '../catwars/portal/gate';
import { candidateTowns, pickSortieTown, sortieStamina } from '../catwars/portal/stamina';
const sortieCost = sanmonBattleCost;
import { CATWARS_MODE_KEY, CATWARS_SPEND_REASON } from '../catwars/portal/config';
import { ensureProfile, activeProfile, stashKey, ACTIVE_KEY, trialOnClassDeviceFor } from '../catwars/portal/saveProfile';
import { SAVE_KEYS, SAVE_KEY_LIST, STORE_IDS, NON_STORE_KEYS } from '../catwars/portal/saveKeys';
import { STORES, exportBundle, importBundle, measureBundle, SAVE_BUNDLE_TARGET_BYTES } from '../catwars/portal/saveBundle';
import { setServerShards, unitShards, localShards, familyShards, MAX_SHARDS } from '../catwars/learn/shards';
import { buildPortalLog, sendAnswerToPortal, catalogTownOf, CATWARS_APP_ID, CATWARS_LABEL_PREFIX, PORTAL_SEND_ENABLED, grantStudyReward } from '../catwars/bridge';
import { createAnswerSync, ANSWER_WAIT_MS } from '../catwars/portal/answerSync';
import { readOutbox, OUTBOX_MAX } from '../catwars/portal/outbox';
import { createSaveSync, saveHash } from '../catwars/portal/saveSync';
import { settleBattle } from '../catwars/utils/settleBattle';
import { usePlayerStore } from '../catwars/store/usePlayerStore';
import { SAVED_AT_KEY, isProfileKey } from '../catwars/portal/saveProfile';
import { flushEvents, getSentMark, getStudent, type LogLike } from 'learning-app-kit/sync';
import { CATALOGS } from 'learning-app-kit/catalog';
import { useProgressStore } from '../catwars/store/useProgressStore';
import { PACK_UNITS, unitSkillIds } from '../catwars/learn/gradePack';
import { useCampaignStore } from '../catwars/store/useCampaignStore';
import { useCollectionStore } from '../catwars/store/useCollectionStore';
import { useBaseStore } from '../catwars/store/useBaseStore';
import { useStudyStore } from '../catwars/store/useStudyStore';
import { CAMPAIGN, assistLevelForLosses } from '../catwars/data/campaign';
import { BuildingType } from '../catwars/types';
import { enterDemoWith, exitDemoWith, profileFor, trialOnDemoDeviceFor, DEMO_KEY, isDemo } from '../catwars/portal/saveProfile';
import { seedDemoOnce, DEMO_CREDITS, DEMO_LEVEL, DEMO_SEEDED_KEY } from '../catwars/portal/demo';
import { applyDemoShards } from '../catwars/portal/demo';
import { setServerShards as setShards0 } from '../catwars/learn/shards';
import { useArmyStore } from '../catwars/store/useArmyStore';
import { CHARACTERS } from '../catwars/data/characters';
import { shardsFromServer } from '../catwars/learn/shards';

let fails = 0;
let bundleBytes = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };

/** 先生が CAT-WARS を開けた学級 */
const OPEN: SanmonModes = { catwars: true };

/** にせの サーバ（sanmon_spend と同じ きまり：同じ eventId は 1回だけ・たりなければ使わない・閉じていたら ことわる） */
function fakeServer(opt: { common: number; towns?: Record<string, number>; modes?: SanmonModes; offline?: boolean }) {
  const st = { common: opt.common, towns: { ...(opt.towns ?? {}) }, modes: opt.modes ?? OPEN, offline: !!opt.offline };
  const spent = new Map<string, number>();
  const calls: { eventId: string; amount: number; reason: string }[] = [];
  let ids = 0;
  const deps: GateDeps = {
    configured: () => true,
    studentId: () => 'stu-1',
    newEventId: () => `ev-${++ids}`,
    spend: async (_sid, eventId, amount, reason) => {
      calls.push({ eventId, amount, reason });
      if (st.offline) return { ok: false, stamina: null, message: 'ネットに つながっていないようです' };
      if (!isModeOpen(st.modes, 'catwars')) return { ok: false, stamina: null, message: 'よみこめませんでした (400)' };
      if (spent.has(eventId)) return { ok: true, stamina: st.common };
      const town = reason.includes('@') ? reason.split('@')[1] : null;
      const here = town ? st.towns[town] ?? 0 : 0;
      if (here + st.common < amount) return { ok: false, stamina: st.common };
      const fromTown = Math.min(here, amount);
      if (town) st.towns[town] = here - fromTown;
      st.common -= amount - fromTown;
      spent.set(eventId, amount);
      return { ok: true, stamina: st.common };
    },
    fetchModes: async () => (st.offline ? { ok: false, message: 'x' } : { ok: true, modes: st.modes }),
  };
  return { st, spent, calls, deps };
}
const status = (common: number, towns: Record<string, number> = {}, apps: SanmonStatus['apps'] = {}): SanmonStatus =>
  ({ stamina: common, towns, earnedToday: 0, apps });

// ── [1] ──
console.log('[1] おためし・つないでいないビルド');
{
  const f = fakeServer({ common: 0 });
  const g1 = createSortieGate({ ...f.deps, studentId: () => null });
  const r1 = await g1.startBattle({ formation: ['magic'], status: null, modes: null });
  check(r1.ok === true && r1.spent === false, 'おためし（名乗っていない）は 通す・スタミナは つかわない');
  const g2 = createSortieGate({ ...f.deps, configured: () => false });
  const r2 = await g2.startBattle({ formation: ['magic'], status: null, modes: null });
  check(r2.ok === true && r2.spent === false, 'つないでいないビルドは 通す');
  check(f.calls.length === 0, 'サーバに 1回も 聞かない');
}

// ── [2] ──
console.log('[2] たりない');
{
  const f = fakeServer({ common: 2, towns: { fraction: 1 } });
  const g = createSortieGate(f.deps);
  const r = await g.startBattle({ formation: ['magic'], status: status(2, { fraction: 1 }), modes: OPEN });
  check(r.ok === false && r.kind === 'stamina', 'たりないと 出撃できない');
  const msg = r.ok === false ? r.message : '';
  check(/単元アプリで れんしゅうすると たまるよ/.test(msg), `やさしい案内：「${msg}」`);
  check(!/だめ|ざんねん|なまけ|ダメ/.test(msg), '責める ことばが ない');
  check(f.st.common === 2 && f.st.towns.fraction === 1, 'スタミナは へっていない');
}

// ── [3] ──
console.log('[3] 同じ eventId で 二重に引かない');
{
  const f = fakeServer({ common: 20, offline: true });
  const g = createSortieGate(f.deps);
  const input = { formation: ['giant'], status: status(20), modes: OPEN };
  const r1 = await g.startBattle(input);
  check(r1.ok === false && r1.kind === 'offline' && r1.message === OFFLINE_MESSAGE, '通信できない → 出撃しない（SANMON と同じ）');
  const id1 = g.pendingEventId();
  f.st.offline = false;
  const r2 = await g.startBattle(input);
  check(r2.ok === true && r2.spent === true && r2.eventId === id1, 'やりなおしは 同じ eventId');
  check(f.st.common === 15, `1回ぶんだけ へる（20 → ${f.st.common}）`);
  // 送りなおし（とどいたのに 返事が 消えた）でも へらない：同じ id を もう一度
  const again = await f.deps.spend('stu-1', id1!, 5, 'catwars');
  check(again.ok === true && f.st.common === 15, 'サーバに 同じ eventId が もう一度 とどいても へらない');
  // 2回おし
  const [a, b] = await Promise.all([g.startBattle(input), g.startBattle(input)]);
  check(a === b && f.st.common === 10, `同時に 2回おしても 1回ぶん（${f.st.common}）`);
  check(a.ok === true && a.spent === true && a.eventId !== id1, '通ったら 次の出撃は 新しい eventId');
  check(g.pendingEventId() === null, '通ったあとは 待っている eventId が ない');
}

// ── [4] ──
console.log('[4] ことわられたとき');
{
  const f = fakeServer({ common: 50 });
  const g = createSortieGate(f.deps);
  const closed: SanmonModes = { catwars: false };
  const r1 = await g.startBattle({ formation: ['magic'], status: status(50), modes: closed });
  check(r1.ok === false && r1.kind === 'mode' && r1.message === modeLockMessage(closed, CATWARS_MODE_KEY), `先生が閉じた：「${r1.ok === false ? r1.message : ''}」`);
  check(f.calls.length === 0, '分かっている「閉じている」は サーバに 聞かない（スタミナも へらない）');
  const school: SanmonModes = { catwars: false, _school_hours: { enabled: true, active: true, start: '08:00', end: '15:30', modes: ['catwars'], base: { catwars: true } } };
  const r2 = await g.startBattle({ formation: ['magic'], status: status(50), modes: school });
  check(r2.ok === false && /15:30から あそべるよ/.test(r2.message), `平日モード：「${r2.ok === false ? r2.message : ''}」`);
  const locked = { catwars: false, _student_lock: true } as SanmonModes;
  const r3 = await g.startBattle({ formation: ['magic'], status: status(50), modes: locked });
  check(r3.ok === false && r3.message === STUDENT_LOCK_MESSAGE, '番号ごとの停止：「せんせいと おはなししてね」（理由は出さない）');
  // 画面は 開いていると思っていたが、サーバで閉じていた（とちゅうで閉じた）
  f.st.modes = closed;
  const r4 = await g.startBattle({ formation: ['magic'], status: status(50), modes: OPEN });
  check(r4.ok === false && r4.kind === 'mode' && !!r4.modes && r4.modes.catwars === false, 'サーバに ことわられたら モードを 読みなおして わけを出す');
  check(f.st.common === 50, 'ことわられたら へらない');
}

// ── [5] ──
console.log('[5] 町のえらび方');
{
  check(JSON.stringify(candidateTowns(['magic'])) === JSON.stringify(['decimal', 'fraction']), `魔法系の町：${candidateTowns(['magic']).join(',')}`);
  check(candidateTowns(['boss_titan']).length === PACK_UNITS.length, 'パックに無い系統（ボス）は ぜんぶの単元');
  check(pickSortieTown(['magic', 'giant'], status(0, { fraction: 12, decimal: 3, div1: 30 })) === 'div1', '町のスタミナが いちばん多い町（div1＝30）');
  check(pickSortieTown(['magic'], status(9, {})) === 'decimal', 'どの町も 0 なら 学習の順で先（同じ数・同じ1回）');
  // 同じ町のスタミナなら 1回の数が少ない町（分数を ぜんぶ熟達＝2）
  const fracSkills = unitSkillIds('fraction');
  const st = status(9, { fraction: 4, decimal: 4 }, { bunsuu4: { mastered: fracSkills, tests: {}, trial: 0, solo_days: 0 } });
  check(sortieCost(st, 'fraction') === 2 && sortieCost(st, 'decimal') === 5, `達成度で 1回の数（分数 ${sortieCost(st, 'fraction')}・小数 ${sortieCost(st, 'decimal')}）`);
  check(pickSortieTown(['magic'], st) === 'fraction', '同じ町のスタミナなら 1回の数が少ない町');
  const f = fakeServer({ common: 10, towns: { div2: 7 } });
  const g = createSortieGate(f.deps);
  const r = await g.startBattle({ formation: ['giant'], status: status(10, { div2: 7 }), modes: OPEN });
  check(r.ok === true && f.calls[0]?.reason === `${CATWARS_SPEND_REASON}@div2`, `reason は catwars@<町>：${f.calls[0]?.reason}`);
  check(f.calls[0]?.amount === 5 && f.st.towns.div2 === 2 && f.st.common === 10, '町 → 共通 の順（町 7 → 2、共通は そのまま）');
  const ss = sortieStamina(['giant'], status(10, { div2: 7 }));
  check(ss.times === 3 && ss.enough, `あと ${ss.times}回（17 ÷ 5）`);
}

// ── [6] ──
console.log('[6] セーブの入れかえ');
{
  const kv = new MemStorage();
  kv.setItem('lak_student_v1', '{"studentId":"x","number":1}');   // kit の鍵は 入れかえない
  kv.setItem('lak_sanmon_modes_v1', '{}');
  check(ensureProfile('class', kv) === false && kv.getItem(ACTIVE_KEY) === 'class', 'はじめて：いまの中身を その側とみなして 何も動かさない');
  kv.setItem(SAVE_KEYS.player, 'CLASS-PLAYER');
  kv.setItem(SAVE_KEYS.collection, 'CLASS-COL');
  check(ensureProfile('trial', kv) === true, '学級 → おためし：入れかえた');
  check(kv.getItem(SAVE_KEYS.player) === null && kv.getItem(SAVE_KEYS.collection) === null, 'おためしには 学級のセーブが 見えない');
  check(!!kv.getItem(stashKey('class')), '学級のセーブは しまってある');
  check(kv.getItem('lak_student_v1') !== null && kv.getItem('lak_sanmon_modes_v1') === '{}', 'kit の鍵は そのまま');
  kv.setItem(SAVE_KEYS.player, 'TRIAL-PLAYER');
  kv.setItem(SAVE_KEYS.army, 'TRIAL-ARMY');
  check(ensureProfile('class', kv) === true, 'おためし → 学級：入れかえた');
  check(kv.getItem(SAVE_KEYS.player) === 'CLASS-PLAYER' && kv.getItem(SAVE_KEYS.collection) === 'CLASS-COL', '学級のセーブが もどる');
  check(kv.getItem(SAVE_KEYS.army) === null, 'おためしの ネコは 学級に まざらない');
  check(kv.getItem(stashKey('class')) === null && activeProfile(kv) === 'class', 'しまった 学級のセーブは 消した・いまは 学級');
  ensureProfile('trial', kv);
  check(kv.getItem(SAVE_KEYS.player) === 'TRIAL-PLAYER' && kv.getItem(SAVE_KEYS.army) === 'TRIAL-ARMY', 'おためしに もどると おためしの続き');
  check(ensureProfile('trial', kv) === false, '同じ側なら 何もしない');
  check(trialOnClassDeviceFor(true, kv) === false, '体験のタブ：いま おためしの端末なら そのまま あそべる');
  ensureProfile('class', kv);
  check(trialOnClassDeviceFor(true, kv) === true, '体験のタブ：学級コードの入った端末では あそばせない（SANMON と同じ）');
  check(trialOnClassDeviceFor(false, kv) === false, 'ふつうのタブは そのまま');
}

// ── [7] ──
console.log('[7] セーブの鍵は1か所');
{
  for (const id of STORE_IDS) {
    check(STORES[id].persist.getOptions().name === SAVE_KEYS[id], `${id}：${SAVE_KEYS[id]}`);
  }
  check(STORE_IDS.length + NON_STORE_KEYS.length === SAVE_KEY_LIST.length, `ストア ${STORE_IDS.length}＋ストアでない鍵 ${NON_STORE_KEYS.join(',')}`);
  check(isProfileKey(SAVE_KEYS.outbox), '送れていない記録（outbox）も 学級／おためし の入れかえの対象');
  const dir = join(process.cwd(), 'catwars/store');
  let persists = 0;
  for (const f of readdirSync(dir)) {
    const src = readFileSync(join(dir, f), 'utf8');
    persists += (src.match(/\bpersist\(/g) ?? []).length;
    // persist の options に 文字で 鍵を 書いていないか（{ name: '…' } か、name: '…', のあとに merge／partialize など）
    for (const m of src.matchAll(/\{\s*name:\s*'([^']+)'\s*\}|\bname:\s*'([^']+)',\s*\n\s*(?:merge|partialize|version|storage|migrate)\b/g)) {
      check(false, `${f} に 鍵の 書きこみ '${m[1] ?? m[2]}'（SAVE_KEYS を使う）`);
    }
  }
  check(persists === STORE_IDS.length, `persist の ストア ${persists} ＝ STORE_IDS ${STORE_IDS.length}`);
}

// ── [8] ──
console.log('[8] saveBundle');
{
  // ふつうに 4週間くらい あそんだ ようす（まちがえずに 約1500問・全章 3段・施設）
  const units = PACK_UNITS.map((u) => u.key);
  const formation = ['barbarian', 'archer', 'giant', 'magic', 'healer'];
  let n = 0;
  for (let day = 0; day < 28; day++) {
    for (const u of units) for (const sk of unitSkillIds(u).slice(0, 8)) {
      if ((n++ % 3) === 0) continue;
      grantStudyReward(n % 9 !== 0, { unitKey: u, skillId: sk, difficulty: 1 + (n % 5) }, formation);
    }
  }
  for (const ch of CAMPAIGN) for (const tier of ['normal', 'hard', 'extreme'] as const) {
    useCampaignStore.getState().recordAttempt(ch.id, tier);
    useCampaignStore.getState().recordResult(ch.id, true, 3, tier);
  }
  for (let i = 0; i < 30; i++) useCollectionStore.getState().pull(() => (i * 0.37) % 1);
  for (const t of [BuildingType.CANNON, BuildingType.WALL, BuildingType.GOLD_MINE]) {
    try { (useBaseStore.getState() as unknown as { buy?: (t: BuildingType) => void }).buy?.(t); } catch { /* noop */ }
  }
  const b1 = exportBundle(1);
  const json = JSON.stringify(b1);
  const m = measureBundle(b1);
  console.log(`    大きさ：${m.total} バイト（めやす ${SAVE_BUNDLE_TARGET_BYTES}）`);
  for (const [id, sz] of Object.entries(m.byStore).sort((a, b) => b[1] - a[1])) console.log(`      ${id.padEnd(11)} ${sz}`);
  check(Object.keys(b1.stores).length === STORE_IDS.length && !('outbox' in b1.stores), 'ストアは ぜんぶ 入っている（送れていない記録は 入れない）');
  check(!json.includes('"mastery"') && !('mastery' in useProgressStore.getState()), 'progress.mastery は 入っていない（ストアからも消した）');
  check(m.total <= SAVE_BUNDLE_TARGET_BYTES, `4週間で めやす以下（${m.total} ≦ ${SAVE_BUNDLE_TARGET_BYTES}）`);
  bundleBytes = m.total;
  const before = JSON.stringify(exportBundle(1).stores);
  // ぜんぶ 消してから もどす
  for (const id of STORE_IDS) (STORES[id].getState() as { reset?: () => void }).reset?.();
  check(JSON.stringify(exportBundle(1).stores) !== before, '消すと ちがう');
  check(importBundle(JSON.parse(json)) === true, 'JSON から もどせた');
  check(JSON.stringify(exportBundle(1).stores) === before, '往復で 同じ');
  check(useStudyStore.getState().perfect && Object.keys(useStudyStore.getState().perfect).length > 0, '学習の記録も もどった');
  check(importBundle(null) === false && importBundle({ v: 99, stores: {} }) === false, 'こわれた・知らない版は もどさない');
  const broken = JSON.parse(json);
  broken.stores.collection = { coins: 'たくさん', cap: 5 };
  broken.stores.study = { perfect: 'x' };
  check(importBundle(broken) === true && typeof useCollectionStore.getState().coins === 'number'
    && typeof useStudyStore.getState().perfect === 'object', 'こわれた値は すてて 落ちない');
  if (m.total > SAVE_BUNDLE_TARGET_BYTES) console.log(`    ※ めやすを こえた（いちばん大きいのは ${Object.entries(m.byStore).sort((a, b) => b[1] - a[1])[0][0]}）`);
}

// ── [9] ──
console.log('[9] かけらの入口');
{
  const perfect: Record<string, number> = {};
  for (const sk of unitSkillIds('fraction')) perfect[`fraction/${sk}`] = 3;
  setServerShards(null);
  check(unitShards('fraction', perfect) === MAX_SHARDS && unitShards('fraction', perfect) === localShards('fraction', perfect), 'おためし：端末の数え方');
  setServerShards({ fraction: 3, decimal: 5 });
  check(unitShards('fraction', perfect) === 3, '名乗っているとき：サーバの かけら（端末で たくさん といても 3）');
  check(familyShards('magic', perfect) === 4, `系統は 平均（(3+5)/2＝${familyShards('magic', perfect)}）`);
  setServerShards({ fraction: 99 });
  check(unitShards('fraction') === MAX_SHARDS && unitShards('area') === 0, '8より多くは ならない・無い単元は 0');
  setServerShards(null);
}

// ── [10] ──
console.log('[10] 記録の形');
{
  const fracSkill = unitSkillIds('fraction')[0];
  const log = buildPortalLog({ unitKey: 'fraction', skillId: fracSkill, perfect: false, label: '分数の しくみ', missType: '分母と分子', missAnswer: '3/4', ts: 1000 })!;
  check(CATWARS_APP_ID === 'catwars', 'app_id は catwars（単元アプリの app_id では送らない）');
  check(!!log && log.skillId === fracSkill && log.moduleId === 'fraction', 'skill_id は 単元アプリのまま・module_id は 町');
  check(!!log.label?.startsWith(CATWARS_LABEL_PREFIX) && /\[bunsuu4\]/.test(log.label ?? ''), `label：${log.label}`);
  check(log.correct === false && log.mistakes === 1 && log.missType === '分母と分子' && log.missAnswer === '3/4', '正誤・最初のまちがいの型と答え');
  check(!('detail' in log), 'detail は 付けない（sync_events が 本番テストと まちがえるため）');
  const ok = buildPortalLog({ unitKey: 'fraction', skillId: fracSkill, perfect: true, ts: 1001 })!;
  check(ok.missType === undefined && ok.mistakes === 0, '正解の行に まちがいの型は 付けない');
  check(PORTAL_SEND_ENABLED === true, 'CW-5b から 送る（PORTAL_SEND_ENABLED＝true）');
  check(buildPortalLog({ unitKey: 'fraction', skillId: 'no-such-skill', perfect: true, ts: 2 }) === null, 'カタログ catwars に無い skill_id は 送らない');
  // 戦闘で出す項目は ぜんぶ カタログ catwars に ある・module_id は カタログの町
  const cat = CATALOGS.catwars;
  const inCatalog = new Set(cat.modules.flatMap((m) => m.skills.map((x) => x.skill_id)));
  let all = 0, missing = 0, moved = 0;
  for (const u of PACK_UNITS) for (const sk of unitSkillIds(u.key)) {
    all++;
    if (!inCatalog.has(sk)) { missing++; continue; }
    const town = catalogTownOf(sk)!;
    if (!cat.modules.find((m) => m.module_id === town)?.skills.some((x) => x.skill_id === sk)) missing++;
    if (town !== u.key) moved++;
  }
  check(missing === 0, `戦闘で出す項目 ${all} は ぜんぶ カタログ catwars に ある（無い ${missing}）`);
  console.log(`    戦闘の単元と カタログの町が ちがう項目（共有の項目）：${moved}`);
  check(sendAnswerToPortal({ unitKey: 'fraction', skillId: fracSkill, perfect: true, ts: 1 }) === null, 'つないでいない・おためしは のこしも しない');
}

// ── [11] ──
console.log('[11] 鍵 catwars');
{
  check(CATWARS_MODE_KEY === 'catwars', 'CAT-WARS 専用の鍵 catwars');
  check(lockMessage({}) === '先生が まだ ひらいていないよ' && lockMessage(null) === '先生が まだ ひらいていないよ', 'はじめは閉じている（サーバが まだ catwars を返さない・読めていない）');
  check(lockMessage({ adventure: true }) !== null, 'SANMON の ぼうけんが 開いていても 閉じている（鍵が ちがう）');
  check(lockMessage({ catwars: true }) === null && lockMessage({ catwars: true, adventure: false }) === null, '先生が開けると 出撃できる（ぼうけんが 閉じていても）');
  const sh = { enabled: true, active: true, start: '08:00', end: '15:30', modes: ['catwars' as const] };
  check(/15:30から あそべるよ/.test(lockMessage({ catwars: false, _school_hours: { ...sh, base: { catwars: true } } }) ?? ''), '平日モード：じゅぎょうの じかん（15:30から）');
  check(lockMessage({ catwars: false, _school_hours: { ...sh, base: { catwars: false } } }) === '先生が まだ ひらいていないよ', '平日モードでも 先生が まだなら「先生が まだ」');
  check(lockMessage({ catwars: false, _student_lock: true } as SanmonModes) === STUDENT_LOCK_MESSAGE, '番号ごとの停止');
}

// ── [12] ──
console.log('[12] とちゅうで閉じる');
{
  check(closedWhilePlayingMessage({ catwars: true }) === null, '開いているあいだは つづける');
  const sh = { enabled: true, active: true, start: '08:00', end: '15:30', modes: ['catwars' as const], base: { catwars: true } };
  const m1 = closedWhilePlayingMessage({ catwars: false, _school_hours: sh }) ?? '';
  check(/じゅぎょうの じかんに なったよ/.test(m1) && /15:30から/.test(m1), `平日モードの時間に なった：「${m1}」`);
  const m2 = closedWhilePlayingMessage({ catwars: false }) ?? '';
  check(/とじたよ/.test(m2) && /また こんど/.test(m2), `先生が閉じた：「${m2}」`);
  check(closedWhilePlayingMessage({ catwars: false, _student_lock: true } as SanmonModes) === STUDENT_LOCK_MESSAGE, '番号ごとの停止は「せんせいと おはなししてね」');
  check(![m1, m2].some((x) => /だめ|ダメ|なまけ|ざんねん/.test(x)), '責める ことばが ない');
  // CatWars.tsx が とちゅうの画面で これを見て ホームに もどすこと（コードの形を見る）
  const src = readFileSync(join(process.cwd(), 'catwars/components/CatWars.tsx'), 'utf8');
  check(/playingLock\(portalModes\)/.test(src) && /'battle'\]\.includes\(view\)/.test(src) && /setView\('home'\)/.test(src), 'CatWars.tsx：戦闘・出撃の準備の とちゅうで閉じたら ホームへ');
}

// ── [13] ──
console.log('[13] 記録の送信');
{
  // にせの サーバ（sync_events）：kit の flushEvents を そのまま使い、fetch だけ 差しかえる
  const server = { reject: true, rows: new Map<string, unknown>(), calls: 0 };
  const g = globalThis as unknown as { fetch: unknown };
  const realFetch = g.fetch;
  g.fetch = async (_url: string, init: { body: string }) => {
    server.calls++;
    const body = JSON.parse(init.body) as { p_app_id: string; p_events: { event_id: string }[] };
    if (server.reject) return { ok: false, status: 400, text: async () => '未登録の app_id です' };
    let n = 0;
    for (const e of body.p_events) if (!server.rows.has(e.event_id)) { server.rows.set(e.event_id, { ...e, app: body.p_app_id }); n++; }
    return { ok: true, status: 200, text: async () => String(n) };
  };
  memLocal.setItem('lak_student_v1', JSON.stringify({ studentId: 'stu-1', joinCode: 'ABC', number: 3 }));
  let student: string | null = 'stu-1';
  const timers: (() => void)[] = [];
  const PUSH = { appId: 'catwars', supabaseUrl: 'http://fake.invalid', supabaseKey: 'x' };
  const sync = createAnswerSync({
    configured: () => true,
    studentId: () => student,
    flush: (logs: LogLike[]) => flushEvents(PUSH, logs),
    setTimer: (fn) => { timers.push(fn); return timers.length; },
    clearTimer: () => { /* noop */ },
  });
  const runTimers = async () => { while (timers.length) { timers.shift()!(); await new Promise((r) => setTimeout(r, 0)); } await new Promise((r) => setTimeout(r, 0)); };
  const sk = unitSkillIds('fraction');
  const mk = (i: number) => buildPortalLog({ unitKey: 'fraction', skillId: sk[i % sk.length], perfect: i % 4 !== 0, ts: 10_000 + i })!;

  // おためし：のこさない・送らない
  student = null;
  check(sync.queue(mk(0)) === false && readOutbox().length === 0 && timers.length === 0, 'おためし（名乗っていない）は のこさない・送らない');
  student = 'stu-1';
  // 1問ごとには 通信しない：3問 解いても 待ちは1つ
  for (let i = 1; i <= 3; i++) sync.queue(mk(i));
  check(timers.length === 1 && server.calls === 0, `1問ごとには 送らない（${ANSWER_WAIT_MS / 1000}秒 まとめて）`);
  // ことわられる（apps に catwars が まだ無い サーバ）
  await runTimers();
  check(server.calls === 1 && server.rows.size === 0, 'サーバに ことわられた（SQL を流す前）');
  check(readOutbox().length === 3 && getSentMark('catwars') === 0, '送れなかった分は 端末に のこる・送れたところは 進まない');
  // そのあいだも 遊べる（もう1問）→ 次の機会に まとめて送りなおす
  sync.queue(mk(4));
  server.reject = false;
  await runTimers();
  check(server.rows.size === 4, `あとで 送りなおせた（${server.rows.size}件）`);
  check([...server.rows.values()].every((r) => (r as { app: string }).app === 'catwars' && !('detail' in (r as object))), 'app_id catwars・detail なし');
  const callsBefore = server.calls;
  // 二重に送らない：もう一度 送っても 何も送らない（kit の 送れたところ）
  await sync.flushNow();
  check(server.calls === callsBefore && server.rows.size === 4, '送れた分は もう送らない');
  // 同時に 2回 頼んでも 1回ずつ
  sync.queue(mk(5));
  await Promise.all([sync.flushNow(), sync.flushNow()]);
  check(server.rows.size === 5 && server.calls === callsBefore + 1, `同時に頼んでも 二重に送らない（${server.calls - callsBefore}回）`);
  // 番号を変えた：前の子の記録は 次の子として送らない
  student = 'stu-2';
  sync.queue(mk(6));
  await sync.flushNow();
  const last = [...server.rows.values()].pop() as { ts: number };
  check(server.rows.size === 6 && last.ts === 10_006, 'ちがう番号の子の記録は まざらない');
  // 直近500件まで
  for (let i = 0; i < OUTBOX_MAX + 20; i++) sync.queue(mk(100 + i));
  check(readOutbox().length === OUTBOX_MAX, `端末に のこすのは 直近 ${OUTBOX_MAX}件`);
  timers.length = 0;
  memLocal.removeItem(SAVE_KEYS.outbox);
  g.fetch = realFetch;
}

// ── [14] ──
console.log('[14] セーブを サーバに');
{
  const kv = new MemStorage();
  let remote: Record<string, unknown> | null = null;
  let saves = 0;
  let clock = 1_000_000;
  let student: string | null = 'stu-1';
  // 2台の端末（同じ子）：それぞれの セーブを もつ
  const mkDevice = (state: { stores: Record<string, unknown> }, kvx: MemStorage) => createSaveSync({
    configured: () => true,
    studentId: () => student,
    load: async () => ({ ok: true, data: remote }),
    save: async (_id, data) => { saves++; remote = JSON.parse(JSON.stringify(data)); return true; },
    exportBundle: (now) => ({ v: 1, savedAt: now, stores: JSON.parse(JSON.stringify(state.stores)) }),
    importBundle: (raw) => { state.stores = JSON.parse(JSON.stringify((raw as { stores: Record<string, unknown> }).stores)); return true; },
    store: () => kvx,
    now: () => clock,
  });
  const devA = { stores: { player: { gold: 100 } } as Record<string, unknown> };
  const devB = { stores: {} as Record<string, unknown> };
  const kvB = new MemStorage();
  const A = mkDevice(devA, kv);
  const B = mkDevice(devB, kvB);
  student = null;
  check(await A.pushSave() === false && saves === 0 && await A.pullSaveIfNewer() === false, 'おためし・体験版は 送らない・取りこまない');
  student = 'stu-1';
  check(await A.pushSave() === true && saves === 1, 'A：送った');
  check(Number(kv.getItem(SAVED_AT_KEY)) === clock, 'A：送った時刻を 覚える（catwars_portal_saved_at）');
  check(await A.pushSave() === false && saves === 1, 'A：中身が変わっていなければ 送らない');
  // 端末を変えて名乗った（B は はじめて）→ A の つづき
  clock += 1000;
  check(await B.pullSaveIfNewer() === true && JSON.stringify(devB.stores) === JSON.stringify(devA.stores), 'B：名乗ったら A の つづきを 取りこむ');
  check(await B.pushSave() === false, 'B：取りこんだ中身は 送りかえさない');
  // B で遊んで 送る → A が タブに もどると B の方が新しい
  devB.stores = { player: { gold: 300 } };
  clock += 1000;
  await B.pushSave();
  check(await A.pullSaveIfNewer() === true && (devA.stores.player as { gold: number }).gold === 300, '新しい方が勝つ：A は B の つづきを 取りこむ');
  check(await A.pullSaveIfNewer() === false, '同じ セーブは もう取りこまない');
  // A で遊んで 送る（最後に送った方が勝つ）→ B は 古いので 取りこむ
  devA.stores = { player: { gold: 350 } };
  clock += 1000;
  await A.pushSave();
  devB.stores = { player: { gold: 999 } };   // B は 送るまえ（まだ サーバに とどいていない分）
  check(await B.pullSaveIfNewer() === true && (devB.stores.player as { gold: number }).gold === 350, '2台で同時：最後に送った方（A）が勝つ。B の 送っていない分は なくなる');
  // サーバの方が古い（時刻）なら 取りこまない
  kv.setItem(SAVED_AT_KEY, String(clock + 99999));
  check(await A.pullSaveIfNewer() === false, 'この端末の方が新しければ 取りこまない');
  // 知らない版・こわれたもの
  remote = { v: 99, savedAt: clock + 999999, stores: {} };
  check(await A.pullSaveIfNewer() === false, '知らない版は 取りこまない');
  remote = null;
  check(await B.pullSaveIfNewer() === false, 'サーバに まだ無い（はじめて）なら 何もしない');
  check(bundleBytes > 0 && bundleBytes <= 6 * 1024, `大きさ：4週間で ${bundleBytes} バイト（めやす 6KB 以下・サーバは 64KB まで）`);

  // 送りなおしを へらす（2026-11-16）：最後に送った／取りこんだ中身の目印を 端末に のこす
  const kvC = new MemStorage();
  const devC = { stores: { player: { gold: 10 } } as Record<string, unknown> };
  remote = null; saves = 0; student = 'stu-1';
  check(await mkDevice(devC, kvC).pushSave() === true && saves === 1, 'C：送った');
  check(!!kvC.getItem(SAVE_KEYS.sentHash), `目印を 端末に のこす（${SAVE_KEYS.sentHash}）`);
  clock += 1000;
  check(await mkDevice(devC, kvC).pushSave() === false && saves === 1, 'アプリを 読みなおしても（メモリが空でも）同じ中身なら 送らない');
  devC.stores = { player: { gold: 11 } };
  check(await mkDevice(devC, kvC).pushSave() === true && saves === 2, '中身が変わったら 送る');
  // 別の端末 D で サーバのセーブを取りこむ → 読みなおしても 送りかえさない
  const kvD = new MemStorage();
  const devD = { stores: {} as Record<string, unknown> };
  clock += 1000;
  check(await mkDevice(devD, kvD).pullSaveIfNewer() === true, 'D：取りこんだ');
  check(await mkDevice(devD, kvD).pushSave() === false && saves === 2, 'D：取りこんだ直後（読みなおしたあと）に 同じ中身を 送りかえさない');
  check(saveHash({ a: 1 }) === saveHash({ a: 1 }) && saveHash({ a: 1 }) !== saveHash({ a: 2 }), '目印：同じ中身は 同じ・ちがえば ちがう');
  check(isProfileKey(SAVE_KEYS.sentHash), '目印も 学級／おためし の入れかえの対象');

  // 本物の ストア：取りこんで 読みなおした（persist から もどした）あとも 目印が かわらない
  {
    const kvR = new MemStorage();
    remote = exportBundle(clock + 5000) as unknown as Record<string, unknown>;
    saves = 0;
    const real = createSaveSync({
      configured: () => true, studentId: () => 'stu-1',
      load: async () => ({ ok: true, data: remote }),
      save: async () => { saves++; return true; },
      exportBundle, importBundle, store: () => kvR, now: () => clock,
    });
    check(await real.pullSaveIfNewer() === true, '本物のストア：取りこんだ');
    for (const id of STORE_IDS) if (id !== 'collection') await (STORES[id].persist as unknown as { rehydrate: () => Promise<void> }).rehydrate();
    check(await real.pushSave() === false && saves === 0, '本物のストア：読みなおしても 送りかえさない');
  }
}

// ── [15] ──
console.log('[15] 戦闘の結果は 決まった瞬間に1回だけ');
{
  const ch = CAMPAIGN[0];
  useCampaignStore.getState().reset();
  usePlayerStore.getState().addResources(0);
  const gold0 = usePlayerStore.getState().resources.gold;
  const reload = async () => { await useCampaignStore.persist.rehydrate(); await usePlayerStore.persist.rehydrate(); };
  // 勝った → 戦闘の おわり（BattleScene の useEffect）で 入れる。ボタンは押さずに 読みなおす
  check(settleBattle({ battleId: 'b1', chapterId: ch.id, tier: 'normal', win: true, gold: 300, stars: 2 }) === true, '勝ち：決まった瞬間に入れた');
  await reload();
  check(usePlayerStore.getState().resources.gold === gold0 + 300, `ボタンを押さずに 読みなおしても 💠 が のこる（${gold0} → ${usePlayerStore.getState().resources.gold}）`);
  check(useCampaignStore.getState().clearedChapters.includes(ch.id) && useCampaignStore.getState().starsFor(ch.id, 'normal') === 2, '章クリア・★ も のこる');
  // StrictMode の2回実行・ボタン（handleEndBattle も settle を呼ぶ）・連打
  for (let i = 0; i < 3; i++) settleBattle({ battleId: 'b1', chapterId: ch.id, tier: 'normal', win: true, gold: 300, stars: 3 });
  check(usePlayerStore.getState().resources.gold === gold0 + 300 && useCampaignStore.getState().starsFor(ch.id, 'normal') === 2, '同じ戦闘は 二重に入らない（2回実行・ボタン・連打）');
  // 負け：連敗の数（サポートモードの判定）も 決まった瞬間に のこる
  settleBattle({ battleId: 'b2', chapterId: ch.id, tier: 'hard', win: false, gold: 0 });
  settleBattle({ battleId: 'b2', chapterId: ch.id, tier: 'hard', win: false, gold: 0 });
  settleBattle({ battleId: 'b3', chapterId: ch.id, tier: 'hard', win: false, gold: 999 });
  await reload();
  check(useCampaignStore.getState().lossStreak[`${ch.id}:hard`] === 2, `負け：連敗の数が のこる・二重に数えない（${useCampaignStore.getState().lossStreak[`${ch.id}:hard`]}）`);
  check(usePlayerStore.getState().resources.gold === gold0 + 300, '負けは 💠 なし');
  check(useCampaignStore.getState().assistLevelFor(ch.id, 'hard') === assistLevelForLosses(2), 'サポートモードの判定は のこった 連敗の数から');
  // 勝つと 連敗は 0 に
  settleBattle({ battleId: 'b4', chapterId: ch.id, tier: 'hard', win: true, gold: 50, stars: 1 });
  check(useCampaignStore.getState().lossStreak[`${ch.id}:hard`] === 0 && useCampaignStore.getState().isTierCleared(ch.id, 'hard'), '勝つと 連敗 0・その段クリア');
  check(settleBattle({ battleId: '', chapterId: ch.id, tier: 'normal', win: true, gold: 1 }) === false, 'id の無い戦闘は 入れない');
  // ソース：結果画面のボタンは 閉じるだけ（💠 を足すのは settleBattle だけ）
  const cw = readFileSync(join(process.cwd(), 'catwars/components/CatWars.tsx'), 'utf8');
  const bs = readFileSync(join(process.cwd(), 'catwars/components/game/BattleScene.tsx'), 'utf8');
  check(!/addResources\(/.test(cw) && !/recordResult\(/.test(cw), 'CatWars.tsx は 💠・章の記録を 直接 入れない（settleBattle だけ）');
  check(/onSettle\?\.\(win/.test(bs), 'BattleScene は 勝ち負けが決まった useEffect で onSettle を呼ぶ');
}

// ── [16] ──
console.log('[16] SOLO/DUO は 出さない');
{
  const idx = readFileSync(join(process.cwd(), 'index.tsx'), 'utf8');
  const gate = readFileSync(join(process.cwd(), 'catwars/portal/PortalGate.tsx'), 'utf8');
  check(!/<JoinGate\b/.test(idx) && /<PortalGate\s*\/>/.test(idx), 'index.tsx は JoinGate を じかに 出さない（PortalGate を通す）');
  check(/named && !isTrial\(\)\) return isPortalConfigured \? <AppAccessGate/.test(gate), '名乗っているときは AppAccessGate だけ（PlayModeGate の SOLO/DUO を出さない）');
  check(/<JoinGate config=\{PORTAL\} chip=\{false\}[^>]*\/>/.test(gate), '名乗っていないときは JoinGate（右下の入口なし）');
  check(/forceSolo\(\)/.test(gate), '前に DUO を選んでいた端末は SOLO に もどす');
  check(!/PlayModeGate/.test(idx) && !/<PlayModeGate/.test(gate), 'PlayModeGate を どこにも 出さない');
}

// ── [18] ──
console.log('[18] デモモード（0000・0）');
{
  // 入る：学級コードが入っていたら消す・デモのセーブに入れかえて 読みなおす
  const kv = new MemStorage();
  ensureProfile('class', kv);
  kv.setItem(SAVE_KEYS.player, 'CLASS-PLAYER');
  let reloads = 0;
  let cleared = 0;
  enterDemoWith(kv, () => { reloads++; }, () => true, () => { cleared++; });
  check(kv.getItem(DEMO_KEY) === '1' && activeProfile(kv) === 'demo', '入る：しるしを付けて デモの側へ');
  check(cleared === 1 && reloads === 1, '入る：名乗りを消して（記録が送られないように）読みなおす');
  check(kv.getItem(SAVE_KEYS.player) === null && !!kv.getItem(stashKey('class')), '学級のセーブは しまってある（デモには 見えない）');
  kv.setItem(SAVE_KEYS.player, 'DEMO-PLAYER');
  // 出る：おためしの側へ（デモのセーブは しまう）
  exitDemoWith(kv, () => { reloads++; }, () => false);
  check(kv.getItem(DEMO_KEY) === null && activeProfile(kv) === 'trial' && reloads === 2, '出る：しるしを消して おためしの側へ・読みなおす');
  check(kv.getItem(SAVE_KEYS.player) === null && !!kv.getItem(stashKey('demo')) && !!kv.getItem(stashKey('class')), 'セーブは3つ（学級・おためし・デモ）に分かれて まざらない');
  kv.setItem(SAVE_KEYS.player, 'TRIAL-PLAYER');
  enterDemoWith(kv, () => {}, () => false, () => { cleared++; });
  check(kv.getItem(SAVE_KEYS.player) === 'DEMO-PLAYER' && cleared === 1, 'もう一度 入ると デモの続き（名乗っていなければ 消さない）');
  ensureProfile('class', kv);
  check(kv.getItem(SAVE_KEYS.player) === 'CLASS-PLAYER', '学級に もどると 学級のセーブ（デモで さわっていない）');
  check(profileFor(false, true) === 'demo' && profileFor(true, true) === 'class' && profileFor(false, false) === 'trial', 'profileFor：名乗っていれば 学級・デモは 名乗っていないときだけ');
  // 体験のタブ × デモの端末
  const kv2 = new MemStorage();
  ensureProfile('trial', kv2);
  enterDemoWith(kv2, () => {}, () => false, () => {});
  check(trialOnDemoDeviceFor(true, kv2) === true && trialOnDemoDeviceFor(false, kv2) === false, '体験のタブ：デモの端末では あそばせない（デモのセーブを守る）');

  // 関門：デモは名乗らないので スタミナを使わない・モードの鍵を見ない（先生が閉じていても）
  const f = fakeServer({ common: 0, modes: { catwars: false } });
  const g = createSortieGate({ ...f.deps, studentId: () => null });
  const r = await g.startBattle({ formation: ['magic'], status: null, modes: { catwars: false, _student_lock: true } as SanmonModes });
  check(r.ok === true && r.spent === false && f.calls.length === 0, '関門：スタミナを使わず 通す・サーバに 聞かない（鍵・平日モード・番号ごとの停止を見ない）');

  // 送らない：名乗っていない（デモ）ときは 記録を作らない・セーブを送らない
  memLocal.removeItem('lak_student_v1');
  memLocal.setItem(DEMO_KEY, '1');
  memLocal.setItem(ACTIVE_KEY, 'demo');
  check(isDemo() === true, 'デモ中（しるし＋ふつうのタブ）');
  // デモに入ると 名乗りは消える（enterDemo が clearStudent）→ 記録・セーブを送る相手が いない
  check(getStudent() === null, 'デモ中は 名乗っていない（getStudent が null）');
  const sent: string[] = [];
  const as = createAnswerSync({
    configured: () => true,
    studentId: () => getStudent()?.studentId ?? null,
    flush: async () => { sent.push('flush'); return { ok: true }; },
    store: () => memLocal,
    setTimer: (fn) => { fn(); return 1; },
    clearTimer: () => { /* noop */ },
  });
  as.queue(buildPortalLog({ unitKey: 'fraction', skillId: unitSkillIds('fraction')[0], perfect: true, ts: 1 })!);
  await as.flushNow();
  const ss = createSaveSync({
    configured: () => true,
    studentId: () => getStudent()?.studentId ?? null,
    load: async () => { sent.push('load'); return { ok: true, data: null }; },
    save: async () => { sent.push('save'); return true; },
    exportBundle, importBundle, store: () => memLocal,
  });
  await ss.pushSave();
  await ss.pullSaveIfNewer();
  check(sent.length === 0, `記録も セーブも サーバに 送らない・読まない（${sent.length} 回）`);

  // 中身：全部の章と3つの段・かけら 8・💠9999・Lv20（デモのセーブにだけ）
  check(CAMPAIGN.every((c) => useCampaignStore.getState().isUnlocked(c.id) && useCampaignStore.getState().isTierUnlocked(c.id, 'extreme')), '全部の章と 3つの段（げきむず まで）を えらべる');
  memLocal.removeItem(DEMO_KEY);
  const last = CAMPAIGN[CAMPAIGN.length - 1].id;
  check(!useCampaignStore.getState().isTierUnlocked(last, 'extreme'), 'デモでなければ 今までどおり（最後の章の げきむず は 閉じている）');
  memLocal.setItem(DEMO_KEY, '1');
  check(applyDemoShards() === true, 'デモ：かけらを入れる');
  check(PACK_UNITS.every((u) => unitShards(u.key) === MAX_SHARDS), 'かけら：全単元 8（名乗らないので サーバの かけらの かわりに）');
  check(familyShards('magic') === MAX_SHARDS, '系統の かけらも 8（スキルが ぜんぶ 開いて見える）');
  memLocal.removeItem(DEMO_SEEDED_KEY);
  usePlayerStore.setState((st) => ({ resources: { ...st.resources, gold: 120 } }));
  useArmyStore.setState((st) => ({ army: Object.fromEntries(Object.keys(st.army).map((k) => [k, { level: 3, xp: 5, totalBattles: 0 }])) }));
  check(seedDemoOnce(memLocal) === true, 'はじめて入ったとき：中身を入れる');
  check(usePlayerStore.getState().resources.gold === DEMO_CREDITS, `💠 ${DEMO_CREDITS}`);
  check(CHARACTERS.every((c) => useArmyStore.getState().army[c.id]?.level === DEMO_LEVEL), `ネコは 全系統 Lv${DEMO_LEVEL}`);
  usePlayerStore.setState((st) => ({ resources: { ...st.resources, gold: 50 } }));
  check(seedDemoOnce(memLocal) === false && usePlayerStore.getState().resources.gold === 50, '2回目からは 入れない（デモで使った分は そのまま）');
  memLocal.setItem(ACTIVE_KEY, 'trial');
  memLocal.removeItem(DEMO_SEEDED_KEY);
  check(seedDemoOnce(memLocal) === false, 'デモの側でなければ（学級・おためし）入れない');
  memLocal.removeItem(DEMO_KEY);
  check(isDemo() === false && profileFor(false) === 'trial', 'しるしを消せば ふつう');
  check(applyDemoShards() === false, 'デモでなければ かけらを入れない');
  setShards0(null);
  check(!shardsFromServer(), 'かけらは 端末の数え方に もどる');
  memLocal.setItem(ACTIVE_KEY, 'class');

  // 画面のつなぎ（ソースを見る）
  const gate = readFileSync(join(process.cwd(), 'catwars/portal/PortalGate.tsx'), 'utf8');
  const card = readFileSync(join(process.cwd(), 'catwars/portal/PortalCard.tsx'), 'utf8');
  const idx = readFileSync(join(process.cwd(), 'index.tsx'), 'utf8');
  const up = readFileSync(join(process.cwd(), 'catwars/portal/usePortal.ts'), 'utf8');
  check(/if \(!applyDemoShards\(\)\) setServerShards\(null\)/.test(up) && /seedDemoOnce\(\);/.test(up), '名乗っていないとき：デモなら かけら 8（refreshPortal）・はじめに中身を入れる（usePortalLifecycle）');
  check(/const playLock = playingLock/.test(readFileSync(join(process.cwd(), 'catwars/components/CatWars.tsx'), 'utf8')) && /usePortalStore\.getState\(\)\.student \? closedWhilePlayingMessage/.test(up), 'とちゅうで閉じる・出撃の🔒 は 名乗っている子だけ（デモは 鍵を見ない）');
  check(/allowWithout=\{isDemo\}/.test(gate) && /onDemo=\{enterDemo\}/.test(gate), '「ログイン必須」でも デモは入れる（JoinGate の allowWithout={isDemo}・onDemo）');
  check(/JoinSettingsRow config=\{PORTAL\} onDemo=\{enterDemo\}/.test(card) && /exitDemo/.test(card), 'ホーム：0000・0 で デモに入る・「デモを おわる」');
  check(/isDemo\(\) && \(/.test(idx) && /DEMO ・ きろくは おくられません/.test(idx), '画面の左上に DEMO');
}

void memLocal;
console.log(fails === 0 ? '\nぜんぶ 合格' : `\n${fails} こ 不合格`);
process.exit(fails === 0 ? 0 : 1);
