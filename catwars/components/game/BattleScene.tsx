import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { GameState, Troop, BuildingType, BattleEntity, GRID_W, GRID_H } from '../../types';
import { BUILDING_STATS } from '../../constants';
import { Button, Chip, FacilityImg, Icon, Panel, StatPill, TitleBar, type IconName } from '../ui';
import { TerrainLayer } from './TerrainLayer';
// ── 決定論シミュレーション（catwars/sim/）──
// ゲーム状態はすべてこちらが持つ。このコンポーネントは描画と入力だけを担当する。
import { SimRunner, LocalCommandProvider } from '../../sim/runner';
import { canDeployAt, isBlockedCell, SimInit } from '../../sim/simulate';
import { buildSimConfig } from '../../sim/setup';
import { stateChecksum } from '../../sim/checksum';
import { SimCommand, SimEvent, SimConfig, PlayerId, TICK_MS } from '../../sim/types';
import type { LockstepSession, LockstepStatus } from '../../net/lockstep';
import { ProblemCards, starsFor } from './ProblemCards';
import { QUIZ_BASE_REWARD, cardLimitFor } from '../../data/campaign';
import { familySkillIds } from '../../learn/shards';
import { NewSkillNotice } from '../army/SkillParts';
import { grantStudyReward } from '../../bridge';
import { useCollectionStore } from '../../store/useCollectionStore';
import { useCampaignStore } from '../../store/useCampaignStore';
import { refreshCollection } from '../../collection/record';
import { unitDexKey, bossDexKey } from '../../collection/dex';
import { bossSprite, enemyUnitSprite } from '../../data/enemySprites';
import { GainsSummary, type Gains } from '../collection/CollectionParts';
import { sfx } from '../../utils/audioEngine';
import { useProgressStore, BUFF_LEVEL_INFO } from '../../store/useProgressStore';
import { useArmyStore } from '../../store/useArmyStore';
import { CHARACTERS, CHARACTER_BY_ID, getCharacterSprite, spriteFamilyForSubType, stageForLevel } from '../../data/characters';
import { PinchZoomLayer } from './PinchZoomLayer';
import {
  CampaignChapter, ChapterDifficulty, ENEMY_UNIT_STATS, ENEMY_UNIT_COST, ASSIST_LEVELS,
  ENEMY_TRAIT_NOTE, TIER_INFO, tierKey, type ChapterTier,
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
  /** 難易度の段（ふつう いがいは 上の帯に出す。勝利報酬の倍率） */
  tier?: ChapterTier;
  /** 脅威レベル（1以上なら 上の帯に「脅威 Lv.n」を出す。隠れた調整はしない） */
  threat?: number;
  /** 脅威レベルで 敵が強くなっている割合（%。帯の説明に出す） */
  threatPct?: number;
  /** 出撃の5枠（下のバーには これだけを出す。sim の表にも これだけを入れる＝5枠の外は出せない） */
  formation: string[];
  /** 発電所による 勝利の 💠 の上乗せ（0.1＝+10%） */
  creditBonus?: number;
  /** 施設の種類 → レベルの倍率（HP・こうげき。試合の前に決めて sim に渡す） */
  facilityMults?: Partial<Record<BuildingType, number>>;
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
  /**
   * 勝ち負けが決まった瞬間に1回だけ呼ぶ（勝ちの 💠・章の記録を ここで入れる。結果画面のまま 読みなおしても のこるように）。
   * 二重に入れない しくみは 呼ぶ側（utils/settleBattle.ts）。対戦（pvp）では 呼ばない。
   */
  onSettle?: (win: boolean, loot: { gold: number }, stars?: 1 | 2 | 3, quiz?: { answered: number; perfect: number }) => void;
  /**
   * 週がわりの遠征（CW-6a）：上の帯・はじめの説明・結果画面を 遠征の文にする。章の星・ボスの印には 数えない（収集の expedition）。
   * enemyLevel＝「てきの つよさ Lv.n」。resultExtra＝結果画面に足すもの（今週の自分の星・学級の合計）。
   */
  expedition?: {
    enemyLevel: number; ruleIcon: IconName; ruleName: string; resultExtra?: React.ReactNode;
    /**
     * なかまの 基地を 攻める（CW-6b）：同じ「特別な戦い」の 枠を 文だけ かえて つかう。
     * label＝上の帯の 名前（既定「遠征」）・kicker＝はじめの説明の 小さな字・winLabel＝勝ったときの 小さな字・loseNote＝負けたときの 1行・
     * hideBoss＝章のボスの 絵を 出さない・loot＝勝ちの 💠（章の ごほうびの かわり。その日 1回目だけ など）
     */
    label?: string; kicker?: string; winLabel?: string; loseNote?: string; hideBoss?: boolean;
    loot?: (win: boolean, quiz: { answered: number; perfect: number }) => number;
  };
  /** 試合の前に SimConfig を書きかえる（遠征のルール。sim の外で1回だけ。決定的な関数を わたす） */
  tuneConfig?: (cfg: SimConfig) => SimConfig;
  /** 結果画面のボタン・退却（画面を閉じる）。stars＝勝ったときの星（1〜3。まちがえずに解けた割合で決まる） */
  onEndBattle: (win: boolean, loot: { gold: number }, stars?: 1 | 2 | 3) => void;
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
  tier = 'normal',
  threat = 0,
  threatPct = 0,
  formation,
  facilityMults = {},
  creditBonus = 0,
  quizSubtopics = [],
  pvp,
  onSettle,
  onEndBattle,
  expedition,
  tuneConfig,
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
  /** この戦闘で解いた問題の数・うち まちがえずに解けた数（星と結果の画面に使う） */
  const quizStatsRef = useRef({ answered: 0, perfect: 0 });
  // ── 図鑑（CW-4c）：見た敵・たおした敵を 盤上の出入りから拾う（sim の外。sim には手を入れない）──
  const dexSeenRef = useRef<Set<string>>(new Set(isPvp || expedition ? [] : [bossDexKey(chapter.id)]));
  const dexAliveRef = useRef<Map<string, { key: string; x: number; y: number; kamikaze: boolean }>>(new Map());
  const dexDefeatedRef = useRef<Record<string, number>>({});
  const shieldsBrokenRef = useRef(0);
  const coinsAtStartRef = useRef(useCollectionStore.getState().coinsTotal);
  const [gains, setGains] = useState<Gains | null>(null);
  const [triggerMessage, setTriggerMessage] = useState<string | null>(null);
  const [damagedEntities, setDamagedEntities] = useState<Set<string>>(new Set());
  const [projectiles, setProjectiles] = useState<{ id: string; fromX: number; fromY: number; toX: number; toY: number; startedAt: number; duration: number; type: 'CANNON' | 'TESLA' }[]>([]);
  const [hitFx, setHitFx] = useState<{ id: string; x: number; y: number; fromX: number; fromY: number; kind: 'SLASH' | 'BOLT' | 'SHOCK'; color: string; startedAt: number; duration: number }[]>([]);
  const [levelUps, setLevelUps] = useState<import('../../store/useArmyStore').LevelUpEvent[]>([]);
  const [, forceRender] = useState(0);

  const { getTodayBuffs } = useProgressStore();
  const { getStage, getLevel, grantBattleXp } = useArmyStore();
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
    const levels: Record<string, number> = {};
    for (const c of CHARACTERS) levels[c.id] = getLevel(c.id);
    // スキル：かけらで開いているものを 試合開始時に決めて sim に焼きこむ（戦闘中に開いても この試合には効かない）
    const skills: Record<string, string[]> = {};
    for (const id of formation) skills[id] = familySkillIds(id);

    const built = buildSimConfig({
      mode: 'PVE',
      // ソロプレイなので seed はローカルで決めてよい。
      // PvP ではサーバー（RTDBのserverTimestamp由来）が確定させた値を使う
      // ——クライアントが選べると有利な乱数を引くまで作り直せてしまうため。
      seed: (Date.now() ^ (Math.random() * 0xffffffff)) >>> 0,
      chapter, difficulty, battleMap: battleMap ?? null,
      p1: { levels, buffs: { values }, formation, skills },
    });
    const cfg = tuneConfig ? tuneConfig(built) : built;
    runnerRef.current = new SimRunner(cfg, {
      defenderBuildings: defenderBuildings.map(b => ({ type: b.type, x: b.x, y: b.y })),
      playerBuildings: playerDeployments.map(b => ({ type: b.type, x: b.x, y: b.y, mult: facilityMults[b.type] ?? 1 })),
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
  /** いま盤上にいる敵の シールドの合計（ふくしゅうカードを出す） */
  const shieldLayers = entities.reduce((a, e) => a + (e.team === 'DEFENDER' ? (e.shield ?? 0) : 0), 0);
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

  // 下のバーは 出撃の5枠だけ（えらんだ順）
  const availableTroops: Troop[] = useMemo(() => formation
    .map(id => CHARACTER_BY_ID[id]).filter((c): c is NonNullable<typeof c> => !!c)
    .map(c => ({
      id: c.id, name: c.forms[0].name, count: 1,
      damage: c.base.damage, hp: c.base.hp, target: c.base.target, moveSpeed: c.base.moveSpeed,
    })), [formation]);

  // 下の操作の列の高さ（問題カードの手札を その上に のせる。見た目だけ）
  const rootRef = useRef<HTMLDivElement | null>(null);
  const hotbarRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const bar = hotbarRef.current, root = rootRef.current;
    if (!bar || !root) return;
    const set = () => root.style.setProperty('--cw-hotbar-h', `${Math.round(bar.getBoundingClientRect().height)}px`);
    set();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(set);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

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

  /**
   * 図鑑のために 敵の兵の出入りを見る（見た目の側だけ。sim の状態は読むだけ）。
   * 盤上から消えた兵は「たおした」。自爆ロボが 施設のそばで消えたときは 自分で ばくはつした ので 数えない。
   */
  const trackEnemies = (ents: BattleEntity[]) => {
    const alive = dexAliveRef.current;
    const now = new Set<string>();
    for (const e of ents) {
      if (e.team !== 'DEFENDER' || e.type !== 'TROOP' || !e.kind) continue;
      now.add(e.id);
      const key = unitDexKey(e.kind);
      if (!alive.has(e.id)) dexSeenRef.current.add(key);
      alive.set(e.id, { key, x: e.x, y: e.y, kamikaze: e.kind === 'kamikaze' });
    }
    for (const [id, v] of alive) {
      if (now.has(id)) continue;
      alive.delete(id);
      if (v.kamikaze && ents.some(b => b.type === 'BUILDING' && b.team === 'ATTACKER_BUILDING' && Math.hypot(b.x - v.x, b.y - v.y) <= 1.8)) continue;
      dexDefeatedRef.current[v.key] = (dexDefeatedRef.current[v.key] ?? 0) + 1;
    }
  };

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
        if (res.ticks > 0 && !session) trackEnemies(r.state.entities);
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

  /** 勝ったときの 💠（章・段・きょうの「💠 2ばい」・発電所） */
  const lootFor = (win: boolean): number => {
    if (!win) return 0;
    if (expedition?.loot) return Math.max(0, Math.round(expedition.loot(win, quizStatsRef.current)));
    const lootMult = hasBuff('DOUBLE_LOOT') ? 1 + buffVal('DOUBLE_LOOT') / 100 : 1;
    return Math.round(chapter.rewardCredits * TIER_INFO[tier].rewardMult * lootMult * (1 + creditBonus));
  };
  /** 勝ち負けが決まったときに入れた 💠 と ★（結果画面は これを出す） */
  const [settled, setSettled] = useState<{ gold: number; stars?: 1 | 2 | 3 } | null>(null);

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
    // 収集（CW-4c）：図鑑・章の星・げきむず パーフェクト → バッジ・ネコの図鑑を決めなおす → 結果画面に「あたらしく 手に入れたもの」
    if (!isPvp) {
      try {
        const win = battleResult === 'WIN';
        const { answered, perfect } = quizStatsRef.current;
        const k = tierKey(chapter.id, tier);
        const prevStars = expedition ? 0 : useCampaignStore.getState().stars[k] ?? 0;
        const stars = win ? starsFor(answered, perfect) : undefined;
        const col = useCollectionStore.getState();
        const rb = col.recordBattle({
          chapterId: chapter.id, tier, win, stars, prevStars, answered, perfect,
          shields: shieldsBrokenRef.current, seen: [...dexSeenRef.current], defeated: { ...dexDefeatedRef.current },
          expedition: !!expedition,
        });
        const rf = refreshCollection(!expedition && win && stars && stars > prevStars ? { [k]: stars } : undefined);
        const after = useCollectionStore.getState();
        const badges = Object.entries(after.badges).filter(([id, t]) => t > (after.badgesSeen[id] ?? 0)).map(([id, t]) => ({ id, tier: t }));
        after.markBadgesSeen(badges.map(b => b.id));
        setGains({ coins: after.coinsTotal - coinsAtStartRef.current, badges, dex: [...rb.newDex, ...rf.cats] });
      } catch { /* 収集の記録で 戦いの結果を止めない */ }
      // 勝ちの 💠・章の記録（クリア・★・連敗）も ここで入れる（ボタンを待たない）。★の前の値を 収集が読んだあと
      const win = battleResult === 'WIN';
      const r = { gold: lootFor(win), stars: win ? starsFor(quizStatsRef.current.answered, quizStatsRef.current.perfect) : undefined };
      setSettled(r);
      onSettle?.(win, { gold: r.gold }, r.stars, { ...quizStatsRef.current });
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

  // 開発のときだけ：画面の確かめ（Playwright）で 結果画面を出す。__cwEndBattle(true)＝勝ち・false＝負け（本番のビルドには入らない）
  useEffect(() => {
    if (!import.meta.env.DEV || isPvp) return;
    const w = window as unknown as { __cwEndBattle?: (win: boolean) => void };
    w.__cwEndBattle = (win: boolean) => issue({ type: 'SURRENDER', player: win ? 'P2' : localPlayer });
    return () => { delete w.__cwEndBattle; };
  }, [issue, isPvp, localPlayer]);

  const handleGridClick = (x: number, y: number) => {
    const r = runnerRef.current!;
    if (r.state.result) return;

    if (buildMode !== null) {
      const cost = IN_BATTLE_BUILD_COSTS[buildMode] ?? 999;
      if (Math.floor(gold) < cost) { showMessage('エナジーがたりない！', 1400); setBuildMode(null); return; }
      if (!canDeployAt(r.state, r.statics, localPlayer, x, y)) {
        showMessage('ここには たてられない！ コアの ちかくに おこう', 1600); setBuildMode(null); return;
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
      showMessage('ここには 出せないよ！ コアや キャンプの ちかくから 出そう', 1800);
      return;
    }
    const line = r.cfg.unitStats[localPlayer][selectedTroopId];
    if (line && gold < Math.round(line.cost * r.cfg.costMult[localPlayer])) {
      showMessage('エナジーが たりない！ 問題カードを といて ためよう', 1600);
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


  const buildingAccentColor: Record<string, string> = {
    TOWN_HALL: 'rgba(250,204,21,0.25)',
    WALL: 'rgba(148,163,184,0.2)',
    CANNON: 'rgba(239,68,68,0.25)',
    ARMY_CAMP: 'rgba(34,197,94,0.2)',
    GOLD_MINE: 'rgba(250,204,21,0.2)',
    HIDDEN_TESLA: 'rgba(34,211,238,0.2)',
  };

  return (
    <div ref={rootRef} className="cw-screen relative w-full min-h-[100dvh] h-[100dvh] flex flex-col overflow-hidden" style={{ background: 'var(--cw-bg-0)' }}>
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
         @keyframes cw-shield-glow {
           0%, 100% { box-shadow: 0 0 10px rgba(103,232,249,0.6); }
           50% { box-shadow: 0 0 22px rgba(103,232,249,1); }
         }
         @keyframes cw-shield-ring {
           0%, 100% { opacity: 0.7; transform: scale(1); }
           50% { opacity: 1; transform: scale(1.06); }
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

       {/* 上の帯：章・段・脅威・⚡・たいきゃく */}
       <TitleBar
         title={expedition ? <span className="inline-flex items-center gap-2"><Icon name={expedition.ruleIcon} size={28} />{expedition.label ?? '遠征'}</span> : `第${chapter.no}章`}
         subtitle={chapter.title}
         className="!z-50"
         data-testid="battle-topbar"
         right={<>
           {tier !== 'normal' && <Chip tone={tier === 'hard' ? 'rare' : 'danger'}>{TIER_INFO[tier].label}</Chip>}
           {expedition && (
             <span data-testid="expedition-enemy-level" title="てきの つよさは きみの ネコの レベルに あわせて きまるよ">
               <Chip tone="danger">てき Lv.{expedition.enemyLevel}</Chip>
             </span>
           )}
           {threat >= 1 && (
             <span title={`手持ちが育っているぶん、敵も強くなっているよ（+${threatPct}%）`}>
               <Chip tone="danger"><Icon name="warn" size={16} />脅威 Lv.{threat}</Chip>
             </span>
           )}
           {assistLevel > 0 && <Chip tone="growth">{ASSIST_LEVELS[assistLevel].label}</Chip>}
           {selectedSpell && <Chip tone="action">まほうを おく 場所を タップ</Chip>}
           <StatPill icon="energy" value={Math.floor(gold)} label="エナジー" data-testid="energy" />
           <Button variant="secondary" size="sm" onClick={() => onEndBattle(false, { gold: 0 })}>
             たいきゃく する
           </Button>
         </>}
       />

       {/* 問題カード（戦闘の主役の操作）。エナジーは自動ではたまらず、カードを解いて手に入れる。
           解いている間は戦闘を止める（対戦のときは止めない）。 */}
       {quizSubtopics.length > 0 && !battleResult && !briefingOpen && (
         <ProblemCards
           unitKeys={quizSubtopics}
           baseReward={Math.round(QUIZ_BASE_REWARD * (1 + (isPvp ? 0 : buffVal('GOLD_BOOST')) / 100))}
           poor={Math.floor(gold) < runner.cfg.minTroopCost[localPlayer]}
           onOpenChange={(open) => { setQuizOpen(open); setBattlePaused(open); }}
           onReward={(en) => issue({ type: 'GRANT_ENERGY', player: localPlayer, amount: en })}
           onAnswered={(item, perfect) => {
             quizStatsRef.current.answered += 1;
             if (perfect) quizStatsRef.current.perfect += 1;
             grantStudyReward(perfect, item, formation);
           }}
           shieldLayers={shieldLayers}
           onShieldBreak={() => { shieldsBrokenRef.current += 1; issue({ type: 'BREAK_SHIELD', player: localPlayer }); }}
           cardLimit={isPvp ? null : cardLimitFor(chapter, tier, assistLevel)}
         />
       )}

       {/* 戦闘中の ひとこと通知 */}
       {triggerMessage && (
         <div role="status" className="cw-panel cw-panel-strong cw-enter absolute top-[76px] left-1/2 -translate-x-1/2 z-50 text-cw-14 font-bold py-2 px-5 rounded-cw-pill max-w-[92vw] text-center"
           style={{ color: 'var(--cw-fg)', boxShadow: 'var(--cw-shadow-panel), var(--cw-lit-reward)' }}>
           {triggerMessage}
         </div>
       )}

       {/* ── 通信状態の表示（PvPのみ）──
           ロックステップは相手待ちで画面が止まる。無言のフリーズは
           いちばん悪い体験なので、何が起きているかを必ず言葉で出す。 */}
       {isPvp && netStatusRef.current.kind !== 'RUNNING' && (
         <div className="absolute inset-0 z-[200] flex items-center justify-center p-4" style={{ background: 'rgba(6,10,28,0.78)' }}>
           <Panel strong className="text-center max-w-sm w-full" style={{ boxShadow: `var(--cw-shadow-panel), ${netStatusRef.current.kind === 'WAITING' ? 'var(--cw-lit-reward)' : 'var(--cw-lit-danger)'}` }}>
             {netStatusRef.current.kind === 'WAITING' && (
               <>
                 <div className="text-cw-20 font-extrabold mb-1" style={{ color: 'var(--cw-reward)' }}>あいてを まっています…</div>
                 <div className="text-cw-14" style={{ color: 'var(--cw-fg-2)' }}>
                   つうしんが すこし おそいみたい。そのまま まってね
                   （{Math.round(netStatusRef.current.waitingMs / 1000)}びょう）
                 </div>
               </>
             )}
             {netStatusRef.current.kind === 'DROPPED' && (
               <>
                 <div className="text-cw-20 font-extrabold mb-1" style={{ color: 'var(--cw-danger)' }}>あいてと せつだんされました</div>
                 <div className="text-cw-14 mb-4" style={{ color: 'var(--cw-fg-2)' }}>
                   あいての つうしんが とぎれたため、この しょうぶは ここまでです。
                 </div>
                 <Button size="md" onClick={() => onEndBattle(true, { gold: 0 })}>もどる</Button>
               </>
             )}
             {netStatusRef.current.kind === 'DESYNC' && (
               <>
                 <div className="text-cw-20 font-extrabold mb-1" style={{ color: 'var(--cw-danger)' }}>しあいを ちゅうだんしました</div>
                 <div className="text-cw-14 mb-4" style={{ color: 'var(--cw-fg-2)' }}>
                   ふたりの がめんで ちがう けっかに なってしまったため、
                   ひきわけで しゅうりょうします。（tick {netStatusRef.current.tick}）
                 </div>
                 <Button size="md" onClick={() => onEndBattle(false, { gold: 0 })}>もどる</Button>
               </>
             )}
           </Panel>
         </div>
       )}

       {/* Battle Stage */}
       <div
         className="flex-1 relative overflow-hidden flex items-center justify-center"
         style={{
           backgroundImage: 'radial-gradient(1px 1px at 20% 30%, rgba(255,255,255,0.6) 0, transparent 100%), radial-gradient(1px 1px at 70% 60%, rgba(255,255,255,0.5) 0, transparent 100%), radial-gradient(1px 1px at 40% 80%, rgba(34,211,238,0.5) 0, transparent 100%), radial-gradient(1.5px 1.5px at 85% 20%, rgba(168,85,247,0.5) 0, transparent 100%)',
           backgroundColor: 'var(--cw-bg-1)',
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
                <span className="text-cw-12 font-black flex items-center gap-1 rounded-cw-pill px-2" style={{ background: 'var(--cw-surface-strong)', color: s.type === 'HEAL' ? 'var(--cw-growth)' : 'var(--cw-cat)' }}>
                  <Icon name={s.type === 'HEAL' ? 'heal' : 'rage'} size={16} />{s.type === 'HEAL' ? 'かいふく' : 'げきおこ'}
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
                // 絵の表示だけ 大きくする（sim の座標・当たり・箱の大きさは そのまま）。小さい子ほど 大きく（さいだい ×1.6。体が 58px 以上の子は そのまま）
                const spriteScale = e.type === 'TROOP' ? Math.max(1, Math.min(1.6, 58 / width)) : 1;
                const lift = Math.round((spriteScale - 1) * height * 0.62);

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
                              <span aria-label="活性中" className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full" style={{ background: 'var(--cw-action)', boxShadow: '0 0 8px var(--cw-action)' }} />
                            )}
                          </div>
                        ) : (
                          <div className="relative w-full h-full flex items-center justify-center"
                            style={spriteScale > 1 ? { transform: `scale(${spriteScale})`, transformOrigin: '50% 72%' } : undefined}>
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
                              // 章の敵の兵は 種類ごとの絵（`data/enemySprites.ts`。もとから左むき）
                              const enemyImg = e.team === 'DEFENDER' ? enemyUnitSprite(e.kind) : undefined;
                              if (enemyImg) {
                                return (
                                  <img
                                    src={enemyImg}
                                    alt={e.kind}
                                    data-enemy-kind={e.kind}
                                    style={{
                                      width: '100%', height: '100%',
                                      objectFit: 'contain',
                                      filter: 'drop-shadow(0 0 3px rgba(239,68,68,0.8))',
                                    }}
                                    draggable={false}
                                  />
                                );
                              }
                              // 攻撃側は自軍の進化段階、敵側（対戦の相手のネコ）は段階1で描画
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

                          </div>
                        )}

                        {/* HPバー・しるし：拡大した絵の 上にそろえる（箱は 動かさない） */}
                        <div className="absolute left-0 w-full pointer-events-none" style={{ top: -lift, height: 0 }}>
                          <div className="absolute -top-4 left-0 w-full h-1.5 rounded-full overflow-hidden"
                            style={{ background: 'rgba(6,10,28,0.85)', boxShadow: '0 0 0 1px rgba(6,10,28,0.9)' }}>
                            <div
                              className="h-full transition-all duration-150"
                              style={{
                                width: `${(e.hp / e.maxHp) * 100}%`,
                                background: e.team === 'DEFENDER' ? 'var(--cw-danger)' : 'var(--cw-growth)',
                                boxShadow: e.team === 'DEFENDER' ? '0 0 4px var(--cw-danger)' : '0 0 4px var(--cw-growth)',
                              }}
                            ></div>
                          </div>
                          {/* 特別な敵のしるし（空中・盾持ち・回復役・自爆）。たおし方は ステージえらびの画面に出している */}
                          {e.team === 'DEFENDER' && e.kind && ENEMY_TRAIT_NOTE[e.kind as EnemyUnitKind] && (
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-[16px] leading-none select-none"
                              style={{ filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))' }}>
                              {ENEMY_TRAIT_NOTE[e.kind as EnemyUnitKind]!.icon}
                            </div>
                          )}
                          {/* ボスのシールド（ふくしゅうカードを といて わる） */}
                          {e.team === 'DEFENDER' && (e.shield ?? 0) > 0 && (
                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 text-cw-12 font-black px-2 py-0.5 rounded-cw-pill whitespace-nowrap"
                              style={{ background: 'var(--cw-surface-strong)', boxShadow: '0 0 0 1px var(--cw-action)', color: 'var(--cw-action)' }}>
                              シールド×{e.shield}
                            </div>
                          )}
                          {e.team === 'ATTACKER' && (tempRank[e.subType] ?? 0) > 0 && (
                            <div className="absolute -top-8 left-1/2 -translate-x-1/2 text-cw-12 font-black px-2 py-0.5 rounded-cw-pill whitespace-nowrap font-cw-num"
                              style={{ background: 'var(--cw-surface-strong)', boxShadow: '0 0 0 1px var(--cw-reward)', color: 'var(--cw-reward)' }}>
                              強化+{tempRank[e.subType]}
                            </div>
                          )}
                        </div>
                        {/* ボスのシールドの輪（ふくしゅうカードを といて わる） */}
                        {e.team === 'DEFENDER' && (e.shield ?? 0) > 0 && (
                          <div className="absolute rounded-full pointer-events-none"
                            style={{
                              inset: -8, border: '3px solid rgba(103,232,249,0.9)',
                              boxShadow: '0 0 14px rgba(103,232,249,0.85), inset 0 0 10px rgba(103,232,249,0.5)',
                              animation: 'cw-shield-ring 1.4s ease-in-out infinite',
                            }} />
                        )}
                    </div>
                );
            })}
            
            {/* Spawn Ground Overlay */}
            {!battleStarted && (
               <div className="absolute inset-0 pointer-events-none flex items-center justify-center iso-item" style={{ border: '3px dashed rgba(110,231,183,0.45)' }}>
                  <span className="cw-panel cw-panel-strong text-cw-16 font-bold py-3 px-6 rounded-cw-pill " style={{ color: 'var(--cw-fg)', boxShadow: 'var(--cw-shadow-panel), var(--cw-lit-growth)' }}>
                     自分の じんち（すなの ところ）を タップして、ネコや まほうを 出そう
                  </span>
               </div>
            )}
          </div>
        </PinchZoomLayer>
       </div>

       {/* ネコへの めいれい（ネコを タップすると 出る。ひろげた 盤面の外に 出して、的を 48px に保つ） */}
       {selectedOrderTroopId && (() => {
         const ent = entities.find(x => x.id === selectedOrderTroopId && x.type === 'TROOP');
         if (!ent) return null;
         const fam = CHARACTER_BY_ID[ent.subType];
         const nm = fam ? fam.forms[Math.max(0, getStage(ent.subType) - 1)]?.name ?? fam.displayName : '';
         return (
           <Panel strong pad={false} className="absolute z-[90] px-3 py-2 flex flex-col items-center gap-1.5 cw-enter" data-testid="order-menu"
             style={{ top: 124, maxWidth: '96vw', ...(ent.x > GRID_W / 2 ? { left: 12 } : { right: 72 }) }}>
             <span className="text-cw-12 font-bold" style={{ color: 'var(--cw-fg-2)' }}>{nm} への めいれい ・ 行き先か 敵を タップでも OK</span>
             <div className="flex gap-2">
               {(
                 [
                   { order: 'RUSH' as const, label: 'とつげき', tone: 'danger' },
                   { order: 'DEFENSE' as const, label: 'まもる', tone: 'action' },
                   { order: 'HOLD' as const, label: 'たいき', tone: 'neutral' },
                 ] as { order: 'RUSH' | 'DEFENSE' | 'HOLD'; label: string; tone: string }[]
               ).map(({ order, label, tone }) => (
                 <button key={order} type="button"
                   onClick={() => {
                     issue({ type: 'SET_ORDER', player: localPlayer, entityId: selectedOrderTroopId, order });
                     setSelectedOrderTroopId(null);
                   }}
                   className={`cw-btn cw-press cw-btn-secondary cw-tone-${tone} min-h-[48px] min-w-[80px] px-3 text-cw-14`}
                   style={{ color: tone === 'neutral' ? 'var(--cw-fg)' : 'var(--tone)', whiteSpace: 'nowrap', boxShadow: 'var(--tone-lit)' }}>
                   {label}
                 </button>
               ))}
               <button type="button" onClick={() => setSelectedOrderTroopId(null)} aria-label="めいれいを とじる"
                 className="cw-btn cw-press cw-btn-ghost min-h-[48px] min-w-[48px] px-3 text-cw-14 whitespace-nowrap">とじる</button>
             </div>
           </Panel>
         );
       })()}

       {/* Result Modal display */}
       {battleResult && (() => {
         const win = battleResult === 'WIN';
         // 戦利品は章ごとに設定（難しい章ほど多い）。勝ち負けが決まったときに もう入れてある（settled）
         const loot = { gold: settled ? settled.gold : lootFor(win) };
         const winStars = settled?.stars ?? starsFor(quizStatsRef.current.answered, quizStatsRef.current.perfect);
         // fixed + z-[160] にして、下部のキャラ出撃バー(z-50)より確実に手前へ出す。
         // 以前は両方 z-50 の兄弟要素で、DOM順が後のバーがリザルトを覆っていた。
         return (
         <div className="fixed inset-0 z-[160] flex flex-col items-center justify-center p-4 cw-enter" data-testid="battle-result" style={{ background: 'rgba(6,10,28,0.88)' }}>
            {win ? (
               <Panel strong pad={false} className="cw-reward-pop text-center max-w-md w-full max-h-[94dvh] flex flex-col" style={{ boxShadow: 'var(--cw-shadow-panel), var(--cw-lit-reward)' }}>
                 <div className="min-h-0 flex-1 overflow-y-auto cw-scroll p-5 pb-3">
                   <div className="flex items-center justify-center gap-2 mb-1" style={{ color: 'var(--cw-reward)' }}>
                     <Icon name="crown" size={36} />
                     <span className="text-cw-14 font-extrabold">
                       {expedition ? (expedition.winLabel ?? '遠征 せいこう！') : `だい${chapter.no}しょう クリア！`}
                     </span>
                   </div>
                   <h2 className="text-cw-28 font-extrabold mb-3 leading-tight" style={{ color: 'var(--cw-fg)' }}>{chapter.title}</h2>
                   <QuizSummary answered={quizStatsRef.current.answered} perfect={quizStatsRef.current.perfect} win />
                   {loot.gold > 0 && (
                     <div className="flex items-center justify-center gap-2 mb-3" data-testid="result-loot" aria-label={`クレジット ${loot.gold}`}>
                       <Icon name="credit" size={44} />
                       <span className="font-cw-num font-black text-cw-40" style={{ color: 'var(--cw-reward)' }}>+{loot.gold}</span>
                       {hasBuff('DOUBLE_LOOT') && <Chip tone="reward">アップ！</Chip>}
                     </div>
                   )}
                   <div className="flex items-center gap-3 mb-3 text-left">
                     {!isPvp && !expedition?.hideBoss && bossSprite(chapter.id) && (
                       <img src={bossSprite(chapter.id)} alt={chapter.enemyName} draggable={false} data-testid="result-boss"
                         style={{ width: 52, height: 52, objectFit: 'contain', flexShrink: 0, opacity: 0.9 }} />
                     )}
                     <p className="text-cw-14 leading-relaxed" style={{ color: 'var(--cw-fg-2)' }}>{chapter.victoryLine}</p>
                   </div>
                   {expedition?.resultExtra}
                   <GainsSummary gains={gains} />
                   <NewSkillNotice />
                   <LevelUpSummary events={levelUps} />
                 </div>
                 <div className="p-4 pt-2" style={{ boxShadow: 'inset 0 1px 0 var(--cw-line)' }}>
                   <Button variant="reward" size="xl" fullWidth onClick={() => onEndBattle(true, loot, winStars)}>
                     {loot.gold <= 0 ? '基地へ もどる'
                       : settled ? `基地へ もどる（💠${loot.gold} ゲット！${hasBuff('DOUBLE_LOOT') ? ' アップ！' : ''}）` : `ごほうびを もらって かえる（💠${loot.gold}）${hasBuff('DOUBLE_LOOT') ? ' アップ！' : ''}`}
                   </Button>
                 </div>
               </Panel>
            ) : (
               <Panel strong pad={false} className="text-center max-w-md w-full max-h-[94dvh] flex flex-col">
                 <div className="min-h-0 flex-1 overflow-y-auto cw-scroll p-5 pb-3">
                   <div className="flex justify-center mb-1"><Icon name="cats" size={56} /></div>
                   <h2 className="text-cw-28 font-extrabold mb-2" style={{ color: 'var(--cw-fg)' }}>たいきゃく...</h2>
                   <p className="text-cw-14 mb-2 leading-relaxed" style={{ color: 'var(--cw-fg-2)' }}>{chapter.defeatLine}</p>
                   <p className="text-cw-14 mb-3 leading-relaxed" style={{ color: 'var(--cw-action)' }}>
                     <Icon name="bulb" size={20} className="inline-block align-[-4px] mr-1" />{chapter.hint}
                   </p>
                   {/* 連敗時は次回サポートが入ることを先に伝える（隠れた調整はしない） */}
                   <div className="text-cw-14 mb-3 leading-relaxed" style={{ color: 'var(--cw-growth)' }}>
                     {expedition
                       ? (expedition.loseNote ?? 'まけても ネコたちの けいけんちは 手に入るよ。遠征は 今週 なんかいでも ちょうせん できる。いちばん よい 星が のこるよ！')
                       : 'まけても ネコたちの けいけんちは 手に入るよ。何回か まけると「サポートモード」で やさしく なるので、あきらめずに もう一回！'}
                   </div>
                   <QuizSummary answered={quizStatsRef.current.answered} perfect={quizStatsRef.current.perfect} />
                   {expedition?.resultExtra}
                   <GainsSummary gains={gains} />
                   <NewSkillNotice />
                   <LevelUpSummary events={levelUps} />
                 </div>
                 <div className="p-4 pt-2" style={{ boxShadow: 'inset 0 1px 0 var(--cw-line)' }}>
                   <Button variant="secondary" size="xl" fullWidth onClick={() => onEndBattle(false, { gold: 0 })}>
                     基地へ もどる
                   </Button>
                 </div>
               </Panel>
            )}
         </div>
         );
       })()}

       {/* 下の操作の列：まほう・たてる（上の段）／出撃するネコ（下の段）。的は 48px いじょう */}
       {/* iPad 横向きでは画面の高さが限られるため、2段にまとめている */}
       <div ref={hotbarRef} className="px-3 py-2 z-50 relative flex flex-col gap-2 flex-shrink-0" data-testid="battle-hotbar"
         style={{ background: 'var(--cw-surface-strong)', WebkitBackdropFilter: 'blur(14px)', backdropFilter: 'blur(14px)', boxShadow: 'inset 0 1px 0 var(--cw-line-strong), inset 0 2px 0 var(--cw-top-light)' }}>
         {/* 上の段：魔法（えらぶ・ふやす） */}
         <div className="flex gap-2 items-center justify-center flex-wrap">
           {([
             { id: 'HEAL' as const, label: 'かいふく', icon: 'heal' as const, tone: 'growth', cost: 60 },
             { id: 'RAGE' as const, label: 'げきおこ', icon: 'rage' as const, tone: 'cat', cost: 80 },
           ]).map(sp => {
             const sel = selectedSpell === sp.id;
             const none = spellCounts[sp.id] <= 0;
             return (
               <React.Fragment key={sp.id}>
                 <button type="button" aria-pressed={sel} aria-disabled={none || undefined} disabled={none}
                   onClick={() => { setSelectedSpell(sp.id); setSelectedTroopId(null); }}
                   className={`cw-btn cw-press cw-btn-secondary cw-tone-${sp.tone} min-h-[48px] px-2.5 !gap-1.5 text-cw-14`}
                   style={sel ? { background: 'var(--tone-bg)', boxShadow: 'var(--tone-lit)' } : undefined}>
                   <Icon name={sp.icon} size={26} />
                   <span>{sp.label}</span>
                   <span className="font-cw-num text-cw-12" style={{ color: none ? undefined : 'var(--cw-fg-2)' }}>のこり {spellCounts[sp.id]}</span>
                 </button>
                 <button type="button" disabled={gold < sp.cost} aria-label={`${sp.label}を ふやす（${sp.cost}エナジー）`}
                   onClick={() => issue({ type: 'BUY_SPELL', player: localPlayer, spell: sp.id })}
                   className="cw-btn cw-press cw-btn-secondary min-h-[48px] px-2 !gap-1 text-cw-14">
                   <span aria-hidden>＋</span><span className="font-cw-num">{sp.cost}</span><Icon name="energy" size={18} />
                 </button>
               </React.Fragment>
             );
           })}

         </div>
         {buildMode && (
           <span role="status" className="cw-panel cw-panel-strong absolute -top-12 left-1/2 -translate-x-1/2 text-cw-14 font-bold px-4 py-2 rounded-cw-pill whitespace-nowrap"
             style={{ color: 'var(--cw-action)', boxShadow: 'var(--cw-shadow-panel), var(--cw-lit-action)' }}>
             配置する場所を タップ
           </span>
         )}

         {/* 下の段：出撃（えらんだ5枠・エナジーで出す）+ 一時ランクアップ + たてる */}
         <div className="relative flex flex-wrap items-center gap-2 px-1" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 4px)' }}>
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
               const sel = selectedTroopId === troop.id;
               return (
                  <button
                    key={troop.id}
                    type="button"
                    aria-pressed={sel}
                    aria-disabled={!affordable || undefined}
                    data-troop={troop.id}
                    onClick={() => {
                      setSelectedTroopId(troop.id);
                      setSelectedSpell(null);
                    }}
                    className={`cw-card cw-press cw-tone-cat flex-shrink-0 relative w-[96px] min-h-[76px] flex flex-col items-center justify-center gap-0.5 px-1 py-1 ${sel ? 'cw-card-on' : ''}`}
                    style={sel ? { background: 'var(--tone-bg)' } : undefined}
                  >
                     <img src={sprite} alt={troop.id}
                       style={{ width: 34, height: 34, objectFit: 'contain', imageRendering: 'crisp-edges' }}
                       draggable={false} />
                     <span className="text-cw-12 font-bold leading-none truncate w-full text-center" style={{ color: affordable ? 'var(--cw-fg)' : 'var(--cw-fg-3)' }}>{formName}</span>
                     <span className="flex items-center gap-0.5 font-cw-num text-cw-12 font-black leading-none" style={{ color: affordable ? 'var(--cw-reward)' : 'var(--cw-fg-3)' }}>
                       {cost}<Icon name="energy" size={14} />
                     </span>
                     {tr > 0 && (
                       <span className="absolute top-1 left-1 text-cw-12 font-black px-1.5 py-0.5 rounded-cw-pill font-cw-num leading-[16px]" style={{ background: 'var(--cw-reward)', color: 'var(--cw-on-color)' }}>+{tr}</span>
                     )}
                     {(baseStage > 1) && (
                       <span className="absolute top-1 right-1 text-cw-12 font-black px-1.5 py-0.5 rounded-cw-pill leading-[16px] whitespace-nowrap"
                         style={{ background: 'var(--cw-surface-strong)', color: fam?.accent ?? 'var(--cw-reward)', boxShadow: `inset 0 0 0 1px ${fam?.accent ?? 'var(--cw-reward)'}` }}>
                         進化{baseStage}
                       </span>
                     )}
                     {cdLeft > 0 && (
                       <div className="absolute inset-0 rounded-cw-md flex items-center justify-center" style={{ background: 'rgba(6,10,28,0.7)' }}>
                         <span className="font-cw-num text-cw-14 font-bold" style={{ color: 'var(--cw-fg)' }}>{(cdLeft/1000).toFixed(1)}</span>
                       </div>
                     )}
                  </button>
               );
            })}

            {/* 一時ランクアップ（選択中の兵種をエナジーで強化） */}
            {selectedTroopId && (() => {
              const fam = CHARACTER_BY_ID[selectedTroopId];
              if (!fam) return null;
              const rankCost = Math.round((runner.cfg.unitStats[localPlayer][selectedTroopId]?.cost ?? fam.cost.gold) * 3);
              const can = Math.floor(gold) >= rankCost;
              return (
                <button
                  type="button"
                  onClick={() => {
                    if (Math.floor(gold) < rankCost) return;
                    issue({ type: 'BUY_RANK', player: localPlayer, troopId: selectedTroopId });
                    sfx.correct();
                  }}
                  disabled={!can}
                  className="cw-btn cw-press cw-btn-secondary cw-tone-growth flex-shrink-0 flex-col !gap-0.5 w-[96px] min-h-[76px] px-1"
                  style={can ? { boxShadow: 'var(--tone-lit)', background: 'var(--tone-bg)' } : undefined}
                >
                  <Icon name="buff" size={28} />
                  <span className="text-cw-12 font-bold leading-none">強化</span>
                  <span className="flex items-center gap-0.5 font-cw-num text-cw-12 font-black leading-none">{rankCost}<Icon name="energy" size={14} /></span>
                </button>
              );
            })()}

            {/* 建設（旧・独立した行を、この行に統合） */}
           <span aria-hidden className="w-px h-10 mx-1" style={{ background: 'var(--cw-line-strong)' }} />
           <span className="text-cw-12 font-bold" style={{ color: 'var(--cw-fg-3)' }}>たてる</span>
           {IN_BATTLE_BUILD_OPTIONS.map(type => {
             const bCost = IN_BATTLE_BUILD_COSTS[type] ?? 0;
             const canAfford = Math.floor(gold) >= bCost;
             const selected = buildMode === type;
             return (
               <button
                 key={type}
                 type="button"
                 aria-pressed={selected}
                 aria-label={`${BUILDING_STATS[type].name}を たてる（${bCost}エナジー）`}
                 onClick={() => {
                   setBuildMode(selected ? null : type);
                   setSelectedTroopId(null);
                   setSelectedSpell(null);
                 }}
                 disabled={!canAfford && !selected}
                 className="cw-btn cw-press cw-btn-secondary cw-tone-action min-h-[48px] px-2 !gap-1 text-cw-14"
                 style={selected ? { background: 'var(--tone-bg)', boxShadow: 'var(--tone-lit)' } : undefined}
               >
                 <FacilityImg type={type} size={30} style={!canAfford && !selected ? { filter: 'grayscale(1) brightness(.8)' } : undefined} />
                 <span className="font-cw-num">{bCost}</span><Icon name="energy" size={18} />
               </button>
             );
           })}
         </div>

       </div>

       {/* 開戦ブリーフィング（②: 戦いのタイトル・敵の背景・作戦の一言） */}
       {briefingOpen && (
         <div className="absolute inset-0 z-[130] flex items-center justify-center p-4"
           style={{ background: 'rgba(6,10,28,0.9)', WebkitBackdropFilter: 'blur(6px)', backdropFilter: 'blur(6px)' }}>
           <Panel strong pad={false} className="cw-enter w-full max-w-md max-h-[94dvh] flex flex-col" data-testid="briefing">
             <div className="min-h-0 flex-1 overflow-y-auto cw-scroll p-5 pb-3">
               <div className="font-cw-num text-cw-12 font-bold tracking-widest" style={{ color: 'var(--cw-action)' }}>
                 {expedition ? (expedition.kicker ?? 'WEEKLY EXPEDITION') : `CHAPTER ${chapter.no}`}
               </div>
               <h2 className="text-cw-28 font-extrabold mt-0.5 mb-3 leading-tight" style={{ color: 'var(--cw-fg)' }}>{chapter.title}</h2>

               <div className="cw-tone-danger flex items-start gap-3 p-3 rounded-cw-md mb-3" style={{ background: 'var(--tone-bg)', boxShadow: 'inset 0 0 0 1px var(--cw-line-strong)' }}>
                 {bossSprite(chapter.id) && !expedition?.hideBoss
                   ? <img src={bossSprite(chapter.id)} alt="" draggable={false} data-testid="briefing-boss"
                       style={{ width: 72, height: 72, objectFit: 'contain', flexShrink: 0, filter: 'drop-shadow(0 0 4px rgba(248,113,113,0.6))' }} />
                   : <Icon name={expedition?.hideBoss ? expedition.ruleIcon : 'enemy'} size={56} />}
                 <div className="min-w-0">
                   <div className="font-extrabold text-cw-16" style={{ color: 'var(--cw-danger)' }}>{chapter.enemyName}</div>
                   <div className="text-cw-12 mb-1" style={{ color: 'var(--cw-fg-3)' }}>{chapter.enemyTitle}</div>
                   <p className="text-cw-14 leading-relaxed" style={{ color: 'var(--cw-fg-2)' }}>{chapter.background}</p>
                 </div>
               </div>

               <p className="text-cw-14 leading-relaxed mb-2" style={{ color: 'var(--cw-fg)' }}>▸ {chapter.briefing}</p>
               <p className="text-cw-14 leading-relaxed mb-3" style={{ color: 'var(--cw-reward)' }}><Icon name="bulb" size={20} className="inline-block align-[-4px] mr-1" />{chapter.hint}</p>
               {!isPvp && cardLimitFor(chapter, tier, assistLevel) != null && (
                 <p className="cw-tone-danger text-cw-14 leading-relaxed mb-3 p-3 rounded-cw-md" data-testid="briefing-card-limit"
                   style={{ background: 'var(--tone-bg)', boxShadow: 'inset 0 0 0 1px var(--cw-line-strong)', color: 'var(--cw-fg)' }}>
                   この たたかいの カードは {cardLimitFor(chapter, tier, assistLevel)} まいまで。まちがえずに とくほど ⚡ が ふえて、たくさん 出撃できるよ
                 </p>
               )}

               {assistLevel > 0 && (
                 <div className="cw-tone-growth p-3 rounded-cw-md mb-1 text-cw-14 leading-relaxed"
                   style={{ background: 'var(--tone-bg)', boxShadow: 'inset 0 0 0 1px var(--cw-line-strong)', color: 'var(--cw-growth)' }}>
                   <strong>{ASSIST_LEVELS[assistLevel].label}</strong>：{ASSIST_LEVELS[assistLevel].description}
                 </div>
               )}
             </div>
             <div className="p-4 pt-2" style={{ boxShadow: 'inset 0 1px 0 var(--cw-line)' }}>
               <Button variant="primary" size="xl" fullWidth onClick={() => { sfx.select(); setBriefingOpen(false); }}>
                 <Icon name="sortie" size={30} />作戦かいし！
               </Button>
             </div>
           </Panel>
         </div>
       )}

    </div>
  );
};

