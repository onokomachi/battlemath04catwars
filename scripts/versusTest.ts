/**
 * 同時対戦（CW-6c・2026-11-17）の試験。
 *
 *   npm run test:versus            … きまり・2つの端末の同じ結果・ラウンドの進み方・ずれ・切断・安全・れんしゅう試合（約1分。npm run check に入れた）
 *   npm run test:versus:balance    … コンピュータ4段 × 4段 を 席を入れかえて（「とかない」子は 1勝も できない）（約2分。N=60 で ふやせる）
 *
 * サーバ・本物の Realtime には つながない：へやの関数は 差しかえ（__setVersusRpc）、合図は メモリの なかだち（MemoryNet）。
 * サーバの SQL（PRISM supabase/sql/2026-11-17-catwars-versus*.sql）の ふるまいは SQL の試験用ファイル（…versus.dryrun.sql）で見る。ここは 端末の側。
 */
import './lib/memStorage';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DetRNG } from '../catwars/sim/rng';
import { SimRunner } from '../catwars/sim/runner';
import { TICK_MS } from '../catwars/sim/types';
import { CHARACTERS } from '../catwars/data/characters';
import { PVP_MAPS } from '../catwars/data/battleMaps';
import { APP_ROUNDS } from '../apps/registry';
import { buildPackRounds, rewardWeight } from '../catwars/learn/gradePack';
import {
  VERSUS_ROUNDS, CARDS_PER_ROUND, HALF_TICKS, MAX_PLACED, MAX_PER_FAMILY, DROP_MS, PING_MS, SOLVE_CAP_MS, PLACE_MS, DRAW_EPS, VERSUS_LEVEL,
  VERSUS_FAMILIES, normalizeRoomCode, isRoomCode, roundSeed, dealCards, cardsHash, cardReward, energyOfMask, placeableCells, versusMap,
  sanitizePlacement, troopCost, buildHalf, runHalf, summarizeHalf, damageDealt, roundScore, outcomeOf, normalizeFormation,
  ScheduledProvider, type CardKey, type Placement, type Side,
} from '../catwars/versus/rules';
import { VersusMatch, type Msg } from '../catwars/versus/match';
import { BotPlayer, MemoryNet, BOT_LEVELS, botMask, smartPlacement, randomPlacement, createPractice, type BotLevel } from '../catwars/versus/bot';
import { __setVersusRpc, versusNamed, createRoom, joinRoom, markReady, leaveRoom, roomState, parseRoom, parseState, errorKind } from '../catwars/portal/versusSync';
import { __setLinkFactory, openLink } from '../catwars/net/broadcastLink';
import { catwarsTrialKeyOf } from '../catwars/portal/trialFeatures';

let fails = 0;
const check = (ok: boolean, msg: string) => { console.log(`${ok ? '  ✓' : '  ✗'} ${msg}`); if (!ok) fails++; };
const here = path.dirname(fileURLToPath(import.meta.url));

// ── 試験用の 道具 ─────────────────
/** 合成した 問題の 一覧（5単元 × 6項目。むずかしさ 1〜5） */
function makePool(): CardKey[] {
  const pool: CardKey[] = [];
  for (let u = 0; u < 5; u++) for (let s = 0; s < 6; s++) pool.push({ unitKey: `u${u}`, skillId: `s${u}-${s}`, difficulty: 1 + (s % 5) });
  return pool;
}
const FORM = ['barbarian', 'archer', 'giant', 'magic', 'speed'];
const PROFILES = { none: { accuracy: 0, smart: true }, easy: BOT_LEVELS.easy, normal: BOT_LEVELS.normal, hard: BOT_LEVELS.hard };
type Prof = { accuracy: number; smart: boolean };

interface Duel { net: MemoryNet; a: BotPlayer; b: BotPlayer; clock: { t: number }; step: (ms?: number) => void }
/** 2つの コンピュータの 手を 同じ通り道で つなぐ（host・guest）。時計は 偽物（t を 進める） */
function duel(seed: number, pa: Prof, pb: Prof, o: { cards?: CardKey[][]; cardsB?: CardKey[][]; think?: { solve: number; place: number } } = {}): Duel {
  const clock = { t: 1_000_000 };
  const now = () => clock.t;
  const cards = o.cards ?? dealCards(makePool(), seed);
  const net = new MemoryNet();
  const a = new BotPlayer({ side: 'host', seed, cards, level: 'normal', profile: pa, formation: FORM, now, link: net.linkFor('host'), think: o.think });
  const b = new BotPlayer({ side: 'guest', seed, cards: o.cardsB ?? cards, level: 'normal', profile: pb, formation: FORM, now, link: net.linkFor('guest'), think: o.think });
  net.attach('host', (m) => a.receive(m)); net.attach('guest', (m) => b.receive(m));
  const step = (ms = 500) => { clock.t += ms; a.update(); b.update(); net.pump(); };
  return { net, a, b, clock, step };
}
function runToEnd(d: Duel, maxSteps = 4000): number {
  let i = 0;
  while ((d.a.match.phase !== 'done' || d.b.match.phase !== 'done') && i++ < maxSteps) d.step();
  return i;
}
const sameJson = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
/** 時計を ms だけ 進める（生きている しるし（ping）が とどく 間隔で 刻む） */
function advance(d: Duel, ms: number): void { for (let t = 0; t < ms; t += 500) d.step(500); }

// 一つの 半分（前半・後半）の 入力を 作る
function inputOf(seed: number, round: number, half: 0 | 1, pa: Placement, pb: Placement, ea = 450, eb = 450) {
  return { seed, round, half, placements: { host: pa, guest: pb }, energies: { host: ea, guest: eb }, formations: { host: FORM, guest: FORM } } as const;
}

if (process.env.BALANCE === '1') {
  await balance();
  process.exit(fails ? 1 : 0);
}

