import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { GameState, Troop, BuildingType, BattleEntity, GRID_W, GRID_H } from '../../types';
import { BUILDING_STATS } from '../../constants';
import { Button } from '../ui/Button';
import { Swords, Trophy, Skull, Zap, Heart } from '../ui/Icons';
import { TerrainLayer } from './TerrainLayer';
// ── 決定論シミュレーション（catwars/sim/）──
// ゲーム状態はすべてこちらが持つ。このコンポーネントは描画と入力だけを担当する。
import { SimRunner, LocalCommandProvider } from '../../sim/runner';
import { canDeployAt, isBlockedCell, SimInit } from '../../sim/simulate';
import { buildSimConfig } from '../../sim/setup';
import { stateChecksum } from '../../sim/checksum';
import { SimCommand, SimEvent, SimConfig, PlayerId, TICK_MS } from '../../sim/types';
import type { LockstepSession, LockstepStatus } from '../../net/lockstep';
import { InBattleQuiz } from './InBattleQuiz';
import { grantStudyReward } from '../../bridge';
import { sfx } from '../../utils/audioEngine';
import { useProgressStore, BUFF_LEVEL_INFO } from '../../store/useProgressStore';
import { useArmyStore } from '../../store/useArmyStore';
import { CHARACTERS, CHARACTER_BY_ID, STAGE_MULT, getCharacterSprite, spriteFamilyForSubType, stageForLevel } from '../../data/characters';
import { PinchZoomLayer } from './PinchZoomLayer';
import {
  CampaignChapter, ChapterDifficulty, ENEMY_UNIT_STATS, ENEMY_UNIT_COST, ASSIST_LEVELS,
  EnemyUnitKind, pickWeightedEnemyUnit, enemySpawnRate,
  ENEMY_SPAWN_BUILDINGS, ENEMY_PRODUCTION_RATE, BARRACKS_ONLY_UNITS,
} from '../../data/campaign';
import { collectWallCells, hasLineOfSight, isFlying, pickDefenseTarget } from '../../utils/combatRules';
import {
  ALIEN_STATS, LAVA_DPS, MeteorState, collectLavaCells, isOnLava,
  makeAlienEntity, makeTitanEntity, stepTitan,
} from '../../utils/stageHazards';

const IN_BATTLE_BUILD_COSTS: Partial<Record<BuildingType, number>> = {
  [BuildingType.WALL]: 40,
  [BuildingType.CANNON]: 120,
  [BuildingType.ARMY_CAMP]: 80,
};
const IN_BATTLE_BUILD_OPTIONS: BuildingType[] = [BuildingType.WALL, BuildingType.CANNON, BuildingType.ARMY_CAMP];

// 兵士subType + 進化段階 → スプライトURL（図鑑系統にマップ）
const troopSpriteUrl = (subType: string, stage: 1 | 2 | 3 = 1): string | null => {
  const fam = spriteFamilyForSubType(subType);
  return fam ? getCharacterSprite(fam, stage) : null;
};

// Humanoid high-contrast stick figure SVG renderer with micro limb-swinging animations
const renderStickFigure = (subType: string, isMoving: boolean, lastAttack: number) => {
  const now = Date.now();
  const isAttacking = now - lastAttack < 400;
  
  let headColor = "#fcd34d"; // barb blonde
  let skinColor = "#fbcfe8"; // skin node
  let strokeColor = "#ffffff"; 
  let clothesColor = "#dc2626"; // Crimson
  let strokeWidth = "2.2";
  let bodyWidth = "2.8";

  // Customize based on role cards
  if (subType === 'archer') {
    headColor = "#ec4899"; // pink archer hair
    clothesColor = "#059669"; // green outfit
    strokeWidth = "2.0";
  } else if (subType === 'giant') {
    headColor = "#f97316"; // orange hair/beard
    clothesColor = "#7c2d12"; // brown leather vest
    strokeWidth = "3.5"; // extra thick outline for giant
    bodyWidth = "4.5";
  } else if (subType === 'skeleton') {
    headColor = "#cbd5e1"; // skull slate
    clothesColor = "#1e3a8a"; // deep blue military vest
    strokeWidth = "1.8";
    strokeColor = "#94a3b8"; // bone color
    bodyWidth = "2.0";
  }

  const legLClass = isMoving ? "anim-leg-L" : "";
  const legRClass = isMoving ? "anim-leg-R" : "";
  const headClass = isMoving ? "anim-head" : "";
  
  let armRClass = "";
  if (isAttacking) {
    if (subType === 'barbarian') armRClass = "anim-attack-sword";
    else if (subType === 'archer') armRClass = "anim-attack-bow";
    else if (subType === 'skeleton') armRClass = "anim-attack-sword";
    else armRClass = "anim-attack-fist";
  } else if (isMoving) {
    armRClass = "anim-leg-R";
  }

  const armLClass = isMoving ? "anim-leg-L" : "";

  return (
    <svg viewBox="0 0 40 46" className="w-full h-full overflow-visible" style={{ pointerEvents: 'none' }}>
      {/* Torso/Clothes (back bone) */}
      <line 
        x1="20" y1="18" 
        x2="20" y2="30" 
        stroke={clothesColor} 
        strokeWidth={bodyWidth} 
        strokeLinecap="round" 
      />

      {/* Head */}
      <g className={headClass} style={{ transformOrigin: "20px 14px" }}>
        {/* Face circle */}
        <circle 
          cx="20" cy="12" r="5" 
          fill={subType === 'skeleton' ? '#475569' : '#fee2e2'} 
          stroke={strokeColor} 
          strokeWidth="1.2" 
        />
        {/* Hair shape */}
        {subType === 'barbarian' && (
          <path d="M 15 12 A 4 4 0 0 1 25 12" fill={headColor} />
        )}
        {subType === 'archer' && (
          <path d="M 14 14 A 5 5 0 0 1 26 14" fill={headColor} fillOpacity="0.85" />
        )}
        {subType === 'giant' && (
          <path d="M 13 10 A 6 6 0 0 1 27 10" fill={headColor} />
        )}
      </g>

      {/* Left Arm */}
      <line 
         x1="20" y1="18" 
         x2="12" y2="24" 
         stroke={strokeColor} 
         strokeWidth={strokeWidth} 
         strokeLinecap="round"
         className={armLClass}
         style={{ transformOrigin: "20px 18px" }}
      />

      {/* Left Leg */}
      <line 
         x1="20" y1="30" 
         x2="14" y2="42" 
         stroke={strokeColor} 
         strokeWidth={strokeWidth} 
         strokeLinecap="round"
         className={legLClass}
         style={{ transformOrigin: "20px 30px" }}
      />

      {/* Right Leg */}
      <line 
         x1="20" y1="30" 
         x2="26" y2="42" 
         stroke={strokeColor} 
         strokeWidth={strokeWidth} 
         strokeLinecap="round"
         className={legRClass}
         style={{ transformOrigin: "20px 30px" }}
      />

      {/* Right Arm & Weapon Group */}
      <g 
        className={armRClass} 
        style={{ transformOrigin: "20px 18px" }}
      >
        {/* Right Arm */}
        <line 
           x1="20" y1="18" 
           x2="28" y2="24" 
           stroke={strokeColor} 
           strokeWidth={strokeWidth} 
           strokeLinecap="round"
        />

        {/* Custom Weapons representing roles */}
        {(subType === 'barbarian' || subType === 'skeleton') && (
          <g transform="translate(28, 24) rotate(45)">
            <line x1="0" y1="0" x2="0" y2="-12" stroke={subType === 'skeleton' ? '#94a3b8' : '#cbd5e1'} strokeWidth="2.5" strokeLinecap="round" />
            <line x1="-3" y1="-3" x2="3" y2="-3" stroke={subType === 'skeleton' ? '#475569' : '#eab308'} strokeWidth="1.5" />
          </g>
        )}

        {subType === 'archer' && (
          <g transform="translate(28, 24)">
            {/* Bow */}
            <path d="M -2 -6 Q 4 0 -2 6" fill="none" stroke="#d97706" strokeWidth="1.5" strokeLinecap="round" />
            {/* Bow String */}
            <line x1="-2" y1="-6" x2="-2" y2="6" stroke="#94a3b8" strokeWidth="0.8" />
            {/* Arrow */}
            <line x1="-4" y1="0" x2="3" y2="0" stroke="#f472b6" strokeWidth="1" />
          </g>
        )}

        {subType === 'giant' && (
          <circle cx="28" cy="24" r="5" fill="#f59e0b" stroke="#ffffff" strokeWidth="1" />
        )}
      </g>
    </svg>
  );
};

interface Props {
  attackerState: GameState;
  defenderBuildings: { type: BuildingType; x: number; y: number }[];
  playerDeployments?: import('../../types').DeployedBuilding[];
  battleMap?: import('../../types').BattleMap;
  loadout?: import('../../types').BattleLoadout;
  /** 挑戦中の章（ストーリー表示・報酬に使う） */
  chapter: CampaignChapter;
  /** サポートモードを反映ずみの実効難易度 */
  difficulty: ChapterDifficulty;
  /** 0=通常 / 1,2=サポートモード（プレイヤーに明示する） */
  assistLevel?: 0 | 1 | 2;
  /** 出撃前に選んだ出題範囲（戦闘中クイズで使う。空なら「といて⚡」は無効） */
  quizSubtopics?: string[];
  /**
   * PvP対戦の接続。省略すると単体プレイ（PvE）になる。
   * 渡された場合、コマンドは LockstepSession 経由で相手にも送られ、
   * 両者のコマンドが揃うまでシミュレーションは進まない。
   */
  pvp?: {
    session: LockstepSession;
    localPlayer: PlayerId;
    /** 両者で完全に同一でなければならない（マッチ開始時に確定させる） */
    config: SimConfig;
    init: SimInit;
    opponentName: string;
  };
  onEndBattle: (win: boolean, loot: { gold: number }) => void;
}

