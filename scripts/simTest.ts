/**
 * CAT-WARS シミュレーションの決定論テスト
 *
 *   npm run test:sim
 *
 * ロックステップ同期は「決定論が壊れた瞬間に静かに破綻する」ので、
 * 回帰を自動で捕まえられるようにしておく。ここが緑でないかぎり
 * PvP は成立しない。
 */
import { SimRunner, CommandProvider } from '../catwars/sim/runner';
import { buildSimConfig } from '../catwars/sim/setup';
import { stateChecksum, dumpState } from '../catwars/sim/checksum';
import { SimCommand, TICK_MS, PlayerId } from '../catwars/sim/types';
import { CAMPAIGN } from '../catwars/data/campaign';
import { BATTLE_MAP_BY_ID } from '../catwars/data/battleMaps';
import { BuildingType } from '../catwars/types';
import { DetRNG } from '../catwars/sim/rng';
import { LockstepSession, BUCKET_TICKS, recommendedInputDelayTicks } from '../catwars/net/lockstep';
import { LocalBus } from '../catwars/net/transport';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * この試験は 戦闘の計算（再現性・フレームの刻み・同期）を確かめるもので、経済は見ない。
 * キャンペーンは 自動収入なし（問題を解いて手に入れる）なので、そのままだと 台本どおりにネコを出せず、
 * 試験が見たい長さまで戦闘が続かない。試験用に、前と同じ エナジー（はじめ260・毎秒7.5）を持たせる。
 */
const SIM_TEST_DIFFICULTY = <T extends { startEnergy: number; energyPerSec: number }>(d: T): T =>
  ({ ...d, startEnergy: 260, energyPerSec: 7.5 });

let failures = 0;
function check(name: string, ok: boolean, detail = ''): void {
  console.log(`${ok ? '  ✅' : '  ❌'} ${name}${detail ? '  ' + detail : ''}`);
  if (!ok) failures++;
}

// ── 共通のセットアップ ────────────────────────────────────────────────

const CHAPTER_INDEX = 3; // 第4章: 壁の要塞＋流星（ギミックが多く、ズレが出やすい）

function makeSetup(chapterIndex = CHAPTER_INDEX, seed = 424242) {
  const ch = CAMPAIGN[chapterIndex];
  const map = BATTLE_MAP_BY_ID[ch.mapId];
  const cfg = buildSimConfig({
    mode: 'PVE', seed, chapter: ch, difficulty: SIM_TEST_DIFFICULTY(ch.difficulty), battleMap: map,
    p1: { stages: { barbarian: 2, giant: 2 }, buffs: { values: { POWER_BOOST: 10, HEAL_AURA: 5 } } },
  });
  const init = {
    defenderBuildings: map.enemyBase,
    playerBuildings: [
      { type: BuildingType.TOWN_HALL, x: 0, y: 7 },
      { type: BuildingType.CANNON, x: 2, y: 4 },
    ],
    spellCharges: { P1: { HEAL: 2, RAGE: 2 }, P2: { HEAL: 0, RAGE: 0 } },
  };
  return { ch, map, cfg, init };
}

/** tick番号でコマンドを引くプロバイダ（フレーム刻みに依存しない） */
class TickScript implements CommandProvider {
  constructor(private script: Map<number, SimCommand[]>) {}
  commandsForTick(tick: number): SimCommand[] {
    return this.script.get(tick) ?? [];
  }
}

/** 決定論的にランダムなコマンド列を作る */
function makeScript(seed: number, ticks: number): Map<number, SimCommand[]> {
  const rng = new DetRNG(seed);
  const troops = ['barbarian', 'archer', 'giant', 'speed', 'bomber'];
  const script = new Map<number, SimCommand[]>();
  for (let t = 2; t < ticks; t += 6 + rng.int(10)) {
    const cmds: SimCommand[] = [];
    const roll = rng.next();
    if (roll < 0.7) {
      cmds.push({
        type: 'DEPLOY', player: 'P1',
        troopId: troops[rng.int(troops.length)],
        x: rng.int(4), y: rng.int(16),
      });
    } else if (roll < 0.85) {
      cmds.push({ type: 'CAST_SPELL', player: 'P1', spell: rng.next() < 0.5 ? 'HEAL' : 'RAGE', x: 8 + rng.int(10), y: rng.int(16) });
    } else {
      cmds.push({ type: 'BUILD', player: 'P1', building: BuildingType.WALL, x: rng.int(4), y: rng.int(16) });
    }
    script.set(t, cmds);
  }
  return script;
}

