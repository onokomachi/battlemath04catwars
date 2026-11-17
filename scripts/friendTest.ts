/**
 * なかまの 基地に いく（CW-6b・2026-11-17）の試験。
 *
 *   npm run test:friend            … 基地の形・大きさの上限・見なおし・送り方・相手3つ・戦場と敵の基地・難易度の合わせ方・sim の決定性・星と 💠・安全（数十秒。npm run check に入れた）
 *   npm run test:friend:balance    … みほん6つ＋はしの基地2つ＋でたらめの基地2つ × 戦場5つ × 手持ちのレベル で「とかない」が 0%・「ふつう」が勝てる（約6分。RUNS=5 WEAK=1 で ふやせる。結果は OUT=ファイル にも書く）
 *
 * サーバは ぜんぶ 差しかえる（本番のサーバには 何も送らない）。サーバの SQL（PRISM supabase/sql/2026-11-17-catwars-base*.sql）の
 * ふるまい（同じ学級だけ・自分は入れない・日ごとに決まる）は、SQL の試験用ファイル（…base.dryrun.sql）で見る。ここは 端末の側。
 */
import './lib/memStorage';
import fs from 'node:fs';
import { BuildingType, BASE_MAX_W, GRID_H, GRID_W } from '../catwars/types';
import { BUILDING_STATS } from '../catwars/constants';
import { FACILITY_MAX_COUNT } from '../catwars/data/facilities';
import { BATTLE_MAPS } from '../catwars/data/battleMaps';
import { CAMPAIGN, BARRACKS_ONLY_UNITS } from '../catwars/data/campaign';
import {
  encodeFriendBase, sanitizeFriendBase, shareable, wireBytes, placeOnMap, firepower, baseFirepower, rightSideClear,
  FRIEND_BASE_MAX_BYTES, MIN_CANNONS, MIN_CAMPS, type FriendBase, type FriendBaseWire,
} from '../catwars/friend/baseShape';
import { SAMPLE_BASES, sampleBase } from '../catwars/friend/samples';
import {
  FRIEND_MAPS, FRIEND_SLOTS, FRIEND_ATTACK_CREDITS, FIRE_MIN, FIRE_MAX, buildTargets, mapChapterNo, friendSetup, fireFactor,
  friendThreatMult, jstDateOf, dayIndexOf, type FriendTarget,
} from '../catwars/friend/friendAttack';
import { DetRNG } from '../catwars/sim/rng';
import { useBaseStore } from '../catwars/store/useBaseStore';
import { usePlayerStore } from '../catwars/store/usePlayerStore';
import { useFriendStore, recordStars, sanitizeFriend } from '../catwars/store/useFriendStore';
import { useExpeditionStore } from '../catwars/store/useExpeditionStore';
import {
  __setFriendRpc, __setFriendClock, resetShareState, noteLayoutEdited, flushShare, currentShareData, friendNamed,
  loadFriendOffers, parseOffers, useFriendOffers, SHARE_MIN_INTERVAL_MS,
} from '../catwars/portal/friendSync';
import { __setExpeditionRpc } from '../catwars/portal/expeditionSync';
import { settleFriend, friendBonusFor } from '../catwars/utils/settleFriend';
import { exportBundle, measureBundle } from '../catwars/portal/saveBundle';
import { SAVE_KEYS } from '../catwars/portal/saveKeys';
import { catwarsTrialKeyOf } from '../catwars/portal/trialFeatures';
import {
  playFriend, NO_SOLVE_SKILL, NORMAL_SKILL, WEAK_SKILL, seedFor, loadoutForLevel, chapterNoForLevel,
} from './botSim';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };

// ── 試験用の基地 ─────────────────
const T = BuildingType;
const CODE: Record<string, BuildingType> = { T: T.TOWN_HALL, C: T.CANNON, H: T.HIDDEN_TESLA, W: T.WALL, A: T.ARMY_CAMP };

/** でたらめだが 見なおしを とおる基地（シード固定。コア＋まわりに 種類ごとの数まで） */
export function randomBase(seed: number): FriendBaseWire {
  const rng = new DetRNG(seed);
  const used = new Set<string>();
  const b: [string, number, number][] = [];
  const put = (code: string): boolean => {
    const st = BUILDING_STATS[CODE[code]];
    for (let tries = 0; tries < 60; tries++) {
      const x = rng.int(BASE_MAX_W - st.width + 1), y = rng.int(GRID_H - st.height + 1);
      const cells: string[] = [];
      for (let dy = 0; dy < st.height; dy++) for (let dx = 0; dx < st.width; dx++) cells.push(`${x + dx},${y + dy}`);
      if (cells.some((k) => used.has(k))) continue;
      cells.forEach((k) => used.add(k)); b.push([code, x, y]); return true;
    }
    return false;
  };
  put('T');
  const n = (max: number) => 1 + rng.int(max); // 1〜max
  for (const [code, max] of [['C', 4], ['H', 2], ['W', 12], ['A', 2]] as const) for (let i = 0; i < n(max); i++) put(code);
  return { v: 1, b, lv: [1 + rng.int(10), 1 + rng.int(10), 1 + rng.int(10), 1 + rng.int(10)] };
}
/** ぜんぶ 上限・ぜんぶ Lv10 の基地 */
export function maxBase(): FriendBaseWire {
  const b: [string, number, number][] = [['T', 7, 7]];
  [[5, 3], [5, 12], [3, 5], [3, 10]].forEach(([x, y]) => b.push(['C', x, y]));
  [[5, 7], [4, 8]].forEach(([x, y]) => b.push(['H', x, y]));
  for (let y = 3; y < 15; y++) b.push(['W', 9, y]);
  [[1, 1], [1, 13]].forEach(([x, y]) => b.push(['A', x, y]));
  return { v: 1, b, lv: [10, 10, 10, 10] };
}
/** はしの基地：コアと 壁1つだけ（砲台も キャンプも 無い・Lv1） */
export function minBase(): FriendBaseWire { return { v: 1, b: [['T', 4, 7], ['W', 6, 7]], lv: [1, 1, 1, 1] }; }

