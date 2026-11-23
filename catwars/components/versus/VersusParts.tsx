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
  Button, Card, Chip, Disclosure, FacilityImg, Icon, Notice, Panel, ProgressBar, ScreenBackdrop, SectionTitle, Segmented, StatPill, TitleBar,
} from '../ui';
import {
  createRoom, joinRoom, roomState, markReady, leaveRoom, versusNamed, type VersusRoom, type VersusErrorKind,
} from '../../portal/versusSync';
import { openLink, type LinkHandle } from '../../net/broadcastLink';

// ── ホームの カード ───────────────────────────────────────────────
export const VersusCard: React.FC<{ locked?: string | null; onOpen: () => void }> = ({ locked, onOpen }) => (
  <Card icon="versus" title="となりの 子と たいせん" data-testid="versus-card"
    sub="2人で 同時に。コンピュータとの れんしゅうも できる"
    lockReason={locked ?? undefined} locked={!!locked} onClick={onOpen} />
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
const pct = (x: number) => `${Math.round(x * 100)}%`;
const spriteOf = (id: string): string => `${getCharacterSprite(spriteFamilyForSubType(id) ?? id, stageForLevel(VERSUS_LEVEL))}`;

// ── 戦場の 絵（おく・みる で 同じもの）────────────────────────────────
/** 自分＝シアン（行動）・あいて＝ピンク（この画面だけの役目。--cw-opp） */
const MINE = 'var(--cw-action)', THEIRS = 'var(--cw-opp)';
const mix = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, transparent)`;
const mixOn = (c: string, p: number) => `color-mix(in srgb, ${c} ${p}%, var(--cw-bg-1))`;

/** 自分が いつも 左がわに 見えるよう、右がわに 立つ回は 左右を ひっくりかえして 描く */
const Board: React.FC<{
  map: BattleMap; cell: number; mirror: boolean;
  entities?: BattleEntity[]; localPl?: 'P1' | 'P2';
  /** おく画面：自分の側（左がわ）の 座標で ならべた おきかた */
  placement?: Placement; zone?: boolean; onCell?: (x: number, y: number) => void;
}> = ({ map, cell, mirror, entities, localPl, placement, zone, onCell }) => {
  const fx = (x: number, w = 1) => (mirror ? GRID_W - x - w : x);
  const cells = useMemo(() => (zone ? placeableCells(map) : []), [map, zone]);
  const cellSet = useMemo(() => new Set(cells.map((c) => `${c.x},${c.y}`)), [cells]);
  const full = (e: BattleEntity) => (e.type === 'BUILDING' ? 2 : 1);
  /** 盤面は 1まいの 面として 押す（1ますは 44px より 小さいので、ますごとの ボタンには しない） */
  const onZoneClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / cell), y = Math.floor((e.clientY - r.top) / cell);
    if (cellSet.has(`${x},${y}`)) onCell?.(x, y);
  };
  return (
    <div className="relative rounded-cw-md overflow-hidden flex-shrink-0 select-none" data-testid="versus-board"
      style={{ width: GRID_W * cell, height: GRID_H * cell, background: `linear-gradient(90deg, ${mixOn(MINE, 14)} 48%, ${mixOn(THEIRS, 14)} 52%)`, outline: '1px solid var(--cw-line-strong)', outlineOffset: -1 }}>
      <TerrainLayer terrain={map.terrain.map((t) => ({ ...t, x: fx(t.x) }))} cellSize={cell} />
      {/* まんなかの線 */}
      <div className="absolute top-0 bottom-0" style={{ left: (GRID_W / 2) * cell - 1, width: 2, background: 'var(--cw-line-strong)' }} />
      {zone && cells.map((c) => (
        <div key={`${c.x},${c.y}`} aria-hidden data-cell={`${c.x},${c.y}`} className="absolute pointer-events-none"
          style={{ left: c.x * cell, top: c.y * cell, width: cell, height: cell, background: mix(MINE, 12), boxShadow: `inset 0 0 0 1px ${mix(MINE, 28)}`, zIndex: 1 }} />
      ))}
      {zone && (
        <div role="application" aria-label="ネコを おく ばんめん（水色の ますを おす）" data-testid="place-surface"
          className="absolute inset-0 cursor-pointer" style={{ zIndex: 6 }} onClick={onZoneClick} />
      )}
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
            style={{ left: fx(e.x, 1) * cell, top: e.y * cell, width: cell, height: cell, zIndex: 4 }}>
            {sprite
              ? <img src={getCharacterSprite(sprite, stageForLevel(VERSUS_LEVEL))} alt="" draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'contain', filter: `drop-shadow(0 0 3px ${color})` }} />
              : <div style={{ width: '70%', height: '70%', margin: '15%', borderRadius: '50%', background: color }} />}
            <div className="absolute left-1 right-1 bottom-0 h-[3px] rounded" style={{ background: 'var(--cw-bg-0)' }}><div className="h-full rounded" style={{ width: `${hp * 100}%`, background: color }} /></div>
          </div>
        );
      })}
    </div>
  );
};

const Core: React.FC<{ x: number; y: number; cell: number; color: string; hp?: number }> = ({ x, y, cell, color, hp }) => (
  <div className="absolute flex items-center justify-center pointer-events-none"
    style={{ left: x * cell, top: y * cell, width: 2 * cell, height: 2 * cell, zIndex: 2, borderRadius: 8, background: mix(color, 22), border: `2px solid ${color}`, boxShadow: `0 0 12px ${mix(color, 55)}` }}>
    <FacilityImg type={BuildingType.TOWN_HALL} size={Math.round(cell * 1.5)} />
    {hp !== undefined && (
      <div className="absolute left-1 right-1 -bottom-2 h-1.5 rounded" style={{ background: 'var(--cw-bg-0)' }}><div className="h-full rounded" style={{ width: `${hp * 100}%`, background: color }} /></div>
    )}
  </div>
);

/** 1ますの 大きさ。よこ長（lg 以上）は 右に 操作の 列（sideW）が ならぶ。たて長は 盤面が 上・操作が 下で 横いっぱい */
function useCellSize(sideW: number): number {
  const [w, setW] = useState(typeof window === 'undefined' ? 1024 : window.innerWidth);
  useEffect(() => { const f = () => setW(window.innerWidth); window.addEventListener('resize', f); return () => window.removeEventListener('resize', f); }, []);
  const side = w >= 1024 ? sideW : 0;
  return Math.max(12, Math.min(30, Math.floor((w - side - 24) / GRID_W)));
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
      <VsShell title="たいせんの へや" onBack={toMenu} testid="versus-lobby">
        {session.room?.role === 'host' && (
          <Panel strong className="cw-tone-opp text-center" style={{ boxShadow: 'var(--cw-shadow-panel), var(--cw-lit-opp)' }}>
            <div className="text-cw-14" style={{ color: 'var(--cw-fg-2)' }}>この きごうを となりの 子に つたえてね（同じ学級の 子だけ はいれるよ）</div>
            <div className="font-cw-num font-black mt-2 leading-none" style={{ fontSize: 56, letterSpacing: '0.3em', paddingLeft: '0.3em', color: 'var(--cw-fg)' }} data-testid="room-code">{session.room.code}</div>
          </Panel>
        )}
        {session.room?.role === 'guest' && (
          <Panel className="cw-tone-opp text-center">
            <div className="text-cw-14" style={{ color: 'var(--cw-fg-2)' }}>へや の きごう</div>
            <div className="font-cw-num font-black leading-none mt-1" style={{ fontSize: 40, letterSpacing: '0.3em', paddingLeft: '0.3em', color: 'var(--cw-fg)' }}>{session.room.code}</div>
            <div className="text-cw-14 mt-1" style={{ color: 'var(--cw-fg-2)' }}>に はいったよ</div>
          </Panel>
        )}
        <Panel className="text-center" data-testid="lobby-opp">
          {m.opponentPresent
            ? <p className="flex items-center justify-center gap-2 text-cw-16 font-extrabold" style={{ color: 'var(--cw-growth)' }}><Icon name="check" size={26} />{m.remoteReady() ? 'あいては じゅんびが できたよ' : 'あいてが きたよ！'}</p>
            : <p className="text-cw-16 cw-nudge" style={{ color: 'var(--cw-fg-2)' }}>あいてが くるのを まっているよ…</p>}
          {link === 'closed' && <p className="text-cw-14 mt-2" style={{ color: 'var(--cw-reward)' }} data-testid="link-closed">つうしんが つながらないよ。学校の ネットでは たいせんが できないことが あるよ（コンピュータと れんしゅうは できる）。</p>}
        </Panel>
        <FormationPicker usable={usable} form={form} onChange={setForm} disabled={m.localReady()} />
        <SortieStamina formation={form} message={msg} />
        <Button variant="primary" size="xl" fullWidth onClick={() => void fight()} disabled={busy || !m.opponentPresent || m.localReady()} data-testid="versus-fight">
          {m.localReady() ? 'あいてを まっているよ…' : busy ? '…' : <><Icon name="sortie" size={32} />たたかう！</>}
        </Button>
        <p className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>「たたかう」を おすと スタミナを 1回ぶん つかうよ（出撃と おなじ）。ふたりとも おしたら はじまる。</p>
      </VsShell>
    );
  }

  // メニュー
  return (
    <VsShell title="となりの 子と たいせん" onBack={back} testid="versus-menu">
      <Panel>
        <SectionTitle tone="opp">あそびかた（3ラウンド）</SectionTitle>
        <div className="flex items-center gap-1.5 flex-wrap mt-3">
          {HOW.map((h, i) => (
            <React.Fragment key={h.key}>
              {i > 0 && <Icon name="chevron" size={18} style={{ transform: 'rotate(-90deg)', opacity: 0.7 }} />}
              <Chip tone={h.tone} className="min-h-[36px] text-cw-14"><Icon name={h.icon} size={22} />{h.label}</Chip>
            </React.Fragment>
          ))}
        </div>
        <p className="text-cw-14 mt-3 leading-relaxed" style={{ color: 'var(--cw-fg-2)' }}>3ラウンドで あいての コアを おおく けずった ほうが かち。ひきわけも あるよ。</p>
      </Panel>
      <Disclosure title="くわしい あそびかた" icon="bulb">
        <ol className="space-y-2">
          {HOW.map((h) => (
            <li key={h.key} className="flex gap-2.5 items-start">
              <Chip tone={h.tone} className="flex-shrink-0">{h.label}</Chip>
              <span className="text-cw-14 leading-snug" style={{ color: 'var(--cw-fg-2)' }}>{h.text}</span>
            </li>
          ))}
        </ol>
        <p className="text-cw-14 mt-3 leading-snug" style={{ color: 'var(--cw-fg-3)' }}>ネコの レベルは みんな同じ（Lv{VERSUS_LEVEL}）。かち・まけの 数は どこにも のこらないよ。ごほうびは「まちがえずに とけた もんだい」の ぶんだけ。</p>
      </Disclosure>

      <FormationPicker usable={usable} form={form} onChange={setForm} />

      {named ? (
        <>
          {locked && <p className="flex items-center justify-center gap-1.5 text-cw-14 font-bold text-center" style={{ color: 'var(--cw-danger)' }} data-testid="versus-lock"><Icon name="lock" size={18} />{locked}</p>}
          <Button variant="primary" size="lg" fullWidth disabled={busy} data-testid="versus-make"
            onClick={() => { if (locked) { setMsg(locked); return; } setIntent('host'); setStep('range'); }}>
            <Icon name="home" size={30} />へやを つくる（きごうを おしえる）
          </Button>
          <Panel>
            <SectionTitle tone="action">となりの 子の きごう（4けた）で はいる</SectionTitle>
            <div className="flex gap-2 mt-3">
              <input value={code} onChange={(e) => setCode(normalizeRoomCode(e.target.value))} inputMode="numeric" maxLength={4} placeholder="0000" data-testid="room-code-input" aria-label="へやの きごう（4けた）"
                className="flex-1 min-w-0 min-h-[56px] rounded-cw-md px-3 text-center font-cw-num font-black text-cw-28"
                style={{ letterSpacing: '0.3em', paddingLeft: '0.6em', background: 'var(--cw-surface-strong)', color: 'var(--cw-fg)', boxShadow: 'inset 0 0 0 1px var(--cw-line-strong)', border: 0 }} />
              <Button variant="secondary" size="lg" disabled={busy || code.length !== 4} data-testid="versus-enter"
                onClick={() => { if (locked) { setMsg(locked); return; } void enterRoom(); }}>はいる</Button>
            </div>
          </Panel>
        </>
      ) : (
        <Notice tone="action" icon="bulb" data-testid="versus-unnamed-note">
          おためしでは コンピュータが あいての「れんしゅう試合」で あそべるよ（なにも おくられない）。がっきゅうコードを 入れると、同じ学級の 子と たいせんできる。
        </Notice>
      )}

      <Panel>
        <SectionTitle tone="growth" right={named ? 'スタミナを 1回ぶん つかうよ' : undefined}>コンピュータと れんしゅう</SectionTitle>
        <Segmented<BotLevel> className="mt-3" label="コンピュータの つよさ" value={level} onChange={setLevel}
          options={(Object.keys(BOT_LEVELS) as BotLevel[]).map((l) => ({ value: l, label: BOT_LEVELS[l].label, tone: 'growth' as const, attrs: { 'data-testid': `bot-${l}` } }))} />
        <p className="text-cw-14 mt-2 leading-snug" style={{ color: 'var(--cw-fg-2)' }}>{BOT_LEVELS[level].blurb}</p>
        <Button variant="success" size="lg" fullWidth className="mt-3" disabled={busy} data-testid="versus-practice"
          onClick={() => { if (locked) { setMsg(locked); return; } setIntent('practice'); setStep('range'); }}>
          れんしゅう試合を はじめる
        </Button>
      </Panel>
      {named && <SortieStamina formation={form} message={null} />}
      {msg && <Notice tone="reward" icon="warn" role="status" data-testid="versus-msg"><span className="font-bold" style={{ color: 'var(--cw-reward)' }}>{msg}</span></Notice>}
    </VsShell>
  );
};

/** あそびかたの 3つ（メニューの ならび・くわしい 説明） */
const HOW: { key: string; label: string; tone: 'growth' | 'action' | 'opp'; icon: 'bulb' | 'cats' | 'versus'; text: string }[] = [
  { key: 'solve', label: 'とく', tone: 'growth', icon: 'bulb', text: '2人に 同じ しゅるいの もんだい 3まい。まちがえずに とけた ぶんだけ ⚡。（はやさは かんけいなし）' },
  { key: 'place', label: 'おく', tone: 'action', icon: 'cats', text: 'ためた ⚡ で ネコを じぶんの じんちに おく。おわるまで あいてには 見えないよ。' },
  { key: 'watch', label: 'みる', tone: 'opp', icon: 'versus', text: '2人の おきかたで たたかう。ひだりと みぎを いれかえて 2回。' },
];

/** 対戦の 画面の 枠：背景・上の帯・中身（1まいの 縦の 列） */
const VsShell: React.FC<{ title: React.ReactNode; onBack: () => void; testid: string; children: React.ReactNode }> = ({ title, onBack, testid, children }) => (
  <div className="cw-screen min-h-[100dvh] h-[100dvh] flex flex-col" data-testid={testid}>
    <ScreenBackdrop name="versus" />
    <TitleBar title={title} onBack={onBack} data-testid="versus-topbar" />
    <div className="flex-1 overflow-y-auto cw-scroll px-4 py-3">
      <div className="max-w-xl w-full mx-auto space-y-3 pb-4 cw-enter">{children}</div>
    </div>
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
    <Panel data-testid="versus-formation">
      <SectionTitle tone="cat" right={<span className="font-cw-num">{form.length}/5</span>}>つれていく ネコ（5まで）</SectionTitle>
      <p className="text-cw-12 mt-1" style={{ color: 'var(--cw-fg-3)' }}>レベルは みんな Lv{VERSUS_LEVEL}</p>
      <div className="grid grid-cols-2 gap-2 mt-2">
        {usable.map((id) => {
          const on = form.includes(id);
          return (
            <button key={id} type="button" onClick={() => toggle(id)} aria-pressed={on} data-testid={`pick-${id}`}
              className={`cw-seg cw-press cw-tone-action min-h-[56px] px-2 flex items-center gap-2 text-left ${on ? 'is-on' : ''}`}
              style={{ opacity: disabled ? 0.6 : 1 }}>
              <img src={spriteOf(id)} alt="" className="w-10 h-10 object-contain flex-shrink-0" draggable={false} />
              <span className="min-w-0 flex-1">
                <span className="block text-cw-14 font-extrabold truncate" style={{ color: on ? 'var(--cw-fg)' : 'var(--cw-fg-2)' }}>{CHARACTER_BY_ID[id]?.displayName}</span>
                <span className="flex items-center gap-0.5 text-cw-12 font-cw-num font-bold" style={{ color: 'var(--cw-reward)' }}><Icon name="energy" size={14} />{troopCost(id)}</span>
              </span>
              {on && <Icon name="check" size={20} />}
            </button>
          );
        })}
      </div>
    </Panel>
  );
};

// ── 対戦中の 画面 ─────────────────────────────────────────────────
const PHASE_LABEL: Record<Phase, string> = { lobby: 'じゅんび', solve: 'とく', place: 'おく', watch: 'みる', check: 'くらべる', done: 'けっか' };
/** 「とく → おく → みる」の ならび（くらべるは みるの つづき） */
const STEP_OF: Partial<Record<Phase, number>> = { solve: 0, place: 1, watch: 2, check: 2 };

const PhaseSteps: React.FC<{ phase: Phase }> = ({ phase }) => {
  const cur = STEP_OF[phase];
  if (cur === undefined) return null;
  return (
    <div className="flex items-center justify-center gap-1.5 px-4 py-2 flex-shrink-0 relative z-10" aria-label="いまの だんかい" data-testid="phase-steps">
      {HOW.map((h, i) => (
        <React.Fragment key={h.key}>
          {i > 0 && <Icon name="chevron" size={16} style={{ transform: 'rotate(-90deg)', opacity: 0.6 }} />}
          <span className={`cw-chip cw-tone-${h.tone} min-h-[32px] text-cw-14`} aria-current={i === cur ? 'step' : undefined}
            style={i === cur ? { fontSize: 14, boxShadow: 'var(--tone-lit)', background: 'var(--tone-bg)' } : { fontSize: 14, color: 'var(--cw-fg-3)', background: 'var(--cw-surface)' }}>
            {i < cur ? <Icon name="check" size={16} /> : <Icon name={h.icon} size={20} />}{h.label}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
};

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
    <div className="cw-screen min-h-[100dvh] h-[100dvh] flex flex-col overflow-hidden" data-testid="versus-play" data-phase={m.phase} data-round={m.round}>
      <ScreenBackdrop name="versus" />
      <TitleBar
        onBack={() => (m.phase === 'done' ? onExit() : setAskLeave(true))} backLabel="やめる" backTestId="versus-leave"
        title={<span data-testid="phase-chip">{m.phase === 'done' || m.phase === 'lobby' ? PHASE_LABEL[m.phase] : `ラウンド ${m.round + 1}/${VERSUS_ROUNDS}・${PHASE_LABEL[m.phase]}`}</span>}
        subtitle={<>あいて：<b style={{ color: 'var(--cw-opp)' }}>{session.oppLabel}</b></>}
        right={<><StatPill icon="energy" value={m.localEnergy()} label="エナジー" data-testid="energy" /><TimeLeft match={m} /></>}
      />
      <PhaseSteps phase={m.phase} />

      <div className="flex-1 overflow-y-auto cw-scroll">
        {m.phase === 'lobby' && <div className="p-6 text-center text-cw-16" style={{ color: 'var(--cw-fg-2)' }} data-testid="play-wait">あいての じゅんびを まっているよ…</div>}
        {m.phase === 'solve' && pack && <SolvePanel match={m} pack={pack} onCard={onCard} />}
        {m.phase === 'solve' && !pack && <div className="p-6 text-center text-cw-16" style={{ color: 'var(--cw-fg-2)' }}>よみこみ中…</div>}
        {m.phase === 'place' && <PlacePanel match={m} oppLabel={session.oppLabel} />}
        {m.phase === 'watch' && <WatchPanel key={`${m.round}-${m.half}`} match={m} />}
        {m.phase === 'check' && <div className="p-6 text-center text-cw-16" style={{ color: 'var(--cw-fg-2)' }} data-testid="play-check">けっかを くらべているよ…</div>}
        {m.phase === 'done' && <EndPanel match={m} stats={stats} oppLabel={session.oppLabel} onExit={onExit} onAgain={onAgain} />}
      </div>

      {askLeave && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center p-4" style={{ background: 'rgba(6,10,28,0.78)' }} data-testid="leave-confirm">
          <Panel strong className="cw-enter w-full max-w-sm text-center">
            <p className="text-cw-20 font-extrabold mb-1" style={{ color: 'var(--cw-fg)' }}>たいせんを やめる？</p>
            <p className="text-cw-14 mb-4 leading-snug" style={{ color: 'var(--cw-fg-2)' }}>{session.kind === 'room' ? 'あいてには「でた」と つたわるよ。使った スタミナは もどらないよ。' : '使った スタミナは もどらないよ。'}</p>
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={() => setAskLeave(false)} data-testid="leave-no">つづける</Button>
              <Button variant="danger" className="flex-1" onClick={onExit} data-testid="leave-yes">やめる</Button>
            </div>
          </Panel>
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
  return <Chip className="min-h-[36px] font-cw-num text-cw-14" data-testid="time-left"><span style={{ color: 'var(--cw-fg-2)' }}>のこり</span> {Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</Chip>;
};

// ── とく ─────────────────────────────────────────────────────────
const DIFF_TONE = (d: number) => (d <= 2 ? 'growth' : d === 3 ? 'action' : 'rare') as 'growth' | 'action' | 'rare';

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
    <div className="max-w-2xl w-full mx-auto p-4 space-y-3 cw-enter" data-testid="solve-panel">
      <Notice tone="growth" icon="bulb">
        <b style={{ color: 'var(--cw-growth)' }}>まちがえずに とけた</b> ぶんだけ ⚡ が もらえるよ。まちがえても ばつは ないよ。
      </Notice>
      <Disclosure title="くわしく" icon="bulb">
        <p className="text-cw-14 leading-relaxed" style={{ color: 'var(--cw-fg-2)' }}>
          ヒントで さいごまで とけるよ（まちがえた カードの ⚡ は なし）。<b style={{ color: 'var(--cw-fg)' }}>はやく とけても トクは しないよ</b>（おくのは 2人が そろってから）。
        </p>
      </Disclosure>
      <div className="grid gap-2">
        {hand.map((c, i) => {
          const st = state[keyOf(i)];
          const it = itemOf(c);
          const tone = st === 'ok' ? 'growth' : st === 'ng' ? 'reward' : DIFF_TONE(c.difficulty);
          return (
            <Card key={i} tone={tone} data-testid={`card-${i}`} data-state={st ?? 'new'} onClick={() => openCard(i)} locked={!!st || finished}
              icon={st === 'ok' ? <Icon name="check" size={34} /> : <Icon name={c.difficulty <= 2 ? 'bulb' : c.difficulty === 3 ? 'target' : 'crown'} size={34} />}
              title={<span className="flex items-center gap-2 flex-wrap"><Chip tone={DIFF_TONE(c.difficulty)}>{cardLabel(c.difficulty)}</Chip>{it?.label ?? c.skillId}</span>}
              sub={<>{UNIT_NAME_BY_KEY[c.unitKey] ?? ''}{st === 'ng' ? '　ざんねん（⚡は なし）' : ''}</>}
              right={<span className="flex items-center gap-1 font-cw-num font-bold text-cw-16" style={{ color: 'var(--cw-reward)' }}><Icon name="energy" size={22} />+{cardReward(c.difficulty, rewardWeight)}</span>} />
          );
        })}
      </div>
      {finished ? (
        <p className="text-center text-cw-16 py-3" style={{ color: 'var(--cw-fg-2)' }} data-testid="solve-waiting">
          {match.remoteDoneSolving() ? 'つぎは おく じかん…' : 'あいてが とくのを まっているよ（ゆっくり まっててね）'}
        </p>
      ) : (
        <Button variant="primary" size="lg" fullWidth onClick={() => match.finishSolving()} data-testid="solve-finish">
          {done >= hand.length ? 'おく へ すすむ →' : 'ここまでで おく へ すすむ →'}
        </Button>
      )}
      {!finished && match.remoteDoneSolving() && <p className="text-center text-cw-14" style={{ color: 'var(--cw-growth)' }} data-testid="opp-solved">あいては もう おわったよ。ゆっくりで いいよ。</p>}

      {open !== null && item && (
        <div className="fixed inset-0 z-[140] flex flex-col" style={{ background: 'rgba(6,10,28,0.62)' }} data-testid="solve-modal">
          <div className="flex items-center gap-3 px-4 py-2 flex-wrap relative z-10" style={{ background: 'var(--cw-surface-strong)', boxShadow: 'inset 0 -1px 0 var(--cw-line)' }}>
            <span className="flex items-center gap-1.5 text-cw-14 font-extrabold" style={{ color: 'var(--cw-reward)' }}><Icon name="energy" size={24} />エナジーチャージ</span>
            <Chip tone="action">{item.label}</Chip>
            <Chip tone="reward" className="font-cw-num">+{cardReward(hand[open].difficulty, rewardWeight)}</Chip>
            <Button variant="secondary" size="sm" className="ml-auto" onClick={() => { setOpen(null); }} data-testid="solve-close">
              {result === null ? 'やめて もどる' : 'もどる'}
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col items-center">
            <div className="w-full max-w-2xl">
              {result === 'perfect' && (
                <Panel strong pad={false} className="cw-tone-growth mb-2 py-2 px-3 flex items-center justify-center gap-2 text-cw-16 font-extrabold" style={{ color: 'var(--cw-growth)', boxShadow: 'var(--cw-shadow-panel), var(--cw-lit-growth)' }}>
                  <Icon name="check" size={26} />せいかい！ <span className="font-cw-num">+{cardReward(hand[open].difficulty, rewardWeight)}</span><Icon name="energy" size={22} />
                </Panel>
              )}
              {result === 'missed' && (
                <Notice tone="reward" icon="bulb" className="mb-2">
                  {solved ? 'さいごまで とけたね。つぎの カードで ⚡ を とろう！' : 'ヒントを見て、さいごまで といてみよう（この カードの ⚡ は なし）'}
                </Notice>
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
                <Button variant="success" size="lg" fullWidth className="mt-3" onClick={() => setOpen(null)} data-testid="solve-back">もどる →</Button>
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
  const cell = useCellSize(290);
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
    <div className="p-3 flex flex-col lg:flex-row gap-3 items-center lg:items-start justify-center cw-enter" data-testid="place-panel">
      <div>
        <Board map={map} cell={cell} mirror={false} placement={draft} zone onCell={tap} />
        <p className="text-cw-12 mt-1.5 flex items-center gap-1.5" style={{ color: 'var(--cw-fg-3)' }}>
          <span aria-hidden className="inline-block w-3 h-3 rounded-sm" style={{ background: mix(MINE, 35), boxShadow: `inset 0 0 0 1px ${MINE}` }} />
          水色の ますを おすと ネコを おくよ（もういちど おすと けす）。右がわが あいての コア。
        </p>
      </div>
      <div className="w-full lg:w-[270px] space-y-2.5">
        <Panel pad={false} className="p-3">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-cw-14 font-bold" style={{ color: 'var(--cw-fg-2)' }}><Icon name="energy" size={24} />のこりの エナジー</span>
            <span className="font-cw-num font-black text-cw-28 leading-none" style={{ color: 'var(--cw-reward)' }} data-testid="energy-left">{left}</span>
          </div>
          <div className="text-cw-12 mt-1" style={{ color: 'var(--cw-fg-3)' }}>おいた ネコ {draft.length}/{MAX_PLACED}・同じ ネコは {MAX_PER_FAMILY}ひきまで</div>
          {energy === 0 && <p className="text-cw-14 mt-1.5 leading-snug" style={{ color: 'var(--cw-reward)' }} data-testid="no-energy">⚡ が 0 だよ。もんだいを とくと ネコが おけるよ（つぎの ラウンドで がんばろう）。</p>}
        </Panel>
        <div className="grid grid-cols-1 gap-1.5">
          {match.formation.map((id) => {
            const c = troopCost(id);
            const can = c <= left && count(id) < MAX_PER_FAMILY;
            return (
              <button key={id} type="button" onClick={() => setSel(id)} disabled={done} data-testid={`unit-${id}`} aria-pressed={sel === id}
                className={`cw-seg cw-press cw-tone-action min-h-[52px] px-2 flex items-center gap-2 text-left ${sel === id ? 'is-on' : ''}`}
                style={{ opacity: done || can || sel === id ? 1 : 0.6 }}>
                <img src={spriteOf(id)} alt="" className="w-9 h-9 object-contain flex-shrink-0" draggable={false} />
                <span className="flex-1 min-w-0 text-cw-14 font-extrabold truncate" style={{ color: 'var(--cw-fg)' }}>{CHARACTER_BY_ID[id]?.displayName}</span>
                <span className="flex items-center gap-0.5 font-cw-num font-bold text-cw-14" style={{ color: 'var(--cw-reward)' }}><Icon name="energy" size={16} />{c}</span>
                <span className="font-cw-num text-cw-14 w-8 text-right" style={{ color: 'var(--cw-fg-2)' }}>×{count(id)}</span>
              </button>
            );
          })}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="md" className="flex-1" onClick={auto} disabled={done} data-testid="place-auto">おまかせ</Button>
          <Button variant="ghost" size="md" className="flex-1" onClick={() => match.setDraft([])} disabled={done} data-testid="place-clear">ぜんぶ けす</Button>
        </div>
        <Button variant="primary" size="lg" fullWidth onClick={() => match.submit()} disabled={done} data-testid="place-done">
          {done ? 'できた！ あいてを まっているよ…' : 'できた！'}
        </Button>
        <p className="text-cw-14 leading-snug" style={{ color: 'var(--cw-fg-2)' }} data-testid="opp-place">
          <span style={{ color: 'var(--cw-opp)' }} className="font-bold">{oppLabel}</span>：{match.remoteDonePlacing() ? 'おきおわったよ' : 'おいているよ…'}
          {match.remoteDonePlacing() && <Icon name="check" size={18} className="inline-block align-[-4px] ml-1" />}
        </p>
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

  /** スキップ：さいごまで 一気に 計算（ゆっくり 見ても 同じ けっか） */
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

  if (!setup) return <div className="p-6 text-center text-cw-16" style={{ color: 'var(--cw-fg-2)' }}>じゅんび中…</div>;
  return (
    <div className="p-3 flex flex-col items-center gap-2.5 cw-enter" data-testid="watch-panel">
      <div className="flex items-center gap-2 flex-wrap justify-center">
        <Chip tone="opp" className="min-h-[36px] text-cw-14" data-testid="half-chip">
          {match.half === 0 ? 'ぜんはん' : 'こうはん'}：{match.half === 0 ? '' : 'ひだりと みぎを いれかえて もういちど！ '}あと <span className="font-cw-num">{secs}</span>びょう
        </Chip>
        <div className="flex gap-1.5">
          {[1, 3].map((s) => (
            <Button key={s} variant={speed === s ? 'primary' : 'secondary'} size="sm" onClick={() => setSpeed(s)} data-testid={`speed-${s}`} className="font-cw-num">×{s}</Button>
          ))}
          <Button variant="secondary" size="sm" onClick={skip} disabled={reported.current} data-testid="watch-skip">スキップ</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 w-full" style={{ maxWidth: GRID_W * cell }}>
        <div>
          <div className="flex justify-between items-baseline text-cw-14 font-bold"><span style={{ color: 'var(--cw-action)' }}>きみの コア</span><span className="font-cw-num">{pct(myLeft)}</span></div>
          <ProgressBar value={myLeft} tone="action" label="きみの コア" />
        </div>
        <div>
          <div className="flex justify-between items-baseline text-cw-14 font-bold"><span style={{ color: 'var(--cw-opp)' }}>あいての コア</span><span className="font-cw-num">{pct(oppLeft)}</span></div>
          <ProgressBar value={oppLeft} tone="opp" label="あいての コア" />
        </div>
      </div>
      <Board map={map} cell={cell} mirror={mirror} entities={ents} localPl={localPl} />
      {finished && <p className="text-cw-16 font-bold" style={{ color: 'var(--cw-fg)' }} data-testid="half-done">{runner?.state.result ? 'コアが おちた！' : 'じかんぎれ！'}</p>}
    </div>
  );
};

// ── ラウンドの けっか ─────────────────────────────────────────────
const RoundResultOverlay: React.FC<{ match: VersusMatch; round: number; side: Side; oppSide: Side; onNext: () => void }> = ({ match, round, side, oppSide, onNext }) => {
  const r = match.results[round];
  if (!r) return null;
  const mine = r.score[side], theirs = r.score[oppSide];
  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4" style={{ background: 'rgba(6,10,28,0.78)' }} data-testid="round-result">
      <Panel strong className="cw-enter w-full max-w-md cw-tone-opp">
        <h3 className="text-center text-cw-20 font-extrabold mb-3 font-cw-num" style={{ color: 'var(--cw-fg)' }}>ラウンド {round + 1} の けっか</h3>
        <ScoreBar label="きみが あいての コアを けずった" v={mine} tone="action" />
        <ScoreBar label="あいてが きみの コアを けずった" v={theirs} tone="opp" />
        <div className="mt-2 text-cw-12 leading-relaxed" style={{ color: 'var(--cw-fg-2)' }}>
          {[0, 1].map((h) => `${h === 0 ? 'ぜんはん' : 'こうはん'}：きみ ${pct(r.halves[h][side])}・あいて ${pct(r.halves[h][oppSide])}`).join('　／　')}
        </div>
        <p className="text-cw-12 mt-1" style={{ color: 'var(--cw-fg-3)' }}>ひだりと みぎを いれかえた 2回の へいきんだよ。</p>
        <Button variant="success" size="lg" fullWidth className="mt-4" onClick={onNext} data-testid="round-next">つぎへ ▶</Button>
      </Panel>
    </div>
  );
};
const ScoreBar: React.FC<{ label: string; v: number; tone: 'action' | 'opp' }> = ({ label, v, tone }) => (
  <div className="mb-2.5">
    <div className="flex justify-between items-baseline gap-2 text-cw-14 mb-1"><span style={{ color: 'var(--cw-fg-2)' }}>{label}</span><span className="font-cw-num font-bold" style={{ color: tone === 'opp' ? 'var(--cw-opp)' : 'var(--cw-action)' }}>{pct(v)}</span></div>
    <ProgressBar value={Math.min(1, v)} tone={tone} label={label} />
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
    win: { big: 'きみの かち！', sub: 'よく かんがえて おけたね。', tone: 'growth', icon: 'crown' },
    lose: { big: 'こんかいは ざんねん', sub: 'でも ぜんぶ まなびに なったよ。もういちど やってみよう！', tone: 'action', icon: 'cats' },
    draw: { big: 'ひきわけ！', sub: 'いい しょうぶだったね。', tone: 'reward', icon: 'medal' },
  } as const;
  const info = result ? TEXT[result] : null;
  const reason: Record<string, string> = {
    left: `${oppLabel}が いなくなったよ。（かち・まけは つけないよ）`,
    desync: 'けいさんが ずれたので ひきわけに したよ。もういちど あそんでみてね。',
    version: 'ページの バージョンが ちがうみたい。ページを よみこみなおして、もういちど ためしてね。',
    cancel: 'たいせんを おわったよ。',
  };
  const totals = match.totals;
  const tone = info?.tone ?? 'neutral';
  return (
    <div className="max-w-md w-full mx-auto p-4 space-y-3 cw-enter" data-testid="end-panel" data-result={result ?? end?.kind}>
      <Panel strong className={`cw-tone-${tone} text-center ${result === 'win' ? 'cw-reward-pop' : ''}`} style={{ boxShadow: 'var(--cw-shadow-panel), var(--tone-lit)' }}>
        <div className="flex justify-center"><Icon name={info?.icon ?? 'check'} size={64} /></div>
        <div className="font-extrabold text-cw-28 mt-1" style={{ color: 'var(--tone)' }} data-testid="end-big">{info ? info.big : (end?.kind === 'desync' ? 'ひきわけ' : 'おしまい')}</div>
        <div className="text-cw-14 mt-1" style={{ color: 'var(--cw-fg-2)' }}>{info ? info.sub : reason[end?.kind ?? 'cancel']}</div>
        {end?.kind === 'desync' && <div className="text-cw-12 mt-1" style={{ color: 'var(--cw-fg-3)' }}>{reason.desync}</div>}
      </Panel>
      {end?.kind === 'finished' && (
        <Panel>
          <SectionTitle tone="opp">3ラウンドの あわせて</SectionTitle>
          <p className="text-cw-12 mb-2 mt-1" style={{ color: 'var(--cw-fg-3)' }}>あいての コアを けずった わりあい</p>
          <ScoreBar label="きみ" v={totals[me] / VERSUS_ROUNDS} tone="action" />
          <ScoreBar label={oppLabel} v={totals[otherSide(me)] / VERSUS_ROUNDS} tone="opp" />
        </Panel>
      )}
      <Panel className="cw-tone-reward" data-testid="end-rewards">
        <div className="flex items-center gap-2 text-cw-14" style={{ color: 'var(--cw-fg)' }}>
          <Icon name="credit" size={28} />まちがえずに とけた もんだい：<b className="font-cw-num" style={{ color: 'var(--cw-reward)' }}>{stats.perfect}</b> もん（+{stats.credits}）
        </div>
        <div className="text-cw-12 mt-1" style={{ color: 'var(--cw-fg-3)' }}>ごほうびは といた もんだいの ぶんだけ。かった・まけたでは ふえも へりも しないよ。</div>
      </Panel>
      <div className="flex gap-2">
        <Button variant="primary" size="lg" className="flex-1" onClick={onAgain} data-testid="end-again">もういちど</Button>
        <Button variant="secondary" size="lg" className="flex-1" onClick={onExit} data-testid="end-home">ホームへ</Button>
      </div>
    </div>
  );
};

// 開発のときだけ：画面の確かめ（Playwright）。本番のビルドには入らない（portal/versusDevMock.ts）
if (import.meta.env?.DEV && typeof window !== 'undefined') {
  void import('../../portal/versusDevMock');
}