/** この戦闘で解いた問題のまとめ。勝ったときは星（まちがえずに解けた割合で決まる。速さでは決まらない） */
const QuizSummary: React.FC<{ answered: number; perfect: number; win?: boolean }> = ({ answered, perfect, win }) => {
  const stars = starsFor(answered, perfect);
  return (
    <div className="mb-3 text-center" data-testid="quiz-summary">
      {win && (
        <div className="flex justify-center gap-1.5 mb-2" role="img" aria-label={`星 ${stars}つ`}>
          {[1, 2, 3].map((n) => (
            <Icon key={n} name="star" size={n === 2 ? 64 : 52}
              style={n <= stars ? { filter: 'drop-shadow(0 0 10px rgba(250,204,21,.6))' } : { filter: 'grayscale(1) brightness(.5)', opacity: 0.7 }} />
          ))}
        </div>
      )}
      <div className="text-cw-14" style={{ color: 'var(--cw-fg-2)' }}>
        といた問題 <b className="font-cw-num text-cw-16" style={{ color: 'var(--cw-fg)' }}>{answered}</b>問 ・ まちがえずに とけた <b className="font-cw-num text-cw-16" style={{ color: 'var(--cw-growth)' }}>{perfect}</b>問
      </div>
      {win && stars < 3 && (
        <div className="text-cw-12 mt-1" style={{ color: 'var(--cw-fg-3)' }}>
          ★3は「8問いじょう といて、9わり まちがえない」。★2は「5問いじょうで 7わり」。はやさは かんけいないよ
        </div>
      )}
    </div>
  );
};

const LevelUpSummary: React.FC<{ events: import('../../store/useArmyStore').LevelUpEvent[] }> = ({ events }) => {
  if (!events || events.length === 0) {
    return (
      <div className="text-cw-14 mb-2" style={{ color: 'var(--cw-action)' }}>出撃した ネコに けいけんちが 入ったよ！</div>
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
            className="flex items-center gap-3 p-2 rounded-cw-md"
            style={{ background: 'var(--cw-surface)', boxShadow: 'inset 0 0 0 1px var(--cw-line)' }}>
            <img src={getCharacterSprite(fam.spriteFamily, ev.newStage)} alt={fam.id}
              style={{ width: 44, height: 44, objectFit: 'contain' }} draggable={false} />
            <div className="flex-1 text-left">
              <div className="font-bold text-cw-14" style={{ color: 'var(--cw-fg)' }}>
                {ev.evolved ? `進化！ ${newForm.name}` : `${newForm.name}`}
              </div>
              <div className="text-cw-12 font-cw-num" style={{ color: 'var(--cw-growth)' }}>
                Lv{ev.fromLevel} → Lv{ev.toLevel}{ev.evolved && ' ・ あたらしいすがた！'}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
};
