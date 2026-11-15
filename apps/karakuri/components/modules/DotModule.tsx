// このファイルは単元アプリ syo4-keisannokimari の src/components/modules/DotModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * ドット たんてい。L字がたに ならんだ ドットを、図から くふうして 数える
 * （教科書「今日の深い学び」相当：ドットの数の求め方を図と式で考える活動）。
 */
import React, { useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { DOTS_LEVELS, DotsLevel, DotsProblem, generateDots } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = DOTS_LEVELS.map((l) => l.id);

const DotGrid: React.FC<{ rows: number; cols: number; cutR: number; cutC: number }> = ({ rows, cols, cutR, cutC }) => (
  <div className="inline-grid gap-1.5 mx-auto" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
    {Array.from({ length: rows }).flatMap((_, r) =>
      Array.from({ length: cols }).map((_, c) => {
        const missing = r < cutR && c >= cols - cutC; // 右上のかどを欠けさせる
        return (
          <span
            key={`${r}-${c}`}
            className={`w-5 h-5 md:w-6 md:h-6 rounded-full ${missing ? 'opacity-0' : 'bg-emerald-500'}`}
          />
        );
      })
    )}
  </div>
);

export const DotModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<DotsLevel>('dots-basic');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<DotsLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="ドット たんてい" subtitle="ならんだ ドットを、図と しきで かぞえよう" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {DOTS_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-emerald-400"
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
    <AppShell title="ドット たんてい" subtitle={DOTS_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <DotRound
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

export const DotRound: React.FC<{
  level: DotsLevel;
  problem?: DotsProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<DotsProblem>(() => given ?? generateDots(level));
  const [stage, setStage] = useState<'answer' | 'done'>('answer');
  const [mistakes, setMistakes] = useState(0);
  const [pickedWrong, setPickedWrong] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'dots', skillId: level, record: recordResult });

  const choose = (i: number) => {
    if (i === problem.correctIndex) {
      playClear();
      confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
      rec.finish(`${problem.rows}×${problem.cols}のL字（${problem.total}こ）`);
      onResult?.(mistakes === 0);
      setStage('done');
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setPickedWrong(i);
      setHint('大きい 長方形と みて、かけている 分を 考えてみよう。');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
          <p className="text-muted font-bold mb-4">ドットは ぜんぶで 何こ？ くふうして 数える しきは どれ？</p>
          <DotGrid rows={problem.rows} cols={problem.cols} cutR={problem.cutR} cutC={problem.cutC} />
        </div>

        {hint && <HintBox tone="wrong">{hint}</HintBox>}

        {stage === 'answer' && (
          <div className="grid grid-cols-1 gap-3">
            {problem.choices.map((c, i) => (
              <button
                key={i}
                onClick={() => choose(i)}
                className={`p-4 rounded-2xl border-2 text-lg font-black tabular-nums transition-all active:scale-[0.98] text-center ${
                  pickedWrong === i ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-emerald-400'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {stage === 'done' && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span>{problem.explain}</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-emerald-500 hover:bg-emerald-600"
          />
        )}
      </div>
    </div>
  );
};
