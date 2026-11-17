/**
 * 同時対戦（CW-6c・2026-11-17）の きまり。docs/REBUILD_SPEC.md §5c。**純粋な関数だけ**（画面・通信を 知らない）。試験は scripts/versusTest.ts。
 *
 * 「速さを報酬にしない」ので、ずっと動きつづける対戦にはしない。**ラウンド制**（1回の対戦＝3ラウンド）：
 *   1. とく   … 2人に 同じ項目の 問題カード（やさしい・ふつう・むずかしい の3まい）。まちがえずに といた分だけ ⚡。まちがえても罰なし・ヒントで最後まで。
 *   2. おく   … ためた ⚡ で ネコを 自分の陣に おく（60秒）。**おきおわる（できた）まで あいてには 見えない**。
 *   3. みる   … 2人の おきかたを あわせて 決定的な戦闘の計算（sim）を 進める。**2つの端末は 同じ入力から 同じ結果**になる（ロックステップの考え方。
 *               ラウンドごとの入力＝それぞれの おきかただけを 交換する）。
 *   4. 3ラウンドで あいての コアを 多く けずった方の 勝ち（ひきわけ あり）。
 *
 * 公平のための しくみ（**sim は さわらない**）：sim の 計算は P1（左）が わずかに 有利（当たり判定の 0.2マスの ずれ・計算の順）。
 * そこで **1ラウンドを 左右を 入れかえて 2回** たたかい（前半・後半）、コアを けずった 割合の **平均**を そのラウンドの 点にする。
 * おきかたは「自分の側（左がわ）の 座標」で 持ち、右がわに 立つ回は 左右反転して つかう。
 *
 * 対等にするための きまり：ネコの レベルは みんな同じ（VERSUS_LEVEL）・スキル・出撃バフ・施設は 使わない・⚡ は 問題を とくことでしか 手に入らない（はじめ 0）。
 * 出撃の5枠（どの系統を つれてくるか）だけは 自分で えらぶ。
 */
import { BuildingType, GRID_W, GRID_H, type BattleMap } from '../types';
import { BUILDING_STATS } from '../constants';
import { CHARACTERS } from '../data/characters';
import { PVP_MAPS, mirrorBase } from '../data/battleMaps';
import { PVP_DIFFICULTY, QUIZ_BASE_REWARD, type ChapterDifficulty } from '../data/campaign';
import { buildSimConfig } from '../sim/setup';
import { SimRunner, type CommandProvider } from '../sim/runner';
import { stateChecksum } from '../sim/checksum';
import { DetRNG } from '../sim/rng';
import { TICK_MS, type PlayerId, type SimCommand, type SimConfig, type SimState } from '../sim/types';
import type { SimInit } from '../sim/simulate';

// ── 数（scripts/versusTest.ts の BALANCE=1 で決めた）────────────────────────────
export const VERSUS_ROUNDS = 3;
export const CARDS_PER_ROUND = 3;
/** 対戦では ネコの レベルは みんな同じ（育った子と はじめたばかりの子が 対等に たたかえる） */
export const VERSUS_LEVEL = 10;
/** とく の 上限（ゆるく。ひとつの ラウンドで 4分）。先に とけても 得は しない（おくは 2人そろってから） */
export const SOLVE_CAP_MS = 240_000;
/** おく の 時間（60秒） */
export const PLACE_MS = 60_000;
/** 1回の「みる」（前半・後半）の 長さ（tick。1 tick＝50ms）。どちらかの コアが おちたら そこまで */
export const HALF_TICKS = 1000;
/** 1ラウンドで おける ネコの数の 上限 */
export const MAX_PLACED = 24;
/** コアを けずった 割合の 合計の ちがいが これ みまんなら ひきわけ（3ラウンドの 合計は 0〜3。0.15＝1ラウンドの へいきで 5ポイント みまん） */
export const DRAW_EPS = 0.15;
/** 出撃の 枠の 数 */
export const VERSUS_FORMATION_SIZE = 5;
/** 合図の 間（ms）。この間 なにも 聞こえなかったら「あいてが いなくなった」 */
export const PING_MS = 3000;
export const DROP_MS = 25_000;
/** 「みる」のあと あいての 結果を まつ 上限 */
export const SUM_WAIT_MS = 30_000;

