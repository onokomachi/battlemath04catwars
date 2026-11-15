// このファイルは単元アプリ wari-hissann3 の src/components/modules/ErrorHunterModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * エラーハンター（誤り例の発見・修正・理由の言語化）モジュール。
 * わり算で最頻出の系統的バグ（商の0とばし・あまり≧わる数・ひき算ミス・
 * わり算のきまりのあまり）を「見つけて → 直して → 理由を選ぶ」3ステップで学ぶ。
 * 誤答例の同定・修正は遅延テストで効果が大きい（Adams 2014; Durkin & Rittle-Johnson 2012）。
 */
import React, { useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import { motion } from 'motion/react';
import { ChevronLeft, Lightbulb, Search, Check, X } from 'lucide-react';
import confetti from 'canvas-confetti';
import { AppShell } from '../shared/AppShell';
import { QuotRemEntry } from '../shared/QuotRemEntry';
import { HissanBracket } from '../shared/HissanBracket';
import { ScratchPad } from 'learning-app-kit/react';
import { DivErrorExample, generateDivError } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { playClear, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

export const ErrorHunterModule: React.FC<Props> = ({ onExit }) => {
  const [started, setStarted] = useState(false);
  const [round, setRound] = useState(0);

  if (!started) {
    return (
      <div className="w-full h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6">
          <button onClick={onExit} className="flex items-center gap-2 text-muted hover:text-content font-bold px-3 py-2 rounded-xl hover:bg-surface-3 transition-colors mb-2">
            <ChevronLeft size={24} /> わり算ランドへ
          </button>
          <div className="bg-surface rounded-[36px] shadow-2xl border border-line p-8 md:p-12 text-center mt-4">
            <div className="w-24 h-24 rounded-3xl bg-rose-50 text-rose-500 flex items-center justify-center mx-auto mb-6"><Search size={44} /></div>
            <h1 className="text-3xl font-black text-content mb-2">エラーハンター</h1>
            <p className="text-muted font-bold leading-relaxed mb-8">
              ともだちの わり算を チェック！「正しい？ まちがい？」を 見ぬいて、まちがいは 正しく なおそう。<br />
              たしかめ算が 大かつやくするよ。まちがいは 学びの たからもの！
            </p>
            <button onClick={() => setStarted(true)} className="px-10 py-4 bg-rose-500 hover:bg-rose-600 text-white rounded-2xl font-black text-xl shadow-lg transition-all active:scale-95">スタート！</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AppShell title="エラーハンター" subtitle="まちがい さがし" onBack={onExit}>
      <DivErrorRound key={round} onNext={() => setRound((r) => r + 1)} />
    </AppShell>
  );
};

export const DivErrorRound: React.FC<{
  example?: DivErrorExample;
  startStage?: 'judge' | 'fix';
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ example, startStage = 'judge', onNext, onResult, onMiss, nextLabel = 'つぎの もんだい' }) => {
  const [ex] = useState<DivErrorExample>(() => example ?? generateDivError());
  const [stage, setStage] = useState<'judge' | 'fix' | 'reason' | 'done'>(startStage);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [showScratch, setShowScratch] = useState(false);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'error-hunter', skillId: ex.isCorrect ? 'eh-judge' : 'eh-fix', record: recordResult });

  const finish = () => {
    setStage('done');
    playClear();
    confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    rec.finish(ex.expr);
    onResult?.(mistakes === 0);
  };

  // 数は合っていて「書く位置」だけが誤りの問題は、修正入力を飛ばして理由の言語化へ
  const numbersAreRight = ex.wrongQ === ex.correctQ && ex.wrongR === ex.correctR;

  const judge = (saysCorrect: boolean) => {
    setHint(null);
    if (saysCorrect === ex.isCorrect) {
      if (ex.isCorrect) finish(); // 正しい式を「正しい」と見ぬけた
      else setStage(numbersAreRight ? 'reason' : 'fix'); // まちがいを「まちがい」と見ぬけた
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(
        ex.isCorrect
          ? 'もう一度 よく見て。たしかめ算（わる数 × 商 ＋ あまり）を すると 合っているか わかるよ。'
          : 'もう一度 よく見て。たしかめ算を したり、あまりと わる数を くらべたり してみよう。'
      );
    }
  };

  const submitFix = (q: string, r: string) => {
    const okQ = Number(q) === ex.correctQ;
    const okR = Number(r || '0') === ex.correctR;
    if (okQ && okR) {
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
      setHint('うーん、ちがうみたい。どんな まちがいだったか、もとの式と 正しい答えを くらべて 考えよう。');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto">
        <div className="bg-surface rounded-[36px] shadow-2xl border border-line p-6 md:p-10">
          {/* 出題（ともだちの筆算） */}
          <div className="bg-surface-2 rounded-3xl p-6 mb-6 border border-line">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-black text-faint">{ex.character}さんの 筆算</span>
            </div>
            <div className="flex flex-col items-center gap-2 py-2">
              <HissanBracket
                dividend={String(ex.dividendN)}
                divisor={String(ex.divisorN)}
                quotient={String(ex.wrongQ)}
                quotientOffset={ex.wrongOffset}
                quotientWrong={!ex.isCorrect && stage !== 'judge'}
              />
              <div className="text-2xl md:text-3xl font-black text-content tabular-nums">
                答え　{ex.wrongQ}{ex.wrongR > 0 ? ` あまり ${ex.wrongR}` : ''}
              </div>
            </div>
          </div>

          {hint && (
            <div className="mb-4 bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-2">
              <Lightbulb className="text-amber-500 shrink-0" size={20} /><p className="text-muted font-bold">{hint}</p>
            </div>
          )}

          {(stage === 'judge' || stage === 'fix') && (
            <div className="text-center mb-4">
              <button
                onClick={() => setShowScratch((v) => !v)}
                className="inline-flex items-center gap-1.5 text-sm font-black text-blue-500 hover:text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-full transition-all"
              >
                {showScratch ? '📝 けいさんらんを とじる' : '📝 筆算で たしかめる'}
              </button>
            </div>
          )}
          {(stage === 'judge' || stage === 'fix') && showScratch && (
            <div className="mb-4">
              <ScratchPad ops={['÷', '×', '-', '+']} decimal={false} initial={{ op: '÷', a: String(ex.dividendN), b: String(ex.divisorN) }} />
            </div>
          )}

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
              <p className="text-center text-muted font-black mb-4">正しい こたえは？（わりきれたら あまりは 0）</p>
              <QuotRemEntry withRemainder onSubmit={submitFix} submitLabel="なおす！" />
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
