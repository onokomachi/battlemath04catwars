import React, { useEffect, useMemo, useState } from 'react';
import { BuildingType, GameState } from '../types';
import { BUILDING_STATS } from '../constants';
import { usePlayerStore } from '../store/usePlayerStore';
import { useProgressStore } from '../store/useProgressStore';
import { useBaseStore } from '../store/useBaseStore';
import { useBattleSetupStore } from '../store/useBattleSetupStore';
import { computeBattleLoadout, splitActiveLayout, unlockedFamilies } from '../utils/battleLoadout';
import { useStudyStore } from '../store/useStudyStore';
import { activeFacilityLimit, facilityMult, powerPlantBonus, LEVELED_COMBAT } from '../data/facilities';
import { FormationScreen } from './army/FormationScreen';
import { effectiveFormation } from '../store/useArmyStore';
import { BATTLE_MAP_BY_ID, BATTLE_MAPS, tierEnemyBase } from '../data/battleMaps';
import {
  CHAPTER_BY_ID, CAMPAIGN, effectiveDifficulty, threatLevel, threatMultFor, chapterBaseLevel, type ChapterTier,
} from '../data/campaign';
import { useCampaignStore } from '../store/useCampaignStore';
import { useArmyStore } from '../store/useArmyStore';
import { BattleScene } from './game/BattleScene';
import { StageSelectScreen } from './game/StageSelectScreen';
import { RangeSelect } from './game/RangeSelect';
import { ArmyRosterScreen } from './army/ArmyRosterScreen';
import { DailyBuffsPanel } from './learn/DailyBuffsPanel';
import { ExchangePanel } from './learn/ExchangePanel';
import { BaseBuilder } from './BaseBuilder';
import { CollectionScreen } from './collection/CollectionScreen';
import { NewBadgeNotice, TitleChip, DecorFlag } from './collection/CollectionParts';
import { useCollectionStore } from '../store/useCollectionStore';
import { refreshCollection } from '../collection/record';
import { CAPSULE_RULES } from '../collection/stickers';
import { sfx } from '../utils/audioEngine';
import { usePortalLifecycle, startSortie, usePortal, sortieLock } from '../portal/usePortal';
import { PortalCard, SortieStamina } from '../portal/PortalCard';

const font = { fontFamily: '"M PLUS Rounded 1c", sans-serif' };
const fontMono = { fontFamily: 'Orbitron, monospace' };

// 出撃導線: 範囲えらび → ステージえらび → 出撃メンバー（5枠）→ 陣地づくり（施設の買う・レベル上げも ここ）→ 戦闘
// 陣地はステージごとに組む（ゾーンの広さが章によって変わるため）。
type View = 'home' | 'army' | 'collection' | 'range' | 'stage' | 'formation' | 'prep' | 'battle' | 'buffs' | 'mercs';

interface Props {
  /** 上の階のメニューがあるときだけ（いまは CAT-WARS だけで動くので無い） */
  onExit?: () => void;
  playerName?: string;
}