/** 「実質の火力」の 上限の 試験の目安（バランスの試験で 決めた。基地の 最大 vs 第2章の戦場で いちばん ひらく） */
const EFFECTIVE_FIRE_MAX = 1.6;

const toTarget = (base: FriendBase, chapterNo: number, slot: 'A' | 'B' | 'C' = 'A'): FriendTarget => ({ slot, sample: true, label: 'しけん', base, chapterNo });

if (process.env.BALANCE === '1') {
  await balance();
  process.exit(fails ? 1 : 0);
}

// ── [1] 基地の形・大きさの上限 ─────────────────
console.log('[1] 基地の形・大きさの上限');
{
  const layout = [
    { type: T.TOWN_HALL, x: 6, y: 7 }, { type: T.CANNON, x: 4, y: 5 }, { type: T.WALL, x: 8, y: 6 }, { type: T.HIDDEN_TESLA, x: 3, y: 9 }, { type: T.ARMY_CAMP, x: 1, y: 1 },
  ];
  const lvl = (t: BuildingType) => ({ [T.TOWN_HALL]: 3, [T.CANNON]: 4, [T.HIDDEN_TESLA]: 2, [T.WALL]: 5 } as Record<string, number>)[t] ?? 1;
  const w = encodeFriendBase(layout, lvl)!;
  check(w.b.length === 5 && w.b[0][0] === 'T' && JSON.stringify(w.lv) === '[3,4,2,5]', `ゲームの型（種類・x・y）と レベルを そのまま 小さな JSON に（${wireBytes(w)}バイト）`);
  const back = sanitizeFriendBase(JSON.parse(JSON.stringify(w)))!;
  check(back.buildings.length === 5 && back.buildings.every((b, i) => b.type === layout[i].type && b.x === layout[i].x && b.y === layout[i].y) && back.levels[T.CANNON] === 4, '送って 受けとっても 同じ（ゲームの今の型にもどる）');
  const mx = encodeFriendBase(sanitizeFriendBase(maxBase())!.buildings, () => 10)!;
  check(sanitizeFriendBase(maxBase())!.buildings.length === 1 + 4 + 2 + 12 + 2, '持てる数の上限（コア1・砲台4・電撃2・壁12・キャンプ2）の基地も 見なおしを とおる');
  check(wireBytes(mx) <= FRIEND_BASE_MAX_BYTES && wireBytes(mx) < 600, `いちばん大きい基地でも ${wireBytes(mx)}バイト（上限 ${FRIEND_BASE_MAX_BYTES}・めやす 2KB の 3割いか）`);
  check(!shareable(encodeFriendBase([{ type: T.TOWN_HALL, x: 6, y: 7 }], () => 1)), 'コアのほかに 何も おいていない基地は 見せない');
  check(encodeFriendBase([{ type: T.CANNON, x: 4, y: 5 }], () => 1) === null, 'コアが無い配置は 送れない');
  check(!shareable({ ...mx, b: [...mx.b, ...Array.from({ length: 800 }, () => ['W', 9, 9] as [string, number, number])] }), '2KB を こえる JSON は 見せられない');

  // サーバから来る形は 信用しない
  const base: FriendBaseWire = { v: 1, b: [['T', 4, 7], ['C', 6, 5]], lv: [1, 1, 1, 1] };
  const bad: Record<string, unknown> = {
    'コアが無い': { ...base, b: [['C', 6, 5]] }, 'v が ちがう': { ...base, v: 2 }, 'b が 配列でない': { ...base, b: 'x' },
    '40こ こえ': { ...base, b: Array.from({ length: 41 }, (_, i) => ['W', i % 10, 0]) }, 'null': null, '数': 5, '空': {},
  };
  check(Object.entries(bad).every(([, v]) => sanitizeFriendBase(v) === null), `こわれた形は ぜんぶ ことわる（${Object.keys(bad).join('・')}）`);
  const dirty = sanitizeFriendBase({
    v: 1, evil: { studentId: 'x' }, lv: [99, -3, 'a', 4.5, 7],
    b: [['T', 4, 7], ['T', 0, 0], ['C', 1, 1], ['C', 2, 2], ['C', 3, 3], ['C', 4, 4], ['C', 5, 4], ['Z', 1, 1], ['W', 10, 3], ['W', 3, 16], ['W', -1, 3], ['W', 1.5, 3], ['W', '3', 3],
      ['W', 4, 7], ['W', 5, 7], ['H', 8, 15], ['A', 8, 14], ['A', 9, 0], { x: 1 }, ['W', 2]],
  })!;
  const cnt = (t: BuildingType) => dirty.buildings.filter((b) => b.type === t).length;
  check(cnt(T.TOWN_HALL) === 1 && cnt(T.CANNON) === 4, 'コアは 1つ・砲台は 4つまで（ふやした分は すてる）');
  check(!dirty.buildings.some((b) => b.x > 9 || b.y > 15 || b.x < 0 || b.y < 0 || !Number.isInteger(b.x)), 'ゾーンの外（x>9・y>15・ふの数・小数・文字）は すてる');
  check(!dirty.buildings.some((b) => b.type === T.WALL && b.x === 4 && b.y === 7), 'コアに 重なる壁は すてる（重なりは 先のものが のこる）');
  check(dirty.buildings.every((b) => b.y + BUILDING_STATS[b.type].height <= GRID_H && b.x + BUILDING_STATS[b.type].width <= BASE_MAX_W), '大きさ（2×2）が はみ出す置き方は すてる（キャンプ (9,0)・(8,14) など）');
  check(Object.values(dirty.levels).every((v) => Number.isInteger(v) && v >= 1 && v <= 10) && !('evil' in dirty), 'レベルは 1〜10 に ととのえる・知らない鍵は すてる');
}

