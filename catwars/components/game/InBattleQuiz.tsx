import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppRoundHost } from '../../learn/AppRoundHost';
import { loadPack, rewardWeight, type PackRound, type RoundRegistry } from '../../learn/gradePack';
import { sfx } from '../../utils/audioEngine';

interface Props {
  /** 出撃前にえらんだ単元の鍵（gradePack の PackUnit.key） */
  unitKeys: string[];
  /** むずかしさ3の問題を、まちがえずに解いたときの基準エナジー */
  baseReward?: number;
  onReward: (energy: number) => void;
  /** 1問ごとの結果（記録用）。perfect＝一度もまちがえなかった */
  onAnswered?: (item: PackRound, perfect: boolean) => void;
  onClose: () => void;
}

const shuffle = <T,>(a: T[]): T[] => {
  const r = a.slice();
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  return r;
};

/**
 * 戦闘中のクイズ。出撃前にえらんだ単元から、SOL の単元アプリと同じ問題・同じ答え方で出す。
 * 一度もまちがえずに解くと ⚡エナジー（むずかしい項目ほど多い・連続でボーナス）。
 * まちがえても罰はない：アプリのヒントでさいごまで解き直せる（その問題の ⚡ は無し・コンボは切れる）。
 */
export const InBattleQuiz: React.FC<Props> = ({ unitKeys, baseReward = 34, onReward, onAnswered, onClose }) => {
  const [pack, setPack] = useState<{ registry: RoundRegistry; rounds: PackRound[] } | null>(null);
  useEffect(() => { let on = true; void loadPack().then((p) => { if (on) setPack(p); }); return () => { on = false; }; }, []);

  const pool = useMemo(
    () => (pack ? shuffle(pack.rounds.filter((r) => unitKeys.includes(r.unitKey))) : []),
    [pack, unitKeys],
  );
  const [idx, setIdx] = useState(0);
  const item = pool.length ? pool[idx % pool.length] : null;
  const [combo, setCombo] = useState(0);
  const [result, setResult] = useState<'perfect' | 'missed' | null>(null);
  const [solved, setSolved] = useState(false);
  const [gained, setGained] = useState(0);
  const comboRef = useRef(0);

  /** 連続でまちがえずに解くと増える。上限 ×2.0 */
  const comboMultiplier = (n: number): number => Math.min(2.0, 1 + (n - 1) * 0.2);
  const reward = item ? Math.round(baseReward * rewardWeight(item.difficulty)) : 0;

  const onFirstResult = useCallback((perfect: boolean) => {
    if (!item) return;
    onAnswered?.(item, perfect);
    if (perfect) {
      const n = comboRef.current + 1;
      comboRef.current = n; setCombo(n);
      const total = Math.round(reward * comboMultiplier(n));
      setGained(total); setResult('perfect'); sfx.correct(); onReward(total);
    } else {
      comboRef.current = 0; setCombo(0);
      setResult('missed'); sfx.incorrect();
    }
  }, [item, reward, onReward, onAnswered]);

  const next = useCallback(() => { setIdx((i) => i + 1); setResult(null); setSolved(false); setGained(0); }, []);

  return (
    <div className="fixed inset-0 z-[140] flex flex-col" style={{ background: 'rgba(3,6,16,0.34)', backdropFilter: 'blur(1.5px)' }}>
      <div className="flex items-center gap-3 p-3 border-b border-[#facc15]/25 flex-wrap" style={{ background: 'rgba(3,6,16,0.92)' }}>
        <span className="text-[#facc15] font-bold text-sm" style={{ fontFamily: 'Orbitron, monospace' }}>⚡ エナジーチャージ</span>
        {combo > 0 && (
          <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-[#facc15]/15 text-[#facc15] border border-[#facc15]/40">{combo} コンボ！</span>
        )}
        {item && (
          <span className="text-[11px] font-black px-2 py-0.5 rounded-full whitespace-nowrap bg-sky-400/10 border border-sky-400/40 text-sky-300">
            {item.label}　+{reward}⚡
          </span>
        )}
        <button onClick={onClose} className="ml-auto text-white/60 hover:text-white text-sm px-3 py-1 rounded-lg border border-white/15">戦場へもどる ✕</button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 flex flex-col items-center">
        {!pack ? (
          <div className="text-white/70 text-sm mt-16">よみこみ中…</div>
        ) : !item ? (
          <div className="text-white/70 text-sm mt-16 text-center">この範囲に、出せる問題がありません。べつの範囲をえらぼう。</div>
        ) : (
          <div className="w-full max-w-2xl">
            {result === 'perfect' && (
              <div className="text-center mb-2 rounded-xl py-2 font-black text-[#a3e635] border border-[#a3e635]/50" style={{ background: 'rgba(8,12,22,0.95)' }}>
                ✓ せいかい！ +{gained}⚡{combo >= 2 ? `　🔥${combo}コンボ ×${comboMultiplier(combo).toFixed(1)}` : ''}
              </div>
            )}
            {result === 'missed' && (
              <div className="text-center mb-2 rounded-xl py-2 text-sm font-bold text-amber-200 border border-amber-300/40" style={{ background: 'rgba(8,12,22,0.95)' }}>
                {solved ? 'さいごまで とけたね。つぎは ⚡ を とろう！' : 'ヒントを見て、さいごまで といてみよう（この問題の ⚡ は つぎの問題で）'}
              </div>
            )}
            <AppRoundHost key={`${idx}`} registry={pack.registry} item={item} onFirstResult={onFirstResult} onSolved={() => setSolved(true)} />
            {(result === 'perfect' || solved || result === 'missed') && (
              <button onClick={next}
                className="w-full mt-3 py-3 rounded-xl font-black text-lg transition-all active:scale-95"
                style={{ background: 'rgba(163,230,53,0.22)', border: '2px solid #a3e635', color: '#a3e635' }}>
                つぎの問題へ →
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