export const BattleScene: React.FC<Props> = ({
  attackerState,
  defenderBuildings,
  playerDeployments = [],
  battleMap,
  loadout,
  chapter,
  difficulty,
  assistLevel = 0,
  quizSubtopics = [],
  pvp,
  onEndBattle,
}) => {
  /** 自分がどちらのプレイヤーか。PvEでは常に P1 */
  const localPlayer: PlayerId = pvp?.localPlayer ?? 'P1';
  const isPvp = !!pvp;
  // ══════════════════════════════════════════════════════════════════════
  // このコンポーネントは「決定論シミュレーション（catwars/sim/）を駆動して
  // 描画するだけの殻」になっている。ゲーム状態は一切 React state に持たない。
  //
  //   ・状態を変えるのは simulateTick() だけ。UIは SimCommand を積むのみ
  //   ・弾道・ヒットエフェクト・メッセージ・音は SimEvent として受け取る
  //   ・シミュレーションは 20Hz 固定。描画は 60fps のまま
  //
  // こうしてある理由は docs/PVP_LOCKSTEP.md を参照。要点は2つ。
  //   (1) PvP（ロックステップ同期）は「両端末で同じ計算をする」ことが前提で、
  //       React の再描画タイミングに状態遷移がぶら下がっていると成立しない。
  //   (2) 旧実装は requestAnimationFrame ごとに 1 回進めて移動量を
  //       「1フレームあたり」で加算していたため、**120Hz の端末では 60Hz の
  //       端末の2倍の速さでゲームが進んでいた**。固定タイムステップでこれが直る。
  // ══════════════════════════════════════════════════════════════════════

  // ── UIだけの状態（シミュレーションには影響しない）──
  const [selectedTroopId, setSelectedTroopId] = useState<string | null>(null);
  const [selectedSpell, setSelectedSpell] = useState<'HEAL' | 'RAGE' | null>(null);
  const [selectedOrderTroopId, setSelectedOrderTroopId] = useState<string | null>(null);
  const [buildMode, setBuildMode] = useState<BuildingType | null>(null);
  const [briefingOpen, setBriefingOpen] = useState(true);
  const [battlePaused, setBattlePaused] = useState(false);
  const [quizOpen, setQuizOpen] = useState(false);
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null);
  const [damagedEntities, setDamagedEntities] = useState<Set<string>>(new Set());
  const [projectiles, setProjectiles] = useState<{ id: string; fromX: number; fromY: number; toX: number; toY: number; startedAt: number; duration: number; type: 'CANNON' | 'TESLA' }[]>([]);
  const [hitFx, setHitFx] = useState<{ id: string; x: number; y: number; fromX: number; fromY: number; kind: 'SLASH' | 'BOLT' | 'SHOCK'; color: string; startedAt: number; duration: number }[]>([]);
  const [levelUps, setLevelUps] = useState<import('../../store/useArmyStore').LevelUpEvent[]>([]);
  const [, forceRender] = useState(0);

  const { getTodayBuffs, unlockCharacterToday, permanentUnlocks, unlockedToday, unlockedTodayDate } = useProgressStore();
  const { getStage, grantBattleXp } = useArmyStore();
  const activeBuffs = getTodayBuffs();
  const hasBuff = (t: string) => activeBuffs.some(b => b.type === t);
  const buffLvl = (t: string): 0 | 1 | 2 | 3 => {
    const b = activeBuffs.find(b => b.type === t);
    if (!b) return 0;
    return ((b as { level?: number }).level ?? 2) as 0 | 1 | 2 | 3;
  };
  const buffVal = (t: string): number => {
    const lv = buffLvl(t);
    if (lv === 0) return 0;
    const info = (BUFF_LEVEL_INFO as Record<string, { values: number[] }>)[t];
    return info ? info.values[lv - 1] : 0;
  };

  // ── シミュレーションの初期化（1回だけ）──
  //
  // ★重要★ 進化段階・デイリーバフは端末ごとに違うので、ここで**すべて解決して
  // SimConfig に焼き込む**。シミュレーションの途中でストアを参照してはいけない
  // （相手の端末には無い情報なので、参照した瞬間にデシンクする）。
  const runnerRef = useRef<SimRunner | null>(null);
  const providerRef = useRef(new LocalCommandProvider());
  if (runnerRef.current === null && pvp) {
    // PvP: 設定と初期配置はマッチ開始時にサーバー経由で確定ずみのものを使う。
    // ここでローカルのストアを読んではいけない（相手と食い違う）。
    runnerRef.current = new SimRunner(pvp.config, pvp.init);
  }
  if (runnerRef.current === null) {
    const values: Record<string, number> = {};
    for (const b of activeBuffs) {
      const info = (BUFF_LEVEL_INFO as Record<string, { values: number[] }>)[b.type];
      const lv = ((b as { level?: number }).level ?? 2) as 1 | 2 | 3;
      if (info) values[b.type] = info.values[lv - 1];
    }
    const stages: Record<string, 1 | 2 | 3> = {};
    for (const c of CHARACTERS) stages[c.id] = getStage(c.id);

    const cfg = buildSimConfig({
      mode: 'PVE',
      // ソロプレイなので seed はローカルで決めてよい。
      // PvP ではサーバー（RTDBのserverTimestamp由来）が確定させた値を使う
      // ——クライアントが選べると有利な乱数を引くまで作り直せてしまうため。
      seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0,
      chapter, difficulty, battleMap: battleMap ?? null,
      p1: { stages, buffs: { values } },
    });
    runnerRef.current = new SimRunner(cfg, {
      defenderBuildings: defenderBuildings.map(b => ({ type: b.type, x: b.x, y: b.y })),
      playerBuildings: playerDeployments.map(b => ({ type: b.type, x: b.x, y: b.y })),
      spellCharges: {
        P1: { HEAL: loadout?.healCharges ?? 2, RAGE: loadout?.rageCharges ?? 2 },
        P2: { HEAL: 0, RAGE: 0 },
      },
    });
  }
  const runner = runnerRef.current;
  const simState = runner.state;

  // ── JSX が読む値（すべてシミュレーション状態からの派生）──
  const me = simState.players[localPlayer];
  const entities = simState.entities;
  const gold = me.energy;
  const battleResult: 'WIN' | 'LOSE' | null =
    simState.result === null ? null : simState.result === localPlayer ? 'WIN' : 'LOSE';
  const battleStarted = simState.started;
  const spellCounts = me.spells;
  const tempRank = me.tempRank;

  // 呪文・流星は「残り tick」を実時間に直して描画に渡す（見た目だけの変換）
  const nowMs = Date.now();
  const activeSpells = simState.activeSpells.map(s => ({
    id: s.id, x: s.x, y: s.y, type: s.type,
    endTime: nowMs + (s.endTick - simState.tick) * TICK_MS,
  }));
  const meteorZones = runner.cfg.battleMap?.meteorZones ?? [];
  const meteors = simState.meteors.map(m => ({
    id: m.id,
    zone: meteorZones[m.zoneIndex],
    warnedAt: nowMs + (m.warnedTick - simState.tick) * TICK_MS,
    impactAt: nowMs + (m.impactTick - simState.tick) * TICK_MS,
    resolved: m.resolved,
  })).filter(m => m.zone);

  const availableTroops: Troop[] = useMemo(() => CHARACTERS.map(c => ({
    id: c.id, name: c.forms[0].name, count: 1,
    damage: c.base.damage, hp: c.base.hp, target: c.base.target, moveSpeed: c.base.moveSpeed,
  })), []);

  const showMessage = (text: string, ms = 2000) => {
    setTriggerMessage(text);
    window.setTimeout(() => setTriggerMessage(null), ms);
  };

  // ── SimEvent を見た目に変換する ──
  const applyEvents = useCallback((events: SimEvent[]) => {
    if (events.length === 0) return;
    const damaged = new Set<string>();
    const newProj: typeof projectiles = [];
    const newFx: typeof hitFx = [];
    const playedSfx = new Set<string>();   // 同じ音を1フレームに何度も鳴らさない
    let message: { text: string; ms: number } | null = null;
    const now = Date.now();
    let seq = 0;

    for (const e of events) {
      switch (e.type) {
        case 'PROJECTILE':
          newProj.push({
            id: `p-${now}-${seq++}`,
            fromX: e.fromX, fromY: e.fromY, toX: e.toX, toY: e.toY,
            startedAt: now, duration: e.kind === 'TESLA' ? 220 : 500, type: e.kind,
          });
          break;
        case 'HIT':
          newFx.push({
            id: `f-${now}-${seq++}`,
            x: e.x, y: e.y, fromX: e.fromX, fromY: e.fromY,
            kind: e.kind, color: e.color,
            startedAt: now, duration: e.kind === 'BOLT' ? 260 : 360,
          });
          break;
        case 'DAMAGED': damaged.add(e.entityId); break;
        case 'MESSAGE': message = { text: e.text, ms: e.durationMs }; break;
        case 'SFX':
          if (!playedSfx.has(e.name)) {
            playedSfx.add(e.name);
            (sfx as unknown as Record<string, () => void>)[e.name]?.();
          }
          break;
        case 'RESULT': break;   // 勝敗は simState.result を直接見る
      }
    }

    if (newProj.length > 0) setProjectiles(prev => [...prev, ...newProj].slice(-60));
    if (newFx.length > 0) setHitFx(prev => [...prev, ...newFx].slice(-40));
    setDamagedEntities(damaged);
    if (message) showMessage(message.text, message.ms);
  }, []);

  // ── メインループ（固定タイムステップ）──
  const pvpRef = useRef(pvp);
  pvpRef.current = pvp;
  const netStatusRef = useRef<LockstepStatus>({ kind: 'RUNNING' });
  const pausedRef = useRef(false);
  // PvPでは自分だけ止めるわけにいかない（相手を待たせてしまう）ので、
  // ブリーフィング中でもシミュレーションは進める
  pausedRef.current = isPvp ? false : (battlePaused || briefingOpen);
  const rafRef = useRef<number | undefined>(undefined);
  const lastRealRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const frame = () => {
      if (cancelled) return;
      const now = performance.now();
      const dt = lastRealRef.current === 0 ? 0 : now - lastRealRef.current;
      lastRealRef.current = now;

      const r = runnerRef.current!;
      if (!pausedRef.current && r.state.result === null) {
        const session = pvpRef.current?.session;
        if (session) {
          // 送れるバケットをすべて送る。**コマンドが無い tick でも必ず送る**
          // ——これを省くと「まだ届いていない」のか「操作しなかった」のかが
          // 区別できず、相手が永久に待つことになる。
          session.flush(r.tick, () => ({ tick: r.tick, sum: stateChecksum(r.state) }));
        }
        const res = r.advance(dt, session ?? providerRef.current);
        if (res.events.length > 0) applyEvents(res.events);
        if (session) {
          session.recordChecksum(r.tick, stateChecksum(r.state));
          session.prune(r.tick);
          const st = session.status;
          if (st.kind !== netStatusRef.current.kind) {
            netStatusRef.current = st;
            forceRender(n => (n + 1) % 1000000);
          } else {
            netStatusRef.current = st;
          }
        }
        if (res.ticks > 0) forceRender(n => (n + 1) % 1000000);
      }
      // 期限切れの演出を掃除する
      const t = Date.now();
      setProjectiles(prev => (prev.length ? prev.filter(p => t - p.startedAt < p.duration) : prev));
      setHitFx(prev => (prev.length ? prev.filter(f => t - f.startedAt < f.duration) : prev));

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [applyEvents]);

  // ポーズ解除時に、止まっていた分をまとめて進めてしまわないようにする
  useEffect(() => {
    if (!pausedRef.current) lastRealRef.current = 0;
  }, [battlePaused, briefingOpen]);

  // 戦闘終了時：出撃した系統にXPを付与
  const xpGrantedRef = useRef(false);
  useEffect(() => {
    if (!battleResult || xpGrantedRef.current) return;
    xpGrantedRef.current = true;
    const families = simState.players[localPlayer].deployedFamilies;
    if (families.length > 0) {
      const events = grantBattleXp(families, battleResult === 'WIN');
      if (events.length > 0) setLevelUps(events);
    }
  }, [battleResult]);

  // ── 操作 → コマンド ──
  //
  // UIは状態を直接いじらない。必ずコマンドとして積み、simulateTick が処理する。
  // PvP ではこの issue() が LockstepSession.issue() に差し替わり、
  // 入力遅延ぶん未来の tick に予約されたうえで相手にも送られる。
  const issue = useCallback((cmd: SimCommand) => {
    const session = pvpRef.current?.session;
    if (session) {
      // 入力遅延ぶん未来の tick に予約され、同時に相手へも送られる
      session.issue(cmd, runnerRef.current!.tick);
    } else {
      providerRef.current.push(cmd);
    }
  }, []);

  const handleGridClick = (x: number, y: number) => {
    const r = runnerRef.current!;
    if (r.state.result) return;

    if (buildMode !== null) {
      const cost = IN_BATTLE_BUILD_COSTS[buildMode] ?? 999;
      if (Math.floor(gold) < cost) { showMessage('⚡ エナジーがたりない！', 1400); setBuildMode(null); return; }
      if (!canDeployAt(r.state, r.statics, localPlayer, x, y)) {
        showMessage('⛔ ここには建設できない！お城の近くに置こう', 1600); setBuildMode(null); return;
      }
      issue({ type: 'BUILD', player: localPlayer, building: buildMode, x, y });
      setBuildMode(null);
      return;
    }

    if (selectedSpell) {
      if (spellCounts[selectedSpell] <= 0) return;
      issue({ type: 'CAST_SPELL', player: localPlayer, spell: selectedSpell, x, y });
      setSelectedSpell(null);
      return;
    }

    if (selectedOrderTroopId) {
      if (isBlockedCell(r.state, r.statics, x, y)) return;
      issue({ type: 'MOVE_TO', player: localPlayer, entityId: selectedOrderTroopId, x, y });
      setSelectedOrderTroopId(null);
      return;
    }

    // 出撃
    if (!selectedTroopId) return;
    if (isBlockedCell(r.state, r.statics, x, y)) return;
    if (!canDeployAt(r.state, r.statics, localPlayer, x, y)) {
      showMessage('⛔ ここには出せないよ！ お城やキャンプの近くから出そう', 1800);
      return;
    }
    const line = r.cfg.unitStats[localPlayer][selectedTroopId];
    if (line && gold < Math.round(line.cost * r.cfg.costMult[localPlayer])) {
      showMessage('⚡ エナジーがたりない！ 問題を解くか、待ってためよう', 1600);
      return;
    }
    issue({ type: 'DEPLOY', player: localPlayer, troopId: selectedTroopId, x, y });
  };

  /** 出撃クールダウンの残り ms（表示用） */
  const deployCooldownLeftMs = (troopId: string): number => {
    const last = simState.players[localPlayer].deployCd[troopId];
    if (last === undefined) return 0;
    const cdMs = runner.cfg.unitStats[localPlayer][troopId]?.cooldownMs
      ?? runner.cfg.deployCooldownMs[localPlayer];
    const cdTicks = Math.max(1, Math.round(cdMs / TICK_MS));
    const leftTicks = cdTicks - (simState.tick - last);
    return Math.max(0, leftTicks * TICK_MS);
  };

  // Initialize cells
  const cells: { x: number; y: number }[] = [];
  for (let y = 0; y < GRID_H; y++) {
    for (let x = 0; x < GRID_W; x++) {
      cells.push({ x, y });
    }
  }

  const isCharUnlocked = (id: string): boolean => {
    const fam = CHARACTER_BY_ID[id];
    if (fam?.isStarter) return true;
    // 兵舎を建てた日は、その解放ぶんを無料で使える（＝施設を建てる意味がここに出る）
    if (loadout?.unlockedTroopTypes?.includes(id)) return true;
    if (permanentUnlocks.includes(id)) return true;
    // reset unlockedToday if date changed
    const today = new Date().toISOString().slice(0, 10);
    if (unlockedTodayDate !== today) return false;
    return unlockedToday.includes(id);
  };

  const buildingAccentColor: Record<string, string> = {
    TOWN_HALL: 'rgba(250,204,21,0.25)',
    WALL: 'rgba(148,163,184,0.2)',
    CANNON: 'rgba(239,68,68,0.25)',
    ARMY_CAMP: 'rgba(34,197,94,0.2)',
    GOLD_MINE: 'rgba(250,204,21,0.2)',
    HIDDEN_TESLA: 'rgba(34,211,238,0.2)',
  };

  return (
    <div className="relative w-full min-h-[100dvh] h-[100dvh] bg-[#05070f] flex flex-col overflow-hidden">
       {/* High-quality micro-dynamic keyframes style definitions */}
       <style>{`
         @keyframes limb-swing-L {
           0%, 100% { transform: rotate(0deg); }
           50% { transform: rotate(26deg); }
         }
         @keyframes limb-swing-R {
           0%, 100% { transform: rotate(0deg); }
           50% { transform: rotate(-26deg); }
         }
         @keyframes head-bob {
           0%, 100% { transform: translateY(0px); }
           50% { transform: translateY(1.5px); }
         }
         @keyframes weapon-attack {
           0%, 100% { transform: rotate(0deg) translateY(0); }
           50% { transform: rotate(-45deg) translateY(-2px); }
         }
         @keyframes archer-pull {
           0%, 100% { transform: scale(1) translateX(0); }
           50% { transform: scale(1.1) translateX(-1px); }
         }
         @keyframes giant-fist {
           0%, 100% { transform: scale(1) translateY(0); }
           50% { transform: scale(1.2) translateY(2.5px); }
         }
         @keyframes pulse-ring {
           0% { transform: scale(0.95); opacity: 0.4; }
           50% { transform: scale(1.05); opacity: 0.75; }
           100% { transform: scale(0.95); opacity: 0.4; }
         }
         .anim-leg-L {
           animation: limb-swing-L 0.6s infinite ease-in-out;
         }
         .anim-leg-R {
           animation: limb-swing-R 0.6s infinite ease-in-out;
         }
         .anim-head {
           animation: head-bob 0.6s infinite ease-in-out;
         }
         .anim-attack-sword {
           animation: weapon-attack 0.3s infinite ease-in-out;
         }
         .anim-attack-bow {
           animation: archer-pull 0.35s infinite ease-in-out;
         }
         .anim-attack-fist {
           animation: giant-fist 0.4s infinite ease-in-out;
         }
         .animate-ping-slow {
           animation: pulse-ring 2s infinite ease-in-out;
         }
         @keyframes cw-aura-spin {
           0% { transform: rotate(0deg) scale(1.7); }
           100% { transform: rotate(360deg) scale(1.7); }
         }
         .cw-battle-aura {
           position: absolute; inset: 0; pointer-events: none; z-index: 0; opacity: 0.30;
           background: conic-gradient(from 0deg at 50% 50%,
             rgba(37,99,235,0) 0%, rgba(37,99,235,0.55) 18%, rgba(2,4,12,0) 34%,
             rgba(239,68,68,0.55) 62%, rgba(2,4,12,0) 80%, rgba(37,99,235,0) 100%);
           animation: cw-aura-spin 26s linear infinite;
           filter: blur(34px);
         }
         @keyframes cw-titan-breathe {
           0%, 100% { transform: scale(1); }
           50% { transform: scale(1.07); }
         }
         @keyframes cw-alien-float {
           0%, 100% { transform: translateY(0) rotate(-3deg); }
           50% { transform: translateY(-5px) rotate(3deg); }
         }
         @keyframes cw-quiz-idle {
           0%, 100% { transform: scale(1); }
           50% { transform: scale(1.06); }
         }
         @keyframes cw-quiz-urgent {
           0%, 100% { transform: scale(1) rotate(0deg); }
           25% { transform: scale(1.12) rotate(-4deg); }
           75% { transform: scale(1.12) rotate(4deg); }
         }
         @keyframes cw-meteor-warn {
           0%, 100% { opacity: 0.30; transform: scale(0.9); }
           50% { opacity: 0.75; transform: scale(1.04); }
         }
         @keyframes cw-meteor-scan {
           0% { transform: rotate(0deg); }
           100% { transform: rotate(360deg); }
         }
         @keyframes cw-meteor-comet-trail {
           0%, 100% { opacity: 0.6; }
           50% { opacity: 1; }
         }
         @keyframes cw-meteor-shock-ring {
           0% { transform: scale(0.2); opacity: 0.9; }
           100% { transform: scale(1); opacity: 0; }
         }
         @keyframes cw-meteor-debris {
           0% { transform: translate(0, 0) rotate(0deg) scale(1); opacity: 1; }
           100% { transform: translate(var(--dx), var(--dy)) rotate(180deg) scale(0.3); opacity: 0; }
         }
         @keyframes cw-meteor-scorch-fade {
           0% { opacity: 0.85; }
           100% { opacity: 0; }
         }
         @keyframes cw-meteor-flash {
           0% { opacity: 1; transform: scale(0.6); }
           100% { opacity: 0; transform: scale(1.6); }
         }
         @media (prefers-reduced-motion: reduce) {
           .cw-battle-aura, .cw-meteor-ring, .cw-meteor-scan, .cw-meteor-comet,
           .cw-meteor-shock, .cw-meteor-debris-bit, .cw-meteor-scorch, .cw-meteor-flash,
           [style*="cw-titan-breathe"], [style*="cw-alien-float"] {
             animation: none !important;
           }
         }
         .building-3d {
           box-shadow:
             inset -3px -3px 6px rgba(0,0,0,0.5),
             inset 2px 2px 4px rgba(255,255,255,0.08),
             2px 4px 8px rgba(0,0,0,0.6);
         }
       `}</style>

       {/* Top Bar */}
       <div className="h-16 bg-black/75 flex justify-between items-center px-4 text-white z-50 relative border-b border-white/5">
          <div className="font-bold text-sm tracking-tight flex items-center gap-2 min-w-0">
            <Swords className="text-red-500 animate-pulse flex-shrink-0" size={18} />
            <span className="text-red-400 font-extrabold text-base whitespace-nowrap">第{chapter.no}章</span>
            <span className="text-white/60 text-xs truncate hidden sm:inline" style={{ fontFamily: '"M PLUS Rounded 1c", sans-serif' }}>
              {chapter.title}
            </span>
            {assistLevel > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap flex-shrink-0"
                style={{ background: 'rgba(163,230,53,0.12)', borderColor: 'rgba(163,230,53,0.45)', color: '#a3e635' }}>
                🛟 {ASSIST_LEVELS[assistLevel].label}
              </span>
            )}
            {selectedSpell && (
              <span className="text-xs bg-purple-600/50 text-purple-200 px-2 py-0.5 rounded-full select-none animate-bounce border border-purple-400/30">
                🔮 呪文投下ポインター
              </span>
            )}
          </div>
          
          <div className="flex gap-2">
            <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#facc15]/50 bg-[#facc15]/10"
              style={{ fontFamily: 'Orbitron, monospace' }}>
              <span className="text-base">⚡</span>
              <span className="text-[#facc15] font-bold text-sm">{Math.floor(gold)}</span>
            </div>
            <Button variant="secondary" size="xs" onClick={() => onEndBattle(false, { gold: 0 })}>
              全軍撤退（降伏）
            </Button>
          </div>
       </div>

       {/* ④ 「といて⚡」を大きな浮かぶボタンにする。
           絶対配置なのでレイアウトの高さを一切食わず、画面を圧迫しないまま
           いちばん押してほしい行動をいちばん目立たせられる。
           ⚡が少ないときは色と文言が変わり、「いま解くべき」ことが伝わる。 */}
       {quizSubtopics.length > 0 && !battleResult && (() => {
         const cheapest = runner.cfg.minTroopCost[localPlayer];
         const poor = Math.floor(gold) < cheapest;
         return (
           <button
             onClick={() => { setBattlePaused(true); setQuizOpen(true); }}
             className="absolute z-[60] flex flex-col items-center justify-center rounded-full shadow-2xl active:scale-95 transition-transform"
             style={{
               // 右下はズーム操作(＋/−/リセット)が居るので、左下に置いて重なりを避ける
               left: 16,
               bottom: 150,
               width: 92, height: 92,
               background: poor
                 ? 'radial-gradient(circle at 30% 25%, #fde68a, #f59e0b 70%)'
                 : 'radial-gradient(circle at 30% 25%, #67e8f9, #0891b2 70%)',
               border: `3px solid ${poor ? '#fff7ed' : '#a5f3fc'}`,
               boxShadow: poor
                 ? '0 0 26px rgba(245,158,11,0.85), 0 6px 18px rgba(0,0,0,0.55)'
                 : '0 0 22px rgba(34,211,238,0.65), 0 6px 18px rgba(0,0,0,0.55)',
               animation: poor ? 'cw-quiz-urgent 1s ease-in-out infinite' : 'cw-quiz-idle 2.6s ease-in-out infinite',
             }}
           >
             <span className="text-3xl leading-none drop-shadow">📚</span>
             <span className="text-[13px] font-black text-white leading-tight mt-0.5"
               style={{ fontFamily: 'Orbitron, monospace', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}>
               といて⚡
             </span>
             <span className="text-[9px] font-bold text-white/90 leading-none">
               {poor ? 'エナジー不足！' : 'ためる'}
             </span>
           </button>
         );
       })()}

       {/* Temporary visual dynamic notification banner inside combat */}
       {triggerMessage && (
         <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-amber-900/95 border-2 border-amber-500 text-white font-bold text-xs py-2 px-6 rounded-full shadow-2xl animate-bounce backdrop-blur">
           {triggerMessage}
         </div>
       )}

       {/* ── 通信状態の表示（PvPのみ）──
           ロックステップは相手待ちで画面が止まる。無言のフリーズは
           いちばん悪い体験なので、何が起きているかを必ず言葉で出す。 */}
       {isPvp && netStatusRef.current.kind !== 'RUNNING' && (
         <div className="absolute inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm">
           <div className="rounded-2xl border-2 px-8 py-6 text-center max-w-sm mx-4"
             style={{
               background: 'rgba(6,10,24,0.96)',
               borderColor: netStatusRef.current.kind === 'WAITING' ? '#facc15' : '#ef4444',
             }}>
             {netStatusRef.current.kind === 'WAITING' && (
               <>
                 <div className="text-3xl mb-2 animate-pulse">📡</div>
                 <div className="text-[#facc15] font-black text-base mb-1" style={{ fontFamily: 'Orbitron, monospace' }}>
                   あいてを まっています…
                 </div>
                 <div className="text-white/60 text-xs">
                   つうしんが すこし おそいみたい。そのまま まってね
                   （{Math.round(netStatusRef.current.waitingMs / 1000)}びょう）
                 </div>
               </>
             )}
             {netStatusRef.current.kind === 'DROPPED' && (
               <>
                 <div className="text-3xl mb-2">🔌</div>
                 <div className="text-[#ef4444] font-black text-base mb-1" style={{ fontFamily: 'Orbitron, monospace' }}>
                   あいてと せつだんされました
                 </div>
                 <div className="text-white/60 text-xs mb-4">
                   あいての つうしんが とぎれたため、この しょうぶは ここまでです。
                 </div>
                 <Button size="sm" onClick={() => onEndBattle(true, { gold: 0 })}>もどる</Button>
               </>
             )}
             {netStatusRef.current.kind === 'DESYNC' && (
               <>
                 <div className="text-3xl mb-2">⚠️</div>
                 <div className="text-[#ef4444] font-black text-base mb-1" style={{ fontFamily: 'Orbitron, monospace' }}>
                   しあいを ちゅうだんしました
                 </div>
                 <div className="text-white/60 text-xs mb-4">
                   ふたりの がめんで ちがう けっかに なってしまったため、
                   ひきわけで しゅうりょうします。（tick {netStatusRef.current.tick}）
                 </div>
                 <Button size="sm" onClick={() => onEndBattle(false, { gold: 0 })}>もどる</Button>
               </>
             )}
           </div>
         </div>
       )}

       {/* Battle Stage */}
       <div
         className="flex-1 relative overflow-hidden flex items-center justify-center bg-[#0a0e1a]"
         style={{
           backgroundImage: 'radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.6) 0, transparent 100%), radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.5) 0, transparent 100%), radial-gradient(1px 1px at 40% 80%, rgba(34,211,238,0.5) 0, transparent 100%), radial-gradient(1.5px 1.5px at 85% 20%, rgba(168,85,247,0.5) 0, transparent 100%)',
           backgroundColor: '#0a0e1a',
         }}
       >
        {/* 青⇄赤の回転オーラ（CAT-WARS 世界観の動的バックドロップ） */}
        <div className="cw-battle-aura" />
        {/* contentSize を渡すと盤面が表示領域に自動で収まる（iPad 横向きで下が切れていた対策） */}
        <PinchZoomLayer contentSize={{ width: GRID_W * 40, height: GRID_H * 40 }} minScale={0.25}>
          {/* ISOMETRIC CONTAINER */}
          <div
            className="relative iso-container shadow-2xl"
            style={{
                width: GRID_W * 40,
                height: GRID_H * 40,
                backgroundColor: 'rgba(10,14,26,0.5)'
            }}
          >
            {/* Terrain Layer */}
            {battleMap && <TerrainLayer terrain={battleMap.terrain} />}

            {/* Clickable Grid Layer */}
            {cells.map(cell => (
                 <div 
                    key={`grid-${cell.x}-${cell.y}`}
                    className={`absolute w-10 h-10 border border-white/5 transition-colors ${
                      selectedSpell ? 'hover:bg-purple-500/35 cursor-crosshair' :
                      buildMode ? 'hover:bg-[#22d3ee]/20 cursor-cell' : 'hover:bg-white/15'
                    }`}
                    style={{ left: cell.x * 40, top: cell.y * 40 }}
                    onClick={() => handleGridClick(cell.x, cell.y)}
                 />
            ))}

            {/* Active spells ring indicators on isometric perspective */}
            {activeSpells.filter(s => Date.now() < s.endTime).map(s => (
              <div
                 key={s.id}
                 className={`absolute rounded-full border-4 animate-ping-slow flex items-center justify-center`}
                 style={{
                    left: (s.x - 1.5) * 40,
                    top: (s.y - 1.5) * 40,
                    width: 140, // spell boundary
                    height: 140,
                    zIndex: 10,
                    pointerEvents: 'none',
                    borderColor: s.type === 'HEAL' ? 'rgba(16,185,129,0.7)' : 'rgba(139,92,246,0.7)',
                    background: s.type === 'HEAL' ? 'rgba(16,185,129,0.12)' : 'rgba(139,92,246,0.12)',
                    boxShadow: s.type === 'HEAL' 
                      ? 'inset 0 0 15px rgba(16,185,129,0.4), 0 0 15px rgba(16,185,129,0.4)' 
                      : 'inset 0 0 15px rgba(139,92,246,0.4), 0 0 15px rgba(139,92,246,0.4)'
                 }}
              >
                <span className={`text-[9px] font-black tracking-widest uppercase scale-75 ${s.type === 'HEAL' ? 'text-emerald-400' : 'text-purple-300'}`}>
                  {s.type === 'HEAL' ? '💚 HEAL ZONE' : '⚡ RAGE ZONE'}
                </span>
              </div>
            ))}

            {/* Render flying projectiles overlay perfectly positioned */}
            {projectiles.map(p => {
              const elapsed = Date.now() - p.startedAt;
              const pct = Math.min(1, elapsed / p.duration);
              const curX = p.fromX + (p.toX - p.fromX) * pct;
              const curY = p.fromY + (p.toY - p.fromY) * pct;

              if (p.type === 'TESLA') {
                return (
                  <svg key={p.id} className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" style={{ zIndex: 60 }}>
                    <line 
                      x1={p.fromX * 40 + 20} y1={p.fromY * 40 + 20} 
                      x2={p.toX * 40 + 13} y2={p.toY * 40 + 16} 
                      stroke="#22d3ee" 
                      strokeWidth="3.2" 
                      strokeDasharray="4,2"
                      className="animate-pulse"
                    />
                    <line 
                      x1={p.fromX * 40 + 20} y1={p.fromY * 40 + 20} 
                      x2={p.toX * 40 + 13} y2={p.toY * 40 + 16} 
                      stroke="#ffffff" 
                      strokeWidth="1.2" 
                    />
                  </svg>
                );
              } else {
                return (
                  <div 
                    key={p.id}
                    className="absolute w-3.5 h-3.5 bg-gradient-to-r from-amber-500 to-amber-700 border border-black rounded-full shadow-lg z-50 flex items-center justify-center pointer-events-none"
                    style={{
                      left: curX * 40 + 13,
                      top: curY * 40 + 16
                    }}
                  >
                    <span className="w-1.5 h-1.5 bg-yellow-200 rounded-full animate-ping" />
                  </div>
                );
              }
            })}

            {/* 移動命令の矢印（うすい赤）＋ 遠距離攻撃のビーム */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible" style={{ zIndex: 58 }}>
              <defs>
                <marker id="moveArrowHead" markerWidth="6" markerHeight="6" refX="4.5" refY="3"
                  orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L6,3 L0,6 Z" fill="rgba(248,113,113,0.55)" />
                </marker>
              </defs>
              {entities
                .filter(e => e.type === 'TROOP' && e.team === 'ATTACKER' && e.customTarget && e.hp > 0)
                .map(e => (
                  <line
                    key={`mv-${e.id}`}
                    x1={e.x * 40 + 20} y1={e.y * 40 + 20}
                    x2={e.customTarget!.x * 40 + 20} y2={e.customTarget!.y * 40 + 20}
                    stroke="rgba(248,113,113,0.45)" strokeWidth="2.5"
                    strokeDasharray="6,4" strokeLinecap="round"
                    markerEnd="url(#moveArrowHead)"
                  />
                ))}
              {hitFx.filter(f => f.kind === 'BOLT').map(f => {
                const t = Math.min(1, (Date.now() - f.startedAt) / f.duration);
                return (
                  <line key={f.id}
                    x1={f.fromX * 40 + 20} y1={f.fromY * 40 + 20}
                    x2={f.x * 40 + 20} y2={f.y * 40 + 20}
                    stroke={f.color} strokeWidth={3 * (1 - t) + 0.5} strokeLinecap="round"
                    style={{ opacity: 1 - t, filter: `drop-shadow(0 0 3px ${f.color})` }}
                  />
                );
              })}
            </svg>

            {/* 攻撃ヒットの華やかなエフェクト（斬撃・衝撃・遠距離スパーク） */}
            {hitFx.map(f => {
              const t = Math.min(1, (Date.now() - f.startedAt) / f.duration);
              const cx = f.x * 40 + 20;
              const cy = f.y * 40 + 20;
              if (f.kind === 'SHOCK') {
                const size = 18 + t * 52;
                return (
                  <div key={f.id} className="absolute rounded-full pointer-events-none"
                    style={{
                      left: cx - size / 2, top: cy - size / 2, width: size, height: size,
                      border: `3px solid ${f.color}`, opacity: 0.8 * (1 - t),
                      boxShadow: `0 0 12px ${f.color}`, zIndex: 59,
                    }} />
                );
              }
              if (f.kind === 'BOLT') {
                const s = 10 * (1 - t) + 4;
                return (
                  <div key={f.id} className="absolute rounded-full pointer-events-none"
                    style={{
                      left: cx - s / 2, top: cy - s / 2, width: s, height: s,
                      background: f.color, opacity: 1 - t,
                      boxShadow: `0 0 8px ${f.color}`, zIndex: 59,
                    }} />
                );
              }
              // SLASH: 斜めに走る斬撃の光
              const len = 26 + t * 8;
              return (
                <div key={f.id} className="absolute pointer-events-none"
                  style={{
                    left: cx, top: cy, width: len, height: 4,
                    background: `linear-gradient(90deg, transparent, ${f.color}, transparent)`,
                    borderRadius: 4, opacity: 1 - t,
                    transform: `translate(-50%,-50%) rotate(-35deg) scaleX(${0.6 + t})`,
                    boxShadow: `0 0 8px ${f.color}`, zIndex: 59,
                  }} />
              );
            })}

            {/* 流星の予告 → 落下 → 着弾。絵文字1個の「スタンプ感」を避け、
                レーダー走査・カウントダウンリング・彗星の落下軌道・爆発の衝撃波と
                デブリ・こげ跡まで多層のエフェクトで表現する（既存のBOLT/SHOCKヒット演出と
                同じ「発光レイヤーの重ね合わせ」手法に統一）。 */}
            {meteors.map(m => {
              const now2 = Date.now();
              const impacted = now2 >= m.impactAt;
              const sinceImpact = now2 - m.impactAt;
              const size = m.zone.radius * 2 * 40;
              const cx = m.zone.x * 40 + 20;
              const cy = m.zone.y * 40 + 20;
              const left = cx - size / 2;
              const top = cy - size / 2;
              const totalMs = Math.max(1, m.impactAt - m.warnedAt);
              const prog = Math.min(1, (now2 - m.warnedAt) / totalMs);
              // カウントダウンリング: 残り時間が減るほど円が閉じていく（conic-gradientで残量を表現）
              const remainDeg = Math.max(0, 360 * (1 - prog));

              if (!impacted) {
                // 彗星は画面外(右上)から目標地点へ、予告時間ぶんかけて落ちてくる
                const cometStartX = cx + 150;
                const cometStartY = cy - 150;
                const cometX = cometStartX + (cx - cometStartX) * prog;
                const cometY = cometStartY + (cy - cometStartY) * prog;
                return (
                  <React.Fragment key={m.id}>
                    {/* 地面のターゲットサークル（レーダー走査つき） */}
                    <div className="absolute rounded-full pointer-events-none cw-meteor-ring"
                      style={{
                        left, top, width: size, height: size, zIndex: 56,
                        border: '2px dashed rgba(251,146,60,0.85)',
                        background: `radial-gradient(circle, rgba(251,146,60,${0.08 + prog * 0.18}), transparent 72%)`,
                        boxShadow: '0 0 16px rgba(251,146,60,0.5)',
                        animation: 'cw-meteor-warn 0.6s ease-in-out infinite',
                      }}>
                      {/* カウントダウンリング（残り時間ぶんだけ光の弧が残る） */}
                      <div className="absolute inset-[3px] rounded-full pointer-events-none"
                        style={{
                          background: `conic-gradient(rgba(254,215,170,0.95) ${remainDeg}deg, transparent ${remainDeg}deg)`,
                          WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
                          mask: 'radial-gradient(farthest-side, transparent calc(100% - 4px), #000 calc(100% - 3px))',
                        }} />
                      {/* レーダー走査線 */}
                      <div className="absolute inset-0 cw-meteor-scan" style={{ animation: 'cw-meteor-scan 1.1s linear infinite' }}>
                        <div style={{
                          position: 'absolute', left: '50%', top: '50%', width: '50%', height: 2,
                          background: 'linear-gradient(90deg, rgba(251,191,36,0.9), transparent)',
                          transformOrigin: '0 50%',
                        }} />
                      </div>
                    </div>
                    {/* 落下中の彗星本体（尾を引きながら目標へ接近） */}
                    <div className="absolute pointer-events-none cw-meteor-comet"
                      style={{
                        left: cometX, top: cometY, zIndex: 62,
                        width: 14, height: 14, borderRadius: '9999px',
                        transform: 'translate(-50%,-50%)',
                        background: 'radial-gradient(circle, #fff7ed, #fb923c 55%, #c2410c 85%)',
                        boxShadow: '0 0 14px rgba(251,146,60,0.95), 0 0 28px rgba(251,146,60,0.55)',
                        animation: 'cw-meteor-comet-trail 0.4s ease-in-out infinite',
                      }}>
                      <div style={{
                        position: 'absolute', right: '90%', top: '50%', width: 46, height: 5,
                        background: 'linear-gradient(90deg, transparent, rgba(251,191,36,0.75))',
                        transform: `translateY(-50%) rotate(${Math.atan2(cometY - cometStartY, cometX - cometStartX) * 180 / Math.PI}deg)`,
                        transformOrigin: '100% 50%',
                        borderRadius: 4,
                      }} />
                    </div>
                  </React.Fragment>
                );
              }

              // ── 着弾: 衝撃波リング×2 + フラッシュ + 放射状デブリ + じわっと消えるこげ跡 ──
              const debris = Array.from({ length: 8 }, (_, i) => {
                const ang = (i / 8) * Math.PI * 2;
                const dist = size * 0.6;
                return { dx: Math.cos(ang) * dist, dy: Math.sin(ang) * dist, ang };
              });
              return (
                <React.Fragment key={m.id}>
                  {/* こげ跡（一番下のレイヤー・ゆっくり消える） */}
                  <div className="absolute rounded-full pointer-events-none cw-meteor-scorch"
                    style={{
                      left: cx - size * 0.55, top: cy - size * 0.55, width: size * 1.1, height: size * 1.1, zIndex: 20,
                      background: 'radial-gradient(circle, rgba(40,20,10,0.55), transparent 70%)',
                      animation: 'cw-meteor-scorch-fade 0.9s ease-out forwards',
                    }} />
                  {/* フラッシュ */}
                  {sinceImpact < 220 && (
                    <div className="absolute rounded-full pointer-events-none cw-meteor-flash"
                      style={{
                        left: cx - size * 0.5, top: cy - size * 0.5, width: size, height: size, zIndex: 63,
                        background: 'radial-gradient(circle, #fffbeb, #fde68a 40%, transparent 72%)',
                        animation: 'cw-meteor-flash 0.22s ease-out forwards',
                      }} />
                  )}
                  {/* 衝撃波リング（2重） */}
                  {[0, 120].map(delay => (
                    <div key={delay} className="absolute rounded-full pointer-events-none cw-meteor-shock"
                      style={{
                        left, top, width: size, height: size, zIndex: 61,
                        border: '3px solid rgba(255,224,178,0.9)',
                        animation: `cw-meteor-shock-ring 0.6s ease-out ${delay}ms forwards`,
                      }} />
                  ))}
                  {/* 放射状デブリ */}
                  {sinceImpact < 500 && debris.map((d, i) => (
                    <div key={i} className="absolute pointer-events-none cw-meteor-debris-bit"
                      style={{
                        left: cx, top: cy, zIndex: 62,
                        width: 8, height: 8, borderRadius: 2,
                        background: i % 2 === 0 ? '#fb923c' : '#fde68a',
                        transform: `rotate(${(d.ang * 180) / Math.PI}deg)`,
                        boxShadow: '0 0 6px rgba(251,146,60,0.8)',
                        ['--dx']: `${d.dx}px`, ['--dy']: `${d.dy}px`,
                        animation: 'cw-meteor-debris 0.5s ease-out forwards',
                      } as React.CSSProperties}
                    />
                  ))}
                </React.Fragment>
              );
            })}

            {/* Entities Render sorted correctly */}
            {entities
                .sort((a, b) => (a.x + a.y) - (b.x + b.y)) // pseudo depth sort
                .map(e => {
                if (e.isHidden) return null;

                let width = 28;
                let height = 32;
                let bgStyle = "";
                
                if (e.type === 'BUILDING') {
                   const bStats = BUILDING_STATS[e.subType as BuildingType];
                   width = (bStats?.width || 1) * 40;
                   height = (bStats?.height || 1) * 40;
                   bgStyle = bStats?.color || 'bg-gray-500';
                } else {
                   // 体格は系統ごとに定義した bodySize から決める（1マス=40px）。
                   // タンクはマスをはみ出す大柄、高速系は小さく、ボスは圧倒的に大きい。
                   const fam = CHARACTER_BY_ID[e.subType];
                   if (fam) {
                      width = fam.bodySize;
                      height = Math.round(fam.bodySize * 1.15);
                   } else if (e.subType === 'titan') {
                      width = 110;
                      height = 120;
                   } else if (e.subType === ALIEN_STATS.subType) {
                      width = ALIEN_STATS.bodySize;
                      height = Math.round(ALIEN_STATS.bodySize * 1.15);
                   } else if (e.subType === 'skeleton') {
                      width = 24;
                      height = 28;
                   } else {
                      width = 28;
                      height = 32;
                   }
                }

                const isDamaged = damagedEntities.has(e.id);

                return (
                    <div
                        key={e.id}
                        className={`absolute flex items-center justify-center transition-transform iso-item
                            ${e.type === 'BUILDING' ? `building-3d rounded-md border border-white/5 ${bgStyle}` : 'bg-transparent'}
                            ${isDamaged ? 'animate-shake hit-flash scale-105' : ''}
                            ${e.team === 'ATTACKER_BUILDING' ? 'ring-2 ring-[#22d3ee]/50' : ''}
                        `}
                        style={{
                            // 施設はマスの左上に合わせる。キャラは体格がまちまちなので、
                            // マスの中心を基準にそろえる（大型が右下にずれて見えるのを防ぐ）。
                            left: e.type === 'BUILDING' ? e.x * 40 : e.x * 40 + 20 - width / 2,
                            top:  e.type === 'BUILDING' ? e.y * 40 : e.y * 40 + 20 - height / 2,
                            width: width,
                            height: height,
                            // 大型ほど手前に描く（小さいキャラが巨体の裏に完全に隠れないよう TROOP に加算）
                            zIndex: Math.floor(e.x + e.y) + (e.type === 'TROOP' ? 3 : 0), // Z depth
                            ...(e.type === 'BUILDING' ? {
                              background: buildingAccentColor[e.subType as string] ?? 'rgba(255,255,255,0.05)',
                              boxShadow: e.team === 'ATTACKER_BUILDING'
                                ? 'inset -3px -3px 6px rgba(0,0,0,0.5), inset 2px 2px 4px rgba(255,255,255,0.1), 0 0 8px rgba(34,211,238,0.4)'
                                : 'inset -3px -3px 6px rgba(0,0,0,0.5), inset 2px 2px 4px rgba(255,255,255,0.08), 2px 4px 8px rgba(0,0,0,0.6)',
                            } : {}),
                        }}
                        onClick={(ev) => {
                          // 自軍のネコ → 選択（もう一度押すと解除）
                          if (e.team === 'ATTACKER' && e.type === 'TROOP') {
                            ev.stopPropagation();
                            setSelectedOrderTroopId(prev => prev === e.id ? null : e.id);
                            return;
                          }
                          // ⑤ ネコを選んだ状態で敵（キャラ・施設）をタップ → そいつを狙わせる。
                          // 「どこへ行くか」だけでなく「なにを狙うか」を指示できるようにする。
                          if (selectedOrderTroopId && e.team !== 'ATTACKER' && e.team !== 'ATTACKER_BUILDING') {
                            ev.stopPropagation();
                            issue({ type: 'FOCUS', player: localPlayer, entityId: selectedOrderTroopId, targetId: e.id });
                            setSelectedOrderTroopId(null);
                          }
                        }}
                    >
                        {e.type === 'BUILDING' ? (
                          <div className="flex flex-col items-center w-full h-full relative">
                            <img
                              src={`/assets/sprites/${(e.subType as string).toLowerCase().replace(/_/g, '-')}.png`}
                              alt={e.subType as string}
                              style={{
                                width: '100%', height: '100%',
                                objectFit: 'contain',
                                imageRendering: 'crisp-edges',
                                filter: e.team === 'ATTACKER_BUILDING'
                                  ? 'drop-shadow(0 0 5px rgba(34,211,238,0.7)) brightness(1.1)'
                                  : e.hp < e.maxHp * 0.3
                                  ? 'brightness(0.6) sepia(1) saturate(3) hue-rotate(-20deg)'
                                  : undefined,
                              }}
                              draggable={false}
                            />
                            {e.subType === BuildingType.HIDDEN_TESLA && (
                              <span className="text-[7px] font-black text-cyan-400 select-none bg-cyan-950/80 px-1 rounded absolute -bottom-1">活性中</span>
                            )}
                          </div>
                        ) : (
                          <div className="relative w-full h-full flex items-center justify-center">
                            {e.subType === 'skeleton' && (
                              <div className="absolute w-4 h-1.5 bg-blue-900/40 rounded-full bottom-0 left-1/2 -translate-x-1/2 blur-[1px]" />
                            )}
                            {(() => {
                              // 中立勢力（エイリアン・ヌシ）はネコではないので、専用スプライトを使う。
                              // 絵文字1文字だと「スタンプ感」が出るため、生成した専用イラストに
                              // 発光・浮遊アニメーションを重ねてリッチに見せる。
                              if (e.team === 'NEUTRAL') {
                                const isTitan = e.subType === 'titan';
                                return (
                                  <div className="w-full h-full flex items-center justify-center select-none relative"
                                    style={{ animation: isTitan ? 'cw-titan-breathe 2.6s ease-in-out infinite' : 'cw-alien-float 1.4s ease-in-out infinite' }}>
                                    <div className="absolute rounded-full pointer-events-none"
                                      style={{
                                        inset: isTitan ? -14 : -6,
                                        background: isTitan
                                          ? 'radial-gradient(circle, rgba(168,85,247,0.35), transparent 70%)'
                                          : 'radial-gradient(circle, rgba(192,132,252,0.4), transparent 70%)',
                                        filter: 'blur(4px)',
                                      }} />
                                    <img
                                      src={`/assets/sprites/chars/${isTitan ? 'titan' : 'alien'}-1.png`}
                                      alt={e.subType}
                                      style={{
                                        width: '100%', height: '100%', objectFit: 'contain',
                                        imageRendering: 'crisp-edges', position: 'relative',
                                        filter: isTitan
                                          ? 'drop-shadow(0 0 10px rgba(168,85,247,0.75))'
                                          : 'drop-shadow(0 0 6px rgba(192,132,252,0.7))',
                                      }}
                                      draggable={false}
                                    />
                                  </div>
                                );
                              }
                              // 攻撃側は自軍の進化段階、敵側は段階1で描画
                              const st = e.team === 'ATTACKER' ? getStage(e.subType) : 1;
                              const url = troopSpriteUrl(e.subType, st);
                              return url ? (
                                <img
                                  src={url}
                                  alt={e.subType}
                                  style={{
                                    width: '100%', height: '100%',
                                    objectFit: 'contain',
                                    imageRendering: 'crisp-edges',
                                    filter: e.team !== 'ATTACKER'
                                      ? 'hue-rotate(150deg) brightness(0.85) drop-shadow(0 0 3px rgba(239,68,68,0.8))'
                                      : (tempRank[e.subType] ?? 0) > 0
                                        ? 'drop-shadow(0 0 7px rgba(250,204,21,0.95)) brightness(1.2) sepia(0.2) saturate(1.8)'
                                        : 'drop-shadow(0 2px 3px rgba(34,211,238,0.4))',
                                    transform: e.team !== 'ATTACKER' ? 'scaleX(-1)' : (tempRank[e.subType] ?? 0) > 0 ? 'scale(1.18)' : undefined,
                                  }}
                                  draggable={false}
                                />
                              ) : renderStickFigure(e.subType, !!(e.path && e.path.length > 0), e.lastAttack);
                            })()}

                            {/* Unit order menu */}
                            {selectedOrderTroopId === e.id && (
                              <div
                                className="absolute flex gap-1 z-[150]"
                                style={{ top: -42, left: '50%', transform: 'translateX(-50%)', pointerEvents: 'all' }}
                                onClick={ev => ev.stopPropagation()}
                              >
                                {(
                                  [
                                    { order: 'RUSH' as const, label: '🏃突撃', color: '#ef4444' },
                                    { order: 'DEFENSE' as const, label: '🛡防衛', color: '#22d3ee' },
                                    { order: 'HOLD' as const, label: '⏸待機', color: '#94a3b8' },
                                  ] as { order: 'RUSH' | 'DEFENSE' | 'HOLD'; label: string; color: string }[]
                                ).map(({ order, label, color }) => (
                                  <button
                                    key={order}
                                    onClick={() => {
                                      if (selectedOrderTroopId) {
                                        issue({ type: 'SET_ORDER', player: localPlayer, entityId: selectedOrderTroopId, order });
                                      }
                                      setSelectedOrderTroopId(null);
                                    }}
                                    className="px-2 py-1 text-[10px] font-black rounded-lg text-white"
                                    style={{
                                      background: 'rgba(10,14,26,0.95)',
                                      border: `1px solid ${color}`,
                                      color,
                                      whiteSpace: 'nowrap',
                                    }}
                                  >
                                    {label}
                                  </button>
                                ))}
                                {/* ⑤ 旧「📍移動先タップ」ボタンは撤去した。
                                    onClick を持たないただのラベルで、実際には
                                    「ネコを選ぶ → 行き先をタップ」で既に動いていたため、
                                    押す必要のないボタンが並んでいるだけだった。
                                    いまは操作の説明だけを出す。 */}
                                <span className="px-2 py-1 text-[10px] font-black rounded-lg whitespace-nowrap"
                                  style={{ background: 'rgba(10,14,26,0.95)', border: '1px solid #a78bfa', color: '#a78bfa' }}>
                                  📍行き先/敵をタップ
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {/* HP Bar with color dynamics based on health depletion */}
                        <div className="absolute -top-4 left-0 w-full h-1.5 bg-gray-950/80 rounded-full border border-black/30 overflow-hidden">
                            <div
                              className="h-full transition-all duration-150"
                              style={{
                                width: `${(e.hp / e.maxHp) * 100}%`,
                                background: e.team === 'DEFENDER' ? '#ef4444' : '#22c55e',
                                boxShadow: e.team === 'DEFENDER' ? '0 0 4px #ef4444' : '0 0 4px #22c55e',
                              }}
                            ></div>
                        </div>
                        {e.team === 'ATTACKER' && (tempRank[e.subType] ?? 0) > 0 && (
                          <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-[8px] font-black text-[#facc15] bg-black/80 px-1 rounded-full border border-[#facc15]/60 whitespace-nowrap" style={{ fontFamily: 'Orbitron, monospace' }}>
                            ⬆+{tempRank[e.subType]}
                          </div>
                        )}
                    </div>
                );
            })}
            
            {/* Spawn Ground Overlay */}
            {!battleStarted && (
               <div className="absolute inset-0 border-4 border-dashed border-teal-400/40 pointer-events-none flex items-center justify-center iso-item">
                  <span className="text-white text-xs font-black bg-slate-950/90 py-3 px-6 rounded-full border border-teal-400/30 shadow-2xl backdrop-blur-md animate-pulse">
                     👈 外側の空地（砂地）をタップして、味方部隊やアクティブ呪文を投入せよ
                  </span>
               </div>
            )}
          </div>
        </PinchZoomLayer>
       </div>

       {/* Result Modal display */}
       {battleResult && (() => {
         const lootMult = hasBuff('DOUBLE_LOOT') ? 1 + buffVal('DOUBLE_LOOT') / 100 : 1;
         const win = battleResult === 'WIN';
         // 戦利品は章ごとに設定（難しい章ほど多い）
         const loot = win ? { gold: Math.round(chapter.rewardCredits * lootMult) } : { gold: 0 };
         // fixed + z-[160] にして、下部のキャラ出撃バー(z-50)より確実に手前へ出す。
         // 以前は両方 z-50 の兄弟要素で、DOM順が後のバーがリザルトを覆っていた。
         return (
         <div className="fixed inset-0 z-[160] bg-black/90 flex flex-col items-center justify-center animate-in fade-in zoom-in duration-300 p-4 overflow-y-auto">
            {win ? (
               <div className="text-center p-6 bg-slate-900/70 border border-yellow-500/30 rounded-2xl max-w-sm w-full max-h-[92dvh] overflow-y-auto backdrop-blur-md shadow-2xl">
                 <Trophy className="w-16 h-16 text-yellow-400 mx-auto mb-3 animate-bounce" />
                 <div className="text-[10px] tracking-[0.25em] text-yellow-400/70 mb-1" style={{ fontFamily: 'Orbitron, monospace' }}>
                   CHAPTER {chapter.no} CLEAR
                 </div>
                 <h2 className="text-2xl font-extrabold text-yellow-400 mb-2 leading-tight">{chapter.title}</h2>
                 <p className="text-sm text-gray-200 mb-4 leading-relaxed">{chapter.victoryLine}</p>
                 <LevelUpSummary events={levelUps} />
                 <Button className="w-full mt-2" size="lg" onClick={() => onEndBattle(true, loot)}>
                   戦利品を獲得して帰還 (💠{loot.gold} クレジット){hasBuff('DOUBLE_LOOT') && ' ×2!'}
                 </Button>
               </div>
            ) : (
               <div className="text-center p-6 bg-slate-900/70 border border-red-500/30 rounded-2xl max-w-sm w-full max-h-[92dvh] overflow-y-auto backdrop-blur-md shadow-2xl">
                 <Skull className="w-16 h-16 text-red-500 mx-auto mb-3" />
                 <h2 className="text-2xl font-extrabold text-red-500 mb-2">たいきゃく...</h2>
                 <p className="text-sm text-gray-200 mb-2 leading-relaxed">{chapter.defeatLine}</p>
                 <p className="text-[11px] text-cyan-300/80 mb-3 leading-relaxed">
                   💡 {chapter.hint}
                 </p>
                 {/* 連敗時は次回サポートが入ることを先に伝える（隠れた調整はしない） */}
                 <div className="text-[11px] text-[#a3e635] mb-3 leading-relaxed">
                   まけても部隊の経験値は手に入るよ。何回かまけると「サポートモード」で やさしくなるので、あきらめずにもう一回！
                 </div>
                 <LevelUpSummary events={levelUps} />
                 <Button className="w-full mt-2" size="lg" variant="secondary" onClick={() => onEndBattle(false, { gold: 0 })}>
                   村へ撤退する
                 </Button>
               </div>
            )}
         </div>
         );
       })()}

       {/* Hotbar: Bottom selection console for both troops and spells */}
       {/* iPad 横向きでは画面の高さが限られるため、行数を減らしてコンパクトにしている */}
       <div className="bg-gray-950/95 border-t border-gray-800 px-3 py-1.5 z-50 relative shadow-2xl flex flex-col gap-1.5 flex-shrink-0">
         {/* Row 1: 魔法カード（選択＋補充を1行にまとめた） */}
         <div className="flex gap-2 items-center justify-center flex-wrap">
           <span className="text-[10px] font-black text-gray-400 self-center uppercase pr-1">魔法カード:</span>
           <button
             onClick={() => {
               setSelectedSpell('HEAL');
               setSelectedTroopId(null);
             }}
             disabled={spellCounts.HEAL <= 0}
             className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs ${
               selectedSpell === 'HEAL'
                 ? 'bg-emerald-950 text-emerald-300 border-emerald-400'
                 : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-850'
             } ${spellCounts.HEAL <= 0 ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}
           >
             <Heart size={13} className="text-emerald-400" />
             <span className="font-bold">回復(HEAL)</span>
             <span className="text-[10px] bg-slate-850 text-stone-300 px-1.5 py-0.2 rounded font-mono">
               残: {spellCounts.HEAL}
             </span>
           </button>

           <button
             onClick={() => {
               setSelectedSpell('RAGE');
               setSelectedTroopId(null);
             }}
             disabled={spellCounts.RAGE <= 0}
             className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs ${
               selectedSpell === 'RAGE'
                 ? 'bg-purple-950 text-purple-300 border-purple-400'
                 : 'bg-slate-900 text-slate-300 border-slate-700 hover:bg-slate-850'
             } ${spellCounts.RAGE <= 0 ? 'opacity-30 grayscale cursor-not-allowed' : ''}`}
           >
             <Zap size={13} className="text-purple-400" />
             <span className="font-bold">激怒(RAGE)</span>
             <span className="text-[10px] bg-slate-850 text-stone-300 px-1.5 py-0.2 rounded font-mono">
               残: {spellCounts.RAGE}
             </span>
           </button>

           {/* 補充（旧・独立した行を、この行のチップに統合してバーの高さを削った） */}
           <button
             onClick={() => issue({ type: 'BUY_SPELL', player: localPlayer, spell: 'HEAL' })}
             disabled={gold < 60}
             className="px-2 py-1.5 text-[10px] font-bold rounded-lg border border-[#22d3ee]/40 bg-[#22d3ee]/10 text-[#22d3ee] disabled:opacity-30 whitespace-nowrap"
           >
             ＋💊60⚡
           </button>
           <button
             onClick={() => issue({ type: 'BUY_SPELL', player: localPlayer, spell: 'RAGE' })}
             disabled={gold < 80}
             className="px-2 py-1.5 text-[10px] font-bold rounded-lg border border-[#fb923c]/40 bg-[#fb923c]/10 text-[#fb923c] disabled:opacity-30 whitespace-nowrap"
           >
             ＋😤80⚡
           </button>

           {/* 建設（旧・独立した行を、この行に統合） */}
           <span className="text-[10px] font-black text-gray-400 self-center uppercase pl-2">建設:</span>
           {IN_BATTLE_BUILD_OPTIONS.map(type => {
             const bCost = IN_BATTLE_BUILD_COSTS[type] ?? 0;
             const canAfford = Math.floor(gold) >= bCost;
             const selected = buildMode === type;
             return (
               <button
                 key={type}
                 onClick={() => {
                   setBuildMode(selected ? null : type);
                   setSelectedTroopId(null);
                   setSelectedSpell(null);
                 }}
                 disabled={!canAfford && !selected}
                 className={`flex items-center gap-1 px-2 py-1.5 rounded-lg border text-[10px] font-bold whitespace-nowrap transition-all active:scale-95 ${
                   selected
                     ? 'border-[#22d3ee] bg-[#22d3ee]/20 text-[#22d3ee]'
                     : canAfford
                       ? 'border-white/25 bg-white/5 text-white/75 hover:bg-white/10'
                       : 'border-white/10 bg-transparent text-white/40 opacity-40'
                 }`}
               >
                 <span className="text-sm leading-none">{BUILDING_STATS[type].icon || '🧱'}</span>
                 <span style={{ fontFamily: 'Orbitron, monospace' }}>{bCost}⚡</span>
               </button>
             );
           })}
           {buildMode && (
             <span className="text-[10px] text-[#22d3ee] font-bold animate-pulse whitespace-nowrap">
               👆 配置する場所をタップ
             </span>
           )}
         </div>

         {/* Row 2: 出撃（ゴールド消費・にゃんこ式）+ 一時ランクアップ */}
         <div className="relative flex items-center gap-2 overflow-x-auto px-1">
            {availableTroops.map(troop => {
               const fam = CHARACTER_BY_ID[troop.id];
               const baseStage = getStage(troop.id);
               const tr = tempRank[troop.id] ?? 0;
               const formName = fam ? fam.forms[baseStage - 1].name : troop.name;
               const sprite = troopSpriteUrl(troop.id, baseStage) ?? `/assets/sprites/${troop.id}.png`;
               // コスト・クールダウンはシミュレーションが持つ確定値から引く
               // （UIで再計算するとシミュレーションとズレて「押せるのに出ない」が起きる）
               const cost = Math.round((runner.cfg.unitStats[localPlayer][troop.id]?.cost ?? 0) * runner.cfg.costMult[localPlayer]);
               const cdLeft = deployCooldownLeftMs(troop.id);
               const affordable = Math.floor(gold) >= cost && cdLeft <= 0;
               return (
                  <button
                    key={troop.id}
                    onClick={() => {
                      if (!isCharUnlocked(troop.id)) {
                        if (unlockCharacterToday(troop.id)) {
                          sfx.correct();
                        } else {
                          setTriggerMessage('⚡ エナジーが15たりない！まず「といて⚡」で問題をとこう！');
                          setTimeout(() => setTriggerMessage(null), 2000);
                        }
                        return;
                      }
                      setSelectedTroopId(troop.id);
                      setSelectedSpell(null);
                    }}
                    className={`flex-shrink-0 relative w-16 h-16 rounded-xl border-2 flex flex-col items-center justify-center bg-slate-900 transition-all ${
                      selectedTroopId === troop.id ? 'border-yellow-400 bg-slate-800' : 'border-gray-800 hover:bg-slate-800'
                    } ${!affordable ? 'opacity-50' : ''}`}
                  >
                     <img src={sprite} alt={troop.id}
                       style={{ width: 28, height: 28, objectFit: 'contain', imageRendering: 'crisp-edges' }}
                       draggable={false} />
                     <span className="text-[8px] font-bold text-gray-300 leading-none truncate w-full text-center px-0.5">{formName}</span>
                     <span className="text-[9px] font-black text-[#facc15] leading-none mt-0.5" style={{ fontFamily: 'Orbitron, monospace' }}>{cost}⚡</span>
                     {tr > 0 && (
                       <span className="absolute -top-1.5 -left-1.5 bg-[#ef4444] text-white text-[8px] font-black px-1 rounded-full border border-white">+{tr}</span>
                     )}
                     {(baseStage > 1) && (
                       <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 text-[7px] font-black px-1 rounded-full"
                         style={{ background: fam?.accent ?? '#facc15', color: '#0a0e1a' }}>
                         進化{baseStage}
                       </span>
                     )}
                     {cdLeft > 0 && (
                       <div className="absolute inset-0 rounded-xl bg-black/60 flex items-center justify-center">
                         <span className="text-white text-xs font-bold">{(cdLeft/1000).toFixed(1)}</span>
                       </div>
                     )}
                     {!isCharUnlocked(troop.id) && (
                       <div className="absolute inset-0 rounded-xl bg-black/70 flex flex-col items-center justify-center gap-0.5">
                         <span className="text-base">🔒</span>
                         <span className="text-[8px] text-[#facc15] font-bold">15⚡</span>
                       </div>
                     )}
                  </button>
               );
            })}

            {/* 一時ランクアップ（選択中の兵種をゴールドで強化） */}
            {selectedTroopId && (() => {
              const fam = CHARACTER_BY_ID[selectedTroopId];
              if (!fam) return null;
              const rankCost = Math.round((runner.cfg.unitStats[localPlayer][selectedTroopId]?.cost ?? fam.cost.gold) * 3);
              const can = Math.floor(gold) >= rankCost;
              return (
                <button
                  onClick={() => {
                    if (Math.floor(gold) < rankCost) return;
                    issue({ type: 'BUY_RANK', player: localPlayer, troopId: selectedTroopId });
                    sfx.correct();
                  }}
                  disabled={!can}
                  className={`flex-shrink-0 flex flex-col items-center justify-center w-16 h-16 rounded-xl border-2 transition-all ${
                    can ? 'border-[#ef4444] bg-[#ef4444]/15 text-[#f87171]' : 'border-gray-700 bg-slate-900 opacity-40'
                  }`}
                  style={{ fontFamily: 'Orbitron, monospace' }}
                >
                  <span className="text-lg">⬆️</span>
                  <span className="text-[8px] font-bold leading-none">強化</span>
                  <span className="text-[9px] font-black text-[#facc15] mt-0.5">{rankCost}⚡</span>
                </button>
              );
            })()}
         </div>

       </div>

       {/* 戦闘中クイズ（出撃前に選んだ範囲からランダム出題 → ⚡エナジー獲得）
           ③ 報酬は問題の難易度・所要工程に応じて傾斜配分される（InBattleQuiz 側で算出）。 */}
       {quizOpen && (
         <InBattleQuiz
           unitKeys={quizSubtopics}
           baseReward={34}
           onReward={(en) => issue({ type: 'GRANT_ENERGY', player: localPlayer, amount: en })}
          onAnswered={(item, perfect) => grantStudyReward(perfect, item.skillId, item.difficulty)}
           onClose={() => { setQuizOpen(false); setBattlePaused(false); }}
         />
       )}

       {/* 開戦ブリーフィング（②: 戦いのタイトル・敵の背景・作戦の一言） */}
       {briefingOpen && (
         <div className="absolute inset-0 z-[130] flex items-center justify-center p-4"
           style={{ background: 'rgba(3,6,16,0.93)', backdropFilter: 'blur(6px)' }}>
           <div className="w-full max-w-sm rounded-2xl border p-5 max-h-[90dvh] overflow-y-auto"
             style={{
               borderColor: 'rgba(239,68,68,0.4)',
               background: 'linear-gradient(160deg, rgba(37,99,235,0.16), rgba(239,68,68,0.14)), rgba(6,10,24,0.9)',
               fontFamily: '"M PLUS Rounded 1c", sans-serif',
             }}>
             <div className="text-[10px] tracking-[0.3em] text-[#38bdf8]/80" style={{ fontFamily: 'Orbitron, monospace' }}>
               CHAPTER {chapter.no}
             </div>
             <h2 className="text-white font-black text-xl mt-1 mb-3 leading-tight">{chapter.title}</h2>

             <div className="flex items-start gap-3 p-3 rounded-xl mb-3"
               style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)' }}>
               <span className="text-2xl leading-none">😼</span>
               <div className="min-w-0">
                 <div className="text-[#f87171] font-bold text-sm">{chapter.enemyName}</div>
                 <div className="text-white/45 text-[10px] mb-1">{chapter.enemyTitle}</div>
                 <p className="text-white/75 text-[11px] leading-relaxed">{chapter.background}</p>
               </div>
             </div>

             <p className="text-white/85 text-xs leading-relaxed mb-2">▸ {chapter.briefing}</p>
             <p className="text-[#facc15]/90 text-[11px] leading-relaxed mb-4">💡 {chapter.hint}</p>

             {assistLevel > 0 && (
               <div className="p-2.5 rounded-xl mb-4 text-[11px] leading-relaxed"
                 style={{ background: 'rgba(163,230,53,0.10)', border: '1px solid rgba(163,230,53,0.35)', color: '#a3e635' }}>
                 🛟 <strong>{ASSIST_LEVELS[assistLevel].label}</strong>：{ASSIST_LEVELS[assistLevel].description}
               </div>
             )}

             <button
               onClick={() => { sfx.select(); setBriefingOpen(false); }}
               className="w-full py-3.5 rounded-xl font-bold text-base transition-all active:scale-95"
               style={{
                 fontFamily: 'Orbitron, monospace',
                 background: 'rgba(239,68,68,0.2)', border: '2px solid #ef4444', color: '#f87171',
                 boxShadow: '0 0 14px rgba(239,68,68,0.5)',
               }}>
               ⚔️ 作戦かいし！
             </button>
           </div>
         </div>
       )}

    </div>
  );
};

// 戦闘リザルトのレベルアップ/進化サマリー
const LevelUpSummary: React.FC<{ events: import('../../store/useArmyStore').LevelUpEvent[] }> = ({ events }) => {
  if (!events || events.length === 0) {
    return (
      <div className="text-xs text-cyan-300/80 mb-2">出撃したネコに経験値が入りました！</div>
    );
  }
  return (
    <div className="mb-3 flex flex-col gap-1.5">
      {events.map(ev => {
        const fam = CHARACTER_BY_ID[ev.familyId];
        if (!fam) return null;
        const newForm = fam.forms[ev.newStage - 1];
        return (
          <div key={ev.familyId}
            className="flex items-center gap-2 p-2 rounded-xl"
            style={{ background: `${fam.accent}1a`, border: `1px solid ${fam.accent}55` }}>
            <img src={getCharacterSprite(fam.spriteFamily, ev.newStage)} alt={fam.id}
              style={{ width: 36, height: 36, objectFit: 'contain' }} draggable={false} />
            <div className="flex-1 text-left">
              <div className="text-white font-bold text-xs">
                {ev.evolved ? `✨ 進化！ ${newForm.name}` : `${newForm.name}`}
              </div>
              <div className="text-[10px]" style={{ color: fam.accent }}>
                Lv{ev.fromLevel} → Lv{ev.toLevel}{ev.evolved && ' ・ あたらしいすがた！'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