/** 固定刻みで最後まで回し、全tickのチェックサムを返す */
function runFixed(ticks: number, seed = 424242, scriptSeed = 777): { sums: number[]; runner: SimRunner } {
  const { cfg, init } = makeSetup(CHAPTER_INDEX, seed);
  const runner = new SimRunner(cfg, init);
  const provider = new TickScript(makeScript(scriptSeed, ticks));
  const sums: number[] = [];
  for (let i = 0; i < ticks; i++) {
    runner.advance(TICK_MS, provider);
    sums.push(stateChecksum(runner.state));
    if (runner.state.result) break;
  }
  return { sums, runner };
}

// ── テスト1: リプレイ一致 ─────────────────────────────────────────────

console.log('\n[1] リプレイ一致（同じseed＋同じコマンド列 → 同じ結果）');
{
  const TICKS = 2400; // 120秒ぶん
  const a = runFixed(TICKS);
  const b = runFixed(TICKS);
  const same = a.sums.length === b.sums.length && a.sums.every((v, i) => v === b.sums[i]);
  check('全tickのチェックサムが一致', same, `${a.sums.length} tick`);
  if (!same) {
    const i = a.sums.findIndex((v, j) => v !== b.sums[j]);
    console.log(`     最初の相違: tick ${i + 1}`);
    console.log(dumpState(a.runner.state).split('\n').slice(0, 6).join('\n'));
  }
  check('決着まで到達 or 十分に進行', a.sums.length > 100, `結果=${a.runner.state.result ?? '継続中'}`);

  // seed が違えば結果も違うこと（テスト自体が無意味になっていないかの確認）
  const c = runFixed(TICKS, 999999);
  check('seedを変えると結果が変わる（テストの妥当性）',
    a.sums[a.sums.length - 1] !== c.sums[c.sums.length - 1]);
}

// ── テスト2: 可変フレームレート耐性 ──────────────────────────────────

console.log('\n[2] 可変フレームレート耐性（実時間の刻み方を変えても同じ結果）');
{
  const TOTAL_MS = 60000;
  const { cfg, init } = makeSetup();
  const script = makeScript(777, 4000);

  function runWithDeltas(deltas: number[]): { tick: number; sum: number } {
    const runner = new SimRunner(cfg, init);
    const provider = new TickScript(script);
    for (const d of deltas) {
      runner.advance(d, provider);
      if (runner.state.result) break;
    }
    return { tick: runner.tick, sum: stateChecksum(runner.state) };
  }

  // 60fps 相当（16.67ms）
  const steady60: number[] = [];
  for (let t = 0; t < TOTAL_MS; t += 16.67) steady60.push(16.67);
  // 120fps 相当（8.33ms）— 旧実装ではここで2倍速になっていた
  const steady120: number[] = [];
  for (let t = 0; t < TOTAL_MS; t += 8.33) steady120.push(8.33);
  // 不規則（5〜120ms のジッタ）。合計は他と揃えて **ちょうど TOTAL_MS** にする
  // （合計がずれると当然 tick 数もずれるので、それはテストの不備であって
  //   シミュレーションの不一致ではない）
  const rng = new DetRNG(31337);
  const jittery: number[] = [];
  let acc = 0;
  while (acc < TOTAL_MS) {
    const d = Math.min(5 + rng.next() * 115, TOTAL_MS - acc);
    jittery.push(d);
    acc += d;
  }

  const a = runWithDeltas(steady60);
  const b = runWithDeltas(steady120);
  const c = runWithDeltas(jittery);

  check('60fps と 120fps で同じ tick に到達', a.tick === b.tick, `60fps=${a.tick} 120fps=${b.tick}`);
  check('60fps と 120fps で状態が一致', a.sum === b.sum);
  check('不規則なフレーム刻みでも一致', a.tick === c.tick && a.sum === c.sum, `jitter=${c.tick}`);
  const expected = Math.floor(TOTAL_MS / TICK_MS);
  check('経過実時間から期待される tick 数に一致', Math.abs(a.tick - expected) <= 2, `実測=${a.tick} 期待=${expected}`);
}

// ── テスト3: 2インスタンスのロックステップ ────────────────────────────

