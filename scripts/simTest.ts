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
import {
  CAMPAIGN, ENEMY_UNIT_STATS, EnemyUnitKind, GUARD_MAGIC_MULT, GUARD_PHYSICAL_MULT, MEDIC_HEAL_PCT,
  SHIELD_DAMAGE_MULT, tierDifficulty,
} from '../catwars/data/campaign';
import { levelMult, CHARACTER_BY_ID } from '../catwars/data/characters';
import { facilityMult } from '../catwars/data/facilities';
import { BUILDING_STATS as BSTATS } from '../catwars/constants';
import { BATTLE_MAP_BY_ID, tierEnemyBase } from '../catwars/data/battleMaps';
import type { BattleEntity } from '../catwars/types';
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
    p1: { levels: { barbarian: 10, giant: 10 }, buffs: { values: { POWER_BOOST: 10, HEAL_AURA: 5 } } },
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
      name: 'ホスト', levels: { barbarian: 10 }, buffs: { POWER_BOOST: 10 },
      base: [{ type: BuildingType.TOWN_HALL, x: 0, y: 7 }, { type: BuildingType.CANNON, x: 3, y: 4 }],
      spells: { HEAL: 2, RAGE: 2 },
    },
    guest: {
      name: 'ゲスト', levels: { archer: 30 }, buffs: { SWIFT_ARMY: 8 },
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
      p1: { levels: roomDoc.host.levels, buffs: { values: roomDoc.host.buffs } },
      p2: { levels: roomDoc.guest.levels, buffs: { values: roomDoc.guest.buffs } },
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

// ── テスト7: 新しい敵のきまり（盾持ち・空中・自爆・回復役）とボスのシールド ─────────

console.log('\n[7] 新しい敵のきまり（盾持ち・空中・自爆・回復役・ボスのシールド）');
{
  // 小さな試合場：敵の増援は出さない（firstSpawnDelayMs を大きく）。敵の基地はコアだけ、自軍もコアだけ
  const ch = CAMPAIGN[0];
  const map = BATTLE_MAP_BY_ID[ch.mapId];
  const arena = () => {
    const cfg = buildSimConfig({
      mode: 'PVE', seed: 99, chapter: ch,
      difficulty: { ...ch.difficulty, firstSpawnDelayMs: 99999999, enemyHpMult: 1, enemyDamageMult: 1, startEnergy: 0, energyPerSec: 0 },
      battleMap: map,
      p1: { levels: {}, buffs: { values: {} } },
    });
    const runner = new SimRunner(cfg, {
      defenderBuildings: [{ type: BuildingType.TOWN_HALL, x: 26, y: 1 }],
      playerBuildings: [{ type: BuildingType.TOWN_HALL, x: 0, y: 13 }],
      spellCharges: { P1: { HEAL: 0, RAGE: 0 }, P2: { HEAL: 0, RAGE: 0 } },
    });
    runner.state.started = true;
    return runner;
  };
  let n = 0;
  /** 敵を置く（still＝動かない・こうげきしない） */
  const enemy = (r: SimRunner, kind: EnemyUnitKind, x: number, y: number, still = true, extra: Partial<BattleEntity> = {}): BattleEntity => {
    const st = ENEMY_UNIT_STATS[kind];
    const e: BattleEntity = {
      id: `zz-e${n++}`, type: 'TROOP', subType: st.subType, x, y, hp: st.hp, maxHp: st.hp,
      damage: still ? 0 : st.damage, team: 'DEFENDER', kind,
      attackRange: st.attackRange, attackSpeed: st.attackSpeed, lastAttack: -999999,
      moveSpeed: still ? 0 : st.moveSpeed, targetPreference: 'ANY', path: [], ...extra,
    };
    r.state.entities.push(e);
    return e;
  };
  /** ネコを置く（cfg の性能のまま。still＝動かない） */
  const cat = (r: SimRunner, id: string, x: number, y: number, extra: Partial<BattleEntity> = {}): BattleEntity => {
    const line = r.cfg.unitStats.P1[id];
    const e: BattleEntity = {
      id: `zz-c${n++}`, type: 'TROOP', subType: id, x, y, hp: line.hp, maxHp: line.hp,
      damage: line.damage, team: 'ATTACKER', attackRange: line.attackRange,
      attackSpeed: Math.round(line.attackSpeed), lastAttack: -999999, moveSpeed: 0,
      targetPreference: 'ANY', path: [], ...extra,
    };
    r.state.entities.push(e);
    return e;
  };
  const NONE = new TickScript(new Map());
  const run = (r: SimRunner, ticks: number, provider: CommandProvider = NONE) => { for (let i = 0; i < ticks; i++) r.advance(TICK_MS, provider); };
  /** 最初に こうげきを うけるまで進めて、へった HP を返す */
  const firstHit = (r: SimRunner, target: BattleEntity, max = 80): number => {
    const hp0 = target.hp;
    for (let i = 0; i < max && target.hp === hp0; i++) r.advance(TICK_MS, NONE);
    return hp0 - target.hp;
  };
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

  // 盾持ち：魔法いがいは半分、魔法は1.5倍
  {
    const r = arena();
    const g = enemy(r, 'guard', 14, 7);
    const a = cat(r, 'archer', 12, 7);
    const lost = firstHit(r, g);
    check('盾持ち：遠距離（魔法いがい）の こうげきは 半分', near(lost, a.damage * GUARD_PHYSICAL_MULT), `うけた=${lost.toFixed(1)} 元=${a.damage}`);
  }
  {
    const r = arena();
    const g = enemy(r, 'guard', 14, 7);
    const m = cat(r, 'magic', 12, 7);
    const lost = firstHit(r, g);
    check('盾持ち：魔法は 1.5倍', near(lost, m.damage * GUARD_MAGIC_MULT), `うけた=${lost.toFixed(1)} 元=${m.damage}`);
  }

  // 空中：近接のネコは こうげきしない・遠距離は当たる
  {
    const r = arena();
    const f = enemy(r, 'flyer', 14, 7);
    cat(r, 'barbarian', 13.2, 7);
    run(r, 60);
    check('空中：近接のネコ（射程2未満）は 空中の敵を こうげきしない', f.hp === f.maxHp, `HP ${f.hp}/${f.maxHp}`);
  }
  {
    const r = arena();
    const f = enemy(r, 'flyer', 14, 7);
    cat(r, 'archer', 12, 7);
    run(r, 60);
    check('空中：遠距離のネコの こうげきは 当たる', f.hp < f.maxHp, `HP ${f.hp.toFixed(0)}/${f.maxHp}`);
  }

  // 自爆：ネコは ねらわず、施設に当たって消える
  {
    const r = arena();
    const core = r.state.entities.find(e => e.team === 'ATTACKER_BUILDING')!;
    const coreHp = core.hp;
    const k = enemy(r, 'kamikaze', 6, 13, false);
    // 施設より近くに、こうげきしないネコを置く（ねらわれないこと。通り道には置かない＝体でとめてしまうため）
    const c = cat(r, 'giant', 6, 11, { damage: 0 });
    run(r, 120);
    const gone = !r.state.entities.includes(k);
    check('自爆：施設に つっこんで ダメージを与える', core.hp < coreHp, `コア ${coreHp} → ${core.hp.toFixed(0)}`);
    check('自爆：ばくはつしたら 消える（1回きり）', gone);
    check('自爆：ネコは ねらわない', c.hp === c.maxHp, `ネコ HP ${c.hp}/${c.maxHp}`);
  }

  // 回復役：2.5マスの中の味方を 最大HPの8% 回復。外は回復しない
  {
    const r = arena();
    enemy(r, 'medic', 14, 7);
    const inside = enemy(r, 'grunt', 15, 7);
    const outside = enemy(r, 'grunt', 14, 12);
    inside.hp = inside.maxHp / 2; outside.hp = outside.maxHp / 2;
    run(r, 45); // 2.25秒（2秒ごとに1回）
    const healed = inside.hp - inside.maxHp / 2;
    check('回復役：まわりの味方を 最大HPの8% 回復する', near(healed, inside.maxHp * MEDIC_HEAL_PCT),
      `+${healed.toFixed(1)}（1回=${(inside.maxHp * MEDIC_HEAL_PCT).toFixed(1)}）`);
    check('回復役：はなれた味方は回復しない', outside.hp === outside.maxHp / 2);
  }

  // ボスのシールド：あるあいだは1割しか通らない。BREAK_SHIELD で1枚へる
  {
    const r = arena();
    const b = enemy(r, 'boss', 14, 7, true, { shield: 2 });
    const a = cat(r, 'archer', 12, 7);
    const lost = firstHit(r, b);
    check('シールド：あるあいだは ダメージが1割', near(lost, a.damage * SHIELD_DAMAGE_MULT), `うけた=${lost.toFixed(2)} 元=${a.damage}`);
    const t = r.tick + 1;
    run(r, 2, new TickScript(new Map([[t, [{ type: 'BREAK_SHIELD', player: 'P1' }]]])));
    check('シールド：BREAK_SHIELD で1枚へる', b.shield === 1, `のこり ${b.shield}`);
    run(r, 2, new TickScript(new Map([[r.tick + 1, [{ type: 'BREAK_SHIELD', player: 'P1' }]]])));
    const lost2 = firstHit(r, b);
    check('シールド：ぜんぶ われたら ふつうに通る', b.shield === 0 && near(lost2, a.damage), `うけた=${lost2.toFixed(1)}`);
  }
}

// ── テスト8: 難易度の段（新しい敵・ボスのシールドつき）でも決定論 ─────────────────

console.log('\n[8] げきむず（新しい敵・ボスのシールド・足した砲台）でも、同じseed＋同じコマンド列 → 同じ結果');
{
  const run8 = (seed: number) => {
    const ch = CAMPAIGN[7];
    const map = BATTLE_MAP_BY_ID[ch.mapId];
    const d = tierDifficulty(ch, 'extreme');
    const cfg = buildSimConfig({
      mode: 'PVE', seed, chapter: ch, difficulty: SIM_TEST_DIFFICULTY({ ...d, bossAtSpawnCount: 6 }), battleMap: map,
      p1: { levels: { barbarian: 10, archer: 10, magic: 10 }, buffs: { values: {} } },
    });
    const runner = new SimRunner(cfg, {
      defenderBuildings: tierEnemyBase(map, 'extreme'),
      playerBuildings: [{ type: BuildingType.TOWN_HALL, x: 0, y: 7 }],
      spellCharges: { P1: { HEAL: 2, RAGE: 2 }, P2: { HEAL: 0, RAGE: 0 } },
    });
    const script = makeScript(4242, 2400);
    for (let t = 300; t < 2400; t += 97) script.set(t, [...(script.get(t) ?? []), { type: 'BREAK_SHIELD', player: 'P1' }]);
    const provider = new TickScript(script);
    const sums: number[] = [];
    const sawKinds = new Set<string>();
    let sawShield = false;
    for (let i = 0; i < 2400; i++) {
      runner.advance(TICK_MS, provider);
      sums.push(stateChecksum(runner.state));
      for (const e of runner.state.entities) { if (e.kind) sawKinds.add(e.kind); if ((e.shield ?? 0) > 0) sawShield = true; }
      if (runner.state.result) break;
    }
    return { sums, sawKinds, sawShield };
  };
  const a = run8(8080), b = run8(8080);
  const same = a.sums.length === b.sums.length && a.sums.every((v, i) => v === b.sums[i]);
  check('全tickのチェックサムが一致', same, `${a.sums.length} tick`);
  check('新しい敵が出ている（試験が意味を持っている）',
    ['guard', 'medic', 'kamikaze', 'flyer'].filter(k => a.sawKinds.has(k)).length >= 3, [...a.sawKinds].join(','));
  check('シールドつきのボスが出ている', a.sawShield);
}

// ── テスト9: 育ち方・施設のレベル・自爆のダメージ・出撃の5枠（2026-11-15 CW-4a）─────────────

console.log('\n[9] レベルの倍率・施設のレベル・自爆ロボのダメージ・5枠の外は出せない');
{
  const ch = CAMPAIGN[0];
  const map = BATTLE_MAP_BY_ID[ch.mapId];
  const cfgFor = (levels: Record<string, number>, formation?: string[]) => buildSimConfig({
    mode: 'PVE', seed: 7, chapter: ch,
    difficulty: { ...ch.difficulty, firstSpawnDelayMs: 99999999, enemyHpMult: 1, enemyDamageMult: 1, startEnergy: 5000, energyPerSec: 0 },
    battleMap: map, p1: { levels, buffs: { values: {} }, formation },
  });

  // levelMult：Lv1=1・Lv10≒1.32・Lv30≒2.0・Lv60≒3.07。sim の表にそのまま効く
  check('levelMult：Lv10≒1.32・Lv30≒2.0・Lv60≒3.07',
    Math.abs(levelMult(10) - 1.315) < 0.001 && Math.abs(levelMult(30) - 2.015) < 0.001 && Math.abs(levelMult(60) - 3.065) < 0.001,
    `${levelMult(10).toFixed(3)} / ${levelMult(30).toFixed(3)} / ${levelMult(60).toFixed(3)}`);
  const c1 = cfgFor({}), c30 = cfgFor({ barbarian: 30 });
  const b = CHARACTER_BY_ID.barbarian.base;
  check('レベルが sim のHP・こうげきに効く（Lv30 の近接系）',
    c1.unitStats.P1.barbarian.hp === b.hp && c30.unitStats.P1.barbarian.hp === Math.round(b.hp * levelMult(30))
    && c30.unitStats.P1.barbarian.damage === Math.round(b.damage * levelMult(30)),
    `HP ${c1.unitStats.P1.barbarian.hp} → ${c30.unitStats.P1.barbarian.hp}`);
  check('レベルは1ずつ少しずつ（Lv9→Lv10 で段差がない）',
    cfgFor({ barbarian: 10 }).unitStats.P1.barbarian.hp - cfgFor({ barbarian: 9 }).unitStats.P1.barbarian.hp <= 3);

  // 施設のレベル：SimInit の playerBuildings の mult が HP・こうげきに効く
  {
    const mk = (mult?: number) => new SimRunner(c1, {
      defenderBuildings: [{ type: BuildingType.TOWN_HALL, x: 26, y: 1 }],
      playerBuildings: [{ type: BuildingType.TOWN_HALL, x: 0, y: 13, mult }, { type: BuildingType.CANNON, x: 3, y: 4, mult }],
      spellCharges: { P1: { HEAL: 0, RAGE: 0 }, P2: { HEAL: 0, RAGE: 0 } },
    });
    const m5 = facilityMult(BuildingType.CANNON, 5);
    const a = mk(), z = mk(m5);
    const core = (r: SimRunner) => r.state.entities.find(e => e.team === 'ATTACKER_BUILDING' && e.subType === BuildingType.TOWN_HALL)!;
    const cannon = (r: SimRunner) => r.state.entities.find(e => e.team === 'ATTACKER_BUILDING' && e.subType === BuildingType.CANNON)!;
    check('施設のレベル：Lv5（×1.4）でコアと砲台のHP・こうげきが上がる',
      core(a).maxHp === BSTATS[BuildingType.TOWN_HALL].hp && core(z).maxHp === Math.round(BSTATS[BuildingType.TOWN_HALL].hp * m5)
      && cannon(z).damage === Math.round((BSTATS[BuildingType.CANNON].damage ?? 0) * m5),
      `コア ${core(a).maxHp} → ${core(z).maxHp}・砲台 こうげき ${cannon(a).damage} → ${cannon(z).damage}`);
  }

  // 自爆ロボ：1回のダメージは ENEMY_UNIT_STATS.kamikaze.damage のまま（ネコの ぼむにゃー の ×4 が掛からない）
  {
    const r = new SimRunner(c1, {
      defenderBuildings: [{ type: BuildingType.TOWN_HALL, x: 26, y: 1 }],
      playerBuildings: [{ type: BuildingType.TOWN_HALL, x: 0, y: 13 }],
      spellCharges: { P1: { HEAL: 0, RAGE: 0 }, P2: { HEAL: 0, RAGE: 0 } },
    });
    r.state.started = true;
    const st = ENEMY_UNIT_STATS.kamikaze;
    r.state.entities.push({
      id: 'zz-k', type: 'TROOP', subType: st.subType, x: 6, y: 13, hp: st.hp, maxHp: st.hp, damage: st.damage,
      team: 'DEFENDER', kind: 'kamikaze', attackRange: st.attackRange, attackSpeed: st.attackSpeed,
      lastAttack: -999999, moveSpeed: st.moveSpeed, targetPreference: 'ANY', path: [],
    });
    const core = r.state.entities.find(e => e.team === 'ATTACKER_BUILDING')!;
    const hp0 = core.hp;
    for (let i = 0; i < 160 && core.hp === hp0; i++) r.advance(TICK_MS, new TickScript(new Map()));
    const lost = hp0 - core.hp;
    check('自爆ロボ：ダメージは 1倍（4倍になっていない）', Math.abs(lost - st.damage) < 0.01, `コアが ${lost.toFixed(0)} へった（もと ${st.damage}）`);
    check('自爆ロボ：1回で コアの最大HPの 約2割', lost / core.maxHp >= 0.15 && lost / core.maxHp <= 0.25, `${((lost / core.maxHp) * 100).toFixed(0)}%`);
  }

  // 5枠：表に入るのは5枠の系統だけ。外の系統は DEPLOY しても出ない（sim の中で止める）
  {
    const form = ['barbarian', 'archer', 'giant', 'bomber', 'magic'];
    const cfg = cfgFor({}, form);
    check('5枠：sim の表には 5枠の系統だけ', Object.keys(cfg.unitStats.P1).sort().join(',') === [...form].sort().join(','),
      Object.keys(cfg.unitStats.P1).join(','));
    const r = new SimRunner(cfg, {
      defenderBuildings: [{ type: BuildingType.TOWN_HALL, x: 26, y: 1 }],
      playerBuildings: [{ type: BuildingType.TOWN_HALL, x: 0, y: 7 }],
      spellCharges: { P1: { HEAL: 0, RAGE: 0 }, P2: { HEAL: 0, RAGE: 0 } },
    });
    const zone = r.statics.deployZones.P1!;
    const x = zone.xMax, y = zone.yMin + 1;
    r.advance(TICK_MS, new TickScript(new Map([[1, [
      { type: 'DEPLOY', player: 'P1', troopId: 'flying', x, y },
      { type: 'DEPLOY', player: 'P1', troopId: 'barbarian', x, y: y + 2 },
    ]]])));
    const mine = r.state.entities.filter(e => e.team === 'ATTACKER');
    check('5枠：外の系統（飛行系）は DEPLOY しても出ない・中の系統（近接系）は出る',
      !mine.some(e => e.subType === 'flying') && mine.some(e => e.subType === 'barbarian'), mine.map(e => e.subType).join(','));
  }
}

console.log(failures === 0
  ? '\n✅ すべて成功\n'
  : `\n❌ ${failures} 件の失敗\n`);
process.exit(failures === 0 ? 0 : 1);
