import React from 'react';
import { useProgressStore, BUFF_CONFIG, BUFF_TIERS, BUFF_LEVEL_INFO, buffTierUnlocked } from '../../store/useProgressStore';
import { BuffType, BuffTier } from '../../types';
import { sfx } from '../../utils/audioEngine';
import { Button, Chip, Icon, Notice, Panel, SectionTitle, BUFF_ICON, iconOr, type Tone } from '../ui';

const TIER_ORDER: BuffTier[] = [1, 2, 3, 4];
const BUFFS_BY_TIER: Record<BuffTier, BuffType[]> = {
  1: ['FAST_DEPLOY', 'COST_REDUCTION', 'GOLD_RUSH', 'GOLD_BOOST'],
  2: ['RARE_BARBARIAN', 'RARE_ARCHER', 'POWER_BOOST', 'EXTRA_TROOPS', 'SWIFT_ARMY'],
  3: ['HEAL_AURA', 'GIANT_FORTRESS', 'DOUBLE_LOOT', 'WIZARD_SUPPORT'],
  4: ['DRAGON_SUMMON', 'ARMAGEDDON', 'GENIUS_COMMANDER'],
};
const LEVEL_LABELS: Record<1 | 2 | 3, string> = { 1: '小', 2: '中', 3: '大' };
/** 小＝ふつう・中＝行動・大＝ごほうび（役目の色） */
const LEVEL_TONE: Record<1 | 2 | 3, Tone> = { 1: 'neutral', 2: 'action', 3: 'reward' };
/** 段（ブロンズ…でんせつ）の 色の役目 */
const TIER_TONE: Record<BuffTier, Tone> = { 1: 'neutral', 2: 'action', 3: 'rare', 4: 'reward' };

interface Props { compact?: boolean; }