/** 対戦で つかえる系統（ボスの ネコは つれてこない） */
export const VERSUS_FAMILIES: string[] = CHARACTERS.filter((c) => !c.id.startsWith('boss_')).map((c) => c.id);
export const DEFAULT_VERSUS_FORMATION: string[] = CHARACTERS.filter((c) => c.isStarter && !c.id.startsWith('boss_')).map((c) => c.id).slice(0, VERSUS_FORMATION_SIZE);

/** 端末から来た 出撃の枠を 見なおす（知らない系統・ボス・重なり・6つ目いじょうを 捨てる。空なら 初期の枠） */
export function normalizeFormation(raw: unknown): string[] {
  const out: string[] = [];
  if (Array.isArray(raw)) {
    for (const id of raw) if (typeof id === 'string' && VERSUS_FAMILIES.includes(id) && !out.includes(id)) out.push(id);
  }
  const f = out.slice(0, VERSUS_FORMATION_SIZE);
  return f.length > 0 ? f : DEFAULT_VERSUS_FORMATION.slice();
}

// ── へやの記号 ────────────────────────────────────────────────────────────
/** へやの記号は 4けたの 数字（サーバが 作る）。全角の数字・空白も うけつける（ひらがな入力の まま 打っても 通る） */
export function normalizeRoomCode(raw: string): string {
  const half = (raw ?? '').replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  return half.replace(/[^0-9]/g, '').slice(0, 4);
}
export const isRoomCode = (s: string): boolean => /^[0-9]{4}$/.test(s);