// ── [2] みほんの 基地 ─────────────────
console.log('[2] みほんの 基地');
{
  let ok = true; const msgs: string[] = [];
  for (const s of SAMPLE_BASES) {
    const b = sanitizeFriendBase(s.wire);
    if (!b || b.buildings.length !== s.wire.b.length) { ok = false; msgs.push(s.id); }
  }
  check(ok, `みほん ${SAMPLE_BASES.length}つ：ぜんぶ 見なおしを とおる・1つも すてられない${msgs.length ? `（だめ：${msgs.join('・')}）` : ''}`);
  check(SAMPLE_BASES.every((s) => shareable(s.wire)), 'みほんは ぜんぶ「見せられる」基地');
  check(new Set(SAMPLE_BASES.map((s) => s.name)).size === SAMPLE_BASES.length, 'みほんの名前は それぞれ ちがう');
}

// ── [3] 戦場・敵の基地 ─────────────────
console.log('[3] 戦場・敵の基地');
{
  check(FRIEND_MAPS.map((m) => CAMPAIGN.find((c) => c.mapId === m.id)!.no).join(',') === '2,4,5,6,8', '戦場は 右はしが ふさがっていない・まもりの施設のある 第2・4・5・6章・8章');
  check(BATTLE_MAPS.filter((m) => !rightSideClear(m)).map((m) => m.id).join(',') === 'map-grassland,map-cliffs', '右はしに 岩・溶岩のある 第3章・第7章は えらばない');
  // でたらめな基地 × 戦場：地形に ふさがれず・重ならず・コアがあり・下限（砲台2・キャンプ1）を まもる
  let blocked = 0, overlap = 0, noCore = 0, floorBad = 0, outside = 0, n = 0;
  const bases: FriendBase[] = [...SAMPLE_BASES.map(sampleBase), sanitizeFriendBase(maxBase())!, sanitizeFriendBase(minBase())!, ...Array.from({ length: 150 }, (_, i) => sanitizeFriendBase(randomBase(500 + i))!)];
  for (const map of FRIEND_MAPS) {
    const rock = new Set(map.terrain.filter((t) => ['WATER', 'ROCK', 'LAVA'].includes(t.type)).map((t) => `${t.x},${t.y}`));
    for (const b of bases) {
      const placed = placeOnMap(map, b);
      n++;
      const seen = new Set<string>();
      for (const p of placed) {
        const st = BUILDING_STATS[p.type];
        if (p.x < 0 || p.y < 0 || p.x + st.width > GRID_W || p.y + st.height > GRID_H) outside++;
        for (let dy = 0; dy < st.height; dy++) for (let dx = 0; dx < st.width; dx++) {
          const k = `${p.x + dx},${p.y + dy}`;
          if (rock.has(k)) blocked++;
          if (seen.has(k)) overlap++;
          seen.add(k);
        }
      }
      if (placed.filter((p) => p.type === T.TOWN_HALL).length !== 1) noCore++;
      if (placed.filter((p) => p.type === T.CANNON).length < MIN_CANNONS || placed.filter((p) => p.type === T.ARMY_CAMP).length < MIN_CAMPS) floorBad++;
    }
  }
  check(blocked === 0 && overlap === 0 && outside === 0, `${n}通り（${bases.length}の基地 × ${FRIEND_MAPS.length}戦場）：水・岩・溶岩に かぶらない・重ならない・盤の外に出ない`);
  check(noCore === 0 && floorBad === 0, '敵の基地には いつも コアが 1つ・砲台 2ついじょう・キャンプ 1つ いじょう（下限）');
  const s = sanitizeFriendBase(SAMPLE_BASES[0].wire)!;
  const m2 = placeOnMap(FRIEND_MAPS[0], s);
  const core = s.buildings.find((b) => b.type === T.TOWN_HALL)!;
  check(m2.some((b) => b.type === T.TOWN_HALL && b.x === GRID_W - core.x - 2 && b.y === core.y), 'なかまの 配置は 左右を 反転して 右に（左が攻める側）。コアの高さは そのまま');
  const before = JSON.stringify(s);
  placeOnMap(FRIEND_MAPS[0], s);
  check(JSON.stringify(s) === before, 'もとの 配置は かえない');
}

