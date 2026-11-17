/**
 * 同時対戦の 流れ（CW-6c・2026-11-17）。**画面も 通信も 知らない 状態機械**（時計と 送り先を 外から もらう）。
 * 画面（components/versus/）・あいてが コンピュータの れんしゅう（bot.ts）・試験（scripts/versusTest.ts）が 同じものを 使う。
 *
 * ラウンドの 進み方（docs/REBUILD_SPEC.md §5c）：
 *   lobby → [ solve（とく）→ place（おく）→ watch（みる：前半・後半）→ check（結果を 見くらべる）] × 3 → done
 *   - solve → place：**2人とも 「とけた」を 送ってから**（先に とけても 得を しない。上限は SOLVE_CAP_MS）
 *   - place → watch：**2人とも おきかたを 送ってから**（おきおわるまで あいてには 見えない。上限は PLACE_MS）
 *   - watch：2つの端末が それぞれ 同じ入力（おきかた2つ）から 同じ計算を する。前半と 後半（左右を 入れかえ）。
 *   - check：ラウンドの おわりに「状態の 要約（チェックサム）と けずった 割合」を 交換して くらべる。**ちがったら その対戦は ひきわけで おわる**（ずれ）。
 * 通信が 切れたら（DROP_MS 聞こえない）「あいてが いなくなったよ」で おわる（勝ち負けは 付けない）。
 *
 * 送るもの（Msg）は 小さい：ping・go（出撃の枠・カードの目印）・sv（といた カード）・pl（おきかた）・sm（要約）・by（でる）。
 * **番号・名前・勝ち負けは 送らない・残さない**。
 */
import { rewardWeight } from '../learn/gradePack';
import {
  VERSUS_ROUNDS, PING_MS, DROP_MS, SOLVE_CAP_MS, PLACE_MS, SUM_WAIT_MS, CARDS_PER_ROUND,
  normalizeFormation, dealCards, cardsHash, energyOfMask, sanitizePlacement, encodePlacement, versusMap,
  buildHalf, damageDealt, roundScore, outcomeOf, permille,
  type CardKey, type Placement, type Side, type HalfSetup, type HalfSummary, type Outcome,
} from './rules';

export const PROTOCOL_V = 1;

export type Msg =
  | { t: 'pg' }
  /** re＝1 は「あなたの go に こたえた」go（これには こたえない）*/
  | { t: 'go'; v: number; form: string[]; ch: string; re?: 1 }
  | { t: 'sv'; r: number; m: number }
  | { t: 'pl'; r: number; p: [string, number, number][] }
  | { t: 'sm'; r: number; s: number[]; d: number[] }
  /** why＝'sx' は「計算が ずれた」（あいても ひきわけで おわる） */
  | { t: 'by'; why?: 'sx' };

export interface VersusLink { send(m: Msg): void }

export type Phase = 'lobby' | 'solve' | 'place' | 'watch' | 'check' | 'done';
/** おわり方：finished＝3ラウンド おわった／left＝あいてが いなくなった／desync＝計算が ずれた（ひきわけ）／version＝カードが ちがう（ページの版が ちがう）／cancel＝じぶんで やめた */
export type EndKind = 'finished' | 'left' | 'desync' | 'version' | 'cancel';

export interface RoundResult {
  /** そのラウンドの 点（あいての コアを けずった 割合の 平均。0〜1） */
  score: Record<Side, number>;
  /** 前半・後半それぞれの けずった 割合 */
  halves: { host: number; guest: number }[];
}

export interface MatchOpts {
  side: Side;
  seed: number;
  cards: CardKey[][];
  formation: readonly string[];
  link: VersusLink;
  now: () => number;
  /** カードの ⚡ の 重み（むずかしさ → 倍率）。ふだんは gradePack と同じ */
  weight?: (d: number) => number;
  timing?: Partial<{ ping: number; drop: number; solveCap: number; placeCap: number; sumWait: number }>;
}

const MASK_ALL = (1 << CARDS_PER_ROUND) - 1;
const isInt = (n: unknown, lo: number, hi: number): n is number => typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi;

export class VersusMatch {
  readonly side: Side;
  readonly opp: Side;
  readonly seed: number;
  readonly cards: CardKey[][];
  readonly hash: string;
  formation: string[];
  private link: VersusLink;
  private now: () => number;
  private weight: (d: number) => number;
  private T: { ping: number; drop: number; solveCap: number; placeCap: number; sumWait: number };

  phase: Phase = 'lobby';
  round = 0;
  half: 0 | 1 = 0;
  end: { kind: EndKind; outcome: Outcome | null } | null = null;

