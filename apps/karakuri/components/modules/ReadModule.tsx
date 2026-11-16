// このファイルは単元アプリ syo4-keisannokimari の src/components/modules/ReadModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * しきを よもう。式が先にあり、その式が表す「数え方の図」「場面」を選ぶ。
 * 指導要領 A(6)イ(ｱ)「式の意味を読み取ったりすること」に対応する。
 * 全国学力・学習状況調査で「式を場面と関連付けて読み取ること」に課題が報告されている領域。
 */
import React, { useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { READ_LEVELS, ReadLevel, ReadProblem, ReadDotsProblem, DotMode, generateRead } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = READ_LEVELS.map((l) => l.id);

/**
 * 同じL字のドットを、2通りの「数え方」で描き分ける。
 * subtract＝大きい長方形とみて、かけている分（点線）をひく
 * split＝2つの長方形に分ける（色分け）
 */
const DotFigure: React.FC<{ p: ReadDotsProblem; mode: DotMode }> = ({ p, mode }) => (
  <div className="inline-grid gap-1.5" style={{ gridTemplateColumns: `repeat(${p.cols}, minmax(0,1fr))` }}>
    {Array.from({ length: p.rows }).flatMap((_, r) =>
      Array.from({ length: p.cols }).map((_, c) => {
        const missing = r < p.cutR && c >= p.cols - p.cutC;
        if (mode === 'subtract') {
          return (
            <span
              key={`${r}-${c}`}
              className={`w-4 h-4 md:w-5 md:h-5 rounded-full ${
                missing ? 'border-2 border-dashed border-rose-400' : 'bg-emerald-500'
              }`}
            />
          );
        }
        return (
          <span
            key={`${r}-${c}`}
            className={`w-4 h-4 md:w-5 md:h-5 rounded-full ${
              missing ? 'opacity-0' : r < p.cutR ? 'bg-violet-500' : 'bg-emerald-500'
            }`}
          />
        );
      })
    )}
  </div>
);

export const ReadModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<ReadLevel>('read-dots');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<ReadLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="しきを よもう" subtitle="この しきは、どんな 考え方を あらわして いる？" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {READ_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-sky-400"
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
    <AppShell title="しきを よもう" subtitle={READ_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <ReadRound
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

export const ReadRound: React.FC<{
  level: ReadLevel;
  problem?: ReadProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<ReadProblem>(() => given ?? generateRead(level));
  // 図の並び順は毎回入れかえる（「いつも左が正解」を覚えさせない）
  const [figureOrder] = useState<DotMode[]>(() => (Math.random() < 0.5 ? ['subtract', 'split'] : ['split', 'subtract']));
  const [stage, setStage] = useState<'answer' | 'done'>('answer');
  const [mistakes, setMistakes] = useState(0);
  const [pickedWrong, setPickedWrong] = useState<number | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'read', skillId: level, record: recordResult });

  const finish = (label: string) => {
    playClear();
    confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
    rec.finish(label);
    onResult?.(mistakes === 0);
    setStage('done');
  };

  const wrong = (i: number, msg: string) => {
    playSoftTry();
    setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
    setPickedWrong(i);
    setHint(msg);
  };

  const LABELS = ['あ', 'い', 'う', 'え'];

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
          <p className="text-muted font-bold mb-3">
            {problem.kind === 'dots' ? 'この しきは、どの 数え方を あらわして いる？' : 'この しきは、どの 場面を あらわして いる？'}
          </p>
          <div className="text-3xl md:text-4xl font-black text-content tabular-nums tracking-wider">{problem.expr}</div>
        </div>

        {hint && <HintBox tone="wrong">{hint}</HintBox>}

        {stage === 'answer' && problem.kind === 'dots' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {figureOrder.map((m, i) => (
              <button
                key={m}
                onClick={() =>
                  m === problem.correctMode
                    ? finish(problem.expr)
                    : wrong(i, m === 'split'
                      ? 'この しきは 2つに 分ける 数え方かな？ ひき算が あるか よく 見よう。'
                      : 'この しきは 大きい 長方形から ひく 数え方かな？ たし算が あるか よく 見よう。')
                }
                className={`p-5 rounded-2xl border-2 transition-all active:scale-[0.98] flex flex-col items-center gap-3 ${
                  pickedWrong === i ? 'bg-amber-50 border-amber-300' : 'bg-surface border-line hover:border-sky-400'
                }`}
              >
                <span className="self-start w-8 h-8 rounded-full bg-surface-3 text-muted font-black flex items-center justify-center">
                  {LABELS[i]}
                </span>
                <DotFigure p={problem} mode={m} />
              </button>
            ))}
          </div>
        )}

        {stage === 'answer' && problem.kind === 'scene' && (
          <div className="grid grid-cols-1 gap-3">
            {problem.choices.map((c, i) => (
              <button
                key={i}
                onClick={() =>
                  i === problem.correctIndex
                    ? finish(problem.expr)
                    : wrong(i, '( )が どこに ついて いるかを 見て、何と 何を まとめて いるか 考えよう。')
                }
                className={`p-4 rounded-2xl border-2 text-left font-bold leading-relaxed transition-all active:scale-[0.99] flex gap-3 ${
                  pickedWrong === i ? 'bg-amber-50 border-amber-300 text-amber-600' : 'bg-surface border-line text-content hover:border-sky-400'
                }`}
              >
                <span className="shrink-0 w-8 h-8 rounded-full bg-surface-3 text-muted font-black flex items-center justify-center">
                  {LABELS[i]}
                </span>
                <span>{c}</span>
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
            accentClass="bg-sky-500 hover:bg-sky-600"
          />
        )}
      </div>
    </div>
  );
};
