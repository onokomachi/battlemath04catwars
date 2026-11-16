import React, { useMemo, useState } from 'react';
import {
  CAMPAIGN, ASSIST_LEVELS, CampaignChapter, ChapterTier, TIER_ORDER, TIER_INFO, ENEMY_UNIT_STATS, ENEMY_TRAIT_NOTE,
  tierDifficulty, threatLevel, threatMultFor, chapterBaseLevel, cardLimitFor,
} from '../../data/campaign';
import { BATTLE_MAP_BY_ID, tierEnemyBase } from '../../data/battleMaps';
import { BUILDING_STATS } from '../../constants';
import { BattleLoadout, BuildingType, GRID_W, GRID_H } from '../../types';
import { useCampaignStore } from '../../store/useCampaignStore';
import { useBaseStore } from '../../store/useBaseStore';
import { DailyBuffsPanel } from '../learn/DailyBuffsPanel';
import { sfx } from '../../utils/audioEngine';

const font = { fontFamily: '"M PLUS Rounded 1c", sans-serif' };
const fontMono = { fontFamily: 'Orbitron, monospace' };

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

  return (
    <div className="min-h-[100dvh] h-[100dvh] flex flex-col overflow-hidden" style={font}>
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-white/10 flex-shrink-0"
        style={{ background: 'rgba(6,10,24,0.82)', backdropFilter: 'blur(12px)' }}>
        <button onClick={onBack} className="text-white/60 hover:text-white text-sm">← もどる</button>
        <h2 className="text-[#38bdf8] font-bold text-base" style={fontMono}>ステージをえらぶ</h2>
        <span className="ml-auto text-[11px] text-white/50" style={fontMono}>
          {progress}/{CAMPAIGN.length} 章クリア
        </span>
      </div>

      {/* Chapter rail */}
      <div className="flex gap-2 px-4 py-3 overflow-x-auto flex-shrink-0">
        {CAMPAIGN.map(ch => {
          const open = isUnlocked(ch.id);
          const done = clearedChapters.includes(ch.id);
          const active = ch.id === selectedId;
          return (
            <button
              key={ch.id}
              onClick={() => { sfx.select(); setSelectedId(ch.id); setTier('normal'); }}
              className="flex-shrink-0 flex flex-col items-center justify-center w-[72px] h-[72px] rounded-2xl border-2 transition-all active:scale-95"
              style={{
                borderColor: active ? '#ef4444' : done ? '#a3e635' : open ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.08)',
                background: active ? 'rgba(239,68,68,0.16)' : done ? 'rgba(163,230,53,0.10)' : 'rgba(255,255,255,0.04)',
                opacity: open ? 1 : 0.45,
                boxShadow: active ? '0 0 16px rgba(239,68,68,0.45)' : undefined,
              }}
            >
              <span className="text-[10px] text-white/50" style={fontMono}>第{ch.no}章</span>
              <span className="text-xl leading-none mt-0.5">{!open ? '🔒' : done ? '👑' : '⚔️'}</span>
              {done ? (
                // とった星（3段ぶん。最大9つ。まちがえずに解けた割合で決まる）
                <span className="text-[11px] mt-1 leading-none text-[#facc15]" style={fontMono} aria-label={`星 ${chapterStars(ch.id)}つ`}>
                  ★{chapterStars(ch.id)}<span className="text-white/35">/9</span>
                </span>
              ) : (
                <span className="text-[9px] mt-1" style={{ color: '#f87171' }}>
                  {'◆'.repeat(toughnessStars(ch))}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Selected chapter detail */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        <div className="rounded-2xl border p-4"
          style={{
            borderColor: 'rgba(239,68,68,0.35)',
            background: 'linear-gradient(160deg, rgba(37,99,235,0.14), rgba(239,68,68,0.12)), rgba(6,10,24,0.72)',
          }}>
          <div className="text-[11px] tracking-[0.25em] text-[#38bdf8]/80" style={fontMono}>
            CHAPTER {selected.no}
          </div>
          <h3 className="text-white font-black text-xl mt-1 leading-tight">{selected.title}</h3>

          {/* 難易度の段（ふつう → むずかしい → げきむず。前の段をクリアで開く）。星は段ごと */}
          <div className="mt-3 grid grid-cols-3 gap-2" role="radiogroup" aria-label="むずかしさ">
            {TIER_ORDER.map(t => {
              const info = TIER_INFO[t];
              const open = isTierUnlocked(selected.id, t);
              const on = t === tier;
              const st = starsFor(selected.id, t);
              return (
                <button key={t} role="radio" aria-checked={on} data-tier={t}
                  onClick={() => { sfx.select(); setTier(t); }}
                  className="rounded-xl border-2 px-1 py-2 flex flex-col items-center gap-0.5 transition-all active:scale-95"
                  style={{
                    borderColor: on ? info.color : `${info.color}55`,
                    background: on ? `${info.color}2e` : 'rgba(255,255,255,0.03)',
                    boxShadow: on ? `0 0 14px ${info.color}88` : undefined,
                    opacity: open ? 1 : 0.6,
                  }}>
                  <span className="text-[12px] font-black" style={{ color: info.color }}>{open ? '' : '🔒 '}{info.label}</span>
                  <span className="text-[11px] leading-none">
                    {[1, 2, 3].map(n => (
                      <span key={n} style={{ color: n <= st ? '#facc15' : 'rgba(255,255,255,0.2)' }}>★</span>
                    ))}
                  </span>
                  {!open && <span className="text-[9px] text-white/60 leading-tight text-center">{TIER_LOCK_NOTE[t]}</span>}
                </button>
              );
            })}
          </div>

          {/* この段に出てくる敵（とくべつな敵は アイコンと たおし方） */}
          <div className="mt-3 p-3 rounded-xl" data-testid="enemy-list"
            style={{ background: `${tierInfo.color}12`, border: `1px solid ${tierInfo.color}55` }}>
            <div className="font-bold text-[11px] mb-1.5" style={{ color: tierInfo.color, ...fontMono }}>▸ 出てくる 敵</div>
            <ul className="space-y-1">
              {td.unitPool.map(k => {
                const note = ENEMY_TRAIT_NOTE[k];
                return (
                  <li key={k} className="text-[11px] leading-snug text-white/85">
                    <span className="font-bold">{note ? `${note.icon} ` : '・'}{ENEMY_UNIT_STATS[k].label}</span>
                    {note && <span className="text-white/65">　{note.counter}</span>}
                  </li>
                );
              })}
              {td.bossAtSpawnCount != null && (
                <li className="text-[11px] leading-snug text-[#fde68a]">
                  <span className="font-bold">👑 ボス（{ENEMY_UNIT_STATS.boss.label}）</span>
                  {(td.bossShield ?? 0) > 0 && (
                    <span className="text-white/70">　シールド {td.bossShield}まい：ふくしゅうカードを といて わる</span>
                  )}
                </li>
              )}
            </ul>
          </div>

          {/* げきむず：カードの まいすう（正確に解くほど 多く出撃できる） */}
          {cardLimitFor(selected, tier, assist) != null && (
            <div className="mt-3 p-3 rounded-xl flex items-start gap-2" data-testid="card-limit"
              style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.4)' }}>
              <span className="text-lg leading-none">🃏</span>
              <div>
                <div className="text-[#fca5a5] font-bold text-xs">カードは {cardLimitFor(selected, tier, assist)} まいまで。まちがえずに とくほど 有利</div>
                <p className="text-white/70 text-[11px] leading-relaxed mt-0.5">
                  まちがえずに とけた カードは ⚡ に なる。ていねいに とくほど たくさん 出撃できるよ。
                  {assist > 0 && `（サポートモードで +${cardLimitFor(selected, tier, assist)! - cardLimitFor(selected, tier, 0)!} まい）`}
                </p>
              </div>
            </div>
          )}

          {/* 脅威レベル（隠れた調整はしない。強くなっているときは はっきり出す） */}
          {threat >= 1 && (
            <div className="mt-3 p-3 rounded-xl flex items-start gap-2" data-testid="threat"
              style={{ background: 'rgba(244,114,182,0.10)', border: '1px solid rgba(244,114,182,0.4)' }}>
              <span className="text-lg leading-none">⚠️</span>
              <div>
                <div className="text-[#f472b6] font-bold text-xs" style={fontMono}>脅威 Lv.{threat}</div>
                <p className="text-white/75 text-[11px] leading-relaxed mt-0.5">
                  手持ちが育っているぶん、敵も強くなっているよ（+{threatPct}%）。
                </p>
              </div>
            </div>
          )}

          {/* 敵の紹介 */}
          <div className="mt-3 flex items-start gap-3 p-3 rounded-xl"
            style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.28)' }}>
            <span className="text-2xl leading-none">😼</span>
            <div className="min-w-0">
              <div className="text-[#f87171] font-bold text-sm">{selected.enemyName}</div>
              <div className="text-white/45 text-[10px] mb-1.5">{selected.enemyTitle}</div>
              <p className="text-white/75 text-[11px] leading-relaxed">{selected.background}</p>
            </div>
          </div>

          {/* 作戦ブリーフィング */}
          <div className="mt-3 p-3 rounded-xl"
            style={{ background: 'rgba(56,189,248,0.08)', border: '1px solid rgba(56,189,248,0.25)' }}>
            <div className="text-[#38bdf8] font-bold text-[11px] mb-1" style={fontMono}>▸ さくせん</div>
            <p className="text-white/80 text-xs leading-relaxed">{selected.briefing}</p>
            <p className="text-[#facc15]/90 text-[11px] leading-relaxed mt-1.5">💡 {selected.hint}</p>
          </div>

          {/* 戦場情報 */}
          <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
            <span className="px-2.5 py-1 rounded-full bg-white/5 border border-white/12 text-white/70">
              🗺 {map?.name ?? '???'}
            </span>
            <span className="px-2.5 py-1 rounded-full border text-[#f87171]"
              style={{ background: 'rgba(239,68,68,0.10)', borderColor: 'rgba(239,68,68,0.3)' }}>
              手ごわさ {'◆'.repeat(toughnessStars(selected, tier))}
            </span>
            <span className="px-2.5 py-1 rounded-full border text-[#38bdf8]"
              style={{ background: 'rgba(56,189,248,0.10)', borderColor: 'rgba(56,189,248,0.3)' }}>
              勝利報酬 💠{Math.round(selected.rewardCredits * tierInfo.rewardMult)}
            </span>
          </div>

          {/* サポートモードの明示（隠れた調整はしない設計） */}
          {assist > 0 && (
            <div className="mt-3 p-3 rounded-xl flex items-start gap-2"
              style={{ background: 'rgba(163,230,53,0.10)', border: '1px solid rgba(163,230,53,0.35)' }}>
              <span className="text-lg leading-none">🛟</span>
              <div>
                <div className="text-[#a3e635] font-bold text-xs">{ASSIST_LEVELS[assist].label} ON</div>
                <p className="text-white/70 text-[11px] leading-relaxed mt-0.5">
                  {ASSIST_LEVELS[assist].description}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* この章の戦場と、いま組んである陣地のプレビュー */}
        <div className="mt-3 rounded-2xl border border-white/10 p-3" style={{ background: 'rgba(6,10,24,0.55)' }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-white/70 text-xs font-bold" style={fontMono}>この章の戦場</span>
            <span className="text-[#a3e635] text-[10px]">
              自陣 {zoneW}×{zoneH}マス{zoneW >= 9 ? '（ひろい）' : zoneW <= 5 ? '（せまい）' : ''}
            </span>
          </div>
          {map && <DeploymentPreview map={map} enemyBase={enemyBase} deployments={deployments} />}
          <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-[10px] text-white/55">
            <span>🏰 コア×1</span>
            <span>🧱 壁×{deployments.filter(d => d.type === BuildingType.WALL).length}/{loadout.maxWallSlots}</span>
            <span>💣 砲台×{deployments.filter(d => d.type === BuildingType.CANNON).length}</span>
            <span>⚡ 電撃トラップ×{deployments.filter(d => d.type === BuildingType.HIDDEN_TESLA).length}</span>
            <span>⛺ キャンプ×{deployments.filter(d => d.type === BuildingType.ARMY_CAMP).length}</span>
          </div>
        </div>

        {/* 出撃バフ（旧・作戦立案画面から移設） */}
        <div className="mt-3 rounded-2xl border border-white/10 p-3" style={{ background: 'rgba(6,10,24,0.55)' }}>
          <DailyBuffsPanel compact />
        </div>
      </div>

      {/* Launch */}
      <div className="border-t border-white/10 px-4 pt-3 flex-shrink-0"
        style={{ background: 'rgba(6,10,24,0.92)', paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}>
        <button
          onClick={() => { if (unlocked) { sfx.select(); onStart(selected.id, tier); } }}
          disabled={!unlocked}
          className="w-full py-4 rounded-xl font-bold text-lg transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            ...fontMono,
            background: unlocked ? `${tierInfo.color}2e` : 'transparent',
            border: `2px solid ${unlocked ? tierInfo.color : '#6b7280'}`,
            color: unlocked ? '#fff' : '#9ca3af',
            boxShadow: unlocked ? `0 0 16px ${tierInfo.color}88` : 'none',
          }}>
          {unlocked
            ? `🐱 第${selected.no}章${tier === 'normal' ? '' : `（${tierInfo.label}）`}の 出撃メンバーを えらぶ →`
            : `🔒 ${TIER_LOCK_NOTE[tier]}`}
        </button>
      </div>
    </div>
  );
};

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
    <div className="overflow-x-auto">
      <div style={{ position: 'relative', width: GRID_W * CELL, height: GRID_H * CELL, margin: '0 auto' }}>
        {Array.from({ length: GRID_H }, (_, y) =>
          Array.from({ length: GRID_W }, (_, x) => {
            const t = terrainAt(x, y);
            const inZone = x >= zone.xMin && x <= zone.xMax && y >= zone.yMin && y <= zone.yMax;
            const d = deployAt(x, y);
            const e = !d && enemyAt(x, y);
            const isTopLeft = d && d.x === x && d.y === y;
            return (
              <div key={`${x}-${y}`}
                style={{
                  position: 'absolute', left: x * CELL, top: y * CELL, width: CELL, height: CELL,
                  background: t === 'WATER' ? '#1d4ed8'
                    : t === 'ROCK' ? '#374151'
                    : t === 'SWAMP' ? 'rgba(20,83,45,0.85)'
                    : t === 'LAVA' ? '#b91c1c'
                    : t === 'BRIDGE' ? '#92400e'
                    : inZone ? 'rgba(56,189,248,0.10)' : 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.04)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 8, lineHeight: 1,
                }}>
                {isTopLeft && <span style={{ filter: 'drop-shadow(0 0 3px #22d3ee)' }}>{BUILDING_STATS[d!.type].icon || '🧱'}</span>}
                {e && <span style={{ opacity: 0.55 }}>{BUILDING_STATS[e.type].icon || '🧱'}</span>}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