console.log('\n[3] 2インスタンスのロックステップ同期');
{
  function runPair(latencyTicks: number, inputDelay: number, ticks: number) {
    const { cfg, init } = makeSetup();
    const bus = new LocalBus(latencyTicks);
    const players: PlayerId[] = ['P1', 'P2'];
    const r1 = new SimRunner({ ...cfg, mode: 'PVP' }, init);
    const r2 = new SimRunner({ ...cfg, mode: 'PVP' }, init);
    const s1 = new LockstepSession(bus.transportFor('P1'), players, { inputDelayTicks: inputDelay });
    const s2 = new LockstepSession(bus.transportFor('P2'), players, { inputDelayTicks: inputDelay });

    const rng = new DetRNG(5150);
    const sums1: number[] = [], sums2: number[] = [];
    let stalls = 0;

    for (let frame = 0; frame < ticks * 3; frame++) {
      // 操作を発行（互いに相手の陣地へ攻め込む）
      if (frame % 9 === 0) {
        s1.issue({ type: 'DEPLOY', player: 'P1', troopId: 'barbarian', x: rng.int(4), y: rng.int(16) }, r1.tick);
      }
      if (frame % 11 === 0) {
        s2.issue({ type: 'DEPLOY', player: 'P2', troopId: 'archer', x: 27 - rng.int(4), y: rng.int(16) }, r2.tick);
      }

      s1.flush(r1.tick, () => ({ tick: r1.tick, sum: stateChecksum(r1.state) }));
      s2.flush(r2.tick, () => ({ tick: r2.tick, sum: stateChecksum(r2.state) }));
      bus.pump();

      const a1 = r1.advance(TICK_MS, s1);
      const a2 = r2.advance(TICK_MS, s2);
      if (a1.stalled || a2.stalled) stalls++;

      s1.recordChecksum(r1.tick, stateChecksum(r1.state));
      s2.recordChecksum(r2.tick, stateChecksum(r2.state));
      sums1[r1.tick] = stateChecksum(r1.state);
      sums2[r2.tick] = stateChecksum(r2.state);

      s1.prune(r1.tick); s2.prune(r2.tick);
      if (r1.state.result || r2.state.result) break;
      if (r1.tick >= ticks && r2.tick >= ticks) break;
    }

    return { r1, r2, s1, s2, sums1, sums2, stalls };
  }

  const TICKS = 600; // 30秒ぶん
  const res = runPair(2, 6, TICKS);
  check('両者が同じ tick まで進んだ', res.r1.tick === res.r2.tick, `P1=${res.r1.tick} P2=${res.r2.tick}`);

  let firstDiff = -1;
  for (let t = 1; t <= Math.min(res.r1.tick, res.r2.tick); t++) {
    if (res.sums1[t] !== undefined && res.sums2[t] !== undefined && res.sums1[t] !== res.sums2[t]) { firstDiff = t; break; }
  }
  check('全tickでチェックサムが一致', firstDiff === -1, firstDiff === -1 ? `${res.r1.tick} tick 検証` : `tick ${firstDiff} で相違`);
  check('デシンク検出が発火していない', res.s1.status.kind !== 'DESYNC' && res.s2.status.kind !== 'DESYNC');
  check('両者のエンティティ数が一致', res.r1.state.entities.length === res.r2.state.entities.length,
    `${res.r1.state.entities.length} 体`);
  check('P2の部隊が実際に出撃している（PvP経路が動いている）',
    res.r1.state.entities.some(e => e.team === 'DEFENDER' && e.type === 'TROOP'));

  // 遅延を大きくして、推奨入力遅延なら耐えられることを見る
  const rtt = 300;
  const delay = recommendedInputDelayTicks(rtt);
  const far = runPair(Math.ceil((rtt / 2) / TICK_MS), delay, 300);
  check(`RTT ${rtt}ms 相当（推奨入力遅延 ${delay}tick = ${delay * TICK_MS}ms）でも同期`,
    far.r1.tick === far.r2.tick && far.sums1[far.r1.tick] === far.sums2[far.r2.tick],
    `P1=${far.r1.tick} P2=${far.r2.tick}`);
  check('入力遅延はバケット長より大きい（届くのが間に合う条件）', delay > BUCKET_TICKS, `${delay} > ${BUCKET_TICKS}`);
}

// ── テスト4: デシンク検出そのものが機能するか ──────────────────────────

