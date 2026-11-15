// このファイルは単元アプリ wari-hissann3 の src/components/modules/MentalModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * あんざん わり算モジュール。
 * 九九の範囲 → あまりあり → 何十 → 何百 と段階的に、暗算の基礎を固める。
 * レベル選択＋「おまかせ（適応難易度）」モード。
 */
import React, { useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2 } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { QuotRemEntry } from '../shared/QuotRemEntry';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { MENTAL_LEVELS, MentalLevel, SimpleDivProblem, generateMental } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = MENTAL_LEVELS.map((l) => l.id);

export const MentalModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<MentalLevel>('mental-basic');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<MentalLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="あんざん わり算" subtitle="筆算の 土台になる 暗算を きたえよう" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {MENTAL_LEVELS.map((l) => (
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
    <AppShell title="あんざん わり算" subtitle={MENTAL_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <MentalRound
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

export const MentalRound: React.FC<{
  level: MentalLevel;
  problem?: SimpleDivProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<SimpleDivProblem>(() => given ?? generateMental(level));
  const [stage, setStage] = useState<'answer' | 'done'>('answer');
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'mental', skillId: level, record: recordResult });
  const withRemainder = level === 'mental-rem';

  const submit = (q: string, r: string) => {
    const okQ = Number(q) === problem.quotient;
    const okR = !withRemainder || Number(r || '0') === problem.remainder;
    if (okQ && okR) {
      playClear();
      confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
      rec.finish(`${problem.dividend} ÷ ${problem.divisor}`);
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
          <div className="text-5xl md:text-6xl font-black text-content tabular-nums tracking-wider">
            {problem.dividend} ÷ {problem.divisor}
          </div>
          {withRemainder && <p className="text-muted font-bold mt-3">商と あまりを 答えよう（わりきれたら あまりは 0）</p>}
        </div>

        {hint && <HintBox tone="wrong">{hint}</HintBox>}

        {stage === 'answer' && (
          <QuotRemEntry withRemainder={withRemainder} onSubmit={submit} />
        )}

        {stage === 'done' && (
          <ResultPanel
            perfect={mistakes === 0}
            detail={<span className="tabular-nums">{problem.dividend} ÷ {problem.divisor} = {problem.quotient}{problem.remainder > 0 ? ` あまり ${problem.remainder}` : ''}</span>}
            onNext={onNext}
            nextLabel={nextLabel}
            accentClass="bg-amber-500 hover:bg-amber-600"
          />
        )}
      </div>
    </div>
  );
};