  /** あいてが 聞こえて いるか（hello の かわり。なにか 1つでも 受けとったら） */
  opponentPresent = false;
  remoteFormation: string[] | null = null;
  private localGo = false;
  private remoteGo = false;
  private lastHeard = 0;
  private lastSent = 0;
  private lastGoSent = 0;

  private localMask: number[] = [];
  private remoteMask: (number | undefined)[] = [];
  private localSolved: boolean[] = [];
  private remoteSolved: boolean[] = [];
  private solveStart = 0;
  private placeStart = 0;
  private checkStart = 0;

  /** いま ならべている おきかた（じぶんの側＝左がわの 座標）。submit で 確定 */
  draft: Placement = [];
  private localPl: (Placement | undefined)[] = [];
  private remotePlRaw: (unknown | undefined)[] = [];
  private remotePl: (Placement | undefined)[] = [];
  private setups: (HalfSetup | undefined)[][] = [];
  private summaries: (HalfSummary | undefined)[][] = [];
  private remoteSm: ({ s: number[]; d: number[] } | undefined)[] = [];
  results: RoundResult[] = [];
  totals: Record<Side, number> = { host: 0, guest: 0 };

  private listeners = new Set<() => void>();
  /** 画面の 再描画の 目印（変わるたび +1） */
  rev = 0;

  constructor(o: MatchOpts) {
    this.side = o.side; this.opp = o.side === 'host' ? 'guest' : 'host';
    this.seed = o.seed >>> 0; this.cards = o.cards;
    this.hash = cardsHash(o.cards);
    this.formation = normalizeFormation(o.formation);
    this.link = o.link; this.now = o.now;
    this.weight = o.weight ?? rewardWeight;
    this.T = { ping: PING_MS, drop: DROP_MS, solveCap: SOLVE_CAP_MS, placeCap: PLACE_MS, sumWait: SUM_WAIT_MS, ...o.timing };
    for (let r = 0; r < VERSUS_ROUNDS; r++) { this.setups.push([undefined, undefined]); this.summaries.push([undefined, undefined]); }
    this.lastHeard = this.now();
  }