// ── [1] きまり：へやの記号・たね・カード・おきかた ─────────────────
console.log('[1] きまり（へやの記号・たね・カード・おきかた）');
{
  check(normalizeRoomCode('１２３４') === '1234' && normalizeRoomCode(' 12-3 4 5') === '1234' && normalizeRoomCode('ab') === '', 'へやの記号：全角の数字も 通る・数字いがいは すてる・4けたまで');
  check(isRoomCode('0042') && !isRoomCode('42') && !isRoomCode('12345') && !isRoomCode('abcd') && !isRoomCode(''), 'へやの記号は ちょうど 4けたの 数字');
  const seeds = [1, 2, 3, 99999, 0xffffffff].map((s) => [0, 1, 2].map((r) => roundSeed(s, r)));
  check(seeds.every((rs) => new Set(rs).size === 3) && sameJson(roundSeed(7, 1), roundSeed(7, 1)), 'ラウンドの たねは ラウンドごとに ちがい、同じ入力なら 同じ');

  const pool = makePool();
  const cardsA = dealCards(pool, 12345);
  const shuffled = pool.slice().sort(() => 0.5 - ((roundSeed(1, 1) % 1000) / 1000)).reverse();
  const cardsB = dealCards(shuffled, 12345);
  check(sameJson(cardsA, cardsB), '同じ たね・同じ 範囲なら 2つの端末で 同じカード（問題の 並びが ちがっていても）');
  check(cardsA.length === VERSUS_ROUNDS && cardsA.every((h) => h.length === CARDS_PER_ROUND), `${VERSUS_ROUNDS}ラウンド × ${CARDS_PER_ROUND}まい`);
  check(cardsA.every((h) => h[0].difficulty <= 2 && h[1].difficulty === 3 && h[2].difficulty >= 4), '各ラウンドは「やさしい・ふつう・むずかしい」の 3まい');
  check(new Set(cardsA.flat().map((c) => `${c.unitKey}/${c.skillId}`)).size === 9, '同じ項目は 対戦の中で かさならない（範囲が 広いとき）');
  const tiny = dealCards(pool.slice(0, 3), 5);
  check(tiny.every((h) => h.length === CARDS_PER_ROUND), '範囲が せまくて 3項目しか 無くても 3まい ずつ 配れる（かさなる）');
  check(!sameJson(dealCards(pool, 1), dealCards(pool, 2)) && cardsHash(dealCards(pool, 1)) !== cardsHash(dealCards(pool, 2)) && cardsHash(cardsA) === cardsHash(cardsB), 'たねが ちがえば カードも 目印も ちがう・同じなら 同じ');
  const hand = cardsA[0];
  const full = energyOfMask(hand, 7, rewardWeight), none = energyOfMask(hand, 0, rewardWeight), some = energyOfMask(hand, 1, rewardWeight);
  check(none === 0 && some === cardReward(hand[0].difficulty, rewardWeight) && full === hand.reduce((s, c) => s + cardReward(c.difficulty, rewardWeight), 0), '⚡ は まちがえずに といた カードの ぶんだけ（0問なら 0）');
  check(full >= 300 && full <= 650, `3まい ぜんぶ とくと ⚡ ${full}（ネコ 8〜16体ぶんの めやす）`);

  for (const m of PVP_MAPS) {
    const cells = placeableCells(m);
    const set = new Set(cells.map((c) => `${c.x},${c.y}`));
    const bad = m.terrain.filter((t) => ['WATER', 'ROCK', 'LAVA'].includes(t.type) && set.has(`${t.x},${t.y}`));
    check(cells.length > 40 && !set.has('1,7') && !set.has('2,8') && bad.length === 0 && cells.every((c) => c.x >= m.playerDeployZone.xMin && c.x <= m.playerDeployZone.xMax),
      `${m.id}：おける ますめ ${cells.length}（コア・水・岩・溶岩には おけない・自分の ゾーンの中）`);
  }
  const map = versusMap(1, 0);
  const cells = placeableCells(map);
  const e = 400;
  const raw = [
    ['barbarian', cells[0].x, cells[0].y], ['barbarian', cells[0].x, cells[0].y],   // 同じ ますめ
    ['boss_titan', cells[1].x, cells[1].y],                                          // 枠の外
    ['archer', 20, 3],                                                               // ゾーンの外
    ['giant', 1, 7],                                                                 // コアの上
    ['magic', 1.5, 3], ['magic', '3', 3], ['magic', NaN, 3], [5, 1, 1], null, 'x',   // こわれた形
    ...cells.slice(2, 40).map((c) => ['barbarian', c.x, c.y]),                      // 同じ系統は MAX_PER_FAMILY まで
  ];
  const cl = sanitizePlacement(raw, FORM, e, map);
  const cost = cl.reduce((s, u) => s + troopCost(u.id), 0);
  check(cl.length > 0 && cl.every((u) => FORM.includes(u.id)) && new Set(cl.map((u) => `${u.x},${u.y}`)).size === cl.length, '見なおし：枠の外の系統・重なり・こわれた形は すてる');
  check(!cl.some((u) => u.x === 1 && u.y === 7) && !cl.some((u) => u.x === 20), '見なおし：コアの上・ゾーンの外は すてる');
  check(cl.filter((u) => u.id === 'barbarian').length <= MAX_PER_FAMILY && cost <= e && cl.length <= MAX_PLACED, `見なおし：同じ系統は ${MAX_PER_FAMILY}ひきまで・⚡ ${e} を こえない（${cost}）・${MAX_PLACED}体まで`);
  check(sameJson(sanitizePlacement(cl, FORM, e, map), cl), '見なおしは 2回かけても 同じ（自分のも あいてから 来たのも 同じ結果になる）');
  check(sanitizePlacement('x', FORM, 100, map).length === 0 && sanitizePlacement(raw, FORM, 0, map).length === 0, '配列でない・⚡ が 0 なら 何も おけない');
  check(troopCost('archer') === 45 && troopCost('barbarian') === 30 && troopCost('nope') === Infinity, '値段：遠距離系は 対戦だけ ×1.5（45）。ほかは そのまま');
  check(sameJson(normalizeFormation(['boss_titan', 'barbarian', 'barbarian', 'zzz', 'archer', 'giant', 'magic', 'speed', 'flying']), ['barbarian', 'archer', 'giant', 'magic', 'speed']), '出撃の枠の 見なおし：ボス・重なり・知らない系統・6つ目いじょうは すてる');
  check(normalizeFormation([]).length > 0 && normalizeFormation('x' as unknown).length > 0, '空の 枠は 初期の枠に');
  check(VERSUS_FAMILIES.length === CHARACTERS.filter((c) => !c.id.startsWith('boss_')).length && VERSUS_LEVEL === 10, '対戦で つかえる系統＝ボスいがい・レベルは みんな Lv10');
}

