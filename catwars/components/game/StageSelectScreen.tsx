import React, { useMemo, useState } from 'react';
import {
  CAMPAIGN, ASSIST_LEVELS, CampaignChapter, ChapterTier, TIER_ORDER, TIER_INFO, ENEMY_UNIT_STATS, ENEMY_TRAIT_NOTE,
  tierDifficulty, threatLevel, threatMultFor, chapterBaseLevel, cardLimitFor,
} from '../../data/campaign';
import { ENEMY_UNIT_SPRITE, bossSprite } from '../../data/enemySprites';
import { BATTLE_MAP_BY_ID, tierEnemyBase } from '../../data/battleMaps';
import { BUILDING_STATS } from '../../constants';
import { BattleLoadout, BuildingType, GRID_W, GRID_H } from '../../types';
import { useCampaignStore } from '../../store/useCampaignStore';
import { useBaseStore } from '../../store/useBaseStore';
import { DailyBuffsPanel } from '../learn/DailyBuffsPanel';
import {
  Button, Chip, Disclosure, FacilityImg, Icon, Panel, ScreenBackdrop, Segmented, TitleBar, type IconName, type SegOption, type Tone,
} from '../ui';
import { sfx } from '../../utils/audioEngine';

interface Props {
  loadout: BattleLoadout;
  /** 手持ちの上位5系統の平均レベル（脅威レベルを出すため） */
  avgLevel: number;
  onBack: () => void;
  onStart: (chapterId: string, tier: ChapterTier) => void;
}

const TIER_PLUS: Record<ChapterTier, number> = { normal: 0, hard: 1, extreme: 2 };
/**
 * 章の相対的な手ごわさ（ふつう ◆1〜5。むずかしい +1・げきむず +2）。★は「とった星」に使うので、手ごわさは ◆ で出す。
 * 防衛威力と敵の強さから機械的に出す。
 */
const toughnessStars = (ch: CampaignChapter, tier: ChapterTier = 'normal'): number => {
  const d = ch.difficulty;
  const raw = d.defenseDamageMult * 0.6 + d.enemyDamageMult * 0.4;
  return Math.max(1, Math.min(5, Math.round(raw * 3.6))) + TIER_PLUS[tier];
};
const TIER_LOCK_NOTE: Record<ChapterTier, string> = {
  normal: '前の章を クリアで 開く',
  hard: '「ふつう」を クリアで 開く',
  extreme: '「むずかしい」を クリアで 開く',
};

/**
 * 出撃前のステージ（章）選択。
 * ステージによって自陣ゾーンの広さが変わるため、ここで章を決めてから
 * 次の「陣地づくり」でその広さに合わせて陣地を組む。
 */
