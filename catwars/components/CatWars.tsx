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
import { usePortalLifecycle, startSortie, usePortal, sortieLock, playingLock, reportSortieLock, afterBattle } from '../portal/usePortal';
import { PortalCard, SortieStamina } from '../portal/PortalCard';
import { settleBattle, newBattleId } from '../utils/settleBattle';
import { isTrial } from 'learning-app-kit/sync';
import { TrialLock, useTrialAllows } from 'learning-app-kit/react';
import { catwarsTrialKeyOf, CATWARS_TRIAL_LABEL, type CatwarsTrialKey } from '../portal/trialFeatures';
import {
  currentExpedition, expeditionForWeek, expeditionChapter, expeditionDifficulty, expeditionEnemyBase, expeditionEnemyLevel, tuneExpeditionConfig,
} from '../expedition/expedition';
import { ExpeditionCard, ExpeditionRewardNote, ExpeditionScreen, ExpeditionResultNote } from './expedition/ExpeditionParts';
import { settleExpedition } from '../utils/settleExpedition';
import { FriendCard, FriendScreen, FriendResultNote } from './friend/FriendParts';
import { VersusCard, VersusScreen } from './versus/VersusParts';
import { friendSetup, type FriendTarget } from '../friend/friendAttack';
import { noteLayoutEdited, flushShare } from '../portal/friendSync';
import { settleFriend, friendBonusFor } from '../utils/settleFriend';
import { bossSprite } from '../data/enemySprites';
import {
  Button, Card, Chip, FacilityImg, Icon, Panel, ProgressBar, ScreenBackdrop, StatPill, TitleBar, useOptionalImage, RULE_ICON, iconOr,
} from './ui';

const font = { fontFamily: 'var(--cw-font)' };
/** 体験版で 先生が閉じた項目の ボタンの下の文（押すと kit の TrialLock） */
const TRIAL_LOCKED = 'たいけんばんでは つかえないよ';

// 出撃導線: 範囲えらび → ステージえらび → 出撃メンバー（5枠）→ 陣地づくり（施設の買う・レベル上げも ここ）→ 戦闘
// 陣地はステージごとに組む（ゾーンの広さが章によって変わるため）。
// 週がわりの遠征（CW-6a）: ホームのカード → 遠征の説明（expedition）→ 範囲えらび → 出撃メンバー → 陣地づくり → 戦闘（章えらびは無い）
// 同時対戦（CW-6c）: ホームのカード → 対戦の画面（versus。へや／れんしゅう → 出題範囲 → とく・おく・みる ×3。戦闘の画面・陣地づくりは 通らない。関門は 画面の中で 通す）
// なかまの 基地に いく（CW-6b）: ホームのカード → 相手をえらぶ（friend）→ 範囲えらび → 出撃メンバー → 陣地づくり → 戦闘（戦場・敵の基地は 相手に あわせて きまる）
type View = 'home' | 'army' | 'collection' | 'range' | 'stage' | 'expedition' | 'friend' | 'versus' | 'formation' | 'prep' | 'battle' | 'buffs' | 'mercs';

interface Props {
  /** 上の階のメニューがあるときだけ（いまは CAT-WARS だけで動くので無い） */
  onExit?: () => void;
  playerName?: string;
}