// ── [4] その日の 3つ（日ごとに 決まる・みほんで うめる） ─────────────────
console.log('[4] その日の 3つ');
{
  const day = dayIndexOf(Date.parse('2026-11-17T01:00:00Z'));
  const real = [sampleBase(SAMPLE_BASES[0]), sampleBase(SAMPLE_BASES[1])];
  const a = buildTargets(day, real), b = buildTargets(day, real);
  check(JSON.stringify(a) === JSON.stringify(b), '同じ日・同じ あいては 同じ組みあわせ・同じ順');
  check(a.map((t) => t.slot).join('') === 'ABC' && a[0].label === 'なかまの 基地 A' && a[1].label === 'なかまの 基地 B', '枠は A・B・C（ならび順）。名前は「なかまの 基地 A」');
  check(a[2].sample && a[2].label.startsWith('みほん：') && !a[0].sample && !a[1].sample, 'なかまの基地が 2つしか 無い学級は 3つめを「みほん」で うめる（みほんと はっきり出す）');
  const next = buildTargets(day + 1, real);
  check(a.map((t) => t.chapterNo).join() !== next.map((t) => t.chapterNo).join() || a[2].label !== next[2].label, '日が かわると 戦場・みほんが かわる');
  const none = buildTargets(day);
  check(none.every((t) => t.sample) && new Set(none.map((t) => t.label)).size === 3, '名乗っていない：みほんの 3つ（ぜんぶ ちがう）');
  const days = Array.from({ length: 30 }, (_, d) => buildTargets(day + d).map((t) => t.chapterNo));
  check(days.every((d) => d.every((n) => [2, 4, 5, 6, 8].includes(n))) && new Set(days.flat()).size === 5, '戦場は 30日で 5つぜんぶ 出る・第3章・第7章は 出ない');
  check(FRIEND_SLOTS.every((_, i) => mapChapterNo(day, i) === a[i].chapterNo), '戦場は 日と 枠から 決まる（同じ日の同じ枠は 同じ戦場）');
  const keys = Object.keys(a[0]).sort().join(',');
  check(keys === 'base,chapterNo,label,sample,slot', `あいての情報は 枠・名前（A・B・C）・配置・戦場だけ（${keys}）。番号・id を 持たない`);
  check(jstDateOf(Date.parse('2026-11-16T14:59:59Z')) === '2026-11-16' && jstDateOf(Date.parse('2026-11-16T15:00:00Z')) === '2026-11-17', '日づけは 日本時間の 0:00 で かわる');
}