export const StageSelectScreen: React.FC<Props> = ({ loadout, avgLevel, onBack, onStart }) => {
  const campaign = useCampaignStore();
  const { clearedChapters, isUnlocked, assistLevelFor, nextChapterId, isTierUnlocked, starsFor } = campaign;
  const baseStore = useBaseStore();
  const [selectedId, setSelectedId] = useState<string>(() => nextChapterId());
  const [tier, setTier] = useState<ChapterTier>('normal');

  const selected = CAMPAIGN.find(c => c.id === selectedId) ?? CAMPAIGN[0];
  const map = BATTLE_MAP_BY_ID[selected.mapId];
  const unlocked = isTierUnlocked(selected.id, tier);
  const assist = assistLevelFor(selected.id, tier);
  const tierInfo = TIER_INFO[tier];
  const td = tierDifficulty(selected, tier);
  const threat = threatLevel(avgLevel, chapterBaseLevel(selected, tier));
  const threatPct = Math.round((threatMultFor(avgLevel, chapterBaseLevel(selected, tier)) - 1) * 100);
  const enemyBase = map ? tierEnemyBase(map, tier) : [];
  /** 1章の星（3段ぶん。最大9つ） */
  const chapterStars = (id: string) => TIER_ORDER.reduce((a, t) => a + starsFor(id, t), 0);

  // このステージ用に組んだ陣地（まだ組んでいなければ空）。実際の編集は次の画面で行う。
  const deployments = useMemo(
    () => baseStore.getLayout(selected.id),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected.id, baseStore.layouts],
  );

  const progress = clearedChapters.length;
  const zoneW = map ? map.playerDeployZone.xMax - map.playerDeployZone.xMin + 1 : 0;
  const zoneH = map ? map.playerDeployZone.yMax - map.playerDeployZone.yMin + 1 : 0;

  const tierTone = (t: ChapterTier): Tone => (t === 'normal' ? 'action' : t === 'hard' ? 'rare' : 'danger');
  const tierOptions: SegOption<ChapterTier>[] = TIER_ORDER.map(t => {
    const open = isTierUnlocked(selected.id, t);
    const st = starsFor(selected.id, t);
    return {
      value: t, label: TIER_INFO[t].label, tone: tierTone(t), locked: !open, attrs: { 'data-tier': t },
      sub: open
        ? <span className="flex gap-0.5">{[1, 2, 3].map(n => <Icon key={n} name="star" size={16} style={n <= st ? undefined : { filter: 'grayscale(1) brightness(0.55)', opacity: 0.7 }} />)}</span>
        : <span className="flex items-center gap-1"><Icon name="lock" size={14} />{TIER_LOCK_NOTE[t]}</span>,
    };
  });
  const countOf = (type: BuildingType) => deployments.filter(d => d.type === type).length;

  return (
    <div className="cw-screen h-[100dvh] flex flex-col overflow-hidden" data-testid="stage-screen">
      <ScreenBackdrop name="stage" />
      <TitleBar title="ステージをえらぶ" onBack={onBack}
        right={<Chip tone="growth">{progress}/{CAMPAIGN.length} 章クリア</Chip>} />

      {/* 星の地図：8つの章の札（ボスの顔・とった星・手ごわさ） */}
      <div className="flex-shrink-0 overflow-x-auto cw-scroll px-4 pt-3 pb-2">
        <div className="relative flex gap-2 mx-auto w-fit">
          <span aria-hidden className="absolute left-4 right-4 top-1/2 border-t-2 border-dashed" style={{ borderColor: 'var(--cw-line-strong)' }} />
          {CAMPAIGN.map(ch => {
            const open = isUnlocked(ch.id);
            const done = clearedChapters.includes(ch.id);
            const active = ch.id === selectedId;
            const boss = bossSprite(ch.id);
            return (
              <button key={ch.id} type="button" data-chapter={ch.id} aria-pressed={active}
                aria-label={`第${ch.no}章 ${ch.title}${open ? '' : '（まだ ひらいていない）'}`}
                onClick={() => { sfx.select(); setSelectedId(ch.id); setTier('normal'); }}
                className={`cw-card cw-press cw-tone-${done ? 'growth' : 'action'} relative flex-shrink-0 w-[80px] h-[108px] flex flex-col items-center justify-center gap-0.5 px-1 ${active ? 'cw-card-on' : ''}`}
                >
                <span className="text-cw-12 font-bold" style={{ color: active ? 'var(--cw-fg)' : 'var(--cw-fg-2)' }}>第{ch.no}章</span>
                {open && boss
                  // その章のボスの顔
                  ? <img src={boss} alt={ch.enemyName} draggable={false} data-testid="stage-boss" className="w-11 h-11 object-contain" />
                  : <span className="w-11 h-11 flex items-center justify-center"><Icon name={!open ? 'lock' : done ? 'crown' : 'enemy'} size={34} /></span>}
                {done ? (
                  // とった星（3段ぶん。最大9つ。まちがえずに解けた割合で決まる）
                  <span className="flex items-center gap-0.5 text-cw-12 font-bold" style={{ color: 'var(--cw-reward)' }} aria-label={`星 ${chapterStars(ch.id)}つ`}>
                    <Icon name="star" size={14} />{chapterStars(ch.id)}<span style={{ color: 'var(--cw-fg-3)' }}>/9</span>
                  </span>
                ) : (
                  <span className="text-cw-12" style={{ color: 'var(--cw-danger)' }}>{'◆'.repeat(toughnessStars(ch))}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* えらんだ章 */}
      <div className="flex-1 overflow-y-auto cw-scroll px-4 pb-4 cw-enter">
        <div className="mx-auto max-w-[980px] grid gap-3 min-[900px]:grid-cols-2 items-start">
          {/* 左：ボスが主役の 1枚 */}
          <Panel strong className="flex flex-col gap-3">
            <div>
              <div className="text-cw-12 tracking-[0.2em] font-cw-num" style={{ color: 'var(--cw-action)' }}>CHAPTER {selected.no}</div>
              <h3 className="text-cw-20 font-black leading-tight">{selected.title}</h3>
            </div>

            {/* 難易度の段（ふつう → むずかしい → げきむず。前の段をクリアで開く）。星は段ごと */}
            <Segmented<ChapterTier> value={tier} onChange={setTier} options={tierOptions} label="むずかしさ" />

            {/* ボス */}
            <div className="flex items-start gap-3 p-3 rounded-cw-md cw-tone-danger" style={{ background: 'var(--tone-bg)', boxShadow: 'inset 0 0 0 1px var(--cw-line)' }}>
              {bossSprite(selected.id)
                ? <img src={bossSprite(selected.id)} alt="" draggable={false} data-testid="intro-boss" className="w-[96px] h-[96px] object-contain flex-shrink-0" style={{ filter: 'drop-shadow(0 4px 8px rgba(6,10,28,.5))' }} />
                : <Icon name="enemy" size={72} />}
              <div className="min-w-0">
                <div className="text-cw-16 font-extrabold" style={{ color: 'var(--cw-danger)' }}>{selected.enemyName}</div>
                <div className="text-cw-12 mb-1" style={{ color: 'var(--cw-fg-3)' }}>{selected.enemyTitle}</div>
                <p className="text-cw-14 leading-relaxed" style={{ color: 'var(--cw-fg-2)' }}>{selected.background}</p>
              </div>
            </div>

            {/* 戦場情報 */}
            <div className="flex flex-wrap gap-2">
              <Chip>{map?.name ?? '???'}</Chip>
              <Chip tone="danger">手ごわさ {'◆'.repeat(toughnessStars(selected, tier))}</Chip>
              <Chip tone="action"><Icon name="credit" size={16} />勝利報酬 {Math.round(selected.rewardCredits * tierInfo.rewardMult)}</Chip>
            </div>
          </Panel>

          {/* 右：しらべる（はじめは「出てくる敵」だけ ひらく） */}
          <div className="flex flex-col gap-3">
            {/* げきむず：カードの まいすう（正確に解くほど 多く出撃できる） */}
            {cardLimitFor(selected, tier, assist) != null && (
              <Notice tone="danger" icon="warn" title={`カードは ${cardLimitFor(selected, tier, assist)} まいまで。まちがえずに とくほど 有利`} data-testid="card-limit">
                まちがえずに とけた カードは ⚡ に なる。ていねいに とくほど たくさん 出撃できるよ。
                {assist > 0 && `（サポートモードで +${cardLimitFor(selected, tier, assist)! - cardLimitFor(selected, tier, 0)!} まい）`}
              </Notice>
            )}
            {/* 脅威レベル（隠れた調整はしない。強くなっているときは はっきり出す） */}
            {threat >= 1 && (
              <Notice tone="rare" icon="rage" title={`脅威 Lv.${threat}`} data-testid="threat">
                手持ちが育っているぶん、敵も強くなっているよ（+{threatPct}%）。
              </Notice>
            )}
            {assist > 0 && (
              <Notice tone="growth" icon="heal" title={`${ASSIST_LEVELS[assist].label} ON`}>
                {ASSIST_LEVELS[assist].description}
              </Notice>
            )}

            {/* この段に出てくる敵（とくべつな敵は アイコンと たおし方） */}
            <Disclosure title="出てくる 敵" icon="enemy" defaultOpen data-testid="enemy-list" right={`${td.unitPool.length + (td.bossAtSpawnCount != null ? 1 : 0)}しゅるい`}>
              <ul className="flex flex-col gap-2">
                {td.unitPool.map(k => {
                  const note = ENEMY_TRAIT_NOTE[k];
                  return (
                    <li key={k} className="flex items-center gap-2 text-cw-14">
                      <img src={ENEMY_UNIT_SPRITE[k]} alt="" draggable={false} className="w-8 h-8 object-contain flex-shrink-0" />
                      <span><span className="font-bold">{note ? `${note.icon} ` : ''}{ENEMY_UNIT_STATS[k].label}</span>
                        {note && <span className="text-cw-12 block" style={{ color: 'var(--cw-fg-3)' }}>{note.counter}</span>}</span>
                    </li>
                  );
                })}
                {td.bossAtSpawnCount != null && (
                  <li className="flex items-center gap-2 text-cw-14">
                    <img src={ENEMY_UNIT_SPRITE.boss} alt="" draggable={false} className="w-8 h-8 object-contain flex-shrink-0" />
                    <span><span className="font-bold" style={{ color: 'var(--cw-reward)' }}>ボス（{ENEMY_UNIT_STATS.boss.label}）</span>
                      {(td.bossShield ?? 0) > 0 && <span className="text-cw-12 block" style={{ color: 'var(--cw-fg-3)' }}>シールド {td.bossShield}まい：ふくしゅうカードを といて わる</span>}</span>
                  </li>
                )}
              </ul>
            </Disclosure>

            {/* 作戦ブリーフィング */}
            <Disclosure title="さくせん" icon="bulb">
              <p className="text-cw-14 leading-relaxed" style={{ color: 'var(--cw-fg-2)' }}>{selected.briefing}</p>
              <p className="text-cw-14 leading-relaxed mt-2 flex gap-2" style={{ color: 'var(--cw-reward)' }}><Icon name="bulb" size={20} className="mt-0.5" />{selected.hint}</p>
            </Disclosure>

            {/* この章の戦場と、いま組んである陣地のプレビュー */}
            <Disclosure title="この章の戦場" icon="target" right={`自陣 ${zoneW}×${zoneH}マス${zoneW >= 9 ? '（ひろい）' : zoneW <= 5 ? '（せまい）' : ''}`}>
              {map && <DeploymentPreview map={map} enemyBase={enemyBase} deployments={deployments} />}
              <div className="flex flex-wrap gap-2 mt-3">
                <Chip><FacilityImg type={BuildingType.TOWN_HALL} size={20} />コア×1</Chip>
                <Chip><FacilityImg type={BuildingType.WALL} size={20} />壁×{countOf(BuildingType.WALL)}/{loadout.maxWallSlots}</Chip>
                <Chip><FacilityImg type={BuildingType.CANNON} size={20} />砲台×{countOf(BuildingType.CANNON)}</Chip>
                <Chip><FacilityImg type={BuildingType.HIDDEN_TESLA} size={20} />電撃トラップ×{countOf(BuildingType.HIDDEN_TESLA)}</Chip>
                <Chip><FacilityImg type={BuildingType.ARMY_CAMP} size={20} />キャンプ×{countOf(BuildingType.ARMY_CAMP)}</Chip>
              </div>
            </Disclosure>

            {/* 出撃バフ（旧・作戦立案画面から移設） */}
            <Disclosure title="出撃バフ" icon="buff">
              <DailyBuffsPanel compact />
            </Disclosure>
          </div>
        </div>
      </div>

      {/* Launch */}
      <div className="flex-shrink-0 px-4 pt-3 relative z-10"
        style={{ background: 'var(--cw-surface-strong)', boxShadow: 'inset 0 1px 0 var(--cw-line)', paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
        <div className="mx-auto max-w-[980px]">
          <Button variant="primary" size="xl" fullWidth data-testid="stage-launch"
            lockReason={unlocked ? undefined : TIER_LOCK_NOTE[tier]} locked={!unlocked}
            onClick={() => { if (unlocked) { sfx.select(); onStart(selected.id, tier); } }}>
            {unlocked
              ? <><Icon name="cats" size={30} />第{selected.no}章{tier === 'normal' ? '' : `（${tierInfo.label}）`}の 出撃メンバーを えらぶ<span aria-hidden>→</span></>
              : `第${selected.no}章${tier === 'normal' ? '' : `（${tierInfo.label}）`}`}
          </Button>
        </div>
      </div>
    </div>
  );
};

/** 注意・お知らせの 1枚（アイコン＋題＋本文）。色は 役目の色 */
const Notice: React.FC<{ tone: Tone; icon: IconName; title: React.ReactNode; children: React.ReactNode; 'data-testid'?: string }> = ({ tone, icon, title, children, ...rest }) => (
  <div className={`cw-panel cw-tone-${tone} p-3 flex items-start gap-3`} style={{ boxShadow: 'var(--cw-shadow-panel), var(--tone-lit)' }} {...rest}>
    <Icon name={icon} size={30} />
    <div className="min-w-0">
      <div className="text-cw-14 font-extrabold" style={{ color: 'var(--tone)' }}>{title}</div>
      <p className="text-cw-12 mt-0.5 leading-relaxed" style={{ color: 'var(--cw-fg-2)' }}>{children}</p>
    </div>
  </div>
);

/** 自陣ゾーンへの自動転写を、そのまま縮小表示するミニマップ */
const DeploymentPreview: React.FC<{
  map: import('../../types').BattleMap;
  /** 段ごとの敵の基地（tierEnemyBase） */
  enemyBase: import('../../types').BattleMap['enemyBase'];
  deployments: import('../../types').DeployedBuilding[];
}> = ({ map, enemyBase, deployments }) => {
  const CELL = 12;
  const zone = map.playerDeployZone;
  const terrainAt = (x: number, y: number) => map.terrain.find(t => t.x === x && t.y === y)?.type ?? 'GRASS';
  // 2x2の施設が4マスぶん重なって見えないよう、左上マスにだけアイコンを出す
  const enemyAt = (x: number, y: number) => enemyBase.find(e => e.x === x && e.y === y);
  const deployAt = (x: number, y: number) =>
    deployments.find(d => {
      const s = BUILDING_STATS[d.type];
      return x >= d.x && x < d.x + s.width && y >= d.y && y < d.y + s.height;
    });

  return (
    <div className="overflow-x-auto cw-scroll">
      <div style={{ position: 'relative', width: GRID_W * CELL, height: GRID_H * CELL, margin: '0 auto' }}>
        {Array.from({ length: GRID_H }, (_, y) =>
          Array.from({ length: GRID_W }, (_, x) => {
            const t = terrainAt(x, y);
            const inZone = x >= zone.xMin && x <= zone.xMax && y >= zone.yMin && y <= zone.yMax;
            const d = deployAt(x, y);
            const e = !d && enemyAt(x, y);
            return (
              <div key={`${x}-${y}`}
                style={{
                  position: 'absolute', left: x * CELL, top: y * CELL, width: CELL, height: CELL,
                  background: d ? 'var(--cw-action)'
                    : e ? 'var(--cw-danger)'
                    : t === 'WATER' ? '#1d4ed8'
                    : t === 'ROCK' ? '#374151'
                    : t === 'SWAMP' ? 'rgba(20,83,45,0.85)'
                    : t === 'LAVA' ? '#b91c1c'
                    : t === 'BRIDGE' ? '#92400e'
                    : inZone ? 'rgba(56,189,248,0.14)' : 'rgba(255,255,255,0.04)',
                  opacity: d || e ? 0.9 : 1,
                  borderRadius: d || e ? 3 : 0,
                  border: '1px solid rgba(255,255,255,0.05)',
                }} />
            );
          })
        )}
      </div>
      <div className="flex gap-4 justify-center mt-2 text-cw-12" style={{ color: 'var(--cw-fg-2)' }}>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'var(--cw-action)' }} />じぶんの 施設</span>
        <span className="flex items-center gap-1.5"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: 'var(--cw-danger)' }} />敵の 基地</span>
      </div>
    </div>
  );
};
