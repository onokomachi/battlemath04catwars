/**
 * 学級ポータルの つなぎ（CW-5a）の試験。  npm run test:portal
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
 *  [10] 記録の形（送るのは止めてある・app_id は catwars・detail なし）
 */
import { memLocal, MemStorage } from './lib/memStorage';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { modeLockMessage, type SanmonModes, type SanmonStatus } from 'learning-app-kit/sanmon';
import { createSortieGate, OFFLINE_MESSAGE, STUDENT_LOCK_MESSAGE, type GateDeps } from '../catwars/portal/gate';
import { candidateTowns, pickSortieTown, sortieCost, sortieStamina } from '../catwars/portal/stamina';
import { CATWARS_MODE_KEY, CATWARS_SPEND_REASON } from '../catwars/portal/config';
import { ensureProfile, activeProfile, stashKey, ACTIVE_KEY, trialOnClassDeviceFor } from '../catwars/portal/saveProfile';
import { SAVE_KEYS, SAVE_KEY_LIST, type SaveStoreId } from '../catwars/portal/saveKeys';
import { STORES, exportBundle, importBundle, measureBundle, SAVE_BUNDLE_TARGET_BYTES } from '../catwars/portal/saveBundle';
import { setServerShards, unitShards, localShards, familyShards, MAX_SHARDS } from '../catwars/learn/shards';
import { buildPortalLog, sendAnswerToPortal, CATWARS_APP_ID, CATWARS_LABEL_PREFIX, PORTAL_SEND_ENABLED, grantStudyReward } from '../catwars/bridge';
import { PACK_UNITS, unitSkillIds } from '../catwars/learn/gradePack';
import { useCampaignStore } from '../catwars/store/useCampaignStore';
import { useCollectionStore } from '../catwars/store/useCollectionStore';
import { useBaseStore } from '../catwars/store/useBaseStore';
import { useStudyStore } from '../catwars/store/useStudyStore';
import { CAMPAIGN } from '../catwars/data/campaign';
import { BuildingType } from '../catwars/types';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };

/** にせの サーバ（sanmon_spend と同じ きまり：同じ eventId は 1回だけ・たりなければ使わない・閉じていたら ことわる） */
function fakeServer(opt: { common: number; towns?: Record<string, number>; modes?: SanmonModes; offline?: boolean }) {
  const st = { common: opt.common, towns: { ...(opt.towns ?? {}) }, modes: opt.modes ?? {}, offline: !!opt.offline };
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
      if (st.modes.adventure === false) return { ok: false, stamina: null, message: 'よみこめませんでした (400)' };
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
  const r = await g.startBattle({ formation: ['magic'], status: status(2, { fraction: 1 }), modes: {} });
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
  const input = { formation: ['giant'], status: status(20), modes: {} };
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
  const closed: SanmonModes = { adventure: false };
  const r1 = await g.startBattle({ formation: ['magic'], status: status(50), modes: closed });
  check(r1.ok === false && r1.kind === 'mode' && r1.message === modeLockMessage(closed, CATWARS_MODE_KEY), `先生が閉じた：「${r1.ok === false ? r1.message : ''}」`);
  check(f.calls.length === 0, '分かっている「閉じている」は サーバに 聞かない（スタミナも へらない）');
  const school: SanmonModes = { adventure: false, _school_hours: { enabled: true, active: true, start: '08:00', end: '15:30', modes: ['adventure'] } };
  const r2 = await g.startBattle({ formation: ['magic'], status: status(50), modes: school });
  check(r2.ok === false && /15:30から あそべるよ/.test(r2.message), `平日モード：「${r2.ok === false ? r2.message : ''}」`);
  const locked = { adventure: false, _student_lock: true } as SanmonModes;
  const r3 = await g.startBattle({ formation: ['magic'], status: status(50), modes: locked });
  check(r3.ok === false && r3.message === STUDENT_LOCK_MESSAGE, '番号ごとの停止：「せんせいと おはなししてね」（理由は出さない）');
  // 画面は 開いていると思っていたが、サーバで閉じていた（とちゅうで閉じた）
  f.st.modes = closed;
  const r4 = await g.startBattle({ formation: ['magic'], status: status(50), modes: {} });
  check(r4.ok === false && r4.kind === 'mode' && !!r4.modes && r4.modes.adventure === false, 'サーバに ことわられたら モードを 読みなおして わけを出す');
  check(f.st.common === 50, 'ことわられたら へらない');
  check(CATWARS_MODE_KEY === 'adventure', 'いまは ぼうけん（adventure）の鍵に したがう（CW-5b で catwars に）');
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
  const r = await g.startBattle({ formation: ['giant'], status: status(10, { div2: 7 }), modes: {} });
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
  for (const id of Object.keys(SAVE_KEYS) as SaveStoreId[]) {
    check(STORES[id].persist.getOptions().name === SAVE_KEYS[id], `${id}：${SAVE_KEYS[id]}`);
  }
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
  check(persists === SAVE_KEY_LIST.length, `persist の ストア ${persists} ＝ SAVE_KEYS ${SAVE_KEY_LIST.length}`);
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
  check(Object.keys(b1.stores).length === SAVE_KEY_LIST.length, 'ストアは ぜんぶ 入っている');
  const before = JSON.stringify(exportBundle(1).stores);
  // ぜんぶ 消してから もどす
  for (const id of Object.keys(STORES) as SaveStoreId[]) (STORES[id].getState() as { reset?: () => void }).reset?.();
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
  const log = buildPortalLog({ unitKey: 'fraction', skillId: 'frac-1', perfect: false, label: '分数の しくみ', missType: '分母と分子', missAnswer: '3/4', ts: 1000 });
  check(CATWARS_APP_ID === 'catwars', 'app_id は catwars（単元アプリの app_id では送らない）');
  check(log.skillId === 'frac-1' && log.moduleId === 'fraction', 'skill_id は 単元アプリのまま・module_id は 町');
  check(!!log.label?.startsWith(CATWARS_LABEL_PREFIX) && /\[bunsuu4\]/.test(log.label ?? ''), `label：${log.label}`);
  check(log.correct === false && log.mistakes === 1 && log.missType === '分母と分子' && log.missAnswer === '3/4', '正誤・最初のまちがいの型と答え');
  check(!('detail' in log), 'detail は 付けない（sync_events が 本番テストと まちがえるため）');
  const ok = buildPortalLog({ unitKey: 'fraction', skillId: 'frac-1', perfect: true, ts: 1001 });
  check(ok.missType === undefined && ok.mistakes === 0, '正解の行に まちがいの型は 付けない');
  check(PORTAL_SEND_ENABLED === false, 'CW-5a では 送らない（PORTAL_SEND_ENABLED＝false）');
  check(sendAnswerToPortal({ unitKey: 'fraction', skillId: 'frac-1', perfect: true, ts: 1 }) === null, 'つないでいない・おためしは 組み立ても しない');
}

void memLocal;
console.log(fails === 0 ? '\nぜんぶ 合格' : `\n${fails} こ 不合格`);
process.exit(fails === 0 ? 0 : 1);