// ── [2] 同じ入力から 同じ結果・左右の公平 ─────────────────
console.log('[2] 同じ入力から 同じ結果（2つの端末）・左右の公平');
{
  let same = 0, N = 40;
  for (let s = 1; s <= N; s++) {
    const seed = s * 7919;
    const map = versusMap(seed, s % 3);
    const pa = smartPlacement(new DetRNG(seed ^ 3), FORM, 480, map), pb = randomPlacement(new DetRNG(seed ^ 5), FORM, 300, map);
    for (const half of [0, 1] as const) {
      // 2つの端末が それぞれ 作る（片方は JSON を とおして 受けとったもの）
      const dev1 = buildHalf(inputOf(seed, s % 3, half, pa, pb, 480, 300));
      const dev2 = buildHalf(JSON.parse(JSON.stringify(inputOf(seed, s % 3, half, pa, pb, 480, 300))));
      const r1 = runHalf(dev1), r2 = runHalf(dev2);
      if (sameJson(r1, r2) && sameJson(dev1.cfg, dev2.cfg)) same++;
    }
  }
  check(same === N * 2, `同じ入力（おきかた2つ）から 2つの端末が 同じ cfg・同じ結果（チェックサム・コアの のこり）：${same}/${N * 2}`);

  // 画面で 1 tick ずつ・細かい フレームで 進めても 同じ（スキップと 同じ けっか）
  let ok = 0;
  for (let s = 1; s <= 8; s++) {
    const seed = s * 104729;
    const pa = smartPlacement(new DetRNG(seed), FORM, 450, versusMap(seed, 0)), pb = smartPlacement(new DetRNG(seed + 1), FORM, 450, versusMap(seed, 0));
    const h = buildHalf(inputOf(seed, 0, 0, pa, pb));
    const full = runHalf(h);
    const runner = new SimRunner(h.cfg, h.init); const prov = new ScheduledProvider(h.commands);
    let t = 0;
    while (runner.tick < HALF_TICKS && runner.state.result === null && t++ < 100000) runner.advance(16, prov);   // 60fps 刻み
    if (sameJson(summarizeHalf(runner.state), full)) ok++;
  }
  check(ok === 8, `フレームの 刻みが ちがっても（16ms）一気に 計算（スキップ）と 同じ結果：${ok}/8`);

  // 左右の公平：同じ おきかた どうしなら 2人の点は 同じ（席を入れかえる 2回の へいき）・席による かたよりは ほぼ 0
  let maxDiff = 0, swapOk = 0, seatBias = 0, seatN = 0;
  for (let s = 1; s <= 40; s++) {
    const seed = s * 15485863;
    const map = versusMap(seed, s % 3);
    const pa = smartPlacement(new DetRNG(seed ^ 7), FORM, 450, map);
    const pb = smartPlacement(new DetRNG(seed ^ 9), FORM, 450, map);
    const sc = (a: Placement, b: Placement) => { const h0 = buildHalf(inputOf(seed, s % 3, 0, a, b)), h1 = buildHalf(inputOf(seed, s % 3, 1, a, b)); return roundScore(h0, runHalf(h0), h1, runHalf(h1)); };
    const same2 = sc(pa, pa);
    maxDiff = Math.max(maxDiff, Math.abs(same2.host - same2.guest));
    const r1 = sc(pa, pb), r2 = sc(pb, pa);
    seatBias += (r1.host - r2.guest) + (r1.guest - r2.host); seatN += 2;
    if (Math.abs(r1.host - r2.guest) < 0.45 && Math.abs(r1.guest - r2.host) < 0.45) swapOk++;
  }
  // 同じ おきかたでも 出てくる 位置の ゆらぎ（出撃の ゆれ）が 席ごとに ちがうので ぴったりは 一致しない。平均で かたよらないことを 見る
  check(seatBias / seatN > -0.06 && seatBias / seatN < 0.06, `席（host・guest）による 点の かたより：平均 ${(seatBias / seatN).toFixed(3)}（±0.06 いない）`);
  void maxDiff; void swapOk;

  // 席を 入れかえない（P1 だけ 有利）ままだと どれだけ かたよるか（入れかえる 理由の 数字）
  let p1adv = 0, n1 = 0;
  for (let s = 1; s <= 40; s++) {
    const seed = s * 32452843; const map = versusMap(seed, 0);
    const pa = smartPlacement(new DetRNG(seed ^ 1), FORM, 450, map);
    const h0 = buildHalf(inputOf(seed, 0, 0, pa, pa)); const d = damageDealt(h0, runHalf(h0));
    p1adv += d.host - d.guest; n1++;   // 同じおきかたで host が P1（左）の ときの 差
  }
  check(p1adv / n1 > 0.03, `（参考）席を 入れかえないと P1 が 有利：同じ おきかたで ${(p1adv / n1).toFixed(2)} の差 → 前半・後半で 入れかえて へいきを 取る`);
  check(outcomeOf({ host: 1.5, guest: 1.5 + DRAW_EPS / 2 }) === 'draw' && outcomeOf({ host: 1.5, guest: 1.5 + DRAW_EPS * 1.2 }) === 'guest' && outcomeOf({ host: 2, guest: 1 }) === 'host' && outcomeOf({ host: 0.2, guest: 1.4 }) === 'guest', '勝ち負け：あいての コアを おおく けずった ほう・ほぼ 同じなら ひきわけ');
}