// ── [5] サーバとの やりとり ─────────────────
console.log('[5] サーバ');
{
  interface Call { fn: string; body: Record<string, unknown> }
  const calls: Call[] = [];
  let student: string | null = null;
  let putFails = false;
  let clock = 1_000_000;
  const db: Record<string, unknown> = {};
  const fake = async <R,>(fn: string, body: unknown) => {
    const b = body as Record<string, unknown>;
    calls.push({ fn, body: b });
    if (fn === 'catwars_base_put') {
      if (putFails) return { ok: false as const, message: 'offline' };
      db[String(b.p_student_id)] = b.p_data; return { ok: true as const, data: true as R };
    }
    if (fn === 'catwars_base_offers') {
      // サーバの かわり：見なおしで 落ちる形・よぶんな鍵（id など）を わざと まぜて 返す
      const bad = { v: 1, b: [['C', 1, 1]], lv: [1, 1, 1, 1] };
      const withId = { ...encodeFriendBase([{ type: T.TOWN_HALL, x: 5, y: 7 }, { type: T.CANNON, x: 3, y: 5 }], () => 2), student_id: 'secret-id', number: 7, name: 'x' };
      return { ok: true as const, data: { day: '2026-11-17', bases: [withId, bad, ...Array.from({ length: 5 }, () => withId)] } as R };
    }
    return { ok: false as const, message: '404' };
  };
  __setFriendRpc(fake, () => student);
  __setFriendClock(() => clock);
  __setExpeditionRpc(fake, () => student);
  const base = useBaseStore.getState();
  useBaseStore.setState({ owned: { [T.CANNON]: 2, [T.WALL]: 4 }, levels: { [T.CANNON]: 3 }, layouts: {} });
  base.setLayout('ch4', [{ type: T.TOWN_HALL, x: 6, y: 7 }, { type: T.CANNON, x: 4, y: 5 }, { type: T.WALL, x: 8, y: 6 }]);

  // 名乗っていない（おためし）：送らない
  student = null;
  noteLayoutEdited('ch4');
  check(!(await flushShare()) && calls.length === 0, 'おためし・体験版：基地を 送らない（サーバを 呼ばない）');
  check(!friendNamed(), '名乗っていない：なかまの基地に 入らない');
  await loadFriendOffers();
  check(calls.length === 0 && useFriendOffers.getState().data!.real.length === 0 && useFriendOffers.getState().status === 'ready', 'おためし：なかまの基地を 読まない（みほんだけ）');

  // 名乗っている
  student = 'stu-a';
  check(friendNamed(), '名乗っている：なかまの 基地に 入る');
  noteLayoutEdited('ch4');
  check(await flushShare(), '配置を かえたあと：送る');
  const put = calls.filter((c) => c.fn === 'catwars_base_put');
  check(put.length === 1 && Object.keys(put[0].body).sort().join() === 'p_data,p_student_id' && put[0].body.p_student_id === 'stu-a', '送るのは 自分の id と 基地の配置だけ');
  const sent = put[0].body.p_data as FriendBaseWire;
  check(sent.b.length === 3 && sent.lv[1] === 3 && wireBytes(sent) <= FRIEND_BASE_MAX_BYTES, `配置（施設の種類・位置・レベル）が 入っている・${wireBytes(sent)}バイト`);
  noteLayoutEdited('ch4');
  check(!(await flushShare()) && calls.filter((c) => c.fn === 'catwars_base_put').length === 1, '中身が 同じなら 送らない（かえたときだけ）');
  base.setLayout('ch4', [...useBaseStore.getState().getLayout('ch4'), { type: T.WALL, x: 8, y: 7 }]);
  noteLayoutEdited('ch4');
  clock += 5_000;
  check(!(await flushShare()) && calls.filter((c) => c.fn === 'catwars_base_put').length === 1, `かえても ${SHARE_MIN_INTERVAL_MS / 1000}秒は 間をあける（つづけて 送らない）`);
  clock += SHARE_MIN_INTERVAL_MS;
  check(await flushShare() && calls.filter((c) => c.fn === 'catwars_base_put').length === 2, '間があいたら 送る');
  // 通信できない：のこして あとで
  base.setLayout('ch4', [...useBaseStore.getState().getLayout('ch4'), { type: T.WALL, x: 8, y: 8 }]);
  noteLayoutEdited('ch4'); clock += SHARE_MIN_INTERVAL_MS + 1; putFails = true;
  check(!(await flushShare()), '通信できない：送れない（遊びは止めない）');
  putFails = false; clock += SHARE_MIN_INTERVAL_MS + 1;
  check(await flushShare(), 'つながったら 送る');
  // 配置を かえたあと 別の子が 名乗ったら 前の子の配置は 送らない
  base.setLayout('ch4', [...useBaseStore.getState().getLayout('ch4'), { type: T.WALL, x: 8, y: 9 }]);
  noteLayoutEdited('ch4'); clock += SHARE_MIN_INTERVAL_MS + 1;
  const nPut = calls.filter((c) => c.fn === 'catwars_base_put').length;
  student = 'stu-b';
  check(!(await flushShare()) && calls.filter((c) => c.fn === 'catwars_base_put').length === nPut, '配置を かえたあと 別の子が 名乗ったら 前の子の配置は 送らない（同じ端末で 番号を かえたとき）');
  student = 'stu-a';
  // コアのほかに 何も無い基地は 見せない
  base.setLayout('ch2', [{ type: T.TOWN_HALL, x: 2, y: 7 }]);
  check(currentShareData('ch2') === null, 'コアだけの 配置は 見せない');
  // デモ：送らない
  localStorage.setItem('catwars_demo_v1', '1');
  check(!friendNamed(), 'デモ：名乗らない扱い（送らない・読まない）');
  localStorage.removeItem('catwars_demo_v1');

  // なかまの 基地を 読む：見なおして よぶんな鍵を すてる
  calls.length = 0;
  const o = await loadFriendOffers();
  check(calls.length === 1 && calls[0].fn === 'catwars_base_offers' && Object.keys(calls[0].body).join() === 'p_student_id', '読むとき 送るのは 自分の id だけ');
  check(o.real.length === 3 && o.day === '2026-11-17', `サーバが 返した 7つのうち 形のこわれた1つを とばして 3つまで（${o.real.length}つ）`);
  check(calls.every((c) => ['catwars_base_put', 'catwars_base_offers'].includes(c.fn)) && !calls.some((c) => /attack|battle|result|win/i.test(c.fn)), '呼ぶサーバの関数は「自分の基地を しまう」「なかまの基地を 読む」の 2つだけ。「攻めた」を 伝える関数は 無い');
  check(!JSON.stringify(o).includes('secret-id') && !JSON.stringify(o).includes('student_id') && !('number' in (o.real[0] as object)), '返ってきても id・番号・名前は 持たない');
  check(parseOffers({ day: 'x', bases: [] }) === null && parseOffers(null) === null, 'こわれた返事は 読まない');
  // つながらない：みほんで あそべる
  __setFriendRpc(async () => ({ ok: false as const, message: '(404)' }), () => student);
  const o2 = await loadFriendOffers();
  check(o2.real.length === 0 && useFriendOffers.getState().status === 'error', 'サーバに ことわられても（SQL を流す前）：みほんで あそべる');
  __setFriendRpc(null); __setExpeditionRpc(null); __setFriendClock(null); resetShareState();
}