export const CatWars: React.FC<Props> = ({ onExit, playerName }) => {
  const [view, setView] = useState<View>('home');
  const { resources, buildings, troops, lastTick } = usePlayerStore();
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
  const [battleTicket, setBattleTicket] = useState<{
    id: string; chapterId: string; tier: ChapterTier; expeditionWeek?: number; friend?: { t: FriendTarget; day: string };
  } | null>(null);
  /** いまの出撃が なかまの 基地を 攻めるものか（えらんだ 相手と その日の日づけ。ふだんの章・遠征なら null） */
  const [friendPick, setFriendPick] = useState<{ t: FriendTarget; day: string } | null>(null);
  /** いまの出撃が 週がわりの遠征か（その週の番号。ふだんの章なら null） */
  const [expeditionWeek, setExpeditionWeek] = useState<number | null>(null);
  /** いまの週の遠征（ホームに もどるたびに 決めなおす＝月曜 0:00 を またいでも 新しい週になる） */
  const expedition = useMemo(() => currentExpedition(), [view]);
  /** 遠征の戦闘の 結果画面に出す（その戦いで まちがえずに といた数） */
  const [expeditionPerfect, setExpeditionPerfect] = useState(0);
  /** なかまの 基地の 戦闘の 結果画面に出す（その戦いで まちがえずに といた数） */
  const [friendPerfect, setFriendPerfect] = useState(0);
  const [sortieBusy, setSortieBusy] = useState(false);
  const [sortieMsg, setSortieMsg] = useState<string | null>(null);

  // 遊んでいる とちゅう（出撃の準備・戦闘）で モードが閉じたら（平日モードの時間になった・先生が閉じた・番号ごとの停止）、
  // すぐ ホームに もどす（CW-5b。SANMON の App.tsx と同じ）。モードは usePortal が 2分ごと・タブに もどったときに 読みなおす。
  // その戦闘の 勝ちの ごほうび・章の記録は 無し・出撃の スタミナは もどらない（SANMON と同じ）。解いた問題の ごほうびと記録は のこる。
  const playLock = playingLock(portalModes);
  useEffect(() => {
    if (!playLock) return;
    if (!['range', 'stage', 'expedition', 'friend', 'versus', 'formation', 'prep', 'battle'].includes(view)) return;
    if (view === 'battle') afterBattle();
    setBattleTicket(null);
    setFriendPick(null);
    setSortieMsg(null);
    setHomeNotice(playLock);
    setView('home');
  }, [playLock, view]);

  /** 出撃の関門。ここだけが battleTicket を作る */
  const beginBattle = async (chapterId: string) => {
    if (sortieBusy) return;
    setSortieBusy(true);
    setSortieMsg(null);
    try {
      const r = await startSortie(formation);
      if (r.ok === false) { setSortieMsg(r.message); return; }
      if (friendPick) {
        // なかまの 基地は 章の記録（連敗＝サポートモード）にも 遠征にも 数えない
        setFriendPerfect(0);
        setBattleTicket({ id: newBattleId(), chapterId, tier: 'normal', friend: friendPick });
      } else if (expeditionWeek != null) {
        // 遠征は 章の記録（連敗＝サポートモード）に数えない
        setExpeditionPerfect(0);
        setBattleTicket({ id: newBattleId(), chapterId, tier: 'normal', expeditionWeek });
      } else {
        campaign.recordAttempt(chapterId, activeTier);
        setBattleTicket({ id: newBattleId(), chapterId, tier: activeTier });
      }
      setView('battle');
    } finally {
      setSortieBusy(false);
    }
  };

  /**
   * 勝ち負けが決まった瞬間に1回だけ：勝ちの 💠・章の記録（クリア・★・連敗の数）を入れる（utils/settleBattle.ts）。
   * BattleScene の 戦闘終了の useEffect が呼ぶ。結果画面のまま 読みなおしても のこる。入れたら すぐ セーブを送る。
   */
  const handleSettle = (win: boolean, loot: { gold: number }, stars?: 1 | 2 | 3, quiz?: { answered: number; perfect: number }) => {
    if (!battleTicket) return;
    if (battleTicket.friend) {
      // なかまの 基地：きょうの その枠の 自分の星（前より良いときだけ）・その日 1回目の 勝ちの 💠。サーバには 何も 送らない
      if (!quiz) return;
      setFriendPerfect(quiz.perfect);
      const done = settleFriend({
        battleId: battleTicket.id, day: battleTicket.friend.day, slot: battleTicket.friend.t.slot,
        win, stars, perfect: quiz.perfect,
      });
      if (done) afterBattle();
      return;
    }
    if (battleTicket.expeditionWeek != null) {
      // 遠征：今週の自分の星（前より良いときだけ）・勝ちの 💠。結果画面のボタン（quiz なし）では 二重に入らない
      if (!quiz) return;
      setExpeditionPerfect(quiz.perfect);
      const done = settleExpedition({
        battleId: battleTicket.id, weekStart: expeditionForWeek(battleTicket.expeditionWeek).weekStart,
        win, gold: loot.gold, stars, perfect: quiz.perfect,
      });
      if (done) afterBattle();
      return;
    }
    const done = settleBattle({ battleId: battleTicket.id, chapterId: battleTicket.chapterId, tier: battleTicket.tier, win, gold: loot.gold, stars });
    if (done) afterBattle();
  };

  /** 結果画面のボタン・退却：画面を閉じる（まだ結果を入れていない＝退却 のときだけ ここで 負けとして入れる。💠 は無し） */
  const handleEndBattle = (win: boolean, loot: { gold: number }, stars?: 1 | 2 | 3) => {
    handleSettle(win, loot, stars);
    setBattleTicket(null);
    setExpeditionWeek(null);
    setFriendPick(null);
    setView('home');
    // 解いた問題の記録を まとめて送る・セーブを しまう（名乗っているときだけ。中身が変わっていなければ 送らない）
    afterBattle();
  };

  // 体験版（SOL の体験の入口）：先生が PRISM の管理タブで閉じた項目（portal/trialFeatures.ts。体験でなければ いつも使える）
  const trialAllows = useTrialAllows();
  const trialOpen = (key: CatwarsTrialKey) => trialAllows(key);
  const viewKey = catwarsTrialKeyOf(view);
  if (viewKey && !trialOpen(viewKey)) {
    // 閉じた項目の画面には 入れない（ボタンから来ても・とちゅうで設定が読めても）
    return (
      <div className="fixed inset-0 z-[130]" style={font} data-testid="trial-lock">
        <TrialLock label={CATWARS_TRIAL_LABEL[viewKey]} onBack={() => { setBattleTicket(null); setView('home'); }} />
      </div>
    );
  }

  // ── サブ画面 ───────────────────────────────
  if (view === 'army') return <ArmyRosterScreen onBack={() => setView('home')} />;
  if (view === 'collection') return <CollectionScreen onBack={() => setView('home')} />;

  if (view === 'range') {
    return (
      <RangeSelect
        onBack={() => setView(friendPick ? 'friend' : expeditionWeek != null ? 'expedition' : 'home')}
        nextLabel={friendPick ? 'この範囲で なかまの 基地へ →' : expeditionWeek != null ? 'この範囲で 遠征の 出撃メンバーへ →' : undefined}
        onConfirm={(subs) => {
          setQuizSubtopics(subs);
          if (friendPick) {
            // なかまの 基地：戦場は 相手に あわせて きまっている（章えらびは とばす）。難易度は ふつう＋手持ちに合わせた 敵の強さ
            setActiveChapterId(CAMPAIGN.find((c) => c.no === friendPick.t.chapterNo)?.id ?? CAMPAIGN[1].id);
            setActiveTier('normal');
            setView('formation');
          } else if (expeditionWeek != null) {
            // 遠征：戦場は 週で決まっている（章えらびは とばす）。難易度は ふつう＋手持ちに合わせた 敵の強さ
            setActiveChapterId(expeditionForWeek(expeditionWeek).chapter.id);
            setActiveTier('normal');
            setView('formation');
          } else setView('stage');
        }}
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

  if (view === 'expedition') {
    return (
      <ExpeditionScreen expedition={expedition} avgLevel={topAvgLevel} locked={homeLock}
        onBack={() => { setExpeditionWeek(null); setView('home'); }}
        onStart={() => {
          if (homeLock) { setHomeNotice(homeLock); reportSortieLock(); setView('home'); return; }
          setSortieMsg(null); resetBattleSession(); setFriendPick(null); setExpeditionWeek(expedition.week); setView('range');
        }} />
    );
  }

  if (view === 'friend') {
    return (
      <FriendScreen avgLevel={topAvgLevel} locked={homeLock}
        onBack={() => { setFriendPick(null); setView('home'); }}
        onPick={(t, day) => {
          if (homeLock) { setHomeNotice(homeLock); reportSortieLock(); setView('home'); return; }
          setSortieMsg(null); resetBattleSession(); setExpeditionWeek(null); setFriendPick({ t, day }); setView('range');
        }} />
    );
  }

  if (view === 'versus') {
    // 同時対戦：出撃の関門（スタミナ）は 画面の中で「たたかう」を おしたとき 通す（portal/usePortal.ts の startSortie）。ネコの レベルは みんな同じ
    return <VersusScreen formation={formation} unlocked={unlocked} locked={homeLock} onBack={() => setView('home')} />;
  }

  if (view === 'formation') {
    if (friendPick) {
      const su = friendSetup(friendPick.t, topAvgLevel);
      return (
        <FormationScreen chapter={su.chapter} tier="normal" difficulty={su.difficulty}
          onBack={() => setView('range')} onProceed={() => setView('prep')} />
      );
    }
    if (expeditionWeek != null) {
      const e = expeditionForWeek(expeditionWeek);
      return (
        <FormationScreen chapter={expeditionChapter(e)} tier="normal" difficulty={expeditionDifficulty(e, topAvgLevel)}
          onBack={() => setView('range')} onProceed={() => setView('prep')} />
      );
    }
    const chapter = CHAPTER_BY_ID[activeChapterId] ?? CAMPAIGN[0];
    return (
      <FormationScreen chapter={chapter} tier={activeTier}
        onBack={() => setView('stage')} onProceed={() => setView('prep')} />
    );
  }

  if (view === 'prep') {
    const fsu = friendPick ? friendSetup(friendPick.t, topAvgLevel) : null;
    const chapter = fsu ? fsu.chapter : expeditionWeek != null ? expeditionChapter(expeditionForWeek(expeditionWeek)) : CHAPTER_BY_ID[activeChapterId] ?? CAMPAIGN[0];
    return (
      <BaseBuilder
        chapter={chapter}
        enemyBase={fsu ? fsu.enemyBase : undefined}
        onLayoutEdited={noteLayoutEdited}
        onBack={() => { setSortieMsg(null); void flushShare(); setView('formation'); }}
        onProceed={() => { void flushShare(); void beginBattle(chapter.id); }}
        proceedBusy={sortieBusy}
        proceedSlot={<SortieStamina formation={formation} message={sortieMsg} />}
      />
    );
  }

  if (view === 'battle' && battleTicket && battleTicket.friend) {
    // なかまの 基地：戦場・敵の基地は 相手の 配置に あわせて きまる。敵の強さは 手持ちに 合わせる（遠征と同じしくみ・基準 Lv1）。サポートモードは無し
    const f = battleTicket.friend;
    const su = friendSetup(f.t, topAvgLevel);
    const { active } = splitActiveLayout(base.getLayout(su.chapter.id), limit);
    const facilityMults: Partial<Record<BuildingType, number>> = {};
    for (const t of LEVELED_COMBAT) facilityMults[t] = facilityMult(t, base.levelOf(t));
    return (
      <BattleScene
        attackerState={gameState}
        defenderBuildings={su.enemyBase}
        playerDeployments={active}
        battleMap={su.map}
        loadout={computeBattleLoadout(owned, active, permanentUnlocks)}
        formation={formation}
        facilityMults={facilityMults}
        creditBonus={0}
        chapter={su.chapter}
        difficulty={su.difficulty}
        assistLevel={0}
        tier="normal"
        quizSubtopics={quizSubtopics}
        expedition={{
          enemyLevel: su.enemyLevel, ruleIcon: 'friend', ruleName: 'なかまの 基地',
          label: 'なかまの 基地', kicker: 'FRIEND BASE', winLabel: 'なかまの 基地を せめおとした！', hideBoss: true,
          loseNote: 'まけても ネコたちの けいけんちは 手に入るよ。なかまの 基地は なんかいでも ちょうせん できる。あいてには 何も 伝わらないよ！',
          loot: (win, q) => friendBonusFor(f.day, win, q.perfect),
          resultExtra: <FriendResultNote day={f.day} slot={f.t.slot} label={f.t.label} perfect={friendPerfect} />,
        }}
        onSettle={handleSettle}
        onEndBattle={handleEndBattle}
      />
    );
  }

  if (view === 'battle' && battleTicket && battleTicket.expeditionWeek != null) {
    // 週がわりの遠征：戦場・敵・ルールは 週で決まる。敵の強さは 手持ちに合わせる（脅威レベルのしくみ・基準 Lv1）。サポートモードは無し
    const e = expeditionForWeek(battleTicket.expeditionWeek);
    const { active } = splitActiveLayout(base.getLayout(e.chapter.id), limit);
    const facilityMults: Partial<Record<BuildingType, number>> = {};
    for (const t of LEVELED_COMBAT) facilityMults[t] = facilityMult(t, base.levelOf(t));
    return (
      <BattleScene
        attackerState={gameState}
        defenderBuildings={expeditionEnemyBase(e)}
        playerDeployments={active}
        battleMap={e.map}
        loadout={computeBattleLoadout(owned, active, permanentUnlocks)}
        formation={formation}
        facilityMults={facilityMults}
        creditBonus={creditBonus}
        chapter={expeditionChapter(e)}
        difficulty={expeditionDifficulty(e, topAvgLevel)}
        assistLevel={0}
        tier="normal"
        quizSubtopics={quizSubtopics}
        tuneConfig={(cfg) => tuneExpeditionConfig(e, cfg)}
        expedition={{
          enemyLevel: expeditionEnemyLevel(topAvgLevel), ruleIcon: iconOr(RULE_ICON, e.rule.id), ruleName: e.rule.name,
          resultExtra: <ExpeditionResultNote weekStart={e.weekStart} perfect={expeditionPerfect} />,
        }}
        onSettle={handleSettle}
        onEndBattle={handleEndBattle}
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
        onSettle={handleSettle}
        onEndBattle={handleEndBattle}
      />
    );
  }

  // ── ハブ（ホーム）───────────────────────────
  const dailyProgress = Math.min(1, todayAnswered / Math.max(1, dailyGoal));
  const clearedCount = campaign.clearedChapters.length;
  const nextChapter = CHAPTER_BY_ID[campaign.nextChapterId()];
  const allCleared = clearedCount >= CAMPAIGN.length;
  const nextBoss = bossSprite(nextChapter.id);
  const sortieLocked = !!homeLock || !trialOpen('sortie');
  const sortieSub = homeLock ?? (!trialOpen('sortie') ? TRIAL_LOCKED : allCleared ? '全章クリア！ 好きな章に再挑戦' : `第${nextChapter.no}章「${nextChapter.title}」へ`);

  return (
    <div className="cw-screen cw-scroll min-h-[100dvh] h-[100dvh] overflow-y-auto" data-testid="home">
      <ScreenBackdrop name="home" />
      <div className="mx-auto w-full max-w-[980px] px-4 pb-8 cw-enter">
        {/* ロゴ・数 */}
        <div className="flex items-center justify-between gap-x-4 gap-y-2 flex-wrap pt-4">
          <div className="flex items-center gap-3 min-w-0">
            {onExit && <Button variant="secondary" size="sm" onClick={onExit}>メニュー</Button>}
            <HomeEmblem />
            <div className="min-w-0">
              <h1 className="cw-logo text-cw-40 leading-none">CAT-WARS</h1>
              <p className="text-cw-12 mt-1" style={{ color: 'var(--cw-fg-2)' }}>基地を きずき ネコぐんだんで せめこもう</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="flex items-center gap-2 flex-wrap justify-end">
              {dailyStreak >= 1 && <StatPill icon="streak" value={dailyStreak} label="れんぞく" />}
              <StatPill icon="credit" value={Math.floor(resources.gold)} label="クレジット" data-testid="pill-credit" />
              <StatPill icon="energy" value={dailyStars} label="エナジー" />
              <StatPill icon="coin" value={coins} label="シールコイン" />
            </div>
            <div className="flex items-center gap-2">
              {!onExit && isTrial() && (
                // 体験の入口から来た子が 最初に迷わないよう、小さく しるし（下の kit のしるしで「おわる」もできる）
                <Chip tone="reward"><span data-testid="trial-chip">たいけんばん</span></Chip>
              )}
              <TitleChip />
            </div>
          </div>
        </div>

        {/* あたらしい バッジ（1回だけ） */}
        <NewBadgeNotice />

        {homeNotice && (
          <div role="status" className="cw-panel cw-tone-danger cw-enter mt-3 p-3 flex items-center gap-3" style={{ boxShadow: 'var(--cw-shadow-panel), var(--cw-lit-danger)' }}>
            <Icon name="warn" size={28} />
            <p className="flex-1 text-cw-14 font-bold" style={{ color: 'var(--cw-fg)' }}>{homeNotice}</p>
            <Button variant="secondary" size="sm" onClick={() => setHomeNotice(null)}>とじる</Button>
          </div>
        )}

        {/* 出撃！（いちばん押したい） */}
        <Button variant="primary" size="hero" fullWidth locked={sortieLocked} className="mt-4 !justify-between gap-4" data-testid="hub-sortie"
          onClick={() => {
            sfx.select();
            // 閉じていても 押せる形のまま。押すと わけを出す（SANMON と同じ）
            if (homeLock) { setHomeNotice(homeLock); reportSortieLock(); return; }
            if (!trialOpen('sortie')) return;
            setSortieMsg(null); resetBattleSession(); setExpeditionWeek(null); setFriendPick(null); setView('range');
          }}>
          <Icon name="sortie" size={64} />
          <span className="flex-1 text-left min-w-0">
            <span className="block text-cw-28 font-black leading-tight">出撃！</span>
            <span className="block text-cw-14 font-bold truncate">
              {sortieLocked && <Icon name="lock" size={16} className="inline-block align-[-3px] mr-1" />}{sortieSub}
            </span>
          </span>
          {nextBoss && !allCleared && (
            <img src={nextBoss} alt="" draggable={false} className="w-[76px] h-[76px] object-contain flex-shrink-0"
              style={{ filter: sortieLocked ? 'grayscale(1) opacity(.6)' : 'drop-shadow(0 4px 6px rgba(6,10,28,.45))' }} />
          )}
        </Button>

        {/* ふだんの 6枚（同じ形・同じ大きさ。枠は 色分けしない） */}
        <div className="grid grid-cols-2 min-[900px]:grid-cols-3 gap-3 mt-3">
          <Card icon="cats" title="ネコ部隊" sub="レベル・進化・スキル" data-testid="hub-army"
            locked={!trialOpen('army')} lockReason={trialOpen('army') ? undefined : TRIAL_LOCKED}
            onClick={() => { sfx.select(); setView('army'); }} />
          <Card icon="collect" title="あつめる" data-testid="hub-collection"
            sub={coins >= CAPSULE_RULES.cost ? `シールコイン ${coins}まい カプセルを まわせる！` : '図鑑・バッジ・シール'}
            locked={!trialOpen('collection')} lockReason={trialOpen('collection') ? undefined : TRIAL_LOCKED}
            right={coins >= CAPSULE_RULES.cost && trialOpen('collection') ? <Chip tone="reward">カプセル</Chip> : undefined}
            onClick={() => { sfx.select(); setView('collection'); }} />
          <Card icon="buff" title="出撃バフ" sub="エナジーで きょうの 戦力アップ" data-testid="hub-buffs"
            locked={!trialOpen('army')} lockReason={trialOpen('army') ? undefined : TRIAL_LOCKED}
            onClick={() => { sfx.select(); setView('buffs'); }} />
          {trialOpen('sortie') && (
            <ExpeditionCard expedition={expedition} locked={homeLock}
              onOpen={() => { sfx.select(); setHomeNotice(null); setView('expedition'); }} />
          )}
          {trialOpen('sortie') && (
            <FriendCard locked={homeLock} onOpen={() => { sfx.select(); setHomeNotice(null); setView('friend'); }} />
          )}
          {trialOpen('sortie') && (
            <VersusCard locked={homeLock} onOpen={() => { sfx.select(); setHomeNotice(null); setView('versus'); }} />
          )}
        </div>
        {trialOpen('sortie') && <ExpeditionRewardNote />}

        {/* 学級ポータル：名乗りの入口・スタミナ（つないでいないビルドでは出さない） */}
        <PortalCard />

        {/* きょうの がくしゅう・ストーリー ／ 基地のようす */}
        <div className="grid grid-cols-1 min-[900px]:grid-cols-2 gap-3 mt-3">
          <Panel className="flex flex-col gap-3">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="flex items-center gap-2 text-cw-14 font-extrabold" style={{ color: 'var(--cw-fg-2)' }}><Icon name="target" size={22} />きょうの がくしゅう</span>
                <span className="text-cw-14 font-bold font-cw-num" style={{ color: 'var(--cw-growth)' }}>{todayAnswered}/{dailyGoal}問</span>
              </div>
              <ProgressBar value={dailyProgress} tone="growth" label="きょうの がくしゅう" />
              <p className="text-cw-12 mt-1.5" style={{ color: 'var(--cw-fg-3)' }}>まちがえずに とくと 💠クレジット・⚡エナジー・施設を 動かす力 が たまる</p>
            </div>
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className="flex items-center gap-2 text-cw-14 font-extrabold min-w-0" style={{ color: 'var(--cw-fg-2)' }}>
                  <Icon name={allCleared ? 'crown' : 'enemy'} size={22} />
                  <span className="truncate">{allCleared ? '銀河にへいわがもどった' : `つぎの戦い：第${nextChapter.no}章「${nextChapter.title}」`}</span>
                </span>
                <span className="text-cw-14 font-bold font-cw-num flex-shrink-0" style={{ color: 'var(--cw-cat)' }}>{clearedCount}/{CAMPAIGN.length}章</span>
              </div>
              <ProgressBar value={clearedCount / CAMPAIGN.length} tone="cat" label="クリアした章" />
            </div>
          </Panel>

          {/* 基地のようす（施設の買う・レベル上げ・配置は 出撃の中の「陣地づくり」で） */}
          <Panel data-testid="hub-base">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="flex items-center gap-2 text-cw-14 font-extrabold" style={{ color: 'var(--cw-fg-2)' }}><DecorFlag size={22} />基地</span>
              <span className="text-cw-12" style={{ color: 'var(--cw-reward)' }}>きょう 動かせる施設 {limit}こ まで（コアのほか）</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Chip><FacilityImg type={BuildingType.TOWN_HALL} size={22} />コア Lv{base.levelOf(BuildingType.TOWN_HALL)}</Chip>
              {(Object.entries(owned) as [BuildingType, number][]).filter(([, n]) => (n ?? 0) > 0).map(([type, n]) => (
                <Chip key={type}><FacilityImg type={type} size={22} />{BUILDING_STATS[type].name}×{n} Lv{base.levelOf(type)}</Chip>
              ))}
            </div>
            {Object.values(owned).every(n => !n) && (
              <p className="text-cw-12 mt-2" style={{ color: 'var(--cw-fg-3)' }}>「出撃！」の 陣地づくりで、💠クレジットで 施設を 買えるよ。施設は ずっと のこる。</p>
            )}
          </Panel>
        </div>

        {/* なかまを よぶ（傭兵） */}
        <Button variant="secondary" size="lg" fullWidth className="mt-3" locked={!trialOpen('army')} data-testid="hub-mercs"
          onClick={() => { sfx.select(); setView('mercs'); }}>
          <Icon name="credit" size={26} />なかまを よぶ（💠で ボスの 宇宙ネコを なかまに）
        </Button>
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

/** ホームの ロゴの となり：エンブレムの絵（あれば）。無ければ 出撃の アイコン */
const HomeEmblem: React.FC = () => {
  const src = useOptionalImage(['/assets/emblem/emblem-catwars.webp', '/assets/emblem/emblem-catwars.png']);
  return src
    ? <img src={src} alt="" draggable={false} className="w-14 h-14 object-contain flex-shrink-0" data-testid="home-emblem" />
    : <Icon name="sortie" size={52} />;
};

const Overlay: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
  <div className="fixed inset-0 z-[120] flex flex-col" style={{ fontFamily: 'var(--cw-font)', color: 'var(--cw-fg)', background: 'linear-gradient(180deg, var(--cw-bg-0), var(--cw-bg-1))' }}>
    <ScreenBackdrop name="home" />
    <TitleBar title={title} onBack={onClose} />
    <div className="flex-1 overflow-y-auto cw-scroll p-4 cw-enter">{children}</div>
  </div>
);