  subscribe(fn: () => void): () => void { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  private emit(): void { this.rev++; for (const f of this.listeners) f(); }
  private send(m: Msg): void { this.lastSent = this.now(); this.link.send(m); }

  // ── じぶんの 操作 ─────────────────────────────────────────────────
  /** つれていく ネコを かえる（へやの 中で「たたかう」を おす前だけ） */
  setFormation(f: readonly string[]): void {
    if (this.phase !== 'lobby' || this.localGo) return;
    this.formation = normalizeFormation(f);
    this.emit();
  }
  /** 「たたかう」：出撃の関門（スタミナ・サーバの ready）を 通った あとに 呼ぶ。2人とも 呼んだら はじまる */
  ready(): void {
    if (this.phase !== 'lobby' || this.localGo) return;
    this.localGo = true;
    this.sendGo();
    this.maybeStart();
    this.emit();
  }
  private sendGo(reply = false): void {
    this.lastGoSent = this.now();
    this.send({ t: 'go', v: PROTOCOL_V, form: this.formation, ch: this.hash, ...(reply ? { re: 1 as const } : {}) });
  }

  /** そのラウンドの カードの 1まいを まちがえずに といた */
  markSolved(i: number): void {
    if (this.phase !== 'solve' || !isInt(i, 0, CARDS_PER_ROUND - 1)) return;
    this.localMask[this.round] = (this.localMask[this.round] ?? 0) | (1 << i);
    this.emit();
  }
  /** 「とけた」を 送る（先に とけても 得は しない。おくは 2人そろってから） */
  finishSolving(): void {
    if (this.phase !== 'solve' || this.localSolved[this.round]) return;
    this.localSolved[this.round] = true;
    this.send({ t: 'sv', r: this.round, m: (this.localMask[this.round] ?? 0) & MASK_ALL });
    this.maybeToPlace();
    this.emit();
  }
  /** いま ならべている 形を 入れかえる（見なおしは 確定のとき） */
  setDraft(p: Placement): void {
    if (this.phase !== 'place' || this.localPl[this.round]) return;
    this.draft = p;
    this.emit();
  }
  /** 「できた」：おきかたを 確定して 送る（おくの 時間が きれても 自動で） */
  submit(): void {
    if (this.phase !== 'place' || this.localPl[this.round]) return;
    const clean = sanitizePlacement(this.draft, this.formation, this.localEnergy(), versusMap(this.seed, this.round));
    this.draft = clean;
    this.localPl[this.round] = clean;
    this.send({ t: 'pl', r: this.round, p: encodePlacement(clean) });
    this.maybeToWatch();
    this.emit();
  }
  /** 前半・後半の「みる」が おわった（画面が 1 tick ずつ 進めた とき・スキップ・コンピュータは 計算しきって）。summary は rules.ts の summarizeHalf */
  halfDone(summary: HalfSummary): void {
    if (this.phase !== 'watch') return;
    const r = this.round, h = this.half;
    if (this.summaries[r][h]) return;
    this.summaries[r][h] = summary;
    if (h === 0) { this.half = 1; this.emit(); return; }
    // ラウンドの おわり：点を 出して、要約を 送る
    const h0 = this.setups[r][0]!, h1 = this.setups[r][1]!;
    const s0 = this.summaries[r][0]!, s1 = this.summaries[r][1]!;
    const d0 = damageDealt(h0, s0), d1 = damageDealt(h1, s1);
    this.results[r] = { score: roundScore(h0, s0, h1, s1), halves: [d0, d1] };
    this.send({ t: 'sm', r, s: [s0.checksum, s1.checksum], d: [permille(d0.host), permille(d0.guest), permille(d1.host), permille(d1.guest)] });
    this.phase = 'check'; this.checkStart = this.now();
    this.maybeFinishRound();
    this.emit();
  }
  /** 対戦を やめる（「やめる」ボタン・画面を 出るとき）。あいてには「でた」と 伝える */
  leave(): void {
    if (this.phase === 'done') return;
    this.send({ t: 'by' });
    this.finish('cancel');
  }

  // ── 通信から 受けとる ─────────────────────────────────────────────
  receive(raw: unknown): void {
    if (this.phase === 'done' || !raw || typeof raw !== 'object') return;
    const m = raw as Record<string, unknown>;
    this.lastHeard = this.now();
    this.opponentPresent = true;
    switch (m.t) {
      case 'pg': break;
      case 'go': {
        if (m.v !== PROTOCOL_V || typeof m.ch !== 'string') break;
        if (m.ch !== this.hash) { this.finish('version'); return; }
        this.remoteFormation = normalizeFormation(m.form);
        this.remoteGo = true;
        // あいてが go を 送ってきた：こちらの go が とどいていないかも しれないので こたえる（こたえの go には こたえない＝ぐるぐる しない）
        if (this.localGo && m.re !== 1) this.sendGo(true);
        this.maybeStart();
        break;
      }
      case 'sv': {
        if (!isInt(m.r, 0, VERSUS_ROUNDS - 1) || !isInt(m.m, 0, MASK_ALL)) break;
        if (this.remoteSolved[m.r]) break;
        this.remoteSolved[m.r] = true; this.remoteMask[m.r] = m.m;
        this.maybeToPlace();
        break;
      }
      case 'pl': {
        if (!isInt(m.r, 0, VERSUS_ROUNDS - 1) || !Array.isArray(m.p)) break;
        if (this.remotePlRaw[m.r] !== undefined) break;
        this.remotePlRaw[m.r] = m.p.slice(0, 64);
        this.maybeToWatch();
        break;
      }
      case 'sm': {
        if (!isInt(m.r, 0, VERSUS_ROUNDS - 1) || !Array.isArray(m.s) || !Array.isArray(m.d)) break;
        if (this.remoteSm[m.r]) break;
        this.remoteSm[m.r] = { s: m.s.slice(0, 2).map(Number), d: m.d.slice(0, 4).map(Number) };
        this.maybeFinishRound();
        break;
      }
      case 'by': {
        if (m.why === 'sx' && this.phase !== 'lobby') { this.finish('desync'); break; }
        if (this.phase === 'lobby') { this.opponentPresent = false; this.remoteGo = false; this.remoteFormation = null; }
        else this.finish('left');
        break;
      }
    }
    this.emit();
  }

  // ── 時計（画面が 0.5秒ごと・試験が 好きなだけ 呼ぶ）──────────────────
  update(): void {
    if (this.phase === 'done') return;
    const now = this.now();
    if (now - this.lastSent >= this.T.ping) this.send({ t: 'pg' });
    if (this.phase === 'lobby') {
      if (this.localGo && !this.remoteGo && now - this.lastGoSent >= this.T.ping) this.sendGo();
      // ロビーで あいてが 聞こえなくなったら 「いない」に もどす（へやは のこる）
      if (this.opponentPresent && now - this.lastHeard > this.T.drop) { this.opponentPresent = false; this.remoteGo = false; this.remoteFormation = null; this.emit(); }
      return;
    }
    if (now - this.lastHeard > this.T.drop) { this.finish('left'); return; }
    if (this.phase === 'solve' && !this.localSolved[this.round] && now - this.solveStart >= this.T.solveCap) this.finishSolving();
    if (this.phase === 'place' && !this.localPl[this.round] && now - this.placeStart >= this.T.placeCap) this.submit();
    if (this.phase === 'check' && now - this.checkStart > this.T.sumWait) this.finish('left');
  }

  // ── 進める ─────────────────────────────────────────────────────────
  private maybeStart(): void {
    if (this.phase !== 'lobby' || !this.localGo || !this.remoteGo) return;
    this.phase = 'solve'; this.round = 0; this.half = 0; this.solveStart = this.now();
    this.emit();
  }
  private maybeToPlace(): void {
    if (this.phase !== 'solve') return;
    if (!this.localSolved[this.round] || !this.remoteSolved[this.round]) return;
    this.phase = 'place'; this.placeStart = this.now(); this.draft = [];
  }
  private maybeToWatch(): void {
    if (this.phase !== 'place') return;
    const r = this.round;
    if (!this.localPl[r] || this.remotePlRaw[r] === undefined) return;
    const form = this.remoteFormation ?? this.formation;
    const map = versusMap(this.seed, r);
    this.remotePl[r] = sanitizePlacement(this.remotePlRaw[r], form, this.energyOf(this.opp, r), map);
    const placements = { [this.side]: this.localPl[r]!, [this.opp]: this.remotePl[r]! } as Record<Side, Placement>;
    const energies = { [this.side]: this.energyOf(this.side, r), [this.opp]: this.energyOf(this.opp, r) } as Record<Side, number>;
    const formations = { [this.side]: this.formation, [this.opp]: form } as unknown as Record<Side, readonly string[]>;
    for (const h of [0, 1] as const) this.setups[r][h] = buildHalf({ seed: this.seed, round: r, half: h, placements, energies, formations });
    this.phase = 'watch'; this.half = 0;
  }
  private maybeFinishRound(): void {
    if (this.phase !== 'check') return;
    const r = this.round;
    const mine = this.results[r];
    const theirs = this.remoteSm[r];
    if (!mine || !theirs) return;
    const s0 = this.summaries[r][0]!, s1 = this.summaries[r][1]!;
    const myD = [permille(mine.halves[0].host), permille(mine.halves[0].guest), permille(mine.halves[1].host), permille(mine.halves[1].guest)];
    const same = theirs.s[0] === s0.checksum && theirs.s[1] === s1.checksum && theirs.d.length === 4 && theirs.d.every((x, i) => x === myD[i]);
    if (!same) { this.send({ t: 'by', why: 'sx' }); this.finish('desync'); return; }
    this.totals = { host: this.totals.host + mine.score.host, guest: this.totals.guest + mine.score.guest };
    if (r + 1 >= VERSUS_ROUNDS) { this.finish('finished'); return; }
    this.round = r + 1; this.half = 0; this.phase = 'solve'; this.solveStart = this.now(); this.draft = [];
  }
  private finish(kind: EndKind): void {
    if (this.phase === 'done') return;
    this.phase = 'done';
    // 勝ち負けを つけるのは 3ラウンド おわったときだけ。ずれは ひきわけ。いなくなった・やめた は 勝ち負けを つけない
    this.end = { kind, outcome: kind === 'finished' ? outcomeOf(this.totals) : kind === 'desync' ? 'draw' : null };
    this.emit();
  }

  // ── 見る（画面用）───────────────────────────────────────────────────
  energyOf(side: Side, r = this.round): number {
    const mask = side === this.side ? this.localMask[r] ?? 0 : this.remoteMask[r] ?? 0;
    return energyOfMask(this.cards[r] ?? [], mask, this.weight);
  }
  localEnergy(): number { return this.energyOf(this.side); }
  handNow(): CardKey[] { return this.cards[this.round] ?? []; }
  maskNow(): number { return this.localMask[this.round] ?? 0; }
  /** あいては もう「とけた」を 送ったか（数は 見せない） */
  remoteDoneSolving(): boolean { return !!this.remoteSolved[this.round]; }
  localDoneSolving(): boolean { return !!this.localSolved[this.round]; }
  remoteDonePlacing(): boolean { return this.remotePlRaw[this.round] !== undefined; }
  localDonePlacing(): boolean { return !!this.localPl[this.round]; }
  localReady(): boolean { return this.localGo; }
  remoteReady(): boolean { return this.remoteGo; }
  halfSetup(r = this.round, h = this.half): HalfSetup | undefined { return this.setups[r]?.[h]; }
  /** あと何ミリ秒で 時間か（せかさない・目安の 表示だけ） */
  msLeft(): number | null {
    const now = this.now();
    if (this.phase === 'solve') return Math.max(0, this.solveStart + this.T.solveCap - now);
    if (this.phase === 'place') return Math.max(0, this.placeStart + this.T.placeCap - now);
    return null;
  }
}
