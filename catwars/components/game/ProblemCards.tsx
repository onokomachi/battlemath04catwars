import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppRoundHost } from '../../learn/AppRoundHost';
import { loadPack, rewardWeight, PACK_UNITS, type PackRound, type RoundRegistry } from '../../learn/gradePack';
import { sfx } from '../../utils/audioEngine';

/**
 * 問題カード（戦闘の主役の操作。2026-11-15）。
 *
 * 戦闘のエナジーは自動ではたまらない。**手札の3枚から1枚をえらんで解くと、エナジーが手に入る**。
 * - 手札は「やさしい・ふつう・むずかしい」を1枚ずつ（えらんだ単元の中から）。むずかしいほど ⚡ が多い。自分でえらべる
 * - 問題は SOL の単元アプリと同じ問題・同じ答え方（AppRoundHost）。解いている間、戦闘は止まる
 * - 一度もまちがえずに解くと ⚡。まちがえても罰はない（ヒントで最後まで解ける。その問題の ⚡ は無し・連続は切れる）
 * - 連続でまちがえずに解くと ×1.2、×1.4 …（さいだい ×2.0）
 * - 解いたカードは、新しいカードに入れかわる
 */
interface Props {
  /** 出撃前にえらんだ単元の鍵 */
  unitKeys: string[];
  /** むずかしさ3の問題を、まちがえずに解いたときの基準エナジー */
  baseReward: number;
  /** いまエナジーが足りない（カードを目立たせる） */
  poor: boolean;
  /** 解きはじめた・戦場にもどった（戦闘を止める・動かす） */
  onOpenChange: (open: boolean) => void;
  onReward: (energy: number) => void;
  /** 1問ごとの結果。perfect＝一度もまちがえなかった */
  onAnswered: (item: PackRound, perfect: boolean) => void;
}

type Band = 'easy' | 'mid' | 'hard';
const BANDS: { band: Band; label: string; color: string; match: (d: number) => boolean }[] = [
  { band: 'easy', label: 'やさしい', color: '#34d399', match: (d) => d <= 2 },
  { band: 'mid', label: 'ふつう', color: '#38bdf8', match: (d) => d === 3 },
  { band: 'hard', label: 'むずかしい', color: '#f472b6', match: (d) => d >= 4 },
];
const UNIT_NAME: Record<string, string> = Object.fromEntries(PACK_UNITS.map((u) => [u.key, u.name]));
const pick = <T,>(a: T[]): T => a[Math.floor(Math.random() * a.length)];
/** 連続でまちがえずに解くと増える。上限 ×2.0 */
export const comboMultiplier = (n: number): number => Math.min(2.0, 1 + (Math.max(1, n) - 1) * 0.2);