export const CatWars: React.FC<Props> = ({ onExit, playerName }) => {
  const [view, setView] = useState<View>('home');
  const { resources, buildings, troops, lastTick, addResources } = usePlayerStore();
  const { resetBattleSession } = useBattleSetupStore();
  const {
    getTodayDailyStars, dailyStreak, todayAnswered, dailyGoal, updateDailyStreak, permanentUnlocks,
  } = useProgressStore();
  const campaign = useCampaignStore();
  const base = useBaseStore();

  const [activeChapterId, setActiveChapterId] = useState<string>(CAMPAIGN[0].id);
  /** えらんだ難易度の段（ふつう／むずかしい／げきむず） */
  const [activeTier, setActiveTier] = useState<ChapterTier>('normal');
  const army = useArmyStore((s) => s.army);
  /** 手持ちの上位5系統の平均レベル（脅威レベルの もと） */
  const topAvgLevel = useMemo(() => topFamiliesAvgLevel(army), [army]);
  const [quizSubtopics, setQuizSubtopics] = useState<string[]>([]);
  const gameState: GameState = { resources, buildings, troops, lastTick };
  // 施設は持ちつづける（useBaseStore）。きょう動かせる数は、きょう まちがえずに解いた数で決まる
  const owned = base.owned;
  const todayPerfect = useStudyStore(s => (s.todayDate === new Date().toISOString().slice(0, 10) ? s.todayPerfect : 0));
  const limit = activeFacilityLimit(todayPerfect);
  const unlocked = useMemo(() => unlockedFamilies(owned, permanentUnlocks), [owned, permanentUnlocks]);
  const savedFormation = useArmyStore((s) => s.formation);
  const formation = useMemo(() => effectiveFormation(savedFormation, unlocked), [savedFormation, unlocked]);
  const loadout = useMemo(() => computeBattleLoadout(owned, [], permanentUnlocks), [owned, permanentUnlocks]);
  const dailyStars = getTodayDailyStars();
  /** 発電所：勝ったときの 💠 の上乗せ（放置の収入は無い） */
  const creditBonus = powerPlantBonus(owned[BuildingType.GOLD_MINE] ?? 0, base.levelOf(BuildingType.GOLD_MINE));

  useEffect(() => {
    updateDailyStreak();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // 収集：ホームに もどるたびに バッジ・ネコの図鑑を 決めなおす（傭兵召集・兵舎で ネコが ふえたときも）
  useEffect(() => { if (view === 'home') { try { refreshCollection(); } catch { /* noop */ } } }, [view]);
  const coins = useCollectionStore((s) => s.coins);

  // 学級ポータル（名乗り・スタミナ・モードの開け閉め・サーバのかけら）。CW-5a
  usePortalLifecycle();
  const portalStudent = usePortal((s) => s.student);
  const portalModes = usePortal((s) => s.modes);
  /** 出撃が閉じているときの文（名乗っている子だけ。おためしは閉じない） */
  const homeLock = portalStudent ? sortieLock(portalModes) : null;
  const [homeNotice, setHomeNotice] = useState<string | null>(null);
  /**
   * 戦闘の きっぷ。出撃の関門（portal/gate.ts）を通ったときだけ できる。戦闘の画面は これが無いと出さない
   * （関門を通らずに戦闘を始める道を残さない）。戦闘が おわったら 消す。
   */
  const [battleTicket, setBattleTicket] = useState<{ chapterId: string; tier: ChapterTier } | null>(null);
  const [sortieBusy, setSortieBusy] = useState(false);
  const [sortieMsg, setSortieMsg] = useState<string | null>(null);

  /** 出撃の関門。ここだけが battleTicket を作る */
  const beginBattle = async (chapterId: string) => {
    if (sortieBusy) return;
    setSortieBusy(true);
    setSortieMsg(null);
    try {
      const r = await startSortie(formation);
      if (r.ok === false) { setSortieMsg(r.message); return; }
      campaign.recordAttempt(chapterId, activeTier);
      setBattleTicket({ chapterId, tier: activeTier });
      setView('battle');
    } finally {
      setSortieBusy(false);
    }
  };

  const handleEndBattle = (win: boolean, loot: { gold: number }, stars?: 1 | 2 | 3) => {
    if (win) addResources(Math.round(loot.gold));
    // 章の結果を記録（勝敗で連敗数が更新され、サポートモードの判定に反映される）
    campaign.recordResult(activeChapterId, win, stars, activeTier);
    setBattleTicket(null);
    setView('home');
  };

  // ── サブ画面 ───────────────────────────────
  if (view === 'army') return <ArmyRosterScreen onBack={() => setView('home')} />;
  if (view === 'collection') return <CollectionScreen onBack={() => setView('home')} />;

  if (view === 'range') {
    return (
      <RangeSelect
        onBack={() => setView('home')}
        onConfirm={(subs) => { setQuizSubtopics(subs); setView('stage'); }}
      />
    );
  }

  if (view === 'stage') {
    return (
      <StageSelectScreen
        loadout={loadout}
        onBack={() => setView('home')}
        avgLevel={topAvgLevel}
        onStart={(chapterId, tier) => {
          setActiveChapterId(chapterId);
          setActiveTier(tier);
          // ステージを決めたら、その敵に合わせて 出撃メンバー（5枠）をえらぶ → 陣地づくり
          setView('formation');
        }}
      />
    );
  }

  if (view === 'formation') {
    const chapter = CHAPTER_BY_ID[activeChapterId] ?? CAMPAIGN[0];
    return (
      <FormationScreen chapter={chapter} tier={activeTier}
        onBack={() => setView('stage')} onProceed={() => setView('prep')} />
    );
  }

  if (view === 'prep') {
    const chapter = CHAPTER_BY_ID[activeChapterId] ?? CAMPAIGN[0];
    return (
      <BaseBuilder
        chapter={chapter}
        onBack={() => { setSortieMsg(null); setView('formation'); }}
        onProceed={() => { void beginBattle(chapter.id); }}
        proceedBusy={sortieBusy}
        proceedSlot={<SortieStamina formation={formation} message={sortieMsg} />}
      />
    );
  }

  if (view === 'battle' && battleTicket) {
    const chapter = CHAPTER_BY_ID[battleTicket.chapterId] ?? CAMPAIGN[0];
    const map = BATTLE_MAP_BY_ID[chapter.mapId] ?? BATTLE_MAPS[0];
    // サポートモードは段ごとの連敗で決まる
    const assist = campaign.assistLevelFor(chapter.id, activeTier);
    // 脅威レベル：手持ちが その段の めやすより育っているぶん、敵も強くなる（画面に出す）
    const baseLv = chapterBaseLevel(chapter, activeTier);
    const threat = threatLevel(topAvgLevel, baseLv);
    const tMult = threatMultFor(topAvgLevel, baseLv);
    // 陣地づくりで組んだ配置のうち、きょう動かせるもの（先に置いた順）だけを戦場に出す
    const { active } = splitActiveLayout(base.getLayout(chapter.id), limit);
    const facilityMults: Partial<Record<BuildingType, number>> = {};
    for (const t of LEVELED_COMBAT) facilityMults[t] = facilityMult(t, base.levelOf(t));
    return (
      <BattleScene
        attackerState={gameState}
        defenderBuildings={tierEnemyBase(map, activeTier)}
        playerDeployments={active}
        battleMap={map}
        loadout={computeBattleLoadout(owned, active, permanentUnlocks)}
        formation={formation}
        facilityMults={facilityMults}
        creditBonus={creditBonus}
        chapter={chapter}
        difficulty={effectiveDifficulty(chapter, assist, activeTier, tMult)}
        assistLevel={assist}
        tier={activeTier}
        threat={threat}
        threatPct={Math.round((tMult - 1) * 100)}
        quizSubtopics={quizSubtopics}
        onEndBattle={handleEndBattle}
      />
    );
  }

  // ── ハブ（ホーム）───────────────────────────
  const dailyProgress = Math.min(1, todayAnswered / Math.max(1, dailyGoal));
  const clearedCount = campaign.clearedChapters.length;
  const nextChapter = CHAPTER_BY_ID[campaign.nextChapterId()];
  const allCleared = clearedCount >= CAMPAIGN.length;

  const StatChip: React.FC<{ icon: string; value: React.ReactNode; color: string }> = ({ icon, value, color }) => (
    <div className="flex items-center gap-1 border rounded-full px-2.5 py-1"
      style={{ borderColor: `${color}66`, background: `${color}14` }}>
      <span className="text-sm">{icon}</span>
      <span className="font-bold text-xs" style={{ color, ...fontMono }}>{value}</span>
    </div>
  );

  return (
    <div className="min-h-[100dvh] h-[100dvh] flex flex-col overflow-y-auto" style={font}>
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        {onExit ? <button onClick={onExit} className="text-white/60 hover:text-white text-sm">← メニュー</button> : <span />}
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {dailyStreak >= 1 && <StatChip icon="🔥" value={`${dailyStreak}`} color="#fb923c" />}
          <StatChip icon="💠" value={Math.floor(resources.gold)} color="#38bdf8" />
          <StatChip icon="⚡" value={dailyStars} color="#facc15" />
          <StatChip icon="🪙" value={coins} color="#fde68a" />
        </div>
      </div>

      {/* Title */}
      <div className="text-center px-4 mt-1 mb-3">
        <h1 className="text-3xl sm:text-4xl font-black text-hologram tracking-wide" style={fontMono}>CAT-WARS</h1>
        <p className="text-[11px] text-[#38bdf8]/80 tracking-[0.3em] mt-1">基地を きずき ネコぐんだんで せめこもう</p>
        <div className="mt-2"><TitleChip /></div>
      </div>

      {/* あたらしい バッジ（1回だけ） */}
      <NewBadgeNotice />

      {/* 学級ポータル：名乗りの入口・スタミナ（つないでいないビルドでは出さない） */}
      <PortalCard />
      {homeNotice && (
        <div className="px-4 pt-3" role="status">
          <div className="rounded-xl border border-[#fca5a5]/50 p-3 text-center" style={{ background: 'rgba(127,29,29,0.25)' }}>
            <p className="text-white text-sm font-bold">{homeNotice}</p>
            <button onClick={() => setHomeNotice(null)} className="mt-1 text-[11px] text-white/60 underline">とじる</button>
          </div>
        </div>
      )}

      {/* Daily goal */}
      <div className="px-5">
        <div className="flex items-center justify-between mb-1">
          <span className="text-white/60 text-[11px]">まちがえずに とくと 💠クレジット・⚡エナジー・施設を 動かす力 が たまる</span>
          <span className="text-[#38bdf8] text-[11px]" style={fontMono}>{todayAnswered}/{dailyGoal}問</span>
        </div>
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${dailyProgress * 100}%`, background: 'linear-gradient(90deg,#2563eb,#ef4444)' }} />
        </div>
      </div>

      {/* ストーリー進行 */}
      <div className="px-5 pt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-white/60 text-[11px]">
            {allCleared ? '👑 銀河にへいわがもどった' : `つぎの戦い：第${nextChapter.no}章「${nextChapter.title}」`}
          </span>
          <span className="text-[#f87171] text-[11px]" style={fontMono}>{clearedCount}/{CAMPAIGN.length}章</span>
        </div>
        <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500"
            style={{ width: `${(clearedCount / CAMPAIGN.length) * 100}%`, background: 'linear-gradient(90deg,#f87171,#facc15)' }} />
        </div>
      </div>

      {/* Big actions */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 px-4 pt-4">
        <HubButton icon="⚔️" label="出撃！" sub={homeLock ? `🔒 ${homeLock}` : allCleared ? '全章クリア！ 好きな章に再挑戦' : `第${nextChapter.no}章「${nextChapter.title}」へ`} color="#ef4444"
          locked={!!homeLock}
          onClick={() => {
            // 閉じていても 押せる形のまま。押すと わけを出す（SANMON と同じ）
            if (homeLock) { setHomeNotice(homeLock); return; }
            setSortieMsg(null); resetBattleSession(); setView('range');
          }} big />
        <HubButton icon="🐱" label="ネコ部隊" sub="レベル・進化・スキル" color="#a3e635"
          onClick={() => setView('army')} />
        <HubButton icon="📖" label="あつめる" sub={coins >= CAPSULE_RULES.cost ? `🪙${coins} カプセルを まわせる！` : '図鑑・バッジ・シール'} color="#7dd3fc"
          onClick={() => setView('collection')} />
        <HubButton icon="✨" label="出撃バフ" sub="⚡エナジーで きょうの 戦力アップ" color="#facc15"
          onClick={() => setView('buffs')} />
      </div>

      {/* 基地のようす（施設の買う・レベル上げ・配置は 出撃の中の「陣地づくり」で） */}
      <div className="px-4 pt-4">
        <div className="rounded-2xl border border-white/10 p-3" style={{ background: 'rgba(6,10,24,0.55)' }} data-testid="hub-base">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-2"><DecorFlag size={22} /><span className="text-white/70 text-xs font-bold" style={fontMono}>基地</span></span>
            <span className="text-[#facc15] text-[11px]">きょう 動かせる施設 {limit}こ まで（コアのほか）</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
              <span className="text-white/70 text-[11px]">🏰 コア Lv{base.levelOf(BuildingType.TOWN_HALL)}</span>
            </div>
            {(Object.entries(owned) as [BuildingType, number][]).filter(([, n]) => (n ?? 0) > 0).map(([type, n]) => (
              <div key={type} className="flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/10">
                <span className="text-white/70 text-[11px]">{BUILDING_STATS[type].icon || '🧱'} {BUILDING_STATS[type].name}×{n} Lv{base.levelOf(type)}</span>
              </div>
            ))}
          </div>
          {Object.values(owned).every(n => !n) && (
            <p className="text-white/40 text-[11px] mt-2">「出撃！」の 陣地づくりで、💠クレジットで 施設を 買えるよ。施設は ずっと のこる。</p>
          )}
        </div>
      </div>

      {/* Mercenaries shortcut */}
      <div className="px-4 pt-3 pb-8">
        <button onClick={() => setView('mercs')}
          className="w-full py-3 rounded-xl border border-[#a3e635]/40 text-[#a3e635] text-sm font-bold hover:bg-[#a3e635]/10 transition-all active:scale-95">
          💠 なかまを よぶ（💠で ボスの 宇宙ネコを なかまに）
        </button>
      </div>

      {/* Overlay panels */}
      {view === 'buffs' && (
        <Overlay title="出撃バフ" onClose={() => setView('home')}>
          <DailyBuffsPanel />
        </Overlay>
      )}
      {view === 'mercs' && (
        <Overlay title="なかまを よぶ" onClose={() => setView('home')}>
          <ExchangePanel />
        </Overlay>
      )}
    </div>
  );
};

/** 手持ちの上位5系統の平均レベル（脅威レベルの もと） */
export function topFamiliesAvgLevel(army: Record<string, { level: number }>): number {
  const lv = Object.values(army).map((e) => e?.level ?? 1).sort((a, b) => b - a).slice(0, 5);
  if (lv.length === 0) return 1;
  return lv.reduce((a, b) => a + b, 0) / lv.length;
}

const HubButton: React.FC<{
  icon: string; label: string; sub: string; color: string; onClick: () => void; big?: boolean; locked?: boolean;
}> = ({ icon, label, sub, color, onClick, big, locked }) => (
  <button onClick={() => { sfx.select(); onClick(); }} aria-disabled={locked || undefined}
    className={`relative overflow-hidden rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all active:scale-95 ${big ? 'col-span-2 md:col-span-3 py-6' : 'py-5'} ${locked ? 'opacity-60 grayscale' : ''}`}
    style={{ borderColor: `${color}`, background: `${color}18`, boxShadow: big ? `0 0 22px ${color}55` : `0 0 10px ${color}33` }}>
    <span className={big ? 'text-4xl' : 'text-3xl'}>{icon}</span>
    <span className="font-black text-white tracking-wide" style={{ ...fontMono, fontSize: big ? 18 : 15 }}>{label}</span>
    <span className="text-[11px]" style={{ color }}>{sub}</span>
  </button>
);

const Overlay: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[120] flex flex-col" style={{ background: 'rgba(4,7,18,0.96)', backdropFilter: 'blur(10px)' }}>
    <div className="flex items-center gap-3 p-4 border-b border-white/10">
      <button onClick={onClose} className="text-white/60 hover:text-white text-sm">← もどる</button>
      <h2 className="text-[#38bdf8] font-bold text-base" style={fontMono}>{title}</h2>
    </div>
    <div className="flex-1 overflow-y-auto p-4">{children}</div>
  </div>
);
