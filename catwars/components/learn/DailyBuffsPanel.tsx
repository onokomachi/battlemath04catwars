import React from 'react';
import { useProgressStore, BUFF_CONFIG, BUFF_TIERS, BUFF_LEVEL_INFO, buffTierUnlocked } from '../../store/useProgressStore';
import { BuffType, BuffTier } from '../../types';
import { sfx } from '../../utils/audioEngine';

const TIER_ORDER: BuffTier[] = [1, 2, 3, 4];
const BUFFS_BY_TIER: Record<BuffTier, BuffType[]> = {
  1: ['FAST_DEPLOY', 'COST_REDUCTION', 'GOLD_RUSH', 'GOLD_BOOST'],
  2: ['RARE_BARBARIAN', 'RARE_ARCHER', 'POWER_BOOST', 'EXTRA_TROOPS', 'SWIFT_ARMY'],
  3: ['HEAL_AURA', 'GIANT_FORTRESS', 'DOUBLE_LOOT', 'WIZARD_SUPPORT'],
  4: ['DRAGON_SUMMON', 'ARMAGEDDON', 'GENIUS_COMMANDER'],
};
const LEVEL_LABELS: Record<1 | 2 | 3, string> = { 1: '小', 2: '中', 3: '大' };
const LEVEL_COLORS: Record<1 | 2 | 3, string> = { 1: '#94a3b8', 2: '#22d3ee', 3: '#facc15' };

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

  // ── compact view ──
  if (compact) {
    const buyable = TIER_ORDER
      .filter(t => buffTierUnlocked(t, todayCount, loginStreak))
      .flatMap(t => BUFFS_BY_TIER[t]);
    return (
      <div className="w-full" style={{ fontFamily: '"M PLUS Rounded 1c", sans-serif' }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold" style={{ color: '#22d3ee', fontFamily: 'Orbitron, monospace' }}>きょうのバフ</span>
          <div className="flex items-center gap-1">
            <span className="text-sm">⚡</span>
            <span className="text-[#facc15] font-bold text-sm" style={{ fontFamily: 'Orbitron, monospace' }}>{currentDS}</span>
            <span className="text-white/40 text-xs">デイリー</span>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {buyable.map(type => {
            const cfg = BUFF_CONFIG[type];
            const lv = getBuffLevel(type);
            const nextCost = getNextCost(type);
            const canUpgrade = lv < 3 && currentDS >= nextCost;
            const tierColor = BUFF_TIERS[cfg.tier].color;
            return (
              <button
                key={type}
                onClick={() => lv < 3 && handleBuy(type)}
                disabled={lv >= 3 || !canUpgrade}
                className="flex-shrink-0 flex flex-col items-center gap-0.5 p-2 rounded-xl border transition-all active:scale-95"
                style={{
                  minWidth: 64,
                  borderColor: lv >= 3 ? '#facc15' : lv > 0 ? LEVEL_COLORS[lv as 1|2|3] : canUpgrade ? tierColor : 'rgba(255,255,255,0.1)',
                  background: lv > 0 ? `${LEVEL_COLORS[lv as 1|2|3]}1a` : 'rgba(255,255,255,0.03)',
                  opacity: (!canUpgrade && lv === 0) ? 0.4 : 1,
                }}
              >
                <span className="text-lg">{cfg.icon}</span>
                <span className="text-[9px] font-bold text-white/80 text-center leading-tight">{cfg.label}</span>
                {lv >= 3
                  ? <span className="text-[9px] text-[#facc15] font-bold">大✓最強</span>
                  : lv > 0
                    ? <span className="text-[9px] font-bold" style={{ color: LEVEL_COLORS[lv as 1|2|3] }}>
                        {LEVEL_LABELS[lv as 1|2|3]}✓ → {LEVEL_LABELS[(lv+1) as 1|2|3] ?? ''}({nextCost}⚡)
                      </span>
                    : <span className="text-[9px] font-bold" style={{ color: tierColor }}>{nextCost}⚡(小)</span>
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
    <div className="w-full" style={{ fontFamily: '"M PLUS Rounded 1c", sans-serif' }}>
      <div className="flex items-center gap-2 mb-3 p-3 rounded-xl"
        style={{ background: 'rgba(250,204,21,0.08)', border: '1px solid rgba(250,204,21,0.2)' }}>
        <span className="text-2xl">⚡</span>
        <div className="flex-1">
          <div className="text-[#facc15] font-bold text-lg" style={{ fontFamily: 'Orbitron, monospace' }}>{currentDS}</div>
          <div className="text-white/50 text-xs">エナジー（きょうかぎり）</div>
        </div>
        <div className="text-right">
          <div className="text-white/70 text-xs">きょう <span className="text-[#a3e635] font-bold">{todayCount}</span>問</div>
          <div className="text-white/70 text-xs">連続 <span className="text-[#fb923c] font-bold">{loginStreak}</span>日</div>
        </div>
      </div>

      <p className="text-white/40 text-[11px] mb-1 leading-relaxed">
        バフは 小→中→大 の3段階でパワーアップできるよ。強化するたびにスターが必要！
      </p>
      <div className="flex gap-2 mb-3 text-[10px]">
        {([1,2,3] as (1|2|3)[]).map(lv => (
          <span key={lv} className="px-2 py-0.5 rounded-full font-bold" style={{ background: `${LEVEL_COLORS[lv]}22`, color: LEVEL_COLORS[lv], border: `1px solid ${LEVEL_COLORS[lv]}55` }}>
            {LEVEL_LABELS[lv]} {lv === 1 ? '×0.6' : lv === 2 ? '×1.0' : '×1.6'}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-4">
        {TIER_ORDER.map(tier => {
          const info = BUFF_TIERS[tier];
          const unlocked = buffTierUnlocked(tier, todayCount, loginStreak);
          return (
            <div key={tier}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-black px-2 py-0.5 rounded-full"
                  style={{ color: '#0a0e1a', background: info.color, fontFamily: 'Orbitron, monospace' }}>T{tier}</span>
                <span className="text-sm font-bold" style={{ color: info.color }}>{info.name}</span>
                {!unlocked && <span className="text-[10px] text-white/40">🔒 {info.unlockLabel}で解放</span>}
              </div>
              <div className="flex flex-col gap-2" style={{ opacity: unlocked ? 1 : 0.55 }}>
                {BUFFS_BY_TIER[tier].map(type => {
                  const cfg = BUFF_CONFIG[type];
                  const lv = getBuffLevel(type);
                  const nextCost = getNextCost(type);
                  const canUpgrade = unlocked && lv < 3 && currentDS >= nextCost;
                  return (
                    <div key={type}
                      className="flex items-center gap-3 p-2.5 rounded-xl"
                      style={{
                        border: `1px solid ${lv >= 3 ? '#facc1566' : lv > 0 ? `${LEVEL_COLORS[lv as 1|2|3]}55` : `${info.color}33`}`,
                        background: lv >= 3 ? 'rgba(250,204,21,0.08)' : lv > 0 ? `${LEVEL_COLORS[lv as 1|2|3]}11` : 'rgba(255,255,255,0.03)',
                      }}>
                      <span className="text-2xl flex-shrink-0">{cfg.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-white/90 font-bold text-sm truncate">{cfg.label}</span>
                          {lv > 0 && (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: LEVEL_COLORS[lv as 1|2|3], color: '#0a0e1a' }}>
                              {LEVEL_LABELS[lv as 1|2|3]}
                            </span>
                          )}
                        </div>
                        <div className="text-white/50 text-xs mt-0.5 leading-tight">{cfg.description}</div>
                        <div className="flex gap-1 mt-1">
                          {([1,2,3] as (1|2|3)[]).map(l => (
                            <span key={l} className="text-[9px] px-1.5 py-0.5 rounded font-bold"
                              style={{
                                background: lv === l ? LEVEL_COLORS[l] : `${LEVEL_COLORS[l]}22`,
                                color: lv === l ? '#0a0e1a' : LEVEL_COLORS[l],
                                opacity: lv >= l ? 1 : 0.5,
                              }}>
                              {LEVEL_LABELS[l]} {effectText(type, l)}
                            </span>
                          ))}
                        </div>
                      </div>
                      {lv >= 3 ? (
                        <div className="flex-shrink-0 flex flex-col items-center">
                          <span className="text-[#facc15] text-lg">★</span>
                          <span className="text-[#facc15] text-[10px] font-bold">最強</span>
                        </div>
                      ) : !unlocked ? (
                        <span className="flex-shrink-0 text-white/30 text-lg">🔒</span>
                      ) : (
                        <button
                          onClick={() => handleBuy(type)}
                          disabled={!canUpgrade}
                          className="flex-shrink-0 flex flex-col items-center px-3 py-1.5 rounded-lg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{
                            border: `1.5px solid ${canUpgrade ? '#facc15' : 'rgba(255,255,255,0.2)'}`,
                            background: canUpgrade ? 'rgba(250,204,21,0.12)' : 'transparent',
                          }}>
                          <span className="text-[9px] text-white/60 leading-none">{lv > 0 ? `${LEVEL_LABELS[lv as 1|2|3]}→${LEVEL_LABELS[(lv+1) as 1|2|3]}` : '小から'}</span>
                          <span className="text-[#facc15] font-bold text-sm" style={{ fontFamily: 'Orbitron, monospace' }}>{nextCost}</span>
                          <span className="text-sm leading-none">⚡</span>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-center text-xs mt-3" style={{ color: activeBuffs.length ? '#a3e635' : 'rgba(255,255,255,0.4)' }}>
        {activeBuffs.length > 0
          ? `✅ ${activeBuffs.length}つのバフが有効 — きょうの戦闘に反映されます`
          : '⚡ を使ってバフを有効にしよう！'}
      </p>
    </div>
  );
};