console.log('\n[4] デシンク検出（わざと状態を壊して、検出できるか）');
{
  const { cfg, init } = makeSetup();
  const bus = new LocalBus(0);
  const players: PlayerId[] = ['P1', 'P2'];
  const r1 = new SimRunner({ ...cfg, mode: 'PVP' }, init);
  const r2 = new SimRunner({ ...cfg, mode: 'PVP' }, init);
  const s1 = new LockstepSession(bus.transportFor('P1'), players, { inputDelayTicks: 6, checksumEveryBuckets: 1 });
  const s2 = new LockstepSession(bus.transportFor('P2'), players, { inputDelayTicks: 6, checksumEveryBuckets: 1 });

  let injected = false;
  for (let frame = 0; frame < 400; frame++) {
    if (frame % 9 === 0) s1.issue({ type: 'DEPLOY', player: 'P1', troopId: 'barbarian', x: 1, y: 7 }, r1.tick);
    s1.flush(r1.tick, () => ({ tick: r1.tick, sum: stateChecksum(r1.state) }));
    s2.flush(r2.tick, () => ({ tick: r2.tick, sum: stateChecksum(r2.state) }));
    bus.pump();
    r1.advance(TICK_MS, s1);
    r2.advance(TICK_MS, s2);

    // 40tick 目で P2 の状態だけこっそり壊す（＝浮動小数点のズレの模擬）
    if (!injected && r2.tick >= 40 && r2.state.entities.length > 0) {
      r2.state.entities[0].hp -= 0.5;
      injected = true;
    }
    s1.recordChecksum(r1.tick, stateChecksum(r1.state));
    s2.recordChecksum(r2.tick, stateChecksum(r2.state));
    if (s1.status.kind === 'DESYNC' || s2.status.kind === 'DESYNC') break;
  }
  const detected = s1.status.kind === 'DESYNC' || s2.status.kind === 'DESYNC';
  check('注入したズレを検出した', detected,
    detected ? `tick ${(s1.status as any).tick ?? (s2.status as any).tick}` : '検出できず');
}

// ── テスト5: 禁止された数学関数を使っていないか（静的チェック）─────────

console.log('\n[5] シミュレーション内で実装依存の数学関数を使っていないか');
{
  const simDir = fileURLToPath(new URL('../catwars/sim', import.meta.url));
  const banned = ['Math.pow', 'Math.hypot', 'Math.atan2', 'Math.sin', 'Math.cos', 'Math.tan',
                  'Math.exp', 'Math.log', 'Math.cbrt', 'Math.random', 'Date.now'];
  const offenders: string[] = [];
  for (const f of fs.readdirSync(simDir)) {
    if (!f.endsWith('.ts')) continue;
    const src = fs.readFileSync(path.join(simDir, f), 'utf8');
    // コメント行は除外して調べる
    const code = src.split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
      .join('\n');
    for (const b of banned) if (code.includes(b)) offenders.push(`${f}: ${b}`);
  }
  check('catwars/sim/ に禁止関数なし', offenders.length === 0, offenders.join(', '));
}

// ── テスト6: PvP対戦セットアップ（両者が同一の SimConfig を作れるか）───────

