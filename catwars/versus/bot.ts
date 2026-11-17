/**
 * あいてが コンピュータの 「れんしゅう試合」（CW-6c・2026-11-17）。
 * 名乗っていない子（おためし・体験版・デモ）の 対戦は これ。**同じ ラウンド制・同じ 状態機械**（match.ts）を もう1つ 動かして、
 * それを コンピュータの 手（問題を とく・ネコを おく）で 動かす。**なにも 送らない・サーバに つながない**（同じ端末の中で 完結）。
 *
 * - 問題：カードごとに「まちがえずに とけた」かを 正答率で きめる（かんたん 0.58・ふつう 0.78・つよい 0.92。ほかの 想定プレイヤー botSim と同じ数）。
 *   **カードを とかない（0問）と ⚡ が 0 で ネコを おけない＝勝てない**（「問題を とくことが ゲームを うごかす」）。
 * - おきかた：かんたん＝でたらめ・ふつう／つよい＝前に 近接・うしろに 遠距離（役わりを 分けた おきかた）。
 * - 時間：コンピュータは 人より ずっと はやく 終える（人を またせない）。人の 手が おそくても 待つだけ（得は しない）。
 */
import { DetRNG } from '../sim/rng';
import { CHARACTER_BY_ID } from '../data/characters';
import {
  MAX_PLACED, MAX_PER_FAMILY, placeableCells, sanitizePlacement, troopCost, versusMap, roundSeed, runHalf,
  type CardKey, type Placement,
} from './rules';
import { VersusMatch, type Msg, type VersusLink } from './match';

export type BotLevel = 'easy' | 'normal' | 'hard';
export const BOT_LEVELS: Record<BotLevel, { label: string; accuracy: number; smart: boolean; blurb: string }> = {
  easy: { label: 'やさしい', accuracy: 0.58, smart: false, blurb: 'ときどき まちがえる。おきかたも てきとう' },
  normal: { label: 'ふつう', accuracy: 0.78, smart: true, blurb: 'ふつうの 子くらい' },
  hard: { label: 'つよい', accuracy: 0.92, smart: true, blurb: 'ほとんど まちがえない' },
};

/** そのカードを まちがえずに とけたか（むずかしい カードほど 少し おちる） */
export function botMask(rng: DetRNG, hand: readonly CardKey[], accuracy: number): number {
  if (accuracy <= 0) return 0;   // 「とかない」（1問も とかない）
  let m = 0;
  hand.forEach((c, i) => { if (rng.next() < Math.max(0.05, Math.min(0.99, accuracy - 0.04 * (c.difficulty - 3)))) m |= 1 << i; });
  return m;
}

/** でたらめな おきかた（ますめも 系統も でたらめ。⚡ の 許すかぎり） */
export function randomPlacement(rng: DetRNG, formation: readonly string[], energy: number, map: ReturnType<typeof versusMap>): Placement {
  const cells = placeableCells(map);
  const out: Placement = [];
  let left = energy;
  const count: Record<string, number> = {};
  for (let tries = 0; tries < 200 && out.length < MAX_PLACED; tries++) {
    const id = formation[rng.int(formation.length)];
    if (troopCost(id) > left || (count[id] ?? 0) >= MAX_PER_FAMILY) { if (formation.every((f) => troopCost(f) > left)) break; continue; }
    const c = cells[rng.int(cells.length)];
    if (out.some((u) => u.x === c.x && u.y === c.y)) continue;
    left -= troopCost(id); count[id] = (count[id] ?? 0) + 1;
    out.push({ id, x: c.x, y: c.y });
  }
  return sanitizePlacement(out, formation, energy, map);
}

/**
 * 役わりを 分けた おきかた：近接（射程 2 みまん）は 前（コアから 遠い ほう）・遠距離は うしろ（コアの 近く）。
 * 系統は ⚡ の 許すかぎり ならべて えらぶ（遠距離は 少し 多め）。
 */
export function smartPlacement(rng: DetRNG, formation: readonly string[], energy: number, map: ReturnType<typeof versusMap>): Placement {
  const cells = placeableCells(map);
  const xs = cells.map((c) => c.x);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  const front = cells.filter((c) => c.x >= mid), back = cells.filter((c) => c.x < mid);
  const isRanged = (id: string) => (CHARACTER_BY_ID[id]?.base.attackRange ?? 0) >= 2;
  const out: Placement = [];
  const used = new Set<string>();
  const count: Record<string, number> = {};
  let left = energy;
  for (let tries = 0; tries < 300 && out.length < MAX_PLACED; tries++) {
    const afford = formation.filter((f) => troopCost(f) <= left && (count[f] ?? 0) < MAX_PER_FAMILY);
    if (afford.length === 0) break;
    const weights = afford.map((f) => (isRanged(f) ? 1.4 : 1));
    let t = rng.next() * weights.reduce((a, b) => a + b, 0), id = afford[afford.length - 1];
    for (let i = 0; i < afford.length; i++) { t -= weights[i]; if (t <= 0) { id = afford[i]; break; } }
    const pool = (isRanged(id) ? back : front).filter((c) => !used.has(`${c.x},${c.y}`));
    if (pool.length === 0) continue;
    const c = pool[rng.int(pool.length)];
    used.add(`${c.x},${c.y}`); left -= troopCost(id); count[id] = (count[id] ?? 0) + 1;
    out.push({ id, x: c.x, y: c.y });
  }
  return sanitizePlacement(out, formation, energy, map);
}