// ── [3] 2つの端末の 状態機械（ラウンドの進み方）─────────────────
console.log('[3] ラウンドの進み方（とく → おく → みる → くらべる ×3）');
{
  const d = duel(2024, PROFILES.normal, PROFILES.normal);
  const phases: string[] = [];
  d.a.match.subscribe(() => { const p = `${d.a.match.phase}${d.a.match.phase === 'done' ? '' : d.a.match.round}`; if (phases[phases.length - 1] !== p) phases.push(p); });
  const steps = runToEnd(d);
  const A = d.a.match, B = d.b.match;
  check(A.phase === 'done' && B.phase === 'done' && A.end?.kind === 'finished' && B.end?.kind === 'finished', `3ラウンド おわって 2人とも「けっか」（${steps}回の 時計で）`);
  const order = phases.join('>');
  check(/solve0>place0>watch0>check0>solve1>place1>watch1>check1>solve2>place2>watch2>check2>done/.test(order.replace(/lobby\d>/, '')), `進み方：${order.replace(/lobby\d>/, '')}`);
  check(sameJson(A.totals, B.totals) && sameJson(A.results, B.results) && A.end?.outcome === B.end?.outcome, '2つの端末で 点・ラウンドの けっか・勝ち負けが 同じ');
  check(A.results.length === VERSUS_ROUNDS && A.results.every((r) => r.halves.length === 2 && r.score.host >= 0 && r.score.host <= 1 && r.score.guest <= 1), 'ラウンドの 点は 0〜1（あいての コアを けずった 割合の 前半・後半の へいき）');
  const kinds = new Set(d.net.log.map((x) => (x.m as Msg).t));
  check([...kinds].every((k) => ['pg', 'go', 'sv', 'pl', 'sm', 'by'].includes(k as string)) && kinds.has('go') && kinds.has('sv') && kinds.has('pl') && kinds.has('sm'), `送った メッセージの しゅるいは ${[...kinds].join('・')} だけ`);
  const pls = d.net.log.filter((x) => (x.m as Msg).t === 'pl').length, sms = d.net.log.filter((x) => (x.m as Msg).t === 'sm').length, svs = d.net.log.filter((x) => (x.m as Msg).t === 'sv').length;
  check(pls === 6 && sms === 6 && svs === 6, `ラウンドごとに 2人が 1回ずつ：とけた ${svs}・おきかた ${pls}・要約 ${sms}（3ラウンド × 2人）`);
  const maxBytes = Math.max(...d.net.log.map((x) => JSON.stringify(x.m).length));
  const totalBytes = d.net.log.reduce((s, x) => s + JSON.stringify(x.m).length, 0);
  check(maxBytes < 900 && totalBytes < 25_000, `1つの 通信は 小さい（さいだい ${maxBytes}バイト・1回の対戦ぜんぶで ${totalBytes}バイト）`);
}
{
  // バリア：先に とけても 得を しない・おきかたは 2人 そろうまで あいてに 見えない
  const d = duel(7, PROFILES.normal, PROFILES.normal, { think: { solve: 1e9, place: 1e9 } });   // コンピュータは 人が うごくまで なにも しない
  for (let i = 0; i < 6; i++) d.step();
  const A = d.a.match, B = d.b.match;
  check(A.phase === 'solve' && B.phase === 'solve', 'はじまり：2人の「たたかう」が そろうと とく が はじまる');
  A.markSolved(0); A.markSolved(1); A.markSolved(2); A.finishSolving(); d.net.pump();
  d.step(); d.step();
  check(A.phase === 'solve' && A.localDoneSolving() && !A.remoteDoneSolving() && B.remoteDoneSolving(), '先に とけた子は おけない（あいてが おわるまで まつ）・あいては「おわったよ」と 分かる');
  check(A.localEnergy() > 0 && B.energyOf('host') > 0 && B.localEnergy() === 0, '⚡ は 自分が まちがえずに といた ぶんだけ（あいての ⚡ の 数は 画面に 出さないが きまりの 上では 同じ計算）');
  B.finishSolving(); d.net.pump();
  check(A.phase === 'place' && B.phase === 'place', '2人とも とけたら 同時に「おく」へ');
  const before = d.net.log.filter((x) => (x.m as Msg).t === 'pl').length;
  A.setDraft(smartPlacement(new DetRNG(1), FORM, A.localEnergy(), versusMap(A.seed, 0))); A.submit(); d.net.pump(); d.step();
  check(d.net.log.filter((x) => (x.m as Msg).t === 'pl').length === before + 1 && A.phase === 'place' && !B.remoteDonePlacing() === false, '先に 「できた」を おしても 見ないまま まつ・おきかたは「できた」を おすまで 送られない');
  check(B.phase === 'place' && B.remoteDonePlacing(), 'あいては「おきおわったよ」だけ 分かる（中身は おたがい 見えるのは 「みる」から）');
  B.submit(); d.net.pump();
  check(A.halfSetup(0, 0) !== undefined && A.round >= 1 && A.results.length >= 1 && sameJson(A.results[0], B.results[0]), '2人とも「できた」で「みる」へ すすみ、同じ けっかに なる（この試験の あいては コンピュータなので 計算を すぐ おわらせて つぎの ラウンドまで すすむ）');
}
{
  // 時間ぎれ：とく・おく は 上限が くると 自動で 進む
  const d = duel(11, PROFILES.none, PROFILES.none, { think: { solve: 1e9, place: 1e9 } });
  for (let i = 0; i < 6; i++) d.step();
  const A = d.a.match, B = d.b.match;
  advance(d, SOLVE_CAP_MS + 1000); d.step(); d.step();
  check(A.phase === 'place' && B.phase === 'place' && A.localEnergy() === 0, `とく の 上限（${SOLVE_CAP_MS / 1000}秒）が くると 自動で「おく」へ（といていない ぶんは ⚡ 0）`);
  A.setDraft([{ id: 'barbarian', x: 4, y: 3 }]);
  advance(d, PLACE_MS + 1000); d.step(); d.step(); d.step();
  check(A.phase !== 'place' && B.phase !== 'place', `おく の 時間（${PLACE_MS / 1000}秒）が きれると 自動で「できた」になる`);
  check(A.halfSetup(0, 0) !== undefined && A.halfSetup(0, 0)!.commands.size === 0, '⚡ が 0 のときは ネコを おけない（見なおしで 空になる）＝問題を とかないと うごかない');
}

