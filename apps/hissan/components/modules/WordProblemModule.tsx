// このファイルは単元アプリ wari-hissann3 の src/components/modules/WordProblemModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * ことばの もんだい（わり算の文章題）モジュール。
 * ①しきを選ぶ（等分除・包含除のスキーマ）→ ②商とあまりを計算 →
 * ③（切り上げ/切り捨てのときは）あまりを どうするか考えて 最終の答え、の段階入力。
 * テスト裏面（思考・判断・表現）で最頻出の「あまりの処理」を重点的にあつかう。
 */
import React, { useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Check, Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { QuotRemEntry } from '../shared/QuotRemEntry';
import { AnswerEntry } from '../shared/AnswerEntry';
import { ScratchPad } from 'learning-app-kit/react';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { WORD_LEVELS, WordLevel, DivWordProblem, generateWord } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = WORD_LEVELS.map((l) => l.id);

export const WordProblemModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<WordLevel>('wp-share');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<WordLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="ことばの もんだい" subtitle="しき → 計算 → あまりを どうする？" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {WORD_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-teal-400"
              onClick={() => { setLevel(l.id); setRound((r) => r + 1); setMode('level'); }}
            />
          ))}
        </div>
        <button
          onClick={() => { setRound((r) => r + 1); setMode('auto'); }}
          className="w-full p-5 rounded-3xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-black text-lg shadow-lg hover:shadow-xl transition-all active:scale-[0.99] flex items-center justify-center gap-2"
        >
          <Wand2 size={22} /> おまかせモード（じどうで レベルアップ）
        </button>
      </SetupScreen>
    );
  }

  const activeLevel = mode === 'auto' ? adaptive.level : level;

  return (
    <AppShell title="ことばの もんだい" subtitle={WORD_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <WordRound
            key={`${activeLevel}-${round}`}
            level={activeLevel}
            onNext={() => setRound((r) => r + 1)}
            onResult={mode === 'auto' ? adaptive.onResult : undefined}
          />
        </div>
      </div>
    </AppShell>
  );
};

export const WordRound: React.FC<{
  level: WordLevel;
  problem?: DivWordProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<DivWordProblem>(() => given ?? generateWord(level));
  const needsFinal = problem.finalKind === 'up' || problem.finalKind === 'down';
  const [stage, setStage] = useState<'shiki' | 'calc' | 'final' | 'done'>('shiki');
  const [pickedWrong, setPickedWrong] = useState<number | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [showScratch, setShowScratch] = useState(false);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'word-problem', skillId: level, record: recordResult });

  const withRemainder = problem.remainder > 0;

  const finish = () => {
    playClear();
    confetti({ particleCount: 130, spread: 70, origin: { y: 0.6 } });
    rec.finish(problem.text.slice(0, 18) + '…');
    onResult?.(mistakes === 0);
    setStage('done');
  };

  const chooseShiki = (i: number) => {
    if (i === problem.correctIndex) {
      playCorrect();
      setPickedWrong(null);
      setHint(problem.why);
      setStage('calc');
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setPickedWrong(i);
      setHint('ようすを 思いうかべよう。「ぜんぶの数」を「1つ分の数（または 人数）」で 分けるのが わり算だよ。');
    }
  };

  const submitCalc = (q: string, r: string) => {
    const okQ = Number(q) === problem.quotient;
    const okR = !withRemainder || Number(r || '0') === problem.remainder;
    if (okQ && okR) {
      if (needsFinal) {
        playCorrect();
        setHint(`計算は ${problem.dividend} ÷ ${problem.divisor} = ${problem.quotient} あまり ${problem.remainder}。では、${problem.finalPrompt}`);
        setStage('final');
      } else {
        finish();
      }
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(`しきは ${problem.dividend} ÷ ${problem.divisor} だね。筆算で ていねいに 計算してみよう。${withRemainder ? 'あまりも わすれずに。' : ''}`);
    }
  };

  const submitFinal = (v: string) => {
    if (Number(v) === problem.finalAnswer) {
      finish();
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(
        problem.finalKind === 'up'
          ? `あまりの 分は どうなるかな？ あまりの 分も 入れられるように、商より 1 大きい数に しよう。`
          : `あまりの 分だけでは 1つ 作れないね。あまりは 切り捨てて、商が そのまま 答えに なるよ。`
      );
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-5">
        {/* おはなし */}
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8">
          <div className="flex items-start gap-3">
            <span className="text-5xl shrink-0">{problem.emoji}</span>
            <p className="text-xl md:text-2xl font-black text-content leading-relaxed flex-1">{problem.text}</p>
          </div>
        </div>

        {hint && <HintBox tone={pickedWrong !== null && stage === 'shiki' ? 'wrong' : 'hint'}>{hint}</HintBox>}

        {stage === 'shiki' && (
          <div>
            <p className="text-center text-muted font-black mb-3">どの「しき」に なるかな？</p>
            <div className="grid grid-cols-1 gap-3">
              {problem.choices.map((c, i) => (
                <button
                  key={i}
                  onClick={() => chooseShiki(i)}
                  className={`p-5 rounded-2xl border-2 text-2xl font-black tabular-nums transition-all active:scale-[0.98] ${
                    pickedWrong === i ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-brand'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        )}

        {stage === 'calc' && (
          <div>
            <div className="flex items-center justify-center gap-2 mb-3">
              <Check className="text-emerald-500" size={22} />
              <p className="text-center text-content font-black text-xl tabular-nums">しき：{problem.dividend} ÷ {problem.divisor}</p>
            </div>
            <p className="text-center text-muted font-bold mb-3">
              {withRemainder ? '商と あまりを 計算しよう' : 'こたえを 計算しよう'}
            </p>
            <div className="text-center mb-3">
              <button
                onClick={() => setShowScratch((v) => !v)}
                className="inline-flex items-center gap-1.5 text-sm font-black text-blue-500 hover:text-blue-600 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-full transition-all"
              >
                {showScratch ? '📝 けいさんらんを とじる' : '📝 筆算で けいさんする'}
              </button>
            </div>
            {showScratch && (
              <div className="mb-3">
                <ScratchPad ops={['÷', '×', '-', '+']} decimal={false} initial={{ op: '÷', a: String(problem.dividend), b: String(problem.divisor) }} />
              </div>
            )}
            <QuotRemEntry withRemainder={withRemainder} onSubmit={submitCalc} />
          </div>
        )}

        {stage === 'final' && (
          <div>
            <p className="text-center text-content font-black text-xl mb-3">{problem.finalPrompt}</p>
            <p className="text-center text-muted font-bold mb-3">あまりを どうするか、ようすを 思いうかべて 答えよう（たんい：{problem.finalUnit}）</p>
            <AnswerEntry onSubmit={submitFinal} allowDecimal={false} accentText="text-teal-600" />
          </div>
        )}

        {stage === 'done' && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span>{problem.finalWhy}</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-teal-500 hover:bg-teal-600"
          />
        )}
      </div>
    </div>
  );
};