/** 2つの 状態機械を つなぐ 通り道（同じ端末の中。pump() で とどける＝入れ子で 呼ばれない） */
export class MemoryNet {
  private recv: Partial<Record<'host' | 'guest', (m: unknown) => void>> = {};
  private queue: { to: 'host' | 'guest'; m: unknown }[] = [];
  /** true なら とどけない（通信が 切れた ことにする） */
  cut = false;
  /** 試験用：とどける 前に 書きかえる／捨てる（null＝とどけない） */
  tamper: ((from: 'host' | 'guest', m: unknown) => unknown | null) | null = null;
  /** 送った メッセージの 記録（試験・安全の 確認用） */
  log: { from: 'host' | 'guest'; m: unknown }[] = [];
  attach(side: 'host' | 'guest', fn: (m: unknown) => void): void { this.recv[side] = fn; }
  linkFor(from: 'host' | 'guest'): VersusLink {
    return {
      send: (m: Msg) => {
        this.log.push({ from, m });
        if (this.cut) return;
        const copy = JSON.parse(JSON.stringify(m));
        const out = this.tamper ? this.tamper(from, copy) : copy;
        if (out !== null) this.queue.push({ to: from === 'host' ? 'guest' : 'host', m: out });
      },
    };
  }
  /** たまった メッセージを とどける（とどけた先が また 送っても つづけて とどける） */
  pump(): number {
    let n = 0;
    while (this.queue.length) { const q = this.queue.shift()!; n++; this.recv[q.to]?.(q.m); }
    return n;
  }
}

export interface BotOpts {
  /** どちらの席か（れんしゅう試合では 人が host・コンピュータが guest。試験では 両方 コンピュータ） */
  side?: 'host' | 'guest';
  /** 正答率・おきかたを 好きに きめる（試験用。「とかない」＝accuracy 0）。無ければ level の もの */
  profile?: { accuracy: number; smart: boolean };
  seed: number;
  cards: CardKey[][];
  level: BotLevel;
  formation: readonly string[];
  now: () => number;
  link: VersusLink;
  /** ときどき おそくする ため（人を まっている ふり。ふだんは 小さい） */
  think?: { solve: number; place: number };
}

/** コンピュータの 手。update() を 0.5秒ごとに 呼ぶ */
export class BotPlayer {
  readonly match: VersusMatch;
  private o: BotOpts;
  private seen = '';
  private enteredAt = 0;
  private think: { solve: number; place: number };
  private profile: { accuracy: number; smart: boolean };
  constructor(o: BotOpts) {
    this.o = o;
    this.profile = o.profile ?? BOT_LEVELS[o.level];
    this.think = o.think ?? { solve: 6000, place: 3000 };
    this.match = new VersusMatch({ side: o.side ?? 'guest', seed: o.seed, cards: o.cards, formation: o.formation, link: o.link, now: o.now });
  }
  receive(m: unknown): void { this.match.receive(m); this.step(); }
  update(): void { this.match.update(); this.step(); }
  private step(): void {
    const m = this.match;
    if (m.phase === 'lobby') { if (m.opponentPresent && !m.localReady()) m.ready(); return; }
    const key = `${m.phase}:${m.round}`;
    if (key !== this.seen) { this.seen = key; this.enteredAt = this.o.now(); }
    const waited = this.o.now() - this.enteredAt;
    const rng = new DetRNG(roundSeed(this.o.seed, m.round) ^ (this.match.side === 'host' ? 0xb07 : 0x1b0b));
    if (m.phase === 'solve' && !m.localDoneSolving() && waited >= this.think.solve) {
      const mask = botMask(rng, m.handNow(), this.profile.accuracy);
      m.cards[m.round].forEach((_, i) => { if ((mask >> i) & 1) m.markSolved(i); });
      m.finishSolving();
    } else if (m.phase === 'place' && !m.localDonePlacing() && waited >= this.think.place) {
      const map = versusMap(this.o.seed, m.round);
      const f = m.formation;
      const e = m.localEnergy();
      m.setDraft(this.profile.smart ? smartPlacement(rng, f, e, map) : randomPlacement(rng, f, e, map));
      m.submit();
    } else if (m.phase === 'watch') {
      // 人の 画面は 1 tick ずつ 見せる。コンピュータは 計算しきって すぐ 報告する（結果は 同じ）
      for (let guard = 0; guard < 2 && m.phase === 'watch'; guard++) {
        const su = m.halfSetup();
        if (!su) break;
        m.halfDone(runHalf(su));
      }
    }
  }
}

/** れんしゅう試合を つなぐ：人の 側の 状態機械・コンピュータ・通り道を まとめて 作る */
export function createPractice(o: {
  seed: number; cards: CardKey[][]; level: BotLevel; formation: readonly string[]; botFormation: readonly string[]; now: () => number;
  think?: { solve: number; place: number };
}): { net: MemoryNet; human: VersusMatch; bot: BotPlayer; tick: () => void } {
  const net = new MemoryNet();
  const human = new VersusMatch({ side: 'host', seed: o.seed, cards: o.cards, formation: o.formation, link: net.linkFor('host'), now: o.now });
  const bot = new BotPlayer({ seed: o.seed, cards: o.cards, level: o.level, formation: o.botFormation, now: o.now, link: net.linkFor('guest'), think: o.think });
  net.attach('host', (m) => human.receive(m));
  net.attach('guest', (m) => bot.receive(m));
  // 同じ端末の中なので、はじめから おたがいが いる
  const tick = () => { human.update(); bot.update(); net.pump(); };
  return { net, human, bot, tick };
}
