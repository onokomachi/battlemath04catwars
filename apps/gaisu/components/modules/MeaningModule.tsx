// このファイルは単元アプリ syo4-gaisu の src/components/modules/MeaningModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * がい数の いみ モジュール。
 * 数直線を使って「約何万・約何千」を読み取る力と、がい数を使うのに ふさわしい場面を
 * 見ぬく力（正確な数と どちらが よいか）を段階的に養う。
 */
import React, { useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { AnswerEntry } from '../shared/AnswerEntry';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import {
  MEANING_LEVELS, MeaningLevel, MeaningNumberProblem, MeaningSceneProblem,
  generateMeaningNumber, generateMeaningScene,
} from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = MEANING_LEVELS.map((l) => l.id);

export const MeaningModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<MeaningLevel>('meaning-man');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<MeaningLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="がい数の いみ" subtitle="約何万・約何千。がい数の きほんを つかもう" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {MEANING_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-amber-400"
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
    <AppShell title="がい数の いみ" subtitle={MEANING_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <MeaningRound
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

const NumberLine: React.FC<{ n: number; lower: number; upper: number }> = ({ n, lower, upper }) => {
  const ratio = (n - lower) / (upper - lower);
  const mid = (lower + upper) / 2;
  return (
    <div className="mt-4 mb-2 px-2">
      <div className="relative h-2 bg-surface-3 rounded-full">
        {/* 四捨五入の境目（まん中）を示す目印。▼の数がこれより右か左かで、どちらの位に近いか判断できる。 */}
        <div className="absolute top-1/2 -translate-y-1/2 left-1/2 w-0.5 h-4 -translate-x-1/2 border-l-2 border-dashed border-faint" />
        <div
          className="absolute -top-7 -translate-x-1/2 text-xs font-black text-amber-600 tabular-nums whitespace-nowrap"
          style={{ left: `${ratio * 100}%` }}
        >
          ▼ {n}
        </div>
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-amber-500 border-2 border-surface shadow"
          style={{ left: `calc(${ratio * 100}% - 6px)` }}
        />
      </div>
      <div className="flex justify-between mt-1 text-xs font-bold text-faint tabular-nums">
        <span>{lower}</span>
        <span className="text-faint/70">まん中 {mid}</span>
        <span>{upper}</span>
      </div>
    </div>
  );
};

export const MeaningRound: React.FC<{
  level: MeaningLevel;
  numberProblem?: MeaningNumberProblem;
  sceneProblem?: MeaningSceneProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, numberProblem: givenNumber, sceneProblem: givenScene, onNext, onResult, onMiss, nextLabel }) => {
  const isScene = level === 'meaning-scene';
  const [numProblem] = useState<MeaningNumberProblem | null>(() => (isScene ? null : givenNumber ?? generateMeaningNumber(level as 'meaning-man' | 'meaning-sen')));
  const [sceneProblem] = useState<MeaningSceneProblem | null>(() => (isScene ? givenScene ?? generateMeaningScene() : null));
  const [stage, setStage] = useState<'answer' | 'done'>('answer');
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [pickedWrong, setPickedWrong] = useState<'gaisu' | 'exact' | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'meaning', skillId: level, record: recordResult });

  const finish = (label: string) => {
    playClear();
    confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
    rec.finish(label);
    onResult?.(mistakes === 0);
    setStage('done');
  };

  const submitNumber = (v: string) => {
    if (!numProblem) return;
    if (Number(v) === numProblem.answerDigit) {
      finish(`${numProblem.n} → 約${numProblem.answerDigit}${numProblem.kind === 'man' ? '万' : '千'}`);
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(numProblem.hint);
    }
  };

  const chooseScene = (answer: 'gaisu' | 'exact') => {
    if (!sceneProblem) return;
    if (answer === sceneProblem.correct) {
      finish(sceneProblem.text.slice(0, 18) + '…');
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setPickedWrong(answer);
      setHint(sceneProblem.why);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        {numProblem && (
          <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
            <div className="flex items-center justify-center gap-3 mb-1">
              <span className="text-4xl">{numProblem.emoji}</span>
              <span className="text-lg font-black text-content">{numProblem.noun}</span>
            </div>
            <div className="text-5xl md:text-6xl font-black text-content tabular-nums tracking-wider mt-2">
              {numProblem.n}<span className="text-2xl text-muted">{numProblem.itemUnit}</span>
            </div>
            <NumberLine n={numProblem.n} lower={numProblem.lower} upper={numProblem.upper} />
            <p className="text-muted font-bold mt-3">{numProblem.kind === 'man' ? '一万の位までの がい数にすると 約何万？' : '千の位までの がい数にすると 約何千？'}</p>
          </div>
        )}

        {sceneProblem && (
          <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
            <p className="text-xs font-black text-faint mb-2">つぎの場面では、どちらが よいでしょう？</p>
            <p className="text-xl md:text-2xl font-black text-content leading-relaxed">{sceneProblem.text}</p>
          </div>
        )}

        {hint && <HintBox tone="wrong">{hint}</HintBox>}

        {stage === 'answer' && numProblem && (
          <div>
            <p className="text-center text-muted font-black mb-2">約 <span className="text-amber-600">？</span> {numProblem.kind === 'man' ? '万' : '千'}{numProblem.itemUnit}</p>
            <AnswerEntry onSubmit={submitNumber} allowDecimal={false} accentText="text-amber-600" />
          </div>
        )}

        {stage === 'answer' && sceneProblem && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <button
              onClick={() => chooseScene('gaisu')}
              className={`p-6 rounded-2xl border-2 text-xl font-black transition-all active:scale-[0.98] ${
                pickedWrong === 'gaisu' ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-amber-400'
              }`}
            >
              がい数が よい
            </button>
            <button
              onClick={() => chooseScene('exact')}
              className={`p-6 rounded-2xl border-2 text-xl font-black transition-all active:scale-[0.98] ${
                pickedWrong === 'exact' ? 'bg-amber-50 border-amber-300 text-amber-500' : 'bg-surface border-line text-content hover:border-amber-400'
              }`}
            >
              正確な数が よい
            </button>
          </div>
        )}

        {stage === 'done' && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span>{numProblem ? numProblem.explain : sceneProblem?.why}</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-amber-500 hover:bg-amber-600"
          />
        )}
      </div>
    </div>
  );
};