export const DailyBuffsPanel: React.FC<Props> = ({ compact }) => {
  const { getTodayBuffs, buyDailyBuff, dailyStars, dailyStarsDate, todayAnswered, lastPlayDate, loginStreak, lastBuffDate } =
    useProgressStore();
  const today = new Date().toISOString().slice(0, 10);
  const currentDS = dailyStarsDate === today ? dailyStars : 0;
  const todayCount = lastPlayDate === today ? todayAnswered : 0;
  const activeBuffs = getTodayBuffs();

  const getBuffLevel = (type: BuffType): 0 | 1 | 2 | 3 => {
    if (lastBuffDate !== today) return 0;
    const b = activeBuffs.find(b => b.type === type);
    return b ? ((b.level ?? 2) as 0 | 1 | 2 | 3) : 0;
  };

  const getNextCost = (type: BuffType): number => {
    const cfg = BUFF_CONFIG[type];
    const lv = getBuffLevel(type);
    if (lv >= 3) return 0;
    const costs = [0, Math.round(cfg.cost * 0.6), cfg.cost, Math.round(cfg.cost * 1.6)];
    return costs[lv + 1] - costs[lv];
  };

  const handleBuy = (type: BuffType) => {
    if (buyDailyBuff(type)) sfx.correct();
    else sfx.incorrect();
  };

  const effectText = (type: BuffType, lv: 1 | 2 | 3): string => {
    const info = (BUFF_LEVEL_INFO as Record<string, { values: number[]; unit: string }>)[type];
    if (!info) return '';
    return `${info.values[lv - 1]}${info.unit}`;
  };

  // ── compact view（ステージえらびの下） ──
  if (compact) {
    const buyable = TIER_ORDER
      .filter(t => buffTierUnlocked(t, todayCount, loginStreak))
      .flatMap(t => BUFFS_BY_TIER[t]);
    return (
      <div className="w-full">
        <div className="flex items-center justify-between mb-2">
          <SectionTitle tone="action">きょうのバフ</SectionTitle>
          <div className="flex items-center gap-1.5">
            <Icon name="energy" size={22} />
            <span className="font-cw-num font-bold text-cw-16" style={{ color: 'var(--cw-reward)' }}>{currentDS}</span>
            <span className="text-cw-12" style={{ color: 'var(--cw-fg-3)' }}>デイリー</span>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto cw-scroll pb-1">
          {buyable.map(type => {
            const cfg = BUFF_CONFIG[type];
            const lv = getBuffLevel(type);
            const nextCost = getNextCost(type);
            const canUpgrade = lv < 3 && currentDS >= nextCost;
            return (
              <button
                key={type}
                type="button"
                onClick={() => lv < 3 && handleBuy(type)}
                disabled={lv >= 3 || !canUpgrade}
                className={`cw-seg cw-press cw-tone-${lv > 0 ? LEVEL_TONE[lv as 1 | 2 | 3] : TIER_TONE[cfg.tier]} flex-shrink-0 flex flex-col items-center justify-center gap-0.5 px-2 py-2 min-h-[88px] ${lv > 0 ? 'is-on' : ''}`}
                style={{ minWidth: 96 }}
              >
                <Icon name={iconOr(BUFF_ICON, type)} size={30} />
                <span className="text-cw-12 font-bold text-center leading-tight" style={{ color: 'var(--cw-fg)' }}>{cfg.label}</span>
                {lv >= 3
                  ? <span className="text-cw-12 font-bold" style={{ color: 'var(--cw-reward)' }}>大 最強</span>
                  : lv > 0
                    ? <span className="text-cw-12 font-bold font-cw-num" style={{ color: 'var(--cw-fg-2)' }}>{LEVEL_LABELS[lv as 1 | 2 | 3]}→{LEVEL_LABELS[(lv + 1) as 1 | 2 | 3]}・{nextCost}</span>
                    : <span className="text-cw-12 font-bold font-cw-num" style={{ color: 'var(--cw-reward)' }}>小・{nextCost}</span>
                }
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // ── full view ──
  return (
    <div className="w-full max-w-2xl mx-auto space-y-4">
      <Panel className="cw-tone-reward">
        <div className="flex items-center gap-3">
          <Icon name="energy" size={48} />
          <div className="flex-1 min-w-0">
            <div className="font-cw-num font-black text-cw-40 leading-none" style={{ color: 'var(--cw-reward)' }}>{currentDS}</div>
            <div className="text-cw-14 mt-1" style={{ color: 'var(--cw-fg-2)' }}>エナジー（きょうかぎり）</div>
          </div>
          <div className="text-right text-cw-14 space-y-1" style={{ color: 'var(--cw-fg-2)' }}>
            <div>きょう <b className="font-cw-num text-cw-16" style={{ color: 'var(--cw-growth)' }}>{todayCount}</b>問</div>
            <div className="flex items-center justify-end gap-1"><Icon name="streak" size={20} />連続 <b className="font-cw-num text-cw-16" style={{ color: 'var(--cw-cat)' }}>{loginStreak}</b>日</div>
          </div>
        </div>
      </Panel>

      <div>
        <p className="text-cw-14 leading-relaxed" style={{ color: 'var(--cw-fg-2)' }}>
          バフは 小→中→大 の3段階で パワーアップできるよ。強化するたびに エナジーが 必要！
        </p>
        <div className="flex gap-2 mt-2">
          {([1, 2, 3] as (1 | 2 | 3)[]).map(lv => (
            <Chip key={lv} tone={LEVEL_TONE[lv]} className="font-cw-num">{LEVEL_LABELS[lv]} {lv === 1 ? '×0.6' : lv === 2 ? '×1.0' : '×1.6'}</Chip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {TIER_ORDER.map(tier => {
          const info = BUFF_TIERS[tier];
          const unlocked = buffTierUnlocked(tier, todayCount, loginStreak);
          return (
            <section key={tier} data-tier={tier}>
              <SectionTitle tone={TIER_TONE[tier]}
                right={!unlocked ? <span className="inline-flex items-center gap-1"><Icon name="lock" size={16} />{info.unlockLabel}で ひらく</span> : undefined}>
                <span className="font-cw-num">T{tier}</span> {info.name}
              </SectionTitle>
              <div className="flex flex-col gap-2 mt-2">
                {BUFFS_BY_TIER[tier].map(type => {
                  const cfg = BUFF_CONFIG[type];
                  const lv = getBuffLevel(type);
                  const nextCost = getNextCost(type);
                  const canUpgrade = unlocked && lv < 3 && currentDS >= nextCost;
                  return (
                    <div key={type} className={`cw-card cw-tone-${lv > 0 ? LEVEL_TONE[lv as 1 | 2 | 3] : TIER_TONE[tier]} flex items-center gap-3 p-3`}
                      aria-disabled={!unlocked || undefined}
                      style={lv >= 3 ? { boxShadow: 'var(--cw-shadow-panel), var(--cw-lit-reward)' } : undefined}>
                      <span className="cw-card-icon"><Icon name={iconOr(BUFF_ICON, type)} size={34} /></span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-extrabold text-cw-14" style={{ color: unlocked ? 'var(--cw-fg)' : 'var(--cw-fg-2)' }}>{cfg.label}</span>
                          {lv > 0 && <Chip tone={LEVEL_TONE[lv as 1 | 2 | 3]}>{LEVEL_LABELS[lv as 1 | 2 | 3]}</Chip>}
                        </div>
                        <div className="text-cw-12 mt-0.5 leading-tight" style={{ color: 'var(--cw-fg-2)' }}>{cfg.description}</div>
                        <div className="flex gap-1 mt-1.5 flex-wrap">
                          {([1, 2, 3] as (1 | 2 | 3)[]).map(l => (
                            <Chip key={l} tone={lv >= l ? LEVEL_TONE[l] : 'neutral'} className="font-cw-num">
                              <span style={lv >= l ? undefined : { color: 'var(--cw-fg-3)' }}>{LEVEL_LABELS[l]} {effectText(type, l)}</span>
                            </Chip>
                          ))}
                        </div>
                      </div>
                      {lv >= 3 ? (
                        <Chip tone="reward" className="flex-shrink-0"><Icon name="star" size={18} />最強</Chip>
                      ) : !unlocked ? (
                        <Icon name="lock" size={30} className="flex-shrink-0" />
                      ) : (
                        <Button variant={canUpgrade ? 'reward' : 'secondary'} size="md" onClick={() => handleBuy(type)} disabled={!canUpgrade}
                          data-testid={`buff-buy-${type}`} className="flex-shrink-0 !flex-col !gap-0 !px-3 !py-1 min-w-[88px]">
                          <span className="text-cw-12 font-bold leading-tight">{lv > 0 ? `${LEVEL_LABELS[lv as 1 | 2 | 3]}→${LEVEL_LABELS[(lv + 1) as 1 | 2 | 3]}` : '小から'}</span>
                          <span className="flex items-center gap-0.5 font-cw-num font-black text-cw-16 leading-tight"><Icon name="energy" size={18} />{nextCost}</span>
                        </Button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      <Notice tone={activeBuffs.length ? 'growth' : 'neutral'} icon={activeBuffs.length ? 'check' : 'energy'}>
        {activeBuffs.length > 0
          ? `${activeBuffs.length}つのバフが 有効 ー きょうの 戦闘に 反映されます`
          : 'エナジーを 使って バフを 有効にしよう！'}
      </Notice>
    </div>
  );
};
