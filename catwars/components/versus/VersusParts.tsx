/**
 * 同時対戦の 画面（CW-6c・2026-11-17）。仕様は docs/REBUILD_SPEC.md §5c。
 *
 * ホームの カード → えらぶ（へやを つくる／記号で はいる／コンピュータと れんしゅう）→ 出題範囲 → へや（あいてを まつ・たたかう）→
 *   とく → おく → みる（前半・後半）→ けっか くらべ → …（3ラウンド）→ けっか。
 *
 * **子どもの安全**：あいては「あいて」とだけ 出す（番号・名前は 画面にも 通信にも サーバにも 無い）。勝ち負けの数・順位は どこにも 残さない・出さない。
 * まけても 責めない文。ごほうびは「まちがえずに とけた 問題」の分だけ（grantStudyReward。勝ち負けでは ふえない）。
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GRID_H, GRID_W, type BattleEntity, type BattleMap } from '../../types';
import { BuildingType } from '../../types';
import { CHARACTER_BY_ID, getCharacterSprite, spriteFamilyForSubType, stageForLevel } from '../../data/characters';
import { loadPack, UNIT_NAME_BY_KEY, type PackRound, type RoundRegistry } from '../../learn/gradePack';
import { AppRoundHost } from '../../learn/AppRoundHost';
import { grantStudyReward } from '../../bridge';
import { CREDIT_PER_CORRECT } from '../../data/rewards';
import { difficultyFactor } from '../../data/problemWeights';
import { useReviewStore } from '../../store/useReviewStore';
import { sfx } from '../../utils/audioEngine';
import { TerrainLayer } from '../game/TerrainLayer';
import { RangeSelect } from '../game/RangeSelect';
import { DetRNG } from '../../sim/rng';
import { SimRunner } from '../../sim/runner';
import { TICK_MS } from '../../sim/types';
import { playerOf } from '../../sim/simulate';
import {
  VERSUS_ROUNDS, CARDS_PER_ROUND, HALF_TICKS, MAX_PER_FAMILY, MAX_PLACED, VERSUS_LEVEL, VERSUS_FAMILIES,
  CORE_POS, dealCards, cardReward, placeableCells, troopCost, versusMap, normalizeFormation, isRoomCode, normalizeRoomCode,
  ScheduledProvider, summarizeHalf, otherSide, type CardKey, type Placement, type Side,
} from '../../versus/rules';
import { VersusMatch, type Phase } from '../../versus/match';
import { BOT_LEVELS, createPractice, smartPlacement, type BotLevel } from '../../versus/bot';
import { rewardWeight } from '../../learn/gradePack';
import { startSortie, usePortal } from '../../portal/usePortal';
import { SortieStamina } from '../../portal/PortalCard';
import {
  createRoom, joinRoom, roomState, markReady, leaveRoom, versusNamed, type VersusRoom, type VersusErrorKind,
} from '../../portal/versusSync';
import { openLink, type LinkHandle } from '../../net/broadcastLink';

const font = { fontFamily: '"M PLUS Rounded 1c", sans-serif' };
const fontMono = { fontFamily: 'Orbitron, monospace' };
const ACCENT = '#f472b6';

// ── ホームの カード ───────────────────────────────────────────────
export const VersusCard: React.FC<{ locked?: string | null; onOpen: () => void }> = ({ locked, onOpen }) => (
  <div className="px-4 pt-3">
    <button onClick={onOpen} data-testid="versus-card" aria-disabled={locked ? true : undefined}
      className={`w-full text-left rounded-2xl border-2 p-3.5 transition-all active:scale-[0.99] ${locked ? 'opacity-70' : ''}`}
      style={{ borderColor: ACCENT, background: 'linear-gradient(135deg, rgba(244,114,182,0.16), rgba(15,23,42,0.6))', boxShadow: `0 0 14px ${ACCENT}44`, ...font }}>
      <div className="flex items-center gap-3">
        <span className="text-3xl leading-none">🆚</span>
        <div className="min-w-0 flex-1">
          <div className="text-[10px] tracking-[0.2em]" style={{ color: ACCENT, ...fontMono }}>VERSUS</div>
          <div className="text-white font-black text-base leading-tight">となりの 子と 同時に たいせん</div>
          <div className="text-white/55 text-[11px]">同じ学級の 2人で、とく → おく → みる を 3ラウンド。はやさでは きまらないよ（コンピュータとの れんしゅうも できる）</div>
        </div>
      </div>
      {locked && <p className="mt-1.5 text-[11px] text-[#fca5a5]">🔒 {locked}</p>}
    </button>
  </div>
);

// ── つかう 文 ─────────────────────────────────────────────────────
const ERROR_TEXT: Record<VersusErrorKind, string> = {
  closed: 'せんせいが まだ ひらいていないよ',
  notfound: 'その きごうの へやは みつからないよ（きごうを たしかめてね）',
  full: 'その へやは もう いっぱいだよ',
  expired: 'その へやは じかんぎれだよ。あたらしく つくってね',
  nospend: 'スタミナの かくにんが できなかったよ。もういちど おしてね',
  offline: 'ネットに つながっていないよ',
  unavailable: 'いまは たいせんが つかえないよ（先生に つたえてね）',
  other: 'うまく いかなかったよ。もういちど ためしてね',
};

const cardLabel = (d: number) => (d <= 2 ? 'やさしい' : d === 3 ? 'ふつう' : 'むずかしい');
const cardColor = (d: number) => (d <= 2 ? '#34d399' : d === 3 ? '#38bdf8' : '#f472b6');
const pct = (x: number) => `${Math.round(x * 100)}%`;
const spriteOf = (id: string): string => `${getCharacterSprite(spriteFamilyForSubType(id) ?? id, stageForLevel(VERSUS_LEVEL))}`;

// ── 戦場の 絵（おく・みる で 同じもの）────────────────────────────────
const MINE = '#38bdf8', THEIRS = '#fb7185';

/** 自分が いつも 左がわに 見えるよう、右がわに 立つ回は 左右を ひっくりかえして 描く */
const Board: React.FC<{
  map: BattleMap; cell: number; mirror: boolean;
  entities?: BattleEntity[]; localPl?: 'P1' | 'P2';
  /** おく画面：自分の側（左がわ）の 座標で ならべた おきかた */
  placement?: Placement; zone?: boolean; onCell?: (x: number, y: number) => void;
}> = ({ map, cell, mirror, entities, localPl, placement, zone, onCell }) => {
  const fx = (x: number, w = 1) => (mirror ? GRID_W - x - w : x);
  const cells = useMemo(() => (zone ? placeableCells(map) : []), [map, zone]);
  const full = (e: BattleEntity) => (e.type === 'BUILDING' ? 2 : 1);
  return (
    <div className="relative rounded-xl overflow-hidden flex-shrink-0 select-none" data-testid="versus-board"
      style={{ width: GRID_W * cell, height: GRID_H * cell, background: 'linear-gradient(90deg,#0f2a1f,#14301f 48%,#2a1722 52%,#2e1524)', border: '1px solid rgba(255,255,255,0.18)' }}>
      <TerrainLayer terrain={map.terrain.map((t) => ({ ...t, x: fx(t.x) }))} cellSize={cell} />
      {/* まんなかの線 */}
      <div className="absolute top-0 bottom-0" style={{ left: (GRID_W / 2) * cell - 1, width: 2, background: 'rgba(255,255,255,0.12)' }} />
      {zone && cells.map((c) => (
        <button key={`${c.x},${c.y}`} onClick={() => onCell?.(c.x, c.y)} aria-label={`${c.x},${c.y}`} data-cell={`${c.x},${c.y}`}
          className="absolute"
          style={{ left: c.x * cell, top: c.y * cell, width: cell, height: cell, background: 'rgba(56,189,248,0.10)', border: '1px solid rgba(56,189,248,0.22)', zIndex: 1 }} />
      ))}
      {/* おく画面の コア（自分＝左・あいて＝右） */}
      {placement && (
        <>
          <Core x={CORE_POS.x} y={CORE_POS.y} cell={cell} color={MINE} />
          <Core x={GRID_W - CORE_POS.x - 2} y={CORE_POS.y} cell={cell} color={THEIRS} />
          {placement.map((u) => (
            <img key={`${u.x},${u.y}`} src={spriteOf(u.id)} alt={u.id} draggable={false} data-placed={`${u.x},${u.y}`}
              className="absolute pointer-events-none"
              style={{ left: u.x * cell, top: u.y * cell, width: cell, height: cell, objectFit: 'contain', zIndex: 3, filter: `drop-shadow(0 0 3px ${MINE})` }} />
          ))}
        </>
      )}
      {/* みる画面：sim の いまの ようす */}
      {entities?.map((e) => {
        const mine = !!localPl && playerOf(e) === localPl;
        const color = mine ? MINE : THEIRS;
        const hp = Math.max(0, Math.min(1, e.maxHp > 0 ? e.hp / e.maxHp : 0));
        if (e.type === 'BUILDING') {
          return <Core key={e.id} x={fx(e.x, full(e))} y={e.y} cell={cell} color={color} hp={hp} />;
        }
        const sprite = spriteFamilyForSubType(e.subType);
        return (
          <div key={e.id} className="absolute pointer-events-none"
            style={{ left: (fx(e.x, 1) - 0 + 0) * cell, top: e.y * cell, width: cell, height: cell, zIndex: 4 }}>
            {sprite
              ? <img src={getCharacterSprite(sprite, stageForLevel(VERSUS_LEVEL))} alt="" draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'contain', filter: `drop-shadow(0 0 3px ${color})` }} />
              : <div style={{ width: '70%', height: '70%', margin: '15%', borderRadius: '50%', background: color }} />}
            <div className="absolute left-1 right-1 bottom-0 h-[3px] rounded bg-black/60"><div className="h-full rounded" style={{ width: `${hp * 100}%`, background: color }} /></div>
          </div>
        );
      })}
    </div>
  );
};

