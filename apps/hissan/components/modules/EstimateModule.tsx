// このファイルは単元アプリ wari-hissann3 の src/components/modules/EstimateModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 商の見当づけモジュール。
 * 筆算の前に「どの位に たつか」「何けたに なるか」「仮の商は いくつか」を
 * すばやく判断する力（見積もり）をきたえる。
 */
import React, { useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { AnswerEntry } from '../shared/AnswerEntry';
import { HissanBracket } from '../shared/HissanBracket';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { ESTIMATE_LEVELS, EstimateLevel, EstimateProblem, generateEstimate } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = ESTIMATE_LEVELS.map((l) => l.id);

export const EstimateModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<EstimateLevel>('est-place');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<EstimateLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="商の見当づけ" subtitle="計算する前に「だいたい いくつ」を 見ぬこう" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {ESTIMATE_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-violet-400"
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
    <AppShell title="商の見当づけ" subtitle={ESTIMATE_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <EstimateRound
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

export const EstimateRound: React.FC<{
  level: EstimateLevel;
  problem?: EstimateProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<EstimateProblem>(() => given ?? generateEstimate(level));
  const [stage, setStage] = useState<'answer' | 'done'>('answer');
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [pickedWrong, setPickedWrong] = useState<number | null>(null);
  const [pickedDigits, setPickedDigits] = useState<number[]>([]);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'estimate', skillId: level, record: recordResult });

  const finish = () => {
    playClear();
    confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
    rec.finish(`${problem.dividend} ÷ ${problem.divisor}`);
    onResult?.(mistakes === 0);
    setStage('done');
  };

  const chooseAnswer = (i: number) => {
    if (i === problem.answerIndex) {
      finish();
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setPickedWrong(i);
      setHint(problem.hint);
    }
  };

  const submitValue = (v: string) => {
    if (Number(v) === problem.answerValue) {
      finish();
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(problem.hint);
    }
  };

  const toggleDigit = (d: number) => {
    setPickedDigits((prev) => (prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]));
  };

  const submitDigits = () => {
    const want = problem.answerDigits ?? [];
    const got = [...pickedDigits].sort((a, b) => a - b);
    if (got.length === want.length && got.every((d, i) => d === want[i])) {
      finish();
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(problem.hint);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
          {problem.bracket && (
            <div className="mb-4">
              <HissanBracket
                dividend={problem.dividendTemplate ?? String(problem.dividend)}
                divisor={String(problem.divisor)}
              />
            </div>
          )}
          <p className="text-xl md:text-2xl font-black text-content leading-relaxed">{problem.text}</p>
        </div>

        {hint && <HintBox tone="wrong">{hint}</HintBox>}

        {stage === 'answer' && problem.kind === 'choice' && (
          <div className="grid grid-cols-1 gap-3">
            {problem.choices!.map((c, i) => (
              <button
                key={i}
                onClick={() => chooseAnswer(i)}
                className={`p-5 rounded-2xl border-2 text-2xl font-black transition-all active:scale-[0.98] ${
                  pickedWrong === i ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-violet-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {stage === 'answer' && problem.kind === 'value' && (
          <AnswerEntry onSubmit={submitValue} allowDecimal={false} accentText="text-violet-600" />
        )}

        {stage === 'answer' && problem.kind === 'multi-digit' && (
          <div>
            <p className="text-center text-muted font-black mb-3">あてはまる数字を ぜんぶ タップしてから「こたえる」を おそう</p>
            <div className="grid grid-cols-5 gap-3 mb-4">
              {Array.from({ length: 10 }, (_, d) => (
                <button
                  key={d}
                  onClick={() => toggleDigit(d)}
                  className={`h-16 rounded-2xl border-2 text-2xl font-black transition-all active:scale-95 ${
                    pickedDigits.includes(d)
                      ? 'bg-violet-500 border-violet-500 text-white shadow-lg'
                      : 'bg-surface border-line text-content hover:border-violet-400'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>
            <button
              onClick={submitDigits}
              disabled={pickedDigits.length === 0}
              className={`w-full py-5 rounded-3xl text-xl font-black shadow-lg transition-all ${
                pickedDigits.length > 0 ? 'bg-violet-500 hover:bg-violet-600 text-white active:scale-95' : 'bg-surface-3 text-faint'
              }`}
            >
              こたえる（{pickedDigits.length}こ えらんだ）
            </button>
          </div>
        )}

        {stage === 'done' && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span>{problem.explain}</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-violet-500 hover:bg-violet-600"
          />
        )}
      </div>
    </div>
  );
};
