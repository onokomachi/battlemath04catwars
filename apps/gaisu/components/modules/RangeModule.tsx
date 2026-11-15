// このファイルは単元アプリ syo4-gaisu の src/components/modules/RangeModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * もとの数の はんい モジュール。
 * 「四捨五入して◯◯になる整数」の いちばん小さい数・いちばん大きい数を求め、
 * 最後に「以上・未満」で正しく表す文を選ぶ、3段階の流れで はんいの感覚を身につける。
 */
import React, { useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { AnswerEntry } from '../shared/AnswerEntry';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { RANGE_LEVELS, RangeLevel, RangeProblem, generateRange } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playCorrect, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = RANGE_LEVELS.map((l) => l.id);

export const RangeModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<RangeLevel>('range-tens');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<RangeLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="もとの数の はんい" subtitle="「以上・未満」で もとの数の はんいを 表そう" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {RANGE_LEVELS.map((l) => (
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
    <AppShell title="もとの数の はんい" subtitle={RANGE_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <RangeRound
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

export const RangeRound: React.FC<{
  level: RangeLevel;
  problem?: RangeProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<RangeProblem>(() => given ?? generateRange(level));
  const [stage, setStage] = useState<'min' | 'max' | 'express' | 'done'>('min');
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [pickedWrong, setPickedWrong] = useState<number | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'range', skillId: level, record: recordResult });

  const finish = () => {
    playClear();
    confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    rec.finish(`→ ${problem.target}（${problem.placeLabel}まで）`);
    onResult?.(mistakes === 0);
    setStage('done');
  };

  const submitMin = (v: string) => {
    if (Number(v) === problem.min) {
      playCorrect();
      setHint(null);
      setStage('max');
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(problem.hint);
    }
  };

  const submitMax = (v: string) => {
    if (Number(v) === problem.max) {
      playCorrect();
      setHint(null);
      setStage('express');
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(`いちばん大きい整数は、${problem.target}より ${problem.unit / 2}大きい数の 一つ手前だよ。`);
    }
  };

  const chooseExpress = (i: number) => {
    if (i === problem.answerIndex) {
      finish();
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setPickedWrong(i);
      setHint(problem.expressWrongHint);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
          <p className="text-lg md:text-xl font-black text-content leading-relaxed">
            四捨五入して <span className="text-violet-600">{problem.placeLabel}</span>までの がい数にすると <span className="text-violet-600 text-2xl">{problem.target}</span> になる整数を 求めます。
          </p>
        </div>

        {hint && <HintBox tone="wrong">{hint}</HintBox>}

        {stage === 'min' && (
          <div>
            <p className="text-center text-muted font-black mb-3">① いちばん小さい整数は？</p>
            <AnswerEntry onSubmit={submitMin} allowDecimal={false} accentText="text-violet-600" />
          </div>
        )}

        {stage === 'max' && (
          <div>
            <div className="flex items-center justify-center gap-2 mb-3">
              <span className="px-3 py-1 rounded-full bg-violet-50 text-violet-600 font-black text-sm">いちばん小さい整数 ＝ {problem.min}</span>
            </div>
            <p className="text-center text-muted font-black mb-3">② いちばん大きい整数は？</p>
            <AnswerEntry onSubmit={submitMax} allowDecimal={false} accentText="text-violet-600" />
          </div>
        )}

        {stage === 'express' && (
          <div>
            <div className="flex items-center justify-center gap-2 mb-3 flex-wrap">
              <span className="px-3 py-1 rounded-full bg-violet-50 text-violet-600 font-black text-sm">いちばん小さい整数 ＝ {problem.min}</span>
              <span className="px-3 py-1 rounded-full bg-violet-50 text-violet-600 font-black text-sm">いちばん大きい整数 ＝ {problem.max}</span>
            </div>
            <p className="text-center text-muted font-black mb-3">③ はんいを 正しく表しているのは どれ？</p>
            <div className="grid grid-cols-1 gap-3">
              {problem.choices.map((c, i) => (
                <button
                  key={i}
                  onClick={() => chooseExpress(i)}
                  className={`p-5 rounded-2xl border-2 text-xl font-black tabular-nums transition-all active:scale-[0.98] ${
                    pickedWrong === i ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-violet-400'
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
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