// ── [6] 敵の強さの 合わせかた（上限・下限） ─────────────────
console.log('[6] 敵の強さの 合わせかた');
{
  const allBases: Record<string, FriendBase> = { ...Object.fromEntries(SAMPLE_BASES.map((s) => [s.id, sampleBase(s)])), max: sanitizeFriendBase(maxBase())!, min: sanitizeFriendBase(minBase())! };
  let poolOk = true, bossOk = true, energyOk = true, fireOk = true, fireMin = 9, fireMax = 0;
  for (const [, b] of Object.entries(allBases)) for (const map of FRIEND_MAPS) {
    const ch = CAMPAIGN.find((c) => c.mapId === map.id)!;
    const su = friendSetup(toTarget(b, ch.no), 12);
    if (su.difficulty.unitPool.some((u) => BARRACKS_ONLY_UNITS.includes(u)) || su.difficulty.unitPool.length === 0) poolOk = false;
    if (su.difficulty.bossAtSpawnCount != null || (su.difficulty.bossShield ?? 0) > 0) bossOk = false;
    if (su.difficulty.startEnergy !== 30) energyOk = false;
    const f = fireFactor(map, b, su.enemyBase);
    fireMin = Math.min(fireMin, f); fireMax = Math.max(fireMax, f);
    if (f < FIRE_MIN - 1e-9 || f > FIRE_MAX + 1e-9) fireOk = false;
  }
  check(poolOk && bossOk && energyOk, '敵は 兵舎の いらない種類だけ・おやぶん（ボス）は いない・はじめの ⚡ は 30');
  check(fireOk, `火力の そろえ具合は ${FIRE_MIN}〜${FIRE_MAX} の中（いちばん小さい ${fireMin.toFixed(2)}・いちばん大きい ${fireMax.toFixed(2)}）`);
  const fp = (name: string, ch: number) => { const b = allBases[name]; const su = friendSetup(toTarget(b, ch), 24); return firepower(su.enemyBase, (t) => b.levels[t] ?? 1) * fireFactor(su.map, b, su.enemyBase); };
  const std = (ch: number) => firepower(BATTLE_MAPS.find((m) => m.id === CAMPAIGN.find((c) => c.no === ch)!.mapId)!.enemyBase);
  // 実質の火力＝（なかまの 基地の 火力）×（そろえる倍率）。標準の火力を 1 として、どんな基地・どの戦場でも 上限・下限の中
  let lo = 9, hi = 0, cells = 0;
  for (const ch of [2, 4, 5, 6, 8]) for (const name of Object.keys(allBases)) { const r = fp(name, ch) / std(ch); cells++; lo = Math.min(lo, r); hi = Math.max(hi, r); }
  check(lo >= 0.5 && hi <= EFFECTIVE_FIRE_MAX, `${cells}通り（${Object.keys(allBases).length}の基地 × 5戦場）で「実質の火力」は 標準の ${lo.toFixed(2)}〜${hi.toFixed(2)}ばい（0.5〜${EFFECTIVE_FIRE_MAX} の中。多すぎ・少なすぎの基地でも 勝ち負けが はじめから 決まらない）`);
  // 手持ちに あわせる（上がる・上限）
  const hp = (lv: number) => friendSetup(toTarget(allBases.wall, 8), lv).difficulty.enemyHpMult;
  check(hp(1) < hp(12) && hp(12) < hp(24) && hp(24) < hp(40), `敵の HP の倍率は 手持ちとともに 上がる（Lv1 ${hp(1).toFixed(2)}・Lv24 ${hp(24).toFixed(2)}・Lv40 ${hp(40).toFixed(2)}）`);
  check(hp(100) === hp(200) && hp(60) > hp(40), '敵の強さには 上限がある（脅威の上限 ×3.6 で とまる）');
  check(friendThreatMult(1) === 1 && friendThreatMult(12) < friendThreatMult(24) && friendThreatMult(40) > 3.4 && friendThreatMult(60) < 5.3, `育ったぶんの 敵の強さ：Lv1 ×${friendThreatMult(1).toFixed(2)}（かからない）・Lv24 ×${friendThreatMult(24).toFixed(2)}・Lv40 ×${friendThreatMult(40).toFixed(2)}・Lv60 ×${friendThreatMult(60).toFixed(2)}`);
  check(friendSetup(toTarget(allBases.wall, 8), 30).enemyLevel > friendSetup(toTarget(allBases.wall, 8), 1).enemyLevel, '「てき Lv」も 手持ちに あわせて 上がる');
  // 増援の速さは キャンプが 何こか で きまる（へらすと おそくなる）
  const ch8 = FRIEND_MAPS.find((m) => m.id === 'map-citadel')!;
  void ch8;
  const base1 = friendSetup(toTarget(allBases.min, 8), 12), base2 = friendSetup(toTarget(allBases.dense, 8), 12);
  check(base1.enemyBase.filter((b) => b.type === T.ARMY_CAMP).length >= 1 && base2.enemyBase.filter((b) => b.type === T.ARMY_CAMP).length === 2, 'キャンプが 敵の 増援の出口（足りない基地は 1つ 足す）');
}

// ── [7] sim が 決定的 ─────────────────
console.log('[7] sim の決定性');
for (const [sid, ch] of [['wall', 8], ['tower', 5], ['thin', 2], ['ring', 6], ['dense', 4]] as const) {
  const s = SAMPLE_BASES.find((x) => x.id === sid)!;
  const t = toTarget(sampleBase(s), ch);
  const a = playFriend(t, 12, 4242, { maxSeconds: 60 });
  const b = playFriend(t, 12, 4242, { maxSeconds: 60 });
  const c = playFriend(t, 12, 777, { maxSeconds: 60 });
  check(a.checksum === b.checksum, `${s.name}（第${ch}章の戦場）：同じ たね なら 同じ結果（${a.checksum.length}文字の 状態が 一致）${a.checksum === c.checksum ? '' : '・たねが ちがえば ちがう'}`);
}