export const ProblemCards: React.FC<Props> = ({ unitKeys, baseReward, poor, onOpenChange, onReward, onAnswered }) => {
  const [pack, setPack] = useState<{ registry: RoundRegistry; rounds: PackRound[] } | null>(null);
  useEffect(() => { let on = true; void loadPack().then((p) => { if (on) setPack(p); }); return () => { on = false; }; }, []);

  const pool = useMemo(() => (pack ? pack.rounds.filter((r) => unitKeys.includes(r.unitKey)) : []), [pack, unitKeys]);
  /** その帯のカードを1枚引く（いま手札にある項目は さける。帯に無ければ全体から） */
  const draw = useCallback((band: Band, avoid: PackRound[]): PackRound | null => {
    if (pool.length === 0) return null;
    const def = BANDS.find((b) => b.band === band)!;
    const fresh = pool.filter((r) => !avoid.some((a) => a.unitKey === r.unitKey && a.skillId === r.skillId));
    const inBand = fresh.filter((r) => def.match(r.difficulty));
    return pick(inBand.length ? inBand : fresh.length ? fresh : pool);
  }, [pool]);

  const [hand, setHand] = useState<(PackRound | null)[]>([null, null, null]);
  useEffect(() => {
    if (pool.length === 0) return;
    const h: PackRound[] = [];
    for (const b of BANDS) { const c = draw(b.band, h); if (c) h.push(c); }
    setHand(h);
  // 範囲が決まったときに1回だけ配る
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pool]);

  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [combo, setCombo] = useState(0);
  const comboRef = useRef(0);
  const [result, setResult] = useState<'perfect' | 'missed' | null>(null);
  const [solved, setSolved] = useState(false);
  const [gained, setGained] = useState(0);
  /** 同じカードを開きなおしても 同じ問題にならないよう、開くたびに変える */
  const [serial, setSerial] = useState(0);

  const item = openIdx === null ? null : hand[openIdx];
  const rewardOf = (r: PackRound) => Math.round(baseReward * rewardWeight(r.difficulty));

  const open = (i: number) => {
    if (!hand[i]) return;
    sfx.tap?.();
    setResult(null); setSolved(false); setGained(0); setSerial((n) => n + 1);
    setOpenIdx(i); onOpenChange(true);
  };

  const onFirstResult = useCallback((perfect: boolean) => {
    if (!item) return;
    onAnswered(item, perfect);
    if (perfect) {
      const n = comboRef.current + 1;
      comboRef.current = n; setCombo(n);
      const total = Math.round(rewardOf(item) * comboMultiplier(n));
      setGained(total); setResult('perfect'); sfx.correct(); onReward(total);
    } else {
      comboRef.current = 0; setCombo(0);
      setResult('missed'); sfx.incorrect();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, baseReward, onReward, onAnswered]);

  /** 答えの出たカードを入れかえて、戦場へもどる */
  const close = () => {
    if (openIdx !== null && result !== null) {
      const i = openIdx;
      setHand((h) => { const next = h.slice(); next[i] = draw(BANDS[i].band, h.filter((x, k): x is PackRound => !!x && k !== i)); return next; });
    }
    setOpenIdx(null); onOpenChange(false);
  };

  return (
    <>
      {/* 手札（左下にたてに3枚）。エナジーが足りないときは ふちが光る */}
      <div className="absolute z-[60] flex flex-col gap-1.5" style={{ left: 10, bottom: 150, width: 148 }}>
        <div className="text-[10px] font-black text-white/80 px-1" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8)' }}>
          📚 といて ⚡ を ためよう{combo >= 1 ? `　🔥${combo}` : ''}
        </div>
        {!pack && <div className="rounded-xl px-2 py-3 text-[11px] text-white/70 bg-slate-900/85 border border-white/15">よみこみ中…</div>}
        {pack && pool.length === 0 && <div className="rounded-xl px-2 py-3 text-[11px] text-white/70 bg-slate-900/85 border border-white/15">出せる問題がありません</div>}
        {hand.map((c, i) => c && (
          <button key={`${i}-${c.unitKey}-${c.skillId}`} onClick={() => open(i)}
            className="text-left rounded-xl px-2.5 py-1.5 active:scale-95 transition-transform"
            style={{
              background: 'rgba(8,12,24,0.92)',
              border: `2px solid ${BANDS[i].color}`,
              boxShadow: poor ? `0 0 16px ${BANDS[i].color}cc` : '0 4px 12px rgba(0,0,0,0.5)',
              animation: poor ? 'cw-quiz-urgent 1s ease-in-out infinite' : undefined,
            }}>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[9px] font-black" style={{ color: BANDS[i].color }}>{BANDS[i].label}</span>
              <span className="text-[12px] font-black text-[#facc15]" style={{ fontFamily: 'Orbitron, monospace' }}>
                +{Math.round(rewardOf(c) * comboMultiplier(combo + 1))}⚡
              </span>
            </div>
            <div className="text-[11px] font-bold text-white leading-tight truncate">{c.label}</div>
            <div className="text-[9px] text-white/50 truncate">{UNIT_NAME[c.unitKey] ?? ''}</div>
          </button>
        ))}
      </div>

      {/* 解く画面（戦闘は止まっている） */}
      {item && pack && (
        <div className="fixed inset-0 z-[140] flex flex-col" style={{ background: 'rgba(3,6,16,0.34)', backdropFilter: 'blur(1.5px)' }}>
          <div className="flex items-center gap-3 p-3 border-b border-[#facc15]/25 flex-wrap" style={{ background: 'rgba(3,6,16,0.92)' }}>
            <span className="text-[#facc15] font-bold text-sm" style={{ fontFamily: 'Orbitron, monospace' }}>⚡ エナジーチャージ</span>
            <span className="text-[11px] font-black px-2 py-0.5 rounded-full whitespace-nowrap bg-sky-400/10 border border-sky-400/40 text-sky-300">
              {item.label}　+{Math.round(rewardOf(item) * comboMultiplier(comboRef.current + (result === 'perfect' ? 0 : 1)))}⚡
            </span>
            {combo >= 2 && <span className="text-[11px] font-black px-2 py-0.5 rounded-full bg-[#facc15]/15 text-[#facc15] border border-[#facc15]/40">🔥 {combo}れんぞく</span>}
            <button onClick={close} className="ml-auto text-white/70 hover:text-white text-sm px-3 py-1 rounded-lg border border-white/15">
              {result === null ? 'やめて もどる ✕' : '戦場へもどる ✕'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3 flex flex-col items-center">
            <div className="w-full max-w-2xl">
              {result === 'perfect' && (
                <div className="text-center mb-2 rounded-xl py-2 font-black text-[#a3e635] border border-[#a3e635]/50" style={{ background: 'rgba(8,12,22,0.95)' }}>
                  ✓ せいかい！ +{gained}⚡{combo >= 2 ? `　🔥${combo}れんぞく ×${comboMultiplier(combo).toFixed(1)}` : ''}
                </div>
              )}
              {result === 'missed' && (
                <div className="text-center mb-2 rounded-xl py-2 text-sm font-bold text-amber-200 border border-amber-300/40" style={{ background: 'rgba(8,12,22,0.95)' }}>
                  {solved ? 'さいごまで とけたね。つぎの カードで ⚡ を とろう！' : 'ヒントを見て、さいごまで といてみよう（⚡ は つぎの カードで）'}
                </div>
              )}
              <AppRoundHost key={serial} registry={pack.registry} item={item} onFirstResult={onFirstResult} onSolved={() => setSolved(true)} />
              {(result === 'perfect' || solved) && (
                <button onClick={close}
                  className="w-full mt-3 py-3 rounded-xl font-black text-lg transition-all active:scale-95"
                  style={{ background: 'rgba(163,230,53,0.22)', border: '2px solid #a3e635', color: '#a3e635' }}>
                  戦場へもどる →
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

/** 星（★1〜3）：勝ったうえで、まちがえずに解けた割合で決める。速さでは決めない（急いで雑に解くことを得にしない） */
export function starsFor(answered: number, perfect: number): 1 | 2 | 3 {
  if (answered <= 0) return 1;
  const rate = perfect / answered;
  if (answered >= 8 && rate >= 0.9) return 3;
  if (answered >= 5 && rate >= 0.7) return 2;
  return 1;
}
