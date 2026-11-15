// このファイルは単元アプリ syo4-keisannokimari の src/components/modules/LawCheckModule.tsx の写し（scripts/sync-app-sources.mjs）。手で直さない。
/**
 * なりたつ かな？ たし算・かけ算では成り立つ交換法則・結合法則が、
 * ひき算・わり算でも 成り立つと思ってしまう誤概念に、反例で気づかせるモジュール。
 */
import React, { useState } from 'react';
import { useRoundRecorder } from 'learning-app-kit/react';
import confetti from 'canvas-confetti';
import { Wand2, Check, X } from 'lucide-react';
import { AppShell } from '../shared/AppShell';
import { AdaptiveBar } from '../shared/AdaptiveBar';
import { HintBox, ResultPanel, SetupScreen, LevelCard } from '../ui/primitives';
import { LAWCHECK_LEVELS, LawCheckLevel, LawCheckProblem, generateLawCheck } from '../../lib/problems';
import { useProgressStore } from '../../store/progressStore';
import { useAdaptive } from '../../lib/useAdaptive';
import { playClear, playSoftTry } from '../../lib/sound';

interface Props { onExit: () => void; }

const LEVEL_IDS = LAWCHECK_LEVELS.map((l) => l.id);

export const LawCheckModule: React.FC<Props> = ({ onExit }) => {
  const [mode, setMode] = useState<'setup' | 'level' | 'auto'>('setup');
  const [level, setLevel] = useState<LawCheckLevel>('law-comm');
  const [round, setRound] = useState(0);
  const getMasteryStreak = useProgressStore((s) => s.getMasteryStreak);
  const getTodaySkillCount = useProgressStore((s) => s.getTodaySkillCount);
  const adaptive = useAdaptive<LawCheckLevel>(LEVEL_IDS);

  if (mode === 'setup') {
    return (
      <SetupScreen title="なりたつ かな？" subtitle="そのきまり、ひき算・わり算でも つかえる？" onBack={onExit}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          {LAWCHECK_LEVELS.map((l) => (
            <LevelCard
              key={l.id}
              label={l.label}
              desc={l.desc}
              mastery={getMasteryStreak(l.id)}
              todayCount={getTodaySkillCount(l.id)}
              accentBorder="hover:border-rose-400"
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
    <AppShell title="なりたつ かな？" subtitle={LAWCHECK_LEVELS.find((l) => l.id === activeLevel)?.label} onBack={() => setMode('setup')}>
      <div className="flex flex-col h-full">
        {mode === 'auto' && (
          <AdaptiveBar index={adaptive.index} total={adaptive.total} leveledUp={adaptive.leveledUp} onClearLevelUp={adaptive.clearLevelUp} />
        )}
        <div className="flex-1 min-h-0">
          <LawCheckRound
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

export const LawCheckRound: React.FC<{
  level: LawCheckLevel;
  problem?: LawCheckProblem;
  onNext: () => void;
  onResult?: (perfect: boolean) => void;
  /** まちがえたとき。テストモードで「2回で×」を数えるのに使う */
  onMiss?: () => void;
  nextLabel?: string;
}> = ({ level, problem: given, onNext, onResult, onMiss, nextLabel }) => {
  const [problem] = useState<LawCheckProblem>(() => given ?? generateLawCheck(level));
  const [stage, setStage] = useState<'answer' | 'reason' | 'done'>('answer');
  const [mistakes, setMistakes] = useState(0);
  const [hint, setHint] = useState<string | null>(null);
  const [pickedWrong, setPickedWrong] = useState<number | null>(null);
  const recordResult = useProgressStore((s) => s.recordResult);
  // できなかった問題も残す。まちがえた回数を数え、正解までたどりつかずに
  // 離れたときも1件記録する（learning-app-kit/react）
  const rec = useRoundRecorder({ moduleId: 'lawcheck', skillId: level, record: recordResult });

  const finish = () => {
    playClear();
    confetti({ particleCount: 110, spread: 65, origin: { y: 0.6 } });
    rec.finish(`${problem.claimLeft} ＝ ${problem.claimRight}`);
    onResult?.(mistakes === 0);
    setStage('done');
  };

  // 正しく判定できたら、そのまま終わらせずに「なぜそう言えるか」を選ばせる。
  // 指導要領は理由を言葉で説明させることを求めている。
  const judge = (saysTrue: boolean) => {
    if (saysTrue === problem.isTrue) {
      setHint(null);
      setStage('reason');
    } else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setHint(
        problem.isTrue
          ? 'じっさいに 両がわを 計算して くらべてみよう。同じに なるはずだよ。'
          : 'じっさいに 両がわを 計算して くらべてみよう。この計算では 入れかえると 答えが 変わるよ。'
      );
    }
  };

  const chooseReason = (i: number) => {
    if (i === problem.correctReasonIndex) finish();
    else {
      playSoftTry();
      setMistakes((m) => m + 1); rec.mistake(); onMiss?.();
      setPickedWrong(i);
      setHint('その りゆうだと、ほかの 計算にも あてはまって しまうよ。どの 計算の どんな せいしつかを 考えよう。');
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="max-w-xl mx-auto space-y-5">
        <div className="bg-surface border border-line rounded-[28px] shadow-xl p-6 md:p-8 text-center">
          <p className="text-muted font-bold mb-3">この しきは 正しい？</p>
          <div className="text-3xl md:text-4xl font-black text-content tabular-nums tracking-wide">
            {problem.claimLeft} ＝ {problem.claimRight}
          </div>
        </div>

        {hint && <HintBox tone="wrong">{hint}</HintBox>}

        {stage === 'answer' && (
          <div className="flex justify-center gap-4">
            <button onClick={() => judge(true)} className="flex items-center gap-2 px-8 py-5 rounded-2xl bg-surface border-2 border-emerald-200 text-emerald-600 font-black text-xl hover:bg-emerald-50 active:scale-95 transition-all">
              <Check size={28} /> なりたつ
            </button>
            <button onClick={() => judge(false)} className="flex items-center gap-2 px-8 py-5 rounded-2xl bg-surface border-2 border-rose-200 text-rose-500 font-black text-xl hover:bg-rose-50 active:scale-95 transition-all">
              <X size={28} /> なりたたない
            </button>
          </div>
        )}

        {stage === 'reason' && (
          <div>
            <p className="text-center text-muted font-black mb-3">
              {problem.isTrue ? 'なぜ なりたつ と いえる？' : 'なぜ なりたたない と いえる？'}
            </p>
            <div className="flex flex-col gap-3">
              {problem.reasonOptions.map((r, i) => (
                <button
                  key={i}
                  onClick={() => chooseReason(i)}
                  className={`text-left p-4 rounded-2xl border-2 font-bold leading-relaxed transition-all active:scale-[0.99] ${
                    pickedWrong === i ? 'bg-amber-50 border-amber-300 text-amber-600' : 'bg-surface border-line text-content hover:border-rose-400'
                  }`}
                >
                  {r}
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
            accentClass="bg-rose-500 hover:bg-rose-600"
          />
        )}
      </div>
    </div>
  );
};