// ── [8] 星と 💠（その日 1回目の勝ちだけ・サーバには 何も送らない） ─────────────────
console.log('[8] 星と 💠');
{
  const spy: string[] = [];
  const spyRpc = async <R,>(fn: string) => { spy.push(fn); return { ok: false as const, message: 'x' } as { ok: false; message: string } | { ok: true; data: R }; };
  __setFriendRpc(spyRpc, () => 'stu-a'); __setExpeditionRpc(spyRpc, () => 'stu-a');
  useFriendStore.getState().reset();
  const gold0 = usePlayerStore.getState().resources.gold;
  const exp0 = JSON.stringify(useExpeditionStore.getState().best);
  const D = '2026-11-17';
  check(friendBonusFor(D, true, 5) === FRIEND_ATTACK_CREDITS && friendBonusFor(D, false, 5) === 0 && friendBonusFor(D, true, 0) === 0, `画面に出す 💠：勝って 1問いじょう まちがえずに といたときだけ（${FRIEND_ATTACK_CREDITS}）`);
  check(settleFriend({ battleId: 'f1', day: D, slot: 'A', win: false, perfect: 4 }), '負けても 結果は 入る');
  check(usePlayerStore.getState().resources.gold === gold0 && useFriendStore.getState().stars.A === 0, '負け：💠 は 無し・星 0（ちょうせんの しるし）');
  check(settleFriend({ battleId: 'f2', day: D, slot: 'A', win: true, stars: 2, perfect: 6 }), 'きょう 1回目の 勝ち');
  check(usePlayerStore.getState().resources.gold === gold0 + FRIEND_ATTACK_CREDITS && useFriendStore.getState().stars.A === 2, `💠${FRIEND_ATTACK_CREDITS} と 星2`);
  check(!settleFriend({ battleId: 'f2', day: D, slot: 'A', win: true, stars: 3, perfect: 9 }) && usePlayerStore.getState().resources.gold === gold0 + FRIEND_ATTACK_CREDITS, '同じ出撃の 2回目は 入れない');
  settleFriend({ battleId: 'f3', day: D, slot: 'B', win: true, stars: 3, perfect: 9 });
  check(usePlayerStore.getState().resources.gold === gold0 + FRIEND_ATTACK_CREDITS && useFriendStore.getState().stars.B === 3, 'きょう 2回目の 勝ち：💠 は 無し（1日に1回）・星は のこる');
  check(friendBonusFor(D, true, 5) === 0 && friendBonusFor('2026-11-18', true, 5) === FRIEND_ATTACK_CREDITS, '次の日は また もらえる');
  settleFriend({ battleId: 'f4', day: D, slot: 'A', win: true, stars: 1, perfect: 2 });
  check(useFriendStore.getState().stars.A === 2, 'わるい星（1）は のこさない・2のまま');
  settleFriend({ battleId: 'f5', day: '2026-11-18', slot: 'A', win: true, stars: 1, perfect: 2 });
  check(JSON.stringify(useFriendStore.getState().stars) === '{"A":1}' && usePlayerStore.getState().resources.gold === gold0 + 2 * FRIEND_ATTACK_CREDITS, '日が かわると きのうの星は 空に（きょう 1回目の 💠 ももらう）');
  useFriendStore.getState().reset();
  const g1 = usePlayerStore.getState().resources.gold;
  settleFriend({ battleId: 'f6', day: D, slot: 'C', win: true, stars: 3, perfect: 0 });
  check(usePlayerStore.getState().resources.gold === g1 && useFriendStore.getState().stars.C === undefined && useFriendStore.getState().bonusDay === null, 'まちがえずに といた問題が 0 の戦いは 星も 💠 も 入れない（放置で ごほうびに ならない）');
  check(recordStars({ day: D, stars: { A: 3 }, bonusDay: null, settledBattleId: null }, D, 'A', 1).improved === false, '星は 良いときだけ 上書き');
  const s = sanitizeFriend({ day: 'x', stars: { A: 9, Z: 1 }, bonusDay: 5 });
  check(s.day === null && Object.keys(s.stars).length === 0 && s.bonusDay === null, 'こわれたセーブを なおす');
  await new Promise((r) => setTimeout(r, 10));
  check(spy.length === 0 && JSON.stringify(useExpeditionStore.getState().best) === exp0, '結果を 入れても サーバは 呼ばれない・遠征の星・章の記録には 数えない（攻めた記録は どこにも 送らない）');
  __setFriendRpc(null); __setExpeditionRpc(null);
  useFriendStore.getState().reset();
}

// ── [9] 安全・セーブ・体験版 ─────────────────
console.log('[9] 安全・セーブ・体験版');
{
  const src = fs.readFileSync(new URL('../catwars/components/friend/FriendParts.tsx', import.meta.url), 'utf8');
  check(!/studentId|student_id|\.number\b|出席番号|\bn番/.test(src.replace(/出席番号も 名前も 出さない|番号も 名前も 出ないよ|番号・名前|出席番号も/g, '')), '画面（FriendParts）は 子の id・番号を 読まない・出さない');
  // サーバの SQL は PRISM のリポジトリ（となりに あるときだけ見る。CI など 単体のときは とばす）
  const sqlUrl = new URL('../../class-portal-teacher/supabase/sql/2026-11-17-catwars-base.sql', import.meta.url);
  if (fs.existsSync(sqlUrl)) {
    const sql = fs.readFileSync(sqlUrl, 'utf8');
    const fnBody = sql.slice(sql.indexOf('create or replace function public.catwars_base_offers'), sql.indexOf('-- ---- 5.'));
    check(sql.includes('s.class_id = v_class') && sql.includes('s.id <> p_student_id') && !/student_id,|s\.number,|b\.student_id as/.test(fnBody.split('return')[1] ?? ''), 'SQL：同じ学級だけ・自分は入れない・返す列に id・番号が ない');
    check(!/create table[^;]*(attack|win|lose|battle|result)/i.test(sql), 'SQL：攻めた記録・勝ち負けを 持つ表は 作らない');
  } else console.log('  - SQL の確かめは とばした（PRISM のリポジトリが となりに 無い）');
  check(catwarsTrialKeyOf('friend') === 'sortie', '体験版：「なかまの 基地」は「出撃」と 同じ項目（先生が 閉じれば とじる）');
  const bundle = exportBundle();
  check(!!bundle.stores.friend && SAVE_KEYS.friend === 'catwars-friend-v1', `セーブ（saveBundle）に 入る（${measureBundle(bundle).byStore.friend} バイト）`);
}