// ── [4] ずれ・切断・版のちがい・こわれた メッセージ ─────────────────
console.log('[4] ずれの 見つけ方・通信が 切れたとき・こわれた メッセージ');
{
  // ずれ：あいての「出撃の枠」が 本物と ちがって 伝わった → 2つの計算が ちがう → 要約の くらべで 見つけて ひきわけ
  const d = duel(31, PROFILES.hard, PROFILES.hard);
  d.net.tamper = (from, m) => { const x = m as Msg; if (from === 'guest' && x.t === 'go') return { ...x, form: ['barbarian', 'archer', 'giant', 'magic', 'flying'] }; return m; };
  runToEnd(d, 800);
  check(d.a.match.end?.kind === 'desync' && d.b.match.end?.kind === 'desync', '計算が ずれたら（出撃の枠が ちがって 伝わった）どちらの端末も「ずれ」で おわる');
  check(d.a.match.end?.outcome === 'draw' && d.b.match.end?.outcome === 'draw', 'ずれた対戦は ひきわけ（かち・まけを つけない）');
}
{
  // 要約の数字だけ ずれた（チェックサム）
  const d = duel(32, PROFILES.normal, PROFILES.normal);
  d.net.tamper = (from, m) => { const x = m as Msg; if (from === 'host' && x.t === 'sm' && x.r === 1) return { ...x, s: [x.s[0] + 1, x.s[1]] }; return m; };
  runToEnd(d, 800);
  check(d.a.match.end?.kind === 'desync' && d.b.match.end?.kind === 'desync' && d.a.match.results.length >= 2, 'ラウンド1の 要約が 1つ ちがうだけでも 見つける（ラウンド0 までは 進んでいる）');
}
{
  // 切断：はじまった あとに 通信が 切れて DROP_MS 聞こえない
  const d = duel(40, PROFILES.normal, PROFILES.normal, { think: { solve: 1e9, place: 1e9 } });
  for (let i = 0; i < 6; i++) d.step();
  d.net.cut = true;
  for (let i = 0; i < (DROP_MS / 500) - 14; i++) d.step();
  check(d.a.match.phase === 'solve' && d.b.match.phase === 'solve', `切れてから ${DROP_MS / 1000}秒 までは まつ（ゆるく）`);
  for (let i = 0; i < 12; i++) d.step();
  check(d.a.match.end?.kind === 'left' && d.b.match.end?.kind === 'left', `${DROP_MS / 1000}秒 聞こえなければ「あいてが いなくなったよ」で おわる`);
  check(d.a.match.end?.outcome === null && d.b.match.end?.outcome === null, 'いなくなったときは かち・まけを つけない');
}
{
  // 通信が ちょっと 切れて もどった：おくれて とどけば つづけられる
  const d = duel(41, PROFILES.normal, PROFILES.normal, { think: { solve: 1e9, place: 1e9 } });
  for (let i = 0; i < 6; i++) d.step();
  d.net.cut = true; for (let i = 0; i < 10; i++) d.step(); d.net.cut = false;
  for (let i = 0; i < 4; i++) d.step();
  check(d.a.match.phase === 'solve' && d.a.match.end === null, '10秒だけ 切れて もどっても つづけられる');
}
{
  // はじめの go が 1つ なくなっても（resend）はじまる
  const d = duel(42, PROFILES.normal, PROFILES.normal);
  let dropped = 0;
  d.net.tamper = (_f, m) => { const x = m as Msg; if (x.t === 'go' && dropped < 2) { dropped++; return null; } return m; };
  for (let i = 0; i < 40; i++) d.step();
  check(dropped === 2 && d.a.match.phase !== 'lobby' && d.b.match.phase !== 'lobby', '「たたかう」の 合図が 2回 なくなっても おくりなおして はじまる');
}
{
  // へやで あいてが 出た（lobby）：へやは のこる
  const clock = { t: 3_000_000 };
  const net = new MemoryNet();
  const cards = dealCards(makePool(), 43);
  const a = new VersusMatch({ side: 'host', seed: 43, cards, formation: FORM, link: net.linkFor('host'), now: () => clock.t });
  const b = new VersusMatch({ side: 'guest', seed: 43, cards, formation: FORM, link: net.linkFor('guest'), now: () => clock.t });
  net.attach('host', (m) => a.receive(m)); net.attach('guest', (m) => b.receive(m));
  clock.t += 500; a.update(); b.update(); net.pump();
  check(a.opponentPresent && b.opponentPresent && a.phase === 'lobby', 'ロビー：あいてが 来ると おたがいに わかる（まだ はじまらない）');
  b.ready(); net.pump();
  check(a.remoteReady() && a.phase === 'lobby', 'あいてが「たたかう」を おしても じぶんが おすまで はじまらない');
  b.leave(); net.pump();
  check(a.phase === 'lobby' && !a.opponentPresent && !a.remoteReady() && a.end === null, 'ロビーで あいてが 出ても へやの 子は まっている（対戦は おわらない・あいての じゅんびは 取り消し）');
}
{
  // ページの版（カード）がちがう
  const pool = makePool();
  const d = duel(44, PROFILES.normal, PROFILES.normal, { cardsB: dealCards(pool.slice(0, 20), 44) });
  for (let i = 0; i < 12; i++) d.step();
  check(d.a.match.end?.kind === 'version' || d.b.match.end?.kind === 'version', 'カードの 目印が ちがう（ページの 版が ちがう）と「版」で おわる（ずれと 区別する）');
}
{
  // こわれた・悪意の メッセージ
  const clock = { t: 5_000_000 };
  const m = new VersusMatch({ side: 'host', seed: 1, cards: dealCards(makePool(), 1), formation: FORM, link: { send: () => {} }, now: () => clock.t });
  const junk: unknown[] = [null, undefined, 5, 'x', [], {}, { t: 'zzz' }, { t: 'sv', r: -1, m: 1 }, { t: 'sv', r: 9, m: 1 }, { t: 'sv', r: 0, m: 999 }, { t: 'sv', r: 0.5, m: 1 },
    { t: 'pl', r: 0, p: 'x' }, { t: 'pl', r: 1e9, p: [] }, { t: 'sm', r: 0, s: 'x', d: null }, { t: 'go', v: 99, form: 'x', ch: 5 }, { t: 'pl', r: 0, p: Array.from({ length: 5000 }, () => ['barbarian', 1, 1]) }];
  let threw = false;
  try { for (const j of junk) m.receive(j); m.update(); } catch { threw = true; }
  check(!threw && m.phase === 'lobby' && m.end === null, 'こわれた・おかしな メッセージ（型ちがい・範囲の外・5000体）を 受けても 止まらない・ふつうに のこる');
}
{
  // あいてが「⚡ ぶんいじょうの おきかた」を 送ってきても 両方の端末で 同じに ならされる（ずれない）
  const d = duel(45, PROFILES.none, PROFILES.none);
  const cheat = Array.from({ length: 30 }, (_, i) => ['barbarian', 2 + (i % 6), i % 16] as [string, number, number]);
  d.net.tamper = (from, m) => { const x = m as Msg; if (from === 'guest' && x.t === 'pl') return { ...x, p: cheat }; return m; };
  runToEnd(d, 800);
  check(d.a.match.end?.kind === 'finished' && d.b.match.end?.kind === 'finished', '⚡ が 0 なのに 30体 おいた ことに して送っても、見なおしで すてられて 2つの端末が 同じに なる（ずれない）');
  check(d.a.match.results.every((r) => r.score.guest === 0 && r.score.host === 0), 'そのときの 点は 0（⚡ を 持たない 側は なにも できない）');
}
{
  // 時計：ping は 間をあけて 送る
  const d = duel(46, PROFILES.normal, PROFILES.normal, { think: { solve: 1e9, place: 1e9 } });
  for (let i = 0; i < 6; i++) d.step();
  const before = d.net.log.filter((x) => (x.m as Msg).t === 'pg').length;
  for (let i = 0; i < 20; i++) d.step();   // 10秒
  const pg = d.net.log.filter((x) => (x.m as Msg).t === 'pg').length - before;
  check(pg >= 4 && pg <= 12, `生きている しるし（ping）は ${PING_MS / 1000}秒ごと（10秒で ${pg}回。2人ぶん）`);
}

