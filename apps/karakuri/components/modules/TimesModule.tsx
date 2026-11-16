// このファイルは単元アプリ syo4-keisannokimari の src/components/modules/TimesModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * 10ばい・100ばいの ひみつ。かける数（・かけられる数）を10倍すると、積がどう変わるかを練習する。
 */
import React, { useState } from 'react';
import { useRoundRecorder, ScratchPadToggle } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { AnswerEntry } from '../shared/AnswerEntry';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { TIMES_LEVELS, TimesLevel, TimesProblem, generateTimes } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = TIMES_LEVELS.map((l) => l.id);

export const TimesModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<TimesLevel>('times-single');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<TimesLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="10ばい・100ばいの ひみつ" subtitle="かける数を 10ばいすると、積は…？" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {TIMES_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-cyan-400"
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
    <AppShell title="10ばい・100ばいの ひみつ" subtitle={TIMES_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <TimesRound
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

export const TimesRound: React.FC<{
  level: TimesLevel;
  problem?: TimesProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<TimesProblem>(() => given ?? generateTimes(level));
  const [stage, setStage] = useState<'answer' | 'done'>('answer');
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'times', skillId: level, record: recordResult });

  const submit = (v: string) => {
    if (Number(v) === problem.answer) {
      playClear();
      confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
      rec.finish(problem.scaledText);
      onResult?.(mistakes === 0);
      setStage('done');
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
          <p className="text-muted font-bold mb-2">もとに なる 九九</p>
          <div className="text-2xl md:text-3xl font-black text-faint tabular-nums mb-4">
            {problem.a}×{problem.b}＝{problem.baseProduct}
          </div>
          <p className="text-muted font-bold mb-2">では、これは？</p>
          <div className="text-4xl md:text-5xl font-black text-content tabular-nums tracking-wider">
            {problem.scaledText}
          </div>
        </div>

        {hint && <HintBox tone="wrong">{hint}</HintBox>}


        {/* 暗算では厳しい計算があるので、紙のかわりに書ける場所を出す（採点はしない） */}

        <ScratchPadToggle ops={['×', '÷', '+', '-']} decimal={false} />

        {stage === 'answer' && <AnswerEntry onSubmit={submit} allowDecimal={false} accentText="text-cyan-600" />}

        {stage === 'done' && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span className="tabular-nums">{problem.scaledText}＝{problem.answer}</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-cyan-500 hover:bg-cyan-600"
          />
        )}
      </div>
    </div>
  );
};
