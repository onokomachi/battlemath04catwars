// このファイルは単元アプリ syo4-keisannokimari の src/components/modules/FirstPickRound.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 「いちばん はじめに 計算する ところは どこ？」（紙のテストの大問2）。
 * 式の演算子の下に あ・い・う を出し、最初に計算する演算子を えらぶ。
 * まちがえたら、じゅんばんマスターと同じルールの言葉（orderSteps の checkPick）で理由を返す。
 */
import React, { useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { HintBox, ResultPanel } from '../ui/primitives';
import { FIRST_LABELS, generateFirst, type FirstProblem } from '../../lib/problems';
import { checkPick } from '../../lib/orderSteps';
import { useProgressStore } from '../../store/progressStore';
import { playClear, playSoftTry } from '../../lib/sound';

export const FirstPickRound: React.FC<{
  problem?: FirstProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ problem: given, onNext, onResult, onMiss, nextLabel }) => {
  const [p] = useState<FirstProblem>(() => given ?? generateFirst());
  const [done, setDone] = useState(false);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [wrong, setWrong] = useState<number[]>([]);
  const recordResult = useProgressStore((s) => s.recordResult);
  const rec = useRoundRecorder({ moduleId: 'order', skillId: 'order-first', record: recordResult });

  const choose = (k: number) => {
    if (done) return;
    if (k === p.correct) {
      playClear();
      confetti({ particleCount: 90, spread: 60, origin: { y: 0.6 } });
      rec.finish(p.expr);
      onResult?.(mistakes === 0);
      setDone(true);
      return;
    }
    playSoftTry();
    setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
    setWrong((w) => [...w, k]);
    const r = checkPick(p.tokens, p.opAt[k]!);
    setHint('hint' in r ? r.hint : p.reason);
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
          <p className="text-muted font-bold mb-4">いちばん はじめに 計算する ところは どこですか。</p>
          <div className="inline-flex items-start justify-center flex-wrap gap-x-0.5 text-4xl md:text-5xl font-black text-content tabular-nums">
            {p.tokens.map((t, i) => {
              const k = p.opAt.indexOf(i);
              const mark = done && k === p.correct;
              return (
                <span key={i} className="inline-flex flex-col items-center">
                  <span className={mark ? 'text-blue-600' : undefined}>{t}</span>
                  {k >= 0 && (
                    <span className={`mt-1 text-base md:text-lg font-black rounded-full w-8 h-8 grid place-items-center border-2 ${
                      mark ? 'border-blue-500 text-blue-600' : 'border-line text-muted'}`}>
                      {FIRST_LABELS[k]}
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>

        {hint && !done && <HintBox tone="wrong">{hint}</HintBox>}

        {!done && (
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${p.opAt.length}, minmax(0, 1fr))` }}>
            {p.opAt.map((_, k) => (
              <button key={k} type="button" disabled={wrong.includes(k)} onClick={() => choose(k)}
                className="py-5 rounded-2xl border-2 border-line bg-surface text-3xl font-black text-content shadow hover:border-blue-400 active:scale-95 transition disabled:opacity-35">
                {FIRST_LABELS[k]}
              </button>
            ))}
          </div>
        )}

        {done && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span>{FIRST_LABELS[p.correct]}（{p.reason}）</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-blue-500 hover:bg-blue-600"
          />
        )}
      </div>
    </div>
  );
};