// ── たね・カード ───────────────────────────────────────────────────────────
/** 対戦の たね（サーバが へやを作るとき 決める。2人で 同じ）→ ラウンドの たね */
export function roundSeed(seed: number, round: number): number {
  let h = (seed >>> 0) ^ Math.imul(round + 1, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/** 問題カード1まいの 中身（単元アプリの 項目。同じ項目なら 同じ むずかしさ・同じ ⚡） */
export interface CardKey { unitKey: string; skillId: string; difficulty: number }
const bandOf = (d: number): 'easy' | 'mid' | 'hard' => (d <= 2 ? 'easy' : d === 3 ? 'mid' : 'hard');
const keyOf = (c: CardKey) => `${c.unitKey}/${c.skillId}`;

/** ⚡（まちがえずに といたとき。むずかしい項目ほど 多い。連続ボーナスは 無し＝2人とも同じ） */
export function cardReward(difficulty: number, weight: (d: number) => number): number {
  return Math.round(QUIZ_BASE_REWARD * weight(difficulty));
}

/**
 * 3ラウンドぶんの カード（各3まい＝やさしい・ふつう・むずかしい）。**たね と 範囲（pool）だけから 決まる**＝2つの端末で 同じ。
 * pool は 並びを そろえてから（単元の鍵・項目の名前の順）使う。同じ項目は 対戦の中で なるべく 重ねない。
 */
export function dealCards(pool: readonly CardKey[], seed: number): CardKey[][] {
  const sorted = pool.slice().sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
  const used = new Set<string>();
  const rounds: CardKey[][] = [];
  for (let r = 0; r < VERSUS_ROUNDS; r++) {
    const rng = new DetRNG(roundSeed(seed, r) ^ 0x5bd1e995);
    const hand: CardKey[] = [];
    for (const band of ['easy', 'mid', 'hard'] as const) {
      const fresh = sorted.filter((c) => !used.has(keyOf(c)) && !hand.some((h) => keyOf(h) === keyOf(c)));
      const inBand = fresh.filter((c) => bandOf(c.difficulty) === band);
      const from = inBand.length ? inBand : fresh.length ? fresh : sorted;
      if (from.length === 0) break;
      const c = from[rng.int(from.length)];
      hand.push(c); used.add(keyOf(c));
    }
    rounds.push(hand);
  }
  return rounds;
}

/** カードの 一覧の 目印（2つの端末の カードが ちがう＝ページの 版が ちがう を 見つける） */
export function cardsHash(cards: CardKey[][]): string {
  let h = 2166136261;
  for (const hand of cards) for (const c of hand) for (const ch of `${keyOf(c)}:${c.difficulty}|`) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return (h >>> 0).toString(36);
}

/** 解けたカードの しるし（ビット）→ ⚡ */
export function energyOfMask(hand: readonly CardKey[], mask: number, weight: (d: number) => number): number {
  let e = 0;
  hand.forEach((c, i) => { if ((mask >> i) & 1) e += cardReward(c.difficulty, weight); });
  return e;
}

// ── 戦場・おく場所 ────────────────────────────────────────────────────────────
/** そのラウンドの 戦場（左右そっくりの 2つを たねで かわるがわる） */
export function versusMap(seed: number, round: number): BattleMap {
  return PVP_MAPS[(roundSeed(seed, round) >>> 3) % PVP_MAPS.length];
}
/** 自分の側（左がわ）の コアの 場所 */
export const CORE_POS = { x: 1, y: 7 } as const;
const CORE_W = BUILDING_STATS[BuildingType.TOWN_HALL].width;
const CORE_H = BUILDING_STATS[BuildingType.TOWN_HALL].height;

/** 自分の側（左がわ）の 座標で 数えた「おける ますめ」 */
export function placeableCells(map: BattleMap): { x: number; y: number }[] {
  const z = map.playerDeployZone;
  const blocked = new Set<string>();
  for (const t of map.terrain) if (t.type === 'WATER' || t.type === 'ROCK' || t.type === 'LAVA') blocked.add(`${t.x},${t.y}`);
  for (let dy = 0; dy < CORE_H; dy++) for (let dx = 0; dx < CORE_W; dx++) blocked.add(`${CORE_POS.x + dx},${CORE_POS.y + dy}`);
  const out: { x: number; y: number }[] = [];
  for (let x = z.xMin; x <= z.xMax; x++) for (let y = Math.max(0, z.yMin); y <= Math.min(GRID_H - 1, z.yMax); y++) {
    if (!blocked.has(`${x},${y}`)) out.push({ x, y });
  }
  return out;
}

// ── おきかた ────────────────────────────────────────────────────────────────
/** 1体の おきかた（自分の側＝左がわの 座標） */
export interface Put { id: string; x: number; y: number }
export type Placement = Put[];

/**
 * 対戦だけの 値段の 調整（⚡）。sim の数値は かえず、対戦用の 性能表（SimConfig の cost）にだけ かける。
 * 遠距離系（archer）は 安くて 遠くから うてるので、そのままだと みんなが 遠距離系ばかり おく。
 */
export const VERSUS_COST_MULT: Record<string, number> = { archer: 1.5 };
/** 同じ系統は これだけまで（遠距離系ばかり 24体に ならないように）。scripts/versusTest.ts の BALANCE=1 で決めた */
export const MAX_PER_FAMILY = 8;
/** 系統ごとの ⚡（対戦の 性能表の 値。レベルが みんな同じなので 系統だけで 決まる） */
export function troopCost(id: string): number {
  const c = CHARACTERS.find((x) => x.id === id);
  return c ? Math.round(c.cost.gold * (VERSUS_COST_MULT[id] ?? 1)) : Infinity;
}

/**
 * おきかたを 見なおす（自分のも あいてから 来たのも 同じ関数。2回かけても 同じ結果）：
 * 枠の外の系統・おけない ますめ・重なり・⚡ を こえた分・数の 上限（全体 MAX_PLACED・同じ系統 MAX_PER_FAMILY）を 捨てる。先に ならんでいるものを のこす。
 */
export function sanitizePlacement(raw: unknown, formation: readonly string[], energy: number, map: BattleMap): Placement {
  const out: Placement = [];
  if (!Array.isArray(raw)) return out;
  const ok = new Set(placeableCells(map).map((c) => `${c.x},${c.y}`));
  const seen = new Set<string>();
  const count: Record<string, number> = {};
  let left = Math.max(0, Math.floor(energy));
  for (const r of raw) {
    if (out.length >= MAX_PLACED) break;
    let id: unknown, x: unknown, y: unknown;
    if (Array.isArray(r)) [id, x, y] = r; else if (r && typeof r === 'object') ({ id, x, y } = r as Record<string, unknown>);
    if (typeof id !== 'string' || typeof x !== 'number' || typeof y !== 'number') continue;
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    if (!formation.includes(id)) continue;
    const k = `${x},${y}`;
    if (!ok.has(k) || seen.has(k)) continue;
    if ((count[id] ?? 0) >= MAX_PER_FAMILY) continue;
    const c = troopCost(id);
    if (c > left) continue;
    left -= c; seen.add(k); count[id] = (count[id] ?? 0) + 1;
    out.push({ id, x, y });
  }
  return out;
}
export const placementCost = (p: Placement): number => p.reduce((s, u) => s + troopCost(u.id), 0);
/** 送る形（短く） */
export const encodePlacement = (p: Placement): [string, number, number][] => p.map((u) => [u.id, u.x, u.y]);

// ── 1回の「みる」（前半・後半）─────────────────────────────────────────────────
/** 対戦用の 難易度：⚡ は 問題からだけ（自然には たまらない・はじめ 0）。敵AI・増援は 使わない（PVP） */
const VERSUS_DIFFICULTY: ChapterDifficulty = { ...PVP_DIFFICULTY, startEnergy: 0, energyPerSec: 0 };
/** 出撃の ま（再出撃までの 待ち）。おいた ネコは 1 tick に 1体ずつ 出す（待ちを 1 tick に している） */
const DEPLOY_COOLDOWN_MS = TICK_MS;

export type Side = 'host' | 'guest';
export const otherSide = (s: Side): Side => (s === 'host' ? 'guest' : 'host');

export interface RoundInput {
  seed: number;
  round: number;
  /** 前半（0）か 後半（1）か。前半は host が 左（P1）・後半は guest が 左（P1） */
  half: 0 | 1;
  placements: Record<Side, Placement>;
  energies: Record<Side, number>;
  formations: Record<Side, readonly string[]>;
}

export interface HalfSetup {
  cfg: SimConfig;
  init: SimInit;
  /** tick → その tick の コマンド */
  commands: Map<number, SimCommand[]>;
  /** host が どちらの プレイヤーか */
  hostIs: PlayerId;
  /** 左右反転して つかう（P2 の おきかた） */
  playerOf: Record<Side, PlayerId>;
}

/** 自分の側の 座標 → sim の 座標（P2 は 左右反転） */
export const toSim = (pl: PlayerId, x: number): number => (pl === 'P1' ? x : GRID_W - 1 - x);

/** 前半・後半の 準備（cfg・初期配置・コマンドの 時間割）。2つの端末が 同じ入力から 同じものを 作る */
export function buildHalf(inp: RoundInput): HalfSetup {
  const map = versusMap(inp.seed, inp.round);
  const hostPl: PlayerId = inp.half === 0 ? 'P1' : 'P2';
  const playerOf: Record<Side, PlayerId> = { host: hostPl, guest: hostPl === 'P1' ? 'P2' : 'P1' };
  const levels: Record<string, number> = {};
  for (const c of CHARACTERS) levels[c.id] = VERSUS_LEVEL;
  const setup = (side: Side) => ({ levels, buffs: { values: {} }, formation: [...inp.formations[side]] });
  const mk = (pl: PlayerId) => setup(pl === hostPl ? 'host' : 'guest');
  const base = buildSimConfig({
    mode: 'PVP',
    seed: (roundSeed(inp.seed, inp.round) * 2 + inp.half) >>> 0 || 1,
    chapter: { enemyName: 'あいて' },
    difficulty: VERSUS_DIFFICULTY,
    battleMap: map,
    p1: mk('P1'), p2: mk('P2'),
  });
  const unitStats = { P1: { ...base.unitStats.P1 }, P2: { ...base.unitStats.P2 } };
  for (const pl of ['P1', 'P2'] as PlayerId[]) for (const k of Object.keys(unitStats[pl])) unitStats[pl][k] = { ...unitStats[pl][k], cooldownMs: DEPLOY_COOLDOWN_MS, cost: troopCost(k) };
  const cfg: SimConfig = {
    ...base, unitStats,
    startEnergy: { P1: inp.energies[pl2side(playerOf, 'P1')], P2: inp.energies[pl2side(playerOf, 'P2')] },
  };
  const core = [{ type: BuildingType.TOWN_HALL, x: CORE_POS.x, y: CORE_POS.y }];
  const init: SimInit = {
    playerBuildings: core,
    defenderBuildings: mirrorBase(core, () => CORE_W),
    spellCharges: { P1: { HEAL: 0, RAGE: 0 }, P2: { HEAL: 0, RAGE: 0 } },
  };
  // 時間割：P1 → P2 の順で、1 tick に 1体ずつ（おいた順）。⚡ は 前もって 見なおしずみ（足りる）
  const commands = new Map<number, SimCommand[]>();
  for (const pl of ['P1', 'P2'] as PlayerId[]) {
    const side = pl2side(playerOf, pl);
    inp.placements[side].forEach((u, i) => {
      const t = 1 + i;
      const list = commands.get(t) ?? [];
      list.push({ type: 'DEPLOY', player: pl, troopId: u.id, x: toSim(pl, u.x), y: u.y });
      commands.set(t, list);
    });
  }
  return { cfg, init, commands, hostIs: hostPl, playerOf };
}
function pl2side(playerOf: Record<Side, PlayerId>, pl: PlayerId): Side {
  return playerOf.host === pl ? 'host' : 'guest';
}

/** 時間割どおりに コマンドを わたす（CommandProvider） */
export class ScheduledProvider implements CommandProvider {
  constructor(private commands: Map<number, SimCommand[]>) {}
  commandsForTick(tick: number): SimCommand[] { return this.commands.get(tick) ?? []; }
}

export interface HalfSummary {
  tick: number;
  /** 決着（どちらかの コアが おちた）。HALF_TICKS で 止まったら null */
  result: PlayerId | 'DRAW' | null;
  /** それぞれの コアの のこり（割合 0〜1） */
  coreLeft: Record<PlayerId, number>;
  /** 状態の 要約（2つの端末で 比べる） */
  checksum: number;
}

/** 今の状態の まとめ（画面でも 試験でも 同じものを 使う） */
export function summarizeHalf(state: SimState): HalfSummary {
  const left = (team: 'ATTACKER_BUILDING' | 'DEFENDER'): number => {
    const e = state.entities.find((x) => x.type === 'BUILDING' && x.subType === BuildingType.TOWN_HALL && x.team === team);
    return e && e.maxHp > 0 ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;
  };
  return {
    tick: state.tick, result: state.result,
    coreLeft: { P1: left('ATTACKER_BUILDING'), P2: left('DEFENDER') },
    checksum: stateChecksum(state),
  };
}

/** 1回の「みる」を さいごまで 計算する（画面の ⏩ スキップ・あいての コンピュータ・試験）。画面で 1 tick ずつ 進めても 同じ結果 */
export function runHalf(h: HalfSetup, maxTicks = HALF_TICKS): HalfSummary {
  const runner = new SimRunner(h.cfg, h.init);
  const prov = new ScheduledProvider(h.commands);
  while (runner.tick < maxTicks && runner.state.result === null) runner.advance(TICK_MS, prov);
  return summarizeHalf(runner.state);
}

/** 1回の「みる」で それぞれが あいての コアを けずった 割合（0〜1） */
export function damageDealt(h: HalfSetup, s: HalfSummary): Record<Side, number> {
  const opp = (side: Side): PlayerId => (side === 'host' ? h.playerOf.guest : h.playerOf.host);
  return { host: 1 - s.coreLeft[opp('host')], guest: 1 - s.coreLeft[opp('guest')] };
}

/** 1ラウンド（前半・後半）の 点＝あいての コアを けずった 割合の 平均 */
export function roundScore(h0: HalfSetup, s0: HalfSummary, h1: HalfSetup, s1: HalfSummary): Record<Side, number> {
  const a = damageDealt(h0, s0), b = damageDealt(h1, s1);
  return { host: (a.host + b.host) / 2, guest: (a.guest + b.guest) / 2 };
}

/** 3ラウンドの 合計から 勝ち負け（ひきわけ あり）。host から 見た結果 */
export type Outcome = 'host' | 'guest' | 'draw';
export function outcomeOf(totals: Record<Side, number>): Outcome {
  const d = totals.host - totals.guest;
  if (Math.abs(d) < DRAW_EPS) return 'draw';
  return d > 0 ? 'host' : 'guest';
}

/** 点を 1000分率に（通信で 送る・比べる。小数の 誤差で ずれを 見まちがえない） */
export const permille = (x: number): number => Math.round(x * 1000);