console.log(fails ? `\n✗ ${fails} 件 失敗` : '\n✓ なかまの基地の試験は ぜんぶ通った');
process.exit(fails ? 1 : 0);

// ── バランス（BALANCE=1） ─────────────────
async function balance(): Promise<void> {
  const RUNS = Number(process.env.RUNS ?? 2);
  const WEAK = process.env.WEAK === '1';
  const LEVELS = (process.env.LV ?? '1,12,24,40,60').split(',').map(Number);
  const MAXSEC = Number(process.env.MAXSEC ?? 300);
  const OUT = process.env.OUT;
  const bases: [string, FriendBase][] = [
    ...SAMPLE_BASES.map((s) => [s.name, sampleBase(s)] as [string, FriendBase]),
    ['はし：ぜんぶ 上限・Lv10', sanitizeFriendBase(maxBase())!], ['はし：コアと 壁だけ', sanitizeFriendBase(minBase())!],
    ...[11, 22].map((sd) => [`でたらめ${sd}`, sanitizeFriendBase(randomBase(sd))!] as [string, FriendBase]),
  ].filter(([n]) => !process.env.ONLY || (n as string).includes(process.env.ONLY)) as [string, FriendBase][];
  const lines: string[] = [];
  const log = (s: string) => { console.log(s); lines.push(s); };
  log(`なかまの 基地のバランス（基地 ${bases.length} × 戦場 ${FRIEND_MAPS.length} × レベル ${LEVELS.join('/')}・各 ${RUNS}回）`);
  log('ふ＝ふつう に＝にがて（WEAK=1 のとき） と＝とかない（勝った数）・ふつうが勝つまでに解いた問題の平均');
  let nosolveWins = 0, normalWins = 0, normalRuns = 0, probSum = 0, probN = 0, weakWins = 0;
  const weakCells: string[] = [];
  const byLevel: Record<number, [number, number]> = {};
  const t0 = Date.now();
  for (const [name, base] of bases) for (const map of FRIEND_MAPS) {
    const ch = CAMPAIGN.find((c) => c.mapId === map.id)!.no;
    const line: string[] = [`${name.slice(0, 12).padEnd(12)} 第${ch}章`];
    let comboWins = 0, comboRuns = 0;
    for (const lv of LEVELS) {
      const lo = lv <= 3 ? { ...loadoutForLevel(lv, chapterNoForLevel(lv)), formation: ['barbarian', 'archer', 'giant'] } : undefined;
      const t = toTarget(base, ch);
      let n = 0, wk = 0, ns = 0, prob = 0;
      for (let r = 0; r < RUNS; r++) {
        const a = playFriend(t, lv, seedFor(r), { skill: NORMAL_SKILL, loadout: lo, maxSeconds: MAXSEC });
        if (a.win) { n++; prob += a.problems; }
        if (WEAK && playFriend(t, lv, seedFor(r), { skill: WEAK_SKILL, loadout: lo, maxSeconds: MAXSEC }).win) wk++;
        if (playFriend(t, lv, seedFor(r), { skill: NO_SOLVE_SKILL, loadout: lo, maxSeconds: MAXSEC }).win) ns++;
      }
      nosolveWins += ns; weakWins += wk; normalWins += n; normalRuns += RUNS; probSum += prob; probN += n; comboWins += n; comboRuns += RUNS;
      byLevel[lv] = [(byLevel[lv]?.[0] ?? 0) + n, (byLevel[lv]?.[1] ?? 0) + RUNS];
      line.push(`Lv${lv} ふ${n}${WEAK ? `に${wk}` : ''}と${ns}${n ? ` ${(prob / n).toFixed(0)}問` : ''}`);
    }
    if (comboWins / comboRuns < 0.5) weakCells.push(`${name}×第${ch}章`);
    log(line.join(' | '));
  }
  const rate = normalWins / Math.max(1, normalRuns);
  const avgProb = probSum / Math.max(1, probN);
  log('\nレベルごとの「ふつう」の勝率：' + Object.entries(byLevel).map(([lv, [w, n]]) => `Lv${lv} ${Math.round((w / n) * 100)}%`).join('・'));
  log(`${WEAK ? `「にがて」の勝率：${Math.round((weakWins / Math.max(1, normalRuns)) * 100)}%（目安。合格条件には しない）・` : ''}かかった時間 ${Math.round((Date.now() - t0) / 1000)}秒`);
  check(nosolveWins === 0, `「とかない」は どの基地・どの戦場・どのレベルでも勝てない（勝った ${nosolveWins}回）`);
  check(rate >= 0.85, `「ふつう」の勝率 ${Math.round(rate * 100)}%（85% いじょう）`);
  check(weakCells.length === 0, `「ふつう」が 半分も勝てない 基地×戦場 が無い${weakCells.length ? `（${weakCells.join('・')}）` : ''}`);
  check(avgProb <= 18, `「ふつう」が勝つまでに解いた問題 平均 ${avgProb.toFixed(1)}問（18問いか）`);
  if (OUT) fs.writeFileSync(OUT, lines.join('\n') + '\n');
}