console.log('\n[6] PvP対戦セットアップ（ホストとゲストが同じ設定に到達するか）');
{
  const { PVP_MAPS, PVP_MAP_BY_ID, mirrorBase } = await import('../catwars/data/battleMaps');
  const { PVP_DIFFICULTY } = await import('../catwars/data/campaign');
  const { BUILDING_STATS } = await import('../catwars/constants');
  const { GRID_W } = await import('../catwars/types');

  // 部屋のドキュメント（両者がFirestoreから読む、まったく同じデータ）
  const roomDoc = {
    seed: 3141592653,
    mapId: 'pvp-mirror',
    host: {
      name: 'ホスト', stages: { barbarian: 2 as const }, buffs: { POWER_BOOST: 10 },
      base: [{ type: BuildingType.TOWN_HALL, x: 0, y: 7 }, { type: BuildingType.CANNON, x: 3, y: 4 }],
      spells: { HEAL: 2, RAGE: 2 },
    },
    guest: {
      name: 'ゲスト', stages: { archer: 3 as const }, buffs: { SWIFT_ARMY: 8 },
      base: [{ type: BuildingType.TOWN_HALL, x: 0, y: 7 }, { type: BuildingType.CANNON, x: 2, y: 11 }],
      spells: { HEAL: 2, RAGE: 2 },
    },
  };

  // 両クライアントが「部屋のデータだけ」から独立に設定を組み立てる
  const buildFromRoom = () => {
    const map = PVP_MAP_BY_ID[roomDoc.mapId];
    const cfg = buildSimConfig({
      mode: 'PVP', seed: roomDoc.seed,
      chapter: { enemyName: roomDoc.guest.name },
      difficulty: PVP_DIFFICULTY, battleMap: map,
      p1: { stages: roomDoc.host.stages, buffs: { values: roomDoc.host.buffs } },
      p2: { stages: roomDoc.guest.stages, buffs: { values: roomDoc.guest.buffs } },
    });
    const widthOf = (t: BuildingType) => BUILDING_STATS[t].width;
    return {
      config: cfg,
      init: {
        playerBuildings: roomDoc.host.base,
        defenderBuildings: mirrorBase(roomDoc.guest.base, widthOf),
        spellCharges: { P1: roomDoc.host.spells, P2: roomDoc.guest.spells },
      },
    };
  };

  const asHost = buildFromRoom();
  const asGuest = buildFromRoom();
  check('ホスト側とゲスト側の SimConfig が完全に一致',
    JSON.stringify(asHost.config) === JSON.stringify(asGuest.config));
  check('ホスト側とゲスト側の初期配置が完全に一致',
    JSON.stringify(asHost.init) === JSON.stringify(asGuest.init));

  // 進化段階の違いが実際に反映されているか（設定が素通りしていないかの確認）
  check('P1とP2で異なるユニット性能になっている（設定が効いている）',
    asHost.config.unitStats.P1.barbarian.hp !== asHost.config.unitStats.P2.barbarian.hp ||
    asHost.config.unitStats.P1.archer.hp !== asHost.config.unitStats.P2.archer.hp);

  // マップの左右対称性
  for (const m of PVP_MAPS) {
    const set = new Set(m.terrain.map(t => `${t.x},${t.y},${t.type}`));
    const sym = m.terrain.every(t => set.has(`${GRID_W - 1 - t.x},${t.y},${t.type}`));
    check(`${m.id} の地形が左右対称`, sym, `${m.terrain.length}マス`);
  }

  // ミラーした陣地が右半分に収まり、元と鏡像関係にあること
  const widthOf = (t: BuildingType) => BUILDING_STATS[t].width;
  const mirrored = mirrorBase(roomDoc.guest.base, widthOf);
  const okMirror = roomDoc.guest.base.every((b, i) => {
    const w = widthOf(b.type);
    return mirrored[i].x === GRID_W - b.x - w
        && mirrored[i].x + w - 1 === GRID_W - 1 - b.x
        && mirrored[i].x >= GRID_W / 2;
  });
  check('ゲストの陣地が正しく右半分へ鏡写しされる', okMirror);

  // 実際に PvP を1試合まわして、両者が同じ結末に至るか
  const bus2 = new LocalBus(2);
  const r1 = new SimRunner(asHost.config, asHost.init);
  const r2 = new SimRunner(asGuest.config, asGuest.init);
  const s1 = new LockstepSession(bus2.transportFor('P1'), ['P1', 'P2'], { inputDelayTicks: 8 });
  const s2 = new LockstepSession(bus2.transportFor('P2'), ['P1', 'P2'], { inputDelayTicks: 8 });
  const rng2 = new DetRNG(24680);
  for (let frame = 0; frame < 4000; frame++) {
    if (frame % 7 === 0) s1.issue({ type: 'DEPLOY', player: 'P1', troopId: 'barbarian', x: rng2.int(6), y: rng2.int(16) }, r1.tick);
    if (frame % 7 === 3) s2.issue({ type: 'DEPLOY', player: 'P2', troopId: 'archer', x: 27 - rng2.int(6), y: rng2.int(16) }, r2.tick);
    s1.flush(r1.tick, () => ({ tick: r1.tick, sum: stateChecksum(r1.state) }));
    s2.flush(r2.tick, () => ({ tick: r2.tick, sum: stateChecksum(r2.state) }));
    bus2.pump();
    r1.advance(TICK_MS, s1); r2.advance(TICK_MS, s2);
    s1.recordChecksum(r1.tick, stateChecksum(r1.state));
    s2.recordChecksum(r2.tick, stateChecksum(r2.state));
    s1.prune(r1.tick); s2.prune(r2.tick);
    if (r1.state.result && r2.state.result) break;
  }
  check('PvP1試合を通して両者の状態が一致',
    r1.tick === r2.tick && stateChecksum(r1.state) === stateChecksum(r2.state),
    `${r1.tick} tick`);
  check('両者が同じ勝敗を得た', r1.state.result === r2.state.result,
    `P1側=${r1.state.result ?? '継続'} P2側=${r2.state.result ?? '継続'}`);
  check('決着がついた（PvPの勝利条件が機能している）', r1.state.result !== null,
    `勝者=${r1.state.result}`);
}

console.log(failures === 0
  ? '\n✅ すべて成功\n'
  : `\n❌ ${failures} 件の失敗\n`);
process.exit(failures === 0 ? 0 : 1);
