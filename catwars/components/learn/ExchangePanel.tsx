import React, { useState } from 'react';
import { useProgressStore } from '../../store/useProgressStore';
import { usePlayerStore } from '../../store/usePlayerStore';
import { CHARACTERS, CHARACTER_BY_ID } from '../../data/characters';
import { sfx } from '../../utils/audioEngine';
import { ConfirmDialog } from '../ui/ConfirmDialog';

const font = { fontFamily: '"M PLUS Rounded 1c", sans-serif' };
const fontMono = { fontFamily: 'Orbitron, monospace' };

// レアネコの解放コスト（💠クレジット・永続）。ボスは高価。
const creditCostFor = (id: string): number => (id.startsWith('boss') ? 1500 : 500);

export const ExchangePanel: React.FC = () => {
  const { permanentUnlocks, addPermanentUnlock } = useProgressStore();
  const { resources, spendResources } = usePlayerStore();
  const credits = Math.floor(resources.gold);
  const [flash, setFlash] = useState<string | null>(null);
  const [pending, setPending] = useState<{ id: string; cost: number } | null>(null);

  const isUnlocked = (id: string) => permanentUnlocks.includes(id);
  // ふつうの系統は 兵舎の数で開く（基地の 兵舎）。ここは ボスの系統だけ（2026-11-15 CW-4a）
  const rares = CHARACTERS.filter(c => c.id.startsWith('boss'));

  const confirmBuy = () => {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (!spendResources(p.cost)) { sfx.incorrect(); return; }
    addPermanentUnlock(p.id);
    sfx.correct();
    setFlash(p.id);
    setTimeout(() => setFlash(null), 600);
  };

  return (
    <div className="w-full max-w-sm mx-auto" style={font}>
      <div className="flex items-center gap-2 mb-4 bg-white/5 rounded-2xl p-3">
        <span className="text-2xl">💠</span>
        <div>
          <span className="text-[#38bdf8] text-xl font-bold" style={fontMono}>{credits}</span>
          <span className="text-white/60 text-xs ml-2">クレジット（永続）</span>
        </div>
      </div>
      <p className="text-white/40 text-xs mb-4" style={font}>
        💠 をつかうと、ボスの宇宙ネコを<b style={{ color: '#a3e635' }}>ずっと</b>つかえるようになるよ。
        ほかの系統は、陣地づくりで 兵舎を ふやすと ひらく。
      </p>

      <div className="flex flex-col gap-2.5">
        {rares.map((c) => {
          const cost = creditCostFor(c.id);
          const owned = isUnlocked(c.id);
          const canAfford = !owned && credits >= cost;
          const isFlashing = flash === c.id;
          const isBoss = c.id.startsWith('boss');
          return (
            <div key={c.id}
              className="flex items-center gap-3 px-3 py-2.5 rounded-xl border transition-all"
              style={{
                borderColor: isFlashing ? '#a3e635' : owned ? 'rgba(163,230,53,0.4)' : `${c.accent}55`,
                background: isFlashing ? 'rgba(163,230,53,0.15)' : owned ? 'rgba(163,230,53,0.08)' : 'rgba(255,255,255,0.04)',
              }}>
              <div className="w-10 h-10 flex-shrink-0 flex items-center justify-center rounded-lg"
                style={{ background: `${c.accent}22`, border: `1px solid ${c.accent}66` }}>
                <span className="text-xl">{isBoss ? '👾' : '🐱'}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-white/90 font-bold text-sm truncate">{c.forms[0].name}</span>
                  {isBoss && <span className="text-[8px] font-black px-1 rounded bg-[#f43f5e] text-white">BOSS</span>}
                </div>
                <div className="text-white/40 text-[10px] mt-0.5 leading-snug truncate">{c.role}</div>
              </div>
              {owned ? (
                <span className="text-[#a3e635] text-xs font-bold flex-shrink-0" style={fontMono}>解放ずみ ✓</span>
              ) : (
                <button
                  onClick={() => setPending({ id: c.id, cost })}
                  disabled={!canAfford}
                  className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                  style={{
                    background: canAfford ? 'rgba(56,189,248,0.15)' : 'rgba(255,255,255,0.05)',
                    border: `1.5px solid ${canAfford ? '#38bdf8' : 'rgba(255,255,255,0.2)'}`,
                  }}>
                  <span className="text-[#38bdf8] font-bold text-sm" style={fontMono}>{cost}</span>
                  <span className="text-base">💠</span>
                </button>
              )}
            </div>
          );
        })}
      </div>

      <p className="text-white/50 text-xs text-center mt-4" style={font}>
        もんだいを といて 💠 を あつめよう！
      </p>

      <ConfirmDialog
        open={pending !== null}
        accent="#38bdf8"
        title="クレジットを つかう？"
        message={pending ? (
          <>💠 <b style={{ color: '#38bdf8' }}>{pending.cost}</b> をつかって<br />
            「{CHARACTER_BY_ID[pending.id]?.forms[0].name}」を <b style={{ color: '#a3e635' }}>ずっと</b> 解放します。いい？</>
        ) : ''}
        confirmLabel="解放する"
        onConfirm={confirmBuy}
        onCancel={() => setPending(null)}
      />
    </div>
  );
};