const Core: React.FC<{ x: number; y: number; cell: number; color: string; hp?: number }> = ({ x, y, cell, color, hp }) => (
  <div className="absolute flex items-center justify-center pointer-events-none"
    style={{ left: x * cell, top: y * cell, width: 2 * cell, height: 2 * cell, zIndex: 2, borderRadius: 8, background: `${color}33`, border: `2px solid ${color}`, boxShadow: `0 0 12px ${color}88`, fontSize: cell * 1.1 }}>
    🏰
    {hp !== undefined && (
      <div className="absolute left-1 right-1 -bottom-2 h-1.5 rounded bg-black/70"><div className="h-full rounded" style={{ width: `${hp * 100}%`, background: color }} /></div>
    )}
  </div>
);

function useCellSize(sideW: number): number {
  const [w, setW] = useState(typeof window === 'undefined' ? 1024 : window.innerWidth);
  useEffect(() => { const f = () => setW(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  return Math.max(12, Math.min(30, Math.floor((w - sideW - 24) / GRID_W)));
}

// ── 画面の 本体 ───────────────────────────────────────────────────
type Step = 'menu' | 'range' | 'lobby' | 'play';
interface Session {
  match: VersusMatch;
  kind: 'room' | 'practice';
  room?: VersusRoom;
  link?: LinkHandle;
  practice?: ReturnType<typeof createPractice>;
  /** あいての ひょうじ */
  oppLabel: string;
}

interface Props {
  /** 保存してある 出撃の5枠（ボスは 使えない） */
  formation: string[];
  /** 使える 系統 */
  unlocked: string[];
  /** 出撃が 閉じているときの文（名乗っている子だけ） */
  locked?: string | null;
  onBack: () => void;
}

export const VersusScreen: React.FC<Props> = ({ formation: savedFormation, unlocked, locked, onBack }) => {
  const named = versusNamed();
  usePortal((s) => s.student);
  const usable = useMemo(() => VERSUS_FAMILIES.filter((f) => unlocked.includes(f)), [unlocked]);
  const [form, setForm] = useState<string[]>(() => normalizeFormation(savedFormation.filter((f) => usable.includes(f))));
  const [step, setStep] = useState<Step>('menu');
  const [intent, setIntent] = useState<'host' | 'practice'>('host');
  const [level, setLevel] = useState<BotLevel>('normal');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;
  /** この へやで もう スタミナを つかったか（やりなおしで 二重に ひかない） */
  const spentRef = useRef(false);

  // ── 後始末：画面を 出るとき へやを 出る・合図を とじる ───────────────
  const teardown = useCallback(() => {
    const s = sessionRef.current;
    if (!s) return;
    try { s.match.leave(); } catch { /* noop */ }
    s.link?.close();
    if (s.kind === 'room' && s.room) void leaveRoom(s.room.code);
    sessionRef.current = null;
  }, []);
  useEffect(() => () => teardown(), [teardown]);

  const back = () => { teardown(); setSession(null); spentRef.current = false; onBack(); };
  const toMenu = () => { teardown(); setSession(null); spentRef.current = false; setMsg(null); setStep('menu'); };

  /** 出題範囲（単元の key）から カードを 配る。pool が空なら null */
  const prepare = useCallback(async (units: string[], seed: number): Promise<{ cards: CardKey[][]; pack: { registry: RoundRegistry; rounds: PackRound[] } } | null> => {
    const pack = await loadPack();
    const pool: CardKey[] = pack.rounds.filter((r) => units.includes(r.unitKey)).map((r) => ({ unitKey: r.unitKey, skillId: r.skillId, difficulty: r.difficulty }));
    if (pool.length < CARDS_PER_ROUND) return null;
    return { cards: dealCards(pool, seed), pack };
  }, []);

  // ── へやを つくる ───────────────────────────────────────────────
  const makeRoom = async (units: string[]) => {
    setBusy(true); setMsg(null);
    try {
      const r = await createRoom(units);
      if (r.ok === false) { setMsg(ERROR_TEXT[r.kind]); setStep('menu'); return; }
      await openRoom(r.data);
    } finally { setBusy(false); }
  };
  const enterRoom = async () => {
    if (!isRoomCode(code)) { setMsg('4けたの きごうを いれてね'); return; }
    setBusy(true); setMsg(null);
    try {
      const r = await joinRoom(code);
      if (r.ok === false) { setMsg(ERROR_TEXT[r.kind]); return; }
      await openRoom(r.data);
    } finally { setBusy(false); }
  };
  const openRoom = async (room: VersusRoom) => {
    const p = await prepare(room.units, room.seed);
    if (!p) { setMsg('その はんいの もんだいが たりないよ'); void leaveRoom(room.code); setStep('menu'); return; }
    const handleRef: { current: LinkHandle | null } = { current: null };
    const match = new VersusMatch({
      side: room.role, seed: room.seed, cards: p.cards, formation: form,
      link: { send: (m) => handleRef.current?.send(m) }, now: () => Date.now(),
    });
    handleRef.current = openLink(room.channel, (m) => match.receive(m), () => setSession((s) => (s ? { ...s } : s)));
    spentRef.current = false;
    const s: Session = { match, kind: 'room', room, link: handleRef.current, oppLabel: 'となりの 子' };
    sessionRef.current = s;
    setSession(s); setStep('lobby');
  };

  // ── コンピュータと れんしゅう ─────────────────────────────────────
  const startPractice = async (units: string[]) => {
    setBusy(true); setMsg(null);
    try {
      const seed = (Math.floor(Math.random() * 0xffffffff) >>> 0) || 1;
      const p = await prepare(units, seed);
      if (!p) { setMsg('その はんいの もんだいが たりないよ'); setStep('menu'); return; }
      // 名乗っている子は 出撃と同じ（スタミナ 1回ぶん。サーバが 数を きめる）。おためし・体験版・デモは つかわない
      if (named) {
        const r = await startSortie(form);
        if (r.ok === false) { setMsg(r.message); setStep('menu'); return; }
      }
      const pr = createPractice({
        seed, cards: p.cards, level, formation: form, botFormation: normalizeFormation(usable), now: () => Date.now(),
      });
      const s: Session = { match: pr.human, kind: 'practice', practice: pr, oppLabel: `コンピュータ（${BOT_LEVELS[level].label}）` };
      sessionRef.current = s;
      setSession(s); setStep('play');
      pr.tick();
      pr.human.ready();
      pr.tick();
    } finally { setBusy(false); }
  };

  // ── 「たたかう」（へや）：出撃の関門（スタミナ）→ サーバの ready → 合図で はじまる ───
  const fight = async () => {
    const s = sessionRef.current; if (!s?.room || busy) return;
    setBusy(true); setMsg(null);
    try {
      if (!spentRef.current) {
        const r = await startSortie(form);
        if (r.ok === false) { setMsg(r.message); return; }
        spentRef.current = true;
      }
      const r = await markReady(s.room.code);
      if (r.ok === false) { setMsg(ERROR_TEXT[r.kind]); return; }
      s.match.setFormation(form);
      s.match.ready();
      setStep('play');
    } finally { setBusy(false); }
  };

  // 開発のときだけ：画面の確かめ（Playwright）で 状態機械を さわれるように（本番のビルドには入らない）
  useEffect(() => {
    if (import.meta.env?.DEV && session) (window as unknown as { __cwVersusMatch?: VersusMatch }).__cwVersusMatch = session.match;
  }, [session]);

  // ── 時計：0.5秒ごとに 状態機械を 動かす ──────────────────────────────
  const [, force] = useState(0);
  useEffect(() => {
    if (!session) return;
    const un = session.match.subscribe(() => force((n) => n + 1));
    const iv = setInterval(() => {
      if (session.practice) session.practice.tick(); else session.match.update();
    }, 250);
    return () => { un(); clearInterval(iv); };
  }, [session]);
  // へやの ようす（合図が とどかない回線の ための 読みなおし）：ロビーで あいてが 出た・へやが とじた を 見つける
  useEffect(() => {
    if (!session?.room || step !== 'lobby') return;
    let on = true;
    const iv = setInterval(async () => {
      const r = await roomState(session.room!.code);
      if (!on) return;
      if (r.ok && r.data.status === 'closed') { setMsg('へやが とじられたよ'); toMenu(); }
    }, 4000);
    return () => { on = false; clearInterval(iv); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, step]);
  // 始まったら 画面を 切りかえる（合図で あいてが 先に 始めたとき）
  useEffect(() => { if (session && step === 'lobby' && session.match.phase !== 'lobby') setStep('play'); });

  // ── 画面 ───────────────────────────────────────────────────────
  if (step === 'range') {
    return (
      <RangeSelect onBack={() => setStep('menu')}
        nextLabel={intent === 'host' ? 'この はんいで へやを つくる →' : 'この はんいで れんしゅう →'}
        onConfirm={(units) => { if (intent === 'host') void makeRoom(units); else void startPractice(units); }} />
    );
  }

  if (step === 'play' && session) {
    return <PlayView session={session} formation={form} onExit={back} onAgain={toMenu} />;
  }

  if (step === 'lobby' && session) {
    const m = session.match;
    const link = session.link?.status();
    return (
      <div className="min-h-[100dvh] h-[100dvh] flex flex-col overflow-y-auto" style={font} data-testid="versus-lobby">
        <TopBar title="たいせんの へや" onBack={toMenu} />
        <div className="max-w-xl w-full mx-auto px-4 py-4 space-y-3">
          {session.room?.role === 'host' && (
            <div className="rounded-2xl border-2 p-4 text-center" style={{ borderColor: ACCENT, background: 'rgba(244,114,182,0.10)' }}>
              <div className="text-white/60 text-xs">この きごうを となりの 子に つたえてね（同じ学級の 子だけ はいれるよ）</div>
              <div className="text-white font-black tracking-[0.4em] mt-1" style={{ fontSize: 44, ...fontMono }} data-testid="room-code">{session.room.code}</div>
            </div>
          )}
          {session.room?.role === 'guest' && (
            <div className="rounded-2xl border p-3 text-center" style={{ borderColor: `${ACCENT}88`, background: 'rgba(244,114,182,0.08)' }}>
              <div className="text-white/70 text-sm">へや <b className="tracking-widest" style={fontMono}>{session.room.code}</b> に はいったよ</div>
            </div>
          )}
          <div className="rounded-2xl border border-white/15 p-3 text-center" style={{ background: 'rgba(6,10,24,0.6)' }} data-testid="lobby-opp">
            {m.opponentPresent
              ? <p className="text-[#a3e635] font-black">{m.remoteReady() ? '✓ あいては じゅんびが できたよ' : '✓ あいてが きたよ！'}</p>
              : <p className="text-white/70 text-sm">あいてが くるのを まっているよ…</p>}
            {link === 'closed' && <p className="text-[#fde68a] text-[11px] mt-1" data-testid="link-closed">つうしんが つながらないよ。学校の ネットでは たいせんが できないことが あるよ（コンピュータと れんしゅうは できる）。</p>}
          </div>
          <FormationPicker usable={usable} form={form} onChange={setForm} disabled={m.localReady()} />
          <SortieStamina formation={form} message={msg} />
          <button onClick={() => void fight()} disabled={busy || !m.opponentPresent || m.localReady()} data-testid="versus-fight"
            className="w-full py-4 rounded-2xl font-black text-lg text-white transition-all active:scale-95 disabled:opacity-40"
            style={{ border: '2px solid #ef4444', background: 'rgba(239,68,68,0.2)', ...fontMono }}>
            {m.localReady() ? 'あいてを まっているよ…' : busy ? '…' : '⚔️ たたかう！'}
          </button>
          <p className="text-white/45 text-[11px] leading-relaxed">「たたかう」を おすと スタミナを 1回ぶん つかうよ（出撃と おなじ）。ふたりとも おしたら はじまる。</p>
        </div>
      </div>
    );
  }

  // メニュー
  return (
    <div className="min-h-[100dvh] h-[100dvh] flex flex-col overflow-y-auto" style={font} data-testid="versus-menu">
      <TopBar title="となりの 子と たいせん" onBack={back} />
      <div className="max-w-xl w-full mx-auto px-4 py-4 space-y-3">
        <div className="rounded-2xl border border-white/15 p-3 text-white/70 text-[12px] leading-relaxed" style={{ background: 'rgba(6,10,24,0.6)' }}>
          <p className="font-black text-white text-sm mb-1">あそびかた（3ラウンド）</p>
          <ol className="list-decimal pl-4 space-y-0.5">
            <li><b className="text-[#34d399]">とく</b>：2人に 同じ しゅるいの もんだい 3まい。まちがえずに とけた ぶんだけ ⚡。（はやさは かんけいなし）</li>
            <li><b className="text-[#38bdf8]">おく</b>：ためた ⚡ で ネコを じぶんの じんちに おく。おわるまで あいてには 見えないよ。</li>
            <li><b className="text-[#f472b6]">みる</b>：2人の おきかたで たたかう。ひだりと みぎを いれかえて 2回。</li>
          </ol>
          <p className="mt-1">3ラウンドで あいての コアを おおく けずった ほうが かち。ひきわけも あるよ。</p>
          <p className="mt-1 text-white/50">ネコの レベルは みんな同じ（Lv{VERSUS_LEVEL}）。かち・まけの 数は どこにも のこらないよ。ごほうびは「まちがえずに とけた もんだい」の ぶんだけ。</p>
        </div>

        <FormationPicker usable={usable} form={form} onChange={setForm} />

        {named ? (
          <>
            {locked && <p className="text-[#fca5a5] text-sm font-bold text-center" data-testid="versus-lock">🔒 {locked}</p>}
            <button onClick={() => { if (locked) { setMsg(locked); return; } setIntent('host'); setStep('range'); }} disabled={busy} data-testid="versus-make"
              className="w-full py-3.5 rounded-2xl border-2 font-black text-white active:scale-95 disabled:opacity-40" style={{ borderColor: ACCENT, background: 'rgba(244,114,182,0.15)', ...fontMono }}>
              🏠 へやを つくる（きごうを おしえる）
            </button>
            <div className="rounded-2xl border border-white/15 p-3" style={{ background: 'rgba(6,10,24,0.6)' }}>
              <div className="text-white/70 text-xs mb-1.5">となりの 子の きごう（4けた）で はいる</div>
              <div className="flex gap-2">
                <input value={code} onChange={(e) => setCode(normalizeRoomCode(e.target.value))} inputMode="numeric" maxLength={4} placeholder="0000" data-testid="room-code-input"
                  className="flex-1 min-w-0 rounded-xl px-3 py-2 text-center text-2xl font-black tracking-[0.4em] bg-black/40 border border-white/25 text-white" style={fontMono} />
                <button onClick={() => { if (locked) { setMsg(locked); return; } void enterRoom(); }} disabled={busy || code.length !== 4} data-testid="versus-enter"
                  className="px-4 rounded-xl border-2 font-black text-white disabled:opacity-40 active:scale-95" style={{ borderColor: '#38bdf8', background: 'rgba(56,189,248,0.15)', ...fontMono }}>はいる</button>
              </div>
            </div>
          </>
        ) : (
          <p className="text-white/60 text-[11px] leading-relaxed rounded-xl border border-white/10 p-2.5" data-testid="versus-unnamed-note" style={{ background: 'rgba(6,10,24,0.55)' }}>
            おためしでは コンピュータが あいての「れんしゅう試合」で あそべるよ（なにも おくられない）。がっきゅうコードを 入れると、同じ学級の 子と たいせんできる。
          </p>
        )}

        <div className="rounded-2xl border border-white/15 p-3" style={{ background: 'rgba(6,10,24,0.6)' }}>
          <div className="text-white/70 text-xs mb-1.5">🤖 コンピュータと れんしゅう{named ? '（スタミナを 1回ぶん つかうよ）' : ''}</div>
          <div className="flex gap-1.5 mb-2">
            {(Object.keys(BOT_LEVELS) as BotLevel[]).map((l) => (
              <button key={l} onClick={() => setLevel(l)} data-testid={`bot-${l}`}
                className="flex-1 py-1.5 rounded-lg border text-[12px] font-black"
                style={{ borderColor: level === l ? '#a3e635' : 'rgba(255,255,255,0.2)', background: level === l ? 'rgba(163,230,53,0.15)' : 'transparent', color: level === l ? '#d9f99d' : 'rgba(255,255,255,0.7)' }}>
                {BOT_LEVELS[l].label}
              </button>
            ))}
          </div>
          <p className="text-white/45 text-[10px] mb-2">{BOT_LEVELS[level].blurb}</p>
          <button onClick={() => { if (locked) { setMsg(locked); return; } setIntent('practice'); setStep('range'); }} disabled={busy} data-testid="versus-practice"
            className="w-full py-3 rounded-xl border-2 font-black text-white active:scale-95 disabled:opacity-40" style={{ borderColor: '#a3e635', background: 'rgba(163,230,53,0.12)', ...fontMono }}>
            れんしゅう試合を はじめる
          </button>
        </div>
        {named && <SortieStamina formation={form} message={null} />}
        {msg && <p className="text-[#fde68a] text-sm font-bold text-center" role="status" data-testid="versus-msg">{msg}</p>}
      </div>
    </div>
  );
};

const TopBar: React.FC<{ title: string; onBack: () => void }> = ({ title, onBack }) => (
  <div className="flex items-center gap-3 p-4 border-b border-white/10 sticky top-0 z-20" style={{ background: 'rgba(6,10,24,0.85)', backdropFilter: 'blur(10px)' }}>
    <button onClick={onBack} className="text-white/60 hover:text-white text-sm" data-testid="versus-back">← もどる</button>
    <h2 className="font-bold text-sm" style={{ color: ACCENT, ...fontMono }}>{title}</h2>
  </div>
);

/** 出撃の5枠（対戦で つれていく ネコ）。ボスの ネコは つれてこない */
const FormationPicker: React.FC<{ usable: string[]; form: string[]; onChange: (f: string[]) => void; disabled?: boolean }> = ({ usable, form, onChange, disabled }) => {
  const toggle = (id: string) => {
    if (disabled) return;
    if (form.includes(id)) { if (form.length > 1) onChange(form.filter((f) => f !== id)); }
    else if (form.length < 5) onChange([...form, id]);
  };
  return (
    <div className="rounded-2xl border border-white/15 p-3" style={{ background: 'rgba(6,10,24,0.6)' }} data-testid="versus-formation">
      <div className="text-white/70 text-xs mb-1.5">つれていく ネコ（5まで・{form.length}/5）。レベルは みんな Lv{VERSUS_LEVEL}</div>
      <div className="flex flex-wrap gap-1.5">
        {usable.map((id) => {
          const on = form.includes(id);
          return (
            <button key={id} onClick={() => toggle(id)} aria-pressed={on} data-testid={`pick-${id}`}
              className="flex items-center gap-1 rounded-lg border px-1.5 py-1 text-[11px] font-bold transition-all active:scale-95"
              style={{ borderColor: on ? '#a3e635' : 'rgba(255,255,255,0.2)', background: on ? 'rgba(163,230,53,0.14)' : 'rgba(255,255,255,0.03)', color: on ? '#d9f99d' : 'rgba(255,255,255,0.55)', opacity: disabled ? 0.6 : 1 }}>
              <img src={spriteOf(id)} alt="" className="w-6 h-6 object-contain" draggable={false} />
              <span>{CHARACTER_BY_ID[id]?.displayName}</span>
              <span className="text-[#facc15]" style={fontMono}>{troopCost(id)}⚡</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

// ── 対戦中の 画面 ─────────────────────────────────────────────────
const PHASE_LABEL: Record<Phase, string> = { lobby: 'じゅんび', solve: 'とく', place: 'おく', watch: 'みる', check: 'くらべる', done: 'けっか' };
const PHASE_COLOR: Record<Phase, string> = { lobby: '#94a3b8', solve: '#34d399', place: '#38bdf8', watch: '#f472b6', check: '#facc15', done: '#facc15' };

const PlayView: React.FC<{ session: Session; formation: string[]; onExit: () => void; onAgain: () => void }> = ({ session, formation, onExit, onAgain }) => {
  const m = session.match;
  const [pack, setPack] = useState<{ registry: RoundRegistry; rounds: PackRound[] } | null>(null);
  useEffect(() => { let on = true; void loadPack().then((p) => { if (on) setPack(p); }); return () => { on = false; }; }, []);
  /** どこまでの ラウンドの けっかを 見たか */
  const [acked, setAcked] = useState(-1);
  const completed = m.round - 1;
  const showResult = (m.phase === 'solve' || m.phase === 'place') && completed >= 0 && completed > acked && !!m.results[completed];

  // 学習の ごほうび：といた もんだいの 数（このへやの ぶん）
  const [stats, setStats] = useState({ perfect: 0, answered: 0, credits: 0 });
  const onCard = useCallback((item: PackRound, i: number, perfect: boolean) => {
    grantStudyReward(perfect, item, formation);
    if (perfect) {
      m.markSolved(i);
      const mult = difficultyFactor(item.difficulty ?? 3) / difficultyFactor(3);
      setStats((s) => ({ perfect: s.perfect + 1, answered: s.answered + 1, credits: s.credits + Math.round(CREDIT_PER_CORRECT * mult) }));
    } else {
      try { useReviewStore.getState().addMiss(item); } catch { /* noop */ }
      setStats((s) => ({ ...s, answered: s.answered + 1 }));
    }
  }, [m, formation]);

  const side = m.side;
  const oppSide = otherSide(side);
  /** 「やめる」の かくにん（window.confirm は iPad で 出ないことが あるので アプリの中で） */
  const [askLeave, setAskLeave] = useState(false);

  return (
    <div className="min-h-[100dvh] h-[100dvh] flex flex-col overflow-hidden" style={font} data-testid="versus-play" data-phase={m.phase} data-round={m.round}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10 flex-wrap" style={{ background: 'rgba(6,10,24,0.85)' }}>
        <button onClick={() => (m.phase === 'done' ? onExit() : setAskLeave(true))} className="text-white/60 hover:text-white text-xs px-2 py-1 rounded border border-white/15" data-testid="versus-leave">やめる</button>
        <span className="text-white/60 text-[11px]">あいて：<b className="text-white">{session.oppLabel}</b></span>
        <span className="font-black text-xs px-2 py-0.5 rounded-full border" style={{ color: PHASE_COLOR[m.phase], borderColor: `${PHASE_COLOR[m.phase]}88`, ...fontMono }} data-testid="phase-chip">
          {m.phase === 'done' || m.phase === 'lobby' ? PHASE_LABEL[m.phase] : `ラウンド ${m.round + 1}/${VERSUS_ROUNDS}・${PHASE_LABEL[m.phase]}`}
        </span>
        <span className="ml-auto flex items-center gap-2 text-[11px]">
          <span className="text-[#facc15] font-black" style={fontMono} data-testid="energy">⚡ {m.localEnergy()}</span>
          <TimeLeft match={m} />
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {m.phase === 'lobby' && <div className="p-6 text-center text-white/70 text-sm" data-testid="play-wait">あいての じゅんびを まっているよ…</div>}
        {m.phase === 'solve' && pack && <SolvePanel match={m} pack={pack} onCard={onCard} />}
        {m.phase === 'solve' && !pack && <div className="p-6 text-center text-white/60 text-sm">よみこみ中…</div>}
        {m.phase === 'place' && <PlacePanel match={m} oppLabel={session.oppLabel} />}
        {m.phase === 'watch' && <WatchPanel key={`${m.round}-${m.half}`} match={m} />}
        {m.phase === 'check' && <div className="p-6 text-center text-white/70 text-sm" data-testid="play-check">けっかを くらべているよ…</div>}
        {m.phase === 'done' && <EndPanel match={m} stats={stats} oppLabel={session.oppLabel} onExit={onExit} onAgain={onAgain} />}
      </div>

      {askLeave && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4" style={{ background: 'rgba(3,6,16,0.8)' }} data-testid="leave-confirm">
          <div className="w-full max-w-sm rounded-2xl border-2 p-4 text-center" style={{ borderColor: '#fca5a5', background: 'rgba(8,12,28,0.98)' }}>
            <p className="text-white font-black mb-1">たいせんを やめる？</p>
            <p className="text-white/60 text-[12px] mb-3">{session.kind === 'room' ? 'あいてには「でた」と つたわるよ。使った スタミナは もどらないよ。' : '使った スタミナは もどらないよ。'}</p>
            <div className="flex gap-2">
              <button onClick={() => setAskLeave(false)} className="flex-1 py-2.5 rounded-xl border-2 font-black text-white" style={{ borderColor: '#a3e635', background: 'rgba(163,230,53,0.15)' }} data-testid="leave-no">つづける</button>
              <button onClick={onExit} className="flex-1 py-2.5 rounded-xl border-2 font-black text-white" style={{ borderColor: '#ef4444', background: 'rgba(239,68,68,0.15)' }} data-testid="leave-yes">やめる</button>
            </div>
          </div>
        </div>
      )}
      {showResult && (
        <RoundResultOverlay match={m} round={completed} side={side} oppSide={oppSide} onNext={() => setAcked(completed)} />
      )}
    </div>
  );
};

const TimeLeft: React.FC<{ match: VersusMatch }> = ({ match }) => {
  const ms = match.msLeft();
  if (ms === null) return null;
  const s = Math.ceil(ms / 1000);
  return <span className="text-white/60" style={fontMono} data-testid="time-left">のこり {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</span>;
};

// ── とく ─────────────────────────────────────────────────────────
const SolvePanel: React.FC<{
  match: VersusMatch; pack: { registry: RoundRegistry; rounds: PackRound[] };
  onCard: (item: PackRound, i: number, perfect: boolean) => void;
}> = ({ match, pack, onCard }) => {
  const hand = match.handNow();
  const [open, setOpen] = useState<number | null>(null);
  const [state, setState] = useState<Record<string, 'ok' | 'ng'>>({});
  const [result, setResult] = useState<'perfect' | 'missed' | null>(null);
  const [solved, setSolved] = useState(false);
  const [serial, setSerial] = useState(0);
  const r = match.round;
  const keyOf = (i: number) => `${r}:${i}`;
  const itemOf = (c: CardKey): PackRound | undefined => pack.rounds.find((x) => x.unitKey === c.unitKey && x.skillId === c.skillId);
  const done = hand.filter((_, i) => state[keyOf(i)]).length;
  const finished = match.localDoneSolving();

  // 3まいとも 答えが 出たら 自動で「おわり」にする（もんだいを とじた あと）
  useEffect(() => {
    if (open === null && !finished && hand.length > 0 && done >= hand.length) match.finishSolving();
  }, [open, finished, done, hand.length, match]);

  const openCard = (i: number) => {
    if (state[keyOf(i)] || finished) return;
    sfx.tap?.(); setResult(null); setSolved(false); setSerial((n) => n + 1); setOpen(i);
  };
  const item = open === null ? null : itemOf(hand[open]);

  return (
    <div className="max-w-2xl w-full mx-auto p-4 space-y-3" data-testid="solve-panel">
      <div className="rounded-xl border border-[#34d399]/40 p-3 text-[12px] text-white/80 leading-relaxed" style={{ background: 'rgba(52,211,153,0.08)' }}>
        もんだいを とこう。<b className="text-[#34d399]">まちがえずに とけた</b> ぶんだけ ⚡。まちがえても ばつは ないよ（ヒントで さいごまで とけるよ）。
        <b className="text-white"> はやく とけても トクは しないよ</b>（おくのは 2人が そろってから）。
      </div>
      <div className="grid gap-2">
        {hand.map((c, i) => {
          const st = state[keyOf(i)];
          const it = itemOf(c);
          return (
            <button key={i} onClick={() => openCard(i)} disabled={!!st || finished} data-testid={`card-${i}`} data-state={st ?? 'new'}
              className="text-left rounded-xl px-3 py-2.5 transition-all active:scale-[0.98] disabled:opacity-60"
              style={{ background: 'rgba(8,12,24,0.92)', border: `2px solid ${st === 'ok' ? '#a3e635' : st === 'ng' ? '#fbbf24' : cardColor(c.difficulty)}` }}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-black" style={{ color: cardColor(c.difficulty) }}>{cardLabel(c.difficulty)}</span>
                <span className="text-[13px] font-black text-[#facc15]" style={fontMono}>
                  {st === 'ok' ? '✓ ' : ''}+{cardReward(c.difficulty, rewardWeight)}⚡
                </span>
              </div>
              <div className="text-sm font-bold text-white leading-tight">{it?.label ?? c.skillId}</div>
              <div className="text-[10px] text-white/50">{UNIT_NAME_BY_KEY[c.unitKey] ?? ''}{st === 'ng' ? '　ざんねん（⚡は なし）' : ''}</div>
            </button>
          );
        })}
      </div>
      {finished ? (
        <p className="text-center text-white/70 text-sm py-3" data-testid="solve-waiting">
          {match.remoteDoneSolving() ? 'つぎは おく じかん…' : 'あいてが とくのを まっているよ（ゆっくり まっててね）'}
        </p>
      ) : (
        <button onClick={() => match.finishSolving()} data-testid="solve-finish"
          className="w-full py-3 rounded-xl border-2 font-black text-white active:scale-95" style={{ borderColor: '#38bdf8', background: 'rgba(56,189,248,0.15)', ...fontMono }}>
          {done >= hand.length ? 'おく へ すすむ →' : 'ここまでで おく へ すすむ →'}
        </button>
      )}
      {!finished && match.remoteDoneSolving() && <p className="text-center text-[#a3e635] text-[12px]" data-testid="opp-solved">あいては もう おわったよ。ゆっくりで いいよ。</p>}

      {open !== null && item && (
        <div className="fixed inset-0 z-[140] flex flex-col" style={{ background: 'rgba(3,6,16,0.5)', backdropFilter: 'blur(1.5px)' }} data-testid="solve-modal">
          <div className="flex items-center gap-3 p-3 border-b border-[#facc15]/25 flex-wrap" style={{ background: 'rgba(3,6,16,0.92)' }}>
            <span className="text-[#facc15] font-bold text-sm" style={fontMono}>⚡ エナジーチャージ</span>
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-sky-400/10 border border-sky-400/40 text-sky-300">{item.label}　+{cardReward(hand[open].difficulty, rewardWeight)}⚡</span>
            <button onClick={() => { setOpen(null); }} className="ml-auto text-white/70 hover:text-white text-sm px-3 py-1 rounded-lg border border-white/15" data-testid="solve-close">
              {result === null ? 'やめて もどる ✕' : 'もどる ✕'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col items-center">
            <div className="w-full max-w-2xl">
              {result === 'perfect' && <div className="text-center mb-2 rounded-xl py-2 font-black text-[#a3e635] border border-[#a3e635]/50" style={{ background: 'rgba(8,12,22,0.95)' }}>✓ せいかい！ +{cardReward(hand[open].difficulty, rewardWeight)}⚡</div>}
              {result === 'missed' && (
                <div className="text-center mb-2 rounded-xl py-2 text-sm font-bold text-amber-200 border border-amber-300/40" style={{ background: 'rgba(8,12,22,0.95)' }}>
                  {solved ? 'さいごまで とけたね。つぎの カードで ⚡ を とろう！' : 'ヒントを見て、さいごまで といてみよう（この カードの ⚡ は なし）'}
                </div>
              )}
              <AppRoundHost key={serial} registry={pack.registry} item={item}
                onFirstResult={(perfect) => {
                  const i = open;
                  setResult(perfect ? 'perfect' : 'missed'); perfect ? sfx.correct() : sfx.incorrect();
                  setState((s) => ({ ...s, [keyOf(i)]: perfect ? 'ok' : 'ng' }));
                  onCard(item, i, perfect);
                }}
                onSolved={() => setSolved(true)} />
              {(result === 'perfect' || solved) && (
                <button onClick={() => setOpen(null)} data-testid="solve-back"
                  className="w-full mt-3 py-3 rounded-xl font-black text-lg active:scale-95" style={{ background: 'rgba(163,230,53,0.22)', border: '2px solid #a3e635', color: '#a3e635' }}>
                  もどる →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ── おく ─────────────────────────────────────────────────────────
const PlacePanel: React.FC<{ match: VersusMatch; oppLabel: string }> = ({ match, oppLabel }) => {
  const map = versusMap(match.seed, match.round);
  const cell = useCellSize(250);
  const energy = match.localEnergy();
  const draft = match.draft;
  const used = draft.reduce((s, u) => s + troopCost(u.id), 0);
  const left = energy - used;
  const [sel, setSel] = useState<string>(match.formation[0]);
  const done = match.localDonePlacing();
  const count = (id: string) => draft.filter((u) => u.id === id).length;

  const tap = (x: number, y: number) => {
    if (done) return;
    const at = draft.findIndex((u) => u.x === x && u.y === y);
    if (at >= 0) { match.setDraft(draft.filter((_, i) => i !== at)); sfx.tap?.(); return; }
    if (!sel || troopCost(sel) > left || draft.length >= MAX_PLACED || count(sel) >= MAX_PER_FAMILY) { sfx.incorrect?.(); return; }
    match.setDraft([...draft, { id: sel, x, y }]); sfx.select?.();
  };
  const auto = () => {
    if (done) return;
    match.setDraft(smartPlacement(new DetRNG((Date.now() >>> 0) || 1), match.formation, energy, map));
  };

  return (
    <div className="p-3 flex flex-col lg:flex-row gap-3 items-start justify-center" data-testid="place-panel">
      <div>
        <Board map={map} cell={cell} mirror={false} placement={draft} zone onCell={tap} />
        <p className="text-white/50 text-[10px] mt-1">水色の ますに おけるよ（タップで おく・もういちど タップで けす）。右がわの 🏰 が あいての コア。</p>
      </div>
      <div className="w-full lg:w-[230px] space-y-2">
        <div className="rounded-xl border border-[#facc15]/40 p-2.5" style={{ background: 'rgba(250,204,21,0.07)' }}>
          <div className="flex items-center justify-between">
            <span className="text-white/70 text-[11px]">のこりの ⚡</span>
            <span className="text-[#facc15] font-black text-lg" style={fontMono} data-testid="energy-left">{left}</span>
          </div>
          <div className="text-white/45 text-[10px]">おいた ネコ {draft.length}/{MAX_PLACED}・同じ ネコは {MAX_PER_FAMILY}ひきまで</div>
          {energy === 0 && <p className="text-[#fde68a] text-[11px] mt-1" data-testid="no-energy">⚡ が 0 だよ。もんだいを とくと ネコが おけるよ（つぎの ラウンドで がんばろう）。</p>}
        </div>
        <div className="grid grid-cols-1 gap-1">
          {match.formation.map((id) => {
            const c = troopCost(id);
            const can = c <= left && count(id) < MAX_PER_FAMILY;
            return (
              <button key={id} onClick={() => setSel(id)} disabled={done} data-testid={`unit-${id}`} aria-pressed={sel === id}
                className="flex items-center gap-2 rounded-lg border px-2 py-1 text-left transition-all active:scale-95"
                style={{ borderColor: sel === id ? '#38bdf8' : 'rgba(255,255,255,0.15)', background: sel === id ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.03)', opacity: can || sel === id ? 1 : 0.5 }}>
                <img src={spriteOf(id)} alt="" className="w-8 h-8 object-contain" draggable={false} />
                <span className="flex-1 min-w-0 text-[12px] font-bold text-white truncate">{CHARACTER_BY_ID[id]?.displayName}</span>
                <span className="text-[#facc15] text-[11px] font-black" style={fontMono}>{c}⚡</span>
                <span className="text-white/50 text-[10px] w-6 text-right">×{count(id)}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-1.5">
          <button onClick={auto} disabled={done} data-testid="place-auto" className="flex-1 py-2 rounded-lg border border-[#a3e635]/50 text-[#d9f99d] text-[12px] font-black disabled:opacity-40">おまかせ</button>
          <button onClick={() => match.setDraft([])} disabled={done} data-testid="place-clear" className="flex-1 py-2 rounded-lg border border-white/25 text-white/70 text-[12px] font-black disabled:opacity-40">ぜんぶ けす</button>
        </div>
        <button onClick={() => match.submit()} disabled={done} data-testid="place-done"
          className="w-full py-3 rounded-xl border-2 font-black text-white active:scale-95 disabled:opacity-60" style={{ borderColor: '#f472b6', background: 'rgba(244,114,182,0.18)', ...fontMono }}>
          {done ? 'できた！ あいてを まっているよ…' : 'できた！'}
        </button>
        <p className="text-[11px] text-white/55" data-testid="opp-place">{oppLabel}：{match.remoteDonePlacing() ? '✓ おきおわったよ' : 'おいているよ…'}</p>
      </div>
    </div>
  );
};

// ── みる ─────────────────────────────────────────────────────────
const WatchPanel: React.FC<{ match: VersusMatch }> = ({ match }) => {
  const setup = match.halfSetup();
  const map = versusMap(match.seed, match.round);
  const cell = useCellSize(24);
  const runnerRef = useRef<SimRunner | null>(null);
  const [, bump] = useState(0);
  const [speed, setSpeed] = useState(1);
  const spdRef = useRef(1);
  const [finished, setFinished] = useState(false);
  const reported = useRef(false);
  const localPl = setup ? setup.playerOf[match.side] : 'P1';

  useEffect(() => {
    if (!setup) return;
    const runner = new SimRunner(setup.cfg, setup.init);
    runnerRef.current = runner;
    const prov = new ScheduledProvider(setup.commands);
    let last = performance.now();
    let raf = 0;
    const end = () => runner.tick >= HALF_TICKS || runner.state.result !== null;
    const loop = (t: number) => {
      const dt = Math.min(100, t - last); last = t;
      if (!end()) runner.advance(dt * spdRef.current, prov);
      bump((n) => n + 1);
      if (end()) { setFinished(true); return; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setup]);
  useEffect(() => { spdRef.current = speed; }, [speed]);

  // 1回の「みる」が おわったら 少し 見せてから 報告する
  useEffect(() => {
    if (!finished || reported.current) return;
    const t = setTimeout(() => { reported.current = true; if (runnerRef.current) match.halfDone(summarizeHalf(runnerRef.current.state)); }, 1400);
    return () => clearTimeout(t);
  }, [finished, match]);

  /** ⏩ スキップ：さいごまで 一気に 計算（ゆっくり 見ても 同じ けっか） */
  const skip = () => {
    const runner = runnerRef.current; if (!runner || !setup || reported.current) return;
    const prov = new ScheduledProvider(setup.commands);
    let guard = 0;
    while (runner.tick < HALF_TICKS && runner.state.result === null && guard++ < HALF_TICKS + 10) runner.advance(TICK_MS, prov);
    reported.current = true;
    match.halfDone(summarizeHalf(runner.state));
  };

  const runner = runnerRef.current;
  const ents = runner?.state.entities ?? [];
  const core = (pl: 'P1' | 'P2') => ents.find((e) => e.type === 'BUILDING' && e.subType === BuildingType.TOWN_HALL && playerOf(e) === pl);
  const oppPl = localPl === 'P1' ? 'P2' : 'P1';
  const mine = core(localPl), theirs = core(oppPl);
  const myLeft = mine ? mine.hp / mine.maxHp : 0, oppLeft = theirs ? theirs.hp / theirs.maxHp : 0;
  const mirror = localPl === 'P2';
  const secs = Math.max(0, Math.ceil((HALF_TICKS - (runner?.tick ?? 0)) * TICK_MS / 1000));

  if (!setup) return <div className="p-6 text-center text-white/60 text-sm">じゅんび中…</div>;
  return (
    <div className="p-3 flex flex-col items-center gap-2" data-testid="watch-panel">
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <span className="text-[12px] font-black px-3 py-1 rounded-full border" data-testid="half-chip"
          style={{ borderColor: '#f472b6', color: '#f9a8d4' }}>
          {match.half === 0 ? 'ぜんはん' : 'こうはん'}：{match.half === 0 ? '' : 'ひだりと みぎを いれかえて もういちど！ '}あと {secs}びょう
        </span>
        <div className="flex gap-1">
          {[1, 3].map((s) => (
            <button key={s} onClick={() => setSpeed(s)} className="px-2 py-0.5 rounded border text-[11px] font-black" data-testid={`speed-${s}`}
              style={{ borderColor: speed === s ? '#38bdf8' : 'rgba(255,255,255,0.2)', color: speed === s ? '#7dd3fc' : 'rgba(255,255,255,0.6)' }}>×{s}</button>
          ))}
          <button onClick={skip} disabled={reported.current} className="px-2 py-0.5 rounded border border-white/25 text-white/70 text-[11px] font-black" data-testid="watch-skip">⏩ スキップ</button>
        </div>
      </div>
      <div className="flex items-center gap-3 text-[11px] font-black w-full max-w-[880px] justify-between px-1">
        <span style={{ color: MINE }}>きみの コア {pct(myLeft)}</span>
        <span style={{ color: THEIRS }}>あいての コア {pct(oppLeft)}</span>
      </div>
      <Board map={map} cell={cell} mirror={mirror} entities={ents} localPl={localPl} />
      {finished && <p className="text-white/70 text-sm" data-testid="half-done">{runner?.state.result ? 'コアが おちた！' : 'じかんぎれ！'}</p>}
    </div>
  );
};

// ── ラウンドの けっか ─────────────────────────────────────────────
const RoundResultOverlay: React.FC<{ match: VersusMatch; round: number; side: Side; oppSide: Side; onNext: () => void }> = ({ match, round, side, oppSide, onNext }) => {
  const r = match.results[round];
  if (!r) return null;
  const mine = r.score[side], theirs = r.score[oppSide];
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" style={{ background: 'rgba(3,6,16,0.82)' }} data-testid="round-result">
      <div className="w-full max-w-md rounded-2xl border-2 p-4" style={{ borderColor: ACCENT, background: 'rgba(8,12,28,0.98)' }}>
        <h3 className="text-center font-black text-white mb-2" style={fontMono}>ラウンド {round + 1} の けっか</h3>
        <ScoreBar label="きみが あいての コアを けずった" v={mine} color={MINE} />
        <ScoreBar label="あいてが きみの コアを けずった" v={theirs} color={THEIRS} />
        <div className="mt-2 text-white/55 text-[11px] leading-relaxed">
          {[0, 1].map((h) => `${h === 0 ? 'ぜんはん' : 'こうはん'}：きみ ${pct(r.halves[h][side])}・あいて ${pct(r.halves[h][oppSide])}`).join('　／　')}
        </div>
        <p className="text-white/45 text-[10px] mt-1">ひだりと みぎを いれかえた 2回の へいきんだよ。</p>
        <button onClick={onNext} data-testid="round-next" className="w-full mt-3 py-3 rounded-xl border-2 font-black text-white active:scale-95" style={{ borderColor: '#a3e635', background: 'rgba(163,230,53,0.15)', ...fontMono }}>
          つぎへ ▶
        </button>
      </div>
    </div>
  );
};
const ScoreBar: React.FC<{ label: string; v: number; color: string }> = ({ label, v, color }) => (
  <div className="mb-1.5">
    <div className="flex justify-between text-[11px]"><span className="text-white/75">{label}</span><span className="font-black" style={{ color, ...fontMono }}>{pct(v)}</span></div>
    <div className="h-2.5 rounded-full bg-white/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: pct(Math.min(1, v)), background: color }} /></div>
  </div>
);

// ── おわり ───────────────────────────────────────────────────────
const EndPanel: React.FC<{
  match: VersusMatch; stats: { perfect: number; answered: number; credits: number }; oppLabel: string; onExit: () => void; onAgain: () => void;
}> = ({ match, stats, oppLabel, onExit, onAgain }) => {
  const end = match.end;
  const me = match.side;
  const out = end?.outcome;
  const result: 'win' | 'lose' | 'draw' | null = !out ? null : out === 'draw' ? 'draw' : out === me ? 'win' : 'lose';
  const TEXT = {
    win: { big: 'きみの かち！', sub: 'よく かんがえて おけたね。', color: '#a3e635' },
    lose: { big: 'こんかいは ざんねん', sub: 'でも ぜんぶ まなびに なったよ。もういちど やってみよう！', color: '#7dd3fc' },
    draw: { big: 'ひきわけ！', sub: 'いい しょうぶだったね。', color: '#fde68a' },
  };
  const info = result ? TEXT[result] : null;
  const reason: Record<string, string> = {
    left: `${oppLabel}が いなくなったよ。（かち・まけは つけないよ）`,
    desync: 'けいさんが ずれたので ひきわけに したよ。もういちど あそんでみてね。',
    version: 'ページの バージョンが ちがうみたい。ページを よみこみなおして、もういちど ためしてね。',
    cancel: 'たいせんを おわったよ。',
  };
  const totals = match.totals;
  return (
    <div className="max-w-md w-full mx-auto p-4 space-y-3" data-testid="end-panel" data-result={result ?? end?.kind}>
      <div className="rounded-2xl border-2 p-4 text-center" style={{ borderColor: info?.color ?? '#94a3b8', background: 'rgba(8,12,28,0.9)' }}>
        <div className="font-black text-2xl" style={{ color: info?.color ?? '#e2e8f0', ...font }} data-testid="end-big">{info ? info.big : (end?.kind === 'desync' ? 'ひきわけ' : 'おしまい')}</div>
        <div className="text-white/75 text-sm mt-1">{info ? info.sub : reason[end?.kind ?? 'cancel']}</div>
        {end?.kind === 'desync' && <div className="text-white/55 text-[11px] mt-1">{reason.desync}</div>}
      </div>
      {end?.kind === 'finished' && (
        <div className="rounded-xl border border-white/15 p-3" style={{ background: 'rgba(6,10,24,0.6)' }}>
          <div className="text-white/70 text-xs mb-1.5">3ラウンドの あわせて（あいての コアを けずった わりあい）</div>
          <ScoreBar label="きみ" v={totals[me] / VERSUS_ROUNDS} color={MINE} />
          <ScoreBar label={oppLabel} v={totals[otherSide(me)] / VERSUS_ROUNDS} color={THEIRS} />
        </div>
      )}
      <div className="rounded-xl border border-[#facc15]/30 p-3 text-[12px] text-white/80" style={{ background: 'rgba(250,204,21,0.06)' }} data-testid="end-rewards">
        まちがえずに とけた もんだい：<b className="text-[#facc15]">{stats.perfect}</b> もん（💠 +{stats.credits}）
        <div className="text-white/45 text-[10px] mt-0.5">ごほうびは といた もんだいの ぶんだけ。かった・まけたでは ふえも へりも しないよ。</div>
      </div>
      <div className="flex gap-2">
        <button onClick={onAgain} data-testid="end-again" className="flex-1 py-3 rounded-xl border-2 font-black text-white active:scale-95" style={{ borderColor: ACCENT, background: 'rgba(244,114,182,0.15)', ...fontMono }}>もういちど</button>
        <button onClick={onExit} data-testid="end-home" className="flex-1 py-3 rounded-xl border-2 font-black text-white active:scale-95" style={{ borderColor: '#38bdf8', background: 'rgba(56,189,248,0.15)', ...fontMono }}>ホームへ</button>
      </div>
    </div>
  );
};

// 開発のときだけ：画面の確かめ（Playwright）。本番のビルドには入らない（portal/versusDevMock.ts）
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  void import('../../portal/versusDevMock');
}
