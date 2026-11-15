// このファイルは単元アプリ syo4-gaisu の src/components/modules/ErrorHunterModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * エラーハンター（誤り例の発見・修正・理由の言語化）モジュール。
 * がい数で最頻出の系統的なミス（見る位のまちがい・くり上がりの わすれ・
 * 「上から◯けた」の意味のかんちがい・はんいの「未満」のまちがい・
 * 見積もり方法の混同）を「見つけて → 直して → 理由を選ぶ」3ステップで学ぶ。
 */
import React, { useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import { motion } from 'motion/react';
import { ChevronLeft, Search, Check, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { AppShell } from '../shared/AppShell';
import { AnswerEntry } from '../shared/AnswerEntry';
import { HintBox } from '../ui/primitives';
import { GaisuErrorExample, generateGaisuError } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { playClear, playSoftTry } from '../../lib/sound';
import { ScratchPadToggle } from 'learning-app-kit/react';

interface Props { onExit: () => void; }

export const ErrorHunterModule: React.FC<Props> = ({ onExit }) => {
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(0);

  if (!started) {
    return (
      <div className="w-full h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button onClick={onExit} className="flex items-center gap-2 text-muted hover:text-content font-bold px-3 py-2 rounded-xl hover:bg-surface-3 transition-colors mb-2">
            <ChevronLeft size={24} /> がい数ランドへ
          </button>
          <div className="bg-surface rounded-[36px] shadow-2xl border border-line p-8 md:p-12 text-center mt-4">
            <div className="w-24 h-24 rounded-3xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-6"><Search size={44} /></div>
            <h1 className="text-3xl font-black text-content mb-2">エラーハンター</h1>
            <p className="text-muted font-bold leading-relaxed mb-8">
              ともだちの がい数を チェック！「正しい？ まちがい？」を 見ぬいて、まちがいは 正しく なおそう。<br />
              見る位・くり上がり・はんいの まちがいに 気をつけて。まちがいは 学びの たからもの！
            </p>
            <button onClick={() => setStarted(true)} className="px-10 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">スタート！</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell title="エラーハンター" subtitle="まちがい さがし" onBack={onExit}>
      <GaisuErrorRound key={round} onNext={() => setRound((r) => r + 1)} />
    </AppShell>
  );
};

export const GaisuErrorRound: React.FC<{
  example?: GaisuErrorExample;
  startStage?: 'judge' | 'fix';
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ example, startStage = 'judge', onNext, onResult, onMiss, nextLabel = 'つぎの もんだい' }) => {
  const [ex] = useState<GaisuErrorExample>(() => example ?? generateGaisuError());
  const [stage, setStage] = useState<'judge' | 'fix' | 'reason' | 'done'>(startStage);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'error-hunter', skillId: ex.isCorrect ? 'eh-judge' : 'eh-fix', record: recordResult });

  const finish = () => {
    setStage('done');
    playClear();
    confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    rec.finish(ex.question.slice(0, 20) + '…');
    onResult?.(mistakes === 0);
  };

  const judge = (saysCorrect: boolean) => {
    setHint(null);
    if (saysCorrect === ex.isCorrect) {
      if (ex.isCorrect) finish();
      else setStage('fix');
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(
        ex.isCorrect
          ? 'もう一度 よく見て。じっさいに 自分でも 四捨五入して たしかめてみよう。'
          : 'もう一度 よく見て。じっさいに 自分でも 計算して、答えが 合っているか たしかめてみよう。'
      );
    }
  };

  const submitFix = (v: string) => {
    if (Number(v) === ex.correctAnswerNumeric) {
      setHint(null);
      setStage('reason');
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(ex.fixHint);
    }
  };

  const chooseReason = (i: number) => {
    if (i === ex.correctReasonIndex) finish();
    else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint('うーん、ちがうみたい。もとの問題と 正しい答えを くらべて、どこが ちがったか 考えよう。');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto">
        <div className="bg-surface rounded-[36px] shadow-2xl border border-line p-6 md:p-10">
          {/* 出題（ともだちの がい数） */}
          <div className="bg-surface-2 rounded-3xl p-6 mb-6 border border-line">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-black text-faint">{ex.character}さんの もんだい</span>
            </div>
            <p className="text-lg font-black text-content leading-relaxed mb-4">{ex.question}</p>
            <div className="text-3xl md:text-4xl font-black text-content tabular-nums text-center py-2">
              答え　{ex.shownAnswer}
            </div>
          </div>

          {hint && (
            <div className="mb-4">
              <HintBox tone="wrong">{hint}</HintBox>
            </div>
          )}

          {/* 暗算では厳しい計算があるので、紙のかわりに書ける場所を出す（採点はしない） */}
          <ScratchPadToggle ops={['+', '-', '×', '÷']} decimal={false} />

          {stage === 'judge' && (
            <>
              <p className="text-center text-muted font-bold mb-4">この こたえは…？</p>
              <div className="flex justify-center gap-4">
                <button onClick={() => judge(true)} className="flex items-center gap-2 px-8 py-5 rounded-2xl bg-surface border-2 border-emerald-200 text-emerald-600 font-black text-xl hover:bg-emerald-50 active:scale-95 transition-all"><Check size={28} /> 正しい</button>
                <button onClick={() => judge(false)} className="flex items-center gap-2 px-8 py-5 rounded-2xl bg-surface border-2 border-rose-200 text-rose-500 font-black text-xl hover:bg-rose-50 active:scale-95 transition-all"><X size={28} /> まちがい</button>
              </div>
            </>
          )}

          {stage === 'fix' && (
            <>
              <p className="text-center text-muted font-black mb-4">{ex.fixPrompt}</p>
              <AnswerEntry onSubmit={submitFix} allowDecimal={false} submitLabel="なおす！" accentText="text-rose-600" />
            </>
          )}

          {stage === 'reason' && (
            <>
              <p className="text-center text-muted font-black mb-4">{ex.character}さんは、なぜ まちがえたのかな？</p>
              <div className="flex flex-col gap-3">
                {ex.reasonOptions.map((r, i) => (
                  <button key={i} onClick={() => chooseReason(i)} className="text-left p-4 rounded-2xl bg-surface border-2 border-line text-content font-bold hover:border-rose-400 active:scale-[0.99] transition-all">{r}</button>
                ))}
              </div>
            </>
          )}

          {stage === 'done' && (
            <div className="text-center">
              <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="text-6xl mb-3">{mistakes === 0 ? '🏆' : '🎉'}</motion.div>
              <div className="inline-flex items-center gap-2 bg-emerald-50 text-emerald-700 font-black px-5 py-3 rounded-2xl">
                {ex.explain}
              </div>
              <div><button onClick={onNext} className="mt-6 px-8 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">{nextLabel}</button></div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