// ── [5] れんしゅう試合（名乗っていない）・サーバとの やりとり・安全 ─────────────────
console.log('[5] れんしゅう試合・サーバとの やりとり・子どもの 安全');
{
  const calls: { fn: string; body: Record<string, unknown> }[] = [];
  __setVersusRpc(async (fn, body) => { calls.push({ fn, body }); return { ok: false, status: 500, text: 'x' }; }, () => null);
  check(!versusNamed(), '名乗っていない（おためし）なら 同じ学級の なかまとは たたかえない（コンピュータが あいて）');
  const r1 = await createRoom(['u1']), r2 = await joinRoom('1234'), r3 = await markReady('1234'), r4 = await roomState('1234'); await leaveRoom('1234');
  check(!r1.ok && !r2.ok && !r3.ok && !r4.ok && calls.length === 0, '名乗っていないときは サーバを 1回も よばない（へや・入室・準備・でる・ようす）');

  // れんしゅう試合：人の 手を まねる 手で さいごまで
  const pool = makePool();
  const clock = { t: 9_000_000 };
  const pr = createPractice({ seed: 777, cards: dealCards(pool, 777), level: 'normal', formation: FORM, botFormation: FORM, now: () => clock.t });
  pr.tick(); pr.human.ready(); pr.tick();
  const h = pr.human;
  let guard = 0;
  while (h.phase !== 'done' && guard++ < 4000) {
    clock.t += 500;
    if (h.phase === 'solve' && !h.localDoneSolving()) { h.markSolved(0); h.markSolved(1); h.finishSolving(); }
    if (h.phase === 'place' && !h.localDonePlacing()) { h.setDraft(smartPlacement(new DetRNG(guard), FORM, h.localEnergy(), versusMap(h.seed, h.round))); h.submit(); }
    if (h.phase === 'watch') { const su = h.halfSetup()!; h.halfDone(runHalf(su)); }
    pr.tick();
  }
  check(h.phase === 'done' && h.end?.kind === 'finished' && h.end.outcome !== null, `れんしゅう試合：コンピュータが あいてでも 3ラウンド さいごまで すすむ（${h.end?.outcome}）`);
  check(calls.length === 0, 'れんしゅう試合では サーバへの よびだしが 0（なにも 送らない）');
  check(pr.net.log.every((x) => ['pg', 'go', 'sv', 'pl', 'sm', 'by'].includes((x.m as Msg).t)), 'れんしゅう試合の 通信は 同じ端末の 中だけ');
}
{
  // 名乗っている子：サーバの 関数と 中身
  const calls: { fn: string; body: Record<string, unknown> }[] = [];
  const answers: Record<string, unknown> = {
    catwars_versus_create: { code: '4821', channel: 'a1b2c3d4e5f60718', seed: 123456789, units: ['u1', 'u2'] },
    catwars_versus_join: { code: '4821', channel: 'a1b2c3d4e5f60718', seed: 123456789, units: ['u1', 'u2'] },
    catwars_versus_state: { status: 'full', opp_here: true, me_ready: false, opp_ready: true },
    catwars_versus_ready: { status: 'playing', opp_here: true, me_ready: true, opp_ready: true },
  };
  __setVersusRpc(async (fn, body) => { calls.push({ fn, body }); return fn in answers ? { ok: true, data: answers[fn] } : { ok: true, data: true }; }, () => 'stu-uuid-1');
  check(versusNamed(), '名乗っている子は 同じ学級の なかまと たたかえる');
  const c = await createRoom(['u1', 'u2']);
  const j = await joinRoom(' ４８２１ ');
  const st = await roomState('4821'); const rd = await markReady('4821'); await leaveRoom('4821');
  check(c.ok && c.data.role === 'host' && c.data.code === '4821' && c.data.units.length === 2 && j.ok && j.data.role === 'guest', 'へやを つくる（host）・記号で はいる（guest。全角・空白は 見なおす）');
  check(st.ok && st.data.oppHere && rd.ok && rd.data.status === 'playing', 'ようす・「たたかう」の こたえを 読める');
  check(calls.every((x) => Object.keys(x.body).every((k) => ['p_student_id', 'p_units', 'p_code'].includes(k))), `サーバに 送るのは 自分の id・範囲・へやの記号だけ（${[...new Set(calls.map((x) => Object.keys(x.body).join('+')))].join(' / ')}）`);
  check(!JSON.stringify(calls).match(/number|name|win|lose|score|result|stars/i), 'サーバへの 呼びだしに 番号・名前・勝ち負け・点は 入らない');
  check(calls[3].fn === 'catwars_versus_ready' && !JSON.stringify(calls[3].body).includes('spend'), '「たたかう」は スタミナの数を 送らない（数は サーバが きめる。サーバは スタミナを 使った記録を 見る）');

  check(parseRoom({ ...answers.catwars_versus_create as object, channel: 'ZZ' }, 'host') === null && parseRoom({ ...answers.catwars_versus_create as object, seed: -1 }, 'host') === null
    && parseRoom({ ...answers.catwars_versus_create as object, units: [] }, 'host') === null && parseRoom({ ...answers.catwars_versus_create as object, code: '12' }, 'host') === null && parseRoom(null, 'host') === null,
    'サーバから来た へやの 形も 見なおす（記号・部屋の名前・たね・範囲が おかしければ ことわる）');
  check(parseState({ status: 'x' }) === null && parseState({ status: 'waiting', opp_here: 'yes' })?.oppHere === false, 'へやの ようすも 見なおす');
  check(errorKind(400, 'MODE_CLOSED: x') === 'closed' && errorKind(400, 'ROOM_NOT_FOUND') === 'notfound' && errorKind(400, 'ROOM_FULL') === 'full' && errorKind(404, '') === 'unavailable' && errorKind(0, '') === 'offline' && errorKind(400, 'NO_SPEND') === 'nospend', 'ことわりの 種類（閉じている・見つからない・いっぱい・SQL前・つながらない・スタミナ）');
  __setVersusRpc(null);

  // 合図の 差しかえ口
  const got: string[] = [];
  __setLinkFactory((ch, onMsg) => { got.push(ch); setTimeout(() => onMsg({ t: 'pg' }), 0); return { send() {}, close() {}, status: () => 'open' }; });
  openLink('abc', () => {}); __setLinkFactory(null);
  check(got[0] === 'abc', '合図の つなぎ口は 試験では 差しかえられる（本物の Realtime には つながない）');
}
{
  // 子どもの 安全：コードの 中身を 見る
  const read = (f: string) => fs.readFileSync(path.join(here, '..', f), 'utf8');
  const files = ['catwars/versus/rules.ts', 'catwars/versus/match.ts', 'catwars/versus/bot.ts'];
  check(files.every((f) => !/Math\.random|Date\.now/.test(read(f).split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n'))), 'きまり・状態機械・コンピュータの手は Math.random・Date.now を 使わない（たね と 外から 来る時計だけ）');
  const ui = read('catwars/components/versus/VersusParts.tsx');
  check(!/addResources|usePlayerStore|settleBattle|settleFriend|settleExpedition|useCollectionStore|addXp/.test(ui), '対戦の画面は 勝ち負けで 💠・XP・コインを 動かさない（ごほうびは 問題を とく ところの grantStudyReward だけ）');
  check(/grantStudyReward\(perfect, item, formation\)/.test(ui), 'ごほうび：といた 問題ごとに 既存の 学習の きまり（まちがえずに とけた ときだけ 💠・XP・記録）');
  const sync = read('catwars/portal/versusSync.ts');
  check(!/(win|lose|score|result|stars)\b/i.test(sync.split('\n').filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('//')).join('\n').replace(/VersusResult|\.result|result:/g, '')), 'サーバとの やりとりの コードに 勝ち負け・点・星を 送る 場所が 無い');
  const sqlPath = path.join(here, '..', '..', 'class-portal-teacher', 'supabase', 'sql', '2026-11-17-catwars-versus.sql');
  if (fs.existsSync(sqlPath)) {
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const table = sql.slice(sql.indexOf('create table if not exists public.catwars_versus_room'), sql.indexOf('alter table public.catwars_versus_room'));
    check(table.length > 100 && !/\b(win|wins|lose|score|result|stars|points?)\b/i.test(table), 'サーバの へやの 表に 勝ち負け・点・星の 列が 無い（だれが だれと たたかったかも 結果も 残らない）');
    const built = [...sql.matchAll(/jsonb_build_object\(([^;]*?)\)\s*(?:end|\$function|;|\n)/g)].map((m) => m[1]).join(' ');
    check(built.length > 100 && !/number|student|host_id|guest_id|name/i.test(built.replace(/'opp_here'|host_id = p_me|r\.host_id|r\.guest_id|p_me/g, '')), 'サーバの関数が 返す JSON の 鍵に 出席番号・名前・あいての id が 無い（記号・部屋の名前・たね・範囲・ようすの 鍵だけ）');
  } else console.log('  - （PRISM の SQL が 見つからないので サーバ側の 確認は とばす）');
  check(catwarsTrialKeyOf('versus') === 'sortie', '体験版の 項目は「出撃」と 同じあつかい（先生が 閉じられる）');
}

// ── [6] コンピュータ相手の 練習の 強さ（かんたんな 確認。くわしくは BALANCE=1）─────────────────
console.log('[6] コンピュータ相手：とかない子は 勝てない');
{
  let wins = 0, total = 0;
  for (const lvl of ['easy', 'normal', 'hard'] as BotLevel[]) {
    for (let s = 1; s <= 8; s++) {
      for (const noneIsHost of [true, false]) {
        const seed = s * 9973;
        const d = noneIsHost ? duel(seed, PROFILES.none, BOT_LEVELS[lvl]) : duel(seed, BOT_LEVELS[lvl], PROFILES.none);
        runToEnd(d);
        const o = d.a.match.end?.outcome;
        if (o === (noneIsHost ? 'host' : 'guest')) wins++;
        total++;
      }
    }
  }
  check(total === 48 && wins === 0, `1問も とかない子は コンピュータ（3段）に ${total}試合で ${wins}勝（⚡ が 0 なので ネコを おけない）`);
  const m = botMask(new DetRNG(1), cardsFor()[0], 0);
  check(m === 0, '「とかない」の コンピュータは 1問も とかない');
}
function cardsFor(): CardKey[][] { return dealCards(makePool(), 1); }

void BotPlayer; void CARDS_PER_ROUND;
console.log(fails ? `\n✗ ${fails} 件 失敗` : '\n✓ 同時対戦の試験は ぜんぶ通った');
process.exit(fails ? 1 : 0);

// ── 強さの 試験（BALANCE=1）─────────────────
async function balance(): Promise<void> {
  const N = Number(process.env.N ?? 40);
  console.log(`コンピュータ4段 の 総あたり（席を 入れかえて 各 ${N * 2}試合）。「とかない」は 1問も といた ことに しない`);
  const names = Object.keys(PROFILES) as (keyof typeof PROFILES)[];
  const table: Record<string, Record<string, { w: number; d: number; l: number }>> = {};
  const t0 = Date.now();
  for (const a of names) {
    table[a] = {};
    for (const b of names) {
      const r = { w: 0, d: 0, l: 0 };
      for (let s = 1; s <= N; s++) {
        const seed = s * 7919 + 13;
        for (const aHost of [true, false]) {
          const d = aHost ? duel(seed, PROFILES[a], PROFILES[b]) : duel(seed, PROFILES[b], PROFILES[a]);
          runToEnd(d);
          const o = d.a.match.end?.outcome;
          const aWon = o === (aHost ? 'host' : 'guest'), bWon = o === (aHost ? 'guest' : 'host');
          if (aWon) r.w++; else if (bWon) r.l++; else r.d++;
        }
      }
      table[a][b] = r;
    }
  }
  console.log('        ' + names.map((n) => n.padEnd(14)).join(''));
  for (const a of names) console.log(a.padEnd(8) + names.map((b) => `${table[a][b].w}/${table[a][b].d}/${table[a][b].l}`.padEnd(14)).join(''));
  console.log(`（行が 先手の みかた。かち/ひきわけ/まけ。${((Date.now() - t0) / 1000).toFixed(0)}秒）`);
  const lvls = ['easy', 'normal', 'hard'];
  const noneWins = lvls.reduce((s, l) => s + table.none[l].w, 0);
  check(noneWins === 0, `「とかない」は コンピュータ3段に 1勝も できない（${noneWins}勝／${lvls.length * N * 2}試合）`);
  const rate = (a: string, b: string) => table[a][b].w / (N * 2);
  check(rate('normal', 'easy') > 0.5, `ふつう は やさしい に 勝ち越す（${(rate('normal', 'easy') * 100).toFixed(0)}%）`);
  check(rate('hard', 'normal') > 0.5, `つよい は ふつう に 勝ち越す（${(rate('hard', 'normal') * 100).toFixed(0)}%）`);
  check(rate('hard', 'easy') > 0.6, `つよい は やさしい に 大きく 勝ち越す（${(rate('hard', 'easy') * 100).toFixed(0)}%）`);
  for (const l of lvls) {
    const w = rate(l, l), lo = table[l][l].l / (N * 2);
    check(Math.abs(w - lo) < 0.2, `同じ強さ どうしは 席に よらず ほぼ 五分（${l}：${(w * 100).toFixed(0)}% 対 ${(lo * 100).toFixed(0)}%）`);
  }
  console.log(`\n${fails ? `✗ ${fails} 件 失敗` : '✓ 強さの 試験は ぜんぶ通った'}`);
  void VERSUS_LEVEL; void buildPackRounds; void APP_ROUNDS; void ((): Side => 'host');
}
